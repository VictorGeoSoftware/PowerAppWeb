import type { User } from "firebase/auth";

export class BmApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BmApiError";
  }
}

/** Backend errors arrive as {"message": ...} or {"error": ...}. */
async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    return body.message || body.error || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
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
  if (!response.ok) throw new BmApiError(response.status, await errorMessage(response));
  return response;
}
