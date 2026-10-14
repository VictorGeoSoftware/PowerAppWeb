import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Consumption by PDF bill upload. Auth and /user-data are real (QA); the job
 * endpoints are mocked. Uses a tiny in-memory PDF — never real bills.
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

type Mock = { submitStatus?: number; statuses?: readonly string[]; statusCode?: number; resultCode?: number; submitDelayMs?: number };
type Upload = { contentType: string; body: string };

async function mockJobs(
  page: Page,
  { submitStatus = 202, statuses = ["COMPLETED"], statusCode = 200, resultCode = 200, submitDelayMs = 0 }: Mock = {},
) {
  const calls = { submit: [] as Upload[], status: 0, result: 0 };
  await page.route("**/api/bm/fetch-user-consumption-report", async (route) => {
    const req = route.request();
    calls.submit.push({ contentType: (await req.headerValue("content-type")) ?? "", body: req.postDataBuffer()?.toString("latin1") ?? "" });
    if (submitDelayMs) await new Promise((r) => setTimeout(r, submitDelayMs));
    await route.fulfill({ status: submitStatus, json: submitStatus === 202 ? { jobId: "job-pdf", status: "accepted" } : { message: "x" } });
  });
  await page.route("**/api/bm/consumption-report-status/**", async (route) => {
    const status = statuses[Math.min(calls.status++, statuses.length - 1)];
    await route.fulfill({ status: statusCode, json: statusCode === 200 ? { jobId: "job-pdf", status } : { message: "Job not found" } });
  });
  await page.route("**/api/bm/consumption-report-result/**", async (route) => {
    calls.result++;
    await route.fulfill({ status: resultCode, json: resultCode === 200 ? report : { message: "Job not found" } });
  });
  return calls;
}

const fileInput = (page: Page) => page.getByLabel("Subir factura PDF");
const cupsInput = (page: Page) => page.getByLabel("Introducir código CUPS");
const activeJob = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("bm.activeJob") ?? "null"));
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/consumption-pdf-${name}-${test.info().project.name}.png`, fullPage: true });

async function expectSummary(page: Page) {
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Consumo obtenido" })).toBeVisible();
  await expect(page.getByText(CUPS)).toBeVisible();
}

test("PDF option is visible, labelled and accepts PDFs", async ({ page }) => {
  await openSignedIn(page);
  const row = page.locator("label").filter({ hasText: "Subir factura PDF" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Extraemos los datos automáticamente");
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(fileInput(page)).toHaveAttribute("accept", /application\/pdf/);
  if (test.info().project.name.includes("chromium")) {
    // WebKit's default Tab order skips non-text controls (Safari setting), so check it on Chromium.
    await cupsInput(page).focus();
    await page.keyboard.press("Tab"); // Confirmar is disabled → skipped
    await expect(fileInput(page)).toBeFocused();
  } else {
    await fileInput(page).focus();
    await expect(fileInput(page)).toBeFocused();
  }
  await shot(page, "methods");
});

test("happy path: multipart upload, steps, summary", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING", "PROCESSING", "COMPLETED"], submitDelayMs: 800 });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PDF);
  await expect(page.getByRole("heading", { name: "Obtener consumo" })).toBeVisible();
  await expect(page.getByText("Subiendo factura...")).toBeVisible();
  await shot(page, "uploading");
  await expect(page.getByText("Analizando tu factura...")).toBeVisible({ timeout: 10_000 });
  await expectSummary(page);
  expect(calls.submit).toHaveLength(1);
  expect(calls.submit[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
  expect(calls.submit[0].body).toMatch(/name="file"; filename="factura\.pdf"/);
  // WebKit does not expose file bytes of multipart bodies to Playwright routes.
  if (test.info().project.name.includes("chromium")) expect(calls.submit[0].body).toContain("%PDF-1.4");
});

for (const [name, file, message] of [
  ["not a PDF", { name: "foto.png", mimeType: "image/png", buffer: Buffer.from("png") }, "Selecciona un archivo PDF."],
  ["too large", "big.pdf", "El archivo supera el tamaño máximo de 50 MB."],
] as const) {
  test(`${name}: local alert, no request`, async ({ page }) => {
    const calls = await mockJobs(page);
    await openSignedIn(page);
    if (typeof file === "string") {
      // Playwright refuses in-memory buffers over 50 MB: write a temp file.
      const big = test.info().outputPath(file);
      await writeFile(big, Buffer.alloc(50 * 1024 * 1024 + 1));
      await fileInput(page).setInputFiles(big);
    } else {
      await fileInput(page).setInputFiles(file);
    }
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    expect(calls.submit).toHaveLength(0);
    await expect(cupsInput(page)).toBeEditable();
    if (name === "not a PDF") await shot(page, "file-error");
  });
}

for (const [name, mock, message] of [
  ["submit rejected", { submitStatus: 400 }, "No se pudo iniciar el estudio. Inténtalo de nuevo."],
  ["job failed", { statuses: ["FAILED"] }, "El procesamiento ha fallado. Inténtalo de nuevo."],
  ["job lost (status 404)", { statusCode: 404 }, "No se pudo comprobar el estado del estudio."],
  ["result error", { resultCode: 500 }, "No se pudieron obtener los resultados del estudio."],
] as const) {
  test(`${name} shows the error with an empty CUPS field`, async ({ page }) => {
    await mockJobs(page, mock);
    await openSignedIn(page);
    await fileInput(page).setInputFiles(PDF);
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible({ timeout: 10_000 });
    await expect(cupsInput(page)).toHaveValue("");
    expect(await activeJob(page)).toBeNull();
    if (name === "job failed") await shot(page, "error");
  });
}

test("reload mid-poll resumes the PDF job without re-uploading", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PDF);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await activeJob(page)).toMatchObject({ jobId: "job-pdf", source: "pdf" });

  await page.unrouteAll({ behavior: "wait" });
  const after = await mockJobs(page, { statuses: ["COMPLETED"] });
  await page.reload();
  await expectSummary(page);
  expect(after.submit).toHaveLength(0);
  expect(await activeJob(page)).toBeNull();
});

test("Nuevo estudio during a PDF job stops polling and clears both keys", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PDF);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nuevo estudio de propuestas" }).click();
  await expect(cupsInput(page)).toHaveValue("");
  const keys = await page.evaluate(() => [localStorage.getItem("bm.lastCompletedJobId"), sessionStorage.getItem("bm.activeJob")]);
  expect(keys).toEqual([null, null]);
  const seen = calls.status;
  await page.waitForTimeout(4_000);
  expect(calls.status).toBe(seen);
});

test("logout during a PDF job stops polling and clears it", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PDF);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await activeJob(page)).toBeNull();
  const seen = calls.status;
  await page.waitForTimeout(4_000);
  expect(calls.status).toBe(seen);
});
