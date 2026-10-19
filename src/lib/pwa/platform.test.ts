import { describe, expect, it } from "vitest";
import { isIos, isStandalone } from "./platform";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CRIOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

describe("isIos", () => {
  it("detects iPhone Safari and other iOS browsers", () => {
    expect(isIos({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: CRIOS, maxTouchPoints: 5 })).toBe(true);
  });
  it("detects iPadOS reporting as a Mac with touch", () => {
    expect(isIos({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
  });
  it("is false on desktop Mac and Android", () => {
    expect(isIos({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe("isStandalone", () => {
  const nav = { userAgent: IPHONE, maxTouchPoints: 5 };
  it("uses navigator.standalone", () => {
    expect(isStandalone({ ...nav, standalone: true })).toBe(true);
  });
  it("uses display-mode", () => {
    expect(isStandalone(nav, () => ({ matches: true }))).toBe(true);
    expect(isStandalone(nav, () => ({ matches: false }))).toBe(false);
    expect(isStandalone(nav)).toBe(false);
  });
});
