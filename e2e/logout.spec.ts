import type { Page } from "@playwright/test";
import { E2E_DEVICE_ID, expect, openSignedIn, test, useSignedInSession } from "./fixtures";

useSignedInSession();

async function logoutFromMenu(page: Page) {
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar sesión" }).click();
}

/** Simulates the Broker returning to the tab (visibility re-check). */
async function returnToTab(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("manual logout calls /auth/logout and keeps the device id", async ({ page }) => {
  await openSignedIn(page);
  const logout = page.waitForRequest((r) => r.url().endsWith("/api/bm/auth/logout"));
  const logoutResponse = page.waitForResponse((r) => r.url().endsWith("/api/bm/auth/logout"));
  await logoutFromMenu(page);

  const request = await logout;
  expect(request.method()).toBe("POST");
  expect(request.headers()["authorization"]).toMatch(/^Bearer .+/);
  expect((await logoutResponse).status()).toBe(200);

  await expect(page).toHaveURL(/\/login$/);
  // Scoped to <main>: Next.js adds an empty route-announcer alert to the body.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("bm.deviceId"))).toBe(E2E_DEVICE_ID);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("logout still signs out when the backend fails", async ({ page }) => {
  await page.route("**/api/bm/auth/logout", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' }),
  );
  await openSignedIn(page);
  await logoutFromMenu(page);
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("grant revoked mid-session: returning to the tab signs out with the backend message", async ({ page }) => {
  await page.clock.install();
  await openSignedIn(page);

  let logoutCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/bm/auth/logout")) logoutCalls++;
  });
  await page.route("**/api/bm/user-data", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Esta cuenta no está autorizada para acceder a la aplicación." }),
    }),
  );

  // Within the throttle window nothing happens.
  await returnToTab(page);
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();

  await page.clock.fastForward("01:05");
  await returnToTab(page);
  await expect(page.getByRole("alert").filter({ hasText: "autorizada" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutCalls).toBe(0);
});
