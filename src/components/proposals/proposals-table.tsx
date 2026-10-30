"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useReportAccess } from "@/components/access/report-access-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import {
  CreateReportButton,
  ReportErrorAlert,
  ReportReadyPanel,
  useCreateReport,
} from "@/components/proposals/create-report-action";
import { BestProposalCard } from "@/components/proposals/best-proposal-card";
import { ConsumptionLabelsColumn } from "@/components/proposals/consumption-labels-column";
import { CustomerConditionsColumn } from "@/components/proposals/customer-conditions-column";
import { PremiumReportAlert, usePremiumReport } from "@/components/proposals/premium-report-action";
import { PremiumReportButton } from "@/components/proposals/premium-report-button";
import { ProposalColumn } from "@/components/proposals/proposal-column";
import { useComparator } from "@/components/proposals/use-comparator";
import { useTopBarAction } from "@/components/shell/app-shell";
import { bestProposalAmong, selectUncompetitiveProposals } from "@/lib/comparator/calculate";
import { bestSavingLabel, percentLabel } from "@/lib/comparator/format";
import { EMPTY_MESSAGE } from "@/lib/proposals/messages";
import { buildComparatorReportRequest } from "@/lib/pdf/comparator-report";
import { autoHideSignature } from "@/lib/proposals/visibility";
import { sendUserActivity } from "@/lib/auth/user-activity";
import { loadProposalsResponseJobId, saveProposalsResponseJobId } from "@/lib/gate/storage";

const own = <V,>(record: Record<string, V>, key: string): V | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Port of BmApp `ProposalsContent` / `ComparatorProposalsView` and its "Crear informe" action. */
export function ProposalsComparator() {
  const { setProposalFixedAmount, hideProposalsOnce } = useFeeFirstGate();
  const { session, summary, visible, proposalFixedAmounts } = useComparator();
  const jobId = session?.jobId;

  // BmApp `hideUncompetitiveProposals`: arriving at Proposals applies the rule once per signature.
  useEffect(() => {
    if (!jobId || summary.proposals.length === 0) return;
    hideProposalsOnce(autoHideSignature(jobId, summary.customerTotalAnnualPrice), selectUncompetitiveProposals(summary));
  }, [jobId, summary, hideProposalsOnce]);

  // Counted once per job, the first time the table is shown (deviation from BmApp, see domain-model).
  const { user } = useAuth();
  const hasVisible = visible.length > 0;
  useEffect(() => {
    if (!jobId || !hasVisible || !user || loadProposalsResponseJobId() === jobId) return;
    saveProposalsResponseJobId(jobId);
    void sendUserActivity(user, "proposals-response");
  }, [jobId, hasVisible, user]);

  const buildRequest = useCallback(
    () => (session ? buildComparatorReportRequest(session, summary, visible, proposalFixedAmounts) : null),
    [session, summary, visible, proposalFixedAmounts],
  );
  const report = useCreateReport(buildRequest);
  const { generating, generate } = report;
  const premium = usePremiumReport(buildRequest, jobId);
  const { generating: premiumGenerating, generate: generatePremium } = premium;
  const canReport = session != null && visible.length > 0;
  // Entering Propuestas re-checks the comprehensive-report capability (throttled).
  const { comprehensiveReport, refresh: refreshReportAccess } = useReportAccess();
  useEffect(() => refreshReportAccess(), [refreshReportAccess]);
  // BmApp TopActionBar: `currentRoute == Proposals && hasProposals`.
  const action = useMemo(() => {
    if (!canReport) return null;
    const create = <CreateReportButton generating={generating} onClick={() => void generate()} />;
    if (!comprehensiveReport) return create;
    return (
      <div className="flex items-center">
        {create}
        <PremiumReportButton generating={premiumGenerating} onClick={() => void generatePremium()} />
      </div>
    );
  }, [canReport, generating, generate, comprehensiveReport, premiumGenerating, generatePremium]);
  useTopBarAction(action);

  const notices = (
    <>
      {report.failed && <ReportErrorAlert />}
      {report.ready && (
        <ReportReadyPanel
          onShare={() => void report.share()}
          onDownload={report.download}
          onDismiss={report.dismiss}
        />
      )}
      {premium.error && (
        <PremiumReportAlert
          message={premium.error.message}
          onRetry={premium.error.retry ? () => void premium.retry() : undefined}
        />
      )}
      {premium.ready && (
        <ReportReadyPanel
          onShare={() => void premium.share()}
          onDownload={premium.download}
          onDismiss={premium.dismiss}
        />
      )}
    </>
  );

  if (!session || visible.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {notices}
        <p className="text-sm text-table-text-secondary">{EMPTY_MESSAGE}</p>
      </div>
    );
  }

  const best = bestProposalAmong(summary, visible);
  const bestDelta = best ? own(summary.annualPriceDeltaByTitle, best.proposalTitle) : undefined;

  const powerRows = session.powerRows ?? [];
  // BmApp stores annual kWh as Int.
  const energyRows = (session.energyRows ?? []).map((r) => ({ period: r.period, value: Math.trunc(r.value) }));
  const powerRowCount = Math.max(powerRows.length, ...visible.map((p) => p.powerTermItems.length));
  const energyRowCount = Math.max(energyRows.length, ...visible.map((p) => p.consumedEnergyItems.length));

  return (
    <div className="flex flex-col gap-3">
      {notices}
      <div className="-mx-4 overflow-x-auto overscroll-x-contain pb-2" data-testid="comparator-scroll">
        <div className="flex w-max pr-4">
          <div className="pr-4 pl-4" data-testid="labels-column">
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
            {/* Scrolls with the table until it reaches the left edge, then stays pinned for comparison. */}
            <div className="sticky left-0 z-10 -ml-4 bg-background pl-4" data-testid="customer-sticky">
              <CustomerConditionsColumn
                column={summary.customerConditions}
                powerRowCount={powerRowCount}
                energyRowCount={energyRowCount}
              />
            </div>
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
