"""Kelly-sizing strategy — sizes proportional to edge over cross-platform mean.

Pseudocode: pseudocode/kelly_strategy.pseudo.md
Contract refs: STR-01, OQ-04 (p_source=cross-platform-mean).
"""

from dataclasses import dataclass, field
from typing import Literal

from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.metrics.kelly_fraction import kelly_fraction
from predmarkets.strategies.base import MarketState, MarketView, Strategy


@dataclass(slots=True)
class KellySizing(Strategy):
    """Quarter-Kelly by default. p estimated from cross-platform mean.

    Because this single-session backtest uses one platform at a time, the
    p_source defaults to an injected oracle function that, in tests, returns
    a fixed true probability. Production will swap in cross-platform-mean.
    """

    kelly_fraction_multiplier: float = 0.25
    assigned_capital: float = 10_000.0
    # In absence of cross-platform data within a single-platform backtest,
    # the oracle callback is injected by the runner/test. Default: market_price.
    p_oracle: "object | None" = None  # Callable[[MarketView], float|None]
    min_close_hours: float = 1.0
    strategy_id: str = "kelly-sizing"
    display_name: str = "Kelly sizing"
    _fills: list[PaperFill] = field(default_factory=list)

    def decide(self, market_state: MarketState) -> list[Order]:
        orders: list[Order] = []
        for market in market_state.markets:
            if market.close_in_hours < self.min_close_hours:
                continue
            p = self._estimate_probability(market)
            if p is None:
                continue
            order = self._maybe_order(market, p, "yes")
            if order is not None:
                orders.append(order)
                continue
            order = self._maybe_order(market, p, "no")
            if order is not None:
                orders.append(order)
        return orders

    def on_fill(self, fill: PaperFill) -> None:
        self._fills.append(fill)

    def _estimate_probability(self, market: MarketView) -> float | None:
        if self.p_oracle is None:
            return None  # no edge estimable → skip
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
