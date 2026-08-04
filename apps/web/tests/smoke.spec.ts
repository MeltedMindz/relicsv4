import { test, expect } from "@playwright/test";

test("home page renders the headline and nav", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore" })).toBeVisible();
});

test("explore page renders local sample sigils and export controls", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("img").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PNG" }).first()).toBeVisible();
});

test("acquire page fails closed when not configured", async ({ page }) => {
  await page.goto("/acquire");
  await expect(page.getByText(/Acquire the token/i)).toBeVisible();
});
