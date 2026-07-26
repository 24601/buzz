import assert from "node:assert/strict";
import test from "node:test";

import {
  sourceMessageLinkForCommit,
  sourceMessageLinkFromEvent,
} from "./projectSourceMessage.mjs";

const CHANNEL = "11111111-1111-4111-8111-111111111111";
const MESSAGE = "a".repeat(64);
const SOURCE = `buzz://message?channel=${CHANNEL}&id=${MESSAGE}`;
const COMMIT = "b".repeat(40);

function event({ createdAt = 100, id = "event", source = SOURCE } = {}) {
  return {
    id,
    created_at: createdAt,
    tags: [
      ["commit", COMMIT],
      ["buzz-source", source],
    ],
  };
}

test("sourceMessageLinkFromEvent validates exact Buzz message links", () => {
  assert.equal(sourceMessageLinkFromEvent(event()), SOURCE);
  assert.equal(
    sourceMessageLinkFromEvent(
      event({ source: `buzz://message?channel=invalid&id=${MESSAGE}` }),
    ),
    null,
  );
  assert.equal(
    sourceMessageLinkFromEvent(
      event({
        source: `https://example.com/?channel=${CHANNEL}&id=${MESSAGE}`,
      }),
    ),
    null,
  );
});

test("sourceMessageLinkForCommit uses the earliest valid claim", () => {
  assert.equal(
    sourceMessageLinkForCommit(
      [
        event({
          createdAt: 300,
          id: "later",
          source: SOURCE.replace(MESSAGE, "c".repeat(64)),
        }),
        event({ createdAt: 100, id: "first" }),
      ],
      COMMIT.toUpperCase(),
    ),
    SOURCE,
  );
  assert.equal(sourceMessageLinkForCommit([event()], "c".repeat(40)), null);
});
