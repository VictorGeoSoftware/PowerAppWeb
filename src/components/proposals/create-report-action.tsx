"use client";

import { Loader2Icon, XIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBmFetch } from "@/lib/api/use-bm-fetch";
import {
  comparatorPdfFileName,
  type ComparatorReportPdfRequest,
} from "@/lib/pdf/comparator-report";
import { downloadBlob, sharePdf, shareOrDownload } from "@/lib/pdf/share-file";
import {
  CLOSE_PDF_PANEL,
  CREATE_REPORT,
  DOWNLOAD_PDF,
  PDF_EXPORT_ERROR,
  PDF_READY,
  PDF_SHARE_TITLE,
  SHARE_PDF,
} from "@/lib/proposals/messages";

type ReadyPdf = { blob: Blob; fileName: string };

/** BmApp `ProposalsViewModel.exportVisibleProposalsAsPdf` + `ComparatorPdfShareManager`. */
export function useCreateReport(
  buildRequest: () => ComparatorReportPdfRequest | null,
) {
  const bmFetch = useBmFetch();
  const inFlight = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState<ReadyPdf | null>(null);

  const generate = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setGenerating(true);
    setFailed(false);
    setReady(null);
    try {
      const request = buildRequest();
      if (!request || request.proposals.length === 0)
        throw new Error("No visible proposals");
      const response = await bmFetch("reports/comparator-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
        body: JSON.stringify(request),
      });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0) throw new Error("Empty PDF");
      const pdf = {
        blob: new Blob([bytes], { type: "application/pdf" }),
        fileName: comparatorPdfFileName(),
      };
      const outcome = await shareOrDownload(
        pdf.blob,
        pdf.fileName,
        PDF_SHARE_TITLE,
      );
      if (outcome === "needs-gesture") setReady(pdf);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setGenerating(false);
    }
  }, [bmFetch, buildRequest]);

  const share = useCallback(async () => {
    if (!ready) return;
    const outcome = await sharePdf(ready.blob, ready.fileName, PDF_SHARE_TITLE);
    if (outcome === "shared") setReady(null);
    else if (outcome === null) {
      downloadBlob(ready.blob, ready.fileName);
      setReady(null);
    }
  }, [ready]);

  const download = useCallback(() => {
    if (!ready) return;
    downloadBlob(ready.blob, ready.fileName);
    setReady(null);
  }, [ready]);

  return {
    generating,
    failed,
    ready: ready !== null,
    generate,
    share,
    download,
    dismiss: () => setReady(null),
  };
}

/** BmApp `PrintButton`: a text button that turns into a spinner while generating. */
export function CreateReportButton({
  generating,
  onClick,
}: {
  generating: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      aria-label={CREATE_REPORT}
      aria-busy={generating}
      disabled={generating}
      onClick={onClick}
      className="h-11 min-w-11 px-3 text-sm font-semibold text-foreground"
    >
      {generating ? (
        <Loader2Icon className="size-[18px] animate-spin" aria-hidden />
      ) : (
        CREATE_REPORT
      )}
    </Button>
  );
}

/** Web adaptation of the Android chooser when the share gesture expired during generation. */
export function ReportReadyPanel({
  onShare,
  onDownload,
  onDismiss,
}: {
  onShare: () => void;
  onDownload: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={PDF_READY}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{PDF_READY}</p>
        <button
          type="button"
          aria-label={CLOSE_PDF_PANEL}
          onClick={onDismiss}
          className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <XIcon className="size-5" />
        </button>
      </div>
      <div className="flex gap-2">
        <Button className="h-11 flex-1 text-sm" onClick={onShare}>
          {SHARE_PDF}
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 text-sm"
          onClick={onDownload}
        >
          {DOWNLOAD_PDF}
        </Button>
      </div>
    </div>
  );
}

export function ReportErrorAlert() {
  return (
    <p
      role="alert"
      className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {PDF_EXPORT_ERROR}
    </p>
  );
}
