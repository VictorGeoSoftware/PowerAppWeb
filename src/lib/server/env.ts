/** Server-only BmBackend origin (without `/api/v1`). Never expose to the client. */
export function backendBaseUrl(): string {
  const url = process.env.BM_BACKEND_URL?.trim();
  if (!url) throw new Error("BM_BACKEND_URL is not set (copy .env.example to .env.local)");
  return url.replace(/\/+$/, "");
}
