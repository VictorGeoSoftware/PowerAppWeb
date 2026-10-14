"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FullScreenSpinner } from "@/components/auth/auth-provider";
import {
  type ConsumptionSession,
  type CurrentConditions,
  evaluateGate,
  fallbackRoute,
  type FeeFirstStage,
  redirectFor,
} from "@/lib/gate/fee-first";
import { clearStudyStorage, loadConditions, saveConditions } from "@/lib/gate/storage";

type GateContextValue = {
  stage: FeeFirstStage;
  required: number;
  completed: number;
  session: ConsumptionSession | null;
  conditions: CurrentConditions | null;
  /** Published by consumption features when a Consumption Report is ready. */
  setSession: (session: ConsumptionSession | null) => void;
  /** Saved by the Current Conditions form; persisted in localStorage. */
  setConditions: (conditions: CurrentConditions | null) => void;
  /** BmApp `startNewStudy` / R6: drop the study; the guard routes to the fetch step. */
  startNewStudy: () => void;
  /** Incremented by `startNewStudy` so running studies can cancel themselves. */
  resetCount: number;
};

const GateContext = createContext<GateContextValue | null>(null);

export function useFeeFirstGate() {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useFeeFirstGate must be used inside FeeFirstGateProvider");
  return ctx;
}

type Props = { children: React.ReactNode; initialSession?: ConsumptionSession | null };

/**
 * Lives under RequireAuth: it unmounts on logout, so the in-memory session never
 * outlives the Broker's session (deliberate fix of a BmApp gap).
 */
export function FeeFirstGateProvider({ children, initialSession = null }: Props) {
  const [session, setSession] = useState<ConsumptionSession | null>(initialSession);
  const [conditions, setConditionsState] = useState<CurrentConditions | null>(() =>
    typeof window === "undefined" ? null : loadConditions(),
  );

  const setConditions = useCallback((next: CurrentConditions | null) => {
    saveConditions(next);
    setConditionsState(next);
  }, []);

  const [resetCount, setResetCount] = useState(0);

  const startNewStudy = useCallback(() => {
    clearStudyStorage();
    setResetCount((n) => n + 1);
    setSession(null);
    setConditionsState(null);
  }, []);

  const value = useMemo(() => {
    const gate = evaluateGate(session, conditions);
    return { ...gate, session, conditions, setSession, setConditions, startNewStudy, resetCount };
  }, [session, conditions, setConditions, startNewStudy, resetCount]);

  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

/** Target for `path` at `stage`: `/` goes to the current step; blocked routes to the fallback (R5). */
export const gateRedirect = (stage: FeeFirstStage, path: string) =>
  path === "/" ? fallbackRoute(stage) : redirectFor(stage, path);

/** Renders children only on routes the current stage can reach; never flashes blocked content. */
export function FeeFirstGateGuard({ children }: { children: React.ReactNode }) {
  const { stage } = useFeeFirstGate();
  const pathname = usePathname();
  const router = useRouter();
  const target = gateRedirect(stage, pathname);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return target ? <FullScreenSpinner /> : <>{children}</>;
}
