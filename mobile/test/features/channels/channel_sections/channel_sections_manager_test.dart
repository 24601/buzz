import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buzz/features/channels/channel_sections/channel_sections_manager.dart';
import 'package:buzz/shared/relay/relay.dart';

void main() {
  late SharedPreferences prefs;
  late nostr.Keys keychain;
  late ChannelSectionsCrypto crypto;

  Future<void> setUpEnv() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    keychain = nostr.Keys.generate();
    crypto = ChannelSectionsCrypto(keychain.nsec, keychain.public);
  }

  NostrEvent sectionsEvent({
    required List<Map<String, dynamic>> sections,
    Map<String, String> assignments = const {},
    required int createdAt,
    String id = 'remote-event',
  }) {
    final payload = jsonEncode({
      'version': 1,
      'sections': sections,
      'assignments': assignments,
    });
    return NostrEvent(
      id: id,
      pubkey: keychain.public,
      createdAt: createdAt,
      kind: EventKind.readState,
      tags: const [
        ['d', 'channel-sections'],
        ['t', 'channel-sections'],
      ],
      content: crypto.encrypt(payload),
      sig: 'sig',
    );
  }

  ChannelSectionsManager buildManager({
    required RelaySessionNotifier relaySession,
    Duration startupRetryBaseDelay = const Duration(milliseconds: 5),
  }) {
    return ChannelSectionsManager(
      pubkey: keychain.public,
      prefs: prefs,
      crypto: crypto,
      relaySession: relaySession,
      signedEventRelay: null,
      remoteEnabled: true,
      onChanged: () {},
      startupRetryBaseDelay: startupRetryBaseDelay,
    );
  }

  test('startup fetch rejected by relay rate limit retries until the remote '
      'blob is adopted (cold-start regression)', () async {
    await setUpEnv();
    // Cold start: the relay rejects the first fetch AND the first live
    // subscription with `rate-limited: quota exceeded` because the channel
    // list fired dozens of REQs first. Pre-fix, both errors were swallowed
    // and desktop-created groups never appeared until app data was cleared.
    final relay = _RateLimitedRelaySession(
      failuresBeforeSuccess: 2,
      historyEvents: [
        sectionsEvent(
          sections: [
            {'id': 's1', 'name': 'Desktop Group', 'order': 0},
          ],
          createdAt: 100,
        ),
      ],
    );

    final manager = buildManager(
      relaySession: relay,
      startupRetryBaseDelay: const Duration(milliseconds: 10),
    );
    await manager.initialize();

    expect(
      manager.store.sections,
      isEmpty,
      reason: 'first fetch lost the rate-limit race',
    );

    // Wait for the backoff retries (10ms, 20ms, …) to win the race.
    await _waitUntil(() => manager.store.sections.isNotEmpty);

    expect(manager.store.sections.single.name, 'Desktop Group');
    expect(
      relay.subscribeCalls,
      greaterThan(1),
      reason: 'live subscription must be retried too',
    );
    manager.dispose(flushPending: false);
  });

  test(
    'startup retry stops after fetch and subscription both succeed',
    () async {
      await setUpEnv();
      final relay = _RateLimitedRelaySession(
        failuresBeforeSuccess: 1,
        historyEvents: [
          sectionsEvent(
            sections: [
              {'id': 's1', 'name': 'Desktop Group', 'order': 0},
            ],
            createdAt: 100,
          ),
        ],
      );
      final manager = buildManager(relaySession: relay);
      await manager.initialize();
      await _waitUntil(() => manager.store.sections.isNotEmpty);

      final fetchCallsAfterSuccess = relay.fetchCalls;
      final subscribeCallsAfterSuccess = relay.subscribeCalls;
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(relay.fetchCalls, fetchCallsAfterSuccess);
      expect(relay.subscribeCalls, subscribeCallsAfterSuccess);
      manager.dispose(flushPending: false);
    },
  );

  test('disposing the manager cancels pending startup retries', () async {
    await setUpEnv();
    final relay = _RateLimitedRelaySession(failuresBeforeSuccess: 1000);
    final manager = buildManager(relaySession: relay);
    await manager.initialize();
    manager.dispose(flushPending: false);

    final fetchCallsAtDispose = relay.fetchCalls;
    await Future<void>.delayed(const Duration(milliseconds: 60));

    expect(
      relay.fetchCalls,
      fetchCallsAtDispose,
      reason: 'no retries may fire after dispose',
    );
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

/// Rejects the first [failuresBeforeSuccess] fetch and subscribe calls with
/// the relay's rate-limit error, then succeeds — the exact failure mode seen
/// on Android cold start where the channel-list REQ burst exhausts the
/// relay's per-connection quota before the sections manager gets a turn.
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
