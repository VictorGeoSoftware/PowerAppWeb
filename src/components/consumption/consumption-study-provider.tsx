"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { BmApiError } from "@/lib/api/bm-fetch";
import { useBmFetch } from "@/lib/api/use-bm-fetch";
import { FAILURE_MESSAGES, type StudyStep } from "@/lib/consumption/messages";
import { toConsumptionSession } from "@/lib/consumption/report";
import { fetchResult, runStudy, type StudyFetch, type StudySubmission } from "@/lib/consumption/study";
import {
  type JobSource,
  clearLastCompletedJobId,
  loadActiveJob,
  loadLastCompletedJobId,
  saveActiveJob,
  saveLastCompletedJobId,
} from "@/lib/gate/storage";

export type StudyState =
  | { kind: "idle" }
  | { kind: "running"; step: StudyStep }
  /** `cups` is the typed CUPS to refill the form; "" for PDF studies. */
  | { kind: "failed"; message: string; source: JobSource; cups: string };

type StudyContextValue = {
  state: StudyState;
  /** Starts a study for an already corrected CUPS (`toSubmittableCups`). */
  startCups: (cups: string) => void;
  /** Starts a study from a PDF bill already checked with `checkBillFile`. */
  startPdf: (file: File) => void;
};

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
};

/**
 * Owns the Consumption Job (BmApp `ConsumptionStudyRepositoryImpl`): submit, poll,
 * publish the report into the Fee-First Gate, resume after reload/background and
 * restore the last completed study (< 1 h). Lives under RequireAuth, so logout
 * unmounts it and aborts any polling.
 */
export function ConsumptionStudyProvider({ children, sleep = visibleSleep }: Props) {
  const { user } = useAuth();
  const bmFetch = useBmFetch();
  const { session, setSession, resetCount } = useFeeFirstGate();
  const [state, setState] = useState<StudyState>({ kind: "idle" });

  const controller = useRef<AbortController | null>(null);
  const uidRef = useRef(user?.uid);
  uidRef.current = user?.uid;
  const fetchRef = useRef<StudyFetch>(bmFetch);
  fetchRef.current = bmFetch;
  const hasSession = useRef(session != null);
  hasSession.current = session != null;

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

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
        saveLastCompletedJobId(result.jobId);
        setSession(toConsumptionSession(result.report, result.jobId));
        setState({ kind: "idle" });
      } else if ("failure" in result) {
        setState({ kind: "failed", message: FAILURE_MESSAGES[result.failure], source, cups: cups ?? "" });
      }
    },
    [abort, sleep, setSession],
  );

  /** BmApp `restoreLastCompletedStudy`: 404 clears the id; other errors keep it. */
  const restore = useCallback(
    async (jobId: string) => {
      abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const uid = uidRef.current;
      setState({ kind: "running", step: "FETCHING_RESULTS" });
      try {
        const report = await fetchResult((p, i) => fetchRef.current(p, { ...i, signal: ctrl.signal }), jobId);
        if (ctrl.signal.aborted || uidRef.current !== uid) return;
        setSession(toConsumptionSession(report, jobId));
      } catch (error) {
        if (ctrl.signal.aborted || uidRef.current !== uid) return;
        if (error instanceof BmApiError && error.status === 404) clearLastCompletedJobId();
      }
      controller.current = null;
      setState({ kind: "idle" });
    },
    [abort, setSession],
  );

  /** Resume an in-flight job, else restore the last completed one. */
  const resumeOrRestore = useCallback(() => {
    if (controller.current || hasSession.current) return;
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
      if (document.visibilityState === "visible") resumeOrRestore();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      abort();
    };
  }, [resumeOrRestore, abort]);

  // "Nuevo estudio": storage is already cleared by the gate; stop polling and reset the form.
  const firstReset = useRef(resetCount);
  useEffect(() => {
    if (resetCount === firstReset.current) return;
    abort();
    // A poll step or result may have landed between the reset and this effect.
    saveActiveJob(null);
    clearLastCompletedJobId();
    setSession(null);
    setState({ kind: "idle" });
  }, [resetCount, abort, setSession]);

  const startCups = useCallback((cups: string) => void run({ submission: { kind: "cups", cups } }), [run]);
  const startPdf = useCallback((file: File) => void run({ submission: { kind: "pdf", file } }), [run]);
  const value = useMemo(() => ({ state, startCups, startPdf }), [state, startCups, startPdf]);
  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}
