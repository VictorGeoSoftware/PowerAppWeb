/**
 * Comparator PDF request, ported from BmApp `ProposalsViewModel.buildComparatorReportModel`
 * + `ComparatorReportPdfMapper` (1:1). The backend renders the PDF.
 */
import type { ComparatorSummary } from "@/lib/comparator/calculate";
import { percentLabel, twoDecimals } from "@/lib/comparator/format";
import type { ProposalPrice } from "@/lib/comparator/proposal";
import { toTwoDecimals } from "@/lib/comparator/rounding";
import type { ConsumptionSession } from "@/lib/gate/fee-first";

export const COMPARATOR_REPORT_TITLE = "COMPARATIVO ANUAL DE PRECIOS FIJOS";
export const CUSTOMER_COLUMN_TITLE = "CONDICIONES ACTUALES";
const PLACEHOLDER = "--";
const DEFAULT_AMOUNT = "0.00";

type PeriodValue = { period: string; value: number };

export type ComparatorReportColumn = {
  title: string;
  powerTermItems: number[];
  annualPowerTermCost: string;
  consumedEnergyItems: number[];
  annualEnergyCost: string;
  extraServices: string;
  electricalTax: string;
  iva: string;
  totalAnnualPrice: string;
};

export type ComparatorReportProposal = ComparatorReportColumn & {
  annualPriceDifference: string | null;
  annualSavingsPercentage: number | null;
};

export type ComparatorReportPdfRequest = {
  title: string;
  supplyHolder: string;
  supplyAddress: string;
  cups: string;
  tariffName: string;
  powerTermRows: PeriodValue[];
  energyConsumedRows: PeriodValue[];
  iva: string;
  impuestoElectrico: string;
  customerConditions: ComparatorReportColumn;
  proposals: ComparatorReportProposal[];
};

/** Kotlin `ifBlank`. */
const ifBlank = (value: string | null | undefined, fallback: string) =>
  value == null || value.trim() === "" ? fallback : value;

const own = <V>(record: Record<string, V>, key: string): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

export function buildComparatorReportRequest(
  session: ConsumptionSession,
  summary: ComparatorSummary,
  visibleProposals: ProposalPrice[],
  fixedAmountByTitle: Record<string, string>,
): ComparatorReportPdfRequest {
  const customer = summary.customerConditions;
  return {
    title: COMPARATOR_REPORT_TITLE,
    supplyHolder: ifBlank(session.holderName, PLACEHOLDER),
    supplyAddress: ifBlank(session.address, PLACEHOLDER),
    cups: ifBlank(session.cups, PLACEHOLDER),
    tariffName: session.feeType ?? "",
    powerTermRows: (session.powerRows ?? []).map((r) => ({
      period: r.period,
      value: r.value,
    })),
    // BmApp stores annual kWh as Int.
    energyConsumedRows: (session.energyRows ?? []).map((r) => ({
      period: r.period,
      value: Math.trunc(r.value),
    })),
    iva: percentLabel(session.iva ?? 0),
    impuestoElectrico: percentLabel(session.electricTaxPercent ?? 0),
    customerConditions: {
      title: CUSTOMER_COLUMN_TITLE,
      powerTermItems: customer.powerTermItems,
      annualPowerTermCost: customer.annualPowerTermCost,
      consumedEnergyItems: customer.consumedEnergyItems,
      annualEnergyCost: customer.annualEnergyCost,
      extraServices: customer.extraServices,
      electricalTax: customer.electricTax,
      iva: customer.iva,
      totalAnnualPrice: customer.totalAnnualPrice,
    },
    proposals: visibleProposals.map((p) => {
      const delta = own(summary.annualPriceDeltaByTitle, p.proposalTitle);
      return {
        title: p.proposalTitle,
        powerTermItems: p.powerTermItems,
        annualPowerTermCost: twoDecimals(p.annualPowerTermCost),
        consumedEnergyItems: p.consumedEnergyItems,
        annualEnergyCost: twoDecimals(p.annualEnergyCost),
        extraServices: ifBlank(
          own(fixedAmountByTitle, p.proposalTitle),
          DEFAULT_AMOUNT,
        ),
        electricalTax: twoDecimals(p.electricalTax),
        iva: twoDecimals(p.iva),
        totalAnnualPrice: twoDecimals(p.totalAnnualPrice),
        annualPriceDifference:
          delta === undefined ? null : toTwoDecimals(delta),
        annualSavingsPercentage:
          own(summary.annualSavingsPercentageByTitle, p.proposalTitle) ?? null,
      };
    }),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** BmApp `ComparatorPdfFileStore`: `comparador_yyyyMMdd_HHmmss.pdf` (local time). */
export const comparatorPdfFileName = (now: Date = new Date()) =>
  `comparador_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}.pdf`;
