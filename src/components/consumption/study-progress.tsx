import { STEP_MESSAGES, STUDY_TITLE, type StudyStep } from "@/lib/consumption/messages";

/** Spinner shown while the Consumption Job runs (BmApp FetchConsumption loading state). */
export function StudyProgress({ step }: { step: StudyStep }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center" role="status" aria-live="polite">
      <div className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary" aria-hidden />
      <h2 className="text-[22px] font-semibold">{STUDY_TITLE}</h2>
      <p className="text-base text-muted-foreground">{STEP_MESSAGES[step]}</p>
    </div>
  );
}
