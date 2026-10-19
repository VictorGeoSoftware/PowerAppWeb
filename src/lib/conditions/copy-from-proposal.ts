/**
 * "Copiar precios de una propuesta", ported from BmApp
 * `CurrentUserConditionsViewModel.copyPricesFromProposal`. Items are matched by index
 * against the session's period rows (BmApp parity), not by period name.
 */
import { type ProposalPrice, toProposalPrices } from "@/lib/comparator/proposal";
import { formatFixedHalfUp } from "@/lib/comparator/rounding";
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";

/** Java `%.8f`, trailing zeros and "." trimmed, blank -> "0"; missing -> "". */
export function toDecimalInput(v?: number): string {
  if (v == null) return "";
  const trimmed = formatFixedHalfUp(v, 8).replace(/0+$/, "").replace(/\.$/, "");
  return trimmed.trim() === "" ? "0" : trimmed;
}

export const availableProposals = (session: ConsumptionSession): ProposalPrice[] =>
  toProposalPrices(session.proposals);

/** Keeps the previous selection while it still exists, else the first proposal. */
export function initialSelection(proposals: ProposalPrice[], previous: string | null): string | null {
  if (previous != null && proposals.some((p) => p.proposalTitle === previous)) return previous;
  return proposals[0]?.proposalTitle ?? null;
}

export function copyPricesFromProposal(
  session: ConsumptionSession,
  conditions: CurrentConditions | null,
  title: string,
): CurrentConditions | null {
  const proposal = availableProposals(session).find((p) => p.proposalTitle === title);
  if (!proposal) return null;
  return {
    companyName: conditions?.companyName ?? null,
    powerTermPriceByPeriod: Object.fromEntries(
      session.powerPeriods.map((p, i) => [p, toDecimalInput(proposal.powerTermItems[i])]),
    ),
    energyPriceByPeriod: Object.fromEntries(
      session.energyPeriods.map((p, i) => [p, toDecimalInput(proposal.consumedEnergyItems[i])]),
    ),
    extraServices: formatFixedHalfUp(proposal.extraServices, 2),
  };
}
