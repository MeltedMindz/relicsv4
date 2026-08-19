import { test, expect } from "@playwright/test";

test("home page renders the headline and nav", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Scoped to the navigation landmark. The page body links to /explore as well, so an unscoped
  // locator matches two elements and fails Playwright's strict mode — which is what this test had
  // been doing. Scoping it also makes it assert what its name says: the NAV renders.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Explore" })).toBeVisible();
});

test("explore page renders local sample sigils and export controls", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("img").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PNG" }).first()).toBeVisible();
});

test("acquire page fails closed when not configured", async ({ page }) => {
  await page.goto("/acquire");
  await expect(page.getByRole("heading", { name: /Acquire/i })).toBeVisible();
  await expect(page.getByText(/Not configured/i)).toBeVisible();
});
