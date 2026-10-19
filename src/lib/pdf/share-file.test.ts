import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareOrDownload } from "./share-file";

const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
const NAME = "comparador_20261019_153045.pdf";

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
        navigator: { share, canShare: () => true },
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
    const navigator = makeNavigator();
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
});
