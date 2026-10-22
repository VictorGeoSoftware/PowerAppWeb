import { expect, openSignedIn, test, useSignedInSession } from "./fixtures";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test.describe("installability (public)", () => {
  // The iphone-webkit project blocks service workers (see playwright.config.ts); this test checks /sw.js itself.
  test.use({ serviceWorkers: "allow" });

  test("manifest, icons, theme color and service worker", async ({ page, request, browserName }) => {
    await page.goto("/login");

    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: "PowerApp",
      short_name: "PowerApp",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#F8FAFC",
      background_color: "#F8FAFC",
    });
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    const iconUrls = [...manifest.icons.map((i: { src: string }) => i.src), apple];
    for (const url of iconUrls) {
      const icon = await request.get(url);
      expect(icon.status(), url).toBe(200);
      expect(icon.headers()["content-type"]).toContain("image/png");
    }
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#F8FAFC");

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");
    const sw = await request.get("/sw.js");
    expect(sw.headers()["cache-control"]).toBe("no-cache");
    expect(await sw.text()).not.toContain('"fetch"');

    // Same check as DevTools → Application → Manifest (Lighthouse 12 has no PWA audit). Chromium only (CDP).
    if (browserName !== "chromium") return;
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    expect(installabilityErrors).toEqual([]);
  });
});

test.describe("install entry (signed in)", () => {
  useSignedInSession();

  test("Android: a captured beforeinstallprompt shows the menu entry", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "an iPhone shows the iOS install entry instead");
    await openSignedIn(page);
    await page.evaluate(() => {
      const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {
          (window as unknown as { __prompted: number }).__prompted = 1;
        },
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(e);
    });
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("button", { name: "Instalar aplicación" }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1);
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await expect(page.getByRole("button", { name: "Instalar aplicación" })).toHaveCount(0);
  });

  test.describe("iOS", () => {
    test.use({ userAgent: IPHONE_UA });

    test("banner opens the steps sheet; dismissal survives reload", async ({ page }, testInfo) => {
      await openSignedIn(page);
      const banner = page.getByRole("region", { name: "Instala PowerApp en tu pantalla de inicio" });
      await expect(banner).toBeVisible();
      await page.screenshot({ path: `test-results/pwa-ios-banner-${testInfo.project.name}.png` });

      await banner.getByRole("button", { name: "Cómo" }).click();
      const sheet = page.getByRole("dialog", { name: "Instalar PowerApp" });
      await expect(sheet.getByText("Pulsa el botón Compartir")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/pwa-ios-sheet-${testInfo.project.name}.png` });
      await sheet.getByRole("button", { name: "Entendido" }).click();
      await expect(sheet).toHaveCount(0);

      await banner.getByRole("button", { name: "Cerrar aviso" }).click();
      await expect(banner).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
      await expect(banner).toHaveCount(0);

      await page.getByRole("button", { name: "Abrir menú" }).click();
      await page.getByRole("button", { name: "Instalar aplicación" }).click();
      await expect(page.getByRole("dialog", { name: "Instalar PowerApp" })).toBeVisible();
    });
  });
});
