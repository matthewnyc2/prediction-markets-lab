# Kelly-sizing strategy — pseudocode

Contract derivation: STR-01, exclusion-registry (OQ-04 p_source=cross-platform-mean).

## Parameters
- kelly_fraction: float ∈ (0, 1]  — default 0.25 (quarter-Kelly)
- assigned_capital: float > 0     — USD
- p_source: str                   — "cross-platform-mean" (default) | "user-override"

## decide(market_state) -> list[Order]

```
orders = []
FOR market in market_state.markets:
    IF market.close_in_hours < 1: continue    # too close to resolution
    p = estimate_true_probability(market, p_source, market_state)
    IF p is None: continue                     # cannot estimate → skip

    # Try YES side
    f_yes = kelly_fraction_of(p, market.yes_price, "yes")
    IF f_yes > 0:
        bet_usd = kelly_fraction * f_yes * assigned_capital
        size = int(bet_usd / market.yes_price)
        IF size >= 1:
            orders.append(Order(market, "yes", "buy", size, strategy_id="kelly-sizing"))
        continue

    # Try NO side
    f_no = kelly_fraction_of(p, market.yes_price, "no")
    IF f_no > 0:
        bet_usd = kelly_fraction * f_no * assigned_capital
        size = int(bet_usd / market.no_price)
        IF size >= 1:
            orders.append(Order(market, "no", "buy", size, strategy_id="kelly-sizing"))

RETURN orders
```

## on_fill(paper_fill) -> None
- Append fill to internal position log (bookkeeping only)
- No engine-visible side effects

## Verification checks
1. Zero edge market (p == market_price) → no orders
2. Edge > 0, kelly_fraction=0.25, assigned_capital=10000, market=0.5, p=0.7 → size ≈ 2000
3. orders contain strategy_id == "kelly-sizing"
4. on_fill does not raise on any valid PaperFill
