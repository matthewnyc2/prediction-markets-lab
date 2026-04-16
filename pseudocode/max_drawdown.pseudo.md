# max_drawdown — pseudocode

Contract derivation: MET-04, QU-R-006.

## Inputs
- equity_curve: list[float] — ordered equity values (non-negative)

## Outputs
- mdd: float — percent decline (0.0 to 1.0)

## Algorithm
```
IF length(equity_curve) == 0: RETURN 0.0
running_peak = equity_curve[0]
max_dd = 0.0
FOR v in equity_curve:
    IF v > running_peak: running_peak = v
    IF running_peak > 0:
        dd = (running_peak - v) / running_peak
        IF dd > max_dd: max_dd = dd
RETURN max_dd
```

## Postconditions
- result ∈ [0.0, 1.0]
- 0.0 for monotonically non-decreasing series
- Reflects the largest peak-to-trough decline, not current drawdown

## Verification checks
1. Returns 0 for [100, 110, 120] (monotone increase)
2. Returns 0.5 for [100, 50] (50% drawdown)
3. Returns 0.5 for [100, 50, 200, 100] — largest of any peak-to-trough
4. Handles zero and empty input without error
