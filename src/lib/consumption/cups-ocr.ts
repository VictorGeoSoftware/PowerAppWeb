/**
 * Tesseract.js wrapper for live CUPS OCR. Load only via dynamic `import()` so the
 * OCR engine stays out of the main bundle. Worker/core/lang data come from the
 * library's default CDN (self-hosting is a `pwa-installable` concern).
 */
export interface CupsRecognizer {
  recognize(image: HTMLCanvasElement): Promise<string>;
  terminate(): Promise<void>;
}

export async function createCupsRecognizer(): Promise<CupsRecognizer> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "ES0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });
  return {
    async recognize(image) {
      const { data } = await worker.recognize(image);
      return data.text;
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
