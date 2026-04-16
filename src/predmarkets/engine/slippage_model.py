"""Slippage model — derive paper-fill price from current market mid-price.

Pseudocode: pseudocode/slippage_model.pseudo.md
Contract refs: disambiguated.slippage-model, ENG-01.
"""

import math
from typing import Literal


def slippage_fill_price(
    mid_price: float,
    order_size: int,
    order_side: Literal["buy", "sell"],
    book_top_size: int,
) -> float:
    """Return the fill price a paper-fill would receive from the slippage model.

    Args:
        mid_price: current market mid in (0, 1).
        order_size: contracts requested, > 0.
        order_side: "buy" or "sell".
        book_top_size: depth at top-of-book on aggressor side, >= 1.

    Returns:
        fill_price clamped to [0, 1].
    """
    if not 0.0 < mid_price < 1.0:
        raise ValueError(f"mid_price must be in (0, 1), got {mid_price}")
    if order_size <= 0:
        raise ValueError(f"order_size must be > 0, got {order_size}")
    if order_side not in ("buy", "sell"):
        raise ValueError(f"order_side must be 'buy' or 'sell', got {order_side!r}")

    book_top = max(1, book_top_size)
    base_offset = 0.01
    fill = mid_price + base_offset if order_side == "buy" else mid_price - base_offset
    if order_size > book_top:
        excess_tiers = math.ceil((order_size - book_top) / book_top)
        extra = 0.01 * excess_tiers
        fill = fill + extra if order_side == "buy" else fill - extra
    return max(0.0, min(1.0, fill))
