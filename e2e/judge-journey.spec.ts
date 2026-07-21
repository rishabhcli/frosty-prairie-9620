import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("ContactSafe judge journey", () => {
  test("race, revoke, and cancel-on-delivery all work end to end with no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const failedRequests: string[] = [];
    page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()}`));

    await page.goto("/");

    // Deterministic reset happens on mount -- wait for the seeded contact id to render.
    await expect(page.getByText(/^11111111-/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("connected")).toBeVisible();

    // Ledger shows the seeded promise before anything else happens.
    await expect(page.getByText("Promise recorded: email revised quote")).toBeVisible();
    await expect(page.getByText("email the revised quote after Tuesday", { exact: false }).first()).toBeVisible();

    // Golden path: race two workers for the seeded contact.
    const raceButton = page.getByRole("button", { name: "Race two workers for this contact" });
    await raceButton.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByText(/authorized \(fencing token 1\)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("already handled -- same outbox row")).toBeVisible();
    await expect(page.getByText("Outbox row created (fencing token 1)")).toBeVisible();

    // Trust boundary: revoke consent, then the outbox worker must cancel the pending send.
    await page.getByRole("button", { name: "Revoke email consent" }).click();
    await expect(page.getByText("revoked", { exact: true })).toBeVisible();
    await expect(page.getByText("Consent revoked (email)")).toBeVisible();

    await page.getByRole("button", { name: "Process one outbox delivery" }).click();
    await expect(page.getByText("Delivery canceled -- consent no longer granted")).toBeVisible({ timeout: 10_000 });

    expect(consoleErrors, `unexpected console errors: ${consoleErrors.join("; ")}`).toEqual([]);
    expect(failedRequests, `unexpected failed network requests: ${failedRequests.join("; ")}`).toEqual([]);
  });

  test("accessibility: no serious or critical axe violations on the judge journey view", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^11111111-/)).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      seriousOrCritical,
      seriousOrCritical.map((v) => `${v.id}: ${v.help}`).join("\n")
    ).toEqual([]);
  });

  test("keyboard operability: every operator control is reachable and labeled without a mouse", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^11111111-/)).toBeVisible({ timeout: 15_000 });

    const controls = ["Race two workers for this contact", "Revoke email consent", "Process one outbox delivery", "Reset demo state"];
    for (const name of controls) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      await button.focus();
      await expect(button).toBeFocused();
    }
  });
});
