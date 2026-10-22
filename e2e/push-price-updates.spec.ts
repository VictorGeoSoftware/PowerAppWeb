import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Price-update push (web-push-price-updates). Job endpoints are mocked; the second refresh
 * returns new prices. The SW → page message is dispatched directly and, through CDP, as a
 * real `push` event on `/sw.js`.
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

const report = (total: number) => ({
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
  proposals: [proposal("Barata Luz", total)],
  iva: 21,
  impuestoElectrico: 5.11269632,
});

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const total = (page: Page) => page.getByTestId("proposal-column").first().getByTestId("total");

async function openProposals(page: Page) {
  const refreshes: string[] = [];
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-push", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-push", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report(700) }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => {
    refreshes.push(route.request().url());
    return route.fulfill({ json: report(refreshes.length === 1 ? 650 : 600) });
  });
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await field(page, "Comercializadora actual").fill("Iberdrola");
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await field(page, "Importe total anual").fill("12,5");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(total(page)).toHaveText("700.00€");
  return refreshes;
}

test("a bm:price_updates message refreshes the study right after publishing (no throttle)", async ({ page }) => {
  const refreshes = await openProposals(page);
  expect(refreshes).toHaveLength(0);
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "bm:price_updates" } })),
  );
  await expect(total(page)).toHaveText("650.00€");
  expect(refreshes).toHaveLength(1);
  expect(refreshes[0]).toContain("/consumption-report-refresh/job-push");

  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "bm:price_updates" } })),
  );
  await expect(total(page)).toHaveText("600.00€");
  expect(refreshes).toHaveLength(2);
});

test("a push delivered to /sw.js (CDP) refreshes the open page", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "CDP is Chromium only");
  const refreshes = await openProposals(page);
  await context.grantPermissions(["notifications"]);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  const cdp = await context.newCDPSession(page);
  const registered = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
      const match = e.registrations.find((r) => r.scopeURL === scope && !r.isDeleted);
      if (match) resolve(match.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: await registered,
    data: JSON.stringify({ data: { type: "price_updates", payload: "{}" }, from: "e2e" }),
  });
  await expect(total(page)).toHaveText("650.00€");
  expect(refreshes).toHaveLength(1);
});
