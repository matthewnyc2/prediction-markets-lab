"""MarketEvent — a single replayable tick of market state at a point in time."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


@dataclass(frozen=True, slots=True)
class MarketEvent:
    """One chronological market-data event replayed by the engine."""

    timestamp: datetime
    platform: str
    market_id: str
    market_title: str
    yes_price: float
    book_top_size: int
    event_type: Literal["tick", "resolution"]
    resolution: Literal["yes", "no", "cancelled", ""] = ""
    close_in_hours: float = 24.0

    def __post_init__(self) -> None:
        if not 0.0 <= self.yes_price <= 1.0:
            raise ValueError(f"yes_price must be in [0,1], got {self.yes_price}")
        if self.book_top_size < 0:
            raise ValueError(f"book_top_size must be >= 0, got {self.book_top_size}")

    @property
    def no_price(self) -> float:
        """NO price under paired-binary convention (YES + NO = 1)."""
        return 1.0 - self.yes_price
