import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { bmFetch, topBar } = vi.hoisted(() => ({
  bmFetch: vi.fn(),
  topBar: { set: (() => {}) as (node: React.ReactNode) => void },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/proposals",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/auth/auth-provider", () => ({
  FullScreenSpinner: () => <div role="status" />,
  useAuth: () => ({ user: null }),
}));
vi.mock("@/lib/api/use-bm-fetch", () => ({ useBmFetch: () => bmFetch }));
vi.mock("@/components/shell/app-shell", async () => {
  const { useEffect: useEff } = await import("react");
  return {
    useTopBarAction: (node: React.ReactNode) =>
      useEff(() => {
        topBar.set(node);
        return () => topBar.set(null);
      }, [node]),
  };
});

import { FeeFirstGateProvider } from "@/components/gate/fee-first-gate-provider";
import type { ConsumptionSession } from "@/lib/gate/fee-first";
import { saveConditions, saveProposalVisibility } from "@/lib/gate/storage";
import { ProposalsComparator } from "./proposals-table";

function TopBar() {
  const [node, setNode] = useState<React.ReactNode>(null);
  useEffect(() => {
    topBar.set = setNode;
  }, []);
  return <header>{node}</header>;
}

const proposal = (proposalTitle: string, total: number) => ({
  proposalTitle,
  powerTermItems: [0.08],
  annualPowerTermCost: 200,
  consumedEnergyItems: [0.12],
  annualEnergyCost: 300,
  extraServices: 0,
  iva: 105,
  electricalTax: 25.55,
  totalAnnualPrice: total,
});

const session: ConsumptionSession = {
  jobId: "job-1",
  feeType: "2.0TD",
  iva: 21,
  electricTaxPercent: 5.11269632,
  powerRows: [{ period: "P1", value: 4.6 }],
  energyRows: [{ period: "P1", value: 1234.7 }],
  powerPeriods: ["P1"],
  energyPeriods: ["P1"],
  proposals: [proposal("Barata", 500)],
};

const renderScreen = () =>
  render(
    <FeeFirstGateProvider initialSession={session}>
      <TopBar />
      <ProposalsComparator />
    </FeeFirstGateProvider>,
  );

const createButton = () =>
  screen.getByRole("button", { name: "Crear informe" });
const pdfResponse = () => new Response("%PDF-1.4", { status: 200 });

describe("Crear informe", () => {
  beforeEach(() => {
    localStorage.clear();
    bmFetch.mockReset();
    saveConditions({
      powerTermPriceByPeriod: { P1: "0,1" },
      energyPriceByPeriod: { P1: "0.2" },
      extraServices: "",
      companyName: null,
    });
    Object.assign(navigator, { share: undefined, canShare: undefined });
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows only with visible proposals", () => {
    saveProposalVisibility({ Barata: false });
    renderScreen();
    expect(screen.queryByRole("button", { name: "Crear informe" })).toBeNull();
  });

  it("posts the BmApp body once despite a double tap, spinner while generating, then downloads", async () => {
    let resolve!: (r: Response) => void;
    bmFetch.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderScreen();
    fireEvent.click(createButton());
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(createButton()).toHaveAttribute("aria-busy", "true"),
    );
    expect(createButton()).toBeDisabled();
    expect(bmFetch).toHaveBeenCalledTimes(1);
    const [path, init] = bmFetch.mock.calls[0];
    expect(path).toBe("reports/comparator-pdf");
    expect(init.method).toBe("POST");
    expect(init.headers.Accept).toBe("application/pdf");
    const body = JSON.parse(init.body);
    expect(body.title).toBe("COMPARATIVO ANUAL DE PRECIOS FIJOS");
    expect(body.proposals.map((p: { title: string }) => p.title)).toEqual([
      "Barata",
    ]);
    await act(async () => resolve(pdfResponse()));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(createButton()).not.toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
    click.mockRestore();
  });

  it("shows the BmApp error on a failed request and re-enables the action", async () => {
    bmFetch.mockRejectedValue(new Error("HTTP 500"));
    renderScreen();
    fireEvent.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo generar el informe PDF.",
    );
    await waitFor(() => expect(createButton()).not.toBeDisabled());
  });

  it("an empty PDF is an error", async () => {
    bmFetch.mockResolvedValue(new Response("", { status: 200 }));
    renderScreen();
    fireEvent.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo generar el informe PDF.",
    );
  });

  it("lost user activation shows the ready panel; share and download run on a fresh tap", async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error(), { name: "NotAllowedError" }),
      )
      .mockResolvedValueOnce(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    bmFetch.mockImplementation(async () => pdfResponse());
    renderScreen();
    fireEvent.click(createButton());
    const panel = await screen.findByRole("region", { name: "Informe listo" });
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compartir PDF" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Informe listo" }),
      ).toBeNull(),
    );

    share.mockRejectedValueOnce(
      Object.assign(new Error(), { name: "NotAllowedError" }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await waitFor(() => expect(createButton()).not.toBeDisabled());
    fireEvent.click(createButton());
    await screen.findByRole("region", { name: "Informe listo" });
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Informe listo" })).toBeNull();
    click.mockRestore();
  });
});
