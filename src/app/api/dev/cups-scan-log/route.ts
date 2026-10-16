/**
 * DEV-ONLY spike endpoint (`cups-camera-ocr` step 1): appends one JSON line per scan
 * attempt to `.dev-logs/cups-scan.jsonl`. Returns 404 in production before touching
 * the filesystem (spec Scenario 9).
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isValidCups } from "@/lib/consumption/cups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 20_000;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response("Not Found", { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const pickedCups = typeof body.pickedCups === "string" && body.pickedCups ? body.pickedCups.slice(0, 40) : null;
  const t = body.timeToResultMs;
  const record = {
    ts: new Date().toISOString(),
    userAgent: str(req.headers.get("user-agent"), 300),
    billLabel: str(body.billLabel, 120),
    timeToResultMs: typeof t === "number" && Number.isFinite(t) && t >= 0 ? Math.round(t) : null,
    rawOcrText: str(body.rawOcrText, 4000),
    pickedCups,
    valid: pickedCups ? isValidCups(pickedCups) : false,
  };

  const dir = path.join(process.cwd(), ".dev-logs");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "cups-scan.jsonl"), JSON.stringify(record) + "\n", "utf8");
  return Response.json({ ok: true });
}
