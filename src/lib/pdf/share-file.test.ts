import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareOrDownload } from "./share-file";

const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
const NAME = "comparador_20261019_153045.pdf";
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7)", maxTouchPoints: 5 };

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("shareOrDownload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:pdf");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("shares the file when the browser can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const outcome = await shareOrDownload(
      blob,
      NAME,
      "Comparador de propuestas",
      {
        navigator: { ...ANDROID, share, canShare: () => true },
      },
    );
    expect(outcome).toBe("shared");
    const data = share.mock.calls[0][0] as ShareData;
    expect(data.title).toBe("Comparador de propuestas");
    expect(data.files).toHaveLength(1);
    expect(data.files?.[0].name).toBe(NAME);
    expect(data.files?.[0].type).toBe("application/pdf");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("AbortError is a cancel; NotAllowedError needs a fresh gesture", async () => {
    const nav = (name: string) => ({
      ...ANDROID,
      share: vi.fn().mockRejectedValue(domError(name)),
      canShare: () => true,
    });
    expect(
      await shareOrDownload(blob, NAME, "t", { navigator: nav("AbortError") }),
    ).toBe("cancelled");
    expect(
      await shareOrDownload(blob, NAME, "t", {
        navigator: nav("NotAllowedError"),
      }),
    ).toBe("needs-gesture");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it.each([
    ["no share support", () => ({})],
    ["canShare false", () => ({ share: vi.fn(), canShare: () => false })],
    [
      "share fails otherwise",
      () => ({
        share: vi.fn().mockRejectedValue(domError("DataError")),
        canShare: () => true,
      }),
    ],
  ])("downloads when %s", async (_, makeNavigator) => {
    const navigator = { ...ANDROID, ...makeNavigator() };
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(NAME);
        expect(this.getAttribute("href")).toBe("blob:pdf");
      });
    expect(await shareOrDownload(blob, NAME, "t", { navigator })).toBe(
      "downloaded",
    );
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
    click.mockRestore();
  });

  it.each([
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0],
    ["touch Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 10],
    ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0],
    ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", 0],
    ["unknown", "", 0],
  ])("downloads directly on %s even with working file sharing", async (_, userAgent, maxTouchPoints) => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn(() => true);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(NAME);
      expect(this.href).toBe("blob:pdf");
    });
    expect(await shareOrDownload(blob, NAME, "t", { navigator: { userAgent, maxTouchPoints, share, canShare } }))
      .toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(canShare).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
  });

  it.each([
    ["Android tablet", "Mozilla/5.0 (Linux; Android 14; SM-X710)", 5],
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", 5],
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)", 5],
    ["iPadOS desktop mode", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5],
  ])("keeps native file sharing on %s", async (_, userAgent, maxTouchPoints) => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareOrDownload(blob, NAME, "t", { navigator: { userAgent, maxTouchPoints, share, canShare: () => true } }))
      .toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
