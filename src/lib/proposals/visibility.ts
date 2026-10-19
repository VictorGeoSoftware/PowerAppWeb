import type { ProposalPrice } from "@/lib/comparator/proposal";
import { kotlinDoubleToString } from "@/lib/comparator/format";

/** BmApp `ProposalsViewModel`: a title with no stored value is visible. */
export const isProposalVisible = (visibility: Record<string, boolean>, title: string) =>
  !Object.hasOwn(visibility, title) || visibility[title] !== false;

export const visibleProposals = <P extends Pick<ProposalPrice, "proposalTitle">>(
  proposals: P[],
  visibility: Record<string, boolean>,
): P[] => proposals.filter((p) => isProposalVisible(visibility, p.proposalTitle));

/** BmApp `"$jobId@${summary.customerTotalAnnualPrice}"` (Kotlin `Double.toString`). */
export const autoHideSignature = (jobId: string, customerTotalAnnualPrice: number) =>
  `${jobId}@${kotlinDoubleToString(customerTotalAnnualPrice)}`;
