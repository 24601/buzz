const PROJECT_LINK_SCHEME = "buzz:";
const PROJECT_LINK_HOST = "git";
const REPO_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const PUBKEY_PATTERN = /^[0-9a-f]{64}$/;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,64}$/;

export type ProjectLinkType =
  | "repository"
  | "issue"
  | "pull-request"
  | "patch"
  | "commit";

export type ParsedProjectLink = {
  href: string;
  projectId: string;
  owner: string;
  repoId: string;
  type: ProjectLinkType;
  entityId: string | null;
};

export type ProjectLinkInput = {
  owner: string;
  repoId: string;
  type: ProjectLinkType;
  entityId?: string | null;
};

function isProjectLinkType(value: string | null): value is ProjectLinkType {
  return (
    value === "repository" ||
    value === "issue" ||
    value === "pull-request" ||
    value === "patch" ||
    value === "commit"
  );
}

function parseProjectCoordinate(value: string | null) {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const owner = value.slice(0, separator).toLowerCase();
  const repoId = value.slice(separator + 1);
  if (!PUBKEY_PATTERN.test(owner) || !REPO_ID_PATTERN.test(repoId)) {
    return null;
  }
  return { owner, repoId };
}

function isValidEntityId(type: ProjectLinkType, entityId: string | null) {
  if (type === "repository") return entityId === null;
  if (!entityId) return false;
  return type === "commit"
    ? COMMIT_HASH_PATTERN.test(entityId)
    : EVENT_ID_PATTERN.test(entityId);
}

/** Build the canonical in-app link for a Buzz repository entity. */
export function buildProjectLink(input: ProjectLinkInput): string {
  const owner = input.owner.toLowerCase();
  if (!PUBKEY_PATTERN.test(owner)) {
    throw new Error("Project link owner must be a 64-character hex pubkey.");
  }
  if (!REPO_ID_PATTERN.test(input.repoId)) {
    throw new Error("Project link repository ID is invalid.");
  }
  const entityId = input.entityId?.toLowerCase() ?? null;
  if (!isValidEntityId(input.type, entityId)) {
    throw new Error(`Project link ${input.type} ID is invalid.`);
  }

  const params = new URLSearchParams({
    repo: `${owner}:${input.repoId}`,
    type: input.type,
  });
  if (entityId) params.set("id", entityId);
  return `${PROJECT_LINK_SCHEME}//${PROJECT_LINK_HOST}?${params.toString()}`;
}

/** Parse and strictly validate a canonical Buzz repository entity link. */
export function parseProjectLink(href: string): ParsedProjectLink | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== PROJECT_LINK_SCHEME ||
    parsed.hostname !== PROJECT_LINK_HOST ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash
  ) {
    return null;
  }

  const coordinate = parseProjectCoordinate(parsed.searchParams.get("repo"));
  const type = parsed.searchParams.get("type");
  const rawEntityId = parsed.searchParams.get("id");
  const entityId = rawEntityId?.toLowerCase() ?? null;
  if (
    !coordinate ||
    !isProjectLinkType(type) ||
    !isValidEntityId(type, entityId)
  ) {
    return null;
  }

  return {
    href: buildProjectLink({ ...coordinate, type, entityId }),
    projectId: `${coordinate.owner}:${coordinate.repoId}`,
    owner: coordinate.owner,
    repoId: coordinate.repoId,
    type,
    entityId,
  };
}

export function isProjectLink(href: string | null | undefined): boolean {
  return typeof href === "string" && href.startsWith("buzz://git?");
}
