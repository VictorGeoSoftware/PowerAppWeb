import type { Page } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Proposal visibility (BmApp ProposalVisibilityConfigurationView + uncompetitive auto-hide).
 * Job endpoints and POST /collected-prices are mocked. The customer total for CONDITIONS is
 * ~1002 €: "Cara Luz" (1250) is >= 15% dearer and auto-hidden; "Media Luz" (1050) is not.
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

const PROPOSALS = [proposal("Barata Luz", 700), proposal("Media Luz", 1050), proposal("Cara Luz", 1250)];

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
  proposals: PROPOSALS,
  iva: 21,
  impuestoElectrico: 5.11269632,
};

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const columnTitles = (page: Page) => page.locator('[data-testid="proposal-column"] > [title]');
const toggle = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });

async function goTo(page: Page, label: "Propuestas" | "Configuración") {
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog").getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(label === "Propuestas" ? /\/proposals$/ : /\/configuration$/);
}

async function openProposals(page: Page) {
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: "job-vis", status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-vis", status: "COMPLETED" } }),
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
  await field(page, "Comercializadora actual").fill("Iberdrola");
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await field(page, "Importe total anual").fill("12,5");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
}

test("auto-hide once, toggle on configuration, persisted across reload, all hidden", async ({ page }) => {
  await openProposals(page);
  // Reaching Proposals auto-hides the >= 15% dearer proposal.
  await expect(columnTitles(page)).toHaveText(["Barata Luz", "Media Luz"]);
  await expect(page.getByTestId("best-option")).toContainText("Mejor opción: Barata Luz");

  await goTo(page, "Configuración");
  await expect(page.getByRole("heading", { name: "Propuestas visibles" })).toBeVisible();
  await expect(page.getByText("Usa el botón a la izquierda de la propuesta para ocultarla/mostrarla")).toBeVisible();
  await expect(toggle(page, "Cara Luz")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("proposal-visibility-row").nth(2)).toHaveCSS("opacity", "0.45");
  for (const row of await page.getByTestId("proposal-visibility-row").all()) {
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await toggle(page, "Cara Luz").click();
  await page.getByText("Barata Luz", { exact: true }).click();
  await expect(toggle(page, "Cara Luz")).toHaveAttribute("aria-checked", "true");
  await expect(toggle(page, "Barata Luz")).toHaveAttribute("aria-checked", "false");
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await page.screenshot({
    path: `test-results/proposals-configuration-${test.info().project.name}.png`,
    fullPage: true,
  });

  await goTo(page, "Propuestas");
  await expect(columnTitles(page)).toHaveText(["Media Luz", "Cara Luz"]);
  await expect(page.getByTestId("best-option")).toHaveCount(0);

  // Reload restores the study on Current Conditions; the same signature does not re-hide.
  await page.reload();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(columnTitles(page)).toHaveText(["Media Luz", "Cara Luz"], { timeout: 15_000 });

  await goTo(page, "Configuración");
  await expect(toggle(page, "Barata Luz")).toHaveAttribute("aria-checked", "false");
  await expect(toggle(page, "Cara Luz")).toHaveAttribute("aria-checked", "true");
  await toggle(page, "Media Luz").click();
  await toggle(page, "Cara Luz").click();
  await goTo(page, "Propuestas");
  await expect(page.getByText("Aún no hay propuestas que comparar.")).toBeVisible();
});
