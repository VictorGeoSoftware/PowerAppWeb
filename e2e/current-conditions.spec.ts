import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Current Conditions form (BmApp CurrentUserConditions). Job endpoints are mocked like
 * consumption-cups.spec.ts; auth and /user-data are real QA.
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

async function mockJobs(page: Page) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-e2e", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-e2e", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report }));
}

async function openForm(page: Page) {
  await mockJobs(page);
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(page.getByText("Propuestas bloqueadas")).toBeVisible();
}

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const cta = (page: Page) => page.getByRole("button", { name: "Ir a las propuestas de precios" });
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/conditions-${name}-${test.info().project.name}.png`, fullPage: true });

async function fillAll(page: Page) {
  await field(page, "Comercializadora actual").fill("Endesa");
  for (const p of ["P1", "P2"]) await field(page, `Potencia ${p}`).fill("0,1");
  for (const p of ["P1", "P3"]) await field(page, `Energía ${p}`).fill("0.2");
}

test("fills the form, unlocks Propuestas, re-locks on zero and survives a reload", async ({ page }) => {
  await openForm(page);
  // Report has power P1-P2 and energy P1, P3 (zeros dropped): 4 prices + supplier.
  await expect(page.getByText("0 de 5 campos completados")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Potencia P\d$/ })).toHaveCount(2);
  await expect(page.getByRole("textbox", { name: /^Energía P\d$/ })).toHaveCount(2);
  await expect(field(page, "Potencia P1")).toHaveAttribute("inputmode", "decimal");
  const fontSize = await field(page, "Potencia P1").evaluate((el) => getComputedStyle(el).fontSize);
  expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
  await expect(cta(page)).toHaveCount(0);
  await shot(page, "locked");

  // Invalid keystrokes are ignored (BmApp regex).
  await field(page, "Potencia P1").pressSequentially("0,1a");
  await expect(field(page, "Potencia P1")).toHaveValue("0,1");

  await fillAll(page);
  await field(page, "Importe total anual").fill("15,50");
  await expect(page.getByText("Navegación desbloqueada")).toBeVisible();
  await expect(page.getByText("5 de 5 campos completados")).toBeVisible();
  await expect(cta(page)).toBeVisible();
  await shot(page, "unlocked");

  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Propuestas" })).toBeVisible();
  await page.keyboard.press("Escape");

  await field(page, "Energía P3").fill("0");
  await expect(page.getByText("Propuestas bloqueadas")).toBeVisible();
  await expect(cta(page)).toHaveCount(0);
  await field(page, "Energía P3").fill("0,2");

  await field(page, "Titular").fill("Cliente editado");
  await page.reload();
  await expect(page.getByText("Navegación desbloqueada")).toBeVisible({ timeout: 15_000 });
  await expect(field(page, "Comercializadora actual")).toHaveValue("Endesa");
  await expect(field(page, "Potencia P2")).toHaveValue("0,1");
  await expect(field(page, "Importe total anual")).toHaveValue("15,50");
  // Customer data persists across reload (commit 54c5c96).
  await expect(field(page, "Titular")).toHaveValue("Cliente editado");

  await cta(page).click();
  await expect(page).toHaveURL(/\/proposals$/);
});
