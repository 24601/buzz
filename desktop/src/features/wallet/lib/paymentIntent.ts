// Detects a conversational payment intent in an outgoing message: a
// `$`-prefixed amount plus an `@recipient` mention, e.g. "$20 @Mat lunch".
// Everything else in the message becomes the payment memo.
//
// Prototype limitation: recipients are matched as a single `@word` token, so
// display names containing spaces are not resolved. Fine for the mockup;
// a real implementation would match against resolved mention entities.

export interface PaymentIntent {
  amountCents: number;
  recipientName: string;
  memo: string;
}

const AMOUNT_PATTERN =
  /(?:^|\s)(\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?)(?=\s|$)/;
const RECIPIENT_PATTERN = /(?:^|\s)@([A-Za-z0-9][\w.-]*)/;

/** Format cents as a US dollar string, e.g. 2000 → "$20.00". */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function parsePaymentIntent(text: string): PaymentIntent | null {
  const amountMatch = AMOUNT_PATTERN.exec(text);
  if (!amountMatch) {
    return null;
  }

  const recipientMatch = RECIPIENT_PATTERN.exec(text);
  if (!recipientMatch) {
    return null;
  }

  const dollars = Number.parseInt(amountMatch[2].replaceAll(",", ""), 10);
  const cents = amountMatch[3] ? Number.parseInt(amountMatch[3], 10) : 0;
  const amountCents = dollars * 100 + cents;
  if (amountCents <= 0) {
    return null;
  }

  const memo = text
    .replace(amountMatch[1], " ")
    .replace(`@${recipientMatch[1]}`, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    amountCents,
    recipientName: recipientMatch[1],
    memo,
  };
}
