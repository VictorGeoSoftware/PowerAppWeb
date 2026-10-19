import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * "Copiar precios de una propuesta" on Current Conditions (BmApp CopyProposalPricesSheet).
 * Job endpoints are mocked; auth and /user-data are real QA.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";

const proposal = (proposalTitle: string, power: number[], energy: number[], extraServices: number) => ({
  proposalTitle,
  powerTermItems: power,
  annualPowerTermCost: 300.5,
  consumedEnergyItems: energy,
  annualEnergyCost: 248.51,
  extraServices,
  iva: 115.39,
  electricalTax: 28.04,
  totalAnnualPrice: 900,
});

const PROPOSALS = [
  proposal("Barata Luz", [0.05, 0.04], [0.1, 0.09], 0),
  proposal("IBERDROLA PLAN ESTABLE", [0.0812345, 0.04], [0.13, 0.11], 12.5),
];

const report = (proposals: unknown[]) => ({
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
  proposals,
  iva: 21,
  impuestoElectrico: 5.11,
});

async function openForm(page: Page, proposals: unknown[]) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-copy", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-copy", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report(proposals) }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report(proposals) }));
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(page.getByText("Propuestas bloqueadas")).toBeVisible();
}

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const copyButton = (page: Page) => page.getByRole("button", { name: "Copiar precios de una propuesta" });

test("copies a proposal's prices into the form and unlocks the gate", async ({ page }) => {
  await openForm(page, PROPOSALS);
  await copyButton(page).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Copiar precios desde propuesta")).toBeVisible();
  await expect(sheet.getByRole("radio")).toHaveCount(2);
  await expect(sheet.getByRole("radio", { name: "Barata Luz" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("button", { name: "Cancelar" })).toBeInViewport();
  await expect(sheet.getByRole("button", { name: "Copiar", exact: true })).toBeInViewport();
  await expect(sheet).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `test-results/copy-from-proposal-sheet-${test.info().project.name}.png` });

  await sheet.getByRole("radio", { name: "IBERDROLA PLAN ESTABLE" }).click();
  await sheet.getByRole("button", { name: "Copiar", exact: true }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByRole("status").filter({ hasText: "Precios copiados desde IBERDROLA PLAN ESTABLE" })).toBeVisible();
  // Proposal items are mapped "%.6f" first, then copied as trimmed "%.8f"; matched by index.
  await expect(field(page, "Potencia P1")).toHaveValue("0.081235");
  await expect(field(page, "Potencia P2")).toHaveValue("0.04");
  await expect(field(page, "Energía P1")).toHaveValue("0.13");
  await expect(field(page, "Energía P3")).toHaveValue("0.11");
  await expect(field(page, "Importe total anual")).toHaveValue("12.50");
  await expect(page.getByText("4 de 5 campos completados")).toBeVisible();

  await field(page, "Comercializadora actual").fill("Endesa");
  await expect(page.getByText("Navegación desbloqueada")).toBeVisible();

  // Reopening keeps the previous selection; Cancelar changes nothing.
  await copyButton(page).click();
  await expect(sheet.getByRole("radio", { name: "IBERDROLA PLAN ESTABLE" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("radio", { name: "Barata Luz" }).click();
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(field(page, "Potencia P1")).toHaveValue("0.081235");

  await page.reload();
  await expect(page.getByText("Navegación desbloqueada")).toBeVisible({ timeout: 15_000 });
  await expect(field(page, "Potencia P1")).toHaveValue("0.081235");
  await expect(field(page, "Importe total anual")).toHaveValue("12.50");
});

test("without proposals the button does nothing", async ({ page }) => {
  await openForm(page, []);
  await copyButton(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(field(page, "Potencia P1")).toHaveValue("");
});
