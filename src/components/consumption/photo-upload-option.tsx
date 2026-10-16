"use client";

import { ChevronRightIcon, CameraIcon } from "lucide-react";
import { useId } from "react";
import { checkBillPhoto } from "@/lib/consumption/bill-file";
import { PHOTO_NOT_IMAGE, BILL_TOO_LARGE } from "@/lib/consumption/messages";

type Props = {
  /** Receives a file that passed `checkBillPhoto`. */
  onSelect: (file: File) => void;
  /** Receives the client-check message; nothing is uploaded. */
  onError: (message: string) => void;
};

/** BmApp `ConsumptionMethodOption` for the bill photo picker (web-only; no `capture` so camera and library are offered). Picking a file starts the study. */
export function PhotoUploadOption({ onSelect, onError }: Props) {
  const inputId = useId();
  return (
    <label
      htmlFor={inputId}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-card p-3.5 focus-within:ring-2 focus-within:ring-ring"
    >
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png"
        aria-label="Foto de la factura"
        aria-describedby={`${inputId}-sub`}
        className="sr-only"
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          // Reset so the same file can be picked again after a failure.
          input.value = "";
          if (!file) return;
          const check = checkBillPhoto(file);
          if (check === "NOT_IMAGE") onError(PHOTO_NOT_IMAGE);
          else if (check === "TOO_LARGE") onError(BILL_TOO_LARGE);
          else onSelect(file);
        }}
      />
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-header-highlight" aria-hidden>
        <CameraIcon className="size-5 text-table-text" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-table-text">Foto de la factura</span>
        <span id={`${inputId}-sub`} className="text-xs text-table-text-secondary">
          Haz una foto o elige una imagen
        </span>
      </span>
      <ChevronRightIcon className="size-[18px] shrink-0 text-table-text-secondary" aria-hidden />
    </label>
  );
}
