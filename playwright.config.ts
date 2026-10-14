import { defineConfig, devices } from "@playwright/test";

const PORT = 9003;

const browsers = [
  { name: "iphone-webkit", device: devices["iPhone 13"] },
  { name: "android-chromium", device: devices["Pixel 7"] },
];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  // All signed-in tests share one QA account (one bound device, one session):
  // run serially so a logout or second-device test can't disturb another.
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: browsers.flatMap(({ name, device }) => [
    { name: `setup-${name}`, testMatch: /auth\.setup\.ts/, use: { ...device } },
    { name, testIgnore: /auth\.setup\.ts/, dependencies: [`setup-${name}`], use: { ...device } },
  ]),
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
