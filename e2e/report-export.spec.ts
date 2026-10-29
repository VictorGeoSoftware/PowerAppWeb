import type { Page, Request } from "@playwright/test";
import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

/**
 * Premium "Informe completo" export (`report-web-export`). Job endpoints are mocked as in
 * comparator-pdf, so the study's jobId is unknown to the backend. `premium-pdf` is mocked
 * per test (a live 200 needs a real study: `report-live-qa`), except in the "real backend"
 * test, which sends one unmocked request through the proxy and expects the genuine
 * 404 `study_not_found`. The Web Share API is stubbed. Screenshots go to /tmp/opencode.
 */
useSignedInSession();

const CUPS = "ES0031607515707001RC";
const PDF = "%PDF-1.4\n%premium\n";
const SHOTS = "/tmp/opencode/report-web-export";
const PREMIUM = { tier: "PREMIUM", capabilities: ["COMPREHENSIVE_COMPARATOR_PDF"] };
const BASIC = { tier: "BASIC", capabilities: [] };

const S1 = "El informe completo requiere el plan Premium.";
const S2 = "El estudio no está disponible o ha caducado. Vuelve a consultar el suministro.";
const S4 = "Indica el titular del suministro en Condiciones actuales para crear el informe completo.";
const S6 = "Completa las condiciones actuales antes de crear el informe completo.";
const S7 = "Los datos de la comparativa no coinciden con el estudio. Revisa las propuestas y vuelve a intentarlo.";
const S8 = "No se ha podido generar el informe completo. Inténtalo de nuevo.";

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

const JOB_ID = "job-premium-e2e";
const ACQUISITION = /\/api\/bm\/(fetch-user-consumption-report|consumption-report-(refresh|status|result))/;

const banner = (page: Page) => page.getByRole("banner");
const createReport = (page: Page) => banner(page).getByRole("button", { name: "Crear informe" });
const fullReport = (page: Page) => banner(page).getByRole("button", { name: "Informe completo" });
const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const premiumAlert = (page: Page) => page.getByTestId("premium-report-alert");
const retry = (page: Page) => premiumAlert(page).getByRole("button", { name: "Reintentar" });

type Reply = { status: number; json?: unknown; body?: string; headers?: Record<string, string> };
const pdfReply: Reply = {
  status: 200,
  body: PDF,
  headers: { "content-disposition": "attachment; filename=informe_completo_1761750000000.pdf" },
};
const errorReply = (status: number, code?: string): Reply => ({
  status,
  json: code
    ? { success: false, code, message: `backend text ${code} ${CUPS}` }
    : { message: "No autorizada" },
});

type Share = { title?: string; files: { name: string; type: string; size: number }[] };

/** Records share() calls; `mode` "gesture" makes the first share fail with NotAllowedError. */
async function stubShare(page: Page, mode: "share" | "none" | "gesture" = "share") {
  await page.addInitScript((m) => {
    const calls: unknown[] = [];
    let first = true;
    Object.assign(window, { __shareCalls: calls });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => m !== "none" });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        if (m === "gesture" && first) {
          first = false;
          throw new DOMException("activation expired", "NotAllowedError");
        }
        calls.push({
          title: data.title,
          files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
        });
      },
    });
  }, mode);
}
const shareCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shareCalls: Share[] }).__shareCalls);

type Setup = {
  access?: { body: unknown; calls: number } | "real";
  premium?: Reply[] | "real";
  holder?: string;
  address?: string;
};

async function openProposals(page: Page, setup: Setup = {}) {
  const premiumRequests: Request[] = [];
  const basicRequests: Request[] = [];
  const replies = setup.premium === "real" ? [] : [...(setup.premium ?? [pdfReply])];
  if (setup.premium !== "real") {
    await page.route("**/api/bm/reports/premium-pdf", (route) => {
      premiumRequests.push(route.request());
      const reply = replies.length > 1 ? replies.shift()! : replies[0];
      return route.fulfill({
        status: reply.status,
        contentType: reply.json ? "application/json" : "application/pdf",
        headers: reply.headers,
        body: reply.json ? JSON.stringify(reply.json) : reply.body,
      });
    });
  }
  const access = setup.access ?? { body: PREMIUM, calls: 0 };
  if (access !== "real") {
    await page.route("**/api/bm/me/access", (route) => {
      access.calls++;
      return route.fulfill({ json: access.body });
    });
  }
  await page.route("**/api/bm/fetch-user-consumption-report-by-cups", (route) =>
    route.fulfill({ status: 202, json: { jobId: JOB_ID, status: "accepted" } }),
  );
  await page.route("**/api/bm/consumption-report-status/**", (route) =>
    route.fulfill({ json: { jobId: JOB_ID, status: "COMPLETED" } }),
  );
  await page.route("**/api/bm/consumption-report-result/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/consumption-report-refresh/**", (route) => route.fulfill({ json: report }));
  await page.route("**/api/bm/collected-prices", (route) =>
    route.fulfill({ status: 201, json: { status: "Stored" } }),
  );
  await page.route("**/api/bm/reports/comparator-pdf", (route) => {
    basicRequests.push(route.request());
    return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
  });
  await openSignedIn(page);
  await page.getByLabel("Introducir código CUPS").fill(CUPS);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/current-conditions$/, { timeout: 15_000 });
  await field(page, "Titular").fill(setup.holder ?? "Cliente Prueba");
  await field(page, "Dirección").fill(setup.address ?? "Calle Mayor 1, Madrid");
  await field(page, "Comercializadora actual").fill("Iberdrola");
  await field(page, "Potencia P1").fill("0,1");
  await field(page, "Potencia P2").fill("0.2");
  await field(page, "Energía P1").fill("0,15");
  await field(page, "Energía P3").fill("0,12");
  await page.getByRole("button", { name: "Ir a las propuestas de precios" }).click();
  await expect(page).toHaveURL(/\/proposals$/);
  await expect(page.locator('[data-testid="proposal-column"]')).toHaveCount(2);
  await expect(fullReport(page)).toBeEnabled();
  const acquisition: string[] = [];
  page.on("request", (r) => {
    if (ACQUISITION.test(r.url())) acquisition.push(r.url());
  });
  return { premiumRequests, basicRequests, acquisition };
}

async function expectInputsKept(page: Page) {
  await expect(page.getByRole("textbox", { name: "Importe fijo Media Luz" })).toHaveValue("12,5");
  await expect(page.locator('[data-testid="proposal-column"]')).toHaveCount(2);
  await expect(page).toHaveURL(/\/proposals$/);
}

test("T4: shares the Premium PDF with {jobId, comparison} equal to the Basic body; no acquisition", async ({
  page,
}) => {
  await stubShare(page);
  const { premiumRequests, basicRequests, acquisition } = await openProposals(page);
  await page.getByRole("textbox", { name: "Importe fijo Media Luz" }).fill("12,5");

  await createReport(page).click();
  await expect.poll(async () => (await shareCalls(page)).length).toBe(1);
  await fullReport(page).click();
  await expect.poll(async () => (await shareCalls(page)).length).toBe(2);

  expect(premiumRequests).toHaveLength(1);
  const request = premiumRequests[0];
  expect(request.method()).toBe("POST");
  expect(request.headers()["accept"]).toBe("application/pdf, application/json");
  const body = request.postDataJSON();
  expect(Object.keys(body).sort()).toEqual(["comparison", "jobId"]);
  expect(body.jobId).toBe(JOB_ID);
  expect(body.comparison).toEqual(basicRequests[0].postDataJSON());
  expect(body.comparison).toMatchObject({ supplyHolder: "Cliente Prueba", supplyAddress: "Calle Mayor 1, Madrid" });

  const premiumShare = (await shareCalls(page))[1];
  expect(premiumShare.title).toBe("Informe completo");
  expect(premiumShare.files).toEqual([
    { name: "informe_completo_1761750000000.pdf", type: "application/pdf", size: PDF.length },
  ]);
  expect(acquisition).toEqual([]);
  await expect(premiumAlert(page)).toHaveCount(0);
  await expect(fullReport(page)).toBeEnabled();
  await expectInputsKept(page);
  await page.screenshot({ path: `${SHOTS}/t4-shared-${test.info().project.name}.png` });
});

test("T5: expired share gesture offers the ready panel; Descargar downloads the Premium PDF", async ({ page }) => {
  await stubShare(page, "gesture");
  await openProposals(page);
  await fullReport(page).click();
  const panel = page.getByRole("region", { name: "Informe listo" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Compartir PDF" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/t5-ready-panel-${test.info().project.name}.png` });
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Descargar" }).click();
  expect((await download).suggestedFilename()).toBe("informe_completo_1761750000000.pdf");
  await expect(panel).toHaveCount(0);
});

test("downloads when the browser cannot share files", async ({ page }) => {
  await stubShare(page, "none");
  await openProposals(page);
  const download = page.waitForEvent("download");
  await fullReport(page).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("informe_completo_1761750000000.pdf");
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(await file.path(), "utf8")).toBe(PDF);
});

test("T1: blank Titular shows S4 and sends no request", async ({ page }) => {
  await stubShare(page);
  const { premiumRequests } = await openProposals(page, { holder: "" });
  await fullReport(page).click();
  await expect(premiumAlert(page)).toHaveText(S4);
  await expect(retry(page)).toHaveCount(0);
  expect(premiumRequests).toHaveLength(0);
  await expect(fullReport(page)).toBeEnabled();
});

test("T8: premium_required shows S1, hides the action, forces an access re-check and keeps the session", async ({
  page,
}) => {
  await stubShare(page);
  const access = { body: PREMIUM as unknown, calls: 0 };
  const { basicRequests } = await openProposals(page, {
    access,
    premium: [errorReply(403, "premium_required")],
  });
  const callsBefore = access.calls;
  access.body = BASIC;
  await fullReport(page).click();
  await expect(premiumAlert(page)).toHaveText(S1);
  await expect(retry(page)).toHaveCount(0);
  await expect(fullReport(page)).toHaveCount(0);
  await expect.poll(() => access.calls).toBeGreaterThan(callsBefore);
  await expect(page).toHaveURL(/\/proposals$/);
  await page.screenshot({ path: `${SHOTS}/t8-premium-required-${test.info().project.name}.png` });
  await createReport(page).click();
  await expect.poll(async () => (await shareCalls(page)).length).toBe(1);
  expect(basicRequests).toHaveLength(1);
  await expect(page).toHaveURL(/\/proposals$/);
});

test("T11 (real backend): unmocked premium-pdf with an unknown jobId gives the genuine 404, S2, still signed in", async ({
  page,
}) => {
  await stubShare(page);
  await openProposals(page, { access: "real", premium: "real" });
  await page.getByRole("textbox", { name: "Importe fijo Media Luz" }).fill("12,5");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/bm/reports/premium-pdf"));
  await fullReport(page).click();
  const res = await response;
  expect(res.status()).toBe(404);
  expect((await res.json()).code).toBe("study_not_found");
  await expect(premiumAlert(page)).toHaveText(S2);
  await expect(retry(page)).toHaveCount(0);
  await expect(fullReport(page)).toBeEnabled();
  await expectInputsKept(page);
  await page.screenshot({ path: `${SHOTS}/t11-real-404-${test.info().project.name}.png` });
});

test("T14/T15: 422 codes map to S6 (no Retry) and S7 (Retry); inputs kept", async ({ page }) => {
  await stubShare(page);
  await openProposals(page, {
    premium: [errorReply(422, "current_conditions_missing"), errorReply(422, "stale_offer")],
  });
  await page.getByRole("textbox", { name: "Importe fijo Media Luz" }).fill("12,5");
  await fullReport(page).click();
  await expect(premiumAlert(page)).toHaveText(S6);
  await expect(retry(page)).toHaveCount(0);
  await fullReport(page).click();
  await expect(premiumAlert(page)).toContainText(S7);
  await expect(retry(page)).toBeVisible();
  await expect(premiumAlert(page)).not.toContainText(CUPS);
  await expectInputsKept(page);
});

test("T18: 500 shows S8 with Retry; Retry resends the same body and shares; 360 px layout", async ({ page }) => {
  await stubShare(page);
  const { premiumRequests } = await openProposals(page, {
    premium: [errorReply(500, "report_generation_failed"), pdfReply],
  });
  await page.getByRole("textbox", { name: "Importe fijo Media Luz" }).fill("12,5");
  await fullReport(page).click();
  await expect(premiumAlert(page)).toContainText(S8);
  await expect(retry(page)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/t18-retry-${test.info().project.name}.png` });

  await page.setViewportSize({ width: 360, height: 640 });
  const menu = await page.getByRole("button", { name: "Abrir menú" }).boundingBox();
  const c = await createReport(page).boundingBox();
  const f = await fullReport(page).boundingBox();
  const r = await retry(page).boundingBox();
  const table = await page.getByTestId("comparator-scroll").boundingBox();
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(c!.x);
  expect(c!.x + c!.width).toBeLessThanOrEqual(f!.x + 1);
  expect(f!.x + f!.width).toBeLessThanOrEqual(360);
  for (const box of [c!, f!, r!]) expect(box.height).toBeGreaterThanOrEqual(44);
  expect(r!.x + r!.width).toBeLessThanOrEqual(360);
  expect(r!.y + r!.height).toBeLessThanOrEqual(table!.y);
  await page.screenshot({ path: `${SHOTS}/t18-retry-360-${test.info().project.name}.png` });

  await retry(page).click();
  await expect.poll(async () => (await shareCalls(page)).length).toBe(1);
  expect(premiumRequests).toHaveLength(2);
  expect(premiumRequests[1].postData()).toBe(premiumRequests[0].postData());
  await expect(premiumAlert(page)).toHaveCount(0);
  await expectInputsKept(page);
});
