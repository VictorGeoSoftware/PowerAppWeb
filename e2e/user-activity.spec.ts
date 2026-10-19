import type { Page, Request } from "@playwright/test";
import { E2E_EMAIL, expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * User activity (BmApp MainActivity onResume/onStop + proposals-response). The real QA backend
 * still answers `user-data`; `user-activity/*` is recorded and fulfilled with 200.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";

const proposal = (proposalTitle: string, totalAnnualPrice: number) => ({
  proposalTitle,
  powerTermItems: [0.08, 0.04],
  annualPowerTermCost: 300.5,
  consumedEnergyItems: [0.13, 0.11],
  annualEnergyCost: 248.51,
  extraServices: 0,
  iva: 115.39,
  electricalTax: 28.04,
  totalAnnualPrice,
});

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
  proposals: [proposal("Barata Luz", 700)],
  iva: 21,
  impuestoElectrico: 5.11269632,
};

type Activity = { event: string; body: { name: string; email: string } };

async function recordActivity(page: Page): Promise<Activity[]> {
  const events: Activity[] = [];
  await page.route("**/api/bm/user-activity/**", (route) => route.fulfill({ json: { status: "ok" } }));
  page.on("request", (req: Request) => {
    const m = /\/api\/bm\/user-activity\/([^/?]+)/.exec(req.url());
    if (m && req.method() === "POST") events.push({ event: m[1], body: req.postDataJSON() });
  });
  return events;
}

const names = (events: Activity[], event?: string) =>
  events.map((e) => e.event).filter((e) => !event || e === event);

const setVisibility = (page: Page, state: "hidden" | "visible") =>
  page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);

test("online after sign-in, offline when hidden, online when visible again", async ({ page }) => {
  const events = await recordActivity(page);
  await openSignedIn(page);
  await expect.poll(() => names(events)).toEqual(["online"]);
  expect(events[0].body.email).toBe(E2E_EMAIL?.trim());
  expect(events[0].body.name.length).toBeGreaterThan(0);

  await setVisibility(page, "hidden");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => names(events)).toEqual(["online", "offline"]);
  await setVisibility(page, "visible");
  await setVisibility(page, "visible");
  await expect.poll(() => names(events)).toEqual(["online", "offline", "online"]);
});

test("proposals-response is sent once per job, when the table is first shown", async ({ page }) => {
  const events = await recordActivity(page);
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-ua", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-ua", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/collected-prices", (route) => route.fulfill({ status: 201, json: { status: "Stored" } }));

  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  const field = (name: string) => page.getByRole("textbox", { name, exact: true });
  await field("Comercializadora actual").fill("Iberdrola");
  await field("Potencia P1").fill("0,1");
  await field("Potencia P2").fill("0,1");
  await field("Energía P1").fill("0,2");
  await field("Energía P2").fill("0,2");
  await field("Importe total anual").fill("0");
  expect(names(events, "proposals-response")).toEqual([]);

  const toProposals = async () => {
    await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
    await expect(page).toHaveURL(/\/proposals$/);
    await expect(page.getByTestId("proposal-column")).toHaveCount(1, { timeout: 15_000 });
  };
  await toProposals();
  await expect.poll(() => names(events, "proposals-response")).toEqual(["proposals-response"]);

  await page.goBack();
  await expect(page).toHaveURL(/\/current-conditions$/);
  await toProposals();
  await page.reload();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await toProposals();
  await page.waitForTimeout(500);
  expect(names(events, "proposals-response")).toEqual(["proposals-response"]);
});
