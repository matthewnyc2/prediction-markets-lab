# sharpe_ratio — pseudocode

Contract derivation: MET-02, QU-R-004, QU-R-005 (zero-sigma guard), QU-R-020 (rf=0 default).

## Inputs
- returns: list[float] — daily return rates (e.g., 0.01 for +1%)
- risk_free_rate: float — per-period; default 0.0
- annualization_factor: int — default 252 (trading-day convention)

## Outputs
- sharpe: float | None

## Preconditions
- returns has >= 2 elements (stdev undefined otherwise → None)
- annualization_factor > 0

## Algorithm

```
IF length(returns) < 2:
    RETURN None
excess = [r - risk_free_rate for r in returns]
mean_excess = mean(excess)
sigma = stdev(excess, ddof=1)
IF sigma == 0:
    RETURN None   # zero volatility — undefined
RETURN (mean_excess / sigma) * sqrt(annualization_factor)
```

## Postconditions
- Returns None when variance is zero or insufficient data
- Annualized per the factor (252 trading days OR 365 for 24/7 markets)
- Symmetric: negating all returns negates the sharpe

## Verification checks
1. Returns None on 0 or 1 return
2. Returns None when all returns are identical (sigma = 0)
3. Returns positive value when mean_excess > 0
4. sqrt(252) scaling applied
