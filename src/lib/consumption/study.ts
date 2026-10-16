import type { ConsumptionReportResponse, JobStatus } from "./report";
import { billUploadName, photoUploadName } from "./bill-file";
import type { StudyFailure, StudyStep } from "./messages";

/** Backend call through the proxy; throws on non-2xx (see `useBmFetch`). */
export type StudyFetch = (path: string, init?: RequestInit) => Promise<Response>;

export const MAX_POLL_ATTEMPTS = 60;
export const POLL_INTERVAL_MS = 3_000;

export const SUBMIT_PATH = "fetch-user-consumption-report-by-cups";
export const PDF_SUBMIT_PATH = "fetch-user-consumption-report";
export const statusPath = (jobId: string) => `consumption-report-status/${encodeURIComponent(jobId)}`;
export const resultPath = (jobId: string) => `consumption-report-result/${encodeURIComponent(jobId)}`;
export const refreshPath = (jobId: string) => `consumption-report-refresh/${encodeURIComponent(jobId)}`;

export type StudyResult =
  | { ok: true; jobId: string; report: ConsumptionReportResponse }
  | { ok: false; failure: StudyFailure }
  | { ok: false; aborted: true };

export type StudySubmission = { kind: "cups"; cups: string } | { kind: "pdf"; file: File } | { kind: "photo"; file: File };

export type RunStudyOptions = {
  fetch: StudyFetch;
  /** A new job: submittable CUPS (already corrected) or a PDF bill, or */
  submission?: StudySubmission;
  /** an existing job to keep polling (no submit). */
  resumeJobId?: string;
  /** Status attempts already used by the resumed job. */
  startAttempts?: number;
  onStep: (step: StudyStep) => void;
  /** Called after submit (attempts 0) and after every status attempt, for persistence. */
  onProgress?: (jobId: string, attempts: number) => void;
  signal?: AbortSignal;
  /** Waits `ms`; rejects or resolves early when aborted. Injectable for tests and visibility pause. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  maxAttempts?: number;
  intervalMs?: number;
};

export const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

/** GET result; 200 only (202 = still processing counts as a failure). */
export async function fetchResult(fetch: StudyFetch, jobId: string): Promise<ConsumptionReportResponse> {
  const res = await fetch(resultPath(jobId));
  if (res.status !== 200) throw new Error(`Unexpected result status ${res.status}`);
  return (await res.json()) as ConsumptionReportResponse;
}

/**
 * POST refresh of a COMPLETED job: the backend recalculates proposals and taxes from the
 * stored consumption (it never re-runs the job). 200 only; 404 = job gone, 409 = not completed.
 */
export async function refreshReport(fetch: StudyFetch, jobId: string, signal?: AbortSignal): Promise<ConsumptionReportResponse> {
  const res = await fetch(refreshPath(jobId), { method: "POST", signal });
  if (res.status !== 200) throw new Error(`Unexpected refresh status ${res.status}`);
  return (await res.json()) as ConsumptionReportResponse;
}

/** Submit → poll every 3 s (max 60) → fetch result. Port of BmApp `ConsumptionStudyRepositoryImpl`. */
export async function runStudy(opts: RunStudyOptions): Promise<StudyResult> {
  const {
    fetch,
    onStep,
    onProgress,
    signal,
    sleep = defaultSleep,
    maxAttempts = MAX_POLL_ATTEMPTS,
    intervalMs = POLL_INTERVAL_MS,
  } = opts;
  const aborted = () => signal?.aborted === true;
  const ABORTED = { ok: false, aborted: true } as const;
  const fail = (failure: StudyFailure) => (aborted() ? ABORTED : ({ ok: false, failure } as const));

  let jobId = opts.resumeJobId;
  let attempts = opts.startAttempts ?? 0;

  if (!jobId) {
    const sub = opts.submission;
    if (!sub) throw new Error("runStudy needs submission or resumeJobId");
    onStep(sub.kind === "cups" ? "SUBMITTING_CUPS" : "UPLOADING_BILL");
    try {
      let res: Response;
      if (sub.kind === "cups") {
        res = await fetch(SUBMIT_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cupsCode: sub.cups }),
          signal,
        });
      } else {
        // No Content-Type: the browser sets multipart with its boundary.
        const form = new FormData();
        form.append("file", sub.file, sub.kind === "pdf" ? billUploadName(sub.file) : photoUploadName(sub.file));
        res = await fetch(PDF_SUBMIT_PATH, { method: "POST", body: form, signal });
      }
      if (res.status !== 202) return fail("SUBMIT_FAILED");
      const body = (await res.json()) as { jobId?: string };
      if (!body.jobId) return fail("SUBMIT_FAILED");
      jobId = body.jobId;
    } catch {
      return fail("SUBMIT_FAILED");
    }
    if (aborted()) return ABORTED;
    onProgress?.(jobId, 0);
  } else {
    onStep("QUEUED");
  }

  while (attempts < maxAttempts) {
    await sleep(intervalMs, signal);
    if (aborted()) return ABORTED;
    attempts++;
    onProgress?.(jobId, attempts);

    let status: JobStatus;
    try {
      const res = await fetch(statusPath(jobId), { signal });
      status = ((await res.json()) as { status: JobStatus }).status;
    } catch {
      return fail("STATUS_CHECK_FAILED");
    }
    if (aborted()) return ABORTED;

    switch (status) {
      case "COMPLETED": {
        onStep("FETCHING_RESULTS");
        try {
          const report = await fetchResult((p, i) => fetch(p, { ...i, signal }), jobId);
          return aborted() ? ABORTED : { ok: true, jobId, report };
        } catch {
          return fail("RESULT_FETCH_FAILED");
        }
      }
      case "FAILED":
        return fail("PROCESSING_FAILED");
      case "PROCESSING":
        onStep("PROCESSING");
        break;
      case "PENDING":
        onStep("QUEUED");
        break;
      default:
        return fail("STATUS_CHECK_FAILED");
    }
  }
  return fail("TIMEOUT");
}
