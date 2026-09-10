import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 810, height: 1080 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: "bash scripts/e2e-server.sh",
    url: "http://127.0.0.1:3100/view",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
