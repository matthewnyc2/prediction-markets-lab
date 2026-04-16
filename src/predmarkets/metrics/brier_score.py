"""Brier score — mean squared error between probability forecast and binary outcome.

Pseudocode: pseudocode/brier_score.pseudo.md
Contract refs: MET-01, QU-R-005, INV-010, OQ-02, OQ-03.
"""

from collections.abc import Sequence


def brier_score(forecasts: Sequence[float], outcomes: Sequence[int]) -> float | None:
    """Return mean squared error between forecasts and binary outcomes.

    Args:
        forecasts: entry-price probabilities in [0, 1], one per closed paper-position
        outcomes: binary 0/1, one per forecast (1 if position won, 0 if lost)

    Returns:
        Brier score in [0, 1], or None if inputs are empty.

    Raises:
        ValueError: on length mismatch or out-of-range values.
    """
    if len(forecasts) != len(outcomes):
        raise ValueError(
            f"forecasts and outcomes length mismatch: {len(forecasts)} vs {len(outcomes)}"
        )
    if len(forecasts) == 0:
        return None
    for f in forecasts:
        if not 0.0 <= f <= 1.0:
            raise ValueError(f"forecast out of [0,1]: {f}")
    for o in outcomes:
        if o not in (0, 1):
            raise ValueError(f"outcome not binary 0/1: {o}")

    squared = [(f - o) * (f - o) for f, o in zip(forecasts, outcomes, strict=True)]
    return sum(squared) / len(squared)
