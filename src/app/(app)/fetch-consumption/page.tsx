"use client";

import { useState } from "react";
import { useConsumptionStudy } from "@/components/consumption/consumption-study-provider";
import { CupsForm } from "@/components/consumption/cups-form";
import { PdfUploadOption } from "@/components/consumption/pdf-upload-option";
import { StudyProgress } from "@/components/consumption/study-progress";

/** BmApp FetchConsumptionScreen: typed CUPS and PDF bill upload. */
export default function FetchConsumptionPage() {
  const { state, startCups, startPdf } = useConsumptionStudy();
  // Client-side file check message; replaces any previous study error until the next attempt.
  const [fileError, setFileError] = useState<string | null>(null);

  const studyError = state.kind === "failed" ? state.message : null;

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
            key={state.kind === "failed" ? `failed-${state.source}-${state.cups}` : "idle"}
            initialValue={state.kind === "failed" ? state.cups : ""}
            error={fileError ?? studyError}
            onSubmit={(cups) => {
              setFileError(null);
              startCups(cups);
            }}
          />
          <PdfUploadOption
            onError={setFileError}
            onSelect={(file) => {
              setFileError(null);
              startPdf(file);
            }}
          />
        </>
      )}
    </section>
  );
}
