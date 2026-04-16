"""Tests for KellySizing strategy."""

from datetime import datetime

from predmarkets.strategies.base import MarketState, MarketView
from predmarkets.strategies.kelly_sizing import KellySizing


def _make_state(yes_price: float, close_hours: float = 24.0) -> MarketState:
    return MarketState(
        timestamp=datetime(2025, 1, 1, 12, 0),
        markets=[
            MarketView(
                platform="mock",
                market_id="m1",
                market_title="test",
                yes_price=yes_price,
                no_price=1.0 - yes_price,
                close_in_hours=close_hours,
            )
        ],
    )


def test_no_oracle_no_orders():
    strategy = KellySizing(p_oracle=None)
    assert strategy.decide(_make_state(0.5)) == []


def test_no_edge_no_orders():
    # oracle returns exactly market price → no edge → no order
    strategy = KellySizing(p_oracle=lambda m: m.yes_price)
    assert strategy.decide(_make_state(0.5)) == []


def test_positive_yes_edge_emits_buy_yes():
    strategy = KellySizing(p_oracle=lambda m: 0.75, assigned_capital=10_000.0)
    orders = strategy.decide(_make_state(0.5))
    assert len(orders) == 1
    o = orders[0]
    assert o.side == "yes"
    assert o.order_side == "buy"
    assert o.strategy_id == "kelly-sizing"
    assert o.size > 0


def test_close_in_hours_below_threshold_skips():
    strategy = KellySizing(p_oracle=lambda m: 0.9, min_close_hours=1.0)
    assert strategy.decide(_make_state(0.5, close_hours=0.5)) == []


def test_no_edge_yes_tries_no_side():
    # market thinks 0.5, we think 0.2 → NO has edge
    strategy = KellySizing(p_oracle=lambda m: 0.2, assigned_capital=10_000.0)
    orders = strategy.decide(_make_state(0.5))
    assert len(orders) == 1
    assert orders[0].side == "no"
