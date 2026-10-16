import { describe, expect, it } from "vitest";
import { billUploadName, checkBillFile, checkBillPhoto, MAX_BILL_BYTES, photoUploadName } from "./bill-file";

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

describe("checkBillPhoto", () => {
  it.each([
    [f("a.jpg", "image/jpeg"), "ok"],
    [f("a", "image/png"), "ok"],
    [f("IMG.JPEG", ""), "ok"],
    [f("x.PNG", ""), "ok"],
    [f("factura.heic", "image/heic"), "NOT_IMAGE"],
    [f("factura.heic", ""), "NOT_IMAGE"],
    [f("a.gif", "image/gif"), "NOT_IMAGE"],
    [f("factura.pdf", "application/pdf"), "NOT_IMAGE"],
    [f("a.jpg", "image/jpeg", MAX_BILL_BYTES), "ok"],
    [f("a.jpg", "image/jpeg", MAX_BILL_BYTES + 1), "TOO_LARGE"],
  ] as const)("%j → %s", (file, expected) => {
    expect(checkBillPhoto(file)).toBe(expected);
  });
});

describe("photoUploadName", () => {
  it("keeps image names and falls back by type", () => {
    expect(photoUploadName({ name: "IMG_1.JPG", type: "image/jpeg" })).toBe("IMG_1.JPG");
    expect(photoUploadName({ name: "a.png", type: "image/png" })).toBe("a.png");
    expect(photoUploadName({ name: "", type: "image/png" })).toBe("factura.png");
    expect(photoUploadName({ name: "image", type: "image/jpeg" })).toBe("factura.jpg");
  });
});
