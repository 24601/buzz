import { useSyncExternalStore } from "react";

// Conversational-wallet prototype store. The PRD (see #buzz-lightning)
// defines a wallet-provider abstraction (Lexe is the v1 target); this module
// stands in for it so the conversation-first payment UX can be designed and
// reviewed before any SDK exists. Static fixture data — no keys, no network,
// no money. The balance is session-local so demo payments visibly deduct.

export const WALLET_PROVIDER_NAME = "Lexe";

const MOCK_BOLT12_OFFER =
  "lno1qgsqvgnwgcg35z6ee2h3yczraddm72xrfua9uve2rlrm9deu7xyfzrcgqgn3qzsyvfkx26qkyypvr5hfx4gdhjy7uq9jjjrrjkflcgwzycqqqqqqqqqqqqqqqqqqqq";

const MOCK_BOLT11_FALLBACK =
  "lnbc1pn9qw2app5x7rlq3mmkwvpksct5v4kxz6ryqdq5g9kxy7fqd9h8vmmfvdjsqqqqqqqqqqqq";

/** BIP-321 funding URI: amountless BOLT12 offer plus a BOLT11 fallback. */
export const WALLET_BIP321_URI = `bitcoin:?lno=${MOCK_BOLT12_OFFER}&lightning=${MOCK_BOLT11_FALLBACK}`;

const INITIAL_BALANCE_CENTS = 21_450; // $214.50

let balanceCents = INITIAL_BALANCE_CENTS;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWalletBalanceCents(): number {
  return balanceCents;
}

/** Deduct a confirmed payment from the session balance (floored at zero). */
export function spendFromWallet(amountCents: number): void {
  balanceCents = Math.max(0, balanceCents - Math.max(0, amountCents));
  emitChange();
}

/** Reactive session balance for the chip and the confirm dialog. */
export function useWalletBalanceCents(): number {
  return useSyncExternalStore(
    subscribe,
    getWalletBalanceCents,
    getWalletBalanceCents,
  );
}
