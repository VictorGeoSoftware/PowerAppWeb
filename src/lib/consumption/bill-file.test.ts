import { describe, expect, it } from "vitest";
import { billUploadName, checkBillFile, MAX_BILL_BYTES } from "./bill-file";

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("checkBillFile", () => {
  it.each([
    [f("a.pdf", "application/pdf"), "ok"],
    [f("FACTURA.PDF", ""), "ok"],
    [f("factura", "application/pdf"), "ok"],
    [f("foto.png", "image/png"), "NOT_PDF"],
    [f("doc", ""), "NOT_PDF"],
    [f("a.pdf", "application/pdf", MAX_BILL_BYTES), "ok"],
    [f("a.pdf", "application/pdf", MAX_BILL_BYTES + 1), "TOO_LARGE"],
  ] as const)("%j → %s", (file, expected) => {
    expect(checkBillFile(file)).toBe(expected);
  });
});

describe("billUploadName", () => {
  it("keeps .pdf names and falls back otherwise", () => {
    expect(billUploadName({ name: "Bill.PDF" })).toBe("Bill.PDF");
    expect(billUploadName({ name: "factura" })).toBe("factura.pdf");
    expect(billUploadName({ name: "" })).toBe("factura.pdf");
  });
});
