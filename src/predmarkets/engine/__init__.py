"""Event-driven backtest + live-paper-trading engine."""

from predmarkets.engine.backtester import Backtester, BacktestResult
from predmarkets.engine.market_event import MarketEvent
from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.engine.portfolio import Portfolio, PositionRecord
from predmarkets.engine.slippage_model import slippage_fill_price

__all__ = [
    "Backtester",
    "BacktestResult",
    "MarketEvent",
    "Order",
    "PaperFill",
    "Portfolio",
    "PositionRecord",
    "slippage_fill_price",
]
