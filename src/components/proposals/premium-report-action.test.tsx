import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bmFetch: vi.fn(),
  reportApiError: vi.fn(),
  invalidate: vi.fn(),
  shareOrDownload: vi.fn(),
  sharePdf: vi.fn(),
  downloadBlob: vi.fn(),
  user: { uid: "U1", getIdToken: async () => "T" } as unknown,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: h.user, reportApiError: h.reportApiError }),
}));
vi.mock("@/lib/api/bm-fetch", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/bm-fetch")>()),
  bmFetch: h.bmFetch,
}));
vi.mock("@/components/access/report-access-provider", () => ({
  useReportAccess: () => ({ comprehensiveReport: true, refresh: vi.fn(), invalidate: h.invalidate }),
}));
vi.mock("@/lib/pdf/share-file", () => ({
  shareOrDownload: h.shareOrDownload,
  sharePdf: h.sharePdf,
  downloadBlob: h.downloadBlob,
}));

import { BmApiError } from "@/lib/api/bm-fetch";
import type { ComparatorReportPdfRequest } from "@/lib/pdf/comparator-report";
import {
  PREMIUM_ADDRESS_MISSING,
  PREMIUM_CONDITIONS_MISSING,
  PREMIUM_DATA_MISMATCH,
  PREMIUM_GENERATION_FAILED,
  PREMIUM_HOLDER_MISSING,
  PREMIUM_REQUIRED_MESSAGE,
  PREMIUM_STUDY_EXPIRED,
} from "@/lib/proposals/messages";
import { PremiumReportAlert, usePremiumReport } from "./premium-report-action";
import { PremiumReportButton } from "./premium-report-button";

const request = (over: Partial<ComparatorReportPdfRequest> = {}) =>
  ({
    title: "COMPARATIVO ANUAL DE PRECIOS FIJOS",
    supplyHolder: "Ana",
    supplyAddress: "C/ Mayor 1",
    cups: "ES00",
    proposals: [{ title: "A" }],
    ...over,
  }) as ComparatorReportPdfRequest;

const pdf = (headers: Record<string, string> = { "content-disposition": "attachment; filename=informe_completo_7.pdf" }, body = "%PDF") =>
  new Response(body, { status: 200, headers });

let current: ReturnType<typeof usePremiumReport>;
function Harness({ build, jobId = "job-1" }: { build: () => ComparatorReportPdfRequest | null; jobId?: string }) {
  current = usePremiumReport(build, jobId);
  return (
    <>
      <PremiumReportButton generating={current.generating} onClick={() => void current.generate()} />
      {current.error && (
        <PremiumReportAlert message={current.error.message} onRetry={current.error.retry ? () => void current.retry() : undefined} />
      )}
      <span data-testid="ready">{String(current.ready)}</span>
    </>
  );
}
const tap = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Informe completo" })));
const alertText = () => screen.queryByRole("alert")?.querySelector("p")?.textContent ?? null;
const retryButton = () => screen.queryByRole("button", { name: "Reintentar" });

beforeEach(() => {
  for (const f of [h.bmFetch, h.reportApiError, h.invalidate, h.shareOrDownload, h.sharePdf, h.downloadBlob]) f.mockReset();
  h.shareOrDownload.mockResolvedValue("shared");
});

describe("usePremiumReport", () => {
  it("T4: POSTs {jobId, comparison} with the Basic body and shares with the server file name", async () => {
    const body = request();
    h.bmFetch.mockResolvedValue(pdf());
    render(<Harness build={() => body} />);
    await tap();
    expect(h.bmFetch).toHaveBeenCalledTimes(1);
    const [user, path, init] = h.bmFetch.mock.calls[0];
    expect(user).toBe(h.user);
    expect(path).toBe("reports/premium-pdf");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Accept: "application/pdf, application/json" });
    expect(JSON.parse(init.body)).toEqual({ jobId: "job-1", comparison: body });
    const [blob, name, title] = h.shareOrDownload.mock.calls[0];
    expect(blob.type).toBe("application/pdf");
    expect(name).toBe("informe_completo_7.pdf");
    expect(title).toBe("Informe completo");
    expect(alertText()).toBeNull();
    expect(screen.getByRole("button", { name: "Informe completo" }).hasAttribute("disabled")).toBe(false);
  });

  it("fallback file name without Content-Disposition", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    h.bmFetch.mockResolvedValue(pdf({}));
    render(<Harness build={() => request()} />);
    await tap();
    expect(h.shareOrDownload.mock.calls[0][1]).toBe("informe_completo_1234.pdf");
    vi.restoreAllMocks();
  });

  it("T5: needs-gesture keeps the PDF for the ready panel; share/download/dismiss", async () => {
    h.bmFetch.mockImplementation(async () => pdf());
    h.shareOrDownload.mockResolvedValue("needs-gesture");
    render(<Harness build={() => request()} />);
    await tap();
    expect(screen.getByTestId("ready").textContent).toBe("true");
    h.sharePdf.mockResolvedValue("shared");
    await act(async () => current.share());
    expect(h.sharePdf.mock.calls[0][1]).toBe("informe_completo_7.pdf");
    expect(h.sharePdf.mock.calls[0][2]).toBe("Informe completo");
    expect(screen.getByTestId("ready").textContent).toBe("false");
    await tap();
    act(() => current.download());
    expect(h.downloadBlob.mock.calls[0][1]).toBe("informe_completo_7.pdf");
    await tap();
    act(() => current.dismiss());
    expect(screen.getByTestId("ready").textContent).toBe("false");
  });

  it("T6: cancelled share shows nothing", async () => {
    h.bmFetch.mockResolvedValue(pdf());
    h.shareOrDownload.mockResolvedValue("cancelled");
    render(<Harness build={() => request()} />);
    await tap();
    expect(alertText()).toBeNull();
    expect(screen.getByTestId("ready").textContent).toBe("false");
  });

  it("T7: empty body is S8 with Retry", async () => {
    h.bmFetch.mockResolvedValue(pdf(undefined, ""));
    render(<Harness build={() => request()} />);
    await tap();
    expect(alertText()).toContain(PREMIUM_GENERATION_FAILED);
    expect(retryButton()).not.toBeNull();
    expect(h.shareOrDownload).not.toHaveBeenCalled();
  });

  it.each([
    ["T1 blank holder", { supplyHolder: "--" }, PREMIUM_HOLDER_MISSING],
    ["T1 spaces holder", { supplyHolder: "  " }, PREMIUM_HOLDER_MISSING],
    ["T2 blank address", { supplyAddress: "--" }, PREMIUM_ADDRESS_MISSING],
  ])("%s: message without request or Retry", async (_n, over, message) => {
    render(<Harness build={() => request(over)} />);
    await tap();
    expect(alertText()).toBe(message);
    expect(retryButton()).toBeNull();
    expect(h.bmFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Informe completo" }).hasAttribute("disabled")).toBe(false);
  });

  it("T8: premium_required shows S1, invalidates access, no sign-out", async () => {
    h.bmFetch.mockRejectedValue(new BmApiError(403, "Premium", "premium_required"));
    render(<Harness build={() => request()} />);
    await tap();
    expect(alertText()).toBe(PREMIUM_REQUIRED_MESSAGE);
    expect(retryButton()).toBeNull();
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(h.reportApiError).not.toHaveBeenCalled();
  });

  it.each([
    ["T9 grant 403 without code", new BmApiError(403, "No autorizada")],
    ["T9 403 other code", new BmApiError(403, "x", "forbidden")],
    ["T10 401", new BmApiError(401, "expired")],
    ["revoked Firebase", Object.assign(new Error("x"), { code: "auth/user-disabled" })],
  ])("%s: existing forced sign-out, no Premium message", async (_n, error) => {
    h.bmFetch.mockRejectedValue(error);
    render(<Harness build={() => request()} />);
    await tap();
    expect(h.reportApiError).toHaveBeenCalledWith(error, "U1");
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(alertText()).toBeNull();
  });

  it.each([
    ["T11", new BmApiError(404, "msg CUPS ES00", "study_not_found"), PREMIUM_STUDY_EXPIRED, false],
    ["T14", new BmApiError(422, "m", "current_conditions_missing"), PREMIUM_CONDITIONS_MISSING, false],
    ["T13", new BmApiError(422, "m", "holder_missing"), PREMIUM_HOLDER_MISSING, false],
    ["T15", new BmApiError(422, "m", "stale_offer"), PREMIUM_DATA_MISMATCH, true],
    ["T18 network", new TypeError("fetch failed"), PREMIUM_GENERATION_FAILED, true],
  ])("%s maps by code, never shows the backend message", async (_n, error, message, retry) => {
    h.bmFetch.mockRejectedValue(error);
    render(<Harness build={() => request()} />);
    await tap();
    expect(alertText()).toBe(message);
    expect(retryButton() !== null).toBe(retry);
    expect(h.reportApiError).not.toHaveBeenCalled();
  });

  it("Retry clears the message and sends the same body again; success then shares", async () => {
    const body = request();
    h.bmFetch.mockRejectedValueOnce(new BmApiError(500, "boom", "report_generation_failed")).mockResolvedValueOnce(pdf());
    render(<Harness build={() => body} />);
    await tap();
    expect(alertText()).toBe(PREMIUM_GENERATION_FAILED);
    await act(async () => fireEvent.click(retryButton()!));
    expect(h.bmFetch).toHaveBeenCalledTimes(2);
    expect(h.bmFetch.mock.calls[1][2].body).toBe(h.bmFetch.mock.calls[0][2].body);
    expect(alertText()).toBeNull();
    expect(h.shareOrDownload).toHaveBeenCalledTimes(1);
  });

  it("a new tap clears the previous message", async () => {
    h.bmFetch.mockRejectedValueOnce(new BmApiError(422, "m", "stale_offer"));
    let resolve!: (r: Response) => void;
    h.bmFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    render(<Harness build={() => request()} />);
    await tap();
    expect(alertText()).toBe(PREMIUM_DATA_MISMATCH);
    await tap();
    expect(alertText()).toBeNull();
    await act(async () => resolve(pdf()));
  });

  it("only one request in flight: spinner, aria-busy, disabled, double tap ignored", async () => {
    let resolve!: (r: Response) => void;
    h.bmFetch.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<Harness build={() => request()} />);
    await tap();
    const button = screen.getByRole("button", { name: "Informe completo" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    await act(async () => void current.generate());
    expect(h.bmFetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve(pdf()));
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("no jobId or no request: nothing is sent", async () => {
    render(<Harness build={() => null} />);
    await tap();
    expect(h.bmFetch).not.toHaveBeenCalled();
  });
});
