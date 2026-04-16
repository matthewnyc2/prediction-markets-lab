"""PaperFill — a simulated execution of an order produced by the slippage model."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(frozen=True, slots=True)
class PaperFill:
    """Simulated execution. Never reaches a real trading API (INV-007)."""

    timestamp: datetime
    platform: str
    market_id: str
    side: Literal["yes", "no"]
    order_side: Literal["buy", "sell"]
    size: int
    fill_price: float
    strategy_id: str

    def __post_init__(self) -> None:
        if not 0.0 <= self.fill_price <= 1.0:
            raise ValueError(f"fill_price must be in [0,1], got {self.fill_price}")
        if self.size <= 0:
            raise ValueError(f"size must be > 0, got {self.size}")

    @property
    def cost(self) -> float:
        return self.fill_price * self.size
