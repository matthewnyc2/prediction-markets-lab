# Prediction Markets Lab

> A browser-based quantitative strategy backtester for prediction markets. Describe a trading theory, test it, get scored results — Sharpe ratio, Brier score, drawdown, win rate — running entirely in your browser.

**[→ Try the live demo](https://matthewnyc2.github.io/prediction-markets-lab/)**

![Engine status: live · deterministic](https://img.shields.io/badge/engine-live%20%C2%B7%20deterministic-7dd3fc)
![Tests: 53 passing](https://img.shields.io/badge/tests-53%20passing-34d399)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776ab)
![License: MIT](https://img.shields.io/badge/license-MIT-8ea0bd)

---

## What this is

A portfolio project demonstrating end-to-end product engineering — from spec to tested engine to browser demo. It paper-trades **synthetic prediction markets** (Kalshi / Polymarket / Manifold / PredictIt in scope for future real-data adapters) and lets you test five built-in quantitative strategies or author your own.

### The engine

- Event-driven backtest replay (same code path for backtests and live paper trading)
- Six pure-function metrics: Brier score, Sharpe ratio, Sortino ratio, max drawdown, win rate, Kelly fraction
- Pluggable strategy interface — drop a `.py` file into `src/predmarkets/strategies/` and it's auto-registered
- Realistic slippage model with order-book walking
- Deterministic PRNG for reproducible results
- **53 unit tests**, 100% passing

### The five strategies

| Strategy | Theory |
|---|---|
| **Kelly sizing** | Bets scaled to edge vs an oracle probability — quarter-Kelly for conservative variance |
| **Closing momentum** | Rides 5%+ price moves in the final hours before market close |
| **Contrarian underdog** | Buys YES on longshots priced below a threshold — tests whether underdogs are systematically underpriced |
| **Favorite-longshot fade** | Fades heavily-favored markets — tests the well-documented overpricing of favorites |
| **Buy-and-hold baseline** | Naive reference: just buys YES at open. Everything else should beat this. |

---

## Architecture

```
src/predmarkets/          Python engine (authoritative)
├── engine/               Event-driven backtester, portfolio, slippage, types
├── metrics/              Pure-function metric formulas
├── strategies/           Strategy ABC + 5 built-ins + auto-loader
├── adapters/             Mock adapter (real platforms planned)
├── api.py                High-level Python API (run_backtest, show_result, save_result)
└── cli.py                Command-line entry point

docs/                     Browser demo (GitHub Pages)
├── index.html            Landing page + live app
└── assets/
    ├── engine.js         JS port of the Python engine
    ├── strategies.js     JS port of the strategies
    ├── app.js            UI wiring + Chart.js integration
    └── style.css         Linear-adapted dark design system

tests/                    pytest — mirrors src/ 1:1
.hacf/prediction-markets/ Spec artifacts (stated intent, contracts, rules database)
pseudocode/               Pre-build pseudocode for every critical-path function
```

The browser JS is a **line-for-line port** of the Python engine. Same seed → identical results.

---

## Quickstart (Python)

```bash
git clone https://github.com/matthewnyc2/prediction-markets-lab.git
cd prediction-markets-lab

uv venv .venv
source .venv/bin/activate     # or .venv\Scripts\activate on Windows
uv pip install -e ".[dev]"

pytest                        # 53 tests, all green

# Run a backtest
python -m predmarkets.cli backtest --strategy kelly --platform mock --bankroll 10000
```

## Quickstart (browser)

```bash
# Serve docs/ locally
cd docs && python -m http.server 8000
# → open http://localhost:8000
```

---

## Authoring a strategy

See [`CLAUDE.md`](./CLAUDE.md) for the full pattern. Abbreviated:

```python
from dataclasses import dataclass, field
from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.strategies.base import MarketState, Strategy


@dataclass(slots=True)
class MyTheory(Strategy):
    threshold: float = 0.7
    assigned_capital: float = 10_000.0
    strategy_id: str = "my-theory"
    display_name: str = "My theory"
    _entered: set[tuple[str, str]] = field(default_factory=set)
    _fills: list[PaperFill] = field(default_factory=list)

    def decide(self, state: MarketState) -> list[Order]:
        orders = []
        for market in state.markets:
            key = (market.platform, market.market_id)
            if key in self._entered:
                continue
            if market.yes_price > self.threshold:
                size = int(0.05 * self.assigned_capital / market.yes_price)
                if size >= 1:
                    orders.append(Order(
                        platform=market.platform, market_id=market.market_id,
                        side="yes", order_side="buy",
                        size=size, strategy_id=self.strategy_id,
                    ))
        return orders

    def on_fill(self, fill: PaperFill) -> None:
        self._fills.append(fill)
        self._entered.add((fill.platform, fill.market_id))
```

Drop that file into `src/predmarkets/strategies/my_theory.py` and it's registered.

---

## Methodology

Built spec-first through a four-phase pipeline:

1. **Create** — stated intent, disambiguated vocabulary, terminal states, tech stack, wireframes, design system
2. **Review** — 297 rules extracted, 99 function contracts, backward state chain, chain-correctness proof
3. **Build** — Python engine + 53 unit tests, TDD for every metric
4. **Pivot** — browser port, JS engine mirroring Python line-for-line, deterministic cross-port results

All spec artifacts live in `.hacf/prediction-markets/` and are hash-locked.

---

## Honest caveats

- **Markets are synthetic.** The current adapter generates deterministic random-walks. Real-platform adapters (Kalshi, Polymarket, Manifold, PredictIt) are designed but not built.
- **Backtest overfitting is real.** Good in-sample backtest ≠ live alpha. Use this as decision support, not decisions.
- **Slippage is simplified.** `mid ± 1¢` with tier-based book walking. Real markets are harsher.
- **No real-money trading.** By construction — no code path writes to any trading API.

See the [live demo's caveats section](https://matthewnyc2.github.io/prediction-markets-lab/#caveats) for more.

---

## License

MIT © matthewnyc2
