"""Prediction markets paper trader + backtester.

Primary entry points for Claude-driven experiments:

    from predmarkets import run_backtest, show_result, save_result
    from predmarkets import Strategy, MarketState, MarketView, Order, PaperFill
    from predmarkets import load_user_strategies

See CLAUDE.md for the strategy-authoring pattern.
"""

from predmarkets.api import run_backtest, save_result, show_result
from predmarkets.engine.market_event import MarketEvent
from predmarkets.engine.order import Order
from predmarkets.engine.paper_fill import PaperFill
from predmarkets.strategies.base import MarketState, MarketView, Strategy
from predmarkets.strategies.loader import load_user_strategies

__version__ = "0.2.0"

__all__ = [
    "MarketEvent",
    "MarketState",
    "MarketView",
    "Order",
    "PaperFill",
    "Strategy",
    "load_user_strategies",
    "run_backtest",
    "save_result",
    "show_result",
]
