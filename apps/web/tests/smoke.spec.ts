import { test, expect } from "@playwright/test";

test("home page renders the headline and nav", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Scoped to the nav landmark on purpose. "Explore" appears twice on the home page -- once in
  // the nav and once in body prose -- so an unscoped role query is ambiguous and Playwright
  // fails it under strict mode. The assertion is that the NAV renders, so say that.
  await expect(page.getByRole("navigation").getByRole("link", { name: "Explore" })).toBeVisible();
});

test("explore page renders local sample sigils and export controls", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("img").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PNG" }).first()).toBeVisible();
});

test("acquire page renders a deployment state, whichever one is configured", async ({ page }) => {
  await page.goto("/acquire");
  await expect(page.getByRole("heading", { name: /Acquire/i })).toBeVisible();

  // This previously asserted the "Not configured" badge, i.e. the fail-closed default. That
  // stopped being true when the starter began publishing real RC5 deployment status: the app is
  // now configured, so the badge is correctly absent and the test failed for the wrong reason --
  // it was pinned to one valid state rather than to the behaviour.
  //
  // Both states are legitimate for a starter: fail closed when nothing is set, show the
  // deployment when it is. Assert that ONE of them renders, so publishing a deployment does not
  // break the smoke suite and an empty page still does.
  const failClosed = page.getByText("Not configured", { exact: true });
  const configured = page.getByText(/Token:/);
  await expect(failClosed.or(configured).first()).toBeVisible();
});
