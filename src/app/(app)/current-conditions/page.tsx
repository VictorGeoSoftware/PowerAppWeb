"use client";

import { ConsumptionSummary } from "@/components/consumption/consumption-summary";
import { CurrentConditionsForm } from "@/components/conditions/current-conditions-form";
import { FeeFirstGateBanner } from "@/components/conditions/fee-first-gate-banner";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";

export default function CurrentConditionsPage() {
  const { session, stage, completed, required } = useFeeFirstGate();
  return (
    <section className="flex flex-col gap-4 py-4">
      <h1 className="text-[22px] font-semibold">Condiciones actuales</h1>
      {session && (
        <>
          <FeeFirstGateBanner unlocked={stage === "UNLOCKED"} completed={completed} required={required} />
          <ConsumptionSummary session={session} />
          <CurrentConditionsForm />
        </>
      )}
    </section>
  );
}
