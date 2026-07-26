import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { waitForAnimations } from "../helpers/animations";

const SHOTS = "test-results/wallet-conversational";

// Screenshot evidence for the conversation-first wallet prototype: the
// balance/fund chip in the top chrome, and the in-conversation payment flow
// ($-amount + @recipient → confirmation dialog → payment card in the
// timeline with the balance deducted). The `wallet` preview feature is
// seeded on by the mock bridge.

test.describe("conversational wallet screenshots", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  async function openGeneral(page: import("@playwright/test").Page) {
    await installMockBridge(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("channel-general").click();
    await expect(page.getByTestId("chat-title")).toHaveText("general");
  }

  test("01 balance chip in top-right chrome", async ({ page }) => {
    await openGeneral(page);

    const chip = page.getByTestId("wallet-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("$214.50");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/01-balance-chip.png` });
  });

  test("02 fund panel with BIP-321 QR", async ({ page }) => {
    await openGeneral(page);

    await page.getByTestId("wallet-chip").click();
    await expect(page.getByTestId("wallet-fund-panel")).toBeVisible();
    await expect(page.getByTestId("wallet-fund-qr")).toBeVisible();
    await expect(page.getByTestId("wallet-provider-badge")).toHaveText("Lexe");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/02-fund-panel.png` });
  });

  test("03 typing a payment into the conversation", async ({ page }) => {
    await openGeneral(page);

    await page.getByTestId("message-input").fill("$20 @Mat lunch");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/03-payment-typed.png` });
  });

  test("04 confirmation before money moves", async ({ page }) => {
    await openGeneral(page);

    await page.getByTestId("message-input").fill("$20 @Mat lunch");
    await page.getByTestId("send-message").click();

    const dialog = page.getByTestId("payment-confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Send $20.00 to @Mat?");
    await expect(page.getByTestId("payment-confirm-balance")).toContainText(
      "$194.50",
    );

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/04-confirm-dialog.png` });
  });

  test("05 payment card in the timeline, balance deducted", async ({
    page,
  }) => {
    await openGeneral(page);

    await page.getByTestId("message-input").fill("$20 @Mat lunch");
    await page.getByTestId("send-message").click();
    await page.getByTestId("payment-confirm").click();

    await expect(page.getByTestId("message-payment-attachment")).toBeVisible();
    await expect(page.getByTestId("message-payment-attachment")).toContainText(
      "Sent $20.00 to @Mat",
    );
    await expect(page.getByTestId("wallet-chip")).toContainText("$194.50");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/05-payment-sent.png` });
  });

  test("06 cancel keeps the draft, sends nothing", async ({ page }) => {
    await openGeneral(page);

    await page.getByTestId("message-input").fill("$20 @Mat lunch");
    await page.getByTestId("send-message").click();
    await expect(page.getByTestId("payment-confirm-dialog")).toBeVisible();
    await page.getByTestId("payment-cancel").click();

    await expect(page.getByTestId("payment-confirm-dialog")).toHaveCount(0);
    await expect(page.getByTestId("message-input")).toHaveText(
      "$20 @Mat lunch",
    );
    await expect(page.getByTestId("wallet-chip")).toContainText("$214.50");
    await expect(page.getByTestId("message-payment-attachment")).toHaveCount(0);
  });
});
