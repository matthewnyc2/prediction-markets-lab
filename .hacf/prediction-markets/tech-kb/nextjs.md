# Next.js 15 — Tech KB

**Version pinning**: `next@15.x`, `react@19.x`, `react-dom@19.x`, Node.js `>=18.18` (20 LTS recommended). Use `pnpm@9.x`.

> Note: Context7 was unavailable during generation (quota exceeded). Contents below reflect Next.js 15 stable API surface. Cross-check with `https://nextjs.org/docs` for any edge cases.

## 1. API surface overview

Next.js 15 defaults to the **App Router** (`app/` directory). Key primitives:

- `app/layout.tsx` — root layout (Server Component by default)
- `app/page.tsx` — route segment
- `app/**/route.ts` — API route handlers (GET/POST/PUT/DELETE/PATCH)
- `app/**/loading.tsx` — Suspense boundary
- `app/**/error.tsx` — error boundary (Client Component)
- `app/**/not-found.tsx` — 404 UI
- `"use client"` directive — marks a Client Component
- `"use server"` directive — marks a Server Action
- `cache`, `unstable_cache`, `revalidateTag`, `revalidatePath` — caching primitives
- `next/navigation` — `useRouter`, `usePathname`, `useSearchParams`, `redirect`, `notFound`
- `next/headers` — `cookies()`, `headers()`, `draftMode()` (**async in 15**)

### Breaking changes in 15 vs 14

- `cookies()`, `headers()`, `draftMode()`, `params`, and `searchParams` are now **async** (must `await`).
- `fetch` no longer caches by default; opt in with `cache: 'force-cache'` or `next: { revalidate }`.
- Route handlers `GET` are not cached by default (use `export const dynamic = 'force-static'` to cache).
- React 19 is required.
- Turbopack dev is stable (`next dev --turbo`).

## 2. Code examples (copy-paste-ready)

### Example 1 — Server Component fetching from FastAPI

```tsx
// app/markets/page.tsx
import { Suspense } from "react";
import MarketTable from "./market-table";

async function getMarkets() {
  const res = await fetch("http://127.0.0.1:8000/api/markets", {
    next: { revalidate: 30 }, // ISR every 30s — matches live_poll_interval_seconds
  });
  if (!res.ok) throw new Error("Failed to load markets");
  return res.json() as Promise<Array<{ id: string; platform: string; title: string; yes_price: number }>>;
}

export default async function MarketsPage() {
  const markets = await getMarkets();
  return (
    <Suspense fallback={<div>Loading markets…</div>}>
      <MarketTable markets={markets} />
    </Suspense>
  );
}
```

### Example 2 — Client Component with `useSearchParams`

```tsx
// app/markets/market-table.tsx
"use client";
import { useSearchParams, useRouter } from "next/navigation";

type Market = { id: string; platform: string; title: string; yes_price: number };

export default function MarketTable({ markets }: { markets: Market[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const platform = sp.get("platform") ?? "all";
  const filtered = platform === "all" ? markets : markets.filter((m) => m.platform === platform);

  return (
    <div>
      <select
        value={platform}
        onChange={(e) => router.push(`/markets?platform=${e.target.value}`)}
        className="bg-neutral-900 text-neutral-100 px-2 py-1 rounded"
      >
        <option value="all">All</option>
        <option value="kalshi">Kalshi</option>
        <option value="polymarket">Polymarket</option>
        <option value="manifold">Manifold</option>
        <option value="predictit">PredictIt</option>
      </select>
      <ul>
        {filtered.map((m) => (
          <li key={m.id}>{m.title} — {(m.yes_price * 100).toFixed(1)}¢</li>
        ))}
      </ul>
    </div>
  );
}
```

### Example 3 — Route handler (API proxy)

```ts
// app/api/markets/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // always hit the backend, never cache

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform");
  const url = new URL("http://127.0.0.1:8000/api/markets");
  if (platform) url.searchParams.set("platform", platform);

  const upstream = await fetch(url, { headers: { accept: "application/json" } });
  if (!upstream.ok) {
    return NextResponse.json({ error: "upstream failed" }, { status: 502 });
  }
  return NextResponse.json(await upstream.json());
}
```

### Example 4 — Async `params` and `searchParams` (Next 15)

```tsx
// app/markets/[id]/page.tsx
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MarketDetail({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";

  const res = await fetch(`http://127.0.0.1:8000/api/markets/${id}`, { cache: "no-store" });
  const market = await res.json();
  return <pre>{JSON.stringify({ id, tab, market }, null, 2)}</pre>;
}
```

### Example 5 — Server Action + revalidation

```tsx
// app/strategies/actions.ts
"use server";
import { revalidatePath } from "next/cache";

export async function startBacktest(formData: FormData) {
  const strategyId = formData.get("strategyId");
  const res = await fetch("http://127.0.0.1:8000/api/backtests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ strategy_id: strategyId }),
  });
  if (!res.ok) throw new Error("Backtest failed to start");
  revalidatePath("/backtests");
  return res.json();
}

// app/strategies/page.tsx
import { startBacktest } from "./actions";
export default function StrategiesPage() {
  return (
    <form action={startBacktest}>
      <input name="strategyId" defaultValue="kelly-sizing" />
      <button type="submit">Run backtest</button>
    </form>
  );
}
```

### Example 6 — `next.config.ts` for this project

```ts
// next.config.ts
import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  async rewrites() {
    return [
      { source: "/api/backend/:path*", destination: "http://127.0.0.1:8000/api/:path*" },
    ];
  },
};
export default config;
```

## 3. Gotchas / pitfalls

- **`fetch` is uncached by default in 15**. Explicitly opt in with `cache: "force-cache"` or `next: { revalidate: n }`.
- **Async request APIs**: `cookies()`, `headers()`, `params`, `searchParams` all return Promises. `codemod upgrade` helps migrate.
- **Can't `await` `params` in Client Components**. Use a wrapper Server Component that unwraps and passes the value down, or use the `use()` hook on the Promise.
- **`"use client"` is viral downward for bundling but components imported above can still be Server Components** — keep the boundary as deep as possible.
- **Server Actions close over variables at the top of the module**; don't import heavy client-only libs into them.
- **Route handlers need `dynamic = "force-dynamic"`** when you read headers or use query params that change per request; otherwise they get cached statically at build.
- **Windows dev**: Turbopack has occasional file-watching quirks on OneDrive-synced folders. Use `--experimental-https` only if you need TLS.
- **`next/image` with local FastAPI**: remote dev origin must be in `images.remotePatterns`.

## 4. Testing hooks

- Unit tests: **Vitest** — see `vitest.md`.
- E2E: **Playwright** — see `playwright.md`.
- For Server Components, prefer integration tests hitting the real dev server over mocking React internals.
