"use client";

import { useConsumptionStudy } from "@/components/consumption/consumption-study-provider";
import { CupsForm } from "@/components/consumption/cups-form";
import { StudyProgress } from "@/components/consumption/study-progress";

/** BmApp FetchConsumptionScreen; only the typed-CUPS method for now. */
export default function FetchConsumptionPage() {
  const { state, start } = useConsumptionStudy();

  return (
    <section className="flex flex-col gap-4 py-4">
      <h1 className="text-[22px] font-semibold">Selecciona primero una factura de luz para proceder al estudio</h1>
      <p className="text-base text-muted-foreground">
        Necesitamos tu consumo real antes de introducir las condiciones actuales.
      </p>
      {state.kind === "running" ? (
        <StudyProgress step={state.step} />
      ) : (
        <>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground">ELIGE UN MÉTODO</p>
          <CupsForm
            key={state.kind === "failed" ? `failed-${state.cups}` : "idle"}
            initialValue={state.kind === "failed" ? state.cups : ""}
            error={state.kind === "failed" ? state.message : null}
            onSubmit={start}
          />
        </>
      )}
    </section>
  );
}
