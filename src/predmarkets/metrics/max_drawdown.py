"""Max drawdown — largest peak-to-trough decline in equity curve.

Pseudocode: pseudocode/max_drawdown.pseudo.md
Contract refs: MET-04, QU-R-006.
"""

from collections.abc import Sequence


def max_drawdown(equity_curve: Sequence[float]) -> float:
    """Return max drawdown as a positive fraction in [0, 1].

    Args:
        equity_curve: ordered equity values; non-negative.

    Returns:
        Fraction decline from running peak, e.g. 0.25 == 25% peak-to-trough drop.
        Returns 0.0 for empty, single-point, or monotonically non-decreasing input.
    """
    if len(equity_curve) == 0:
        return 0.0
    running_peak = equity_curve[0]
    max_dd = 0.0
    for v in equity_curve:
        if v > running_peak:
            running_peak = v
        if running_peak > 0:
            dd = (running_peak - v) / running_peak
            if dd > max_dd:
                max_dd = dd
    return max_dd
