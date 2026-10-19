import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Analytics screen tracking is off outside production: the standard E2E build leaves
 * NEXT_PUBLIC_ANALYTICS_ENABLED unset, so walking the screens must send no GA traffic.
 * Positive delivery is covered by unit tests and the manual Firebase DebugView check.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const GA = /google-analytics\.com|googletagmanager\.com/;

const report = {
  success: true,
  userData: { cups_code: CUPS, customer_details: null },
  consumptionData: {
    cups: CUPS,
    tarifa: "2.0TD",
    tarifaValue: "",
    annualConsumption: 2000,
    annualConsumptionP1: 1200,
    annualConsumptionP2: 800,
    annualConsumptionP3: 0,
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
  proposals: [
    {
      proposalTitle: "Barata Luz",
      powerTermItems: [0.08, 0.04],
      annualPowerTermCost: 300.5,
      consumedEnergyItems: [0.13, 0.11],
      annualEnergyCost: 248.51,
      extraServices: 0,
      iva: 115.39,
      electricalTax: 28.04,
      totalAnnualPrice: 700,
    },
  ],
  iva: 21,
  impuestoElectrico: 5.11269632,
};

async function mockStudy(page: Page) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-ga", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-ga", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/collected-prices", (route) => route.fulfill({ status: 201, json: { status: "Stored" } }));
  await page.route("**/api/bm/user-activity/**", (route) => route.fulfill({ status: 200, json: {} }));
}

test("no Google Analytics traffic while collection is disabled", async ({ page }) => {
  const gaRequests: string[] = [];
  page.on("request", (request) => {
    if (GA.test(request.url())) gaRequests.push(request.url());
  });
  await mockStudy(page);

  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  const field = (name: string) => page.getByRole("textbox", { name, exact: true });
  await field("Comercializadora actual").fill("Iberdrola");
  await field("Potencia P1").fill("0,1");
  await field("Potencia P2").fill("0,1");
  await field("Energía P1").fill("0,15");
  await field("Energía P2").fill("0,12");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.getByTestId("proposal-column")).toHaveCount(1);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Configuración", exact: true }).click();
  await expect(page).toHaveURL(/\/configuration$/);
  await page.waitForLoadState("networkidle");

  expect(gaRequests).toEqual([]);
});
