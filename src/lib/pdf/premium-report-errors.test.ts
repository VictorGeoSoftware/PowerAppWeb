import { describe, expect, it } from "vitest";
import {
  PREMIUM_ADDRESS_MISSING,
  PREMIUM_CONDITIONS_MISSING,
  PREMIUM_DATA_MISMATCH,
  PREMIUM_GENERATION_FAILED,
  PREMIUM_HOLDER_MISSING,
  PREMIUM_REQUIRED_MESSAGE,
  PREMIUM_STUDY_EXPIRED,
  PREMIUM_STUDY_NOT_READY,
  PREMIUM_UNAVAILABLE,
} from "@/lib/proposals/messages";
import {
  identityFailure,
  isMissingIdentity,
  premiumPdfFileName,
  premiumReportFailure,
} from "./premium-report-errors";

describe("premiumReportFailure (truth table T8, T11–T18)", () => {
  it.each([
    ["T8", 403, "premium_required", PREMIUM_REQUIRED_MESSAGE, false],
    ["T11", 404, "study_not_found", PREMIUM_STUDY_EXPIRED, false],
    ["T12", 409, "study_not_ready", PREMIUM_STUDY_NOT_READY, true],
    ["T13 holder", 422, "holder_missing", PREMIUM_HOLDER_MISSING, false],
    ["T13 address", 422, "address_missing", PREMIUM_ADDRESS_MISSING, false],
    ["T14", 422, "current_conditions_missing", PREMIUM_CONDITIONS_MISSING, false],
    ["T15 stale", 422, "stale_offer", PREMIUM_DATA_MISMATCH, true],
    ["T15 unknown", 422, "unknown_offer", PREMIUM_DATA_MISMATCH, true],
    ["T15 duplicate", 422, "duplicate_offer", PREMIUM_DATA_MISMATCH, true],
    ["T15 no offers", 422, "no_offers", PREMIUM_DATA_MISMATCH, true],
    ["T16 cups", 422, "cups_mismatch", PREMIUM_DATA_MISMATCH, true],
    ["T16 tariff", 422, "tariff_mismatch", PREMIUM_DATA_MISMATCH, true],
    ["T16 consumption", 422, "consumption_mismatch", PREMIUM_DATA_MISMATCH, true],
    ["T16 tax", 422, "tax_mismatch", PREMIUM_DATA_MISMATCH, true],
    ["T16 amount", 422, "invalid_amount", PREMIUM_DATA_MISMATCH, true],
    ["T16 unknown 422", 422, "something_new", PREMIUM_DATA_MISMATCH, true],
    ["T16 422 without code", 422, undefined, PREMIUM_DATA_MISMATCH, true],
    ["T16 400", 400, "invalid_request", PREMIUM_DATA_MISMATCH, true],
    ["T17", 501, "report_unavailable", PREMIUM_UNAVAILABLE, false],
    ["T18 500", 500, "report_generation_failed", PREMIUM_GENERATION_FAILED, true],
    ["T18 502", 502, undefined, PREMIUM_GENERATION_FAILED, true],
    ["T18 network", null, undefined, PREMIUM_GENERATION_FAILED, true],
    ["T18 other status", 418, undefined, PREMIUM_GENERATION_FAILED, true],
    ["T18 404 other code", 404, undefined, PREMIUM_GENERATION_FAILED, true],
    ["T18 400 other code", 400, undefined, PREMIUM_GENERATION_FAILED, true],
    ["T18 409 other code", 409, undefined, PREMIUM_GENERATION_FAILED, true],
    ["T18 501 other code", 501, undefined, PREMIUM_GENERATION_FAILED, true],
  ] as const)("%s: %s %s", (_row, status, code, message, retry) => {
    expect(premiumReportFailure(status, code)).toEqual({ message, retry });
  });
});

describe("identity pre-check (T1/T2)", () => {
  it.each([undefined, "", "  ", "--", " -- "])("missing: %j", (v) => expect(isMissingIdentity(v)).toBe(true));
  it("present", () => expect(isMissingIdentity("Ana")).toBe(false));
  it("holder first, then address, no retry", () => {
    expect(identityFailure("", "")).toEqual({ message: PREMIUM_HOLDER_MISSING, retry: false });
    expect(identityFailure("Ana", "--")).toEqual({ message: PREMIUM_ADDRESS_MISSING, retry: false });
    expect(identityFailure("Ana", "C/ Mayor 1")).toBeNull();
  });
});

describe("premiumPdfFileName", () => {
  it("uses the server name", () => {
    expect(premiumPdfFileName("attachment; filename=informe_completo_123.pdf", 9)).toBe("informe_completo_123.pdf");
    expect(premiumPdfFileName('attachment; filename="informe_completo_5.pdf"', 9)).toBe("informe_completo_5.pdf");
  });
  it.each([null, "", "attachment", 'attachment; filename="../x.pdf"', "attachment; filename=a.exe"])(
    "falls back for %j",
    (header) => expect(premiumPdfFileName(header, 42)).toBe("informe_completo_42.pdf"),
  );
});
