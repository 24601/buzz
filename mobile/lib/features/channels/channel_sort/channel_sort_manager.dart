import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:shared_preferences/shared_preferences.dart';

import '../../../shared/crypto/nip44.dart';
import '../../../shared/relay/relay.dart';
import '../read_state/read_state_time.dart';
import 'channel_sort_storage.dart';

class ChannelSortCrypto {
  final Uint8List _conversationKey;

  ChannelSortCrypto(String nsec, String pubkey)
    : _conversationKey = _deriveKey(nsec, pubkey);

  static Uint8List _deriveKey(String nsec, String pubkey) {
    final privkeyHex = nostr.Nip19.decode(payload: nsec).data;
    return getConversationKey(privkeyHex, pubkey);
  }

  String encrypt(String plaintext) => nip44Encrypt(_conversationKey, plaintext);

  String decrypt(String ciphertext) =>
      nip44Decrypt(_conversationKey, ciphertext);
}

/// Syncs per-group sidebar sort preferences across clients via encrypted
/// NIP-78 app data (kind 30078, d-tag `channel-sort`), mirroring desktop's
/// `ChannelSortSyncManager`: NIP-44 encrypted-to-self content, debounced
/// writes, whole-blob last-write-wins, plus the same dirty-state protection
/// as the mobile sections manager so unpublished edits survive manager
/// teardown and reconnects.
class ChannelSortManager {
  final String pubkey;
  final ChannelSortStorage _storage;
  final ChannelSortCrypto _crypto;
  final RelaySessionNotifier? _relaySession;
  final SignedEventRelay? _signedEventRelay;
  final bool _remoteEnabled;
  final VoidCallback _onChanged;

  ChannelSortStore _store;
  ChannelSortStore? _lastPublishedStore;
  Timer? _publishDebounce;
  int _lastRemoteCreatedAt = 0;
  String? _lastRemoteEventId;
  void Function()? _unsubscribe;
  bool _disposed = false;

  /// Base delay for the startup-sync retry backoff. Overridable in tests.
  final Duration _startupRetryBaseDelay;
  Timer? _startupRetryTimer;
  int _startupRetryAttempt = 0;
  bool _startupFetchSucceeded = false;

  /// Unix seconds of the oldest unpublished local edit; 0 when clean.
  /// Persisted so unpublished edits survive manager teardown and restarts.
  int _dirtySince;

  /// Bumped on every local edit so a publish only clears the dirty flag when
  /// no new edit landed while the publish was in flight.
  int _editGeneration = 0;

  ChannelSortManager({
    required this.pubkey,
    required SharedPreferences prefs,
    required ChannelSortCrypto crypto,
    required RelaySessionNotifier? relaySession,
    required SignedEventRelay? signedEventRelay,
    required bool remoteEnabled,
    required VoidCallback onChanged,
    @visibleForTesting
    Duration startupRetryBaseDelay = const Duration(seconds: 2),
  }) : _storage = ChannelSortStorage(prefs),
       _crypto = crypto,
       _relaySession = relaySession,
       _signedEventRelay = signedEventRelay,
       _remoteEnabled = remoteEnabled,
       _onChanged = onChanged,
       _startupRetryBaseDelay = startupRetryBaseDelay,
       _store = ChannelSortStorage(prefs).read(pubkey),
       _dirtySince = ChannelSortStorage(prefs).readDirtySince(pubkey);

  ChannelSortStore get store => _store;

  @visibleForTesting
  bool get isDirty => _dirtySince > 0;

  Future<void> initialize() async {
    if (_disposed) return;

    if (!_remoteEnabled || _relaySession == null) {
      _onChanged();
      return;
    }

    await _syncWithRelay();
    _onChanged();
  }

  /// One startup-sync attempt: fetch the remote blob, start the live
  /// subscription, then reconcile dirty/seed state. Either step can lose a
  /// transient race on cold start (the relay rate-limits the burst of
  /// per-channel subscriptions and rejects with `rate-limited: quota
  /// exceeded`) — retry with backoff instead of silently giving up.
  Future<void> _syncWithRelay() async {
    final foundRemote = _startupFetchSucceeded ? true : await _fetchAndMerge();
    if (foundRemote != null) _startupFetchSucceeded = true;

    final subscribed = _unsubscribe != null || await _startLiveSubscription();

    // Publish-on-reconnect for unpublished local edits, and seed-publish when
    // the relay confirmed it has no blob but local prefs exist. `foundRemote`
    // is null when the fetch failed — never seed-publish on a failed fetch.
    if (_dirtySince > 0 || (foundRemote == false && _store.groups.isNotEmpty)) {
      markDirty();
    }

    if (!_startupFetchSucceeded || !subscribed) {
      _scheduleStartupRetry();
    }
  }

  void _scheduleStartupRetry() {
    if (_disposed) return;
    _startupRetryTimer?.cancel();
    final delayMs = min(
      _startupRetryBaseDelay.inMilliseconds << min(_startupRetryAttempt, 5),
      30000,
    );
    _startupRetryAttempt++;
    debugPrint(
      '[ChannelSortManager] startup sync incomplete; '
      'retrying in ${delayMs}ms (attempt $_startupRetryAttempt)',
    );
    _startupRetryTimer = Timer(Duration(milliseconds: delayMs), () {
      _startupRetryTimer = null;
      unawaited(
        _syncWithRelay().then((_) {
          if (!_disposed) _onChanged();
        }),
      );
    });
  }

  void dispose({bool flushPending = true}) {
    if (_disposed) return;
    _disposed = true;

    _startupRetryTimer?.cancel();
    _startupRetryTimer = null;

    final hadPending = _publishDebounce != null;
    _publishDebounce?.cancel();
    _publishDebounce = null;

    if (flushPending && hadPending && _remoteEnabled) {
      unawaited(_publish(allowDisposed: true));
    }

    _unsubscribe?.call();
    _unsubscribe = null;
  }

  void setSortModeFor(
    String groupKey,
    ChannelSortMode mode, {
    Iterable<String>? liveSectionIds,
  }) {
    if (_disposed) return;
    final updated = ChannelSortStore(
      groups: {..._store.groups, groupKey: mode},
    );
    // Prune sort modes left behind by deleted custom sections on write so the
    // stored map can't grow unboundedly with stale `section:` keys.
    _store = liveSectionIds != null
        ? stripOrphanedSectionModes(updated, liveSectionIds)
        : updated;
    _persist();
    markDirty();
  }

  ChannelSortMode sortModeFor(String groupKey) =>
      _store.groups[groupKey] ?? kDefaultSortMode;

  void markDirty() {
    if (_disposed) return;
    // Record dirtiness even while offline (remote disabled) — the flag is
    // persisted, so the reconnect-time manager re-publishes instead of
    // letting the stale remote blob clobber offline edits.
    if (_dirtySince == 0) {
      _dirtySince = currentUnixSeconds();
      _storage.writeDirtySince(pubkey, _dirtySince);
    }
    _editGeneration++;
    if (!_remoteEnabled) return;
    _publishDebounce?.cancel();
    _publishDebounce = Timer(const Duration(seconds: 5), () {
      _publishDebounce = null;
      unawaited(_publish());
    });
  }

  /// Returns whether the relay reported a `channel-sort` blob, or null when
  /// the fetch failed (offline / relay error).
  Future<bool?> _fetchAndMerge() async {
    if (_relaySession == null) return null;
    try {
      final events = await _relaySession.fetchHistory(
        NostrFilter(
          kinds: const [EventKind.readState],
          authors: [pubkey],
          tags: const {
            '#d': ['channel-sort'],
          },
          limit: 1,
        ),
      );
      _mergeEvents(events);
      _persist();
      if (!_disposed) _onChanged();
      return events.any(
        (e) => e.pubkey == pubkey && e.getTagValue('d') == 'channel-sort',
      );
    } catch (error) {
      debugPrint('[ChannelSortManager] fetch failed: $error');
      // Local state remains usable when relay is unavailable.
      return null;
    }
  }

  /// Returns whether the live subscription was established.
  Future<bool> _startLiveSubscription() async {
    if (_relaySession == null) return false;
    try {
      _unsubscribe = await _relaySession.subscribe(
        NostrFilter(
          kinds: const [EventKind.readState],
          authors: [pubkey],
          tags: const {
            '#d': ['channel-sort'],
          },
          limit: 1,
        ),
        _handleIncomingEvent,
      );
      return true;
    } catch (error) {
      debugPrint('[ChannelSortManager] live subscription failed: $error');
      // Non-fatal — local state and history still work; retried by the
      // startup-sync backoff.
      return false;
    }
  }

  void _mergeEvents(List<NostrEvent> events) {
    for (final event in events) {
      if (event.pubkey != pubkey) continue;
      _mergeEvent(event);
    }
  }

  void _mergeEvent(NostrEvent event) {
    // Only process channel-sort d-tag events.
    final dTag = event.getTagValue('d');
    if (dTag != 'channel-sort') return;

    try {
      final plaintext = _crypto.decrypt(event.content);
      final parsed = jsonDecode(plaintext);
      if (parsed is! Map<String, dynamic>) return;

      final incoming = ChannelSortStore.fromJson(parsed);

      // Last-write-wins: newer createdAt wins; tie-break by event ID.
      final isNewer =
          event.createdAt > _lastRemoteCreatedAt ||
          (event.createdAt == _lastRemoteCreatedAt &&
              event.id.compareTo(_lastRemoteEventId ?? '') > 0);

      if (isNewer) {
        _lastRemoteCreatedAt = event.createdAt;
        _lastRemoteEventId = event.id;
        // Dirty-state protection: never let a remote blob overwrite
        // unpublished local edits; the pending publish reconciles the relay.
        if (_dirtySince > 0) return;
        _store = incoming;
        _persist();
      }
    } catch (_) {
      // Decryption failure or parse error — keep existing state.
    }
  }

  void _handleIncomingEvent(NostrEvent event) {
    if (_disposed) return;
    _mergeEvent(event);
    if (!_disposed) _onChanged();
  }

  bool _isIdenticalToLastPublished() {
    final last = _lastPublishedStore;
    if (last == null) return false;
    if (last.groups.length != _store.groups.length) return false;
    for (final key in _store.groups.keys) {
      if (last.groups[key] != _store.groups[key]) return false;
    }
    return true;
  }

  Future<void> _publish({bool allowDisposed = false}) async {
    if ((!allowDisposed && _disposed) ||
        !_remoteEnabled ||
        _signedEventRelay == null) {
      return;
    }

    final generationAtStart = _editGeneration;

    // Read-before-write: advance _lastRemoteCreatedAt past any remote blob so
    // our event sorts after it. Dirty-state protection in _mergeEvent keeps
    // the fetched blob from clobbering the unpublished local store.
    await _fetchAndMerge();

    // No-op suppression: skip if nothing changed
    if (_isIdenticalToLastPublished()) {
      _clearDirty(generationAtStart);
      return;
    }

    try {
      final payload = jsonEncode(_store.toJson());
      final ciphertext = _crypto.encrypt(payload);
      final createdAt = max(currentUnixSeconds(), _lastRemoteCreatedAt + 1);

      await _signedEventRelay.submit(
        kind: EventKind.readState,
        content: ciphertext,
        tags: [
          ['d', 'channel-sort'],
          ['t', 'channel-sort'],
        ],
        createdAt: createdAt,
      );

      _lastRemoteCreatedAt = max(_lastRemoteCreatedAt, createdAt);
      _lastPublishedStore = ChannelSortStore(groups: Map.of(_store.groups));
      _clearDirty(generationAtStart);
    } catch (error) {
      debugPrint('[ChannelSortManager] publish failed: $error');
      // Dirty flag stays set; the next initialize() re-schedules the publish.
    }
  }

  /// Clears the persisted dirty flag unless a new edit landed while the
  /// publish that succeeded was in flight.
  void _clearDirty(int generationAtStart) {
    if (_editGeneration != generationAtStart) return;
    if (_dirtySince == 0) return;
    _dirtySince = 0;
    _storage.writeDirtySince(pubkey, 0);
  }

  void _persist() {
    _storage.write(pubkey, _store);
  }
}
