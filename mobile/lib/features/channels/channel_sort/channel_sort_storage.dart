import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../channel.dart';

String channelSortKey(String pubkey) => 'buzz.channel-sort.v1:$pubkey';

String channelSortDirtySinceKey(String pubkey) =>
    'buzz.channel-sort.dirty-since.v1:$pubkey';

/// Per-group sidebar sort mode. Matches desktop's `ChannelSortMode` — the
/// payload strings ('alpha' | 'recent') are shared relay format.
enum ChannelSortMode {
  alpha('alpha'),
  recent('recent');

  final String wireValue;

  const ChannelSortMode(this.wireValue);

  static ChannelSortMode? fromWire(Object? value) {
    if (value == 'alpha') return ChannelSortMode.alpha;
    if (value == 'recent') return ChannelSortMode.recent;
    return null;
  }
}

const ChannelSortMode kDefaultSortMode = ChannelSortMode.alpha;

/// Group key for a custom section, matching desktop's `section:<id>` format.
String sectionSortGroupKey(String sectionId) => 'section:$sectionId';

class ChannelSortStore {
  final int version;

  /// Group key → sort mode. Fixed groups use their name ('starred',
  /// 'channels', 'forums', 'dms'); custom sections use `section:<id>`.
  final Map<String, ChannelSortMode> groups;

  const ChannelSortStore({this.version = 1, this.groups = const {}});

  Map<String, dynamic> toJson() => {
    'version': version,
    'groups': {
      for (final entry in groups.entries) entry.key: entry.value.wireValue,
    },
  };

  factory ChannelSortStore.fromJson(Map<String, dynamic> json) {
    final rawGroups = json['groups'];
    final groups = <String, ChannelSortMode>{};
    if (rawGroups is Map) {
      for (final entry in rawGroups.entries) {
        final key = entry.key;
        final mode = ChannelSortMode.fromWire(entry.value);
        if (key is String && mode != null) {
          groups[key] = mode;
        }
      }
    }
    return ChannelSortStore(version: 1, groups: groups);
  }
}

/// Drops per-section sort modes whose custom section no longer exists so
/// deleted sections don't leave stale `section:<id>` keys behind. Fixed group
/// keys are always kept. Returns the same store when nothing needs stripping.
ChannelSortStore stripOrphanedSectionModes(
  ChannelSortStore store,
  Iterable<String> liveSectionIds,
) {
  final liveKeys = {for (final id in liveSectionIds) sectionSortGroupKey(id)};
  final kept = <String, ChannelSortMode>{
    for (final entry in store.groups.entries)
      if (!entry.key.startsWith('section:') || liveKeys.contains(entry.key))
        entry.key: entry.value,
  };
  if (kept.length == store.groups.length) return store;
  return ChannelSortStore(version: store.version, groups: kept);
}

/// Sorts one sidebar grouping's channels by the selected mode, mirroring
/// desktop's `sortChannelsForSidebar`: `alpha` orders by name (id
/// tie-breaker); `recent` orders by last message time, newest first, with
/// message-less channels sinking to the bottom alphabetically.
List<Channel> sortChannelsForList(
  List<Channel> channels,
  ChannelSortMode mode,
) {
  int byName(Channel left, Channel right) {
    final name = left.name.toLowerCase().compareTo(right.name.toLowerCase());
    if (name != 0) return name;
    return left.id.compareTo(right.id);
  }

  final sorted = channels.toList();
  if (mode == ChannelSortMode.alpha) {
    sorted.sort(byName);
    return sorted;
  }
  sorted.sort((left, right) {
    final leftMs = left.lastMessageAt?.millisecondsSinceEpoch;
    final rightMs = right.lastMessageAt?.millisecondsSinceEpoch;
    if (leftMs != null && rightMs != null && leftMs != rightMs) {
      return rightMs.compareTo(leftMs);
    }
    if (leftMs != null && rightMs == null) return -1;
    if (leftMs == null && rightMs != null) return 1;
    return byName(left, right);
  });
  return sorted;
}

class ChannelSortStorage {
  final SharedPreferences _prefs;

  ChannelSortStorage(this._prefs);

  ChannelSortStore read(String pubkey) {
    final raw = _prefs.getString(channelSortKey(pubkey));
    if (raw == null || raw.isEmpty) {
      return const ChannelSortStore();
    }

    try {
      final parsed = jsonDecode(raw);
      if (parsed is! Map<String, dynamic>) {
        return const ChannelSortStore();
      }
      if (parsed['version'] != 1) {
        return const ChannelSortStore();
      }
      return ChannelSortStore.fromJson(parsed);
    } catch (_) {
      return const ChannelSortStore();
    }
  }

  void write(String pubkey, ChannelSortStore store) {
    _prefs.setString(channelSortKey(pubkey), jsonEncode(store.toJson()));
  }

  /// Unix seconds of the oldest unpublished local edit, or 0 when clean.
  /// Persisted so unpublished edits survive manager teardown and restarts.
  int readDirtySince(String pubkey) =>
      _prefs.getInt(channelSortDirtySinceKey(pubkey)) ?? 0;

  void writeDirtySince(String pubkey, int dirtySince) {
    if (dirtySince <= 0) {
      _prefs.remove(channelSortDirtySinceKey(pubkey));
    } else {
      _prefs.setInt(channelSortDirtySinceKey(pubkey), dirtySince);
    }
  }
}
