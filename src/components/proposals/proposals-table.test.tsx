import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/proposals", useRouter: () => ({ replace: vi.fn() }) }));
const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/components/auth/auth-provider", () => ({
  FullScreenSpinner: () => <div role="status" />,
  useAuth: () => ({ user: auth.user, reportApiError: vi.fn() }),
}));
const sendUserActivity = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/auth/user-activity", () => ({ sendUserActivity }));

import { FeeFirstGateProvider } from "@/components/gate/fee-first-gate-provider";
import { calculateComparatorSummary } from "@/lib/comparator/calculate";
import { twoDecimals } from "@/lib/comparator/format";
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";
import { PROPOSALS_RESPONSE_JOB_ID_KEY, saveAutoHideSignature, saveConditions, saveProposalVisibility } from "@/lib/gate/storage";
import { autoHideSignature } from "@/lib/proposals/visibility";
import { ProposalsComparator } from "./proposals-table";

const proposal = (proposalTitle: string, total: number) => ({
  proposalTitle,
  powerTermItems: [0.08, 0.05],
  annualPowerTermCost: 200,
  consumedEnergyItems: [0.12, 0.1],
  annualEnergyCost: 300,
  extraServices: 0,
  iva: 105,
  electricalTax: 25.55,
  totalAnnualPrice: total,
});

const session: ConsumptionSession = {
  jobId: "job-1",
  feeType: "3.0TD",
  iva: 21,
  electricTaxPercent: 5.11269632,
  powerRows: [
    { period: "P1", value: 4.6 },
    { period: "P2", value: 5 },
  ],
  energyRows: [
    { period: "P1", value: 1234.7 },
    { period: "P2", value: 800 },
  ],
  powerPeriods: ["P1", "P2"],
  energyPeriods: ["P1", "P2"],
  proposals: [proposal("Barata", 500), proposal("IBERDROLA PLAN ESTABLE A CO 5", 9000)],
};

const conditions: CurrentConditions = {
  powerTermPriceByPeriod: { P1: "0,1", P2: "0.1" },
  energyPriceByPeriod: { P1: "0.2", P2: "0.2" },
  extraServices: "10",
  companyName: "Endesa",
};

const renderTable = (s: ConsumptionSession = session) =>
  render(
    <FeeFirstGateProvider initialSession={s}>
      <ProposalsComparator />
    </FeeFirstGateProvider>,
  );

describe("ProposalsComparator", () => {
  beforeEach(() => {
    auth.user = null;
    sendUserActivity.mockClear();
    localStorage.clear();
    saveConditions(conditions);
  });

  it("renders labels, customer and proposal columns in order with BmApp formatting", () => {
    const summary = calculateComparatorSummary(session, conditions, {});
    saveAutoHideSignature(autoHideSignature("job-1", summary.customerTotalAnnualPrice));
    renderTable();
    expect(screen.getByText("3.0TD")).toBeTruthy();
    expect(screen.getByText("4.6")).toBeTruthy();
    expect(screen.getByText("5.0")).toBeTruthy();
    expect(screen.getByText("1234")).toBeTruthy();
    expect(screen.getByText("5.11 %")).toBeTruthy();
    expect(screen.getByText("21.00 %")).toBeTruthy();

    const customer = screen.getByTestId("customer-column");
    expect(within(customer).getByText("Tarifa actual")).toBeTruthy();
    expect(within(customer).getAllByText("0.1")).toHaveLength(2);
    expect(within(customer).getByTestId("total").textContent).toBe(`${summary.customerConditions.totalAnnualPrice}€`);

    const columns = screen.getAllByTestId("proposal-column");
    expect(columns).toHaveLength(2);
    expect(within(columns[0]).getByText("Barata")).toBeTruthy();
    expect(within(columns[1]).getByText("IBERDRO...E A CO 5")).toBeTruthy();
    expect(within(columns[0]).getAllByText("0.080000")).toHaveLength(1);
    expect(within(columns[0]).getByTestId("total").textContent).toBe("500.00€");

    const cheap = within(columns[0]).getByTestId("delta");
    const dear = within(columns[1]).getByTestId("delta");
    const d = summary.annualPriceDeltaByTitle;
    const pct = summary.annualSavingsPercentageByTitle;
    expect(cheap.textContent).toBe(`${twoDecimals(d.Barata)}€ (${pct.Barata}%)`);
    expect(cheap.dataset.tone).toBe("positive");
    expect(dear.dataset.tone).toBe("negative");
    expect(dear.className).toContain("text-delta-negative");

    expect(screen.getByTestId("best-option").textContent).toContain("Mejor opción: Barata");
    expect(screen.getByTestId("best-option").textContent).toContain(
      `Ahorro estimado de ${twoDecimals(d.Barata)}\u00A0€ al año frente a sus condiciones actuales.`,
    );
  });

  it("fixed amount filters input and recalculates IVA and total", () => {
    renderTable();
    const input = screen.getByRole("textbox", { name: "Importe fijo Barata" }) as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.placeholder).toBe("0.00");
    fireEvent.change(input, { target: { value: "12,5" } });
    expect(input.value).toBe("12,5");
    fireEvent.change(input, { target: { value: "12,555" } });
    expect(input.value).toBe("12,5");
    const column = screen.getAllByTestId("proposal-column")[0];
    expect(within(column).getByTestId("total").textContent).toBe("512.50€");
    const iva = calculateComparatorSummary(session, conditions, { Barata: "12,5" }).proposals[0].iva;
    expect(within(column).getByText(twoDecimals(iva))).toBeTruthy();
  });

  it("no best card when every proposal is dearer; empty state without proposals", () => {
    const { unmount } = renderTable({ ...session, proposals: [proposal("Cara", 99999)] });
    expect(screen.queryByTestId("best-option")).toBeNull();
    unmount();
    renderTable({ ...session, proposals: [] });
    expect(screen.getByText("Aún no hay propuestas que comparar.")).toBeTruthy();
    expect(screen.queryByTestId("comparator-scroll")).toBeNull();
  });

  it("auto-hides uncompetitive proposals once per signature", () => {
    const { unmount } = renderTable();
    const columns = screen.getAllByTestId("proposal-column");
    expect(columns).toHaveLength(1);
    expect(within(columns[0]).getByText("Barata")).toBeTruthy();
    expect(localStorage.getItem("bm.proposalVisibility")).toBe('{"IBERDROLA PLAN ESTABLE A CO 5":false}');
    unmount();
    // Re-shown by the Broker: the same signature never hides it again.
    saveProposalVisibility({});
    renderTable();
    expect(screen.getAllByTestId("proposal-column")).toHaveLength(2);
  });

  it("hidden proposals have no column and are not the best option; all hidden is empty", () => {
    const s = { ...session, proposals: [proposal("Barata", 500), proposal("Media", 600)] };
    saveProposalVisibility({ Barata: false });
    const { unmount } = renderTable(s);
    const columns = screen.getAllByTestId("proposal-column");
    expect(columns).toHaveLength(1);
    expect(within(columns[0]).getByText("Media")).toBeTruthy();
    expect(screen.getByTestId("best-option").textContent).toContain("Mejor opción: Media");
    unmount();
    saveProposalVisibility({ Barata: false, Media: false });
    renderTable(s);
    expect(screen.getByText("Aún no hay propuestas que comparar.")).toBeTruthy();
  });

  describe("proposals-response", () => {
    const user = { email: "b@x.es", displayName: "B" };
    const responses = () => sendUserActivity.mock.calls.filter((c) => (c as unknown[])[1] === "proposals-response");
    beforeEach(() => {
      auth.user = user;
    });

    it("is sent once per jobId, not on re-render, remount or fixed-amount edits", () => {
      const { unmount } = renderTable();
      expect(responses()).toHaveLength(1);
      expect(responses()[0]).toEqual([user, "proposals-response"]);
      fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "12" } });
      unmount();
      renderTable().unmount();
      expect(responses()).toHaveLength(1);
      expect(localStorage.getItem(PROPOSALS_RESPONSE_JOB_ID_KEY)).toBe("job-1");
    });

    it("a new jobId counts again", () => {
      renderTable().unmount();
      renderTable({ ...session, jobId: "job-2" });
      expect(responses()).toHaveLength(2);
    });

    it("is not sent for the empty state", () => {
      renderTable({ ...session, proposals: [] });
      expect(responses()).toHaveLength(0);
    });
  });
});
