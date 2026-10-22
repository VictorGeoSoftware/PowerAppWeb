import { defineConfig, devices } from "@playwright/test";

// E2E owns its own production server on 9004 (never the 9003 `npm run dev`):
// no on-demand compiling, and a leftover/stuck dev server can't be reused.
// 9004 is an allowed referrer of the QA Firebase API key. Run via scripts/e2e.sh.
const PORT = 9004;

// WebKit sends requests of a service-worker-controlled page past page.route() mocks,
// so the iPhone project blocks the SW (specs that test /sw.js opt back in).
const browsers = [
  { name: "iphone-webkit", device: { ...devices["iPhone 13"], serviceWorkers: "block" as const } },
  { name: "android-chromium", device: devices["Pixel 7"] },
];

// E2E_SKIP_BUILD=1 reuses the last `.next-e2e` build (only when app code is unchanged).
// The E2E build polls job status every 750 ms instead of 3 s (mocked jobs).
const build = process.env.E2E_SKIP_BUILD
  ? ""
  : "NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_E2E_POLL_INTERVAL_MS=750 npx next build && ";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  // All signed-in tests share one QA account (one bound device, one session):
  // run serially so a logout or second-device test can't disturb another.
  workers: 1,
  reporter: "line",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: browsers.flatMap(({ name, device }) => [
    { name: `setup-${name}`, testMatch: /auth\.setup\.ts/, use: { ...device } },
    { name, testIgnore: /auth\.setup\.ts/, dependencies: [`setup-${name}`], use: { ...device } },
  ]),
  webServer: {
    command: `${build}NEXT_DIST_DIR=.next-e2e npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    // Never attach to a server we didn't start: a second concurrent run fails
    // fast on the busy port instead of sharing the server and the QA account.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
