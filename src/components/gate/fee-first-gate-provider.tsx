"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { FullScreenSpinner } from "@/components/auth/auth-provider";
import { toProposalPrices } from "@/lib/comparator/proposal";
import {
  type ConsumptionSession,
  type CurrentConditions,
  evaluateGate,
  fallbackRoute,
  type FeeFirstStage,
  redirectFor,
} from "@/lib/gate/fee-first";
import {
  clearStudyStorage,
  loadAutoHideSignature,
  loadConditions,
  loadProposalFixedAmounts,
  loadProposalVisibility,
  saveAutoHideSignature,
  saveConditions,
  saveProposalFixedAmounts,
  saveProposalVisibility,
} from "@/lib/gate/storage";

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
  /** Comparator fixed amount per proposal title, as typed; persisted for the study. */
  proposalFixedAmounts: Record<string, string>;
  /** BmApp `setProposalFixedAmount`: ignored for titles not in the current report. */
  setProposalFixedAmount: (title: string, value: string) => void;
  /** Visibility per current proposal title (default true); hidden titles persisted for the study. */
  proposalVisibility: Record<string, boolean>;
  /** BmApp `setProposalVisibility`: ignored for titles not in the current report. */
  setProposalVisibility: (title: string, visible: boolean) => void;
  /** BmApp `hideProposalsOnce`: hides `titles` once per `signature`; never re-shows. */
  hideProposalsOnce: (signature: string, titles: Set<string>) => void;
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

  const [storedFixedAmounts, setStoredFixedAmounts] = useState<Record<string, string>>(() =>
    typeof window === "undefined" ? {} : loadProposalFixedAmounts(),
  );

  // BmApp `synchronizeProposalOverrides`: every current title, keeping its typed amount.
  const proposalTitles = useMemo(
    () => (session ? toProposalPrices(session.proposals).map((p) => p.proposalTitle) : null),
    [session],
  );
  const proposalFixedAmounts = useMemo(() => {
    if (!proposalTitles) return storedFixedAmounts;
    return Object.fromEntries(
      proposalTitles.map((t) => [t, Object.hasOwn(storedFixedAmounts, t) ? storedFixedAmounts[t] : ""]),
    );
  }, [proposalTitles, storedFixedAmounts]);

  useEffect(() => {
    if (!proposalTitles) return;
    const stale = Object.keys(storedFixedAmounts).some((t) => !proposalTitles.includes(t));
    if (stale) {
      const kept = Object.fromEntries(Object.entries(proposalFixedAmounts).filter(([, v]) => v !== ""));
      saveProposalFixedAmounts(kept);
      setStoredFixedAmounts(kept);
    }
  }, [proposalTitles, storedFixedAmounts, proposalFixedAmounts]);

  const setProposalFixedAmount = useCallback(
    (title: string, value: string) => {
      if (!proposalTitles?.includes(title)) return;
      setStoredFixedAmounts((current) => {
        const next = { ...current, [title]: value };
        saveProposalFixedAmounts(next);
        return next;
      });
    },
    [proposalTitles],
  );

  const [storedVisibility, setStoredVisibility] = useState<Record<string, boolean>>(() =>
    typeof window === "undefined" ? {} : loadProposalVisibility(),
  );
  const autoHideSignature = useRef<string | null>(null);
  const autoHideSignatureLoaded = useRef(false);

  const proposalVisibility = useMemo(() => {
    if (!proposalTitles) return storedVisibility;
    return Object.fromEntries(proposalTitles.map((t) => [t, storedVisibility[t] !== false]));
  }, [proposalTitles, storedVisibility]);

  useEffect(() => {
    if (!proposalTitles) return;
    const stale = Object.keys(storedVisibility).some((t) => !proposalTitles.includes(t));
    if (stale) {
      const kept = Object.fromEntries(Object.entries(storedVisibility).filter(([t]) => proposalTitles.includes(t)));
      saveProposalVisibility(kept);
      setStoredVisibility(kept);
    }
  }, [proposalTitles, storedVisibility]);

  const setProposalVisibility = useCallback(
    (title: string, visible: boolean) => {
      if (!proposalTitles?.includes(title)) return;
      setStoredVisibility((current) => {
        const next = { ...current };
        if (visible) delete next[title];
        else next[title] = false;
        saveProposalVisibility(next);
        return next;
      });
    },
    [proposalTitles],
  );

  const hideProposalsOnce = useCallback(
    (signature: string, titles: Set<string>) => {
      if (!autoHideSignatureLoaded.current) {
        autoHideSignatureLoaded.current = true;
        autoHideSignature.current = loadAutoHideSignature();
      }
      if (signature === autoHideSignature.current) return;
      autoHideSignature.current = signature;
      saveAutoHideSignature(signature);
      const hide = [...titles].filter((t) => proposalTitles?.includes(t));
      if (hide.length === 0) return;
      setStoredVisibility((current) => {
        const next = { ...current, ...Object.fromEntries(hide.map((t) => [t, false])) };
        saveProposalVisibility(next);
        return next;
      });
    },
    [proposalTitles],
  );

  const startNewStudy = useCallback(() => {
    clearStudyStorage();
    setResetCount((n) => n + 1);
    setSession(null);
    setConditionsState(null);
    setStoredFixedAmounts({});
    setStoredVisibility({});
    autoHideSignature.current = null;
    autoHideSignatureLoaded.current = true;
  }, []);

  const value = useMemo(() => {
    const gate = evaluateGate(session, conditions);
    return {
      ...gate,
      session,
      conditions,
      setSession,
      setConditions,
      startNewStudy,
      resetCount,
      proposalFixedAmounts,
      setProposalFixedAmount,
      proposalVisibility,
      setProposalVisibility,
      hideProposalsOnce,
    };
  }, [
    session,
    conditions,
    setConditions,
    startNewStudy,
    resetCount,
    proposalFixedAmounts,
    setProposalFixedAmount,
    proposalVisibility,
    setProposalVisibility,
    hideProposalsOnce,
  ]);

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
