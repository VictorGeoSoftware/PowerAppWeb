import type { Page } from "@playwright/test";
import { calculateComparatorSummary } from "../src/lib/comparator/calculate";
import { formatFixedHalfUp } from "../src/lib/comparator/rounding";
import { toConsumptionSession, type ConsumptionReportResponse } from "../src/lib/consumption/report";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Proposals comparator (BmApp ProposalsScreen). Job endpoints and POST /collected-prices are
 * mocked; expected numbers come from the ported calculator (golden-tested against BmApp).
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";

const proposal = (proposalTitle: string, totalAnnualPrice: number) => ({
  proposalTitle,
  powerTermItems: [0.081234, 0.04],
  annualPowerTermCost: 300.5,
  consumedEnergyItems: [0.13, 0.11],
  annualEnergyCost: 248.51,
  extraServices: 0,
  iva: 115.39,
  electricalTax: 28.04,
  totalAnnualPrice,
});

const PROPOSALS = [proposal("Barata Luz", 700), proposal("IBERDROLA PLAN ESTABLE A CO 5", 2000)];

const report = (proposals: unknown[]) => ({
  success: true,
  userData: { cups_code: CUPS, customer_details: null },
  consumptionData: {
    cups: CUPS,
    tarifa: "3.0TD",
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
    feeType: "3.0TD",
    fileName: "",
    processedAt: "",
  },
  proposals,
  iva: 21,
  impuestoElectrico: 5.11269632,
});

const CONDITIONS = {
  powerTermPriceByPeriod: { P1: "0,1", P2: "0.2" },
  energyPriceByPeriod: { P1: "0,15", P3: "0,12" },
  extraServices: "12,5",
  companyName: "Iberdrola",
};

const expected = (fixed: Record<string, string> = {}) =>
  calculateComparatorSummary(
    toConsumptionSession(report(PROPOSALS) as unknown as ConsumptionReportResponse, "job-pt"),
    CONDITIONS,
    fixed,
  );

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const columns = (page: Page) => page.getByTestId("proposal-column");
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/proposals-${name}-${test.info().project.name}.png`, fullPage: true });

async function openProposals(page: Page, proposals: unknown[] = PROPOSALS) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-pt", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-pt", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report(proposals) }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report(proposals) }));
  await page.route("**/api/bm/collected-prices", (route) =>
    route.fulfill({ status: 201, json: { status: "Stored" } }),
  );
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await field(page, "Comercializadora actual").fill(CONDITIONS.companyName);
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await field(page, "Importe total anual").fill("12,5");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
}

test("comparator shows BmApp numbers, sticky labels, best option and persisted fixed amounts", async ({ page }) => {
  await openProposals(page);
  const summary = expected();
  const d = summary.annualPriceDeltaByTitle;
  const pct = summary.annualSavingsPercentageByTitle;

  await expect(page.getByTestId("customer-column").getByTestId("total")).toHaveText(
    `${summary.customerConditions.totalAnnualPrice}€`,
  );
  await expect(page.getByText("5.11 %")).toBeVisible();
  await expect(page.getByText("21.00 %")).toBeVisible();
  await expect(page.getByText("1234", { exact: true })).toBeVisible();
  await expect(columns(page)).toHaveCount(2);
  await expect(columns(page).nth(0).getByTestId("total")).toHaveText("700.00€");
  await expect(columns(page).nth(1).getByTestId("total")).toHaveText("2000.00€");
  await expect(columns(page).nth(1).getByText("IBERDRO...E A CO 5")).toBeVisible();

  const cheap = columns(page).nth(0).getByTestId("delta");
  const dear = columns(page).nth(1).getByTestId("delta");
  await expect(cheap).toHaveText(`${formatFixedHalfUp(d["Barata Luz"], 2)}€ (${pct["Barata Luz"]}%)`);
  await expect(cheap).toHaveAttribute("data-tone", "positive");
  await expect(dear).toHaveAttribute("data-tone", "negative");
  await expect(dear).toHaveCSS("color", "rgb(211, 47, 47)");

  await expect(page.getByTestId("best-option")).toContainText("Mejor opción: Barata Luz");
  await expect(page.getByTestId("best-option")).toContainText(
    `Ahorro estimado de ${formatFixedHalfUp(d["Barata Luz"], 2)}\u00A0€ al año frente a sus condiciones actuales.`,
  );
  await shot(page, "table");
  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, "table-dark");
  await page.emulateMedia({ colorScheme: "light" });

  // Sticky first column; the page itself never scrolls sideways.
  const labels = page.getByTestId("labels-column");
  const before = await labels.boundingBox();
  await page.getByTestId("comparator-scroll").evaluate((el) => el.scrollTo({ left: 300 }));
  await expect
    .poll(() => page.getByTestId("comparator-scroll").evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  expect((await labels.boundingBox())?.x).toBe(before?.x);
  await expect(labels.getByText("COSTE ANUAL FACTURA ELÉCTRICA")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "scrolled");

  // Fixed amount: filtered, recalculated, persisted across reload.
  const input = page.getByRole("textbox", { name: "Importe fijo Barata Luz" });
  await expect(input).toHaveAttribute("inputmode", "decimal");
  await input.pressSequentially("12,5a9");
  await expect(input).toHaveValue("12,59");
  const fixed = expected({ "Barata Luz": "12,59" });
  const recalculated = fixed.proposals[0];
  await expect(columns(page).nth(0).getByTestId("total")).toHaveText(
    `${formatFixedHalfUp(recalculated.totalAnnualPrice, 2)}€`,
  );
  await expect(cheap).toHaveText(
    `${formatFixedHalfUp(fixed.annualPriceDeltaByTitle["Barata Luz"], 2)}€ (${fixed.annualSavingsPercentageByTitle["Barata Luz"]}%)`,
  );

  // Restoring a study lands on Current Conditions (existing restore behaviour); go back.
  await page.reload();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.getByRole("textbox", { name: "Importe fijo Barata Luz" })).toHaveValue("12,59", {
    timeout: 15_000,
  });
  await expect(columns(page).nth(0).getByTestId("total")).toHaveText(
    `${formatFixedHalfUp(recalculated.totalAnnualPrice, 2)}€`,
  );
});

test("empty state when the study has no proposals", async ({ page }) => {
  await openProposals(page, []);
  await expect(page.getByText("Aún no hay propuestas que comparar.")).toBeVisible();
  await expect(page.getByTestId("comparator-scroll")).toHaveCount(0);
});
