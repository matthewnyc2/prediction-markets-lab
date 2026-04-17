"""Contrarian underdog — buy YES when implied prob is low and close is imminent.

Theory: markets pricing a YES below 30% in the final hours before resolution
systematically underprice underdogs due to risk aversion / narrative momentum.
Buy YES; if the market resolves YES, the payoff is ≥ 3.33x the entry.
"""

from dataclasses import dataclass, field

from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.strategies.base import MarketState, MarketView, Strategy

MarketKey = tuple[str, str]


@dataclass(slots=True)
class ContrarianUnderdog(Strategy):
    max_yes_price: float = 0.30            # only buy when YES < this
    window_hours: float = 3.0              # only in last N hours before close
    bet_fraction: float = 0.05             # 5% of capital per entry
    assigned_capital: float = 10_000.0
    strategy_id: str = "contrarian-underdog"
    display_name: str = "Contrarian underdog"
    _entered: set[MarketKey] = field(default_factory=set)
    _fills: list[PaperFill] = field(default_factory=list)

    def decide(self, market_state: MarketState) -> list[Order]:
        orders: list[Order] = []
        for market in market_state.markets:
            key = (market.platform, market.market_id)
            if key in self._entered:
                continue
            if market.close_in_hours > self.window_hours or market.close_in_hours <= 0:
                continue
            if market.yes_price > self.max_yes_price:
                continue
            order = self._build_order(market)
            if order is not None:
                orders.append(order)
        return orders

    def on_fill(self, fill: PaperFill) -> None:
        self._fills.append(fill)
        self._entered.add((fill.platform, fill.market_id))

    def _build_order(self, market: MarketView) -> Order | None:
        price = market.yes_price
        if price <= 0:
            return None
        bet_usd = self.bet_fraction * self.assigned_capital
        size = int(bet_usd / price)
        if size < 1:
            return None
        return Order(
            platform=market.platform,
            market_id=market.market_id,
            side="yes",
            order_side="buy",
            size=size,
            strategy_id=self.strategy_id,
        )
