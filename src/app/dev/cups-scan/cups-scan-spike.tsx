"use client";

/**
 * DEV-ONLY bare scanner for the Android accuracy spike. Each attempt runs OCR on the
 * guide-frame region every ~600 ms until a valid CUPS is found or 10 s elapse, then
 * logs the attempt to `/api/dev/cups-scan-log`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { extractBestCandidate } from "@/lib/consumption/cups";
import type { CupsRecognizer } from "@/lib/consumption/cups-ocr";

const ATTEMPT_MS = 10_000;
const TICK_MS = 600;

type Result = { label: string; picked: string | null; ms: number | null; raw: string };

function grabFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const sw = Math.round(vw * 0.9);
  const sh = Math.round(vh * 0.25);
  const sx = Math.round((vw - sw) / 2);
  const sy = Math.round((vh - sh) / 2);
  const scale = Math.max(1, 1000 / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

export function CupsScanSpike() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognizerRef = useRef<CupsRecognizer | null>(null);
  const [camera, setCamera] = useState<"starting" | "live" | string>("starting");
  const [engine, setEngine] = useState<"loading" | "ready" | "error">("loading");
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [lastRaw, setLastRaw] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no mediaDevices (insecure context?)");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera("live");
      } catch (e) {
        setCamera(`error: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`);
      }
    })();
    (async () => {
      try {
        const { createCupsRecognizer } = await import("@/lib/consumption/cups-ocr");
        const r = await createCupsRecognizer();
        if (cancelled) return void r.terminate();
        recognizerRef.current = r;
        setEngine("ready");
      } catch {
        setEngine("error");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      void recognizerRef.current?.terminate();
      recognizerRef.current = null;
    };
  }, []);

  const runAttempt = useCallback(async () => {
    const video = videoRef.current;
    const rec = recognizerRef.current;
    if (!video || !rec) return;
    canvasRef.current ??= document.createElement("canvas");
    const billLabel = label.trim() || "(sin etiqueta)";
    setRunning(true);
    const start = performance.now();
    let raw = "";
    let picked: string | null = null;
    while (performance.now() - start < ATTEMPT_MS) {
      const t0 = performance.now();
      if (!document.hidden && grabFrame(video, canvasRef.current)) {
        try {
          raw = await rec.recognize(canvasRef.current);
        } catch {
          raw = "";
        }
        setLastRaw(raw);
        picked = extractBestCandidate(raw);
        if (picked) break;
      }
      const wait = TICK_MS - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    const ms = picked ? Math.round(performance.now() - start) : null;
    setResults((prev) => [{ label: billLabel, picked, ms, raw }, ...prev]);
    setRunning(false);
    try {
      await fetch("/api/dev/cups-scan-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billLabel, timeToResultMs: ms, rawOcrText: raw.slice(0, 4000), pickedCups: picked }),
      });
    } catch {
      /* dev-only: ignore log failures */
    }
  }, [label]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">CUPS scan spike (dev)</h1>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute left-[5%] top-[37.5%] h-1/4 w-[90%] rounded-md border-2 border-primary" />
      </div>
      <p className="text-sm text-muted-foreground">
        Cámara: {camera} · Lector: {engine}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Etiqueta de la factura (p. ej. iberdrola-1-20)
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-11 rounded-md border bg-background px-3 text-base"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      <Button className="h-11" disabled={running || camera !== "live" || engine !== "ready"} onClick={runAttempt}>
        {running ? "Escaneando… (máx. 10 s)" : "Iniciar intento"}
      </Button>
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{lastRaw || "—"}</pre>
      <ul className="flex flex-col gap-1 text-sm">
        {results.map((r, i) => (
          <li key={i} className="rounded-md bg-card p-2">
            <b>{r.label}</b>: {r.picked ?? "NO DETECTADO"} {r.ms !== null && `(${(r.ms / 1000).toFixed(1)} s)`}
          </li>
        ))}
      </ul>
    </main>
  );
}
