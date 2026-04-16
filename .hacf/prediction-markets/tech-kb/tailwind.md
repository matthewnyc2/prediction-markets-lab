# Tailwind CSS 4.x — Tech KB

**Version pinning**: `tailwindcss@4.0.x`, `@tailwindcss/postcss@4.0.x` (or `@tailwindcss/vite@4.0.x` for Vite). Requires PostCSS 8+ and modern browsers. Next.js 15 uses the PostCSS plugin.

> Tailwind 4 is a major architectural rewrite (Oxide engine, CSS-first config). Do not mix v3 and v4 config styles.

## 1. Key v4 changes

- **CSS-first config**: no `tailwind.config.js` required. Theme tokens live in `@theme { … }` inside your CSS.
- **`@import "tailwindcss";`** replaces `@tailwind base; @tailwind components; @tailwind utilities;`.
- **Zero content-globbing config** — Tailwind auto-detects source files.
- **Dark mode**: `@variant dark (...)` directive. Supports `prefers-color-scheme` (default), `.dark` class, or `[data-theme=dark]` attribute.
- **Custom utilities**: `@utility name { ... }` directive.
- **Faster**: Oxide engine is ~5x faster than v3.
- **Lightning CSS** handles nesting, vendor prefixes, minification.

## 2. Setup for Next.js 15

### `postcss.config.mjs`

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### `app/globals.css` (dark-only project theme)

```css
@import "tailwindcss";

/* Force dark mode always — deployment.theme = "dark-only" */
@variant dark (&:where(:root, :root *));

@theme {
  /* Typography */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* Prediction-market semantic palette */
  --color-bg:           oklch(15% 0.01 240);
  --color-surface:      oklch(19% 0.012 240);
  --color-surface-hi:   oklch(23% 0.014 240);
  --color-border:       oklch(28% 0.016 240);
  --color-text:         oklch(95% 0.01  240);
  --color-text-muted:   oklch(70% 0.015 240);

  --color-yes:          oklch(72% 0.18 148); /* green */
  --color-no:           oklch(65% 0.22 25);  /* red */
  --color-accent:       oklch(72% 0.17 220); /* blue */
  --color-warn:         oklch(78% 0.15 85);  /* amber */

  /* Numeric scale */
  --spacing-gutter: 1.25rem;
  --radius-card: 12px;
}

:root {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  color-scheme: dark;
}
```

## 3. Code examples

### Example 1 — Market card (dark theme)

```tsx
export function MarketCard({ title, yes, no, volume }: { title: string; yes: number; no: number; volume: number }) {
  return (
    <div className="bg-surface rounded-[var(--radius-card)] border border-border p-4 space-y-2">
      <h3 className="text-text font-semibold truncate">{title}</h3>
      <div className="flex gap-2">
        <span className="text-yes font-mono">YES {(yes * 100).toFixed(1)}¢</span>
        <span className="text-no font-mono">NO {(no * 100).toFixed(1)}¢</span>
      </div>
      <div className="text-text-muted text-sm">Vol 24h: ${volume.toLocaleString()}</div>
    </div>
  );
}
```

### Example 2 — Responsive dashboard grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[var(--spacing-gutter)] p-6">
  {markets.map((m) => <MarketCard key={m.id} {...m} />)}
</div>
```

### Example 3 — Data-dense table row

```tsx
<tr className="border-b border-border hover:bg-surface-hi transition-colors">
  <td className="px-3 py-2 font-mono text-sm">{row.symbol}</td>
  <td className={`px-3 py-2 font-mono text-right ${row.pnl >= 0 ? "text-yes" : "text-no"}`}>
    {row.pnl >= 0 ? "+" : ""}{row.pnl.toFixed(2)}
  </td>
</tr>
```

### Example 4 — Custom utility (blinking live dot)

```css
@utility live-dot {
  @apply inline-block w-2 h-2 rounded-full bg-yes;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
```

```tsx
<span className="live-dot" aria-label="live" /> Streaming
```

### Example 5 — Arbitrary value + `data-` attribute state

```tsx
<button
  data-state={isActive ? "active" : "idle"}
  className="
    px-3 py-1.5 rounded-md border border-border
    data-[state=active]:bg-accent data-[state=active]:text-bg
    data-[state=idle]:bg-surface data-[state=idle]:text-text-muted
    transition-colors
  "
>
  {label}
</button>
```

### Example 6 — `@variant` for custom breakpoint and theme

```css
@variant 2xl-screen (@media (min-width: 1920px));
@variant reduced-motion (@media (prefers-reduced-motion: reduce));
```

```tsx
<div className="grid-cols-4 2xl-screen:grid-cols-6 reduced-motion:animate-none">…</div>
```

## 4. Gotchas / pitfalls

- **Don't install `tailwindcss@3` and v4 plugins side-by-side** — the PostCSS plugin is a separate package in v4 (`@tailwindcss/postcss`).
- `@apply` still works but is discouraged in v4 for shared styles — use `@utility` instead.
- Colors in v4 accept `oklch()`/`lab()` — prefer them over hex for perceptually uniform palettes.
- `dark:` variant requires the `@variant dark` directive set explicitly if not using media query default.
- No more `content: []` array — **delete the old config file** when upgrading from v3.
- Arbitrary values `bg-[#123]` still work; prefer theme tokens for consistency.
- With Next.js 15 + Turbopack dev, occasionally need to restart dev server after first install.

## 5. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| tailwindcss | ^4.0 | pin major |
| @tailwindcss/postcss | ^4.0 | match tailwindcss |
| postcss | ^8.4 | peer |
| autoprefixer | NOT NEEDED in v4 | Lightning CSS handles it |
