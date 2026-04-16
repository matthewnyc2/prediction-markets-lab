# Prediction Markets Paper Trader & Strategy Backtester

A local web application for paper-trading prediction markets and backtesting quantitative strategies across Kalshi, Polymarket, Manifold, and PredictIt — without risking real money.

## North star

> There is a prediction market paper trader that allows me to back test strategies as well.

## Status

**HACF Phase 1 (Create)** · ✓ complete · see `.hacf/prediction-markets/hacf-create-confirmation.html`
**HACF Phase 2 (Review)** · ✓ complete, locked · see `.hacf/prediction-markets/hacf-review-confirmation.html`
**HACF Phase 3 (Build)** · 🏗️ in progress · see `build-report.md`

## Layout

```
src/predmarkets/
  engine/          # Event-driven backtest + live replay
  strategies/      # Pluggable strategy interface + 5 built-ins
  adapters/        # Platform adapters (Kalshi, Polymarket, Manifold, PredictIt, Mock)
  metrics/         # Brier, Sharpe, Sortino, max-drawdown, win-rate, Kelly
  models/          # SQLAlchemy models
  api/             # FastAPI routers
  cli.py           # Command-line entry point

tests/             # pytest — mirrors src/ 1:1
frontend/          # (deferred) Next.js + Tailwind + Recharts
.hacf/             # HACF pipeline artifacts (spec, contracts, rules)
```

## Quickstart (dev)

```bash
# Backend
uv venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
uv pip install -e ".[dev]"
pytest

# Run a backtest
python -m predmarkets.cli backtest --strategy kelly --platform mock --bankroll 10000
```

## HACF artifacts

Spec, rules, contracts, and wireframes live in `.hacf/prediction-markets/`.

Core artifacts produced in Phases 1–2:

- `stated-intent.txt` — narrative spec (person's words)
- `terminal-states.json` — 3 observable success conditions
- `rules-database.json` — 297 rules from 5 sources
- `semantic-spec.json` — invariants, forbidden states, cross-screen conditions
- `behavior-metadata.json` — 99 interactions × 16 metadata fields
- `state-chain.json` — backward/forward dependency chain
- `contracts/` — 99 function contracts
- `implementation-plan.json` — 4-wave forward plan

## Methodology

Built using the [HACF](https://github.com/matthew1000/hacf) pipeline — spec-driven development with deterministic lockdown between phases.
