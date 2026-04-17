"""Backtester — event-driven replay over stored-price-history (INV-006, TS-02)."""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime

from predmarkets.engine.market_event import MarketEvent
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.engine.portfolio import Portfolio, PositionRecord
from predmarkets.engine.slippage_model import slippage_fill_price
from predmarkets.metrics import (
    brier_score,
    max_drawdown,
    sharpe_ratio,
    sortino_ratio,
    win_rate,
)
from predmarkets.strategies.base import MarketState, MarketView, Strategy


@dataclass(slots=True)
class BacktestResult:
    """TS-02 result shape."""

    final_equity: float
    equity_curve: list[tuple[datetime, float]]
    trade_list: list[PaperFill]
    closed_positions: list[PositionRecord] = field(default_factory=list)
    sharpe: float | None = None
    sortino: float | None = None
    brier: float | None = None
    drawdown: float = 0.0
    win_rate_value: float | None = None
    bankrupt: bool = False


class Backtester:
    """Runs the engine over an event iterable and a single strategy."""

    def __init__(self, bankroll: float) -> None:
        self.bankroll = bankroll

    def run(self, events: Iterable[MarketEvent], strategy: Strategy) -> BacktestResult:
        portfolio = Portfolio(starting_bankroll=self.bankroll)
        equity_curve: list[tuple[datetime, float]] = []
        latest: dict[tuple[str, str], float] = {}
        bankrupt = False

        for event in events:
            equity_now = self._mark_equity(portfolio, latest)
            if equity_now <= 0:
                bankrupt = True
                equity_curve.append((event.timestamp, 0.0))
                break
            latest[(event.platform, event.market_id)] = event.yes_price
            state = self._build_state(event)
            for order in strategy.decide(state):
                fill = self._execute(event, order, order.size)
                if portfolio.apply_fill(fill):
                    strategy.on_fill(fill)
            if event.event_type == "resolution":
                portfolio.settle_resolution(event.platform, event.market_id, event.resolution or "cancelled")
            equity_curve.append((event.timestamp, self._mark_equity(portfolio, latest)))

        return self._finalize(portfolio, equity_curve, bankrupt)

    @staticmethod
    def _mark_equity(portfolio: Portfolio, latest: dict[tuple[str, str], float]) -> float:
        mark_prices: dict[tuple[str, str, str], float] = {}
        for key, pos in portfolio.positions.items():
            if pos.closed:
                continue
            plat_mid = latest.get((pos.platform, pos.market_id), pos.avg_entry)
            mark_prices[key] = plat_mid if pos.side == "yes" else 1.0 - plat_mid
        return portfolio.equity_at(mark_prices)

    @staticmethod
    def _build_state(event: MarketEvent) -> MarketState:
        market = MarketView(
            platform=event.platform,
            market_id=event.market_id,
            market_title=event.market_title,
            yes_price=event.yes_price,
            no_price=event.no_price,
            close_in_hours=event.close_in_hours,
        )
        return MarketState(timestamp=event.timestamp, markets=[market])

    @staticmethod
    def _execute(event: MarketEvent, order, size: int) -> PaperFill:  # noqa: ANN001
        mid = event.yes_price if order.side == "yes" else event.no_price
        if mid <= 0.0 or mid >= 1.0:
            mid = max(0.01, min(0.99, mid))
        fill_price = slippage_fill_price(mid, size, order.order_side, event.book_top_size)
        return PaperFill(
            timestamp=event.timestamp,
            platform=order.platform,
            market_id=order.market_id,
            side=order.side,
            order_side=order.order_side,
            size=size,
            fill_price=fill_price,
            strategy_id=order.strategy_id,
        )

    @staticmethod
    def _finalize(
        portfolio: Portfolio,
        equity_curve: list[tuple[datetime, float]],
        bankrupt: bool,
    ) -> BacktestResult:
        equity_values = [v for _, v in equity_curve]
        daily_returns = [
            (equity_values[i] / equity_values[i - 1] - 1.0)
            for i in range(1, len(equity_values))
            if equity_values[i - 1] > 0
        ]
        forecasts: list[float] = []
        outcomes: list[int] = []
        for pos in portfolio.closed_positions:
            if pos.was_cancelled:
                continue
            forecasts.append(pos.avg_entry if pos.side == "yes" else 1.0 - pos.avg_entry)
            outcomes.append(1 if pos.realised_pnl > 0 else 0)
        return BacktestResult(
            final_equity=equity_values[-1] if equity_values else portfolio.cash,
            equity_curve=equity_curve,
            trade_list=list(portfolio.all_fills),
            closed_positions=list(portfolio.closed_positions),
            sharpe=sharpe_ratio(daily_returns),
            sortino=sortino_ratio(daily_returns),
            brier=brier_score(forecasts, outcomes) if forecasts else None,
            drawdown=max_drawdown(equity_values),
            win_rate_value=win_rate([(p.realised_pnl, p.was_cancelled) for p in portfolio.closed_positions]),
            bankrupt=bankrupt,
        )
