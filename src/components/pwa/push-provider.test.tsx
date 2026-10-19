import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { uid: "u1", getIdToken: async () => "id" };
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user, reportApiError: vi.fn() }),
  FullScreenSpinner: () => <div role="status" />,
}));
const bmFetchMock = vi.fn();
vi.mock("@/lib/api/bm-fetch", () => ({ bmFetch: (...a: unknown[]) => bmFetchMock(...a) }));
const fcm = { supported: true, token: "fcm-1", fail: false };
vi.mock("@/lib/pwa/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/pwa/push")>()),
  vapidKey: () => "vapid",
  isFcmSupported: async () => fcm.supported,
  fetchFcmToken: async () => {
    if (fcm.fail) throw new Error("fcm");
    return fcm.token;
  },
}));

import { InstallProvider } from "./install-provider";
import { PushMenuEntry } from "./push-menu-entry";
import { PushPromptCard } from "./push-prompt-card";
import { PushProvider } from "./push-provider";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

let requestPermission: ReturnType<typeof vi.fn>;

function setUp({ ua = ANDROID, permission = "default" as NotificationPermission, pushApis = true } = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const N = { permission, requestPermission: vi.fn() };
  requestPermission = N.requestPermission;
  if (pushApis) {
    vi.stubGlobal("Notification", N);
    vi.stubGlobal("PushManager", function PushManager() {});
    if (!("serviceWorker" in navigator)) Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
  }
}

async function renderPush() {
  render(
    <InstallProvider>
      <PushProvider>
        <PushMenuEntry className="" onClose={() => {}} />
        <PushPromptCard />
      </PushProvider>
    </InstallProvider>,
  );
  await act(async () => {});
}

describe("PushProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    fcm.supported = true;
    fcm.fail = false;
    bmFetchMock.mockResolvedValue(new Response("{}"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("default permission: menu entry and card; requestPermission only on tap", async () => {
    setUp();
    await renderPush();
    expect(screen.getByRole("button", { name: "Activar notificaciones" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Activa las notificaciones/ })).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(bmFetchMock).not.toHaveBeenCalled();
  });

  it("enable: registers the token, stores it and shows the pill", async () => {
    setUp();
    requestPermission.mockResolvedValue("granted");
    await renderPush();
    await userEvent.click(screen.getByRole("button", { name: "Activar" }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await act(async () => {});
    // Granting on tap must not also trigger the start-up refresh (one POST only).
    expect(bmFetchMock).toHaveBeenCalledTimes(1);
    const [, path, init] = bmFetchMock.mock.calls[0];
    expect(path).toBe("push/web-tokens");
    expect(JSON.parse(init.body)).toEqual({ token: "fcm-1", platform: "android" });
    expect(JSON.parse(localStorage.getItem("bm.pushToken")!)).toEqual({ uid: "u1", token: "fcm-1" });
    expect(screen.getByRole("status")).toHaveTextContent("Notificaciones activadas");
    expect(screen.queryByRole("button", { name: "Activar notificaciones" })).not.toBeInTheDocument();
  });

  it("failure keeps the entry and shows the error", async () => {
    setUp();
    requestPermission.mockResolvedValue("granted");
    bmFetchMock.mockRejectedValue(new Error("500"));
    await renderPush();
    await userEvent.click(screen.getByRole("button", { name: "Activar notificaciones" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron activar las notificaciones.");
    expect(localStorage.getItem("bm.pushToken")).toBeNull();
    expect(screen.getByRole("button", { name: "Activar notificaciones" })).toBeInTheDocument();
  });

  it("denied: disabled row, no card", async () => {
    setUp({ permission: "denied" });
    await renderPush();
    expect(screen.getByText("Notificaciones bloqueadas").closest("[aria-disabled]")).toBeInTheDocument();
    expect(screen.getByText("Actívalas en los ajustes del navegador")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("iOS tab: the entry opens the install sheet with the push line", async () => {
    setUp({ ua: IPHONE, pushApis: false });
    fcm.supported = false;
    await renderPush();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Activar notificaciones" }));
    expect(await screen.findByText("En iPhone, las notificaciones requieren instalar la app")).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("unsupported: nothing rendered", async () => {
    setUp();
    fcm.supported = false;
    await renderPush();
    expect(screen.queryByText(/notificaciones/i)).not.toBeInTheDocument();
  });

  it("granted at start: silent refresh posts only when the token changed", async () => {
    setUp({ permission: "granted" });
    localStorage.setItem("bm.pushToken", JSON.stringify({ uid: "u1", token: "fcm-1" }));
    await renderPush();
    expect(bmFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /notificaciones/ })).not.toBeInTheDocument();

    fcm.token = "fcm-2";
    localStorage.setItem("bm.pushToken", JSON.stringify({ uid: "u1", token: "fcm-1" }));
    await renderPush();
    expect(bmFetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("bm.pushToken")!).token).toBe("fcm-2");
    fcm.token = "fcm-1";
  });

  it("dismissing the card persists", async () => {
    setUp();
    await renderPush();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso de notificaciones" }));
    expect(localStorage.getItem("bm.pushPromptDismissed")).toBe("1");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    // The menu entry stays available.
    expect(screen.getByRole("button", { name: "Activar notificaciones" })).toBeInTheDocument();
  });
});
