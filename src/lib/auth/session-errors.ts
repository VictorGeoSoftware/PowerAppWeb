import { BmApiError } from "@/lib/api/bm-fetch";

export const ACCESS_DENIED_MESSAGE =
  "Esta cuenta no está autorizada para acceder. Contacta con el equipo de administración.";
export const SESSION_EXPIRED_MESSAGE = "Tu sesión ha caducado. Inicia sesión de nuevo.";
export const ACCESS_REVOKED_MESSAGE =
  "Tu acceso ha sido revocado. Contacta con el equipo de administración.";
export const ACCESS_CHECK_FAILED_MESSAGE = "No se pudo verificar tu acceso. Revisa tu conexión.";

/**
 * Firebase errors raised while getting/refreshing the ID token when the session is no
 * longer valid (e.g. BmWeb deleted the grant, which revokes the refresh tokens).
 */
const REVOKED_FIREBASE_CODES = new Set([
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/invalid-user-token",
]);

export type SessionErrorKind = { kind: "forced"; message: string } | { kind: "transient" };

/** Decides whether an error ends the session (forced logout) or is retryable. */
export function classifySessionError(error: unknown): SessionErrorKind {
  if (error instanceof BmApiError) {
    if (error.status === 403) return { kind: "forced", message: error.message || ACCESS_DENIED_MESSAGE };
    if (error.status === 401) return { kind: "forced", message: SESSION_EXPIRED_MESSAGE };
    return { kind: "transient" };
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && REVOKED_FIREBASE_CODES.has(code)) {
    return { kind: "forced", message: ACCESS_REVOKED_MESSAGE };
  }
  return { kind: "transient" };
}
