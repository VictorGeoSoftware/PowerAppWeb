"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { BmApiError } from "@/lib/api/bm-fetch";
import { useBmFetch } from "@/lib/api/use-bm-fetch";
import { FAILURE_MESSAGES, type StudyStep } from "@/lib/consumption/messages";
import { toConsumptionSession } from "@/lib/consumption/report";
import { fetchResult, refreshReport, runStudy, type StudyFetch, type StudySubmission } from "@/lib/consumption/study";
import {
  type JobSource,
  clearLastCompletedJobId,
  loadActiveJob,
  loadLastCompletedJobId,
  saveActiveJob,
  saveLastCompletedJobId,
} from "@/lib/gate/storage";
import { PRICE_UPDATES_MESSAGE, onServiceWorkerMessage } from "@/lib/pwa/sw-messages";

export type StudyState =
  | { kind: "idle" }
  | { kind: "running"; step: StudyStep }
  /**
   * `cups` is the typed CUPS to refill the form; "" for PDF studies. `canRetry` is false
   * for a PDF study whose file is no longer in memory (e.g. resumed after a reload).
   */
  | { kind: "failed"; message: string; source: JobSource; cups: string; canRetry: boolean };

type StudyContextValue = {
  state: StudyState;
  /** Starts a study for an already corrected CUPS (`toSubmittableCups`). */
  startCups: (cups: string) => void;
  /** Starts a study from a PDF bill already checked with `checkBillFile`. */
  startPdf: (file: File) => void;
  /** Starts a study from a bill photo already checked with `checkBillPhoto`. */
  startPhoto: (file: File) => void;
  /** Starts a new job with the failed study's input; no-op unless `canRetry`. */
  retry: () => void;
  /** Silent refresh of the published study's proposals and taxes; throttled unless `force`. */
  refreshStudy: (options?: { force?: boolean }) => void;
};

export const REFRESH_THROTTLE_MS = 60_000;

type RunInput =
  | { submission: StudySubmission }
  | { resume: { jobId: string; source: JobSource; cups?: string; attempts: number } };

const StudyContext = createContext<StudyContextValue | null>(null);

export function useConsumptionStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error("useConsumptionStudy must be used inside ConsumptionStudyProvider");
  return ctx;
}

/**
 * Sleeps `ms`, then keeps waiting while the tab is hidden, so time in a background
 * tab does not burn status attempts (spec decision 5). Resolves early on abort.
 */
export function visibleSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const onVisible = () => {
      if (document.visibilityState === "visible") done();
    };
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") document.addEventListener("visibilitychange", onVisible);
      else done();
    }, ms);
    function done() {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done);
  });
}

type Props = {
  children: React.ReactNode;
  /** Injectable for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Injectable for tests. */
  refreshThrottleMs?: number;
};

/**
 * Owns the Consumption Job (BmApp `ConsumptionStudyRepositoryImpl`): submit, poll,
 * publish the report into the Fee-First Gate, resume after reload/background and
 * restore the last completed study (< 1 h). Lives under RequireAuth, so logout
 * unmounts it and aborts any polling.
 */
export function ConsumptionStudyProvider({ children, sleep = visibleSleep, refreshThrottleMs = REFRESH_THROTTLE_MS }: Props) {
  const { user } = useAuth();
  const bmFetch = useBmFetch();
  const { session, setSession, resetCount } = useFeeFirstGate();
  const [state, setState] = useState<StudyState>({ kind: "idle" });

  const controller = useRef<AbortController | null>(null);
  const refreshCtrl = useRef<AbortController | null>(null);
  const uidRef = useRef(user?.uid);
  uidRef.current = user?.uid;
  const fetchRef = useRef<StudyFetch>(bmFetch);
  fetchRef.current = bmFetch;
  const sessionJobId = useRef(session?.jobId ?? null);
  sessionJobId.current = session?.jobId ?? null;
  /** The last PDF or photo picked in this tab, kept only for "Reintentar". */
  const lastFile = useRef<File | null>(null);
  /** Last publish or refresh attempt; starts the refresh throttle. */
  const lastRefreshAt = useRef(0);

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    refreshCtrl.current?.abort();
    refreshCtrl.current = null;
  }, []);

  /** Publishes a report; the ref lets a refresh started right after match this jobId before rerender. */
  const publish = useCallback(
    (report: Parameters<typeof toConsumptionSession>[0], jobId: string) => {
      sessionJobId.current = jobId;
      lastRefreshAt.current = Date.now();
      setSession(toConsumptionSession(report, jobId));
    },
    [setSession],
  );

  /** BmApp `refreshActiveStudy`: silent; 404 clears the stored id, other errors are ignored. */
  const doRefresh = useCallback(
    async (jobId: string) => {
      refreshCtrl.current?.abort();
      const ctrl = new AbortController();
      refreshCtrl.current = ctrl;
      const uid = uidRef.current;
      const stale = () => ctrl.signal.aborted || uidRef.current !== uid || sessionJobId.current !== jobId;
      lastRefreshAt.current = Date.now();
      try {
        const report = await refreshReport((p, i) => fetchRef.current(p, i), jobId, ctrl.signal);
        if (stale()) return;
        saveLastCompletedJobId(jobId);
        publish(report, jobId);
      } catch (error) {
        if (stale()) return;
        if (error instanceof BmApiError && error.status === 404) clearLastCompletedJobId();
        else console.warn("Consumption study refresh failed", error);
      } finally {
        if (refreshCtrl.current === ctrl) refreshCtrl.current = null;
      }
    },
    [publish],
  );

  /** `force` skips only the throttle (price-update push, BmApp parity: the backend already debounces). */
  const refreshStudy = useCallback(
    (options?: { force?: boolean }) => {
      const jobId = sessionJobId.current;
      if (!jobId || controller.current || refreshCtrl.current) return;
      if (!options?.force && Date.now() - lastRefreshAt.current < refreshThrottleMs) return;
      void doRefresh(jobId);
    },
    [doRefresh, refreshThrottleMs],
  );

  useEffect(() => onServiceWorkerMessage(PRICE_UPDATES_MESSAGE, () => refreshStudy({ force: true })), [refreshStudy]);

  const run = useCallback(
    async (input: RunInput) => {
      abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const uid = uidRef.current;
      const stale = () => ctrl.signal.aborted || uidRef.current !== uid;
      const sub = "submission" in input ? input.submission : null;
      const resume = "resume" in input ? input.resume : null;
      const source: JobSource = sub ? sub.kind : resume!.source;
      const cups = sub?.kind === "cups" ? sub.cups : source === "cups" ? (resume?.cups ?? "") : undefined;
      setState({
        kind: "running",
        step: resume ? "QUEUED" : source === "cups" ? "SUBMITTING_CUPS" : "UPLOADING_BILL",
      });

      const result = await runStudy({
        fetch: (path, init) => fetchRef.current(path, init),
        submission: sub ?? undefined,
        resumeJobId: resume?.jobId,
        startAttempts: resume?.attempts,
        signal: ctrl.signal,
        sleep,
        onStep: (step) => {
          if (!stale()) setState({ kind: "running", step });
        },
        onProgress: (jobId, attempts) => {
          if (!stale()) saveActiveJob(source === "cups" ? { jobId, source, cups, attempts } : { jobId, source, attempts });
        },
      });
      if (stale() || ("aborted" in result && result.aborted)) return;
      controller.current = null;
      saveActiveJob(null);
      if (result.ok) {
        lastFile.current = null;
        saveLastCompletedJobId(result.jobId);
        publish(result.report, result.jobId);
        setState({ kind: "idle" });
      } else if ("failure" in result) {
        const canRetry = source === "cups" ? !!cups : lastFile.current != null;
        setState({ kind: "failed", message: FAILURE_MESSAGES[result.failure], source, cups: cups ?? "", canRetry });
      }
    },
    [abort, sleep, publish],
  );

  /** BmApp `restoreLastCompletedStudy`: 404 clears the id; other errors keep it. Then refresh prices once. */
  const restore = useCallback(
    async (jobId: string) => {
      abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const uid = uidRef.current;
      setState({ kind: "running", step: "FETCHING_RESULTS" });
      let restored = false;
      try {
        const report = await fetchResult((p, i) => fetchRef.current(p, { ...i, signal: ctrl.signal }), jobId);
        if (ctrl.signal.aborted || uidRef.current !== uid) return;
        publish(report, jobId);
        restored = true;
      } catch (error) {
        if (ctrl.signal.aborted || uidRef.current !== uid) return;
        if (error instanceof BmApiError && error.status === 404) clearLastCompletedJobId();
      }
      controller.current = null;
      setState({ kind: "idle" });
      if (restored) void doRefresh(jobId);
    },
    [abort, publish, doRefresh],
  );

  /** Resume an in-flight job, else restore the last completed one. */
  const resumeOrRestore = useCallback(() => {
    if (controller.current || sessionJobId.current) return;
    const active = loadActiveJob();
    if (active) {
      void run({ resume: active });
      return;
    }
    const lastId = loadLastCompletedJobId();
    if (lastId) void restore(lastId);
  }, [run, restore]);

  useEffect(() => {
    resumeOrRestore();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (sessionJobId.current) refreshStudy();
      else resumeOrRestore();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      abort();
    };
  }, [resumeOrRestore, refreshStudy, abort]);

  // "Nuevo estudio": storage is already cleared by the gate; stop polling and reset the form.
  const firstReset = useRef(resetCount);
  useEffect(() => {
    if (resetCount === firstReset.current) return;
    abort();
    lastFile.current = null;
    // A poll step or result may have landed between the reset and this effect.
    saveActiveJob(null);
    clearLastCompletedJobId();
    setSession(null);
    setState({ kind: "idle" });
  }, [resetCount, abort, setSession]);

  const startCups = useCallback(
    (cups: string) => {
      lastFile.current = null;
      void run({ submission: { kind: "cups", cups } });
    },
    [run],
  );
  const startPdf = useCallback(
    (file: File) => {
      lastFile.current = file;
      void run({ submission: { kind: "pdf", file } });
    },
    [run],
  );
  const startPhoto = useCallback(
    (file: File) => {
      lastFile.current = file;
      void run({ submission: { kind: "photo", file } });
    },
    [run],
  );
  const retry = useCallback(() => {
    if (state.kind !== "failed" || !state.canRetry) return;
    if (state.source === "cups") startCups(state.cups);
    else if (lastFile.current && state.source === "photo") startPhoto(lastFile.current);
    else if (lastFile.current) startPdf(lastFile.current);
  }, [state, startCups, startPdf, startPhoto]);
  const value = useMemo(
    () => ({ state, startCups, startPdf, startPhoto, retry, refreshStudy }),
    [state, startCups, startPdf, startPhoto, retry, refreshStudy],
  );
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
