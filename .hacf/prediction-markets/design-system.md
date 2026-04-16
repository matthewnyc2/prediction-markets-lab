# Design System — prediction-markets

**Selected: `library/design-systems/linear.app/` (Linear)** — adapted for trading UI.

## Why Linear

Linear's design system is the closest existing match to what a prediction-markets paper trader needs: dark-mode-native from the ground up (not a dark theme bolted onto a light design), built around luminance stepping (`#08090a` → `#0f1011` → `#191a1b` → `#28282c`) that directly parallels the sky-dark palette already approved in `hacf-create-proposal.html` (`#0b0f17` / `#111826` / `#182236`). Its achromatic grayscale surface system with a single chromatic accent is exactly right for a data-dense trading dashboard where tables, metric tiles, equity curves, and sidebar navigation must dominate — and where the UI chrome must never distract from the numbers on screen. Two adaptations: (1) Linear's indigo-violet brand accent `#5e6ad2` is replaced with the already-approved sky-cyan `#7dd3fc` from the proposal, preserving user-confirmed visual direction; (2) explicit trading-semantic colors (positive emerald `#34d399`, danger red `#f87171`, warning amber `#fbbf24`) are added since Linear's own system is almost entirely achromatic and a trading UI demands unambiguous gain/loss signaling.

---

## 1. Color Tokens

### Backgrounds (luminance stepping — deeper = darker)
| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#0b0f17` | Page background — the deepest canvas |
| `--bg-panel` | `#0f1011` | Sidebar, docked panels |
| `--bg-surface` | `#111826` | Card backgrounds, elevated surfaces (tier 1) |
| `--bg-elevated` | `#182236` | Tiles, tooltips, hover-elevated cards (tier 2) |
| `--bg-overlay` | `rgba(255,255,255,0.02)` | Ghost button rest |
| `--bg-overlay-hover` | `rgba(255,255,255,0.05)` | Ghost button hover |
| `--bg-scrim` | `rgba(0,0,0,0.85)` | Modal / dialog backdrop |

### Text
| Token | Value | Role |
|-------|-------|------|
| `--fg` | `#e6edf7` | Primary text (near-white, cool cast) |
| `--fg-secondary` | `#d0d6e0` | Body text, long-form content |
| `--fg-dim` | `#8ea0bd` | Muted text, metadata, labels |
| `--fg-mute` | `#566178` | Tertiary text, placeholders |
| `--fg-disabled` | `#3e4555` | Disabled state |

### Accent (brand)
| Token | Value | Role |
|-------|-------|------|
| `--accent` | `#7dd3fc` | Primary accent — links, active nav, focus rings, primary CTA |
| `--accent-hover` | `#a5e3fd` | Hover-brightened accent |
| `--accent-subtle` | `rgba(125,211,252,0.12)` | Accent-tinted backgrounds (badges, selected rows) |
| `--accent-border` | `rgba(125,211,252,0.24)` | Accent-tinted borders |

### Semantic (trading)
| Token | Value | Role |
|-------|-------|------|
| `--success` | `#34d399` | Positive P&L, gains, healthy status, BUY YES |
| `--success-subtle` | `rgba(52,211,153,0.14)` | Success badge background |
| `--danger` | `#f87171` | Negative P&L, losses, error state, BUY NO |
| `--danger-subtle` | `rgba(248,113,113,0.14)` | Danger badge background |
| `--warning` | `#fbbf24` | Rate-limited adapter, caution pill, fade signals |
| `--warning-subtle` | `rgba(251,191,36,0.14)` | Warning badge background |
| `--neutral-pill` | `rgba(142,160,189,0.12)` | Platform chip, category pill |

### Borders & Dividers
| Token | Value | Role |
|-------|-------|------|
| `--border` | `rgba(255,255,255,0.08)` | Default border (cards, inputs, table rows) |
| `--border-subtle` | `rgba(255,255,255,0.05)` | Whisper-thin divider (section splits, list items) |
| `--border-strong` | `#1f2a40` | Prominent divider (sidebar edge, panel separator) |
| `--border-accent` | `#2b3a58` | Emphasized border (focused input, active card) |

---

## 2. Typography

### Font Stack
- **Sans (body, UI, headings)**: `Inter Variable`, `Inter`, `-apple-system`, `Segoe UI`, `Roboto`, `system-ui`, `sans-serif`
- **Mono (numbers, prices, tickers, code)**: `Berkeley Mono`, `JetBrains Mono`, `ui-monospace`, `SFMono-Regular`, `Menlo`, `Consolas`, `monospace`
- **OpenType features**: `"cv01", "ss03", "tnum"` globally — `tnum` is critical so price columns and P&L numbers align vertically in tables.

### Scale
| Role | Font | Size | Weight | Line-height | Letter-spacing |
|------|------|------|--------|-------------|----------------|
| Display | Inter | 30px | 650 | 1.15 | -0.3px |
| H1 (screen title) | Inter | 24px | 600 | 1.20 | -0.3px |
| H2 (section) | Inter | 20px | 600 | 1.25 | -0.2px |
| H3 (card title) | Inter | 16px | 600 | 1.30 | -0.1px |
| Body | Inter | 14px | 400 | 1.55 | normal |
| Body Medium | Inter | 14px | 510 | 1.55 | normal |
| Small | Inter | 13px | 400 | 1.50 | normal |
| Caption | Inter | 12px | 510 | 1.40 | normal |
| Micro / Overline | Inter | 11px | 510 | 1.00 | 0.08em uppercase |
| Tile Value (numeric) | Mono | 20px | 500 | 1.20 | normal, tnum |
| Table Cell (numeric) | Mono | 13px | 400 | 1.40 | normal, tnum |
| Price Big | Mono | 24px | 500 | 1.20 | normal, tnum |
| Code / Ticker | Mono | 12px | 400 | 1.40 | normal |

**Rule**: All prices, percentages, P&L values, Brier scores, Sharpe ratios, quantities, and timestamps are set in Mono with `font-variant-numeric: tabular-nums`. All prose (labels, descriptions, nav items, button text, paragraph copy) is set in Inter.

---

## 3. Spacing Scale

Base unit: **4px**.

| Token | Value | Use |
|-------|-------|-----|
| `--space-0` | 0 | Reset |
| `--space-1` | 4px | Intra-component micro-gap |
| `--space-2` | 8px | Between related inline elements |
| `--space-3` | 12px | Compact padding (tiles, pills) |
| `--space-4` | 16px | Default card padding, table cell Y |
| `--space-5` | 20px | Card padding (comfortable) |
| `--space-6` | 24px | Section spacing |
| `--space-8` | 32px | Between major sections |
| `--space-10` | 40px | Page-top padding |
| `--space-12` | 48px | Between full panels |
| `--space-16` | 64px | Page-level vertical breathing |

Rhythm: 4 → 8 → 16 → 24 → 32 dominates. Table rows: 12px Y-padding at most for dense data.

---

## 4. Border Radius Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--radius-xs` | 2px | Inline badges, status dots |
| `--radius-sm` | 4px | Small chips, table pills |
| `--radius-md` | 6px | Buttons, inputs, toolbar items |
| `--radius-lg` | 8px | Cards, tiles, dropdowns |
| `--radius-xl` | 12px | Featured cards, chart containers, hero panels |
| `--radius-2xl` | 14px | Large page-level panels (screen frame) |
| `--radius-full` | 9999px | Pills, status chips, filter tags |
| `--radius-circle` | 50% | Icon buttons, avatars, dots |

---

## 5. Shadow / Elevation Tokens

Dark-surface elevation is communicated **primarily by background luminance stepping**, not by drop shadows. Shadows supplement only for floating / overlay surfaces.

| Token | Value | Use |
|-------|-------|-----|
| `--shadow-none` | `none` | Flat surfaces, page background |
| `--shadow-sm` | `rgba(0,0,0,0.2) 0px 0px 0px 1px` | Border-as-shadow ring (cards) |
| `--shadow-md` | `rgba(0,0,0,0.4) 0px 2px 6px` | Dropdowns, hover-elevated cards |
| `--shadow-lg` | `rgba(0,0,0,0) 0px 8px 2px, rgba(0,0,0,0.04) 0px 3px 2px, rgba(0,0,0,0.08) 0px 1px 1px, rgba(0,0,0,0.12) 0px 4px 16px` | Modals, command palette, popovers |
| `--shadow-inset` | `rgba(0,0,0,0.2) 0px 0px 12px 0px inset` | Recessed panels (chart wells) |
| `--shadow-focus` | `0 0 0 2px rgba(125,211,252,0.35)` | Keyboard focus ring on interactive elements |

---

## 6. Component Styling Rules

### Button
**Primary (Accent)**
- Background: `var(--accent)` (`#7dd3fc`)
- Text: `#0b0f17` (dark text on cyan for legibility)
- Padding: 8px 14px
- Radius: `var(--radius-md)` (6px)
- Font: Inter 14px / weight 510
- Hover: background → `var(--accent-hover)`
- Focus: `var(--shadow-focus)`

**Secondary (Ghost)**
- Background: `var(--bg-overlay)` (`rgba(255,255,255,0.02)`)
- Text: `var(--fg)` (`#e6edf7`)
- Border: `1px solid var(--border)`
- Padding: 8px 14px
- Radius: `var(--radius-md)`
- Hover: background → `var(--bg-overlay-hover)`

**Destructive**
- Background: `var(--danger-subtle)`
- Text: `var(--danger)`
- Border: `1px solid rgba(248,113,113,0.24)`
- Same sizing as Ghost

**Icon Button**
- Background: transparent
- Padding: 6px
- Radius: `var(--radius-md)`
- Color: `var(--fg-dim)` → hover `var(--fg)`

### Card
- Background: `var(--bg-surface)` (`#111826`)
- Border: `1px solid var(--border)`
- Radius: `var(--radius-xl)` (12px)
- Padding: `var(--space-5)` (20px)
- Shadow: `var(--shadow-none)` by default; `var(--shadow-sm)` on hover for clickable cards
- Header: H3 (Inter 16px / 600), optional overline micro-label in `var(--fg-mute)`

### Tile (metric tile — dashboard equity, Brier, Sharpe, win rate)
- Background: `var(--bg-elevated)` (`#182236`)
- Border: `1px solid var(--border)`
- Radius: `var(--radius-lg)` (8px)
- Padding: 12px 16px
- Structure:
  - **Label** (top): Overline micro — Inter 11px weight 510, uppercase, 0.08em tracking, color `var(--fg-mute)`
  - **Value** (middle): Mono 20px weight 500, color `var(--fg)`, `tabular-nums`
  - **Delta** (bottom, optional): Mono 11px, color `var(--success)` if positive, `var(--danger)` if negative
- Width: fills grid column; grid is `repeat(4, 1fr)` at desktop, `repeat(2, 1fr)` ≤700px

### Table
- Width: 100%, `border-collapse: collapse`
- Font: Inter 13px for text columns, Mono 13px `tnum` for numeric columns
- Header (`th`):
  - Color: `var(--fg-mute)` (`#566178`)
  - Font: Inter 11px weight 510, uppercase, 0.08em letter-spacing
  - Padding: 10px 8px
  - Border-bottom: `1px solid var(--border)`
  - Background: transparent (no zebra on headers)
- Body (`td`):
  - Padding: 10px 8px
  - Border-bottom: `1px solid var(--border-subtle)`
  - Vertical align: top for stacked content, middle for single-line
  - Last row: no border-bottom
- Numeric columns: right-aligned, Mono, `tabular-nums`
- `.pos` class → color `var(--success)`, `.neg` class → color `var(--danger)`, `.dim` class → color `var(--fg-mute)`
- Row hover: background `rgba(255,255,255,0.02)`
- Row-as-link (Markets screen → Market detail): cursor pointer, hover background as above
- Sort indicator: small cyan caret in the active sorted header
- No zebra striping — rely on the thin `var(--border-subtle)` per row

### Sidebar
- Width: 180px (can collapse to 56px icon-only)
- Background: `var(--bg-panel)` (`#0f1011`)
- Border-right: `1px solid var(--border-strong)`
- Padding: 14px 12px
- Logo / brand: top, 16px height mark + 12px wordmark, margin-bottom 16px
- Nav items:
  - `ul` list-style none, padding 0
  - `li`: font Inter 12–13px weight 510, color `var(--fg-dim)`, padding 7px 8px, radius `var(--radius-md)`, display flex, justify-content space-between
  - Hover: background `var(--bg-overlay-hover)`, color `var(--fg)`
  - Active: background `var(--bg-elevated)`, color `var(--fg)`, optional 2px left cyan bar flush with item
  - Badge (count, status): 10px text, color `var(--accent)`, background `var(--accent-subtle)`, radius 10px, padding 1px 6px
- Navigation items for this app: Dashboard, Markets, Strategies, Paper Trades, Backtest, Compare, Portfolio, Data Ingestion (exact 8 screens from `screen-inventory.json`)

### Chart Container
- Background: `var(--bg-elevated)` (`#182236`)
- Border: `1px solid var(--border)`
- Radius: `var(--radius-lg)` (8px)
- Padding: 10px (tight — chart should breathe into the full area)
- Inner chart grid lines: `var(--border-subtle)` (`rgba(255,255,255,0.05)`)
- Axis labels: Mono 11px, color `var(--fg-mute)`, `tabular-nums`
- Default series color: `var(--accent)` (`#7dd3fc`)
- P&L / equity: stroke `var(--accent)`, fill `linear-gradient(180deg, rgba(125,211,252,0.18) 0%, rgba(125,211,252,0) 100%)`
- Positive regions: `var(--success)`; negative regions: `var(--danger)`
- Multi-series (Compare screen): use cyan → emerald → amber → violet (`#a78bfa`) → pink (`#f472b6`) — up to 5 distinct runs clearly
- Tooltip: background `var(--bg-elevated)`, border `var(--border)`, radius `var(--radius-md)`, padding 8px 10px, Mono 12px, shadow `var(--shadow-md)`

### Input (text / number / select)
- Background: `var(--bg-overlay)` (`rgba(255,255,255,0.02)`)
- Text: `var(--fg)`, Inter 14px weight 400
- Placeholder: `var(--fg-mute)`
- Border: `1px solid var(--border)`
- Radius: `var(--radius-md)` (6px)
- Padding: 8px 10px
- Focus: border → `var(--accent-border)`, shadow `var(--shadow-focus)`
- Numeric inputs (size, price, bankroll): Mono font, `tabular-nums`, right-aligned
- Disabled: color `var(--fg-disabled)`, background `rgba(255,255,255,0.01)`

### Pill / Badge
**Status (on/off for strategies)**
- On: background `var(--success-subtle)`, text `var(--success)`, dot ●  `var(--success)`
- Off: background `var(--neutral-pill)`, text `var(--fg-dim)`, dot ○  `var(--fg-mute)`
- Padding: 2px 8px; radius: `var(--radius-full)`; font: Inter 11px weight 510

**Platform chip (Kalshi / Polymarket / Manifold / PredictIt)**
- Background: `var(--neutral-pill)`
- Text: `var(--fg)`
- Padding: 2px 8px; radius: `var(--radius-sm)` (4px)
- Font: Inter 11px weight 510, optional uppercase
- Per-platform optional accent tint (subtle left border or dot): Kalshi — cyan; Polymarket — violet; Manifold — amber; PredictIt — emerald

**Side pill (BUY YES / BUY NO / SELL YES / SELL NO)**
- YES: `var(--success-subtle)` bg, `var(--success)` text
- NO: `var(--danger-subtle)` bg, `var(--danger)` text
- Padding: 2px 8px; radius: `var(--radius-sm)`; font: Mono 11px weight 500, uppercase

**Adapter status (HEALTHY / RATE LIMITED / ERROR)**
- HEALTHY: `var(--success-subtle)` bg, `var(--success)` text, dot ●
- RATE LIMITED: `var(--warning-subtle)` bg, `var(--warning)` text, dot ●
- ERROR: `var(--danger-subtle)` bg, `var(--danger)` text, dot ●
- Padding: 2px 10px; radius: `var(--radius-full)`; font: Inter 11px weight 510, uppercase 0.04em

---

## 7. Motion (light baseline)

- Transitions: `150ms ease-out` for hover, `200ms ease-out` for focus, `250ms ease-in-out` for expansion/collapse
- Never animate color of financial data during refresh — only subtle opacity pulse on new rows (0.4 → 1 over 600ms)
- Sidebar collapse: `200ms ease-in-out`
- Modal: backdrop fades 150ms, dialog scales from 0.98 → 1 in 200ms

---

## 8. Adaptations from Linear (documented deltas)

| Token | Linear value | This project | Reason |
|-------|--------------|--------------|--------|
| `--bg` | `#08090a` | `#0b0f17` | Aligns with already-approved proposal palette (slight blue undertone better suits financial UI) |
| `--bg-panel` | `#0f1011` | `#0f1011` | Unchanged |
| `--bg-surface` | `#191a1b` | `#111826` | Matches approved proposal's `--bg-2` |
| `--bg-elevated` | `#28282c` | `#182236` | Matches approved proposal's `--bg-3` |
| `--accent` | `#5e6ad2` (indigo-violet) | `#7dd3fc` (sky cyan) | User-approved in Phase 1 HTML proposal |
| Semantic trio | implicit / minimal | explicit `#34d399` / `#f87171` / `#fbbf24` | Trading UI demands unambiguous P&L signaling |
| Mono font | Berkeley Mono | Berkeley Mono with JetBrains Mono fallback | JetBrains Mono is free/ubiquitous, Berkeley may not be licensed |
| `tnum` feature | not explicit | globally required | Tabular figures mandatory for price/P&L alignment |

Everything else (weight 510 as UI workhorse, `cv01`+`ss03` features on Inter, semi-transparent white borders, luminance-stepping elevation, border-as-shadow technique, ghost-button opacity ladder) is inherited **unchanged** from Linear.
