"use client";

import { ConsumptionSummary } from "@/components/consumption/consumption-summary";
import { CurrentConditionsForm } from "@/components/conditions/current-conditions-form";
import { FeeFirstGateBanner } from "@/components/conditions/fee-first-gate-banner";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";
import { PageContainer } from "@/components/shell/page-container";

export default function CurrentConditionsPage() {
  const { session, stage, completed, required } = useFeeFirstGate();
  return (
    <PageContainer className="lg:max-w-[984px]">
      <h1 className="text-[22px] font-semibold">Condiciones actuales</h1>
      {session && (
        <>
          <FeeFirstGateBanner unlocked={stage === "UNLOCKED"} completed={completed} required={required} />
          {/* Desktop: summary stays visible next to the form. */}
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_minmax(0,640px)] lg:items-start lg:justify-center lg:gap-6">
            <div data-testid="conditions-summary" className="lg:sticky lg:top-16">
              <ConsumptionSummary session={session} />
            </div>
            <div data-testid="conditions-form">
              <CurrentConditionsForm />
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
