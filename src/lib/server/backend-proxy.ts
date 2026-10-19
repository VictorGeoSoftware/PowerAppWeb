import { backendBaseUrl } from "./env";

/**
 * First path segments a Broker client may reach. Admin endpoints are
 * deliberately absent. Extend when a feature needs a new endpoint.
 */
export const ALLOWED_ROOTS = new Set([
  "price-table-results",
  "fetch-user-consumption-report",
  "fetch-user-consumption-report-by-cups",
  "consumption-report-status",
  "consumption-report-result",
  "consumption-report-refresh",
  "reports",
  "collected-prices",
  "user-data",
  "user-activity",
  "auth",
  "push",
]);

const FORWARDED_REQUEST_HEADERS = ["authorization", "content-type", "accept", "x-request-id"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition", "x-request-id"];

const json = (status: number, message: string) =>
  Response.json({ success: false, message }, { status });

function isSafePath(segments: string[]): boolean {
  return (
    segments.length > 0 &&
    ALLOWED_ROOTS.has(segments[0]) &&
    segments.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes("/"))
  );
}

/** Forwards a same-origin `/api/bm/<path>` request to BmBackend `/api/v1/<path>`. */
export async function proxyToBackend(request: Request, segments: string[]): Promise<Response> {
  if (!isSafePath(segments)) return json(404, "Not found");

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return json(401, "Missing Authorization header");
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const search = new URL(request.url).search;
  const target = `${backendBaseUrl()}/api/v1/${segments.map(encodeURIComponent).join("/")}${search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return json(502, "Backend unavailable");
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
