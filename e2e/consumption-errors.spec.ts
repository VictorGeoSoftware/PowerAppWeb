import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Study retry and refresh. Auth and /user-data are real (QA); the job and refresh
 * endpoints are mocked (local QA has no deterministic failing job).
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const PDF = { name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") };

const report = {
  success: true,
  userData: { cups_code: CUPS, customer_details: null },
  consumptionData: {
    cups: CUPS,
    feeType: "2.0TD",
    annualConsumptionP1: 1234.7,
    annualConsumptionP2: 0,
    annualConsumptionP3: 800,
    annualConsumptionP4: 0,
    annualConsumptionP5: 0,
    annualConsumptionP6: 0,
    subscribedPowerP1: 4.6,
    subscribedPowerP2: 4.6,
    subscribedPowerP3: 0,
    subscribedPowerP4: 0,
    subscribedPowerP5: 0,
    subscribedPowerP6: 0,
  },
  proposals: [],
  iva: 21,
  impuestoElectrico: 5.11,
};

type Mock = {
  /** Per submit call; the last one repeats. */
  submitStatuses?: readonly number[];
  /** Per status call; the last one repeats. */
  statuses?: readonly string[];
  refreshCode?: number;
};

async function mockJobs(page: Page, { submitStatuses = [202], statuses = ["COMPLETED"], refreshCode = 200 }: Mock = {}) {
  const calls = { cups: [] as unknown[], pdf: [] as string[], status: 0, result: 0, refresh: [] as string[] };
  const submit = () => submitStatuses[Math.min(calls.cups.length + calls.pdf.length - 1, submitStatuses.length - 1)];
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", async (route) => {
    calls.cups.push(route.request().postDataJSON());
    const code = submit();
    await route.fulfill({ status: code, json: code === 202 ? { jobId: "job-e2e", status: "accepted" } : { message: "x" } });
  });
  await page.route("**/api/bm/fetch-user-consumption-report", async (route) => {
    calls.pdf.push(route.request().postDataBuffer()?.toString("latin1") ?? "");
    const code = submit();
    await route.fulfill({ status: code, json: code === 202 ? { jobId: "job-e2e", status: "accepted" } : { message: "x" } });
  });
  await page.route("**/api/bm/consumption-report-status/**", async (route) => {
    const status = statuses[Math.min(calls.status++, statuses.length - 1)];
    await route.fulfill({ json: { jobId: "job-e2e", status } });
  });
  await page.route("**/api/bm/consumption-report-result/**", async (route) => {
    calls.result++;
    await route.fulfill({ json: report });
  });
  await page.route("**/api/bm/consumption-report-refresh/**", async (route) => {
    calls.refresh.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: refreshCode, json: refreshCode === 200 ? { ...report, iva: 10 } : { message: "x" } });
  });
  return calls;
}

const cupsInput = (page: Page) => page.getByLabel("Introducir código CUPS");
const fileInput = (page: Page) => page.getByLabel("Subir factura PDF");
const retry = (page: Page) => page.getByRole("button", { name: "Reintentar" });
const lastId = (page: Page) => page.evaluate(() => localStorage.getItem("bm.lastCompletedJobId"));
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/consumption-errors-${name}-${test.info().project.name}.png`, fullPage: true });

async function seedLastCompleted(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem("bm.lastCompletedJobId", JSON.stringify({ jobId: "job-e2e", savedAt: Date.now() })),
  );
  await page.reload();
}

test("failed CUPS study shows Reintentar; it submits a new job and reaches current conditions", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["FAILED", "COMPLETED"] });
  await openSignedIn(page);
  await cupsInput(page).fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "El procesamiento ha fallado. Inténtalo de nuevo." });
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert.getByRole("button", { name: "Reintentar" })).toBeVisible();
  const box = await retry(page).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await shot(page, "retry");

  await retry(page).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  expect(calls.cups).toEqual([{ cupsCode: CUPS }, { cupsCode: CUPS }]);
  expect(calls.refresh).toHaveLength(0);
});

test("failed PDF upload retries with the same file without opening the picker", async ({ page }) => {
  const calls = await mockJobs(page, { submitStatuses: [500, 202] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PDF);
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo iniciar el estudio. Inténtalo de nuevo." })).toBeVisible({
    timeout: 10_000,
  });
  await retry(page).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  expect(calls.pdf).toHaveLength(2);
  for (const body of calls.pdf) expect(body).toContain('filename="factura.pdf"');
});

test("a local file error shows no Reintentar", async ({ page }) => {
  await mockJobs(page);
  await openSignedIn(page);
  await fileInput(page).setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("png") });
  await expect(page.getByRole("alert").filter({ hasText: "Selecciona un archivo PDF." })).toBeVisible();
  await expect(retry(page)).toHaveCount(0);
});

test("restoring a recent study refreshes it once", async ({ page }) => {
  const calls = await mockJobs(page);
  await openSignedIn(page);
  await seedLastCompleted(page);
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect.poll(() => calls.refresh).toEqual(["POST /api/bm/consumption-report-refresh/job-e2e"]);
  await page.waitForTimeout(1_000);
  expect(calls.refresh).toHaveLength(1);
  expect(JSON.parse((await lastId(page))!).jobId).toBe("job-e2e");
});

test("refresh 404 clears the stored id and keeps the screen", async ({ page }) => {
  const calls = await mockJobs(page, { refreshCode: 404 });
  await openSignedIn(page);
  await seedLastCompleted(page);
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect.poll(() => calls.refresh.length).toBe(1);
  await expect.poll(() => lastId(page)).toBeNull();
  await expect(page).toHaveURL(/\/current-conditions$/);
  await expect(page.getByRole("heading", { name: "Consumo obtenido" })).toBeVisible();
});
