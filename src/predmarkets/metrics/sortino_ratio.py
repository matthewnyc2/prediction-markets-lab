"""Sortino ratio — downside-adjusted risk-adjusted return.

Pseudocode: pseudocode/sortino_ratio.pseudo.md
Contract refs: MET-03, QU-R-007, QU-R-020.
"""

import math
import statistics
from collections.abc import Sequence


def sortino_ratio(
    returns: Sequence[float],
    target_return: float = 0.0,
    annualization_factor: int = 252,
) -> float | None:
    """Return annualized Sortino ratio, or None if undefined.

    Args:
        returns: per-period returns.
        target_return: minimum acceptable return (default 0 = don't lose money).
        annualization_factor: periods per year (default 252).

    Returns:
        Sortino ratio, or None when no downside observed or insufficient data.
    """
    if len(returns) < 2:
        return None
    if annualization_factor <= 0:
        raise ValueError(f"annualization_factor must be > 0, got {annualization_factor}")
    excess = [r - target_return for r in returns]
    mean_excess = statistics.fmean(excess)
    downside_sq = [min(0.0, e) ** 2 for e in excess]
    downside_var = sum(downside_sq) / len(downside_sq)
    if downside_var == 0:
        return None
    downside_dev = math.sqrt(downside_var)
    return (mean_excess / downside_dev) * math.sqrt(annualization_factor)
