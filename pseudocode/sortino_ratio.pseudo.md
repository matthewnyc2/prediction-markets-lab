# sortino_ratio — pseudocode

Contract derivation: MET-03, QU-R-007, QU-R-020.

## Inputs
- returns: list[float]
- target_return: float — minimum acceptable return; default 0.0
- annualization_factor: int — default 252

## Outputs
- sortino: float | None

## Algorithm
```
IF length(returns) < 2: RETURN None
excess = [r - target_return for r in returns]
mean_excess = mean(excess)
downside = [min(0, e) for e in excess]
downside_variance = mean(d*d for d in downside)
IF downside_variance == 0: RETURN None  # no downside — undefined
downside_deviation = sqrt(downside_variance)
RETURN (mean_excess / downside_deviation) * sqrt(annualization_factor)
```

## Verification checks
1. Returns None when no downside returns observed
2. Returns None when <2 returns
3. Penalizes only negative returns (upside volatility excluded)
4. sqrt(252) annualization applied
