# Recharts — Tech KB

**Version pinning**: `recharts@2.13.x` (works with React 18 and 19). Peer: `react@^18 || ^19`.

Recharts is SVG-based, composable, and uses D3 under the hood. Good for small-to-medium datasets (<10k points). For higher volumes, consider `visx` or `uplot`.

## 1. API surface

Chart containers:
- `ResponsiveContainer` — makes charts fluid
- `LineChart`, `AreaChart`, `BarChart`, `ComposedChart`, `ScatterChart`, `PieChart`, `RadarChart`

Series/primitives:
- `Line`, `Area`, `Bar`, `Scatter`, `Pie`, `Radar`
- `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `Brush`, `ReferenceLine`, `ReferenceArea`

Interactivity:
- `onClick`, `onMouseEnter`, `activeDot`, `cursor`, `syncId` (link charts)

## 2. Code examples

### Example 1 — Price time series (LineChart)

```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

type Tick = { ts: number; yes: number; no: number };

export default function PriceChart({ ticks }: { ticks: Tick[] }) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={ticks} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#2a2e37" />
        <XAxis
          dataKey="ts"
          type="number"
          domain={["dataMin", "dataMax"]}
          scale="time"
          tickFormatter={(v) => new Date(v).toLocaleTimeString()}
          stroke="#8b92a3"
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}¢`}
          stroke="#8b92a3"
        />
        <Tooltip
          contentStyle={{ background: "#19202b", border: "1px solid #2a2e37", color: "#e5e7eb" }}
          labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
          formatter={(v: number) => `${(v * 100).toFixed(2)}¢`}
        />
        <ReferenceLine y={0.5} stroke="#8b92a3" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="yes" stroke="#4ade80" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="no"  stroke="#f87171" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Example 2 — Equity curve (AreaChart with gradient)

```tsx
"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function EquityCurve({ data }: { data: { day: string; equity: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2e37" strokeDasharray="2 4" />
        <XAxis dataKey="day" stroke="#8b92a3" />
        <YAxis stroke="#8b92a3" tickFormatter={(v) => `$${v.toLocaleString()}`} />
        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
        <Area type="monotone" dataKey="equity" stroke="#4ade80" fill="url(#eq)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### Example 3 — Returns histogram (BarChart)

```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function ReturnsHistogram({ buckets }: { buckets: { bin: string; count: number; mid: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={buckets}>
        <XAxis dataKey="bin" stroke="#8b92a3" />
        <YAxis stroke="#8b92a3" />
        <Tooltip />
        <Bar dataKey="count">
          {buckets.map((b, i) => (
            <Cell key={i} fill={b.mid >= 0 ? "#4ade80" : "#f87171"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Example 4 — Synced charts with `syncId`

```tsx
<LineChart syncId="market-1" data={priceTicks}>…</LineChart>
<BarChart  syncId="market-1" data={volumeTicks}>…</BarChart>
```

Hovering either chart highlights the same x-coordinate in the other.

### Example 5 — Brush for zoom/pan

```tsx
import { LineChart, Line, XAxis, YAxis, Brush, ResponsiveContainer } from "recharts";

<ResponsiveContainer width="100%" height={420}>
  <LineChart data={ticks}>
    <XAxis dataKey="ts" type="number" domain={["auto", "auto"]} />
    <YAxis domain={[0, 1]} />
    <Line dataKey="yes" stroke="#4ade80" dot={false} />
    <Brush dataKey="ts" height={24} stroke="#8b92a3" />
  </LineChart>
</ResponsiveContainer>
```

### Example 6 — Reference area for event annotation

```tsx
<ReferenceArea x1={newsTs - 5 * 60_000} x2={newsTs + 15 * 60_000} fill="#f59e0b" fillOpacity={0.15} />
<ReferenceLine x={newsTs} stroke="#f59e0b" label="News spike" />
```

## 3. Gotchas / pitfalls

- **Must be Client Component** — add `"use client"`. Recharts uses browser SVG APIs.
- `ResponsiveContainer` needs a parent with a defined height (or explicit `height` prop). A common bug is "chart doesn't render" — check parent has height.
- `isAnimationActive={false}` for real-time data to avoid animation stutter on each update.
- For time axes, use `type="number"` + `scale="time"` + numeric Unix-ms `ts`. Strings work but sort alphabetically.
- `dot={false}` for lines with >100 points — per-point dots tank rendering.
- Tooltip `contentStyle` must be inline; class-based styling is unreliable.
- `recharts@3.x` is available but has breaking changes — stick to 2.13.x for stability.
- Large datasets (>5k points): use `<Line dot={false} type="linear" />` and consider downsampling to the plot's pixel width.

## 4. Integration tips for this project

- Route chart components through `"use client"` wrappers; keep page shells Server Components.
- Share a `chartTheme.ts` object with colors matching Tailwind tokens to avoid hard-coding hex strings.
- For live updates, use `useSyncExternalStore` or `SWR`/`react-query` with `refetchInterval: 30_000` — matches `data_refresh_policy.live_poll_interval_seconds`.

## 5. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| recharts | ^2.13 | React 18/19 compatible |
| react | ^18 or ^19 | peer |
| d3-* | bundled | don't install separately |
