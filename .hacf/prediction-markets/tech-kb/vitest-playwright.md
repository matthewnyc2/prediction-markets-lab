# Vitest + Playwright — Tech KB

**Version pinning**: `vitest@2.1.x`, `@vitest/ui@2.1.x`, `jsdom@25.x` or `happy-dom@15.x`, `@testing-library/react@16.x`, `@testing-library/jest-dom@6.5.x`, `@playwright/test@1.48.x`. Node 20 LTS.

## Split of concerns

- **Vitest** — unit + component tests for React/TS logic (fast, Vite-powered, Jest-API-compatible).
- **Playwright** — end-to-end browser tests that drive Next.js across real Chromium/Firefox/WebKit.

---

## Part A — Vitest

### 1. Setup

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
    coverage: { provider: "v8", reporter: ["text", "html"], thresholds: { lines: 70 } },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
```

`vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
```

### 2. Examples

#### Example 1 — Pure function

```ts
// lib/__tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { formatCents } from "@/lib/format";

describe("formatCents", () => {
  it("renders 0.5 as 50.0¢", () => { expect(formatCents(0.5)).toBe("50.0¢"); });
  it.each([[0, "0.0¢"], [1, "100.0¢"], [0.127, "12.7¢"]])("%s => %s", (a, b) => {
    expect(formatCents(a)).toBe(b);
  });
});
```

#### Example 2 — React component

```tsx
// components/__tests__/MarketCard.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarketCard } from "@/components/MarketCard";

describe("MarketCard", () => {
  it("shows yes price in cents", () => {
    render(<MarketCard title="X" yes={0.63} no={0.37} volume={1234} />);
    expect(screen.getByText(/YES 63.0¢/)).toBeInTheDocument();
  });
});
```

#### Example 3 — User interaction

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PlatformSelect } from "@/components/PlatformSelect";

it("emits change", async () => {
  const onChange = vi.fn();
  render(<PlatformSelect value="all" onChange={onChange} />);
  await userEvent.selectOptions(screen.getByRole("combobox"), "kalshi");
  expect(onChange).toHaveBeenCalledWith("kalshi");
});
```

#### Example 4 — Mocking `fetch`

```ts
import { vi, beforeEach, it, expect } from "vitest";
import { fetchMarket } from "@/lib/api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    id: "kalshi:TEST", platform: "kalshi", title: "T",
    yes_price: 0.5, no_price: 0.5, volume_24h: 0, closes_at: null,
  }))));
});

it("parses response", async () => {
  const m = await fetchMarket("kalshi:TEST");
  expect(m.yes_price).toBe(0.5);
});
```

#### Example 5 — Fake timers

```ts
import { vi, it, expect } from "vitest";

it("debounces", () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const d = debounce(fn, 200);
  d(); d(); d();
  vi.advanceTimersByTime(200);
  expect(fn).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
```

### 3. Vitest gotchas

- **Server Components can't be rendered by Testing Library** — they aren't real React components at runtime. Extract logic into pure functions or plain Client Components for unit testing.
- **`@testing-library/jest-dom/vitest`** provides the matchers; don't import the non-vitest entry.
- **`vi.mock(...)`** is hoisted — module factories can't reference outer variables. Use `vi.hoisted()` if you need to.
- **`happy-dom` is faster than `jsdom`** but has subtle differences (form submission, selection APIs). Start with jsdom.
- **Globals**: set `test.globals = true` to get `describe/it/expect` implicitly; otherwise import from `vitest`.

---

## Part B — Playwright

### 1. Setup

```bash
pnpm create playwright@latest
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox",  use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "uv run uvicorn backend.app.main:app --port 8000",
      url: "http://localhost:8000/docs",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
```

### 2. Examples

#### Example 1 — Smoke test

```ts
// e2e/smoke.spec.ts
import { test, expect } from "@playwright/test";

test("dashboard loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
});
```

#### Example 2 — Market filter

```ts
test("filter by kalshi", async ({ page }) => {
  await page.goto("/markets");
  await page.getByRole("combobox").selectOption("kalshi");
  await expect(page).toHaveURL(/platform=kalshi/);
  await expect(page.getByRole("listitem").first()).toContainText(/kalshi/i);
});
```

#### Example 3 — API mocking at the network layer

```ts
test("handles backend 502", async ({ page }) => {
  await page.route("**/api/markets**", route => route.fulfill({
    status: 502, body: JSON.stringify({ error: "upstream failed" }),
  }));
  await page.goto("/markets");
  await expect(page.getByText(/upstream failed|unavailable/i)).toBeVisible();
});
```

#### Example 4 — Backtest run flow

```ts
test("starts a backtest", async ({ page }) => {
  await page.goto("/strategies");
  await page.getByLabel("Strategy").selectOption("kelly-sizing");
  await page.getByRole("button", { name: /run backtest/i }).click();
  await expect(page.getByRole("status")).toContainText(/queued|running/);
});
```

#### Example 5 — Visual regression

```ts
test("equity curve visual", async ({ page }) => {
  await page.goto("/backtests/demo");
  await page.waitForSelector("[data-testid=equity-curve] svg");
  await expect(page.locator("[data-testid=equity-curve]")).toHaveScreenshot("equity.png", { maxDiffPixels: 100 });
});
```

### 3. Playwright gotchas

- **Start both servers** (Next.js + FastAPI) via `webServer` array — otherwise E2E tests hit a dead backend.
- **`baseURL` in config** means `page.goto("/markets")` — keep paths relative.
- **Playwright has built-in auto-waiting** — avoid `waitForTimeout`. Use `waitForSelector` / `expect().toBeVisible()`.
- **Trace viewer** (`npx playwright show-trace`) is the best debugger — enable `trace: "on-first-retry"`.
- **Avoid `page.evaluate`** for test setup — prefer API calls or `page.request` to seed state.
- **Screenshots are platform-specific** — store baselines per project; consider `toMatchSnapshot` thresholds.
- **Run `npx playwright install`** after bumping versions; browser binaries are separate.

## 4. Commands

```bash
# run all
npx playwright test
# single project
npx playwright test --project=chromium
# headed debug
npx playwright test --headed --debug
# UI mode
npx playwright test --ui
# open last HTML report
npx playwright show-report
```

## 5. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| vitest | ^2.1 | |
| @vitejs/plugin-react | ^4.3 | |
| jsdom | ^25 | or happy-dom ^15 |
| @testing-library/react | ^16 | React 19 compatible |
| @testing-library/jest-dom | ^6.5 | |
| @playwright/test | ^1.48 | |
| node | 20 LTS | |
