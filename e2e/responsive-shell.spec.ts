import type { Page, TestInfo } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Responsive shell (docs/specs/responsive-shell.md). Runs on android-chromium (phone drawer)
 * and on tablet-chromium / desktop-chromium (permanent sidebar from 1024px).
 * Consumption job endpoints and POST /collected-prices are mocked.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const LG = 1024;

const report = {
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
  proposals: [
    {
      proposalTitle: "Barata Luz",
      powerTermItems: [0.08, 0.04],
      annualPowerTermCost: 300,
      consumedEnergyItems: [0.13, 0.11],
      annualEnergyCost: 240,
      extraServices: 0,
      iva: 115,
      electricalTax: 28,
      totalAnnualPrice: 700,
    },
  ],
  iva: 21,
  impuestoElectrico: 5.11269632,
};

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= LG;
const hamburger = (page: Page) => page.getByRole("button", { name: "Abrir menú" });
const sidebar = (page: Page) => page.getByTestId("app-sidebar");
const sidebarNav = (page: Page) => sidebar(page).getByRole("navigation", { name: "Menú principal" });
const shot = (page: Page, info: TestInfo, name: string) =>
  page.screenshot({ path: `test-results/responsive-${name}-${info.project.name}.png`, fullPage: true });

async function expectNoPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Pages widen per screen in responsive-views (≤ 1280px); phones keep the 640px column. */
async function expectPageWidth(page: Page) {
  const box = await page.locator("main section[data-width]").first().boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(isDesktop(page) ? 1280 : 640);
}

async function reachProposals(page: Page) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-rs", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-rs", status: "COMPLETED" } }),
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
  await field("Energía P1").fill("0,15");
  await field("Energía P2").fill("0,12");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
}

test.beforeEach(async ({ page }) => {
  // The push row depends on the browser; covered by push-registration.spec.
  await page.addInitScript(() => delete (window as { PushManager?: unknown }).PushManager);
});

test("shell matches the viewport: drawer below lg, permanent sidebar from lg", async ({ page }, info) => {
  await openSignedIn(page);
  await expectPageWidth(page);
  await expectNoPageHorizontalScroll(page);

  if (isDesktop(page)) {
    await expect(hamburger(page)).toBeHidden();
    await expect(sidebarNav(page)).toBeVisible();
    await expect(sidebar(page).getByText("Menú", { exact: true })).toBeVisible();
    // Consumption step: same Fee-First locks as the drawer.
    await expect(sidebar(page).getByLabel("Bloqueado")).toHaveCount(3);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Content sits right of the sidebar.
    const nav = await sidebar(page).boundingBox();
    const section = await page.locator("main section[data-width]").first().boundingBox();
    expect(section!.x).toBeGreaterThanOrEqual(nav!.x + nav!.width);
  } else {
    await expect(sidebar(page)).toBeHidden();
    await hamburger(page).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("navigation", { name: "Menú principal" })).toBeVisible();
    await expect(menu.getByLabel("Bloqueado")).toHaveCount(3);
    // Only one menu navigation is exposed at a time.
    await expect(page.getByRole("navigation", { name: "Menú principal" })).toHaveCount(1);
  }
  await shot(page, info, "fetch-consumption");
});

test("sidebar navigates between unlocked sections and keeps the top bar actions", async ({ page }, info) => {
  test.skip(!isDesktop(page), "Sidebar only from 1024px; the phone drawer is covered by app-shell.spec");
  await reachProposals(page);
  await expect(page.getByRole("button", { name: "Crear informe" })).toBeVisible();
  await expect(sidebarNav(page).getByRole("link", { name: "Propuestas" })).toHaveAttribute("aria-current", "page");
  await expectPageWidth(page);
  await expectNoPageHorizontalScroll(page);
  await shot(page, info, "proposals");

  await sidebarNav(page).getByRole("link", { name: "Configuración" }).click();
  await expect(page).toHaveURL(/\/configuration$/);
  await expect(sidebarNav(page)).toBeVisible();
  await expect(sidebarNav(page).getByRole("link", { name: "Configuración" })).toHaveAttribute("aria-current", "page");

  await sidebarNav(page).getByRole("link", { name: "Condiciones actuales" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("resizing switches between drawer and sidebar without a reload", async ({ page }) => {
  test.skip(!isDesktop(page), "Starts from a desktop/tablet-landscape viewport");
  const initial = page.viewportSize()!;
  await openSignedIn(page);
  // Portrait tablet / narrow window: drawer.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(sidebar(page)).toBeHidden();
  await hamburger(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Back to desktop: the open drawer closes and the sidebar takes over.
  await page.setViewportSize(initial);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(sidebarNav(page)).toBeVisible();
  await expect(hamburger(page)).toBeHidden();
});
