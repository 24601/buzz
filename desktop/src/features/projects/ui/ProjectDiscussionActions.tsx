import { MessageSquare } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { ProjectSourceConversationLink } from "./ProjectSourceConversationLink";

export function ProjectDiscussionActions({
  channelId,
  onOpenChannel,
  sourceMessageLink,
}: {
  channelId: string | null;
  onOpenChannel: (channelId: string) => void;
  sourceMessageLink: string | null;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {sourceMessageLink ? (
        <div className="max-w-64 text-xs">
          <ProjectSourceConversationLink href={sourceMessageLink} />
        </div>
      ) : null}
      {channelId ? (
        <Button
          className="h-8 shrink-0 gap-1.5"
          onClick={() => onOpenChannel(channelId)}
          size="sm"
          variant="outline"
        >
          <MessageSquare className="h-4 w-4" />
          Open Discussion
        </Button>
      ) : null}
    </div>
  );
}
