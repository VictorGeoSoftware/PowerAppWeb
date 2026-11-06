import type { Page } from "@playwright/test";
import { authFile, expect, test, useSignedInSession } from "./fixtures";

useSignedInSession();

/** Opens the app with the saved session: the backend access check runs on load. */
async function openApp(page: Page) {
  await page.goto("/");
}

test("granted broker passes the real backend access check", async ({ page }) => {
  const sync = page.waitForResponse((r) => r.url().endsWith("/api/bm/user-data"));
  await openApp(page);
  expect((await sync).status()).toBe(200);
  await expect(page).toHaveURL(/\/fetch-consumption$/);
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
});

test("backend 403 signs out and shows the backend message on login", async ({ page }) => {
  await page.route("**/api/bm/user-data", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Esta cuenta no está autorizada para acceder a la aplicación." }),
    }),
  );
  await openApp(page);
  await expect(page.getByRole("alert").filter({ hasText: "autorizada" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // Session was signed out: protected page bounces back to login.
  await page.unroute("**/api/bm/user-data");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("backend unavailable shows retry screen, retry recovers", async ({ page }) => {
  let fail = true;
  await page.route("**/api/bm/user-data", (route) =>
    fail
      ? route.fulfill({ status: 502, contentType: "application/json", body: '{"message":"Backend unavailable"}' })
      : route.continue(),
  );
  await openApp(page);
  await expect(page.getByRole("alert").filter({ hasText: "verificar" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
});

test("same account is accepted from a second browser (no device binding)", async ({ page, browser }, testInfo) => {
  const sync = page.waitForRequest((r) => r.url().endsWith("/api/bm/user-data"));
  await openApp(page);
  expect((await sync).postDataJSON()).not.toHaveProperty("phoneUuid");
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();

  // Same saved Firebase session in a separate browser context: must also pass.
  const other = await browser.newContext({ storageState: authFile(testInfo.project.name) });
  const pageB = await other.newPage();
  const syncB = pageB.waitForResponse((r) => r.url().endsWith("/api/bm/user-data"));
  await openApp(pageB);
  expect((await syncB).status()).toBe(200);
  await expect(pageB.getByRole("button", { name: "Abrir menú" })).toBeVisible();
  await other.close();
});
