import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buzz/features/channels/channel_sort/channel_sort_manager.dart';
import 'package:buzz/features/channels/channel_sort/channel_sort_storage.dart';
import 'package:buzz/shared/relay/relay.dart';

void main() {
  late SharedPreferences prefs;
  late nostr.Keys keychain;
  late ChannelSortCrypto crypto;

  Future<void> setUpEnv() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    keychain = nostr.Keys.generate();
    crypto = ChannelSortCrypto(keychain.nsec, keychain.public);
  }

  NostrEvent sortEvent({
    required Map<String, String> groups,
    required int createdAt,
    String id = 'remote-event',
  }) {
    final payload = jsonEncode({'version': 1, 'groups': groups});
    return NostrEvent(
      id: id,
      pubkey: keychain.public,
      createdAt: createdAt,
      kind: EventKind.readState,
      tags: const [
        ['d', 'channel-sort'],
        ['t', 'channel-sort'],
      ],
      content: crypto.encrypt(payload),
      sig: 'sig',
    );
  }

  ChannelSortManager buildManager({
    RelaySessionNotifier? relaySession,
    SignedEventRelay? signedEventRelay,
    bool remoteEnabled = true,
  }) {
    return ChannelSortManager(
      pubkey: keychain.public,
      prefs: prefs,
      crypto: crypto,
      relaySession: relaySession,
      signedEventRelay: signedEventRelay,
      remoteEnabled: remoteEnabled,
      onChanged: () {},
    );
  }

  test('adopts a desktop-published channel-sort blob', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();
    relay.historyEvents = [
      sortEvent(
        groups: {'channels': 'recent', 'section:abc': 'recent'},
        createdAt: 100,
      ),
    ];

    final manager = buildManager(
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
    );
    await manager.initialize();

    expect(manager.sortModeFor('channels'), ChannelSortMode.recent);
    expect(manager.sortModeFor('section:abc'), ChannelSortMode.recent);
    expect(manager.sortModeFor('dms'), ChannelSortMode.alpha);
    manager.dispose(flushPending: false);
  });

  test('publishes local change in the desktop wire format', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();
    final signedRelay = _RecordingSignedEventRelay();
    final manager = buildManager(
      relaySession: relay,
      signedEventRelay: signedRelay,
    );
    await manager.initialize();

    manager.setSortModeFor('dms', ChannelSortMode.recent);
    manager.dispose(flushPending: true);

    final submitted = await signedRelay.submitted.future.timeout(
      const Duration(seconds: 1),
    );
    expect(submitted.kind, EventKind.readState);
    expect(
      submitted.tags.any(
        (tag) => tag.length == 2 && tag[0] == 'd' && tag[1] == 'channel-sort',
      ),
      isTrue,
    );
    final decoded =
        jsonDecode(crypto.decrypt(submitted.content)) as Map<String, dynamic>;
    expect(decoded['version'], 1);
    expect(decoded['groups'], {'dms': 'recent'});
  });

  test(
    'stale remote blob does not clobber unpublished local sort edits',
    () async {
      await setUpEnv();
      final relay = _FakeRelaySession();

      final first = buildManager(
        relaySession: relay,
        signedEventRelay: _RecordingSignedEventRelay(),
      );
      await first.initialize();
      first.setSortModeFor('channels', ChannelSortMode.recent);
      first.dispose(flushPending: false);

      relay.historyEvents = [sortEvent(groups: const {}, createdAt: 100)];
      final second = buildManager(
        relaySession: relay,
        signedEventRelay: _RecordingSignedEventRelay(),
      );
      expect(second.isDirty, isTrue);
      await second.initialize();

      expect(second.sortModeFor('channels'), ChannelSortMode.recent);
      second.dispose(flushPending: false);
    },
  );

  test('setSortModeFor prunes orphaned section keys', () async {
    await setUpEnv();
    final manager = buildManager(remoteEnabled: false);
    await manager.initialize();

    manager.setSortModeFor('section:dead', ChannelSortMode.recent);
    manager.setSortModeFor(
      'channels',
      ChannelSortMode.recent,
      liveSectionIds: ['live'],
    );

    expect(manager.store.groups.keys, ['channels']);
    manager.dispose(flushPending: false);
  });

  test('startup fetch rejected by relay rate limit retries until the remote '
      'blob is adopted (cold-start regression)', () async {
    await setUpEnv();
    final relay = _RateLimitedRelaySession(
      failuresBeforeSuccess: 2,
      historyEvents: [
        sortEvent(groups: {'channels': 'recent'}, createdAt: 100),
      ],
    );

    final manager = ChannelSortManager(
      pubkey: keychain.public,
      prefs: prefs,
      crypto: crypto,
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
      remoteEnabled: true,
      onChanged: () {},
      startupRetryBaseDelay: const Duration(milliseconds: 10),
    );
    await manager.initialize();

    expect(manager.sortModeFor('channels'), ChannelSortMode.alpha);

    await _waitUntil(
      () => manager.sortModeFor('channels') == ChannelSortMode.recent,
    );
    expect(relay.subscribeCalls, greaterThan(1));
    manager.dispose(flushPending: false);
  });
}

Future<void> _waitUntil(
  bool Function() condition, {
  Duration timeout = const Duration(seconds: 2),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('condition not met within $timeout');
    }
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
}

class _SubmittedEvent {
  final int kind;
  final String content;
  final List<List<String>> tags;

  const _SubmittedEvent({
    required this.kind,
    required this.content,
    required this.tags,
  });
}

NostrEvent _stubAckEvent() => const NostrEvent(
  id: 'stub',
  pubkey: '',
  createdAt: 0,
  kind: 0,
  tags: [],
  content: '',
  sig: '',
);

class _RecordingSignedEventRelay implements SignedEventRelay {
  final Completer<_SubmittedEvent> submitted = Completer<_SubmittedEvent>();

  @override
  String? get pubkey => null;

  @override
  Future<NostrEvent> submit({
    required int kind,
    required String content,
    required List<List<String>> tags,
    int? createdAt,
  }) async {
    if (!submitted.isCompleted) {
      submitted.complete(
        _SubmittedEvent(kind: kind, content: content, tags: tags),
      );
    }
    return _stubAckEvent();
  }
}

class _FakeRelaySession extends RelaySessionNotifier {
  List<NostrEvent> historyEvents = [];

  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async => historyEvents;

  @override
  Future<void Function()> subscribe(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String message)? onClosed,
  }) async => () {};
}

/// Rejects the first [failuresBeforeSuccess] fetch and subscribe calls with
/// the relay's rate-limit error, then succeeds — the Android cold-start
/// failure mode where the channel-list REQ burst exhausts the relay's
/// per-connection quota before the sort manager gets a turn.
class _RateLimitedRelaySession extends RelaySessionNotifier {
  _RateLimitedRelaySession({
    required this.failuresBeforeSuccess,
    this.historyEvents = const [],
  });

  final int failuresBeforeSuccess;
  final List<NostrEvent> historyEvents;
  int fetchCalls = 0;
  int subscribeCalls = 0;
  final List<void Function(NostrEvent)> _listeners = [];

  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    fetchCalls++;
    if (fetchCalls <= failuresBeforeSuccess) {
      throw Exception('rate-limited: quota exceeded; retry in 2s');
    }
    return historyEvents;
  }

  @override
  Future<void Function()> subscribe(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String message)? onClosed,
  }) async {
    subscribeCalls++;
    if (subscribeCalls <= failuresBeforeSuccess) {
      throw Exception('rate-limited: quota exceeded; retry in 1s');
    }
    _listeners.add(onEvent);
    return () => _listeners.remove(onEvent);
  }
}
