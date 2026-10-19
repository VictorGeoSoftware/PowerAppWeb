"use client";

import { useMemo } from "react";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { BestProposalCard } from "@/components/proposals/best-proposal-card";
import { ConsumptionLabelsColumn } from "@/components/proposals/consumption-labels-column";
import { CustomerConditionsColumn } from "@/components/proposals/customer-conditions-column";
import { ProposalColumn } from "@/components/proposals/proposal-column";
import { bestProposalAmong, calculateComparatorSummary } from "@/lib/comparator/calculate";
import { bestSavingLabel, percentLabel } from "@/lib/comparator/format";
import { EMPTY_MESSAGE } from "@/lib/proposals/messages";

const own = <V,>(record: Record<string, V>, key: string): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Port of BmApp `ProposalsContent` / `ComparatorProposalsView` (no visibility, PDF or copy sheet yet). */
export function ProposalsComparator() {
  const { session, conditions, proposalFixedAmounts, setProposalFixedAmount } = useFeeFirstGate();
  const summary = useMemo(
    () => calculateComparatorSummary(session, conditions, proposalFixedAmounts),
    [session, conditions, proposalFixedAmounts],
  );

  if (!session || summary.proposals.length === 0) {
    return <p className="text-sm text-table-text-secondary">{EMPTY_MESSAGE}</p>;
  }

  const visible = summary.proposals;
  const best = bestProposalAmong(summary, visible);
  const bestDelta = best ? own(summary.annualPriceDeltaByTitle, best.proposalTitle) : undefined;

  const powerRows = session.powerRows ?? [];
  // BmApp stores annual kWh as Int.
  const energyRows = (session.energyRows ?? []).map((r) => ({ period: r.period, value: Math.trunc(r.value) }));
  const powerRowCount = Math.max(powerRows.length, ...visible.map((p) => p.powerTermItems.length));
  const energyRowCount = Math.max(energyRows.length, ...visible.map((p) => p.consumedEnergyItems.length));

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto overscroll-x-contain pb-2" data-testid="comparator-scroll">
        <div className="flex w-max pr-4">
          <div className="sticky left-0 z-10 bg-background pr-3 pl-4" data-testid="labels-column">
            <ConsumptionLabelsColumn
              tariffName={session.feeType ?? ""}
              powerRows={powerRows}
              energyRows={energyRows}
              powerRowCount={powerRowCount}
              energyRowCount={energyRowCount}
              ivaLabel={percentLabel(session.iva ?? 0)}
              electricTaxLabel={percentLabel(session.electricTaxPercent ?? 0)}
            />
          </div>
          <div className="flex gap-3">
            <CustomerConditionsColumn
              column={summary.customerConditions}
              powerRowCount={powerRowCount}
              energyRowCount={energyRowCount}
            />
            {visible.map((proposal) => (
              <ProposalColumn
                key={proposal.proposalTitle}
                proposal={proposal}
                powerRowCount={powerRowCount}
                energyRowCount={energyRowCount}
                delta={own(summary.annualPriceDeltaByTitle, proposal.proposalTitle)}
                savingsPercent={own(summary.annualSavingsPercentageByTitle, proposal.proposalTitle)}
                fixedAmount={own(proposalFixedAmounts, proposal.proposalTitle) ?? ""}
                onFixedAmountChange={(v) => setProposalFixedAmount(proposal.proposalTitle, v)}
              />
            ))}
          </div>
        </div>
      </div>
      {best && bestDelta !== undefined && (
        <BestProposalCard title={best.proposalTitle} saving={bestSavingLabel(bestDelta)} />
      )}
    </div>
  );
}
