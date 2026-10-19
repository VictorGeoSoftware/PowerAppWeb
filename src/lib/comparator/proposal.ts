/**
 * Proposal price, ported from BmApp `ProposalPriceModel` and the proposal mapping in
 * `ConsumptionReportMapper` + `FormatUtils` (items "%.6f", four cost fields "%.2f",
 * `extraServices` and `iva` raw).
 */
import { formatFixedHalfUp } from "@/lib/comparator/rounding";

export type ProposalPrice = {
  proposalTitle: string;
  powerTermItems: number[];
  annualPowerTermCost: number;
  consumedEnergyItems: number[];
  annualEnergyCost: number;
  extraServices: number;
  iva: number;
  electricalTax: number;
  totalAnnualPrice: number;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumList = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum);

const sixDecimals = (v: number) => Number(formatFixedHalfUp(v, 6));
const priceDecimals = (v: number) => Number(formatFixedHalfUp(v, 2));

/** Maps one backend `ProposalPriceData`; returns null when the entry is malformed. */
export function toProposalPrice(raw: unknown): ProposalPrice | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.proposalTitle !== "string" ||
    !isNumList(r.powerTermItems) ||
    !isNumList(r.consumedEnergyItems) ||
    ![r.annualPowerTermCost, r.annualEnergyCost, r.extraServices, r.iva, r.electricalTax, r.totalAnnualPrice].every(
      isNum,
    )
  ) {
    return null;
  }
  return {
    proposalTitle: r.proposalTitle,
    powerTermItems: r.powerTermItems.map(sixDecimals),
    annualPowerTermCost: priceDecimals(r.annualPowerTermCost as number),
    consumedEnergyItems: r.consumedEnergyItems.map(sixDecimals),
    annualEnergyCost: priceDecimals(r.annualEnergyCost as number),
    extraServices: r.extraServices as number,
    iva: r.iva as number,
    electricalTax: priceDecimals(r.electricalTax as number),
    totalAnnualPrice: priceDecimals(r.totalAnnualPrice as number),
  };
}

export const toProposalPrices = (raw: unknown[] | undefined): ProposalPrice[] =>
  (raw ?? []).map(toProposalPrice).filter((p): p is ProposalPrice => p !== null);
