"use client";

import { ChevronRightIcon, FileUpIcon } from "lucide-react";
import { useId } from "react";
import { checkBillFile } from "@/lib/consumption/bill-file";
import { PDF_NOT_PDF, PDF_TOO_LARGE } from "@/lib/consumption/messages";

type Props = {
  /** Receives a file that passed `checkBillFile`. */
  onSelect: (file: File) => void;
  /** Receives the client-check message; nothing is uploaded. */
  onError: (message: string) => void;
};

/** BmApp `ConsumptionMethodOption` for the PDF bill picker. Picking a file starts the study. */
export function PdfUploadOption({ onSelect, onError }: Props) {
  const inputId = useId();
  return (
    <label
      htmlFor={inputId}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-card p-3.5 focus-within:ring-2 focus-within:ring-ring"
    >
      <input
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Subir factura PDF"
        aria-describedby={`${inputId}-sub`}
        className="sr-only"
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          // Reset so the same file can be picked again after a failure.
          input.value = "";
          if (!file) return;
          const check = checkBillFile(file);
          if (check === "NOT_PDF") onError(PDF_NOT_PDF);
          else if (check === "TOO_LARGE") onError(PDF_TOO_LARGE);
          else onSelect(file);
        }}
      />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-header-highlight" aria-hidden>
        <FileUpIcon className="size-5 text-table-text" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-table-text">Subir factura PDF</span>
        <span id={`${inputId}-sub`} className="text-xs text-table-text-secondary">
          Extraemos los datos automáticamente
        </span>
      </span>
      <ChevronRightIcon className="size-[18px] shrink-0 text-table-text-secondary" aria-hidden />
    </label>
  );
}
