import { describe, expect, it } from "vitest";
import { isIos, isMobileDevice, isStandalone } from "./platform";

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

describe("isMobileDevice", () => {
  it.each([
    ["iPhone", IPHONE, 5],
    ["Chrome on iPhone", CRIOS, 5],
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)", 5],
    ["iPadOS desktop user agent", MAC, 5],
    ["Android phone", ANDROID, 5],
    ["Android tablet without Mobile token", "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", 5],
  ])("recognizes %s as mobile/tablet", (_, userAgent, maxTouchPoints) => {
    expect(isMobileDevice({ userAgent, maxTouchPoints })).toBe(true);
  });

  it.each([
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0],
    ["touch Windows laptop", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 10],
    ["Mac", MAC, 0],
    ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", 0],
    ["unknown", "", 0],
  ])("does not mistake %s for a phone or tablet", (_, userAgent, maxTouchPoints) => {
    expect(isMobileDevice({ userAgent, maxTouchPoints })).toBe(false);
  });
});
