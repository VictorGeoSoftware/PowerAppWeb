import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Comprehensive-report access (`report-web-capability`). `GET /api/bm/me/access` is
 * mocked per test (tier states are synthetic) except in the first test, which proves the
 * proxy + QA route with the real backend. Job endpoints are mocked as in comparator-pdf.
 * The action is shown disabled until `report-web-export`; no PDF endpoint is called.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const PREMIUM = { tier: "PREMIUM", capabilities: ["COMPREHENSIVE_COMPARATOR_PDF"] };
const BASIC = { tier: "BASIC", capabilities: [] };

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

const report = {
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
  proposals: [proposal("Barata Luz", 700), proposal("Media Luz", 1050)],
  iva: 21,
  impuestoElectrico: 5.11269632,
};

const banner = (page: Page) => page.getByRole("banner");
const createReport = (page: Page) => banner(page).getByRole("button", { name: "Crear informe" });
const fullReport = (page: Page) => banner(page).getByRole("button", { name: "Informe completo" });
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

type AccessMock = { status: number; body: unknown; calls: number };

/** Mocks `me/access`; change `mock.status`/`mock.body` to simulate an up/downgrade. */
async function mockAccess(page: Page, body: unknown, status = 200): Promise<AccessMock> {
  const mock: AccessMock = { status, body, calls: 0 };
  await page.route("**/api/bm/me/access", (route) => {
    mock.calls++;
    return typeof mock.body === "string"
      ? route.fulfill({ status: mock.status, contentType: "text/html", body: mock.body })
      : route.fulfill({ status: mock.status, json: mock.body });
  });
  return mock;
}

async function openProposals(page: Page) {
  const premiumPdf: string[] = [];
  await page.route("**/api/bm/reports/premium-pdf", (route) => {
    premiumPdf.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-access", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-access", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/collected-prices", (route) =>
    route.fulfill({ status: 201, json: { status: "Stored" } }),
  );
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(fullReport(page)).toHaveCount(0);
  await field(page, "Comercializadora actual").fill("Iberdrola");
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.locator('[data-testid="proposal-column"]')).toHaveCount(2);
  await expect(createReport(page)).toBeEnabled();
  return premiumPdf;
}

async function goTo(page: Page, link: string, url: RegExp) {
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("link", { name: link, exact: true }).click();
  await expect(page).toHaveURL(url);
}

test("real QA backend answers /api/bm/me/access through the proxy", async ({ page }) => {
  const response = page.waitForResponse((r) => r.url().endsWith("/api/bm/me/access"));
  await openSignedIn(page);
  const res = await response;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(["BASIC", "PREMIUM"]).toContain(body.tier);
  expect(Array.isArray(body.capabilities)).toBe(true);
});

test("Premium: Informe completo shown disabled to the right of Crear informe; no PDF call", async ({ page }) => {
  await mockAccess(page, PREMIUM);
  const premiumPdf = await openProposals(page);
  await expect(fullReport(page)).toBeVisible();
  await expect(fullReport(page)).toBeDisabled();
  const create = await createReport(page).boundingBox();
  const full = await fullReport(page).boundingBox();
  expect(create && full && full.x >= create.x + create.width - 1).toBe(true);
  expect(premiumPdf).toHaveLength(0);
  await page.screenshot({ path: `test-results/report-access-premium-${test.info().project.name}.png` });

  // 360 px: menu, Crear informe and Informe completo fit without overlap or truncation.
  await page.setViewportSize({ width: 360, height: 640 });
  const menu = await page.getByRole("button", { name: "Abrir menú" }).boundingBox();
  const c = await createReport(page).boundingBox();
  const f = await fullReport(page).boundingBox();
  expect(menu && c && f).toBeTruthy();
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(c!.x);
  expect(c!.x + c!.width).toBeLessThanOrEqual(f!.x + 1);
  expect(f!.x + f!.width).toBeLessThanOrEqual(360);
  const truncated = await fullReport(page).evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(truncated).toBe(false);
  await page.screenshot({ path: `test-results/report-access-premium-360-${test.info().project.name}.png` });
});

test("Basic: only Crear informe", async ({ page }) => {
  await mockAccess(page, BASIC);
  await openProposals(page);
  await expect(createReport(page)).toBeVisible();
  await expect(fullReport(page)).toHaveCount(0);
});

test("capability decides, not tier", async ({ page }) => {
  const mock = await mockAccess(page, { tier: "PREMIUM", capabilities: [] });
  await openProposals(page);
  await expect(fullReport(page)).toHaveCount(0);
  expect(mock.calls).toBeGreaterThan(0);
});

for (const [name, status, body] of [
  ["500", 500, { error: "boom" }],
  ["non-JSON", 200, "<html>oops</html>"],
  ["missing capabilities", 200, { tier: "PREMIUM" }],
] as const) {
  test(`fails closed and quietly on ${name}`, async ({ page }) => {
    await mockAccess(page, body, status);
    await openProposals(page);
    await expect(fullReport(page)).toHaveCount(0);
    // Scoped to the app shell: Next.js's route announcer is also role="alert".
    await expect(page.getByRole("banner").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(/\/proposals$/); // session not ended
  });
}

test("downgrade on visibility and upgrade on re-entering Propuestas, without reload", async ({ page }) => {
  await page.clock.install();
  const mock = await mockAccess(page, PREMIUM);
  await openProposals(page);
  await expect(fullReport(page)).toBeVisible();

  mock.body = BASIC;
  await page.clock.fastForward("01:05");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(fullReport(page)).toHaveCount(0);
  await expect(createReport(page)).toBeVisible();

  mock.body = PREMIUM;
  await page.clock.fastForward("01:05");
  await goTo(page, "Configuración", /\/configuration$/);
  await goTo(page, "Propuestas", /\/proposals$/);
  await expect(fullReport(page)).toBeVisible();
});

test("hidden with Crear informe when no proposal is visible", async ({ page }) => {
  await mockAccess(page, PREMIUM);
  await openProposals(page);
  await expect(fullReport(page)).toBeVisible();
  await goTo(page, "Configuración", /\/configuration$/);
  await expect(fullReport(page)).toHaveCount(0);
  await page.getByRole("switch", { name: "Barata Luz", exact: true }).click();
  await page.getByRole("switch", { name: "Media Luz", exact: true }).click();
  await goTo(page, "Propuestas", /\/proposals$/);
  await expect(page.getByText("Aún no hay propuestas que comparar.")).toBeVisible();
  await expect(createReport(page)).toHaveCount(0);
  await expect(fullReport(page)).toHaveCount(0);
});
