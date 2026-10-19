/**
 * Comparator pricing rule, ported line by line from BmApp `ProposalCalculationHelper`,
 * `CalculateComparatorSummaryUseCase`, `ComparatorSummaryModel.bestProposalAmong` and
 * `SelectUncompetitiveProposalsUseCase`. Parity is proven by `calculate.golden.test.ts`.
 */
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";
import { toProposalPrices, type ProposalPrice } from "@/lib/comparator/proposal";
import { parseDecimal, roundToInt, roundToTwoDecimals, toTwoDecimals } from "@/lib/comparator/rounding";

/** BmApp `CustomerConditionsColumnModel`. */
export type CustomerConditionsColumn = {
  powerTermItems: number[];
  annualPowerTermCost: string;
  consumedEnergyItems: number[];
  annualEnergyCost: string;
  extraServices: string;
  electricTax: string;
  iva: string;
  totalAnnualPrice: string;
};

/** BmApp `ComparatorSummaryModel`. */
export type ComparatorSummary = {
  proposals: ProposalPrice[];
  customerConditions: CustomerConditionsColumn;
  customerTotalAnnualPrice: number;
  annualPriceDeltaByTitle: Record<string, number>;
  annualSavingsPercentageByTitle: Record<string, number>;
};

const DAYS_IN_YEAR = 365.0;
export const DEFAULT_UNCOMPETITIVE_THRESHOLD_PERCENT = 15;

export const emptyCustomerColumn = (): CustomerConditionsColumn => ({
  powerTermItems: [],
  annualPowerTermCost: "",
  consumedEnergyItems: [],
  annualEnergyCost: "",
  extraServices: "",
  electricTax: "",
  iva: "",
  totalAnnualPrice: "",
});

export const emptyComparatorSummary = (): ComparatorSummary => ({
  proposals: [],
  customerConditions: emptyCustomerColumn(),
  customerTotalAnnualPrice: 0,
  annualPriceDeltaByTitle: {},
  annualSavingsPercentageByTitle: {},
});

export function recalculateProposalWithAdditionalAmount(
  proposal: ProposalPrice,
  additionalAmount: number,
  ivaPercent: number,
): ProposalPrice {
  if (!(additionalAmount > 0.0)) return proposal;
  const additionalIvaPart = additionalAmount * (ivaPercent / 100.0);
  return {
    ...proposal,
    iva: roundToTwoDecimals(proposal.iva + additionalIvaPart),
    totalAnnualPrice: roundToTwoDecimals(proposal.totalAnnualPrice + additionalAmount),
  };
}

export const calculateAnnualPriceDelta = (customerTotal: number, proposalTotal: number) =>
  roundToTwoDecimals(customerTotal - proposalTotal);

export function calculateAnnualSavingsPercentage(customerTotal: number, proposalTotal: number): number {
  if (customerTotal <= 0.0) return 0;
  const annualPriceDelta = customerTotal - proposalTotal;
  return roundToInt((annualPriceDelta / customerTotal) * 100.0);
}

/** Kotlin `sumOf`: left-to-right from 0.0 (order matters for float parity). */
const sumOf = <T>(items: T[], f: (item: T, index: number) => number) =>
  items.reduce((acc, item, index) => acc + f(item, index), 0.0);

/** Map lookup without prototype keys (titles are free text). */
const own = <V>(record: Record<string, V>, key: string): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

export function calculateComparatorSummary(
  session: ConsumptionSession | null,
  conditions: CurrentConditions | null,
  fixedAmountByTitle: Record<string, string>,
): ComparatorSummary {
  if (session == null) return emptyComparatorSummary();

  const ivaPercent = session.iva ?? 0;
  const electricTaxPercent = session.electricTaxPercent ?? 0;
  const powerRows = session.powerRows ?? [];
  // BmApp stores annual kWh as Int (ConsumptionSessionRepositoryImpl truncates).
  const energyRows = (session.energyRows ?? []).map((r) => ({ period: r.period, value: Math.trunc(r.value) }));

  const recalculatedProposals = toProposalPrices(session.proposals).map((proposal) =>
    recalculateProposalWithAdditionalAmount(
      proposal,
      parseDecimal(own(fixedAmountByTitle, proposal.proposalTitle)),
      ivaPercent,
    ),
  );

  const powerPriceByPeriod = conditions?.powerTermPriceByPeriod ?? {};
  const energyPriceByPeriod = conditions?.energyPriceByPeriod ?? {};
  const extraServicesValue = parseDecimal(conditions?.extraServices);

  const powerTermItems = powerRows.map((row) => parseDecimal(own(powerPriceByPeriod, row.period)));
  const consumedEnergyItems = energyRows.map((row) => parseDecimal(own(energyPriceByPeriod, row.period)));

  const annualPowerTermCost = sumOf(powerRows, (row, i) => row.value * powerTermItems[i] * DAYS_IN_YEAR);
  const annualEnergyCost = sumOf(energyRows, (row, i) => row.value * consumedEnergyItems[i]);

  const baseCost = annualPowerTermCost + annualEnergyCost;
  const ivaAmount = baseCost * (ivaPercent / 100.0);
  const electricalTax = baseCost * (electricTaxPercent / 100.0);
  const hasCustomerPrices =
    conditions != null && (powerTermItems.some((it) => it > 0.0) || consumedEnergyItems.some((it) => it > 0.0));
  const totalAnnualPrice = baseCost + extraServicesValue + ivaAmount + electricalTax;

  const customerColumn: CustomerConditionsColumn = {
    powerTermItems,
    annualPowerTermCost: toTwoDecimals(annualPowerTermCost),
    consumedEnergyItems,
    annualEnergyCost: toTwoDecimals(annualEnergyCost),
    extraServices: toTwoDecimals(extraServicesValue),
    electricTax: toTwoDecimals(electricalTax),
    iva: toTwoDecimals(ivaAmount),
    totalAnnualPrice: toTwoDecimals(totalAnnualPrice),
  };

  const deltas: Record<string, number> = {};
  const savings: Record<string, number> = {};
  if (hasCustomerPrices) {
    for (const proposal of recalculatedProposals) {
      deltas[proposal.proposalTitle] = calculateAnnualPriceDelta(totalAnnualPrice, proposal.totalAnnualPrice);
      savings[proposal.proposalTitle] = calculateAnnualSavingsPercentage(totalAnnualPrice, proposal.totalAnnualPrice);
    }
  }

  return {
    proposals: recalculatedProposals,
    customerConditions: hasCustomerPrices ? customerColumn : emptyCustomerColumn(),
    customerTotalAnnualPrice: hasCustomerPrices ? totalAnnualPrice : 0.0,
    annualPriceDeltaByTitle: deltas,
    annualSavingsPercentageByTitle: savings,
  };
}

/** BmApp `ComparatorSummaryModel.bestProposalAmong`: cheapest proposal that beats the customer. */
export function bestProposalAmong(summary: ComparatorSummary, candidates: ProposalPrice[]): ProposalPrice | null {
  if (summary.customerTotalAnnualPrice <= 0.0) return null;
  return minByTotal(candidates.filter((p) => (own(summary.annualPriceDeltaByTitle, p.proposalTitle) ?? 0.0) > 0.0));
}

/** First proposal with the lowest total (Kotlin `minByOrNull`). */
function minByTotal(proposals: ProposalPrice[]): ProposalPrice | null {
  let best: ProposalPrice | null = null;
  for (const p of proposals) if (best === null || p.totalAnnualPrice < best.totalAnnualPrice) best = p;
  return best;
}

/**
 * BmApp `SelectUncompetitiveProposalsUseCase`: titles costing at least `thresholdPercent`
 * more than the customer; the cheapest is kept when every proposal is uncompetitive.
 */
export function selectUncompetitiveProposals(
  summary: ComparatorSummary,
  thresholdPercent: number = DEFAULT_UNCOMPETITIVE_THRESHOLD_PERCENT,
): Set<string> {
  if (summary.customerTotalAnnualPrice <= 0.0) return new Set();
  const uncompetitive = new Set(
    summary.proposals
      .map((p) => p.proposalTitle)
      .filter((title) => {
        const savings = own(summary.annualSavingsPercentageByTitle, title);
        return savings !== undefined && savings <= -thresholdPercent;
      }),
  );
  if (uncompetitive.size < summary.proposals.length) return uncompetitive;
  const cheapest = minByTotal(summary.proposals);
  if (cheapest) uncompetitive.delete(cheapest.proposalTitle);
  return uncompetitive;
}
