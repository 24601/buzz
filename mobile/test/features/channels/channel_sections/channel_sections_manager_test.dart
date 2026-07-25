import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buzz/features/channels/channel_sections/channel_sections_manager.dart';
import 'package:buzz/features/channels/channel_sections/channel_sections_storage.dart';
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
    RelaySessionNotifier? relaySession,
    SignedEventRelay? signedEventRelay,
    bool remoteEnabled = true,
  }) {
    return ChannelSectionsManager(
      pubkey: keychain.public,
      prefs: prefs,
      crypto: crypto,
      relaySession: relaySession,
      signedEventRelay: signedEventRelay,
      remoteEnabled: remoteEnabled,
      onChanged: () {},
    );
  }

  test('stale remote blob does not clobber unpublished local edits '
      '(teardown/rebuild regression)', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();

    // First manager: user creates a section; the 5s debounce never fires
    // because the provider tears the manager down on a status flip.
    final first = buildManager(
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
    );
    await first.initialize();
    first.createSection('My Group');
    expect(first.store.sections, hasLength(1));
    first.dispose(flushPending: false);

    // The relay still has an older (empty) blob. The rebuilt manager
    // fetches it on initialize — pre-fix this adopted the stale blob and
    // the just-created group vanished.
    relay.historyEvents = [sectionsEvent(sections: const [], createdAt: 100)];
    final second = buildManager(
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
    );
    expect(second.isDirty, isTrue, reason: 'dirty flag must survive rebuild');
    await second.initialize();

    expect(
      second.store.sections.map((s) => s.name),
      contains('My Group'),
      reason: 'unpublished local edit must survive a stale remote fetch',
    );
    second.dispose(flushPending: false);
  });

  test('rebuilt manager re-schedules publish for unpublished edits', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();

    final first = buildManager(
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
    );
    await first.initialize();
    first.createSection('My Group');
    first.dispose(flushPending: false);

    final signedRelay = _RecordingSignedEventRelay();
    final second = buildManager(
      relaySession: relay,
      signedEventRelay: signedRelay,
    );
    await second.initialize();

    // initialize() must arm the publish debounce for the surviving dirty
    // state; fire it via flush-on-dispose to avoid waiting 5s.
    second.dispose(flushPending: true);
    final submitted = await signedRelay.submitted.future.timeout(
      const Duration(seconds: 1),
    );
    expect(submitted.kind, EventKind.readState);
    final plaintext = crypto.decrypt(submitted.content);
    final decoded = jsonDecode(plaintext) as Map<String, dynamic>;
    expect(
      (decoded['sections'] as List).map((s) => s['name']),
      contains('My Group'),
    );
  });

  test('successful publish clears the persisted dirty flag', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();
    final signedRelay = _RecordingSignedEventRelay();

    final manager = buildManager(
      relaySession: relay,
      signedEventRelay: signedRelay,
    );
    await manager.initialize();
    manager.createSection('My Group');
    expect(manager.isDirty, isTrue);
    manager.dispose(flushPending: true);
    await signedRelay.submitted.future.timeout(const Duration(seconds: 1));
    // Let the post-submit bookkeeping in _publish complete.
    await Future<void>.delayed(Duration.zero);

    expect(ChannelSectionsStorage(prefs).readDirtySince(keychain.public), 0);
  });

  test('clean manager still adopts newer remote blobs (LWW)', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();
    relay.historyEvents = [
      sectionsEvent(
        sections: [
          {'id': 's1', 'name': 'Desktop Group', 'order': 0},
        ],
        createdAt: 100,
      ),
    ];

    final manager = buildManager(
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
    );
    await manager.initialize();

    expect(manager.isDirty, isFalse);
    expect(manager.store.sections.single.name, 'Desktop Group');
    manager.dispose(flushPending: false);
  });

  test('offline edits set the persisted dirty flag', () async {
    await setUpEnv();
    final manager = buildManager(remoteEnabled: false);
    await manager.initialize();
    manager.createSection('Offline Group');

    expect(
      ChannelSectionsStorage(prefs).readDirtySince(keychain.public),
      greaterThan(0),
      reason: 'offline edits must be flagged for publish-on-reconnect',
    );
    manager.dispose(flushPending: false);
  });

  test(
    'seed-publish schedules when relay confirms no blob but local exists',
    () async {
      await setUpEnv();
      // Local store exists (e.g. created offline earlier) and is clean.
      ChannelSectionsStorage(prefs).write(
        keychain.public,
        const ChannelSectionStore(
          sections: [ChannelSection(id: 's1', name: 'Local', order: 0)],
        ),
      );

      final relay = _FakeRelaySession(); // empty history: confirmed no blob
      final signedRelay = _RecordingSignedEventRelay();
      final manager = buildManager(
        relaySession: relay,
        signedEventRelay: signedRelay,
      );
      await manager.initialize();
      manager.dispose(flushPending: true);

      final submitted = await signedRelay.submitted.future.timeout(
        const Duration(seconds: 1),
      );
      final decoded =
          jsonDecode(crypto.decrypt(submitted.content)) as Map<String, dynamic>;
      expect(
        (decoded['sections'] as List).map((s) => s['name']),
        contains('Local'),
      );
    },
  );

  test('no seed-publish when the initial fetch fails', () async {
    await setUpEnv();
    ChannelSectionsStorage(prefs).write(
      keychain.public,
      const ChannelSectionStore(
        sections: [ChannelSection(id: 's1', name: 'Local', order: 0)],
      ),
    );

    final relay = _FailingRelaySession();
    final signedRelay = _RecordingSignedEventRelay();
    final manager = buildManager(
      relaySession: relay,
      signedEventRelay: signedRelay,
    );
    await manager.initialize();
    manager.dispose(flushPending: true);
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(
      signedRelay.submitted.isCompleted,
      isFalse,
      reason: 'a failed fetch must never trigger a seed publish',
    );
  });

  test('live remote event is ignored while dirty', () async {
    await setUpEnv();
    final relay = _FakeRelaySession();
    final manager = buildManager(
      relaySession: relay,
      signedEventRelay: _RecordingSignedEventRelay(),
    );
    await manager.initialize();
    manager.createSection('My Group');

    // Simulate a live stale event arriving before the debounce fires.
    relay.emit(sectionsEvent(sections: const [], createdAt: 100));

    expect(manager.store.sections.map((s) => s.name), contains('My Group'));
    manager.dispose(flushPending: false);
  });
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
  final List<void Function(NostrEvent)> _listeners = [];

  void emit(NostrEvent event) {
    for (final listener in List.of(_listeners)) {
      listener(event);
    }
  }

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
  }) async {
    _listeners.add(onEvent);
    return () => _listeners.remove(onEvent);
  }
}

class _FailingRelaySession extends RelaySessionNotifier {
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async => throw Exception('relay unavailable');

  @override
  Future<void Function()> subscribe(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String message)? onClosed,
  }) async => () {};
}
