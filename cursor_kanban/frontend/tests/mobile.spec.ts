/**
 * Mobile UX tests — run against the live Vercel deployment via 3 projects:
 *   mobile-iphone-se  (375×667, iOS 13+ baseline)
 *   mobile-iphone-12  (390×844, iOS 14+)
 *   mobile-samsung-s23 (393×851, Android 13, Samsung Galaxy S23)
 *
 * Run all mobile projects:
 *   PLAYWRIGHT_BASE_URL=https://cursorkanban.vercel.app PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *   npx playwright test tests/mobile.spec.ts \
 *     --project=mobile-iphone-se --project=mobile-iphone-12 --project=mobile-samsung-s23
 */

import { test, expect } from "@playwright/test";

const USERNAME = "trigun";
const PASSWORD = "family2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: /username/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("textbox", { name: /username/i }).fill(USERNAME);
  await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByPlaceholder(/paste a link/i)).toBeVisible({ timeout: 20000 });
}

// ─── Login screen ─────────────────────────────────────────────────────────────

test.describe("Login screen", () => {
  test("form is fully visible without horizontal overflow", async ({ page, viewport }) => {
    await page.goto("/");
    await expect(page.getByTestId("login-form")).toBeVisible();
    const box = await page.getByTestId("login-form").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 375) + 4);
  });

  test("username and password fields accept touch input", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: /username/i }).tap();
    await page.getByRole("textbox", { name: /username/i }).fill(USERNAME);
    await page.getByRole("textbox", { name: /password/i }).tap();
    await page.getByRole("textbox", { name: /password/i }).fill(PASSWORD);
    expect(await page.getByRole("textbox", { name: /username/i }).inputValue()).toBe(USERNAME);
  });

  test("login button succeeds and loads the board", async ({ page }) => {
    await login(page);
    await expect(page.getByPlaceholder(/paste a link/i)).toBeVisible();
  });
});

// ─── Board layout ─────────────────────────────────────────────────────────────

test.describe("Board layout", () => {
  test("quick-add toolbar is visible and within viewport width", async ({ page, viewport }) => {
    await login(page);
    const input = page.getByPlaceholder(/paste a link/i);
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 375) + 4);
  });

  test("kanban columns are present in the DOM", async ({ page }) => {
    await login(page);
    const cols = page.locator('[data-testid^="column-"]');
    await expect(cols.first()).toBeVisible({ timeout: 10000 });
    const count = await cols.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Add button is enabled after typing text", async ({ page }) => {
    await login(page);
    const input = page.getByPlaceholder(/paste a link/i);
    await input.tap();
    await input.fill("Mobile test idea");
    const addBtn = page.getByRole("button", { name: /^add$/i });
    await expect(addBtn).toBeEnabled();
  });
});

// ─── AI Chat panel ───────────────────────────────────────────────────────────

test.describe("AI Chat panel", () => {
  test("AI toggle button is visible within toolbar", async ({ page, viewport }) => {
    await login(page);
    const aiBtn = page.getByRole("button", { name: /ai/i });
    await expect(aiBtn).toBeVisible();
    const box = await aiBtn.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 375) + 4);
  });

  test("tapping AI button opens the chat panel", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /ai/i }).tap();
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).toBeVisible({ timeout: 5000 });
  });

  test("chat panel width does not exceed viewport", async ({ page, viewport }) => {
    await login(page);
    await page.getByRole("button", { name: /ai/i }).tap();
    const panel = page.getByRole("complementary", { name: /ai assistant/i });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.width).toBeLessThanOrEqual((viewport?.width ?? 375) + 4);
  });

  test("close button (×) dismisses the panel", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /ai/i }).tap();
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).toBeVisible();
    await page.getByRole("button", { name: /close chat/i }).tap();
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).not.toBeVisible({ timeout: 5000 });
  });

  test("tapping the backdrop closes the panel", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /ai/i }).tap();
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).toBeVisible();
    // Click far left of screen — away from the right-anchored panel
    await page.mouse.click(30, 300);
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).not.toBeVisible({ timeout: 5000 });
  });

  test("chat input is tappable and accepts text", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /ai/i }).tap();
    const input = page.getByTestId("chat-input");
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.tap();
    await input.fill("test message");
    expect(await input.inputValue()).toBe("test message");
  });

  test("panel re-opens after being closed", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /ai/i }).tap();
    await page.getByRole("button", { name: /close chat/i }).tap();
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).not.toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /ai/i }).tap();
    await expect(page.getByRole("complementary", { name: /ai assistant/i })).toBeVisible({ timeout: 5000 });
  });
});
