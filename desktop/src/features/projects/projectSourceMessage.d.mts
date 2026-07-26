import type { RelayEvent } from "@/shared/api/types";

export function sourceMessageLinkFromEvent(event: RelayEvent): string | null;
export function sourceMessageLinkForCommit(
  events: RelayEvent[],
  commitHash: string,
): string | null;
