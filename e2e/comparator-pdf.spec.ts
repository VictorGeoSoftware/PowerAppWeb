import type { Page, Request } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Comparator PDF (BmApp `exportVisibleProposalsAsPdf` + `ComparatorPdfShareManager`).
 * Job endpoints, POST /collected-prices and POST /reports/comparator-pdf are mocked;
 * the Web Share API is stubbed (Chromium cannot open a real share sheet).
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const PDF = "%PDF-1.4\n%mock\n";

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

const field = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });
const createReport = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: "Crear informe" });

/** Records share() calls; `canShare` false removes file sharing (desktop). */
async function stubShare(page: Page, canShare: boolean) {
  await page.addInitScript((enabled) => {
    const calls: {
      title?: string;
      files: { name: string; type: string; size: number }[];
    }[] = [];
    Object.assign(window, { __shareCalls: calls });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => enabled,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        calls.push({
          title: data.title,
          files: (data.files ?? []).map((f) => ({
            name: f.name,
            type: f.type,
            size: f.size,
          })),
        });
      },
    });
  }, canShare);
}

async function openProposals(page: Page, pdfStatus = 200) {
  const requests: Request[] = [];
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({
      status: 202,
      json: { jobId: "job-pdf", status: "accepted" },
    }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: "job-pdf", status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/bm/consumption-report-refresh/**", (route) =>
    route.fulfill({ json: report }),
  );
  await page.route("**/api/bm/collected-prices", (route) =>
    route.fulfill({ status: 201, json: { status: "Stored" } }),
  );
  await page.route("**/api/bm/reports/comparator-pdf", (route) => {
    requests.push(route.request());
    return pdfStatus === 200
      ? route.fulfill({
          status: 200,
          contentType: "application/pdf",
          headers: {
            "content-disposition": 'attachment; filename="comparador.pdf"',
          },
          body: PDF,
        })
      : route.fulfill({ status: pdfStatus, json: { error: "boom" } });
  });
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await expect(createReport(page)).toHaveCount(0);
  await field(page, "Comercializadora actual").fill("Iberdrola");
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await page
    .getByRole("button", { name: "Ir a las propuestas de precios" })
    .click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.locator('[data-testid="proposal-column"]')).toHaveCount(2);
  return requests;
}

test("shares the PDF with the BmApp request body", async ({ page }) => {
  await stubShare(page, true);
  const requests = await openProposals(page);
  await page
    .getByRole("textbox", { name: "Importe fijo Media Luz" })
    .fill("12,5");
  await createReport(page).click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __shareCalls: unknown[] }).__shareCalls
            .length,
      ),
    )
    .toBe(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].method()).toBe("POST");
  expect(requests[0].headers()["accept"]).toBe("application/pdf");
  const body = requests[0].postDataJSON();
  expect(body).toMatchObject({
    title: "COMPARATIVO ANUAL DE PRECIOS FIJOS",
    supplyHolder: "--",
    supplyAddress: "--",
    cups: CUPS,
    tariffName: "3.0TD",
    powerTermRows: [
      { period: "P1", value: 4.6 },
      { period: "P2", value: 4.6 },
    ],
    iva: "21.00 %",
    impuestoElectrico: "5.11 %",
    customerConditions: {
      title: "CONDICIONES ACTUALES",
      extraServices: "0.00",
    },
  });
  expect(body.energyConsumedRows[0]).toEqual({ period: "P1", value: 1234 });
  expect(body.proposals.map((p: { title: string }) => p.title)).toEqual([
    "Barata Luz",
    "Media Luz",
  ]);
  expect(body.proposals[0]).toMatchObject({
    extraServices: "0.00",
    totalAnnualPrice: "700.00",
  });
  expect(body.proposals[1]).toMatchObject({
    extraServices: "12,5",
    totalAnnualPrice: "1062.50",
  });
  expect(typeof body.proposals[0].annualPriceDifference).toBe("string");
  expect(Number.isInteger(body.proposals[0].annualSavingsPercentage)).toBe(
    true,
  );

  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __shareCalls: {
            title: string;
            files: { name: string; type: string; size: number }[];
          }[];
        }
      ).__shareCalls,
  );
  expect(calls[0].title).toBe("Comparador de propuestas");
  expect(calls[0].files).toHaveLength(1);
  expect(calls[0].files[0].name).toMatch(/^comparador_\d{8}_\d{6}\.pdf$/);
  expect(calls[0].files[0]).toMatchObject({
    type: "application/pdf",
    size: PDF.length,
  });
  await expect(createReport(page)).toBeEnabled();
  await page.screenshot({
    path: `test-results/comparator-pdf-${test.info().project.name}.png`,
  });
});

test("downloads the PDF when the browser cannot share files", async ({
  page,
}) => {
  await stubShare(page, false);
  await openProposals(page);
  const download = page.waitForEvent("download");
  await createReport(page).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^comparador_\d{8}_\d{6}\.pdf$/);
  const path = await file.path();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(path, "utf8")).toBe(PDF);
});

test("shows the BmApp error on a backend failure; hidden when every proposal is hidden", async ({
  page,
}) => {
  await stubShare(page, true);
  await openProposals(page, 500);
  await createReport(page).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "No se pudo generar el informe PDF." }),
  ).toBeVisible();
  await expect(createReport(page)).toBeEnabled();

  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Configuración", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configuration$/);
  await expect(createReport(page)).toHaveCount(0);
  await page.getByRole("switch", { name: "Barata Luz", exact: true }).click();
  await page.getByRole("switch", { name: "Media Luz", exact: true }).click();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Propuestas", exact: true })
    .click();
  await expect(
    page.getByText("Aún no hay propuestas que comparar."),
  ).toBeVisible();
  await expect(createReport(page)).toHaveCount(0);
});
