import type { Page } from "@playwright/test";
import { E2E_DEVICE_ID, expect, test } from "./fixtures";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD (QA account) to run");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Correo electrónico").fill(email!);
  await page.getByPlaceholder("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByText(email!)).toBeVisible();
}

/** Simulates the Broker returning to the tab (visibility re-check). */
async function returnToTab(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("manual logout calls /auth/logout and keeps the device id", async ({ page }) => {
  await login(page);
  const logout = page.waitForRequest((r) => r.url().endsWith("/api/bm/auth/logout"));
  const logoutResponse = page.waitForResponse((r) => r.url().endsWith("/api/bm/auth/logout"));
  await page.getByRole("button", { name: "Cerrar sesión" }).click();

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
  await login(page);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("grant revoked mid-session: returning to the tab signs out with the backend message", async ({ page }) => {
  await page.clock.install();
  await login(page);

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
  await expect(page.getByText(email!)).toBeVisible();

  await page.clock.fastForward("01:05");
  await returnToTab(page);
  await expect(page.getByRole("alert").filter({ hasText: "autorizada" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(logoutCalls).toBe(0);
});
