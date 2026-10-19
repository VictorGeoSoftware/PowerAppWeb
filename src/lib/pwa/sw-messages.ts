/** Posted by `/sw.js` to every window client on a `price_updates` push and on its tap. */
export const PRICE_UPDATES_MESSAGE = "bm:price_updates";

/** Calls `cb` for service worker messages of `type`; returns the unsubscribe. No-op without SW support. */
export function onServiceWorkerMessage(type: string, cb: () => void): () => void {
  const sw = typeof navigator === "undefined" ? undefined : navigator.serviceWorker;
  if (!sw) return () => {};
  const listener = (event: MessageEvent) => {
    if (event.data?.type === type) cb();
  };
  sw.addEventListener("message", listener);
  return () => sw.removeEventListener("message", listener);
}
