"""Strategy ABC and MarketState/MarketView value objects.

Pseudocode: pseudocode/strategy_interface.pseudo.md
Contract refs: tech-stack.json.strategy_plugin_interface.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill


@dataclass(frozen=True, slots=True)
class MarketView:
    """Immutable snapshot of one market at decide() time."""

    platform: str
    market_id: str
    market_title: str
    yes_price: float
    no_price: float
    close_in_hours: float


@dataclass(frozen=True, slots=True)
class MarketState:
    """Snapshot of all markets visible to a strategy at one timestamp."""

    timestamp: datetime
    markets: list[MarketView]


class Strategy(ABC):
    """Plugin base. Subclasses live in strategies/*.py and auto-register."""

    strategy_id: str = ""
    display_name: str = ""

    @abstractmethod
    def decide(self, market_state: MarketState) -> list[Order]:
        """Return zero or more orders to submit. Must be pure (no I/O)."""

    @abstractmethod
    def on_fill(self, fill: PaperFill) -> None:
        """Called after each fill produced by this strategy's orders."""
