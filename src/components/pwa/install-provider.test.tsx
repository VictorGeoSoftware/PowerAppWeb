import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/fetch-consumption", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ signOutUser: vi.fn() }),
  FullScreenSpinner: () => <div role="status" />,
}));

import { FeeFirstGateProvider } from "@/components/gate/fee-first-gate-provider";
import { AppShell } from "@/components/shell/app-shell";
import { InstallProvider } from "./install-provider";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

function setPlatform(userAgent: string, standalone = false) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: standalone && q.includes("standalone") }));
}

const renderApp = () =>
  render(
    <InstallProvider>
      <FeeFirstGateProvider initialSession={null}>
        <AppShell>x</AppShell>
      </FeeFirstGateProvider>
    </InstallProvider>,
  );

const openMenu = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
  return screen.findByRole("dialog");
};

function firePrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt, event };
}

describe("InstallProvider", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("Android: no entry until beforeinstallprompt; the prompt is used once", async () => {
    setPlatform(ANDROID);
    renderApp();
    expect(within(await openMenu()).queryByText("Instalar aplicación")).toBeNull();
    await userEvent.keyboard("{Escape}");

    const { prompt, event } = firePrompt();
    expect(event.defaultPrevented).toBe(true);
    const menu = await openMenu();
    await userEvent.click(within(menu).getByText("Instalar aplicación"));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(within(await openMenu()).queryByText("Instalar aplicación")).toBeNull();
    expect(screen.queryByRole("region", { name: /Instala PowerApp/ })).toBeNull();
  });

  it("Android: appinstalled hides the entry", async () => {
    setPlatform(ANDROID);
    renderApp();
    firePrompt();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(within(await openMenu()).queryByText("Instalar aplicación")).toBeNull();
  });

  it("standalone: no entry and no banner, even with a prompt or on iOS", async () => {
    setPlatform(IPHONE, true);
    renderApp();
    firePrompt();
    expect(screen.queryByRole("region", { name: /Instala PowerApp/ })).toBeNull();
    expect(within(await openMenu()).queryByText("Instalar aplicación")).toBeNull();
  });

  it("iOS: banner and menu entry open the steps sheet; dismissing persists", async () => {
    setPlatform(IPHONE);
    const { unmount } = renderApp();
    const banner = await screen.findByRole("region", { name: "Instala PowerApp en tu pantalla de inicio" });
    await userEvent.click(within(banner).getByRole("button", { name: "Cómo" }));
    const sheet = await screen.findByRole("dialog", { name: "Instalar PowerApp" });
    expect(within(sheet).getByText("Pulsa el botón Compartir")).toBeInTheDocument();
    expect(within(sheet).getByText("Elige «Añadir a pantalla de inicio»")).toBeInTheDocument();
    expect(within(sheet).getByText("Pulsa «Añadir»")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Entendido" }));

    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByRole("region", { name: /Instala PowerApp/ })).toBeNull();
    expect(localStorage.getItem("bm.installHintDismissed")).toBe("1");

    unmount();
    renderApp();
    expect(screen.queryByRole("region", { name: /Instala PowerApp/ })).toBeNull();
    const menu = await openMenu();
    await userEvent.click(within(menu).getByText("Instalar aplicación"));
    expect(await screen.findByRole("dialog", { name: "Instalar PowerApp" })).toBeInTheDocument();
  });
});
