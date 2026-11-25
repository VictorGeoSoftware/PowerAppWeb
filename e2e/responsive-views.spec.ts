import type { Page, TestInfo } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Responsive page layouts (docs/specs/responsive-views.md). Runs on android-chromium (phone,
 * unchanged layouts), tablet-chromium and desktop-chromium. Comparator column widths are fixed
 * on every viewport. Consumption job endpoints and POST /collected-prices are mocked.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const MD = 768;
const LG = 1024;

const proposal = (proposalTitle: string, totalAnnualPrice: number) => ({
  proposalTitle,
  powerTermItems: [0.08, 0.04],
  annualPowerTermCost: 300,
  consumedEnergyItems: [0.13, 0.11],
  annualEnergyCost: 240,
  extraServices: 0,
  iva: 115,
  electricalTax: 28,
  totalAnnualPrice,
});

const TWO = [proposal("Barata Luz", 700), proposal("Media Luz", 760)];
const EIGHT = Array.from({ length: 8 }, (_, i) => proposal(`Tarifa ${i + 1}`, 700 + i * 5));

const report = (proposals: unknown[]) => ({
  success: true,
  userData: { cups_code: CUPS, customer_details: null },
  consumptionData: {
    cups: CUPS,
    tarifa: "2.0TD",
    tarifaValue: "",
    annualConsumption: 2000,
    annualConsumptionP1: 1000,
    annualConsumptionP2: 1000,
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
  proposals,
  iva: 21,
  impuestoElectrico: 5.11269632,
});

const width = (page: Page) => page.viewportSize()?.width ?? 0;
const shot = (page: Page, info: TestInfo, name: string) =>
  page.screenshot({ path: `test-results/responsive-views-${name}-${info.project.name}.png`, fullPage: true });
const box = async (page: Page, testId: string) => (await page.getByTestId(testId).first().boundingBox())!;
const pageSection = (page: Page) => page.locator("main section[data-width]").first();

async function expectNoPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function reachConditions(page: Page, proposals: unknown[]) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-rv", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-rv", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report(proposals) }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report(proposals) }));
  await page.route("**/api/bm/collected-prices", (route) => route.fulfill({ status: 201, json: { status: "Stored" } }));
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
}

async function reachProposals(page: Page, proposals: unknown[]) {
  await reachConditions(page, proposals);
  const field = (name: string) => page.getByRole("textbox", { name, exact: true });
  await field("Comercializadora actual").fill("Iberdrola");
  await field("Potencia P1").fill("0,1");
  await field("Potencia P2").fill("0,1");
  await field("Energía P1").fill("0,15");
  await field("Energía P2").fill("0,12");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.getByTestId("proposal-column")).toHaveCount(proposals.length);
}

async function expectFixedColumnWidths(page: Page) {
  expect((await box(page, "labels-column")).width).toBeCloseTo(176 + 32, 0); // w-44 + pl-4/pr-4
  const columns = [page.getByTestId("customer-column"), ...(await page.getByTestId("proposal-column").all())];
  for (const column of columns) expect((await column.boundingBox())!.width).toBeCloseTo(168, 0);
}

test.beforeEach(async ({ page }) => {
  // The push row/card depends on the browser; covered by push-registration.spec.
  await page.addInitScript(() => delete (window as { PushManager?: unknown }).PushManager);
});

test("fetch consumption: CUPS and other methods side by side from lg, stacked below", async ({ page }, info) => {
  await openSignedIn(page);
  const cups = await box(page, "method-cups");
  const others = await box(page, "method-others");
  if (width(page) >= LG) {
    expect(cups.x + cups.width).toBeLessThan(others.x);
    expect(Math.abs(cups.y - others.y)).toBeLessThanOrEqual(8);
    expect((await pageSection(page).boundingBox())!.width).toBeLessThanOrEqual(960);
  } else {
    expect(others.y).toBeGreaterThan(cups.y + cups.height);
    expect((await pageSection(page).boundingBox())!.width).toBeLessThanOrEqual(640);
  }
  await expectNoPageHorizontalScroll(page);
  await shot(page, info, "fetch-consumption");
});

test("current conditions: summary next to the form from lg; copy sheet centered from md", async ({ page }, info) => {
  await reachConditions(page, TWO);
  const summary = await box(page, "conditions-summary");
  const form = await box(page, "conditions-form");
  if (width(page) >= LG) {
    expect(summary.x + summary.width).toBeLessThan(form.x);
    expect(Math.abs(summary.y - form.y)).toBeLessThanOrEqual(8);
    expect(form.width).toBeLessThanOrEqual(640);
  } else {
    expect(form.y).toBeGreaterThan(summary.y + summary.height - 1);
    expect((await pageSection(page).boundingBox())!.width).toBeLessThanOrEqual(640);
  }
  await expectNoPageHorizontalScroll(page);
  await shot(page, info, "current-conditions");

  await page.getByRole("button", { name: "Copiar precios de una propuesta" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  // Let the slide-in transition settle before measuring.
  await page.waitForTimeout(400);
  const s = (await sheet.boundingBox())!;
  if (width(page) >= MD) {
    expect(s.width).toBeLessThanOrEqual(640);
    expect(Math.abs(s.x - (width(page) - (s.x + s.width)))).toBeLessThanOrEqual(2);
  } else {
    expect(s.width).toBeCloseTo(width(page), 0);
  }
  await shot(page, info, "copy-sheet");
});

test("proposals: fixed column widths; wider screens fit more before scrolling", async ({ page }, info) => {
  await reachProposals(page, TWO);
  await expectFixedColumnWidths(page);
  const scroller = page.getByTestId("comparator-scroll");
  const overflows = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  if (width(page) >= MD) {
    expect((await pageSection(page).boundingBox())!.width).toBeGreaterThan(640);
    expect(overflows).toBe(false);
    // Top bar actions sit at the right edge of the content, not inside a 640px column.
    // The last one is "Informe completo" for Premium accounts, otherwise "Crear informe".
    await expect(page.getByRole("banner").getByRole("button", { name: "Crear informe" })).toBeVisible();
    const action = (await page.getByRole("banner").getByRole("button").last().boundingBox())!;
    expect(action.x + action.width).toBeGreaterThan(width(page) - 64);
  } else {
    expect(overflows).toBe(true);
  }
  await expect(page.getByTestId("best-option")).toBeVisible();
  await expectNoPageHorizontalScroll(page);
  await shot(page, info, "proposals");
});

test("proposals: many proposals scroll sideways with Tarifa actual pinned", async ({ page }, info) => {
  await reachProposals(page, EIGHT);
  await expectFixedColumnWidths(page);
  const scroller = page.getByTestId("comparator-scroll");
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  const pinned = await box(page, "customer-sticky");
  const area = (await scroller.boundingBox())!;
  // The sticky wrapper keeps its 16px left padding inside the scroller's edge.
  expect(Math.abs(pinned.x - area.x)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("customer-column")).toBeInViewport();
  await expectNoPageHorizontalScroll(page);
  await shot(page, info, "proposals-many");
});
