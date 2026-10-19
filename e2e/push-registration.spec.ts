import type { Page, Request } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Web Push token registration. FCM is replaced by the `window.__bmPushTestToken` seam
 * (builds with NEXT_PUBLIC_E2E=1); `push/web-tokens` is recorded and fulfilled with 200.
 */
useSignedInSession();

const TOKEN = "e2e-fcm-token-0123456789";

async function recordPushCalls(page: Page) {
  const calls: { method: string; body: unknown; at: number }[] = [];
  let seq = 0;
  await page.route("**/api/bm/push/web-tokens", async (route) => {
    const req: Request = route.request();
    calls.push({ method: req.method(), body: req.postDataJSON(), at: seq++ });
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });
  });
  const logouts: number[] = [];
  await page.route("**/api/bm/auth/logout", async (route) => {
    logouts.push(seq++);
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return { calls, logouts };
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Abrir menú" }).click();
  return page.getByRole("dialog");
}

test("granted: start-up registration, no re-post on reload, and DELETE on logout before auth/logout", async ({ page, context }) => {
  // Headless Chromium reports "denied" even after grantPermissions: stub the granted state.
  await context.addInitScript((t) => {
    (window as unknown as { __bmPushTestToken: string }).__bmPushTestToken = t;
    Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
  }, TOKEN);
  // Permission is pre-granted, so the start-up refresh registers the token by itself.
  const { calls, logouts } = await recordPushCalls(page);

  await openSignedIn(page);
  // The silent refresh posts once (granted permission, nothing stored yet).
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toMatchObject({ method: "POST", body: { token: TOKEN, platform: "android" } });
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("bm.pushToken")))!)).toMatchObject({ token: TOKEN });

  const menu = await openMenu(page);
  await expect(menu.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Activar notificaciones" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(calls).toHaveLength(1);

  await (await openMenu(page)).getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ method: "DELETE", body: { token: TOKEN } });
  expect(logouts).toHaveLength(1);
  expect(calls[1].at).toBeLessThan(logouts[0]);
  expect(await page.evaluate(() => localStorage.getItem("bm.pushToken"))).toBeNull();
});

test("tap on the card asks permission and registers", async ({ page, context }) => {
  await context.addInitScript((t) => {
    (window as unknown as { __bmPushTestToken: string }).__bmPushTestToken = t;
    // Permission starts at "default"; the tap grants it (as the browser prompt would).
    let permission: NotificationPermission = "default";
    Object.defineProperty(Notification, "permission", { get: () => permission, configurable: true });
    Notification.requestPermission = async () => {
      (window as unknown as { __prompted: number }).__prompted = 1;
      permission = "granted";
      return permission;
    };
  }, TOKEN);
  const { calls } = await recordPushCalls(page);

  await openSignedIn(page);
  const card = page.getByRole("region", { name: /Activa las notificaciones/ });
  await expect(card).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBeUndefined();
  expect(calls).toHaveLength(0);

  await card.getByRole("button", { name: "Activar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Notificaciones activadas" })).toBeVisible();
  expect(calls).toEqual([expect.objectContaining({ method: "POST", body: { token: TOKEN, platform: "android" } })]);
  await expect(card).toHaveCount(0);
  await expect((await openMenu(page)).getByRole("button", { name: "Activar notificaciones" })).toHaveCount(0);
});

test("denied permission shows the disabled row", async ({ page, context }) => {
  await context.addInitScript((t) => {
    (window as unknown as { __bmPushTestToken: string }).__bmPushTestToken = t;
    Object.defineProperty(Notification, "permission", { get: () => "denied", configurable: true });
  }, TOKEN);
  const { calls } = await recordPushCalls(page);

  await openSignedIn(page);
  const menu = await openMenu(page);
  await expect(menu.getByText("Notificaciones bloqueadas")).toBeVisible();
  await expect(menu.getByText("Actívalas en los ajustes del navegador")).toBeVisible();
  await expect(menu.getByRole("button", { name: "Activar notificaciones" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Activa las notificaciones/ })).toHaveCount(0);
  expect(calls).toHaveLength(0);
});
