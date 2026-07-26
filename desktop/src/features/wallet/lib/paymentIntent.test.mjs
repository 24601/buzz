import assert from "node:assert/strict";
import test from "node:test";

import { formatUsd, parsePaymentIntent } from "./paymentIntent.ts";

test("formats cents as US dollars", () => {
  assert.equal(formatUsd(2000), "$20.00");
  assert.equal(formatUsd(21_450), "$214.50");
  assert.equal(formatUsd(5), "$0.05");
  assert.equal(formatUsd(123_456_789), "$1,234,567.89");
});

test("parses amount, recipient, and memo", () => {
  assert.deepEqual(parsePaymentIntent("$20 @Mat lunch"), {
    amountCents: 2000,
    recipientName: "Mat",
    memo: "lunch",
  });
});

test("parses decimal amounts", () => {
  assert.deepEqual(parsePaymentIntent("@Mat here is $12.50 for the pizza"), {
    amountCents: 1250,
    recipientName: "Mat",
    memo: "here is for the pizza",
  });
});

test("parses thousands separators", () => {
  assert.equal(parsePaymentIntent("$1,250 @Mat rent")?.amountCents, 125_000);
});

test("requires a recipient mention", () => {
  assert.equal(parsePaymentIntent("$20 for lunch"), null);
});

test("requires a dollar amount", () => {
  assert.equal(parsePaymentIntent("hey @Mat lunch soon?"), null);
});

test("rejects zero amounts", () => {
  assert.equal(parsePaymentIntent("$0 @Mat nothing"), null);
});

test("ignores mid-word dollar signs", () => {
  assert.equal(parsePaymentIntent("US$20 @Mat"), null);
});

test("amount must be a standalone token", () => {
  assert.equal(parsePaymentIntent("$20x @Mat"), null);
});

test("empty memo when message is only amount and recipient", () => {
  assert.deepEqual(parsePaymentIntent("$5 @Mat"), {
    amountCents: 500,
    recipientName: "Mat",
    memo: "",
  });
});
