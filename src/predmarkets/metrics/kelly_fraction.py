"""Kelly fraction — optimal fraction of bankroll to bet given edge.

Pseudocode: pseudocode/kelly_fraction.pseudo.md
Contract refs: STR-01, feature-discoveries.strategy_specs.
"""

from typing import Literal


def kelly_fraction(p: float, market_price: float, side: Literal["yes", "no"]) -> float:
    """Return full-Kelly fraction for a binary prediction-market bet.

    Args:
        p: strategy's estimated true probability in [0, 1].
        market_price: current yes-price in (0, 1) (exclusive of endpoints).
        side: "yes" or "no".

    Returns:
        f_star in [0, 1]. Returns 0 when no edge, wrong side, or degenerate prices.
    """
    if not 0.0 <= p <= 1.0:
        raise ValueError(f"p must be in [0,1], got {p}")
    if market_price <= 0.0 or market_price >= 1.0:
        return 0.0
    if side not in ("yes", "no"):
        raise ValueError(f"side must be 'yes' or 'no', got {side!r}")

    if side == "yes":
        b = (1.0 - market_price) / market_price
        edge = p - market_price
    else:
        p_no = 1.0 - p
        b = market_price / (1.0 - market_price)
        edge = p_no - (1.0 - market_price)

    if edge <= 0:
        return 0.0
    f_star = (b * (p if side == "yes" else 1.0 - p) - (1.0 - (p if side == "yes" else 1.0 - p))) / b
    return max(0.0, min(1.0, f_star))
