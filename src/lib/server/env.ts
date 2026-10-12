const DEV_DEFAULT_BACKEND_URL = "http://217.154.181.175:9081"; // BmBackend QA

/** Server-only BmBackend origin (without `/api/v1`). Never expose to the client. */
export function backendBaseUrl(): string {
  const url = process.env.BM_BACKEND_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("BM_BACKEND_URL is not set");
  }
  return DEV_DEFAULT_BACKEND_URL;
}
