"use client";

import { ConsumptionSummary } from "@/components/consumption/consumption-summary";
import { useFeeFirstGate } from "@/components/gate/fee-first-gate-provider";

/** Placeholder until `current-conditions-form`; shows the Consumption Report summary. */
export default function CurrentConditionsPage() {
  const { session } = useFeeFirstGate();
  return (
    <section className="flex flex-col gap-4 py-4">
      <h1 className="text-[22px] font-semibold">Condiciones actuales</h1>
      {session && <ConsumptionSummary session={session} />}
      <p className="text-base text-muted-foreground">Próximamente.</p>
    </section>
  );
}
