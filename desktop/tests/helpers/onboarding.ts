import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const E2E_IDENTITY_OVERRIDE_STORAGE_KEY =
  "buzz:e2e-identity-override.v1";

export async function seedActiveIdentity(
  page: Page,
  identity: { privateKey: string; pubkey: string; username: string },
) {
  await page.addInitScript(
    ({ identity: nextIdentity, storageKey }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(nextIdentity));
    },
    { identity, storageKey: E2E_IDENTITY_OVERRIDE_STORAGE_KEY },
  );
}

/** Navigate through the backup step (fresh-key path, encrypted default). */
export async function passThroughBackupStep(page: Page) {
  await expect(page.getByTestId("onboarding-page-backup")).toBeVisible();
  // Encrypted-by-default: create the backup with the generated passphrase,
  // then advance. (The raw key path is behind "Show raw key instead".)
  await expect(page.getByTestId("backup-passphrase-generated")).toBeVisible();
  await page.getByTestId("encrypted-backup-create").click();
  await expect(page.getByTestId("ncryptsec-value")).toBeVisible();
  await page.getByTestId("onboarding-next").click();
}
