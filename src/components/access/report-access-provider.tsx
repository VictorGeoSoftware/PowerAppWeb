"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { parseReportAccess } from "@/lib/access/report-access";
import { useBmFetch } from "@/lib/api/use-bm-fetch";

/** Same throttle as the access re-check in `AuthProvider`. */
const DEFAULT_RECHECK_INTERVAL_MS = 60_000;

type ReportAccessValue = {
  /** True only while the current Broker's backend capabilities include the comprehensive report. */
  comprehensiveReport: boolean;
  /** Re-check `me/access` (throttled). Called when entering Propuestas. */
  refresh: () => void;
  /** Backend answered `premium_required`: hide the action now and force a `me/access` re-check. */
  invalidate: () => void;
};

const ReportAccessContext = createContext<ReportAccessValue>({
  comprehensiveReport: false,
  refresh: () => {},
  invalidate: () => {},
});

/**
 * Comprehensive-report capability of the signed-in Broker, read from `GET /me/access`.
 * In memory only and keyed by uid. Any failure hides the action without a message;
 * 401/403 still end the session through `useBmFetch`. The backend remains the security boundary.
 */
export function ReportAccessProvider({
  children,
  recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
}: {
  children: React.ReactNode;
  /** Throttle between re-checks; injectable for tests. */
  recheckIntervalMs?: number;
}) {
  const { user } = useAuth();
  const bmFetch = useBmFetch();
  const uid = user?.uid ?? null;
  const [granted, setGranted] = useState<{ uid: string; value: boolean } | null>(null);
  const currentUid = useRef<string | null>(uid);
  const requestSeq = useRef(0);
  const lastCheck = useRef<{ uid: string; at: number } | null>(null);

  const check = useCallback(
    async (force: boolean) => {
      if (!uid) return;
      const last = lastCheck.current;
      if (!force && last?.uid === uid && Date.now() - last.at < recheckIntervalMs) return;
      lastCheck.current = { uid, at: Date.now() };
      const seq = ++requestSeq.current;
      let value = false;
      try {
        const response = await bmFetch("me/access", { cache: "no-store" });
        value = parseReportAccess(await response.json()).comprehensiveReport;
      } catch {
        value = false;
      }
      if (seq !== requestSeq.current || currentUid.current !== uid) return;
      setGranted({ uid, value });
    },
    [uid, bmFetch, recheckIntervalMs],
  );

  // Sign-in / user change: reset and check immediately.
  useEffect(() => {
    currentUid.current = uid;
    requestSeq.current++;
    setGranted(null);
    lastCheck.current = null;
    if (uid) void check(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on uid change
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [uid, check]);

  const refresh = useCallback(() => void check(false), [check]);
  const invalidate = useCallback(() => {
    if (!uid) return;
    setGranted({ uid, value: false });
    void check(true);
  }, [uid, check]);
  const comprehensiveReport = uid !== null && granted?.uid === uid && granted.value;
  const value = useMemo(
    () => ({ comprehensiveReport, refresh, invalidate }),
    [comprehensiveReport, refresh, invalidate],
  );
  return <ReportAccessContext.Provider value={value}>{children}</ReportAccessContext.Provider>;
}

export const useReportAccess = () => useContext(ReportAccessContext);
