# win_rate — pseudocode

Contract derivation: MET-05.

## Inputs
- closed_positions: list[tuple[float, bool]] — (realised_pnl, was_cancelled)

## Outputs
- rate: float ∈ [0.0, 1.0] | None

## Algorithm
```
# Exclude cancelled per OQ-03 resolution
eligible = [pnl for (pnl, was_cancelled) in closed_positions if not was_cancelled]
IF length(eligible) == 0: RETURN None
wins = count(pnl for pnl in eligible if pnl > 0)   # tie == loss (conservative)
RETURN wins / length(eligible)
```

## Verification checks
1. Empty input → None
2. All-cancelled → None
3. (pnl=0, not cancelled) counts as a loss
4. 3 wins / 5 eligible → 0.6
