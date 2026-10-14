/**
 * Fee-First Gate, ported from BmApp `FeeFirstGateModel`, `EvaluateFeeFirstGateUseCase`
 * and `BmAppRoute` (canReach / fallbackRoute).
 */
export type FeeFirstStage = "CONSUMPTION_REQUIRED" | "CURRENT_CONDITIONS_REQUIRED" | "UNLOCKED";

/** One P1..P6 value of a Consumption Report (zeros are dropped, BmApp parity). */
export type PeriodValue = { period: string; value: number };

/**
 * Consumption Report session (BmApp `ConsumptionSession`). The gate only needs the
 * period labels; the report fields are filled by `toConsumptionSession`.
 */
export type ConsumptionSession = {
  powerPeriods: string[];
  energyPeriods: string[];
  jobId?: string;
  cups?: string;
  feeType?: string;
  iva?: number;
  electricTaxPercent?: number;
  holderName?: string;
  address?: string;
  /** Contracted power per period, kW. */
  powerRows?: PeriodValue[];
  /** Annual consumption per period, kWh. */
  energyRows?: PeriodValue[];
  /** Stored for the comparator; not rendered yet. */
  proposals?: unknown[];
};

/** Broker's Current Conditions as typed (strings, like BmApp's local data source). */
export type CurrentConditions = {
  powerTermPriceByPeriod: Record<string, string>;
  energyPriceByPeriod: Record<string, string>;
  extraServices: string;
  companyName: string | null;
};

const isFilledPrice = (value: string | undefined) => {
  if (value == null) return false;
  const normalized = value.trim().replaceAll(",", ".");
  if (normalized === "") return false;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0;
};

export function evaluateGate(session: ConsumptionSession | null, conditions: CurrentConditions | null) {
  if (!session) return { stage: "CONSUMPTION_REQUIRED" as FeeFirstStage, required: 0, completed: 0 };
  const power = conditions?.powerTermPriceByPeriod ?? {};
  const energy = conditions?.energyPriceByPeriod ?? {};
  const required = session.powerPeriods.length + session.energyPeriods.length + 1; // + supplier
  const completed =
    session.powerPeriods.filter((p) => isFilledPrice(power[p])).length +
    session.energyPeriods.filter((p) => isFilledPrice(energy[p])).length +
    (conditions?.companyName?.trim() ? 1 : 0);
  const complete = required > 0 && completed === required;
  const stage: FeeFirstStage = complete ? "UNLOCKED" : "CURRENT_CONDITIONS_REQUIRED";
  return { stage, required, completed };
}

export const evaluateStage = (session: ConsumptionSession | null, conditions: CurrentConditions | null) =>
  evaluateGate(session, conditions).stage;

export const ROUTES = {
  fetchConsumption: "/fetch-consumption",
  currentConditions: "/current-conditions",
  proposals: "/proposals",
  configuration: "/configuration",
} as const;

const ALLOWED_STAGES: Record<string, readonly FeeFirstStage[]> = {
  [ROUTES.fetchConsumption]: ["CONSUMPTION_REQUIRED"],
  [ROUTES.currentConditions]: ["CURRENT_CONDITIONS_REQUIRED", "UNLOCKED"],
  [ROUTES.proposals]: ["UNLOCKED"],
  [ROUTES.configuration]: ["UNLOCKED"],
};

/** Routes outside the gate table are not gated. */
export const isGatedRoute = (path: string) => path in ALLOWED_STAGES;

export const canReach = (stage: FeeFirstStage, path: string) =>
  !isGatedRoute(path) || ALLOWED_STAGES[path].includes(stage);

export const fallbackRoute = (stage: FeeFirstStage) =>
  stage === "CONSUMPTION_REQUIRED" ? ROUTES.fetchConsumption : ROUTES.currentConditions;

/** Route to redirect to, or null when `path` is reachable (BmApp rule R5). */
export function redirectFor(stage: FeeFirstStage, path: string): string | null {
  if (canReach(stage, path)) return null;
  const fallback = fallbackRoute(stage);
  return fallback === path ? null : fallback;
}

export const LOCKED_HINT_CONSUMPTION = "Carga una factura o escanea un CUPS para empezar el estudio.";
export const LOCKED_HINT_CONDITIONS = "Completa los precios actuales para desbloquear.";

export const lockedHint = (stage: FeeFirstStage) =>
  stage === "CONSUMPTION_REQUIRED" ? LOCKED_HINT_CONSUMPTION : LOCKED_HINT_CONDITIONS;
