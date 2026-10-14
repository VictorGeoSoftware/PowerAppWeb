import { describe, expect, it } from "vitest";
import {
  canReach,
  type CurrentConditions,
  evaluateGate,
  evaluateStage,
  type FeeFirstStage,
  fallbackRoute,
  redirectFor,
  ROUTES,
} from "./fee-first";

const session = { powerPeriods: ["P1", "P2"], energyPeriods: ["P1", "P2", "P3"] };
const full: CurrentConditions = {
  powerTermPriceByPeriod: { P1: "0.1", P2: "0.2" },
  energyPriceByPeriod: { P1: "0.1", P2: "0.2", P3: "0.3" },
  extraServices: "",
  companyName: "Iberdrola",
};
const STAGES: FeeFirstStage[] = ["CONSUMPTION_REQUIRED", "CURRENT_CONDITIONS_REQUIRED", "UNLOCKED"];

// Mirrors BmApp EvaluateFeeFirstGateUseCaseTest.
describe("evaluateStage", () => {
  it("no session requires consumption", () => {
    expect(evaluateStage(null, full)).toBe("CONSUMPTION_REQUIRED");
  });

  it("session with no conditions requires current conditions", () => {
    expect(evaluateStage(session, null)).toBe("CURRENT_CONDITIONS_REQUIRED");
  });

  it("stays locked while any required period is missing", () => {
    const energy = { P1: "0.1", P2: "0.2" };
    expect(evaluateStage(session, { ...full, energyPriceByPeriod: energy })).toBe("CURRENT_CONDITIONS_REQUIRED");
  });

  it.each(["", "  ", "0", "0,0", "-1", "abc"])("does not count %j", (value) => {
    const c = { ...full, powerTermPriceByPeriod: { ...full.powerTermPriceByPeriod, P1: value } };
    expect(evaluateStage(session, c)).toBe("CURRENT_CONDITIONS_REQUIRED");
  });

  it("accepts comma and dot decimals", () => {
    const c = { ...full, powerTermPriceByPeriod: { P1: "0,12", P2: " 0.5 " } };
    expect(evaluateStage(session, c)).toBe("UNLOCKED");
  });

  it("unlocks with empty extra services", () => {
    expect(evaluateStage(session, { ...full, extraServices: "" })).toBe("UNLOCKED");
  });

  it("ignores prices for periods not in the study", () => {
    const c = { ...full, powerTermPriceByPeriod: { ...full.powerTermPriceByPeriod, P6: "" } };
    expect(evaluateStage(session, c)).toBe("UNLOCKED");
  });

  it.each([null, "", "   "])("stays locked without supplier (%j) even with every price", (companyName) => {
    expect(evaluateStage(session, { ...full, companyName })).toBe("CURRENT_CONDITIONS_REQUIRED");
  });

  it("counts the supplier on its own before any price", () => {
    const g = evaluateGate(session, { ...full, powerTermPriceByPeriod: {}, energyPriceByPeriod: {} });
    expect(g).toEqual({ stage: "CURRENT_CONDITIONS_REQUIRED", required: 6, completed: 1 });
  });
});

// Mirrors BmApp BmAppRouteTest.
describe("routes", () => {
  it("fetch consumption is unreachable once a study exists", () => {
    expect(canReach("CONSUMPTION_REQUIRED", ROUTES.fetchConsumption)).toBe(true);
    expect(canReach("CURRENT_CONDITIONS_REQUIRED", ROUTES.fetchConsumption)).toBe(false);
    expect(canReach("UNLOCKED", ROUTES.fetchConsumption)).toBe(false);
  });

  it("current conditions stays reachable once unlocked", () => {
    expect(canReach("CONSUMPTION_REQUIRED", ROUTES.currentConditions)).toBe(false);
    expect(canReach("CURRENT_CONDITIONS_REQUIRED", ROUTES.currentConditions)).toBe(true);
    expect(canReach("UNLOCKED", ROUTES.currentConditions)).toBe(true);
  });

  it.each([ROUTES.proposals, ROUTES.configuration])("%s needs the full gate", (route) => {
    expect(canReach("CONSUMPTION_REQUIRED", route)).toBe(false);
    expect(canReach("CURRENT_CONDITIONS_REQUIRED", route)).toBe(false);
    expect(canReach("UNLOCKED", route)).toBe(true);
  });

  it("every stage has a reachable fallback", () => {
    for (const stage of STAGES) expect(canReach(stage, fallbackRoute(stage))).toBe(true);
  });

  it("fallback sends an ungated user back to the fetch step", () => {
    expect(fallbackRoute("CONSUMPTION_REQUIRED")).toBe(ROUTES.fetchConsumption);
    expect(fallbackRoute("CURRENT_CONDITIONS_REQUIRED")).toBe(ROUTES.currentConditions);
    expect(fallbackRoute("UNLOCKED")).toBe(ROUTES.currentConditions);
  });

  it("redirectFor returns the fallback only for blocked routes", () => {
    expect(redirectFor("CONSUMPTION_REQUIRED", ROUTES.proposals)).toBe(ROUTES.fetchConsumption);
    expect(redirectFor("CURRENT_CONDITIONS_REQUIRED", ROUTES.proposals)).toBe(ROUTES.currentConditions);
    expect(redirectFor("UNLOCKED", ROUTES.fetchConsumption)).toBe(ROUTES.currentConditions);
    expect(redirectFor("UNLOCKED", ROUTES.proposals)).toBeNull();
    expect(redirectFor("CONSUMPTION_REQUIRED", "/somewhere-else")).toBeNull();
  });
});
