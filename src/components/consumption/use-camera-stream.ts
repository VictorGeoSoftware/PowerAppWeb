"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = { kind: "starting" } | { kind: "live" } | { kind: "error"; reason: string };

const CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

/**
 * Rear camera stream bound to a `<video>` (render it `playsInline muted autoPlay` for iOS).
 * Stops every track on unmount, on `stop()` and before a retry; a track ending on its own
 * (e.g. iOS when the tab is hidden) becomes an error so the UI can offer "Reintentar cámara".
 */
export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "starting" });
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("No mediaDevices", "NotSupportedError");
        const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        stream.getTracks().forEach((t) => {
          t.onended = () => {
            if (streamRef.current === stream) {
              stop();
              setState({ kind: "error", reason: "ended" });
            }
          };
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.()?.catch(() => {});
        }
        setState({ kind: "live" });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", reason: e instanceof Error ? e.name : "unknown" });
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt, stop]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { videoRef, state, retry, stop };
}
