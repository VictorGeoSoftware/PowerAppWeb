import type { User } from "firebase/auth";

export class BmApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Machine-readable `code` of a `ReportErrorResponse`, when the backend sent one. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "BmApiError";
  }
}

/** Backend errors arrive as {"message": ...}, {"error": ...} or {"code", "message"} (reports). */
async function apiError(response: Response): Promise<BmApiError> {
  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { message?: string; error?: string; code?: unknown };
    const code = typeof body?.code === "string" ? body.code : undefined;
    return new BmApiError(response.status, body?.message || body?.error || text || `HTTP ${response.status}`, code);
  } catch {
    return new BmApiError(response.status, text || `HTTP ${response.status}`);
  }
}

/**
 * Calls BmBackend through the same-origin proxy (`/api/bm/<path>`) with the
 * user's Firebase ID token. Throws BmApiError on non-2xx responses.
 */
export async function bmFetch(
  user: Pick<User, "getIdToken">,
  path: string,
  init: RequestInit = {},
  forceRefreshToken = false,
): Promise<Response> {
  const token = await user.getIdToken(forceRefreshToken);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api/bm/${path.replace(/^\/+/, "")}`, { ...init, headers });
  if (!response.ok) throw await apiError(response);
  return response;
}
