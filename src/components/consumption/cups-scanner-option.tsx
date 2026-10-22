"use client";

import { ChevronRightIcon, ScanLineIcon } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useScreenOverride } from "@/components/analytics/screen-tracking";
import { CupsScanner } from "@/components/consumption/cups-scanner";

export const SCAN_ROW_TITLE = "Escanear código CUPS";
export const SCAN_ROW_SUBTITLE = "Usa la cámara para leer el código";

const COARSE_POINTER = "(pointer: coarse)";

/** True on phones/tablets; also true when matchMedia is unavailable (e.g. tests). */
function isTouchDevice(): boolean {
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia(COARSE_POINTER)?.matches ?? true;
}

function subscribePointer(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(COARSE_POINTER);
  mql?.addEventListener?.("change", onChange);
  return () => mql?.removeEventListener?.("change", onChange);
}

type Props = {
  /** Receives the corrected CUPS confirmed in the scanner. */
  onConfirm: (cups: string) => void;
};

/** BmApp `ConsumptionMethodOption` for the CUPS camera scanner. */
export function CupsScannerOption({ onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const touchDevice = useSyncExternalStore(subscribePointer, isTouchDevice, () => false);
  useScreenOverride(open ? "cups_scanner" : null);
  // Camera OCR is a phone feature; hide it on desktops (mouse as primary pointer).
  if (!touchDevice) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-card p-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-header-highlight" aria-hidden>
          <ScanLineIcon className="size-5 text-table-text" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-table-text">{SCAN_ROW_TITLE}</span>
          <span className="text-xs text-table-text-secondary">{SCAN_ROW_SUBTITLE}</span>
        </span>
        <ChevronRightIcon className="size-[18px] shrink-0 text-table-text-secondary" aria-hidden />
      </button>
      {open && (
        <CupsScanner
          onClose={close}
          onConfirm={(cups) => {
            setOpen(false);
            onConfirm(cups);
          }}
        />
      )}
    </>
  );
}
