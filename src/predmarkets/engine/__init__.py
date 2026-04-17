"""Event-driven backtest + live-paper-trading engine.

Import specific modules directly to avoid circular imports with strategies:
    from predmarkets.engine.backtester import Backtester, BacktestResult
    from predmarkets.engine.market_event import MarketEvent
    from predmarkets.engine.order import Order
    from predmarkets.engine.paper_fill import PaperFill
    from predmarkets.engine.portfolio import Portfolio
    from predmarkets.engine.slippage_model import slippage_fill_price
"""
