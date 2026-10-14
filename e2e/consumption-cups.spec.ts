import type { Page } from "@playwright/test";
import { expect, FETCH_HEADING, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Consumption by typed CUPS. Auth and /user-data are real (QA); the job endpoints
 * are mocked because local Docker QA has no working n8n/Datadis (see risks doc).
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";

const report = {
  success: true,
  userData: { cups_code: CUPS, customer_details: null },
  consumptionData: {
    cups: CUPS,
    tarifa: "2.0TD",
    tarifaValue: "",
    annualConsumption: 2034,
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
    feeType: "2.0TD",
    fileName: "",
    processedAt: "",
  },
  proposals: [],
  iva: 21,
  impuestoElectrico: 5.11,
};

type Mock = {
  submitStatus?: number;
  /** Returned status per call; the last one repeats. */
  statuses?: readonly string[];
  statusCode?: number;
  resultCode?: number;
};

async function mockJobs(page: Page, { submitStatus = 202, statuses = ["COMPLETED"], statusCode = 200, resultCode = 200 }: Mock = {}) {
  const calls = { submit: [] as unknown[], status: 0, result: 0 };
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", async (route) => {
    calls.submit.push(route.request().postDataJSON());
    await route.fulfill({ status: submitStatus, json: submitStatus === 202 ? { jobId: "job-e2e", status: "accepted" } : { message: "x" } });
  });
  await page.route("**/api/bm/consumption-report-status/**", async (route) => {
    const status = statuses[Math.min(calls.status++, statuses.length - 1)];
    await route.fulfill({ status: statusCode, json: statusCode === 200 ? { jobId: "job-e2e", status } : { message: "Job not found" } });
  });
  await page.route("**/api/bm/consumption-report-result/**", async (route) => {
    calls.result++;
    await route.fulfill({ status: resultCode, json: resultCode === 200 ? report : { message: "Job not found" } });
  });
  return calls;
}

const cupsInput = (page: Page) => page.getByLabel("Introducir código CUPS");
const confirm = (page: Page) => page.getByRole("button", { name: "Confirmar" });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/consumption-${name}-${test.info().project.name}.png`, fullPage: true });

async function submitCups(page: Page, value = CUPS) {
  await cupsInput(page).fill(value);
  await confirm(page).click();
}

async function expectSummary(page: Page) {
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Consumo obtenido" })).toBeVisible();
  await expect(page.getByText(CUPS)).toBeVisible();
  await expect(page.getByText("P1 · 1.234 kWh")).toBeVisible();
  await expect(page.getByText("P3 · 800 kWh")).toBeVisible();
  await expect(page.getByText("P2 · 4,6 kW")).toBeVisible();
  await expect(page.getByText(/P2 · .* kWh/)).toHaveCount(0);
}

test("live validation and only the CUPS method", async ({ page }) => {
  await openSignedIn(page);
  await expect(page.getByRole("heading", { name: FETCH_HEADING })).toBeVisible();
  await expect(page.getByText("ELIGE UN MÉTODO")).toBeVisible();
  await expect(page.getByText(/PDF|Escanear/)).toHaveCount(0);
  await expect(page.getByText("Introduce el CUPS que aparece en la factura")).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await shot(page, "empty");

  await cupsInput(page).fill("ES0031607515707001RD");
  await expect(page.getByText("Formato no válido")).toBeVisible();
  await expect(cupsInput(page)).toHaveAttribute("aria-invalid", "true");
  await expect(confirm(page)).toBeDisabled();
  await shot(page, "invalid");

  await cupsInput(page).fill("es 0031 6075 1570 7001 rc");
  await expect(page.getByText("Formato válido")).toBeVisible();
  await expect(confirm(page)).toBeEnabled();
});

test("happy path: corrected CUPS submitted, steps shown, summary on current conditions", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING", "PROCESSING", "COMPLETED"] });
  await openSignedIn(page);
  await submitCups(page, "es 0O31 6075 1570 7001 rc");
  await expect(page.getByRole("heading", { name: "Obtener consumo" })).toBeVisible();
  await expect(page.getByText("Consultando CUPS...").or(page.getByText("Esperando en la cola..."))).toBeVisible();
  await expect(page.getByText("Analizando tu factura...")).toBeVisible({ timeout: 10_000 });
  await shot(page, "running");
  await expectSummary(page);
  expect(calls.submit).toEqual([{ cupsCode: CUPS }]);
  await shot(page, "summary");
});

for (const [name, mock, message] of [
  ["job failed", { statuses: ["FAILED"] }, "El procesamiento ha fallado. Inténtalo de nuevo."],
  ["submit rejected", { submitStatus: 400 }, "No se pudo iniciar el estudio. Inténtalo de nuevo."],
  ["job lost (status 404)", { statusCode: 404 }, "No se pudo comprobar el estado del estudio."],
  ["result error", { resultCode: 500 }, "No se pudieron obtener los resultados del estudio."],
] as const) {
  test(`${name} shows the error and keeps the CUPS`, async ({ page }) => {
    await mockJobs(page, mock);
    await openSignedIn(page);
    await submitCups(page);
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible({ timeout: 10_000 });
    await expect(cupsInput(page)).toHaveValue(CUPS);
    expect(await page.evaluate(() => sessionStorage.getItem("bm.activeJob"))).toBeNull();
    if (name === "job failed") await shot(page, "error");
  });
}

test("reload mid-poll resumes the same job without a new submit", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await submitCups(page);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  const active = await page.evaluate(() => JSON.parse(sessionStorage.getItem("bm.activeJob") ?? "null"));
  expect(active).toMatchObject({ jobId: "job-e2e", cups: CUPS });

  await page.unrouteAll({ behavior: "wait" });
  const after = await mockJobs(page, { statuses: ["COMPLETED"] });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Obtener consumo" })).toBeVisible();
  await expectSummary(page);
  expect(after.submit).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem("bm.activeJob"))).toBeNull();
});

test("a study completed < 1 h ago is restored on reload; an old one is not", async ({ page }) => {
  const calls = await mockJobs(page);
  await openSignedIn(page);
  await page.evaluate(() =>
    localStorage.setItem("bm.lastCompletedJobId", JSON.stringify({ jobId: "job-e2e", savedAt: Date.now() - 2 * 60 * 60 * 1000 })),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: FETCH_HEADING })).toBeVisible();
  expect(calls.result).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("bm.lastCompletedJobId"))).toBeNull();

  await page.evaluate(() =>
    localStorage.setItem("bm.lastCompletedJobId", JSON.stringify({ jobId: "job-e2e", savedAt: Date.now() })),
  );
  await page.reload();
  await expectSummary(page);
  expect(calls.submit).toHaveLength(0);
});

test("a restored id whose job is gone (404) is cleared", async ({ page }) => {
  await mockJobs(page, { resultCode: 404 });
  await openSignedIn(page);
  await page.evaluate(() =>
    localStorage.setItem("bm.lastCompletedJobId", JSON.stringify({ jobId: "job-e2e", savedAt: Date.now() })),
  );
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bm.lastCompletedJobId"))).toBeNull();
  await expect(page).toHaveURL(/\/fetch-consumption$/);
  await expect(confirm(page)).toBeVisible();
});

test("Nuevo estudio after a completed study returns to an empty form and clears both keys", async ({ page }) => {
  await mockJobs(page);
  await openSignedIn(page);
  await submitCups(page);
  await expectSummary(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Nuevo estudio de propuestas" }).click();
  await expect(page).toHaveURL(/\/fetch-consumption$/);
  await expect(cupsInput(page)).toHaveValue("");
  const keys = await page.evaluate(() => [localStorage.getItem("bm.lastCompletedJobId"), sessionStorage.getItem("bm.activeJob")]);
  expect(keys).toEqual([null, null]);
});

test("logout while polling stops the job and clears it", async ({ page }) => {
  const calls = await mockJobs(page, { statuses: ["PENDING"] });
  await openSignedIn(page);
  await submitCups(page);
  await expect.poll(() => calls.status, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("bm.activeJob"))).toBeNull();
  const seen = calls.status;
  await page.waitForTimeout(4_000);
  expect(calls.status).toBe(seen);
});
