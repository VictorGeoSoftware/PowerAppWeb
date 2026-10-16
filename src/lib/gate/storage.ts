import type { CurrentConditions } from "./fee-first";

/** Survives reloads, cleared on new study and logout (BmApp SharedPreferences parity). */
export const CONDITIONS_KEY = "bm.currentConditions";
/** `{jobId, savedAt}` of the last completed study; restored if < 1 h old (BmApp parity). */
export const LAST_JOB_ID_KEY = "bm.lastCompletedJobId";
/** sessionStorage `{jobId, source, cups?, attempts}` of the job being polled; resumed on reload. */
export const ACTIVE_JOB_KEY = "bm.activeJob";
export const LAST_JOB_ID_EXPIRY_MS = 60 * 60 * 1000;

export type JobSource = "cups" | "pdf" | "photo";
export type ActiveJob = { jobId: string; source: JobSource; cups?: string; attempts: number };

export function saveActiveJob(job: ActiveJob | null) {
  try {
    if (job) sessionStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
    else sessionStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    // storage unavailable: resume is best effort
  }
}

export function loadActiveJob(): ActiveJob | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(ACTIVE_JOB_KEY) ?? "null");
    if (!v || typeof v.jobId !== "string" || !v.jobId) return null;
    // Entries written before the PDF source existed have no `source`: they are CUPS jobs.
    const source: JobSource = v.source === "pdf" || v.source === "photo" ? v.source : "cups";
    const job: ActiveJob = { jobId: v.jobId, source, attempts: Number(v.attempts) || 0 };
    if (source === "cups") job.cups = typeof v.cups === "string" ? v.cups : "";
    return job;
  } catch {
    return null;
  }
}

export function saveLastCompletedJobId(jobId: string, now = Date.now()) {
  localStorage.setItem(LAST_JOB_ID_KEY, JSON.stringify({ jobId, savedAt: now }));
}

export const clearLastCompletedJobId = () => localStorage.removeItem(LAST_JOB_ID_KEY);

/** BmApp `getValidOrNull`: missing, corrupt or older than 1 h → cleared, null. */
export function loadLastCompletedJobId(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_JOB_ID_KEY) ?? "null");
    if (v && typeof v.jobId === "string" && v.jobId && typeof v.savedAt === "number" && v.savedAt > 0) {
      if (now - v.savedAt <= LAST_JOB_ID_EXPIRY_MS) return v.jobId;
    }
  } catch {
    // fall through
  }
  clearLastCompletedJobId();
  return null;
}

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
  saveActiveJob(null);
}
