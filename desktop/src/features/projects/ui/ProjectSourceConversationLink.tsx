import { MessageSquareText } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelsQuery } from "@/features/channels/hooks";
import { parseMessageLink } from "@/features/messages/lib/messageLink";

export function ProjectSourceConversationLink({
  href,
}: {
  href: string | null;
}) {
  const parsed = href ? parseMessageLink(href) : null;
  const link = parsed?.ok ? parsed.value : null;
  const { goChannel } = useAppNavigation();
  const channelsQuery = useChannelsQuery({ enabled: Boolean(link) });
  const channel = link
    ? channelsQuery.data?.find((candidate) => candidate.id === link.channelId)
    : null;

  if (!link) return null;

  return (
    <button
      aria-label={`Open originating conversation${channel ? ` in #${channel.name}` : ""}`}
      className="inline-flex min-w-0 items-center gap-1 rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      title="This source is claimed by the git event author and is not relay-verified."
      type="button"
      onClick={() =>
        void goChannel(link.channelId, {
          messageId: link.messageId,
          threadRootId: link.threadRootId,
        })
      }
    >
      <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        View conversation{channel ? ` in #${channel.name}` : ""}
      </span>
    </button>
  );
}
