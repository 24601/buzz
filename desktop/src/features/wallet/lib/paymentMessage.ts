import { formatUsd } from "./paymentIntent";

// Sent payments travel as ordinary kind-9 messages carrying a marker line
// (same pattern as `waveMessage.ts`) followed by a human-readable fallback,
// so clients without the wallet feature still show a sensible sentence.

export const PAYMENT_MESSAGE_MARKER = "<!-- buzz:payment:v1 -->";

export interface PaymentMessageContent {
  amountLabel: string;
  recipientName: string;
  memo: string;
}

const FALLBACK_PATTERN = /^Sent (\$[\d,]+\.\d{2}) to @(\S+?)(?: — (.+))?$/;

export function buildPaymentMessageContent(
  amountCents: number,
  recipientName: string,
  memo: string,
): string {
  const fallback = `Sent ${formatUsd(amountCents)} to @${recipientName}${
    memo ? ` — ${memo}` : ""
  }`;
  return `${PAYMENT_MESSAGE_MARKER}\n${fallback}`;
}

export function parsePaymentMessageContent(
  content: string,
): PaymentMessageContent | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(PAYMENT_MESSAGE_MARKER)) {
    return null;
  }

  const fallback = trimmed.slice(PAYMENT_MESSAGE_MARKER.length).trim();
  const match = FALLBACK_PATTERN.exec(fallback);
  if (!match) {
    return null;
  }

  return {
    amountLabel: match[1],
    recipientName: match[2],
    memo: match[3] ?? "",
  };
}
