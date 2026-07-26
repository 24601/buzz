import { useQuery } from "@tanstack/react-query";

import type { Project } from "@/features/projects/hooks";
import { sourceMessageLinkForCommit } from "@/features/projects/projectSourceMessage.mjs";
import { relayClient } from "@/shared/api/relayClient";
import {
  KIND_GIT_PATCH,
  KIND_GIT_PR_UPDATE,
  KIND_GIT_PULL_REQUEST,
  KIND_GIT_STATUS_MERGED,
} from "@/shared/constants/kinds";

async function fetchProjectCommitSourceMessage(
  project: Project,
  commitHash: string,
): Promise<string | null> {
  const events = await relayClient.fetchEvents({
    kinds: [
      KIND_GIT_PATCH,
      KIND_GIT_PULL_REQUEST,
      KIND_GIT_PR_UPDATE,
      KIND_GIT_STATUS_MERGED,
    ],
    "#a": [project.repoAddress],
    limit: 500,
  });
  return sourceMessageLinkForCommit(events, commitHash);
}

/** Loads the author-claimed Buzz message that originated a repository commit. */
export function useProjectCommitSourceMessageQuery(
  project: Project | null | undefined,
  commitHash: string | null | undefined,
) {
  return useQuery({
    queryKey: [
      "project",
      project?.id ?? "none",
      "commit-source-message",
      commitHash ?? "none",
    ],
    queryFn: () => {
      if (!project || !commitHash) return Promise.resolve(null);
      return fetchProjectCommitSourceMessage(project, commitHash);
    },
    enabled: Boolean(project && commitHash),
    staleTime: 30_000,
  });
}
