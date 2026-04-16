# Feature Research Summary — prediction-markets

Phase 1, Step 12a. Source: `feature-discoveries.json`. All vocabulary references `disambiguated.txt` only.

## Platform adapters — four distinct shapes, not one pattern

The four adapters look superficially similar but diverge sharply in capability. **Kalshi** (base `api.elections.kalshi.com/trade-api/v2`) offers full REST + websocket and paired binary markets where no-price = 1 − yes-price by construction; auth uses RSA signing but reads are public; rate limits tier from 20 to 400 reads/sec. **Polymarket** uses three separate domains (gamma discovery, clob trading, data), and uniquely has TWO INDEPENDENT order books per market (yes-token and no-token have separate token_ids, and their prices can diverge — this is the core arbitrage signal). **Manifold** is the simplest (500 req/min, api-key-optional, websocket with 30-60s ping) but has no price-history endpoint — history must be reconstructed from `/v0/bets`. **PredictIt** is the most constrained: 1 req/sec, 60-second upstream refresh, no websocket, NO HISTORICAL API. PredictIt backtests can only cover dates since the app first started recording live — a hard user-facing constraint (OQ-01).

## Engine, metrics, strategies

The backtest engine should be **event-driven, not vectorised**. The same `strategy.decide(market-state) → orders` contract must run in both `execute-backtest` and `live-paper-trading-session`, and only an event-driven architecture prevents look-ahead bias while reusing code. The slippage-model from stated-intent (mid ± 1¢, fallback to top-of-book walk) maps cleanly to a simulated ExecutionHandler that emits paper-fills from orders.

Metric formulas are canonical and non-controversial: Brier = mean squared error between market-price-as-forecast and 0/1 outcome; Sharpe annualises daily returns by √252 with risk-free-rate default 0; Sortino uses downside-only deviation with target 0; max-drawdown via np.maximum.accumulate. Win-rate counts only closed positions with resolved outcomes.

Strategy specs leverage a standard Kelly formula adapted for 0/1 payoff (`f* = (p - market_price) / (1 - market_price)`), a cross-platform-arbitrage edge rule `1 − (yes_A + no_B) > threshold`, and an Avellaneda-Stoikov-inspired market-maker with inventory-skewed quotes.

## Ten open questions

Ten ambiguities are flagged (OQ-01 to OQ-10), most critically: predictit historical-data constraint, brier-price-to-use, cancelled-market handling, kelly's true-probability source, cross-platform event matching, passive MM fill semantics, and sell-side/short interpretation. All have recommended defaults that can ship without re-asking the person.
