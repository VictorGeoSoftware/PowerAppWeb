import type { ConsumptionSession, PeriodValue } from "@/lib/gate/fee-first";

/** BmBackend `JobStatus`. */
export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/** BmBackend `ConsumptionReportResponse` (fields this web reads). */
export type ConsumptionReportResponse = {
  success: boolean;
  userData: {
    cups_code?: string;
    customer_details?: { address?: string | null; name?: string | null } | null;
  };
  consumptionData: {
    cups: string;
    tarifa?: string;
    feeType: string;
    annualConsumptionP1: number;
    annualConsumptionP2: number;
    annualConsumptionP3: number;
    annualConsumptionP4: number;
    annualConsumptionP5: number;
    annualConsumptionP6: number;
    subscribedPowerP1: number;
    subscribedPowerP2: number;
    subscribedPowerP3: number;
    subscribedPowerP4: number;
    subscribedPowerP5: number;
    subscribedPowerP6: number;
  };
  proposals: unknown[];
  iva: number;
  impuestoElectrico: number;
};

type Data = ConsumptionReportResponse["consumptionData"];
const PERIODS = [1, 2, 3, 4, 5, 6] as const;

/** P1..P6, zeros dropped (BmApp `annualConsumptionValues` / `subscribedPowerValues`). */
const rows = (data: Data, prefix: "annualConsumptionP" | "subscribedPowerP"): PeriodValue[] =>
  PERIODS.map((n) => ({ period: `P${n}`, value: Number(data[`${prefix}${n}` as keyof Data]) || 0 })).filter(
    (r) => r.value !== 0,
  );

export function toConsumptionSession(report: ConsumptionReportResponse, jobId: string): ConsumptionSession {
  const data = report.consumptionData;
  const powerRows = rows(data, "subscribedPowerP");
  const energyRows = rows(data, "annualConsumptionP");
  const details = report.userData?.customer_details;
  return {
    jobId,
    cups: report.userData?.cups_code?.trim() || data.cups,
    feeType: data.feeType,
    iva: report.iva,
    electricTaxPercent: report.impuestoElectrico,
    ...(details?.name ? { holderName: details.name } : {}),
    ...(details?.address ? { address: details.address } : {}),
    powerRows,
    energyRows,
    powerPeriods: powerRows.map((r) => r.period),
    energyPeriods: energyRows.map((r) => r.period),
    proposals: report.proposals ?? [],
  };
}
