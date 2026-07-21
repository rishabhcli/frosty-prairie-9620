import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 14920;
const API_PORT = 14901;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @contactsafe/api start",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: true,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://root@127.0.0.1:14910/contactsafe?sslmode=disable",
        PORT_API: String(API_PORT),
      },
      timeout: 60_000,
    },
    {
      // Console must be built beforehand (`pnpm test:e2e` does this) -- starting
      // `vite preview` alone is fast; bundling the build into this command risked
      // exceeding the webServer timeout on a busy host.
      command: "pnpm --filter @contactsafe/console preview:e2e",
      url: `http://127.0.0.1:${E2E_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
