"use client";

import { useCallback, useRef, useState } from "react";
import { useReportAccess } from "@/components/access/report-access-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { BmApiError, bmFetch } from "@/lib/api/bm-fetch";
import { classifySessionError } from "@/lib/auth/session-errors";
import type { ComparatorReportPdfRequest } from "@/lib/pdf/comparator-report";
import {
  PREMIUM_REQUIRED_CODE,
  identityFailure,
  premiumPdfFileName,
  premiumReportFailure,
  type PremiumReportFailure,
} from "@/lib/pdf/premium-report-errors";
import { downloadBlob, sharePdf, shareOrDownload } from "@/lib/pdf/share-file";
import { PREMIUM_SHARE_TITLE, RETRY } from "@/lib/proposals/messages";

type ReadyPdf = { blob: Blob; fileName: string };

export const PREMIUM_PDF_ACCEPT = "application/pdf, application/json";

const isPremiumRequired = (error: unknown) =>
  error instanceof BmApiError && error.status === 403 && error.code === PREMIUM_REQUIRED_CODE;

/**
 * Premium "Informe completo": POST `reports/premium-pdf` with `{jobId, comparison}` where
 * `comparison` is the same body as "Crear informe", then the same share/download flow.
 * Calls `bmFetch` directly (not `useBmFetch`) so a 403 `premium_required` does not sign
 * the Broker out; 401, other 403s and revoked Firebase sessions still go to `reportApiError`.
 * Never re-runs acquisition; the inputs are never touched.
 */
export function usePremiumReport(
  buildRequest: () => ComparatorReportPdfRequest | null,
  jobId: string | undefined,
) {
  const { user, reportApiError } = useAuth();
  const { invalidate } = useReportAccess();
  const inFlight = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<PremiumReportFailure | null>(null);
  const [ready, setReady] = useState<ReadyPdf | null>(null);

  const generate = useCallback(async () => {
    if (inFlight.current) return;
    setError(null);
    setReady(null);
    const comparison = buildRequest();
    if (!user || !jobId || !comparison || comparison.proposals.length === 0) return;
    const missing = identityFailure(comparison.supplyHolder, comparison.supplyAddress);
    if (missing) {
      setError(missing);
      return;
    }
    inFlight.current = true;
    setGenerating(true);
    try {
      const response = await bmFetch(user, "reports/premium-pdf", {
        method: "POST",
        // JSON too: without it Ktor answers the coded error responses with 406.
        headers: { "Content-Type": "application/json", Accept: PREMIUM_PDF_ACCEPT },
        body: JSON.stringify({ jobId, comparison }),
      });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0) {
        setError(premiumReportFailure(null));
        return;
      }
      const pdf = {
        blob: new Blob([bytes], { type: "application/pdf" }),
        fileName: premiumPdfFileName(response.headers.get("content-disposition")),
      };
      const outcome = await shareOrDownload(pdf.blob, pdf.fileName, PREMIUM_SHARE_TITLE);
      if (outcome === "needs-gesture") setReady(pdf);
    } catch (failure) {
      if (isPremiumRequired(failure)) {
        setError(premiumReportFailure(403, PREMIUM_REQUIRED_CODE));
        invalidate();
      } else if (classifySessionError(failure).kind === "forced") {
        reportApiError(failure, user.uid);
      } else if (failure instanceof BmApiError) {
        setError(premiumReportFailure(failure.status, failure.code));
      } else {
        setError(premiumReportFailure(null));
      }
    } finally {
      inFlight.current = false;
      setGenerating(false);
    }
  }, [buildRequest, jobId, user, reportApiError, invalidate]);

  const share = useCallback(async () => {
    if (!ready) return;
    const outcome = await sharePdf(ready.blob, ready.fileName, PREMIUM_SHARE_TITLE);
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
    error,
    ready: ready !== null,
    generate,
    /** Same request as a new tap; clears the previous message. */
    retry: generate,
    share,
    download,
    dismiss: useCallback(() => setReady(null), []),
  };
}

/** Premium outcome message, with Retry only where the truth table allows it. */
export function PremiumReportAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      data-testid="premium-report-alert"
      className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <Button variant="outline" className="h-11 min-w-11 px-3 text-sm" onClick={onRetry}>
          {RETRY}
        </Button>
      )}
    </div>
  );
}
