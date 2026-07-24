import assert from "node:assert/strict";
import test from "node:test";

import { buildInitialProjectEventTemplates } from "./projectCreation.ts";

const OWNER = "a".repeat(64);

test("buildInitialProjectEventTemplates links the initial repository as primary", () => {
  const templates = buildInitialProjectEventTemplates({
    cloneUrl: "https://relay.example/git/owner/sprout.git",
    description: "A multi-repository workspace",
    name: "Sprout",
    ownerPubkey: OWNER,
    webUrl: "https://example.com/sprout",
  });

  assert.equal(templates.dtag, "sprout");
  assert.equal(templates.project.kind, 30621);
  assert.equal(templates.repository.kind, 30617);
  assert.deepEqual(templates.project.tags, [
    ["d", "sprout"],
    ["name", "Sprout"],
    ["description", "A multi-repository workspace"],
    ["a", `30617:${OWNER}:sprout`, "", "primary"],
  ]);
  assert.deepEqual(templates.repository.tags, [
    ["d", "sprout"],
    ["name", "Sprout"],
    ["description", "A multi-repository workspace"],
    ["clone", "https://relay.example/git/owner/sprout.git"],
    ["web", "https://example.com/sprout"],
  ]);
});

test("buildInitialProjectEventTemplates rejects names without an identifier", () => {
  assert.throws(
    () =>
      buildInitialProjectEventTemplates({
        name: "!!!",
        ownerPubkey: OWNER,
      }),
    /letters or numbers/,
  );
});

test("buildInitialProjectEventTemplates enforces the project content byte limit", () => {
  assert.doesNotThrow(() =>
    buildInitialProjectEventTemplates({
      description: "🙂".repeat(256),
      name: "Sprout",
      ownerPubkey: OWNER,
    }),
  );
  assert.throws(
    () =>
      buildInitialProjectEventTemplates({
        description: "🙂".repeat(257),
        name: "Sprout",
        ownerPubkey: OWNER,
      }),
    /1,024 bytes/,
  );
});
