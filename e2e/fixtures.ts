import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

/** Fixed browser device id so E2E runs don't bind the QA account to a new id each time. */
export const E2E_DEVICE_ID = process.env.E2E_DEVICE_ID ?? "web-e2e-playwright";

export const E2E_EMAIL = process.env.E2E_EMAIL;
export const E2E_PASSWORD = process.env.E2E_PASSWORD;
export const HAS_CREDENTIALS = Boolean(E2E_EMAIL && E2E_PASSWORD);

/**
 * Signed-in session saved once per browser project by `auth.setup.ts`
 * (gitignored). Reusing it keeps Firebase password sign-ins to a handful per
 * run instead of one per test (avoids `QUOTA_EXCEEDED`).
 */
export function authFile(projectName: string) {
  return path.join(__dirname, "..", "playwright", ".auth", `${projectName.replace(/^setup-/, "")}.json`);
}

export async function setDeviceId(context: BrowserContext, id: string) {
  await context.addInitScript((value) => window.localStorage.setItem("bm.deviceId", value), id);
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await setDeviceId(context, E2E_DEVICE_ID);
    await use(context);
  },
});

/** Call at file or describe level: tests start with the saved QA session. */
export function useSignedInSession() {
  test.skip(!HAS_CREDENTIALS, "Set E2E_EMAIL and E2E_PASSWORD (QA account) to run");
  test.use({
    storageState: async ({}, use, testInfo) => use(authFile(testInfo.project.name)),
  });
}

/** Opens the app with the restored session; the access check runs on load. */
export async function openSignedIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/fetch-consumption$/);
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
}

export { expect };
