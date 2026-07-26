// Real end-to-end test: boots the app authenticated against a live relay,
// opens a channel, and sends a message that is published to the relay.
//
// Auth is seeded directly into secure storage (the same keys the pairing flow
// writes) so the run exercises the real relay/session/publish stack without the
// interactive NIP-AB pairing + SAS handshake. Configure via --dart-define:
//
//   flutter test integration_test/send_message_test.dart -d <device> \
//     --dart-define=E2E_RELAY_URL=http://host:3000 \
//     --dart-define=E2E_NSEC=nsec1... \
//     --dart-define=E2E_PUBKEY=<64-hex> \
//     --dart-define=E2E_CHANNEL_ID=<uuid> \
//     --dart-define=E2E_CHANNEL_NAME=mobile-e2e \
//     --dart-define=E2E_CONTENT="Hello from the iOS Simulator"
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buzz/app.dart';
import 'package:buzz/features/channels/send_message_provider.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:buzz/shared/theme/theme_provider.dart';

const _relayUrl = String.fromEnvironment(
  'E2E_RELAY_URL',
  defaultValue: 'http://localhost:3000',
);
const _nsec = String.fromEnvironment('E2E_NSEC');
const _pubkey = String.fromEnvironment('E2E_PUBKEY');
const _channelId = String.fromEnvironment('E2E_CHANNEL_ID');
const _channelName = String.fromEnvironment(
  'E2E_CHANNEL_NAME',
  defaultValue: 'mobile-e2e',
);
const _content = String.fromEnvironment(
  'E2E_CONTENT',
  defaultValue: 'Hello from the iOS Simulator via a real relay!',
);

/// Pump frames until [finder] matches or the timeout elapses. Avoids
/// pumpAndSettle, which never returns while the app has ongoing animations.
Future<bool> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 300));
    if (finder.evaluate().isNotEmpty) return true;
  }
  return false;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sends a message to a channel through the live relay', (
    WidgetTester tester,
  ) async {
    expect(_nsec.isNotEmpty, true, reason: 'E2E_NSEC define is required');
    expect(_channelId.isNotEmpty, true, reason: 'E2E_CHANNEL_ID is required');

    // Seed the identity + community the same way successful pairing does.
    const secure = FlutterSecureStorage();
    await secure.deleteAll();
    final community = {
      'id': '11111111-1111-4111-8111-111111111111',
      'name': 'E2E Relay',
      'relayUrl': _relayUrl,
      'pubkey': _pubkey,
      'nsec': _nsec,
      'addedAt': DateTime.now().toUtc().toIso8601String(),
    };
    await secure.write(
      key: 'buzz_communities',
      value: jsonEncode([community]),
    );
    await secure.write(
      key: 'buzz_active_community_id',
      value: community['id'],
    );

    SharedPreferences.setMockInitialValues(<String, Object>{});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [savedPrefsProvider.overrideWithValue(prefs)],
        child: const App(),
      ),
    );

    // Authenticated boot should skip pairing and load the channel list.
    final channelTile = find.text(_channelName);
    final gotChannels = await _pumpUntil(
      tester,
      channelTile,
      timeout: const Duration(seconds: 45),
    );
    expect(
      gotChannels,
      true,
      reason: 'channel "$_channelName" never appeared — relay/auth/session '
          'may not have connected',
    );

    // Open the channel so the recorded video shows the conversation.
    await tester.tap(channelTile.first);
    await tester.pump(const Duration(seconds: 3));

    // Publish the message through the real relay session.
    final ctx = tester.element(find.byType(App));
    final container = ProviderScope.containerOf(ctx);
    // Ensure the session is live before publishing.
    for (var i = 0; i < 60; i++) {
      if (container.read(relaySessionProvider).status ==
          SessionStatus.connected) {
        break;
      }
      await tester.pump(const Duration(milliseconds: 500));
    }
    await container.read(sendMessageProvider).call(
          channelId: _channelId,
          content: _content,
        );

    // Best-effort: wait for the message to round-trip over the live
    // subscription so the recorded video shows it. Delivery is verified
    // authoritatively by querying the relay after the build.
    final appeared = await _pumpUntil(
      tester,
      find.textContaining(_content),
      timeout: const Duration(seconds: 30),
    );
    // ignore: avoid_print
    print('E2E round-trip visible in UI: $appeared');

    // Hold a beat so the recording captures the delivered message.
    await tester.pump(const Duration(seconds: 3));
  });
}
