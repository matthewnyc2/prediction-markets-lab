"""Kelly-sizing strategy — sizes proportional to edge over cross-platform mean.

Pseudocode: pseudocode/kelly_strategy.pseudo.md
Contract refs: STR-01, OQ-04 (p_source=cross-platform-mean).

Bug fix 2026-04-16: track entered markets so we don't re-bet the same market
each tick. Original implementation re-applied Kelly per tick → compounded
exposure → bankruptcy. Now a market is entered once per direction; subsequent
ticks on the same market are skipped until the position closes.
"""

from dataclasses import dataclass, field
from typing import Literal

from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.metrics.kelly_fraction import kelly_fraction
from predmarkets.strategies.base import MarketState, MarketView, Strategy

MarketKey = tuple[str, str]  # (platform, market_id)


@dataclass(slots=True)
class KellySizing(Strategy):
    """Quarter-Kelly by default. p estimated via injected oracle."""

    kelly_fraction_multiplier: float = 0.25
    assigned_capital: float = 10_000.0
    p_oracle: "object | None" = None
    min_close_hours: float = 1.0
    strategy_id: str = "kelly-sizing"
    display_name: str = "Kelly sizing"
    _fills: list[PaperFill] = field(default_factory=list)
    _entered_markets: set[MarketKey] = field(default_factory=set)

    def decide(self, market_state: MarketState) -> list[Order]:
        orders: list[Order] = []
        for market in market_state.markets:
            key = (market.platform, market.market_id)
            if key in self._entered_markets:
                continue
            if market.close_in_hours < self.min_close_hours:
                continue
            p = self._estimate_probability(market)
            if p is None:
                continue
            order = self._maybe_order(market, p, "yes") or self._maybe_order(market, p, "no")
            if order is not None:
                orders.append(order)
        return orders

    def on_fill(self, fill: PaperFill) -> None:
        self._fills.append(fill)
        self._entered_markets.add((fill.platform, fill.market_id))

    def _estimate_probability(self, market: MarketView) -> float | None:
        if self.p_oracle is None:
            return None
        return self.p_oracle(market)  # type: ignore[operator]

    def _maybe_order(self, market: MarketView, p: float, side: Literal["yes", "no"]) -> Order | None:
        price = market.yes_price if side == "yes" else market.no_price
        f_star = kelly_fraction(p, market.yes_price, side)
        if f_star <= 0 or price <= 0:
            return None
        bet_usd = self.kelly_fraction_multiplier * f_star * self.assigned_capital
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
