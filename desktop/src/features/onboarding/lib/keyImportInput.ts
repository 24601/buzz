/**
 * Pure classification + submit gating for the key-import form, unit-testable
 * without a DOM.
 *
 * `ncryptsec1…` is a NIP-49 encrypted backup: no npub preview is possible
 * (the pubkey is inside the encrypted payload) and a passphrase is required.
 * Full validation happens in Rust at decrypt time; here we only classify by
 * HRP shape so the form can switch modes while the user is mid-paste.
 */

import { nsecToNpub } from "@/shared/lib/nostrUtils";

export type KeyImportKind = "nsec" | "ncryptsec" | "unknown";

/** Bech32 charset after the `ncryptsec1` HRP; anything else can't decode. */
const NCRYPTSEC_SHAPE = /^ncryptsec1[02-9ac-hj-np-z]{10,}$/;

export function classifyKeyImportInput(input: string): KeyImportKind {
  const trimmed = input.trim();
  if (trimmed.startsWith("ncryptsec1")) return "ncryptsec";
  if (trimmed.startsWith("nsec1")) return "nsec";
  return "unknown";
}

/** Structurally plausible encrypted backup (real validation is in Rust). */
export function isPlausibleNcryptsec(input: string): boolean {
  return NCRYPTSEC_SHAPE.test(input.trim());
}

/**
 * Whether the import form's submit should be enabled.
 * nsec: must derive an npub. ncryptsec: plausible blob + non-empty passphrase.
 */
export function keyImportSubmitEnabled(
  input: string,
  passphrase: string,
): boolean {
  const kind = classifyKeyImportInput(input);
  if (kind === "ncryptsec") {
    return isPlausibleNcryptsec(input) && passphrase.length > 0;
  }
  return nsecToNpub(input) !== null;
}
