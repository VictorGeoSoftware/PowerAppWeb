import type { User } from "firebase/auth";
import { bmFetch } from "@/lib/api/bm-fetch";
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";
import { COLLECTED_PRICES_JOBS_KEY } from "@/lib/gate/storage";

/** BmApp `CollectedPricesRequest` wire format. */
export type CollectedPricesRequest = {
  companyName: string;
  tariffType: string;
  powerPrices: Record<string, number>;
  energyPrices: Record<string, number>;
  extraServices?: number;
};

/** BmApp `TariffCanonicalForm`: uppercase, letters and digits only. */
export const canonicalTariff = (raw: string) => raw.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");

/** BmApp `ShouldCollectPricesUseCase`: 2.0TD and blank tariffs are excluded. */
export function shouldCollectPrices(tariff?: string | null): boolean {
  const canonical = canonicalTariff(tariff ?? "");
  return canonical !== "" && canonical !== "20TD";
}

/** Kotlin `replace(',', '.').toDoubleOrNull()`: finite numbers only, zero allowed. */
export function parsePrice(value?: string | null): number | undefined {
  const v = (value ?? "").trim().replace(",", ".");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pick(periods: string[], values: Record<string, string>) {
  const out: Record<string, number> = {};
  for (const p of periods) {
    const n = parsePrice(values[p]);
    if (n !== undefined) out[p] = n;
  }
  return out;
}

/** BmApp `BuildCollectedPricesUseCase`: null when there is nothing worth sending. */
export function buildCollectedPrices(
  session: ConsumptionSession | null,
  conditions: CurrentConditions | null,
): CollectedPricesRequest | null {
  if (!session || !conditions) return null;
  const companyName = (conditions.companyName ?? "").trim();
  if (!companyName) return null;
  const powerPrices = pick(session.powerPeriods, conditions.powerTermPriceByPeriod);
  const energyPrices = pick(session.energyPeriods, conditions.energyPriceByPeriod);
  if (!Object.keys(powerPrices).length && !Object.keys(energyPrices).length) return null;
  const body: CollectedPricesRequest = { companyName, tariffType: session.feeType ?? "", powerPrices, energyPrices };
  const extra = parsePrice(conditions.extraServices);
  if (extra !== undefined) body.extraServices = extra;
  return body;
}

/** True only the first time for each job id; survives reloads within the tab. */
export function markCollectedPricesSubmitted(jobId: string): boolean {
  try {
    const raw = JSON.parse(sessionStorage.getItem(COLLECTED_PRICES_JOBS_KEY) ?? "[]");
    const ids: string[] = Array.isArray(raw) ? raw : [];
    if (ids.includes(jobId)) return false;
    sessionStorage.setItem(COLLECTED_PRICES_JOBS_KEY, JSON.stringify([...ids, jobId]));
    return true;
  } catch {
    return true;
  }
}

/** Fire-and-forget: failures are silent, as in BmApp. */
export function submitCollectedPrices(user: Pick<User, "getIdToken">, body: CollectedPricesRequest): Promise<void> {
  return bmFetch(user, "collected-prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(
    () => undefined,
    () => undefined,
  );
}

/** BmApp `onNavigateToProposalsClicked` order: mark job → should collect → build → send. */
export function collectPricesOnNavigate(
  user: Pick<User, "getIdToken">,
  session: ConsumptionSession | null,
  conditions: CurrentConditions | null,
): void {
  const jobId = session?.jobId;
  if (!jobId || !markCollectedPricesSubmitted(jobId)) return;
  if (!shouldCollectPrices(session.feeType)) return;
  const body = buildCollectedPrices(session, conditions);
  if (body) void submitCollectedPrices(user, body);
}
