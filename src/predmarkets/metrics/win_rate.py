"""Win rate — fraction of eligible closed positions that were profitable.

Pseudocode: pseudocode/win_rate.pseudo.md
Contract refs: MET-05, OQ-03 (cancelled excluded).
"""

from collections.abc import Sequence


def win_rate(closed_positions: Sequence[tuple[float, bool]]) -> float | None:
    """Return fraction of profitable closed positions.

    Args:
        closed_positions: tuples of (realised_pnl, was_cancelled).

    Returns:
        Fraction in [0, 1], or None if no eligible positions.

    Notes:
        Cancelled positions excluded (OQ-03). Tie pnl=0 counts as LOSS (conservative).
    """
    eligible = [pnl for pnl, cancelled in closed_positions if not cancelled]
    if len(eligible) == 0:
        return None
    wins = sum(1 for pnl in eligible if pnl > 0)
    return wins / len(eligible)
