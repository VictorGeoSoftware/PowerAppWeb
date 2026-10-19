/**
 * Web adaptation of BmApp `ComparatorPdfShareManager`: native share sheet (Web Share API with
 * files) when available, otherwise a file download.
 */
export type ShareOutcome =
  "shared" | "cancelled" | "needs-gesture" | "downloaded";

type ShareNavigator = Pick<Navigator, "share" | "canShare">;

const REVOKE_DELAY_MS = 1000;

export function downloadBlob(
  blob: Blob,
  fileName: string,
  doc: Document = document,
) {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Some browsers start reading the URL after click returns.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** Only the share sheet; `null` when the browser cannot share this file. */
export async function sharePdf(
  blob: Blob,
  fileName: string,
  title: string,
  nav: Partial<ShareNavigator> = navigator,
): Promise<Exclude<ShareOutcome, "downloaded"> | null> {
  const file = new File([blob], fileName, { type: "application/pdf" });
  if (
    typeof nav.share !== "function" ||
    typeof nav.canShare !== "function" ||
    !nav.canShare({ files: [file] })
  ) {
    return null;
  }
  try {
    await nav.share({ files: [file], title });
    return "shared";
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === "AbortError") return "cancelled";
    // iOS Safari: the user activation expired while the PDF was being generated.
    if (name === "NotAllowedError") return "needs-gesture";
    return null;
  }
}

export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title: string,
  env: { navigator?: Partial<ShareNavigator>; document?: Document } = {},
): Promise<ShareOutcome> {
  const outcome = await sharePdf(
    blob,
    fileName,
    title,
    env.navigator ?? navigator,
  );
  if (outcome) return outcome;
  downloadBlob(blob, fileName, env.document ?? document);
  return "downloaded";
}
