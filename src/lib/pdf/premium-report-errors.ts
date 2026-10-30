/**
 * Premium "Informe completo" outcome mapping (report-web-export truth table T1/T2, T8, T11–T18).
 * Maps by status and backend `code` only; the backend `message` is never shown.
 * 401 and 403 without `premium_required` (T9/T10) are not mapped here: they keep the
 * existing forced sign-out.
 */
import {
  PREMIUM_ADDRESS_MISSING,
  PREMIUM_CONDITIONS_MISSING,
  PREMIUM_DATA_MISMATCH,
  PREMIUM_GENERATION_FAILED,
  PREMIUM_HOLDER_MISSING,
  PREMIUM_REQUIRED_MESSAGE,
  PREMIUM_STUDY_EXPIRED,
  PREMIUM_STUDY_NOT_READY,
  PREMIUM_UNAVAILABLE,
} from "@/lib/proposals/messages";

export type PremiumReportFailure = { message: string; retry: boolean };

export const PREMIUM_REQUIRED_CODE = "premium_required";

const fail = (message: string, retry: boolean): PremiumReportFailure => ({ message, retry });

/** `status` null = network error or a non-HTTP failure. */
export function premiumReportFailure(status: number | null, code?: string): PremiumReportFailure {
  if (status === 403 && code === PREMIUM_REQUIRED_CODE) return fail(PREMIUM_REQUIRED_MESSAGE, false);
  if (status === 404 && code === "study_not_found") return fail(PREMIUM_STUDY_EXPIRED, false);
  if (status === 409 && code === "study_not_ready") return fail(PREMIUM_STUDY_NOT_READY, true);
  if (status === 422) {
    if (code === "holder_missing") return fail(PREMIUM_HOLDER_MISSING, false);
    if (code === "address_missing") return fail(PREMIUM_ADDRESS_MISSING, false);
    if (code === "current_conditions_missing") return fail(PREMIUM_CONDITIONS_MISSING, false);
    return fail(PREMIUM_DATA_MISMATCH, true);
  }
  if (status === 400 && code === "invalid_request") return fail(PREMIUM_DATA_MISMATCH, true);
  if (status === 501 && code === "report_unavailable") return fail(PREMIUM_UNAVAILABLE, false);
  return fail(PREMIUM_GENERATION_FAILED, true);
}

/** Same rule as the backend validator: blank or the `--` placeholder. */
export const isMissingIdentity = (value: string | null | undefined) =>
  value == null || value.trim() === "" || value.trim() === "--";

/** Client pre-check (T1/T2); `null` when holder and address are present. */
export function identityFailure(holder: string | undefined, address: string | undefined): PremiumReportFailure | null {
  if (isMissingIdentity(holder)) return fail(PREMIUM_HOLDER_MISSING, false);
  if (isMissingIdentity(address)) return fail(PREMIUM_ADDRESS_MISSING, false);
  return null;
}

const SAFE_PDF_NAME = /^[A-Za-z0-9_.-]+\.pdf$/;

/** Server file name from Content-Disposition, else `informe_completo_<now>.pdf`. */
export function premiumPdfFileName(contentDisposition: string | null, now: number = Date.now()): string {
  const match = contentDisposition?.match(/filename\s*=\s*"?([^";]+)"?/i);
  const name = match?.[1]?.trim();
  return name && SAFE_PDF_NAME.test(name) && !name.startsWith(".") ? name : `informe_completo_${now}.pdf`;
}
