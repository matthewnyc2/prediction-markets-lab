# pandas / numpy / scipy — Tech KB (backtesting / quant)

**Version pinning**: `pandas@2.2.x`, `numpy@1.26.x` or `2.1.x`, `scipy@1.14.x`. All compatible with Python 3.12.

> pandas 2.2 defaults NumPy backend; pyarrow backend optional. NumPy 2.x is ABI-breaking; only use if all deps support it.

## 1. Core patterns for this project

- Price series → `pandas.Series` indexed by `DatetimeIndex` (UTC)
- Returns → log or simple, vectorised `.pct_change()` or `np.log().diff()`
- Rolling stats → `.rolling(window).mean()/.std()/.apply()`
- Risk metrics → Sharpe, Sortino, max drawdown
- Forecast quality → Brier score, log loss
- Position sizing → Kelly fraction

## 2. Code examples

### Example 1 — Load ticks → resample → returns

```python
import pandas as pd
import numpy as np

def load_ticks(ticks: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(ticks)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    df = df.set_index("ts").sort_index()
    return df  # columns: yes, no

def resample_ohlc(prices: pd.Series, rule: str = "1min") -> pd.DataFrame:
    return prices.resample(rule).ohlc()

def log_returns(prices: pd.Series) -> pd.Series:
    return np.log(prices / prices.shift(1)).dropna()
```

### Example 2 — Sharpe ratio (annualised)

```python
def sharpe(returns: pd.Series, rf: float = 0.0, periods_per_year: int = 252) -> float:
    excess = returns - rf / periods_per_year
    mu, sigma = excess.mean(), excess.std(ddof=1)
    if sigma == 0 or np.isnan(sigma):
        return 0.0
    return float(np.sqrt(periods_per_year) * mu / sigma)
```

### Example 3 — Sortino ratio

```python
def sortino(returns: pd.Series, rf: float = 0.0, periods_per_year: int = 252) -> float:
    excess = returns - rf / periods_per_year
    downside = excess[excess < 0]
    dd = np.sqrt((downside ** 2).mean())
    if dd == 0 or np.isnan(dd):
        return 0.0
    return float(np.sqrt(periods_per_year) * excess.mean() / dd)
```

### Example 4 — Max drawdown

```python
def max_drawdown(equity: pd.Series) -> tuple[float, pd.Timestamp, pd.Timestamp]:
    cummax = equity.cummax()
    dd = (equity / cummax) - 1.0
    trough = dd.idxmin()
    peak = equity.loc[:trough].idxmax()
    return float(dd.min()), peak, trough
```

### Example 5 — Brier score (prediction quality)

```python
def brier_score(forecasts: pd.Series, outcomes: pd.Series) -> float:
    """
    forecasts: predicted YES probability ∈ [0,1]
    outcomes: realized YES/NO as 1/0
    """
    f = forecasts.to_numpy(dtype=float)
    o = outcomes.to_numpy(dtype=float)
    return float(np.mean((f - o) ** 2))

def brier_skill_score(forecasts, outcomes, climatology: float | None = None) -> float:
    c = outcomes.mean() if climatology is None else climatology
    bs = brier_score(forecasts, outcomes)
    bs_ref = brier_score(pd.Series(np.full(len(outcomes), c)), outcomes)
    if bs_ref == 0:
        return 0.0
    return float(1 - bs / bs_ref)
```

### Example 6 — Kelly fraction

```python
def kelly_fraction(p_win: float, b: float) -> float:
    """
    p_win: probability of winning
    b: net odds received on the wager (win_amount / stake)
    Returns clamped [0, 1] Kelly fraction.
    """
    q = 1 - p_win
    if b <= 0:
        return 0.0
    f = (b * p_win - q) / b
    return max(0.0, min(1.0, f))

# Vectorised on a DataFrame of (p, b)
def kelly_vec(df: pd.DataFrame) -> pd.Series:
    p, q, b = df["p"].to_numpy(), 1 - df["p"].to_numpy(), df["b"].to_numpy()
    with np.errstate(divide="ignore", invalid="ignore"):
        f = np.where(b > 0, (b * p - q) / b, 0.0)
    return pd.Series(np.clip(f, 0.0, 1.0), index=df.index)
```

### Example 7 — Rolling volatility + z-score for momentum trigger

```python
def rolling_zscore(series: pd.Series, window: int = 60) -> pd.Series:
    mu = series.rolling(window).mean()
    sd = series.rolling(window).std(ddof=1)
    return (series - mu) / sd.replace(0, np.nan)
```

### Example 8 — News-spike detection (vectorised)

```python
def news_spikes(prices: pd.Series, trigger_pct: float = 0.10, window_min: int = 15) -> pd.Series:
    """Return boolean Series marking news-spike events per project defaults."""
    window = f"{window_min}min"
    change = prices.pct_change(window).abs()
    return change >= trigger_pct
```

### Example 9 — scipy: t-test for strategy vs buy-hold

```python
from scipy import stats

def mean_return_ttest(strategy_ret: pd.Series, benchmark_ret: pd.Series) -> dict:
    t, p = stats.ttest_ind(strategy_ret.dropna(), benchmark_ret.dropna(), equal_var=False)
    return {"t": float(t), "p_value": float(p)}
```

### Example 10 — Equity curve builder

```python
def build_equity_curve(fills: pd.DataFrame, starting_bankroll: float = 10_000.0) -> pd.Series:
    """
    fills: columns [ts, pnl]
    """
    fills = fills.sort_values("ts")
    equity = starting_bankroll + fills["pnl"].cumsum()
    return equity.set_axis(fills["ts"]).rename("equity")
```

## 3. Gotchas / pitfalls

- **Timezones**: always construct DatetimeIndex with `utc=True`. Mixing naive and aware breaks joins.
- **`.rolling(window)` returns NaN for first `window-1`**; use `.dropna()` or `min_periods=1`.
- **`pct_change()` is simple returns**, not log; for compounding use `np.log(...)`.
- **`ddof=1`** is sample std — match finance convention (Excel's STDEV).
- **`isna` vs `isnan`**: NumPy's `np.isnan` rejects object dtype; use `pd.isna` for mixed series.
- **Chained assignment (`df[col][mask] = v`)** often silently fails. Use `df.loc[mask, col] = v`.
- **NumPy 2.x**: `np.cast` removed, `np.float_` removed (use `np.float64`). Verify all transitive deps support NumPy 2 before upgrading; safer to pin `numpy<2.0` for now unless you've confirmed.
- **scipy.stats**: returns are NaN if any input is NaN — always `.dropna()` first.
- **Don't iterate rows (`iterrows`)** for >1k rows — vectorise with `.to_numpy()` and np ops.

## 4. Performance tips

- `df.to_numpy()` once, operate on arrays, convert back.
- `pd.eval("a + b * c")` can speed very large ops but adds parse overhead.
- Use `astype("float32")` for price arrays when precision allows — halves memory.
- Group + apply: prefer `groupby(...).agg({...})` over `.apply(lambda)`.

## 5. Version compatibility

| Tool | Version | Notes |
| --- | --- | --- |
| pandas | ^2.2 | NumPy backend default |
| numpy | ^1.26 (safe) or ^2.1 | pin 1.26 unless all deps on 2.x |
| scipy | ^1.14 | needs numpy ^1.26 or ^2 |
| pyarrow | ^16 (optional) | enables Arrow-backed dtypes |
| python | 3.12 | declared |
