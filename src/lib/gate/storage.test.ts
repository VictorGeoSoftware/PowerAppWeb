import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_JOB_KEY,
  clearStudyStorage,
  COLLECTED_PRICES_JOBS_KEY,
  CONDITIONS_KEY,
  LAST_JOB_ID_KEY,
  loadActiveJob,
  loadConditions,
  loadLastCompletedJobId,
  loadProposalFixedAmounts,
  loadAutoHideSignature,
  loadProposalVisibility,
  loadProposalsResponseJobId,
  saveProposalsResponseJobId,
  PROPOSAL_AUTO_HIDE_SIGNATURE_KEY,
  PROPOSAL_FIXED_AMOUNTS_KEY,
  PROPOSAL_VISIBILITY_KEY,
  saveActiveJob,
  saveAutoHideSignature,
  saveConditions,
  saveLastCompletedJobId,
  saveProposalFixedAmounts,
  saveProposalVisibility,
} from "./storage";

const c = { powerTermPriceByPeriod: { P1: "0,1" }, energyPriceByPeriod: {}, extraServices: "", companyName: "X" };

describe("gate storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("round-trips hidden proposals only; all visible or corrupt clears", () => {
    saveProposalVisibility({ A: false, B: true });
    expect(localStorage.getItem(PROPOSAL_VISIBILITY_KEY)).toBe('{"A":false}');
    saveProposalVisibility({ A: true });
    expect(localStorage.getItem(PROPOSAL_VISIBILITY_KEY)).toBeNull();
    localStorage.setItem(PROPOSAL_VISIBILITY_KEY, "{oops");
    expect(loadProposalVisibility()).toEqual({});
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
    sessionStorage.setItem(COLLECTED_PRICES_JOBS_KEY, '["j"]');
    saveProposalFixedAmounts({ A: "12,5" });
    saveProposalVisibility({ A: false, B: true });
    saveAutoHideSignature("j@1.0");
    saveProposalsResponseJobId("j");
    expect(loadProposalsResponseJobId()).toBe("j");
    expect(loadProposalVisibility()).toEqual({ A: false });
    expect(loadAutoHideSignature()).toBe("j@1.0");
    clearStudyStorage();
    expect(loadProposalsResponseJobId()).toBeNull();
    expect(localStorage.getItem(PROPOSAL_VISIBILITY_KEY)).toBeNull();
    expect(localStorage.getItem(PROPOSAL_AUTO_HIDE_SIGNATURE_KEY)).toBeNull();
    expect(localStorage.getItem(PROPOSAL_FIXED_AMOUNTS_KEY)).toBeNull();
    expect(sessionStorage.getItem(COLLECTED_PRICES_JOBS_KEY)).toBeNull();
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

  it("round-trips proposal fixed amounts; empty removes, corrupt loads empty", () => {
    saveProposalFixedAmounts({ A: "12,5", B: "" });
    expect(loadProposalFixedAmounts()).toEqual({ A: "12,5", B: "" });
    saveProposalFixedAmounts({});
    expect(localStorage.getItem(PROPOSAL_FIXED_AMOUNTS_KEY)).toBeNull();
    localStorage.setItem(PROPOSAL_FIXED_AMOUNTS_KEY, "{oops");
    expect(loadProposalFixedAmounts()).toEqual({});
    localStorage.setItem(PROPOSAL_FIXED_AMOUNTS_KEY, JSON.stringify({ A: 1, B: "2" }));
    expect(loadProposalFixedAmounts()).toEqual({ B: "2" });
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
