/**
 * Pure-logic tests for the encrypted-backup (NIP-49) creation state model.
 * These drive the same reducer + validation helpers the BackupStep and
 * settings row use, without a DOM.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_CUSTOM_PASSPHRASE_LEN,
  createDisabled,
  customPassphraseIssue,
  effectivePassphrase,
  encryptedBackupReducer,
  initialEncryptedBackupState,
} from "./encryptedBackup.ts";

function reduce(events, from = initialEncryptedBackupState) {
  return events.reduce(encryptedBackupReducer, from);
}

// ── generated-passphrase mode (default) ─────────────────────────────────────

test("create_disabled_until_generated_passphrase_arrives", () => {
  assert.equal(createDisabled(initialEncryptedBackupState), true);
  const ready = reduce([
    {
      type: "passphrase-generated",
      passphrase: "alpha bravo carbon delta echo fox",
    },
  ]);
  assert.equal(createDisabled(ready), false);
  assert.equal(effectivePassphrase(ready), "alpha bravo carbon delta echo fox");
});

test("regenerate_replaces_passphrase_and_clears_generate_error", () => {
  const failed = reduce([
    { type: "passphrase-generate-failed", message: "boom" },
  ]);
  assert.equal(failed.generateError, "boom");
  const recovered = reduce(
    [{ type: "passphrase-generated", passphrase: "a b c d e f" }],
    failed,
  );
  assert.equal(recovered.generateError, null);
  assert.equal(recovered.generatedPassphrase, "a b c d e f");
});

// ── custom-passphrase mode ───────────────────────────────────────────────────

test("custom_mode_requires_min_length_and_matching_confirm", () => {
  const base = reduce([
    { type: "passphrase-generated", passphrase: "gen gen gen gen gen gen" },
    { type: "set-mode", mode: "custom" },
  ]);

  // Too short — even though a generated passphrase exists, custom mode must
  // not silently fall back to it.
  const short = reduce(
    [
      { type: "set-custom-passphrase", value: "short" },
      { type: "set-custom-confirm", value: "short" },
    ],
    base,
  );
  assert.equal(effectivePassphrase(short), null);
  assert.equal(createDisabled(short), true);

  // Long enough but mismatched confirm.
  const mismatched = reduce(
    [
      {
        type: "set-custom-passphrase",
        value: "a".repeat(MIN_CUSTOM_PASSPHRASE_LEN),
      },
      {
        type: "set-custom-confirm",
        value: "b".repeat(MIN_CUSTOM_PASSPHRASE_LEN),
      },
    ],
    base,
  );
  assert.equal(effectivePassphrase(mismatched), null);

  // Valid.
  const ok = reduce(
    [
      { type: "set-custom-passphrase", value: "correct horse battery" },
      { type: "set-custom-confirm", value: "correct horse battery" },
    ],
    base,
  );
  assert.equal(effectivePassphrase(ok), "correct horse battery");
  assert.equal(createDisabled(ok), false);
});

test("custom_passphrase_issue_messages", () => {
  // Empty input: no scolding while the user hasn't typed anything.
  assert.equal(customPassphraseIssue("", ""), null);
  assert.match(
    customPassphraseIssue("short", ""),
    new RegExp(`${MIN_CUSTOM_PASSPHRASE_LEN}`),
  );
  // Mismatch is only reported once confirm has content.
  assert.equal(customPassphraseIssue("a".repeat(12), ""), null);
  assert.match(customPassphraseIssue("a".repeat(12), "b"), /match/);
  assert.equal(customPassphraseIssue("a".repeat(12), "a".repeat(12)), null);
});

test("min_length_counts_code_points_not_utf16_units", () => {
  // 12 astral-plane emoji = 24 UTF-16 units but 12 code points; mirrors the
  // Rust chars().count() gate so both sides agree on the boundary.
  const emoji = "😀".repeat(MIN_CUSTOM_PASSPHRASE_LEN);
  assert.equal(customPassphraseIssue(emoji, emoji), null);
  const ready = reduce([
    { type: "set-mode", mode: "custom" },
    { type: "set-custom-passphrase", value: emoji },
    { type: "set-custom-confirm", value: emoji },
  ]);
  assert.equal(effectivePassphrase(ready), emoji);
});

// ── create lifecycle ─────────────────────────────────────────────────────────

test("create_lifecycle_happy_path_and_failure", () => {
  const ready = reduce([
    { type: "passphrase-generated", passphrase: "one two three four five six" },
  ]);

  const creating = reduce([{ type: "create-started" }], ready);
  assert.equal(creating.isCreating, true);
  assert.equal(
    createDisabled(creating),
    true,
    "no double-create while KDF runs",
  );

  const failed = reduce(
    [{ type: "create-failed", message: "keychain unavailable" }],
    creating,
  );
  assert.equal(failed.isCreating, false);
  assert.equal(failed.createError, "keychain unavailable");
  assert.equal(createDisabled(failed), false, "retry allowed after failure");

  const done = reduce(
    [
      { type: "create-started" },
      { type: "create-succeeded", ncryptsec: "ncryptsec1abc" },
    ],
    failed,
  );
  assert.equal(done.isCreating, false);
  assert.equal(done.ncryptsec, "ncryptsec1abc");
  assert.equal(done.createError, null);
});
