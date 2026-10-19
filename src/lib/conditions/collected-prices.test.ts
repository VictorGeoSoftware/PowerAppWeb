import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumptionSession, CurrentConditions } from "@/lib/gate/fee-first";
import { clearStudyStorage } from "@/lib/gate/storage";
import {
  buildCollectedPrices,
  canonicalTariff,
  collectPricesOnNavigate,
  markCollectedPricesSubmitted,
  parsePrice,
  shouldCollectPrices,
} from "./collected-prices";

const session = (over: Partial<ConsumptionSession> = {}): ConsumptionSession => ({
  powerPeriods: ["P1", "P2"],
  energyPeriods: ["P1", "P3"],
  jobId: "J",
  feeType: "3.0TD",
  ...over,
});

const conditions = (over: Partial<CurrentConditions> = {}): CurrentConditions => ({
  powerTermPriceByPeriod: { P1: "0,1", P2: "0.2", P6: "9" },
  energyPriceByPeriod: { P1: "0,15", P3: "abc" },
  extraServices: "12,5",
  companyName: " Iberdrola ",
  ...over,
});

const user = { getIdToken: vi.fn(async () => "tok") };

describe("tariff rules", () => {
  it("canonicalizes", () => {
    expect(canonicalTariff("3.0 td")).toBe("30TD");
    expect(canonicalTariff(" 2.0TD ")).toBe("20TD");
  });

  it.each([
    ["3.0TD", true],
    ["3.0 td", true],
    ["6.1TD", true],
    ["2.0TD", false],
    ["2.0 TD ", false],
    ["2.0 td", false],
    ["", false],
    [" . ", false],
    [undefined, false],
    [null, false],
  ])("shouldCollectPrices(%j) = %s", (t, expected) => {
    expect(shouldCollectPrices(t)).toBe(expected);
  });
});

describe("parsePrice", () => {
  it("parses comma/dot decimals, allows zero, rejects garbage", () => {
    expect(parsePrice("0,1")).toBe(0.1);
    expect(parsePrice(" 2.5 ")).toBe(2.5);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("")).toBeUndefined();
    expect(parsePrice("  ")).toBeUndefined();
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("1,2,3")).toBeUndefined();
    expect(parsePrice(undefined)).toBeUndefined();
  });
});

describe("buildCollectedPrices", () => {
  it("builds the BmApp payload with session periods only", () => {
    expect(buildCollectedPrices(session(), conditions())).toEqual({
      companyName: "Iberdrola",
      tariffType: "3.0TD",
      powerPrices: { P1: 0.1, P2: 0.2 },
      energyPrices: { P1: 0.15 },
      extraServices: 12.5,
    });
  });

  it("omits extraServices when blank or unparseable", () => {
    expect(buildCollectedPrices(session(), conditions({ extraServices: "" }))).not.toHaveProperty("extraServices");
    expect(buildCollectedPrices(session(), conditions({ extraServices: "x" }))).not.toHaveProperty("extraServices");
  });

  it("uses an empty tariff when feeType is missing", () => {
    expect(buildCollectedPrices(session({ feeType: undefined }), conditions())?.tariffType).toBe("");
  });

  it("returns null when missing data, blank supplier or no parseable price", () => {
    expect(buildCollectedPrices(null, conditions())).toBeNull();
    expect(buildCollectedPrices(session(), null)).toBeNull();
    expect(buildCollectedPrices(session(), conditions({ companyName: "  " }))).toBeNull();
    expect(buildCollectedPrices(session(), conditions({ companyName: null }))).toBeNull();
    expect(
      buildCollectedPrices(session(), conditions({ powerTermPriceByPeriod: { P6: "1" }, energyPriceByPeriod: { P1: "" } })),
    ).toBeNull();
  });
});

describe("once-per-job guard", () => {
  beforeEach(() => sessionStorage.clear());

  it("is true once per job and reset by clearStudyStorage", () => {
    expect(markCollectedPricesSubmitted("J")).toBe(true);
    expect(markCollectedPricesSubmitted("J")).toBe(false);
    expect(markCollectedPricesSubmitted("K")).toBe(true);
    clearStudyStorage();
    expect(markCollectedPricesSubmitted("J")).toBe(true);
  });
});

describe("collectPricesOnNavigate", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("posts once per job with the bearer token", async () => {
    collectPricesOnNavigate(user, session(), conditions());
    collectPricesOnNavigate(user, session(), conditions());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bm/collected-prices");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
    expect(JSON.parse(init.body).companyName).toBe("Iberdrola");
  });

  it("sends nothing for 2.0TD, blank tariff or missing job id", async () => {
    collectPricesOnNavigate(user, session({ feeType: "2.0 TD" }), conditions());
    collectPricesOnNavigate(user, session({ jobId: "K", feeType: "" }), conditions());
    collectPricesOnNavigate(user, session({ jobId: undefined }), conditions());
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the job even when excluded (BmApp order)", async () => {
    collectPricesOnNavigate(user, session({ feeType: "2.0TD" }), conditions());
    expect(markCollectedPricesSubmitted("J")).toBe(false);
  });

  it("swallows backend and network failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    collectPricesOnNavigate(user, session(), conditions());
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    collectPricesOnNavigate(user, session({ jobId: "K" }), conditions());
    await flush();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
