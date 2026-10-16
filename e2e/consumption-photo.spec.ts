import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Consumption by bill photo (web-only method). Auth and /user-data are real (QA); the job
 * endpoints are mocked. Uses a tiny in-memory image — never real bills.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const PHOTO = { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x4a, 0x46, 0x49, 0x46]) };
const PNG_NONAME = { name: "image", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };

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
    await route.fulfill({ status: submitStatus, json: submitStatus === 202 ? { jobId: "job-photo", status: "accepted" } : { message: "x" } });
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

const fileInput = (page: Page) => page.getByLabel("Foto de la factura");
const cupsInput = (page: Page) => page.getByLabel("Introducir código CUPS");
const activeJob = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("bm.activeJob") ?? "null"));
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/consumption-photo-${name}-${test.info().project.name}.png`, fullPage: true });

async function expectSummary(page: Page) {
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Consumo obtenido" })).toBeVisible();
  await expect(page.getByText(CUPS)).toBeVisible();
}

test("photo option is visible, labelled and accepts JPEG/PNG without capture", async ({ page }) => {
  await openSignedIn(page);
  const row = page.locator("label").filter({ hasText: "Foto de la factura" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Haz una foto o elige una imagen");
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(fileInput(page)).toHaveAttribute("accept", "image/jpeg,image/png");
  await expect(fileInput(page)).not.toHaveAttribute("capture");
  if (test.info().project.name.includes("chromium")) {
    // WebKit's default Tab order skips non-text controls (Safari setting), so check it on Chromium.
    await cupsInput(page).focus();
    await page.keyboard.press("Tab"); // Confirmar is disabled → skipped
    await page.keyboard.press("Tab"); // "Escanear código CUPS" row
    await page.keyboard.press("Tab"); // PDF row
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
  await fileInput(page).setInputFiles(PHOTO);
  await expect(page.getByRole("heading", { name: "Obtener consumo" })).toBeVisible();
  await expect(page.getByText("Subiendo factura...")).toBeVisible();
  await shot(page, "uploading");
  await expect(page.getByText("Analizando tu factura...")).toBeVisible({ timeout: 10_000 });
  await expectSummary(page);
  expect(calls.submit).toHaveLength(1);
  expect(calls.submit[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
  expect(calls.submit[0].body).toMatch(/name="file"; filename="IMG_0001\.jpg"/);
  // WebKit does not expose file bytes of multipart bodies to Playwright routes.
  if (test.info().project.name.includes("chromium")) expect(calls.submit[0].body).toContain("JFIF");
});

for (const [name, file, message] of [
  ["HEIC", { name: "factura.heic", mimeType: "image/heic", buffer: Buffer.from("heic") }, "Selecciona una foto JPG o PNG."],
  ["PDF", { name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }, "Selecciona una foto JPG o PNG."],
  ["too large", "big.jpg", "El archivo supera el tamaño máximo de 50 MB."],
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
    await expect(page.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
    if (name === "HEIC") await shot(page, "file-error");
  });
}

for (const [name, mock, message] of [
  ["submit rejected (Invalid image file)", { submitStatus: 400 }, "No se pudo iniciar el estudio. Inténtalo de nuevo."],
  ["job failed", { statuses: ["FAILED"] }, "El procesamiento ha fallado. Inténtalo de nuevo."],
  ["job lost (status 404)", { statusCode: 404 }, "No se pudo comprobar el estado del estudio."],
  ["result error", { resultCode: 500 }, "No se pudieron obtener los resultados del estudio."],
] as const) {
  test(`${name} shows the error with an empty CUPS field`, async ({ page }) => {
    await mockJobs(page, mock);
    await openSignedIn(page);
    await fileInput(page).setInputFiles(PHOTO);
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible({ timeout: 10_000 });
    await expect(cupsInput(page)).toHaveValue("");
    expect(await activeJob(page)).toBeNull();
    if (name === "job failed") await shot(page, "error");
  });
}

test("PNG without extension is sent as factura.png", async ({ page }) => {
  const calls = await mockJobs(page);
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PNG_NONAME);
  await expectSummary(page);
  expect(calls.submit[0].body).toMatch(/name="file"; filename="factura\.png"/);
});

test("Reintentar re-uploads the same photo without the picker", async ({ page }) => {
  const calls = await mockJobs(page, { submitStatus: 500 });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PHOTO);
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo iniciar el estudio" })).toBeVisible({ timeout: 10_000 });
  await page.unrouteAll({ behavior: "wait" });
  const after = await mockJobs(page);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expectSummary(page);
  expect(calls.submit).toHaveLength(1);
  expect(after.submit).toHaveLength(1);
  expect(after.submit[0].body).toMatch(/filename="IMG_0001\.jpg"/);
});

test("reload mid-poll resumes the photo job without re-uploading", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PHOTO);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await activeJob(page)).toMatchObject({ jobId: "job-photo", source: "photo" });

  await page.unrouteAll({ behavior: "wait" });
  const after = await mockJobs(page, { statuses: ["COMPLETED"] });
  await page.reload();
  await expectSummary(page);
  expect(after.submit).toHaveLength(0);
  expect(await activeJob(page)).toBeNull();
});

test("Nuevo estudio during a photo job stops polling and clears both keys", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PHOTO);
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

test("logout during a photo job stops polling and clears it", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await fileInput(page).setInputFiles(PHOTO);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await activeJob(page)).toBeNull();
  const seen = calls.status;
  await page.waitForTimeout(4_000);
  expect(calls.status).toBe(seen);
});
