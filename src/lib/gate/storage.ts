import type { CurrentConditions } from "./fee-first";

/** Survives reloads, cleared on new study and logout (BmApp SharedPreferences parity). */
export const CONDITIONS_KEY = "bm.currentConditions";
/** `{jobId, savedAt}` of the last completed study; restored if < 1 h old (BmApp parity). */
export const LAST_JOB_ID_KEY = "bm.lastCompletedJobId";
/** sessionStorage `{jobId, source, cups?, attempts}` of the job being polled; resumed on reload. */
export const ACTIVE_JOB_KEY = "bm.activeJob";
/** sessionStorage job ids whose Collected Prices were already sent (see conditions/collected-prices). */
export const COLLECTED_PRICES_JOBS_KEY = "bm.collectedPricesJobIds";
/** Comparator fixed amount typed per proposal title, as typed (BmApp `proposalFixedAmountByTitle`). */
export const PROPOSAL_FIXED_AMOUNTS_KEY = "bm.proposalFixedAmounts";
/** Hidden proposal titles (`false` entries only); BmApp keeps this in memory, the web keeps it per study. */
export const PROPOSAL_VISIBILITY_KEY = "bm.proposalVisibility";
/** Last `jobId@customerTotal` the uncompetitive auto-hide ran for (BmApp `lastAutoHideSignature`). */
export const PROPOSAL_AUTO_HIDE_SIGNATURE_KEY = "bm.proposalAutoHideSignature";
/** jobId already counted as a `proposals-response` (once per job, when the table is first shown). */
export const PROPOSALS_RESPONSE_JOB_ID_KEY = "bm.proposalsResponseJobId";
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

export function loadProposalFixedAmounts(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(PROPOSAL_FIXED_AMOUNTS_KEY) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

export function saveProposalFixedAmounts(amounts: Record<string, string>) {
  try {
    if (Object.keys(amounts).length > 0) localStorage.setItem(PROPOSAL_FIXED_AMOUNTS_KEY, JSON.stringify(amounts));
    else localStorage.removeItem(PROPOSAL_FIXED_AMOUNTS_KEY);
  } catch {
    // storage unavailable: amounts live in memory only
  }
}

export function loadProposalVisibility(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(PROPOSAL_VISIBILITY_KEY) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, boolean] => e[1] === false));
  } catch {
    return {};
  }
}

export function saveProposalVisibility(visibility: Record<string, boolean>) {
  try {
    const hidden = Object.fromEntries(Object.entries(visibility).filter(([, v]) => v === false));
    if (Object.keys(hidden).length > 0) localStorage.setItem(PROPOSAL_VISIBILITY_KEY, JSON.stringify(hidden));
    else localStorage.removeItem(PROPOSAL_VISIBILITY_KEY);
  } catch {
    // storage unavailable: visibility lives in memory only
  }
}

export function loadAutoHideSignature(): string | null {
  try {
    return localStorage.getItem(PROPOSAL_AUTO_HIDE_SIGNATURE_KEY);
  } catch {
    return null;
  }
}

export function saveAutoHideSignature(signature: string) {
  try {
    localStorage.setItem(PROPOSAL_AUTO_HIDE_SIGNATURE_KEY, signature);
  } catch {
    // storage unavailable: the in-memory guard still applies
  }
}

export function loadProposalsResponseJobId(): string | null {
  try {
    return localStorage.getItem(PROPOSALS_RESPONSE_JOB_ID_KEY);
  } catch {
    return null;
  }
}

export function saveProposalsResponseJobId(jobId: string) {
  try {
    localStorage.setItem(PROPOSALS_RESPONSE_JOB_ID_KEY, jobId);
  } catch {
    // storage unavailable: the in-memory guard still applies
  }
}

/** Clears the study's local data (BmApp `resetActiveStudy`). */
export function clearStudyStorage() {
  localStorage.removeItem(CONDITIONS_KEY);
  localStorage.removeItem(PROPOSALS_RESPONSE_JOB_ID_KEY);
  localStorage.removeItem(PROPOSAL_FIXED_AMOUNTS_KEY);
  localStorage.removeItem(PROPOSAL_VISIBILITY_KEY);
  localStorage.removeItem(PROPOSAL_AUTO_HIDE_SIGNATURE_KEY);
  localStorage.removeItem(LAST_JOB_ID_KEY);
  saveActiveJob(null);
  try {
    sessionStorage.removeItem(COLLECTED_PRICES_JOBS_KEY);
  } catch {
    // storage unavailable
  }
}
