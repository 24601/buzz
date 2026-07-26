// Mock wallet-provider data backing the Lightning wallet UI prototype.
//
// The PRD (see #buzz-lightning) defines a wallet-provider abstraction that
// any conforming Lightning SDK can plug into (Lexe is the v1 target). This
// module stands in for that provider so the UX can be designed and reviewed
// before any SDK is integrated. Everything here is static, deterministic
// fixture data — no keys, no network, no money.

export type WalletTransactionKind = "zap" | "kudos" | "send" | "fund";

export interface WalletTransaction {
  id: string;
  direction: "receive" | "send";
  amountSats: number;
  counterparty: string;
  memo: string;
  /** Pre-rendered relative time label; static so screenshots stay stable. */
  timeLabel: string;
  kind: WalletTransactionKind;
}

export interface WalletSnapshot {
  providerName: string;
  balanceSats: number;
  /** BOLT12 offer — the core send/receive primitive per the PRD. */
  bolt12Offer: string;
  /**
   * BIP-321 funding URI carrying the amountless BOLT12 offer plus a BOLT11
   * fallback so external wallets without BOLT12 support can still fund.
   */
  bip321Uri: string;
  /** 12-word BIP-39 seed phrase (fixture — never a real key). */
  seedPhrase: string;
  transactions: WalletTransaction[];
}

/** Format sats with the ₿ symbol, per the PRD ("use ₿ instead of sats"). */
export function formatBtc(sats: number): string {
  return `₿${sats.toLocaleString("en-US")}`;
}

const MOCK_BOLT12_OFFER =
  "lno1qgsqvgnwgcg35z6ee2h3yczraddm72xrfua9uve2rlrm9deu7xyfzrcgqgn3qzsyvfkx26qkyypvr5hfx4gdhjy7uq9jjjrrjkflcgwzycqqqqqqqqqqqqqqqqqqqq";

const MOCK_BOLT11_FALLBACK =
  "lnbc1pn9qw2app5x7rlq3mmkwvpksct5v4kxz6ryqdq5g9kxy7fqd9h8vmmfvdjsqqqqqqqqqqqq";

export const MOCK_WALLET: WalletSnapshot = {
  providerName: "Lexe",
  balanceSats: 21_450,
  bolt12Offer: MOCK_BOLT12_OFFER,
  bip321Uri: `bitcoin:?lno=${MOCK_BOLT12_OFFER}&lightning=${MOCK_BOLT11_FALLBACK}`,
  seedPhrase:
    "narrow ensure hollow tribe fiscal vault lyrics aunt shrug wagon rocket kite",
  transactions: [
    {
      id: "tx-01",
      direction: "receive",
      amountSats: 100,
      counterparty: "Eva",
      memo: "Zap · research synthesis",
      timeLabel: "12m ago",
      kind: "zap",
    },
    {
      id: "tx-02",
      direction: "receive",
      amountSats: 500,
      counterparty: "Tyler",
      memo: "Kudos · shipping the harness fix",
      timeLabel: "2h ago",
      kind: "kudos",
    },
    {
      id: "tx-03",
      direction: "send",
      amountSats: 250,
      counterparty: "Dawn",
      memo: "Shared agent invocation",
      timeLabel: "5h ago",
      kind: "send",
    },
    {
      id: "tx-04",
      direction: "receive",
      amountSats: 1_000,
      counterparty: "Mat",
      memo: "Gifting channel · welcome to #spiral",
      timeLabel: "1d ago",
      kind: "fund",
    },
    {
      id: "tx-05",
      direction: "send",
      amountSats: 100,
      counterparty: "Wren",
      memo: "Zap · rug-test writeup",
      timeLabel: "2d ago",
      kind: "zap",
    },
    {
      id: "tx-06",
      direction: "receive",
      amountSats: 20_200,
      counterparty: "External wallet",
      memo: "Wallet funded via BIP-321",
      timeLabel: "3d ago",
      kind: "fund",
    },
  ],
};
