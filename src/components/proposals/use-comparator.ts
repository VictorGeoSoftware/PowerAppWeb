"use client";

import { useMemo } from "react";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { calculateComparatorSummary } from "@/lib/comparator/calculate";
import { visibleProposals } from "@/lib/proposals/visibility";

/** One comparator computation shared by the table and the PDF report (BmApp `ProposalsUiState`). */
export function useComparator() {
  const { session, conditions, proposalFixedAmounts, proposalVisibility } =
    useFeeFirstGate();
  const summary = useMemo(
    () => calculateComparatorSummary(session, conditions, proposalFixedAmounts),
    [session, conditions, proposalFixedAmounts],
  );
  const visible = useMemo(
    () => visibleProposals(summary.proposals, proposalVisibility),
    [summary, proposalVisibility],
  );
  return { session, summary, visible, proposalFixedAmounts };
}
