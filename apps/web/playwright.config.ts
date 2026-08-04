import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal smoke config. It builds nothing itself; CI runs `next build` first, then Playwright
 * starts the production server. No secrets, no external services. Locally you can run
 * `npm run dev` in one terminal and `npx playwright test` in another.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
