import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentMessageContent,
  parsePaymentMessageContent,
  PAYMENT_MESSAGE_MARKER,
} from "./paymentMessage.ts";

test("round-trips a payment with a memo", () => {
  const content = buildPaymentMessageContent(2000, "Mat", "lunch");
  assert.ok(content.startsWith(PAYMENT_MESSAGE_MARKER));
  assert.deepEqual(parsePaymentMessageContent(content), {
    amountLabel: "$20.00",
    recipientName: "Mat",
    memo: "lunch",
  });
});

test("round-trips a payment without a memo", () => {
  const content = buildPaymentMessageContent(1250, "Mat", "");
  assert.deepEqual(parsePaymentMessageContent(content), {
    amountLabel: "$12.50",
    recipientName: "Mat",
    memo: "",
  });
});

test("fallback line reads as a sentence for non-wallet clients", () => {
  const content = buildPaymentMessageContent(2000, "Mat", "lunch");
  assert.equal(content.split("\n")[1], "Sent $20.00 to @Mat — lunch");
});

test("ordinary messages do not parse as payments", () => {
  assert.equal(parsePaymentMessageContent("Sent $20.00 to @Mat — lunch"), null);
  assert.equal(parsePaymentMessageContent("hello"), null);
});

test("marker without a valid fallback does not parse", () => {
  assert.equal(
    parsePaymentMessageContent(`${PAYMENT_MESSAGE_MARKER}\nnot a payment`),
    null,
  );
});
