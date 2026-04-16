"""Sharpe ratio — annualized risk-adjusted return.

Pseudocode: pseudocode/sharpe_ratio.pseudo.md
Contract refs: MET-02, QU-R-004, QU-R-005, QU-R-020.
"""

import math
import statistics
from collections.abc import Sequence


def sharpe_ratio(
    returns: Sequence[float],
    risk_free_rate: float = 0.0,
    annualization_factor: int = 252,
) -> float | None:
    """Return annualized Sharpe ratio, or None if undefined.

    Args:
        returns: per-period returns (e.g., daily). Need >= 2 observations.
        risk_free_rate: per-period risk-free rate (default 0 for paper).
        annualization_factor: periods per year (252 trading days by default).

    Returns:
        Sharpe ratio, or None when stdev is undefined (< 2 returns or zero variance).
    """
    if len(returns) < 2:
        return None
    if annualization_factor <= 0:
        raise ValueError(f"annualization_factor must be > 0, got {annualization_factor}")
    excess = [r - risk_free_rate for r in returns]
    mean_excess = statistics.fmean(excess)
    sigma = statistics.stdev(excess)  # sample stdev, ddof=1
    if sigma == 0:
        return None
    return (mean_excess / sigma) * math.sqrt(annualization_factor)
