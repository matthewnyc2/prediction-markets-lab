# TypeScript 5.x — Tech KB

**Version pinning**: `typescript@5.6.x` or `5.7.x` (compatible with Next.js 15 + React 19). Use `zod@3.23.x`.

## 1. API surface overview

- `tsconfig.json` drives compilation. Use `strict: true` always.
- Discriminated unions = type narrowing via a literal property.
- `zod` provides runtime validation + compile-time type inference via `z.infer<typeof Schema>`.
- `satisfies` operator (5.0+) preserves literal types while constraining shape.
- `const` type parameters (5.0+) preserve literal types in generic inference.
- `using` declarations (5.2+) for explicit resource management.

## 2. Recommended `tsconfig.json` (frontend)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## 3. Code examples

### Example 1 — Discriminated union for order state

```ts
type Order =
  | { kind: "pending";  id: string; side: "yes" | "no"; size: number }
  | { kind: "filled";   id: string; fillPrice: number; filledAt: string }
  | { kind: "rejected"; id: string; reason: string };

function describe(o: Order): string {
  switch (o.kind) {
    case "pending":  return `pending ${o.side} x${o.size}`;
    case "filled":   return `filled @ ${o.fillPrice}`;
    case "rejected": return `rejected: ${o.reason}`;
    // Exhaustiveness:
    default: { const _: never = o; return _; }
  }
}
```

### Example 2 — Zod runtime validation matching FastAPI payload

```ts
import { z } from "zod";

export const MarketSchema = z.object({
  id: z.string(),
  platform: z.enum(["kalshi", "polymarket", "manifold", "predictit"]),
  title: z.string(),
  yes_price: z.number().min(0).max(1),
  no_price: z.number().min(0).max(1),
  volume_24h: z.number().nonnegative(),
  closes_at: z.string().datetime().nullable(),
});

export type Market = z.infer<typeof MarketSchema>;

export async function fetchMarket(id: string): Promise<Market> {
  const res = await fetch(`/api/backend/markets/${id}`);
  const json = await res.json();
  return MarketSchema.parse(json); // throws on shape mismatch
}
```

### Example 3 — `satisfies` for strategy registry

```ts
type StrategyMeta = {
  id: string;
  displayName: string;
  parametersSchema: Record<string, "number" | "string" | "bool">;
};

const STRATEGIES = {
  "kelly-sizing": {
    id: "kelly-sizing",
    displayName: "Kelly Sizing",
    parametersSchema: { fraction: "number", cap: "number" },
  },
  "closing-momentum": {
    id: "closing-momentum",
    displayName: "Closing Momentum",
    parametersSchema: { windowHours: "number" },
  },
} as const satisfies Record<string, StrategyMeta>;

type StrategyId = keyof typeof STRATEGIES; // "kelly-sizing" | "closing-momentum"
```

### Example 4 — Safe result type (no exceptions)

```ts
type Ok<T>  = { ok: true;  value: T };
type Err<E> = { ok: false; error: E };
type Result<T, E = Error> = Ok<T> | Err<E>;

async function safeFetch<T>(url: string, schema: z.ZodType<T>): Promise<Result<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: new Error(`HTTP ${res.status}`) };
    return { ok: true, value: schema.parse(await res.json()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
```

### Example 5 — Template literal types for platform-prefixed IDs

```ts
type Platform = "kalshi" | "polymarket" | "manifold" | "predictit";
type MarketId<P extends Platform = Platform> = `${P}:${string}`;

const id: MarketId<"kalshi"> = "kalshi:PRES-2028-DEM";
// const bad: MarketId<"kalshi"> = "polymarket:0x..."; // compile error
```

### Example 6 — Narrowing with `in` for adapter responses

```ts
type KalshiTick   = { ts: number; yes_bid: number; yes_ask: number };
type ManifoldTick = { ts: number; prob: number };
type NormalizedTick = { ts: number; yes: number; no: number };

function normalize(t: KalshiTick | ManifoldTick): NormalizedTick {
  if ("yes_bid" in t) {
    const mid = (t.yes_bid + t.yes_ask) / 2;
    return { ts: t.ts, yes: mid, no: 1 - mid };
  }
  return { ts: t.ts, yes: t.prob, no: 1 - t.prob };
}
```

## 4. Gotchas / pitfalls

- `noUncheckedIndexedAccess` turns `arr[0]` into `T | undefined` — catches real bugs but requires guards.
- `exactOptionalPropertyTypes` distinguishes `{ x?: number }` from `{ x: number | undefined }`. Set deliberately.
- `z.infer` only reflects parsed output; use `z.input<typeof S>` for pre-transform input types.
- Don't mix `zod` versions — v4 has breaking API changes (when it ships, pin `^3`).
- `as const satisfies T` is better than `as T` — `satisfies` does not widen literals.
- Avoid `any`; prefer `unknown` then narrow. `noImplicitAny` catches most accidents.
- In React 19, event types from `@types/react@19` differ subtly from 18 — pin `@types/react@^19`.

## 5. Version compatibility matrix

| Tool | Version | Notes |
| --- | --- | --- |
| typescript | 5.6.x / 5.7.x | Next.js 15 tested |
| @types/node | ^20 | Matches Node 20 LTS |
| @types/react | ^19 | React 19 types |
| zod | ^3.23 | stable |
| eslint | ^9 | flat config |
| typescript-eslint | ^8 | required for TS 5.6+ |
