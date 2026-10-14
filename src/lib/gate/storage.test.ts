import { beforeEach, describe, expect, it } from "vitest";
import { clearStudyStorage, CONDITIONS_KEY, LAST_JOB_ID_KEY, loadConditions, saveConditions } from "./storage";

const c = { powerTermPriceByPeriod: { P1: "0,1" }, energyPriceByPeriod: {}, extraServices: "", companyName: "X" };

describe("gate storage", () => {
  beforeEach(() => localStorage.clear());

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

  it("clearStudyStorage removes conditions and job id only", () => {
    saveConditions(c);
    localStorage.setItem(LAST_JOB_ID_KEY, "j");
    localStorage.setItem("bm.deviceId", "web-1");
    clearStudyStorage();
    expect(localStorage.getItem(CONDITIONS_KEY)).toBeNull();
    expect(localStorage.getItem(LAST_JOB_ID_KEY)).toBeNull();
    expect(localStorage.getItem("bm.deviceId")).toBe("web-1");
  });
});
