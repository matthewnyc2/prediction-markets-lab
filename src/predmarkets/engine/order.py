"""Order — a strategy's intent to buy or sell a market side."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class Order:
    """Strategy order handed to the execution handler."""

    platform: str
    market_id: str
    side: Literal["yes", "no"]
    order_side: Literal["buy", "sell"]
    size: int
    strategy_id: str

    def __post_init__(self) -> None:
        if self.size <= 0:
            raise ValueError(f"order size must be > 0, got {self.size}")
        if self.side not in ("yes", "no"):
            raise ValueError(f"side must be 'yes' or 'no', got {self.side!r}")
        if self.order_side not in ("buy", "sell"):
            raise ValueError(f"order_side must be 'buy' or 'sell', got {self.order_side!r}")
