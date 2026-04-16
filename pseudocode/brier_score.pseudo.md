# brier_score — pseudocode

Contract: `contracts/handle_backtest_brier.json` (inherits QU-R-*, MET-01, INV-010).

## Inputs
- forecasts: list[float] — entry prices from closed paper-fills, each ∈ [0, 1]
- outcomes: list[int]  — 0 or 1 per forecast (1 if position won, 0 if lost)

## Outputs
- brier: float ∈ [0, 1]

## Preconditions
- len(forecasts) == len(outcomes)
- len(forecasts) >= 1
- every forecast ∈ [0, 1]
- every outcome ∈ {0, 1}
- cancelled positions EXCLUDED from inputs per OQ-03

## Algorithm

```
IF length(forecasts) == 0:
    RETURN None      # undefined for empty

squared_errors = []
FOR i in range(length(forecasts)):
    e = forecasts[i] - outcomes[i]
    squared_errors.append(e * e)

RETURN mean(squared_errors)
```

## Postconditions
- result ∈ [0, 1]
- result == 0 IFF perfect calibration for all inputs
- result ~= 0.25 for coin-flip forecaster on fair outcomes

## Verification checks
1. Returns None on empty input (graceful, not exception)
2. Returns 0.0 when every forecast equals its outcome exactly
3. Returns 0.25 on (0.5, 0.5, 0.5, 0.5) forecasts with (1, 0, 1, 0) outcomes
4. Returns >0.25 on systematically wrong forecasts (overconfident wrong)
5. No divide-by-zero; no NaN if inputs are valid floats
