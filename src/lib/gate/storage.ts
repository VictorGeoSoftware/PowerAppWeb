import type { CurrentConditions } from "./fee-first";

/** Survives reloads, cleared on new study and logout (BmApp SharedPreferences parity). */
export const CONDITIONS_KEY = "bm.currentConditions";
/** Reserved for `consumption-by-cups-manual` (save/restore with 1 h expiry). */
export const LAST_JOB_ID_KEY = "bm.lastCompletedJobId";

export function loadConditions(): CurrentConditions | null {
  try {
    const raw = localStorage.getItem(CONDITIONS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return {
      powerTermPriceByPeriod: v.powerTermPriceByPeriod ?? {},
      energyPriceByPeriod: v.energyPriceByPeriod ?? {},
      extraServices: v.extraServices ?? "",
      companyName: v.companyName ?? null,
    };
  } catch {
    return null;
  }
}

export function saveConditions(conditions: CurrentConditions | null) {
  if (conditions) localStorage.setItem(CONDITIONS_KEY, JSON.stringify(conditions));
  else localStorage.removeItem(CONDITIONS_KEY);
}

/** Clears the study's local data (BmApp `resetActiveStudy`). */
export function clearStudyStorage() {
  localStorage.removeItem(CONDITIONS_KEY);
  localStorage.removeItem(LAST_JOB_ID_KEY);
}
