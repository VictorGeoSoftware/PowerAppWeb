/** BmApp `ConsumptionStudyStep` / `ConsumptionStudyFailure` and their Spanish strings. */
export type StudyStep = "SUBMITTING_CUPS" | "UPLOADING_BILL" | "QUEUED" | "PROCESSING" | "FETCHING_RESULTS";

export type StudyFailure =
  | "SUBMIT_FAILED"
  | "PROCESSING_FAILED"
  | "STATUS_CHECK_FAILED"
  | "RESULT_FETCH_FAILED"
  | "TIMEOUT";

export const STUDY_TITLE = "Obtener consumo";

export const STEP_MESSAGES: Record<StudyStep, string> = {
  SUBMITTING_CUPS: "Consultando CUPS...",
  UPLOADING_BILL: "Subiendo factura...",
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

/** Client-side bill file checks (web-only). */
export const PDF_NOT_PDF = "Selecciona un archivo PDF.";
export const PHOTO_NOT_IMAGE = "Selecciona una foto JPG o PNG.";
export const BILL_TOO_LARGE = "El archivo supera el tamaño máximo de 50 MB.";
