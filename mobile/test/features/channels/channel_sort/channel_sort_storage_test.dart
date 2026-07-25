import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/channels/channel_sort/channel_sort_storage.dart';

void main() {
  group('ChannelSortStore JSON', () {
    test('round-trips the desktop wire format', () {
      final store = ChannelSortStore(
        groups: {
          'channels': ChannelSortMode.recent,
          'dms': ChannelSortMode.alpha,
          'section:abc': ChannelSortMode.recent,
        },
      );
      final decoded = ChannelSortStore.fromJson(store.toJson());
      expect(decoded.groups, store.groups);
      expect(store.toJson()['groups'], {
        'channels': 'recent',
        'dms': 'alpha',
        'section:abc': 'recent',
      });
    });

    test('drops unknown modes and non-string keys', () {
      final decoded = ChannelSortStore.fromJson({
        'version': 1,
        'groups': {'channels': 'recent', 'starred': 'bogus', 'dms': 42},
      });
      expect(decoded.groups, {'channels': ChannelSortMode.recent});
    });
  });

  group('stripOrphanedSectionModes', () {
    test('removes modes for deleted sections, keeps fixed groups', () {
      final store = ChannelSortStore(
        groups: {
          'channels': ChannelSortMode.recent,
          'section:live': ChannelSortMode.recent,
          'section:dead': ChannelSortMode.alpha,
        },
      );
      final stripped = stripOrphanedSectionModes(store, ['live']);
      expect(stripped.groups.keys, ['channels', 'section:live']);
    });

    test('returns same store when nothing to strip', () {
      final store = ChannelSortStore(
        groups: {'section:live': ChannelSortMode.recent},
      );
      expect(
        identical(stripOrphanedSectionModes(store, ['live']), store),
        isTrue,
      );
    });
  });

  group('ChannelSortStorage', () {
    test('read/write round-trip and dirty flag persistence', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = ChannelSortStorage(prefs);

      storage.write(
        'pk',
        ChannelSortStore(groups: {'channels': ChannelSortMode.recent}),
      );
      expect(storage.read('pk').groups, {'channels': ChannelSortMode.recent});

      expect(storage.readDirtySince('pk'), 0);
      storage.writeDirtySince('pk', 123);
      expect(storage.readDirtySince('pk'), 123);
      storage.writeDirtySince('pk', 0);
      expect(storage.readDirtySince('pk'), 0);
    });

    test('read tolerates corrupt or versioned-away payloads', () async {
      SharedPreferences.setMockInitialValues({
        channelSortKey('pk'): 'not-json',
        channelSortKey('pk2'): '{"version":2,"groups":{}}',
      });
      final prefs = await SharedPreferences.getInstance();
      final storage = ChannelSortStorage(prefs);
      expect(storage.read('pk').groups, isEmpty);
      expect(storage.read('pk2').groups, isEmpty);
    });
  });

  group('sortChannelsForList', () {
    Channel channel(String id, String name, {DateTime? lastMessageAt}) =>
        Channel(
          id: id,
          name: name,
          channelType: 'stream',
          visibility: 'open',
          description: '',
          createdBy: 'pk',
          createdAt: DateTime.utc(2026),
          memberCount: 1,
          lastMessageAt: lastMessageAt,
        );

    test('alpha sorts by name case-insensitively with id tie-break', () {
      final sorted = sortChannelsForList([
        channel('2', 'beta'),
        channel('1', 'Alpha'),
        channel('3', 'alpha'),
      ], ChannelSortMode.alpha);
      expect(sorted.map((c) => c.id), ['1', '3', '2']);
    });

    test('recent sorts newest first, message-less channels sink alpha', () {
      final now = DateTime.utc(2026, 7, 25);
      final sorted = sortChannelsForList([
        channel('a', 'quiet-z'),
        channel(
          'b',
          'old',
          lastMessageAt: now.subtract(const Duration(days: 2)),
        ),
        channel('c', 'new', lastMessageAt: now),
        channel('d', 'quiet-a'),
      ], ChannelSortMode.recent);
      expect(sorted.map((c) => c.id), ['c', 'b', 'd', 'a']);
    });
  });
}
