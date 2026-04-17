"""Closing-momentum strategy — ride trends in the final hours before close.

Contract refs: STR-03 (feature-discoveries.strategy_specs).

Rules:
  - Only active within the closing window (default last 6 hours).
  - Requires cumulative momentum above a threshold (default 5%) within the window.
  - Enters once per market per direction.
  - One fixed-fraction bet sized against assigned_capital (not full Kelly).

This is a SECOND reference implementation for strategy authoring — see also
`kelly_sizing.py`. Claude may pattern-match off either when writing new
strategies from a user's description.
"""

from dataclasses import dataclass, field
from typing import Literal

from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.strategies.base import MarketState, MarketView, Strategy

MarketKey = tuple[str, str]  # (platform, market_id)


@dataclass(slots=True)
class ClosingMomentum(Strategy):
    """Buys YES when price has risen above threshold in the window, NO when below."""

    window_hours: float = 6.0
    momentum_threshold: float = 0.05  # 5% move to trigger
    bet_fraction: float = 0.05  # 5% of assigned_capital per entry
    assigned_capital: float = 10_000.0
    strategy_id: str = "closing-momentum"
    display_name: str = "Closing momentum"
    _entered: set[MarketKey] = field(default_factory=set)
    _window_open_price: dict[MarketKey, float] = field(default_factory=dict)
    _fills: list[PaperFill] = field(default_factory=list)

    def decide(self, market_state: MarketState) -> list[Order]:
        orders: list[Order] = []
        for market in market_state.markets:
            key = (market.platform, market.market_id)
            if key in self._entered:
                continue
            if market.close_in_hours > self.window_hours or market.close_in_hours <= 0:
                continue
            anchor = self._window_open_price.setdefault(key, market.yes_price)
            order = self._decide_one(market, anchor, key)
            if order is not None:
                orders.append(order)
        return orders

    def on_fill(self, fill: PaperFill) -> None:
        self._fills.append(fill)
        self._entered.add((fill.platform, fill.market_id))

    def _decide_one(self, market: MarketView, anchor: float, key: MarketKey) -> Order | None:
        if anchor <= 0:
            return None
        momentum = (market.yes_price - anchor) / anchor
        if momentum >= self.momentum_threshold:
            return self._build_order(market, "yes")
        if momentum <= -self.momentum_threshold:
            return self._build_order(market, "no")
        return None

    def _build_order(self, market: MarketView, side: Literal["yes", "no"]) -> Order | None:
        price = market.yes_price if side == "yes" else market.no_price
        if price <= 0:
            return None
        bet_usd = self.bet_fraction * self.assigned_capital
        size = int(bet_usd / price)
        if size < 1:
            return None
        return Order(
            platform=market.platform,
            market_id=market.market_id,
            side=side,
            order_side="buy",
            size=size,
            strategy_id=self.strategy_id,
        )
