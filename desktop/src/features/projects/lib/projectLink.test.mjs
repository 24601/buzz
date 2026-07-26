import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectLink, parseProjectLink } from "./projectLink.ts";

const OWNER = "a".repeat(64);
const EVENT_ID = "b".repeat(64);

test("buildProjectLink round-trips repository entities", () => {
  const href = buildProjectLink({
    owner: OWNER.toUpperCase(),
    repoId: "buzz",
    type: "pull-request",
    entityId: EVENT_ID.toUpperCase(),
  });

  assert.equal(
    href,
    `buzz://git?repo=${OWNER}%3Abuzz&type=pull-request&id=${EVENT_ID}`,
  );
  assert.deepEqual(parseProjectLink(href), {
    href,
    projectId: `${OWNER}:buzz`,
    owner: OWNER,
    repoId: "buzz",
    type: "pull-request",
    entityId: EVENT_ID,
  });
});

test("parseProjectLink supports repositories and commit hashes", () => {
  assert.equal(
    parseProjectLink(`buzz://git?repo=${OWNER}:buzz&type=repository`)?.type,
    "repository",
  );
  assert.equal(
    parseProjectLink(
      `buzz://git?repo=${OWNER}:buzz&type=commit&id=${"c".repeat(40)}`,
    )?.entityId,
    "c".repeat(40),
  );
});

test("parseProjectLink rejects malformed and ambiguous targets", () => {
  for (const href of [
    `https://git?repo=${OWNER}:buzz&type=repository`,
    `buzz://evil?repo=${OWNER}:buzz&type=repository`,
    `buzz://git/path?repo=${OWNER}:buzz&type=repository`,
    `buzz://git?repo=short:buzz&type=repository`,
    `buzz://git?repo=${OWNER}:../buzz&type=repository`,
    `buzz://git?repo=${OWNER}:buzz&type=issue`,
    `buzz://git?repo=${OWNER}:buzz&type=repository&id=${EVENT_ID}`,
    `buzz://git?repo=${OWNER}:buzz&type=commit&id=xyz`,
  ]) {
    assert.equal(parseProjectLink(href), null, href);
  }
});
