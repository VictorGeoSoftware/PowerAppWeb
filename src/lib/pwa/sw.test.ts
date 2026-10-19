import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRICE_UPDATES_BODY, PRICE_UPDATES_TITLE, PUSH_FALLBACK_TITLE } from "./messages";
import { PRICE_UPDATES_MESSAGE } from "./sw-messages";

const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

type Listener = (event: unknown) => void;
type FakeClient = { focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> };

function loadWorker(windowClients: FakeClient[] = []) {
  const listeners: Record<string, Listener> = {};
  const self = {
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn(async () => windowClients),
      openWindow: vi.fn(async () => null),
    },
  };
  new Function("self", source)(self);
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { self, dispatch };
}

const client = (): FakeClient => ({
  focus: vi.fn(async () => {}),
  navigate: vi.fn(async () => {}),
  postMessage: vi.fn(),
});
const pushData = (json: () => unknown) => ({ data: { json } });

describe("public/sw.js", () => {
  let c: FakeClient;
  beforeEach(() => {
    c = client();
  });

  it("price_updates push posts to every window client and shows the notification", async () => {
    const other = client();
    const { self, dispatch } = loadWorker([c, other]);
    await dispatch("push", pushData(() => ({ data: { type: "price_updates", payload: "{}" }, from: "x" })));
    expect(self.clients.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(c.postMessage).toHaveBeenCalledWith({ type: PRICE_UPDATES_MESSAGE });
    expect(other.postMessage).toHaveBeenCalledWith({ type: PRICE_UPDATES_MESSAGE });
    expect(self.registration.showNotification).toHaveBeenCalledWith(PRICE_UPDATES_TITLE, {
      body: PRICE_UPDATES_BODY,
      icon: "/icons/icon-192.png",
      tag: "price_updates",
      data: { url: "/proposals" },
    });
  });

  it.each([
    ["bad JSON", { data: { json: () => { throw new SyntaxError("x"); } } }],
    ["unknown type", pushData(() => ({ data: { type: "force_logout" } }))],
    ["no data", { data: null }],
  ])("%s still shows the fallback notification", async (_, event) => {
    const { self, dispatch } = loadWorker([c]);
    await dispatch("push", event);
    expect(self.registration.showNotification).toHaveBeenCalledWith(PUSH_FALLBACK_TITLE, {
      icon: "/icons/icon-192.png",
      data: { url: "/" },
    });
    expect(c.postMessage).not.toHaveBeenCalled();
  });

  const notification = (tag: string, url: string) => ({ tag, data: { url }, close: vi.fn() });

  it("click focuses and navigates an existing client, then posts the refresh", async () => {
    const { self, dispatch } = loadWorker([c]);
    const n = notification("price_updates", "/proposals");
    await dispatch("notificationclick", { notification: n });
    expect(n.close).toHaveBeenCalled();
    expect(c.focus).toHaveBeenCalled();
    expect(c.navigate).toHaveBeenCalledWith("/proposals");
    expect(c.postMessage).toHaveBeenCalledWith({ type: PRICE_UPDATES_MESSAGE });
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("click opens a window when no client exists", async () => {
    const { self, dispatch } = loadWorker([]);
    const n = notification("price_updates", "/proposals");
    await dispatch("notificationclick", { notification: n });
    expect(n.close).toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith("/proposals");
  });

  it("fallback click navigates to / without the refresh message", async () => {
    const { dispatch } = loadWorker([c]);
    await dispatch("notificationclick", { notification: notification("", "/") });
    expect(c.navigate).toHaveBeenCalledWith("/");
    expect(c.postMessage).not.toHaveBeenCalled();
  });

  it("keeps its strings equal to messages.ts", () => {
    expect(source).toContain(`const PRICE_UPDATES_TITLE = ${JSON.stringify(PRICE_UPDATES_TITLE)};`);
    expect(source).toContain(`const PRICE_UPDATES_BODY = ${JSON.stringify(PRICE_UPDATES_BODY)};`);
    expect(source).toContain(`const PUSH_FALLBACK_TITLE = ${JSON.stringify(PUSH_FALLBACK_TITLE)};`);
    expect(source).toContain(`const PRICE_UPDATES_MESSAGE = ${JSON.stringify(PRICE_UPDATES_MESSAGE)};`);
  });
});
