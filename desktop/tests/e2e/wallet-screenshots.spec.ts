import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { waitForAnimations } from "../helpers/animations";

const SHOTS = "test-results/wallet";

// Screenshot evidence for the Lightning wallet prototype: the top-chrome
// balance chip and each wallet panel view (overview, fund QR, send form).
// The `wallet` preview feature is seeded on by the mock bridge.

test.describe("wallet prototype screenshots", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  async function openApp(page: import("@playwright/test").Page) {
    await installMockBridge(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("channel-general").click();
    await expect(page.getByTestId("chat-title")).toHaveText("general");
  }

  test("01 balance chip in top-right chrome", async ({ page }) => {
    await openApp(page);

    const chip = page.getByTestId("wallet-balance-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("₿21,450");

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/01-balance-chip.png` });
  });

  test("02 wallet overview panel", async ({ page }) => {
    await openApp(page);

    await page.getByTestId("wallet-balance-chip").click();
    const panel = page.getByTestId("wallet-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("wallet-panel-balance")).toHaveText(
      "₿21,450",
    );
    await expect(page.getByTestId("wallet-provider-badge")).toHaveText("Lexe");
    await expect(page.getByTestId("wallet-tx-tx-01")).toBeVisible();

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/02-wallet-overview.png` });
  });

  test("03 seed phrase reveal", async ({ page }) => {
    await openApp(page);

    await page.getByTestId("wallet-balance-chip").click();
    await expect(page.getByTestId("wallet-seed-phrase")).toHaveCount(0);
    await page.getByTestId("wallet-seed-toggle").click();
    await expect(page.getByTestId("wallet-seed-phrase")).toBeVisible();

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/03-seed-reveal.png` });
  });

  test("04 fund wallet QR", async ({ page }) => {
    await openApp(page);

    await page.getByTestId("wallet-balance-chip").click();
    await page.getByTestId("wallet-fund-button").click();
    await expect(page.getByTestId("wallet-fund-qr")).toBeVisible();

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/04-fund-qr.png` });
  });

  test("05 send bitcoin form", async ({ page }) => {
    await openApp(page);

    await page.getByTestId("wallet-balance-chip").click();
    await page.getByTestId("wallet-send-button").click();

    const confirm = page.getByTestId("wallet-send-confirm");
    await expect(confirm).toBeDisabled();
    await page.getByTestId("wallet-send-destination").fill("lno1qgsq…example");
    await page.getByTestId("wallet-send-amount").fill("500");
    await expect(confirm).toBeEnabled();

    await waitForAnimations(page);
    await page.screenshot({ path: `${SHOTS}/05-send-form.png` });
  });
});
