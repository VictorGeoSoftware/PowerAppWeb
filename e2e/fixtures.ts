import { test as base, type BrowserContext } from "@playwright/test";

/** Fixed browser device id so E2E runs don't bind the QA account to a new id each time. */
export const E2E_DEVICE_ID = process.env.E2E_DEVICE_ID ?? "web-e2e-playwright";

export async function setDeviceId(context: BrowserContext, id: string) {
  await context.addInitScript((value) => window.localStorage.setItem("bm.deviceId", value), id);
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await setDeviceId(context, E2E_DEVICE_ID);
    await use(context);
  },
});

export { expect } from "@playwright/test";
