/** BmApp `ConsumptionStudyStep` / `ConsumptionStudyFailure` and their Spanish strings. */
export type StudyStep = "SUBMITTING_CUPS" | "QUEUED" | "PROCESSING" | "FETCHING_RESULTS";

export type StudyFailure =
  | "SUBMIT_FAILED"
  | "PROCESSING_FAILED"
  | "STATUS_CHECK_FAILED"
  | "RESULT_FETCH_FAILED"
  | "TIMEOUT";

export const STUDY_TITLE = "Obtener consumo";

export const STEP_MESSAGES: Record<StudyStep, string> = {
  SUBMITTING_CUPS: "Consultando CUPS...",
  QUEUED: "Esperando en la cola...",
  PROCESSING: "Analizando tu factura...",
  FETCHING_RESULTS: "Obteniendo resultados...",
};

export const FAILURE_MESSAGES: Record<StudyFailure, string> = {
  SUBMIT_FAILED: "No se pudo iniciar el estudio. Inténtalo de nuevo.",
  PROCESSING_FAILED: "El procesamiento ha fallado. Inténtalo de nuevo.",
  STATUS_CHECK_FAILED: "No se pudo comprobar el estado del estudio.",
  RESULT_FETCH_FAILED: "No se pudieron obtener los resultados del estudio.",
  TIMEOUT: "El estudio ha tardado demasiado. Inténtalo de nuevo.",
};
