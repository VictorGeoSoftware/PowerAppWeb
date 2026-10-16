"use client";

import { ArrowLeftIcon, CameraOffIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CUPS_HELP_EMPTY, CUPS_HELP_INVALID, CUPS_HELP_VALID } from "@/components/consumption/cups-form";
import { useCameraStream } from "@/components/consumption/use-camera-stream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractBestCandidate, isValidCups, toSubmittableCups } from "@/lib/consumption/cups";
import type { CupsRecognizer } from "@/lib/consumption/cups-ocr";

export const SCANNER_TITLE = "Escanear CUPS";
export const SCANNER_PANEL_TITLE = "Escanea o introduce tu código CUPS";
export const CAMERA_ERROR =
  "No podemos usar la cámara. Introduce el CUPS a mano o revisa los permisos del navegador.";
export const OCR_ERROR = "No se pudo iniciar el lector. Introduce el CUPS a mano.";
export const CAMERA_STARTING = "Abriendo cámara…";
export const OCR_LOADING = "Preparando lector…";
export const RETRY_CAMERA = "Reintentar cámara";

const TICK_MS = 600;

/** Default: load Tesseract only when the scanner opens (keeps it out of the main bundle). */
const defaultCreateRecognizer = async () => (await import("@/lib/consumption/cups-ocr")).createCupsRecognizer();

/** Draws the guide-frame band (90% × 25%, centred) as grayscale, upscaled to ≥1000 px wide. */
function grabFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const sw = Math.round(vw * 0.9);
  const sh = Math.round(vh * 0.25);
  const scale = Math.max(1, 1000 / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, Math.round((vw - sw) / 2), Math.round((vh - sh) / 2), sw, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

type Props = {
  /** Receives the corrected CUPS (`toSubmittableCups`) after the camera is stopped. */
  onConfirm: (cups: string) => void;
  onClose: () => void;
  /** Test seam; defaults to the Tesseract.js recognizer. */
  createRecognizer?: () => Promise<CupsRecognizer>;
  /** Test seam: frame grabber (jsdom has no canvas). */
  grab?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => boolean;
};

/** BmApp `CupsScannerView`: full-screen live OCR with an editable CUPS field. */
export function CupsScanner({ onConfirm, onClose, createRecognizer = defaultCreateRecognizer, grab = grabFrame }: Props) {
  const { videoRef, state: camera, retry, stop } = useCameraStream();
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [value, setValue] = useState("");
  const editedRef = useRef(false);
  const recognizerRef = useRef<CupsRecognizer | null>(null);
  const titleId = useId();
  const helpId = useId();

  // OCR engine lifecycle: terminated on every exit path (unmount covers Volver, confirm, logout).
  useEffect(() => {
    let cancelled = false;
    createRecognizer().then(
      (r) => {
        if (cancelled) return void r.terminate().catch(() => {});
        recognizerRef.current = r;
        setEngine("ready");
      },
      () => !cancelled && setEngine("error"),
    );
    return () => {
      cancelled = true;
      void recognizerRef.current?.terminate().catch(() => {});
      recognizerRef.current = null;
    };
  }, [createRecognizer]);

  // Scan loop: skip-if-busy (BmApp KEEP_ONLY_LATEST), paused while hidden or camera not live.
  const live = camera.kind === "live";
  useEffect(() => {
    if (!live || engine !== "ready") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const tick = async () => {
      const rec = recognizerRef.current;
      const video = videoRef.current;
      if (!stopped && rec && video && !document.hidden && grab(video, canvas)) {
        try {
          const text = await rec.recognize(canvas);
          const found = extractBestCandidate(text);
          // Analytics: CupsScanSucceeded goes here (analytics-screen-tracking).
          if (!stopped && found && !editedRef.current) setValue(found);
        } catch {
          /* single frame failed; keep scanning */
        }
      }
      if (!stopped) timer = setTimeout(tick, TICK_MS);
    };
    timer = setTimeout(tick, TICK_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, engine, grab, videoRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = isValidCups(value);
  const invalid = value !== "" && !valid;
  const help = value === "" ? CUPS_HELP_EMPTY : valid ? CUPS_HELP_VALID : CUPS_HELP_INVALID;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 px-2">
        <Button type="button" variant="ghost" className="h-11" onClick={onClose}>
          <ArrowLeftIcon aria-hidden />
          Volver
        </Button>
        <h2 id={titleId} className="text-lg font-semibold">
          {SCANNER_TITLE}
        </h2>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-hidden
          className={camera.kind === "live" ? "h-full w-full object-cover" : "hidden"}
        />
        {camera.kind === "live" && (
          <div className="pointer-events-none absolute left-[5%] top-[37.5%] h-1/4 w-[90%] rounded-md border-2 border-primary" />
        )}
        {camera.kind === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            {CAMERA_STARTING}
          </p>
        )}
        {camera.kind === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <CameraOffIcon className="size-8" aria-hidden />
            <p role="alert" className="text-sm">
              {CAMERA_ERROR}
            </p>
            <Button type="button" variant="outline" className="h-11 text-foreground" onClick={retry}>
              <RotateCcwIcon aria-hidden />
              {RETRY_CAMERA}
            </Button>
          </div>
        )}
      </div>
      <form
        noValidate
        className="flex shrink-0 flex-col gap-3 rounded-t-2xl bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          stop();
          onConfirm(toSubmittableCups(value));
        }}
      >
        <Label htmlFor="cups-scan" className="text-base font-semibold">
          {SCANNER_PANEL_TITLE}
        </Label>
        {engine === "loading" && camera.kind !== "error" && <p className="text-xs text-muted-foreground">{OCR_LOADING}</p>}
        {engine === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {OCR_ERROR}
          </p>
        )}
        <Input
          id="cups-scan"
          name="cups"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            editedRef.current = v !== "";
            setValue(v);
          }}
          placeholder="ES0021000012345678XX"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="go"
          maxLength={30}
          aria-invalid={invalid || undefined}
          aria-describedby={helpId}
          className="h-12 bg-background font-mono text-base tracking-wide md:text-base"
        />
        <p id={helpId} className={invalid ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {help}
        </p>
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!valid}>
          Confirmar
        </Button>
      </form>
    </div>
  );
}
