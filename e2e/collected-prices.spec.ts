import type { Page, Request } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Collected Prices submit (BmApp onNavigateToProposalsClicked). Job endpoints and
 * POST /collected-prices are mocked, so nothing is written to the QA DB.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";

const report = (feeType: string) => ({
  success: true,
  userData: { cups_code: CUPS, customer_details: null },
  consumptionData: {
    cups: CUPS,
    tarifa: feeType,
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
    feeType,
    fileName: "",
    processedAt: "",
  },
  proposals: [],
  iva: 21,
  impuestoElectrico: 5.11,
});

async function setup(page: Page, feeType: string, status = 201) {
  const posts: Request[] = [];
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-cp", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-cp", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report(feeType) }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report(feeType) }));
  await page.route("**/api/bm/collected-prices", (route) => {
    posts.push(route.request());
    return route.fulfill(status === 201 ? { status, json: { status: "Stored" } } : { status, json: { error: "boom" } });
  });
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await field(page, "Comercializadora actual").fill(" Iberdrola ");
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await field(page, "Importe total anual").fill("12,5");
  return posts;
}

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const cta = (page: Page) => page.getByRole("button", { name: "Ir a las propuestas de precios" });

test("3.0TD: posts once per job and navigates immediately", async ({ page }) => {
  const posts = await setup(page, "3.0TD");
  await cta(page).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect.poll(() => posts.length).toBe(1);
  const req = posts[0];
  expect(req.method()).toBe("POST");
  expect(await req.headerValue("authorization")).toMatch(/^Bearer .+/);
  expect(req.postDataJSON()).toEqual({
    companyName: "Iberdrola",
    tariffType: "3.0TD",
    powerPrices: { P1: 0.1, P2: 0.2 },
    energyPrices: { P1: 0.15, P3: 0.12 },
    extraServices: 12.5,
  });

  await page.goBack();
  await expect(page).toHaveURL(/\/current-conditions$/);
  await field(page, "Potencia P1").fill("0,3");
  await page.reload();
  await cta(page).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(1);
});

test("2.0TD: no post, navigation still happens", async ({ page }) => {
  const posts = await setup(page, "2.0TD");
  await cta(page).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(0);
});

test("backend failure is invisible", async ({ page }) => {
  const posts = await setup(page, "3.0TD", 500);
  await cta(page).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect.poll(() => posts.length).toBe(1);
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.getByText(/boom|error/i)).toHaveCount(0);
});
