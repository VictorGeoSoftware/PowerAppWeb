import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_JOB_KEY,
  clearStudyStorage,
  CONDITIONS_KEY,
  LAST_JOB_ID_KEY,
  loadActiveJob,
  loadConditions,
  loadLastCompletedJobId,
  saveActiveJob,
  saveConditions,
  saveLastCompletedJobId,
} from "./storage";

const c = { powerTermPriceByPeriod: { P1: "0,1" }, energyPriceByPeriod: {}, extraServices: "", companyName: "X" };

describe("gate storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("round-trips conditions", () => {
    saveConditions(c);
    expect(loadConditions()).toEqual(c);
  });

  it("null removes them; corrupt data loads as null", () => {
    saveConditions(c);
    saveConditions(null);
    expect(loadConditions()).toBeNull();
    localStorage.setItem(CONDITIONS_KEY, "{oops");
    expect(loadConditions()).toBeNull();
  });

  it("clearStudyStorage removes conditions, job id and active job only", () => {
    saveConditions(c);
    saveActiveJob({ jobId: "a", source: "cups", cups: "C", attempts: 2 });
    localStorage.setItem(LAST_JOB_ID_KEY, "j");
    localStorage.setItem("bm.deviceId", "web-1");
    clearStudyStorage();
    expect(localStorage.getItem(CONDITIONS_KEY)).toBeNull();
    expect(localStorage.getItem(LAST_JOB_ID_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
    expect(localStorage.getItem("bm.deviceId")).toBe("web-1");
  });

  it("round-trips the active job; corrupt or missing is null", () => {
    saveActiveJob({ jobId: "a", source: "cups", cups: "C", attempts: 3 });
    expect(loadActiveJob()).toEqual({ jobId: "a", source: "cups", cups: "C", attempts: 3 });
    saveActiveJob({ jobId: "p", source: "pdf", attempts: 1 });
    expect(loadActiveJob()).toEqual({ jobId: "p", source: "pdf", attempts: 1 });
    saveActiveJob({ jobId: "f", source: "photo", attempts: 2 });
    expect(loadActiveJob()).toEqual({ jobId: "f", source: "photo", attempts: 2 });
    sessionStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ jobId: "u", source: "weird", attempts: 1 }));
    expect(loadActiveJob()).toMatchObject({ source: "cups" });
    // Pre-PDF entries have no source: read as CUPS.
    sessionStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ jobId: "old", cups: "C", attempts: 4 }));
    expect(loadActiveJob()).toEqual({ jobId: "old", source: "cups", cups: "C", attempts: 4 });
    saveActiveJob(null);
    expect(loadActiveJob()).toBeNull();
    sessionStorage.setItem(ACTIVE_JOB_KEY, "{oops");
    expect(loadActiveJob()).toBeNull();
  });

  it("last completed job id expires after 1 h and is cleared", () => {
    saveLastCompletedJobId("j", 1_000);
    expect(loadLastCompletedJobId(1_000 + 60 * 60 * 1000)).toBe("j");
    expect(loadLastCompletedJobId(1_001 + 60 * 60 * 1000)).toBeNull();
    expect(localStorage.getItem(LAST_JOB_ID_KEY)).toBeNull();
    localStorage.setItem(LAST_JOB_ID_KEY, "job-1"); // legacy/corrupt
    expect(loadLastCompletedJobId()).toBeNull();
    expect(localStorage.getItem(LAST_JOB_ID_KEY)).toBeNull();
  });
});
