import type { Page } from "@playwright/test";
import { expect, FETCH_HEADING, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * CUPS camera scanner, non-OCR paths. No real camera in CI: getUserMedia is forced to
 * reject so the manual fallback inside the scanner is exercised. Job endpoints mocked.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";

async function denyCamera(page: Page) {
  await page.addInitScript(() => {
    const deny = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    // Shadow the getter on the prototype: assigning on the instance doesn't stick in WebKit.
    Object.defineProperty(Navigator.prototype, "mediaDevices", { get: () => ({ getUserMedia: deny }), configurable: true });
  });
}

async function mockJobs(page: Page) {
  const submits: unknown[] = [];
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", async (route) => {
    submits.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { jobId: "job-e2e", status: "accepted" } });
  });
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-e2e", status: "PENDING" } }),
  );
  return submits;
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/camera-${name}-${test.info().project.name}.png`, fullPage: true });

test("denied camera: fallback message, manual CUPS confirm starts the study", async ({ page }) => {
  await denyCamera(page);
  const submits = await mockJobs(page);
  await openSignedIn(page);
  await page.getByRole("button", { name: /Escanear código CUPS/ }).click();
  const dialog = page.getByRole("dialog", { name: "Escanear CUPS" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/No podemos usar la cámara/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Reintentar cámara" })).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Confirmar" });
  await expect(confirm).toBeDisabled();
  await shot(page, "denied");
  await dialog.getByLabel("Escanea o introduce tu código CUPS").fill("es 0O31 6075 1570 7001 rc");
  await expect(dialog.getByText("Formato válido")).toBeVisible();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Consultando CUPS...").or(page.getByText("Esperando en la cola..."))).toBeVisible();
  await expect.poll(() => submits).toEqual([{ cupsCode: CUPS }]);
});

test("Volver closes the scanner with nothing submitted", async ({ page }) => {
  await denyCamera(page);
  const submits = await mockJobs(page);
  await openSignedIn(page);
  await page.getByRole("button", { name: /Escanear código CUPS/ }).click();
  const dialog = page.getByRole("dialog", { name: "Escanear CUPS" });
  await dialog.getByLabel("Escanea o introduce tu código CUPS").fill(CUPS);
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: FETCH_HEADING })).toBeVisible();
  expect(submits).toHaveLength(0);
});
