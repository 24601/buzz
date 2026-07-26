/** Return a valid author-claimed Buzz message backlink from a git event. */
export function sourceMessageLinkFromEvent(event) {
  const value = event.tags.find((tag) => tag[0] === "buzz-source")?.[1];
  if (typeof value !== "string" || value.length === 0) return null;

  try {
    const parsed = new URL(value);
    const channelId = parsed.searchParams.get("channel");
    const messageId = parsed.searchParams.get("id");
    if (
      parsed.protocol !== "buzz:" ||
      parsed.hostname !== "message" ||
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        channelId ?? "",
      ) ||
      !/^[0-9a-fA-F]{64}$/.test(messageId ?? "")
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

const COMMIT_TAG_NAMES = new Set([
  "c",
  "commit",
  "merge-commit",
  "applied-as-commits",
]);

/**
 * Resolve the earliest author-claimed source message attached to an event
 * that names a commit. Earliest wins so a later third-party event cannot
 * overwrite the provenance already shown for the same immutable hash.
 */
export function sourceMessageLinkForCommit(events, commitHash) {
  const normalizedHash = commitHash.toLowerCase();
  return (
    [...events]
      .filter((event) =>
        event.tags.some(
          (tag) =>
            COMMIT_TAG_NAMES.has(tag[0]) &&
            tag[1]?.toLowerCase() === normalizedHash,
        ),
      )
      .sort(
        (left, right) =>
          left.created_at - right.created_at || left.id.localeCompare(right.id),
      )
      .map(sourceMessageLinkFromEvent)
      .find((href) => href !== null) ?? null
  );
}
