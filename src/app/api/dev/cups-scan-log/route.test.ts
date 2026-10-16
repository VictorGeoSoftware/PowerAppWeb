// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

let dir: string;
const post = (body: string) =>
  POST(new Request("http://localhost/api/dev/cups-scan-log", { method: "POST", body, headers: { "user-agent": "UA" } }));

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "cups-log-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/dev/cups-scan-log", () => {
  it("returns 404 in production without writing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await post(JSON.stringify({ billLabel: "x" }));
    expect(res.status).toBe(404);
    await expect(stat(path.join(dir, ".dev-logs"))).rejects.toThrow();
  });

  it("appends one JSON line per attempt", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await post(JSON.stringify({ billLabel: "iberdrola-1", timeToResultMs: 1234.5, rawOcrText: "CUPS ...", pickedCups: "ES0031607515707001RC" }));
    await post(JSON.stringify({ billLabel: "repsol-1", timeToResultMs: null, rawOcrText: "", pickedCups: null }));
    const lines = (await readFile(path.join(dir, ".dev-logs", "cups-scan.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    const a = JSON.parse(lines[0]);
    expect(a).toMatchObject({ billLabel: "iberdrola-1", timeToResultMs: 1235, pickedCups: "ES0031607515707001RC", valid: true, userAgent: "UA" });
    expect(typeof a.ts).toBe("string");
    expect(JSON.parse(lines[1])).toMatchObject({ timeToResultMs: null, pickedCups: null, valid: false });
  });

  it("rejects bad JSON and oversize bodies", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await post("nope")).status).toBe(400);
    expect((await post("x".repeat(20_001))).status).toBe(413);
  });
});
