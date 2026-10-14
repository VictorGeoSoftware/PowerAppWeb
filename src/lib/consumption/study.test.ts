import { describe, expect, it, vi } from "vitest";
import { BmApiError } from "@/lib/api/bm-fetch";
import { runStudy, type StudyFetch } from "./study";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Route = (path: string, init?: RequestInit) => Response | Promise<Response>;

/** Fake proxy: submit → statuses in order → result. */
function fakeFetch({
  submit = () => json({ jobId: "job-1" }, 202),
  statuses = ["COMPLETED"],
  result = () => json({ success: true }),
}: { submit?: Route; statuses?: (string | Error)[]; result?: Route } = {}) {
  let i = 0;
  const calls: string[] = [];
  const fetch: StudyFetch = async (path, init) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path.startsWith("fetch-user")) return submit(path, init);
    if (path.startsWith("consumption-report-status")) {
      const s = statuses[Math.min(i++, statuses.length - 1)];
      if (s instanceof Error) throw s;
      return json({ jobId: "job-1", status: s });
    }
    return result(path, init);
  };
  return { fetch, calls };
}

const sleep = vi.fn(async () => {});

describe("runStudy", () => {
  it("submits the CUPS, reports steps in order and returns the report", async () => {
    const { fetch, calls } = fakeFetch({ statuses: ["PENDING", "PROCESSING", "COMPLETED"] });
    const steps: string[] = [];
    const progress: number[] = [];
    const r = await runStudy({
      fetch,
      cups: "ES0031607515707001RC",
      onStep: (s) => steps.push(s),
      onProgress: (_, a) => progress.push(a),
      sleep,
    });
    expect(r).toEqual({ ok: true, jobId: "job-1", report: { success: true } });
    expect(steps).toEqual(["SUBMITTING_CUPS", "QUEUED", "PROCESSING", "FETCHING_RESULTS"]);
    expect(progress).toEqual([0, 1, 2, 3]);
    expect(calls).toEqual([
      "POST fetch-user-consumption-report-by-cups",
      "GET consumption-report-status/job-1",
      "GET consumption-report-status/job-1",
      "GET consumption-report-status/job-1",
      "GET consumption-report-result/job-1",
    ]);
    expect(sleep).toHaveBeenCalledWith(3000, undefined);
  });

  it("sends the CUPS as JSON", async () => {
    const submit = vi.fn<Route>(() => json({ jobId: "j" }, 202));
    await runStudy({ fetch: fakeFetch({ submit }).fetch, cups: "ES0031607515707001RC", onStep: () => {}, sleep });
    expect(JSON.parse(submit.mock.calls[0][1]!.body as string)).toEqual({ cupsCode: "ES0031607515707001RC" });
  });

  it.each([
    ["non-202 submit", { submit: () => json({ jobId: "j" }, 200) }, "SUBMIT_FAILED"],
    ["submit error", { submit: () => Promise.reject(new BmApiError(400, "Invalid CUPS format")) }, "SUBMIT_FAILED"],
    ["FAILED status", { statuses: ["PENDING", "FAILED"] }, "PROCESSING_FAILED"],
    ["status 404", { statuses: [new BmApiError(404, "Job not found")] }, "STATUS_CHECK_FAILED"],
    ["unknown status", { statuses: ["WAT"] }, "STATUS_CHECK_FAILED"],
    ["result error", { result: () => Promise.reject(new BmApiError(500, "x")) }, "RESULT_FETCH_FAILED"],
    ["result 202", { result: () => json({}, 202) }, "RESULT_FETCH_FAILED"],
  ] as const)("%s → %s", async (_, cfg, failure) => {
    const r = await runStudy({ fetch: fakeFetch(cfg as never).fetch, cups: "C", onStep: () => {}, sleep });
    expect(r).toEqual({ ok: false, failure });
  });

  it("times out after maxAttempts counting resumed attempts", async () => {
    const { fetch, calls } = fakeFetch({ statuses: ["PROCESSING"] });
    const r = await runStudy({ fetch, resumeJobId: "job-1", startAttempts: 57, onStep: () => {}, sleep });
    expect(r).toEqual({ ok: false, failure: "TIMEOUT" });
    expect(calls).toHaveLength(3);
    const full = fakeFetch({ statuses: ["PENDING"] });
    await runStudy({ fetch: full.fetch, cups: "C", onStep: () => {}, sleep });
    expect(full.calls.filter((c) => c.includes("status"))).toHaveLength(60);
  });

  it("resumes without submitting", async () => {
    const { fetch, calls } = fakeFetch();
    const steps: string[] = [];
    const r = await runStudy({ fetch, resumeJobId: "job-9", onStep: (s) => steps.push(s), sleep });
    expect(r.ok).toBe(true);
    expect(calls[0]).toBe("GET consumption-report-status/job-9");
    expect(steps[0]).toBe("QUEUED");
  });

  it("stops when aborted", async () => {
    const ctrl = new AbortController();
    const { fetch, calls } = fakeFetch({ statuses: ["PENDING"] });
    const r = await runStudy({
      fetch,
      cups: "C",
      onStep: () => {},
      signal: ctrl.signal,
      sleep: async () => ctrl.abort(),
    });
    expect(r).toEqual({ ok: false, aborted: true });
    expect(calls).toEqual(["POST fetch-user-consumption-report-by-cups"]);
  });
});
