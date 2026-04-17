# CLAUDE.md — Authoring strategies and running backtests

This project is a **Claude-driven prediction-markets lab**. The user describes a trading theory in plain English. You (Claude) translate it into a `Strategy` subclass, run a backtest, interpret the scored result, and iterate with the user. The user is not a quant; explain Brier/Sharpe/Kelly when relevant.

No web UI. No forms. The whole thing exists so the user can think "I wonder if..." and have you test it immediately.

---

## The workflow

1. **User describes a theory** — e.g. "what if we buy YES whenever the implied probability is below 30% in the last 6 hours before close?"
2. **You author a strategy** — write a `Strategy` subclass in `src/predmarkets/strategies/<descriptive_name>.py`
3. **You run a backtest** — `run_backtest(strategy_instance, markets=..., bankroll=..., save_as=...)`
4. **You show and interpret the result** — `show_result(result, bankroll=...)`, then explain what the numbers mean and suggest the next experiment

Do not ask the user to fill in hyperparameters. Pick sensible defaults from your domain knowledge, run the backtest, and offer tweaks after they see numbers.

---

## Import surface

```python
# All you need, top-level:
from predmarkets import (
    run_backtest, show_result, save_result,
    Strategy, MarketState, MarketView,
    Order, PaperFill,
    load_user_strategies,
)

# Metric helpers (rarely needed directly — results come with them computed):
from predmarkets.metrics import (
    brier_score, sharpe_ratio, sortino_ratio,
    max_drawdown, win_rate, kelly_fraction,
)
```

---

## Authoring a new `Strategy` — canonical template

Drop a new file under `src/predmarkets/strategies/<name>.py`. The loader picks it up by `strategy_id`.

```python
"""One-line description of the theory."""

from dataclasses import dataclass, field
from typing import Literal

from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.strategies.base import MarketState, MarketView, Strategy

MarketKey = tuple[str, str]


@dataclass(slots=True)
class MyStrategy(Strategy):
    # parameters with defaults (user can override when instantiating)
    some_threshold: float = 0.7
    assigned_capital: float = 10_000.0
    bet_fraction: float = 0.05
    # required plumbing
    strategy_id: str = "my-strategy-short-slug"
    display_name: str = "My strategy"
    _entered: set[MarketKey] = field(default_factory=set)
    _fills: list[PaperFill] = field(default_factory=list)

    def decide(self, market_state: MarketState) -> list[Order]:
        orders: list[Order] = []
        for market in market_state.markets:
            key = (market.platform, market.market_id)
            if key in self._entered:
                continue  # never re-enter a market within a single run
            order = self._maybe_order(market)
            if order is not None:
                orders.append(order)
        return orders

    def on_fill(self, fill: PaperFill) -> None:
        self._fills.append(fill)
        self._entered.add((fill.platform, fill.market_id))

    def _maybe_order(self, market: MarketView) -> Order | None:
        # YOUR THEORY GOES HERE. Read market fields, decide whether to buy.
        if market.yes_price < self.some_threshold:
            return None  # no edge → skip
        price = market.yes_price
        size = int((self.bet_fraction * self.assigned_capital) / price)
        if size < 1:
            return None
        return Order(
            platform=market.platform,
            market_id=market.market_id,
            side="yes",             # or "no"
            order_side="buy",       # SELL means close — see Shorting below
            size=size,
            strategy_id=self.strategy_id,
        )
```

### Mandatory rules for every strategy

- **Subclass `Strategy`**, implement both `decide()` and `on_fill()`
- **Track entered markets** — each market should be opened at most once per direction per run (avoid the Kelly-over-trading bug)
- **Pure `decide()`** — no network calls, no filesystem, no randomness unrelated to the seed
- **Every `Order` must carry `strategy_id=self.strategy_id`** — required for attribution
- **Shorting convention:** opening a short = `BUY` on the opposite `side`. `order_side="sell"` is reserved for closing existing positions. See OQ-09 in `.hacf/prediction-markets/exclusion-registry.json`.

---

## What `MarketView` gives you

```python
@dataclass(frozen=True, slots=True)
class MarketView:
    platform: str            # "mock", "kalshi", "polymarket", "manifold", "predictit"
    market_id: str
    market_title: str
    yes_price: float         # ∈ [0, 1]
    no_price: float          # ∈ [0, 1]; equals 1 - yes_price for paired binaries
    close_in_hours: float    # time until market resolves
```

Volume, open-interest, order-book depth, historical prices are NOT on `MarketView` yet — the mock adapter doesn't emit them. When real adapters land, extend `MarketView` and update the mock to match.

---

## Running a backtest

```python
from predmarkets import run_backtest, show_result

strategy = MyStrategy(some_threshold=0.7, assigned_capital=10_000)
result = run_backtest(
    strategy,
    markets=10,            # mock markets per run
    ticks_per_market=40,   # price-history length
    seed=42,               # deterministic
    bankroll=10_000,
    save_as="threshold_70_first_try",  # persists to results/threshold_70_first_try.json
)
show_result(result, bankroll=10_000)
```

`platform="mock"` is currently the only option — real adapters aren't built. When the user says "run it on Kalshi", either (a) build a real Kalshi adapter, or (b) vary the mock seed + edge and be honest that it's still synthetic.

---

## Reading a `BacktestResult` — what to report back to the user

| Field | What it means | Good value |
|---|---|---|
| `final_equity` | ending portfolio value in USD | higher than `bankroll` |
| `sharpe` | annualized risk-adjusted return (std-dev denominator) | > 1 is good, > 2 is great, `None` if < 2 daily returns |
| `sortino` | like Sharpe but only penalizes downside volatility | similar to Sharpe |
| `brier` | mean squared error of probability forecasts; 0 perfect, 0.25 coin-flip, 1 always wrong and certain | < 0.2 is well-calibrated, `None` for strategies that don't emit forecasts |
| `drawdown` | largest peak-to-trough equity decline as a fraction | < 0.2 (20%) is mild |
| `win_rate_value` | fraction of closed positions that turned a profit | > 0.5 is nominally good, but high WR + bad PnL = small wins / big losses |
| `bankrupt` | equity hit zero during replay | should be `False` |
| `trade_list` | every `PaperFill` produced | inspect specific trades |
| `closed_positions` | every `PositionRecord` that settled | source of the win-rate and brier |
| `equity_curve` | `list[(timestamp, equity)]` | for plotting / inspection |

When reporting to the user, lead with PnL, then Sharpe, then comment on drawdown. If a metric is `None`, don't say "it's None" — explain why ("Brier wasn't computed because no positions closed during this run").

---

## Saving + comparing experiments

Every run with `save_as="..."` writes `results/<name>.json` including equity curve, trades, and metrics. To compare past runs, read the JSON files directly:

```python
import json
from pathlib import Path

runs = {
    p.stem: json.loads(p.read_text())
    for p in Path("results").glob("*.json")
}
for name, r in runs.items():
    print(f"{name:>30}  PnL={r['final_equity'] - 10000:+,.0f}  Sharpe={r['sharpe']}")
```

---

## The engine's honest limits (do not claim otherwise)

1. **Mock data only.** Real platform adapters (Kalshi, Polymarket, Manifold, PredictIt) are planned but not built. Anything you run now is against a deterministic random-walk.
2. **Single-strategy backtests.** Running two strategies simultaneously on the same bankroll isn't wired up (would need strategy-level capital allocation).
3. **No fees modelled.** Platform fees are zero in strict paper mode (see OQ-06).
4. **Binary markets only.** Non-binary (Manifold MULTIPLE_CHOICE, PredictIt multi-contract) is out of scope until v2 (see OQ-10).
5. **Slippage is simple.** `mid ± 1¢` with top-of-book walk. Real markets are harsher.
6. **Never touches real trading endpoints.** `INV-007` enforced by construction — adapters have no write methods. You cannot accidentally place a real order.

---

## Reference strategies already in the repo

Pattern-match off these when writing new ones:

- `src/predmarkets/strategies/kelly_sizing.py` — Kelly sizing with an injected `p_oracle`. Shows: parameter dataclass fields, entered-markets tracking, yes-or-no decision.
- `src/predmarkets/strategies/closing_momentum.py` — closing-window momentum. Shows: per-market state (anchor price), threshold-triggered entries, both up and down sides.

Both pass their regression tests; both respect the re-entry rule.

---

## Planned but not yet built strategies

From the locked spec `.hacf/prediction-markets/feature-discoveries.json`:

- `cross-platform-arbitrage` — needs ≥2 platforms; blocked on real adapters
- `news-spike-fade` — 10% move in 15min trigger; needs price-history ring buffer
- `market-maker` — Avellaneda-Stoikov-inspired; needs order-book depth on `MarketView`

If the user asks for one of these, build a mock version that works on mock markets, and be explicit that it's a simplified version of the real thing.

---

## Housekeeping for each session

1. Before authoring anything new, scan `src/predmarkets/strategies/` to see what exists.
2. When making a change to an existing strategy, bump its `strategy_id` or create a new file — don't silently change a strategy whose `save_as` history the user cares about.
3. Run tests after any edit: `PYTHONPATH=src python -m pytest` (once deps are installed) or the manual harness in `build-report.md`.
4. If you add a new public function to `predmarkets.api` or change a signature, update this file.
5. The full design spec lives in `.hacf/prediction-markets/` — `stated-intent.txt`, `semantic-spec.json`, `rules-database.json`, `contracts/`, `state-chain.json`. Defer to those when a question of intent comes up.

---

## Style

- Keep strategy files under ~100 lines.
- One strategy per file.
- Dataclasses with `slots=True` for parameters.
- No comments explaining obvious code; comments reserved for non-obvious invariants (e.g., why a market can't be re-entered).
- Prefer explicit: `if market.yes_price < 0.3` over `if cheap(market)`.

---

## When in doubt

Read `.hacf/prediction-markets/stated-intent.txt` and `.hacf/prediction-markets/semantic-spec.json`. They are the locked source of truth for what the system is supposed to do. Everything else (wireframes, rules database, contracts) derives from them.
