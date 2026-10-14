import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/fetch-consumption", useRouter: () => ({ replace: vi.fn() }) }));
const reportApiError = vi.fn(() => false);
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "u1", getIdToken: async () => "tok" }, reportApiError }),
  FullScreenSpinner: () => null,
}));

import FetchConsumptionPage from "@/app/(app)/fetch-consumption/page";
import { FeeFirstGateProvider, useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import {
  ACTIVE_JOB_KEY,
  LAST_JOB_ID_KEY,
  loadActiveJob,
  saveActiveJob,
  saveLastCompletedJobId,
} from "@/lib/gate/storage";
import { ConsumptionStudyProvider, visibleSleep } from "./consumption-study-provider";

const report = {
  success: true,
  userData: { cups_code: "ES0031607515707001RC" },
  consumptionData: {
    cups: "ES0031607515707001RC",
    feeType: "2.0TD",
    annualConsumptionP1: 1000,
    annualConsumptionP2: 0,
    annualConsumptionP3: 0,
    annualConsumptionP4: 0,
    annualConsumptionP5: 0,
    annualConsumptionP6: 0,
    subscribedPowerP1: 4.6,
    subscribedPowerP2: 0,
    subscribedPowerP3: 0,
    subscribedPowerP4: 0,
    subscribedPowerP5: 0,
    subscribedPowerP6: 0,
  },
  proposals: [],
  iva: 21,
  impuestoElectrico: 5.11,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Backend = { statuses?: string[]; submitStatus?: number; resultStatus?: number };
function stubBackend({ statuses = ["PROCESSING", "COMPLETED"], submitStatus = 202, resultStatus = 200 }: Backend = {}) {
  let i = 0;
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("fetch-user-consumption-report"))
      return json(submitStatus === 202 ? { jobId: "job-1" } : { message: "x" }, submitStatus);
    if (url.includes("consumption-report-status")) return json({ status: statuses[Math.min(i++, statuses.length - 1)] });
    return json(resultStatus === 200 ? report : { message: "Job not found" }, resultStatus);
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

let gate: ReturnType<typeof useFeeFirstGate>;
function Probe() {
  gate = useFeeFirstGate();
  return <p>stage:{gate.stage}</p>;
}

const renderPage = (sleep: (ms: number, s?: AbortSignal) => Promise<void> = async () => {}) =>
  render(
    <FeeFirstGateProvider>
      <ConsumptionStudyProvider sleep={sleep}>
        <Probe />
        <FetchConsumptionPage />
      </ConsumptionStudyProvider>
    </FeeFirstGateProvider>,
  );

describe("ConsumptionStudyProvider + /fetch-consumption", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("validates live and submits the corrected CUPS, then publishes the session", async () => {
    const calls = stubBackend();
    renderPage();
    const input = screen.getByLabelText("Introducir código CUPS");
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    expect(screen.getByText("Introduce el CUPS que aparece en la factura")).toBeInTheDocument();
    await userEvent.type(input, "ES0031607515707001RD");
    expect(screen.getByText("Formato no válido")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(confirm).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "es 0O31 6075 1570 7001 rc");
    expect(screen.getByText("Formato válido")).toBeInTheDocument();
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.getByText("stage:CURRENT_CONDITIONS_REQUIRED")).toBeInTheDocument());
    const post = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(post[1]!.body as string)).toEqual({ cupsCode: "ES0031607515707001RC" });
    expect(calls).toEqual([
      "POST /api/bm/fetch-user-consumption-report-by-cups",
      "GET /api/bm/consumption-report-status/job-1",
      "GET /api/bm/consumption-report-status/job-1",
      "GET /api/bm/consumption-report-result/job-1",
    ]);
    expect(gate.session).toMatchObject({ jobId: "job-1", cups: "ES0031607515707001RC", energyPeriods: ["P1"] });
    expect(sessionStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAST_JOB_ID_KEY)!).jobId).toBe("job-1");
  });

  it("shows the failure above the form with the CUPS kept", async () => {
    stubBackend({ statuses: ["FAILED"] });
    renderPage();
    await userEvent.type(screen.getByLabelText("Introducir código CUPS"), "ES0031607515707001RC");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El procesamiento ha fallado. Inténtalo de nuevo.");
    expect(screen.getByLabelText("Introducir código CUPS")).toHaveValue("ES0031607515707001RC");
    expect(sessionStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
  });

  it("submit rejected → submit message", async () => {
    stubBackend({ submitStatus: 400 });
    renderPage();
    await userEvent.type(screen.getByLabelText("Introducir código CUPS"), "ES0031607515707001RC");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar el estudio. Inténtalo de nuevo.");
  });

  it("resumes a persisted job on mount without submitting", async () => {
    saveActiveJob({ jobId: "job-1", source: "cups", cups: "ES0031607515707001RC", attempts: 5 });
    const calls = stubBackend({ statuses: ["COMPLETED"] });
    renderPage();
    await waitFor(() => expect(screen.getByText("stage:CURRENT_CONDITIONS_REQUIRED")).toBeInTheDocument());
    expect(calls[0]).toBe("GET /api/bm/consumption-report-status/job-1");
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);
  });

  it("restores a recent completed study; 404 clears the id", async () => {
    saveLastCompletedJobId("job-1");
    stubBackend();
    const { unmount } = renderPage();
    await waitFor(() => expect(screen.getByText("stage:CURRENT_CONDITIONS_REQUIRED")).toBeInTheDocument());
    unmount();

    saveLastCompletedJobId("job-1");
    stubBackend({ resultStatus: 404 });
    renderPage();
    await waitFor(() => expect(localStorage.getItem(LAST_JOB_ID_KEY)).toBeNull());
    expect(screen.getByText("stage:CONSUMPTION_REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  const pdf = (name = "factura.pdf", type = "application/pdf", size?: number) => {
    const f = new File(["%PDF-1.4"], name, { type });
    if (size) Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const pdfInput = () => screen.getByLabelText("Subir factura PDF") as HTMLInputElement;

  it("uploads a picked PDF as multipart and publishes the session", async () => {
    const calls = stubBackend();
    let release: () => void = () => {};
    renderPage(() => new Promise((r) => (release = r)));
    expect(pdfInput()).toHaveAttribute("accept", expect.stringContaining("application/pdf"));
    await userEvent.upload(pdfInput(), pdf());
    await waitFor(() => expect(loadActiveJob()).toEqual({ jobId: "job-1", source: "pdf", attempts: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent("Subiendo factura...");
    for (let i = 0; i < 3; i++) await act(async () => release());
    await waitFor(() => expect(screen.getByText("stage:CURRENT_CONDITIONS_REQUIRED")).toBeInTheDocument());
    expect(calls[0]).toBe("POST /api/bm/fetch-user-consumption-report");
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(((init.body as FormData).get("file") as File).name).toBe("factura.pdf");
    expect(gate.session).toMatchObject({ jobId: "job-1", cups: "ES0031607515707001RC" });
  });

  it("shows Subiendo factura... first", async () => {
    stubBackend({ statuses: ["PENDING"] });
    renderPage(() => new Promise(() => {}));
    await userEvent.upload(pdfInput(), pdf());
    expect(await screen.findByText("Subiendo factura...")).toBeInTheDocument();
  });

  it.each([
    ["not a PDF", () => pdf("foto.png", "image/png"), "Selecciona un archivo PDF."],
    ["too large", () => pdf("a.pdf", "application/pdf", 50 * 1024 * 1024 + 1), "El archivo supera el tamaño máximo de 50 MB."],
  ])("%s → local alert, no request", async (_, file, message) => {
    stubBackend();
    renderPage();
    await userEvent.upload(pdfInput(), file(), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Introducir código CUPS")).toBeEnabled();
  });

  it("PDF failure shows the error with an empty CUPS field", async () => {
    stubBackend({ submitStatus: 400 });
    renderPage();
    await userEvent.upload(pdfInput(), pdf());
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo iniciar el estudio. Inténtalo de nuevo.");
    expect(screen.getByLabelText("Introducir código CUPS")).toHaveValue("");
    expect(sessionStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
  });

  it("resumes a PDF job without re-uploading", async () => {
    saveActiveJob({ jobId: "job-1", source: "pdf", attempts: 2 });
    const calls = stubBackend({ statuses: ["COMPLETED"] });
    renderPage();
    await waitFor(() => expect(screen.getByText("stage:CURRENT_CONDITIONS_REQUIRED")).toBeInTheDocument());
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);
  });

  it("Nuevo estudio aborts polling and clears the active job", async () => {
    const calls = stubBackend({ statuses: ["PENDING"] });
    let release: () => void = () => {};
    renderPage(() => new Promise((r) => (release = r)));
    await userEvent.type(screen.getByLabelText("Introducir código CUPS"), "ES0031607515707001RC");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(loadActiveJob()).toEqual({ jobId: "job-1", source: "cups", cups: "ES0031607515707001RC", attempts: 0 }));
    expect(screen.getByText("Obtener consumo")).toBeInTheDocument();
    expect(screen.getByText("Consultando CUPS...")).toBeInTheDocument();
    act(() => gate.startNewStudy());
    await act(async () => release());
    expect(sessionStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
    expect(screen.getByLabelText("Introducir código CUPS")).toHaveValue("");
    expect(calls.filter((c) => c.includes("status"))).toHaveLength(0);
  });
});

describe("visibleSleep", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps waiting while the tab is hidden", async () => {
    vi.useFakeTimers();
    let state: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => state);
    let done = false;
    void visibleSleep(3000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toBe(false);
    state = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });
});
