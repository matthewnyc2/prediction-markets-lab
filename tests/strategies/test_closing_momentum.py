"""Tests for ClosingMomentum strategy."""

from datetime import datetime

from predmarkets.strategies.base import MarketState, MarketView
from predmarkets.strategies.closing_momentum import ClosingMomentum


def _state(yes: float, close_hours: float) -> MarketState:
    return MarketState(
        timestamp=datetime(2025, 1, 1, 12, 0),
        markets=[
            MarketView(
                platform="mock",
                market_id="m1",
                market_title="t",
                yes_price=yes,
                no_price=1.0 - yes,
                close_in_hours=close_hours,
            )
        ],
    )


def test_not_in_window_emits_nothing():
    s = ClosingMomentum(window_hours=6.0)
    assert s.decide(_state(0.5, close_hours=24.0)) == []


def test_first_tick_in_window_establishes_anchor_and_no_order_yet():
    s = ClosingMomentum(window_hours=6.0)
    assert s.decide(_state(0.5, close_hours=6.0)) == []


def test_momentum_up_triggers_buy_yes():
    s = ClosingMomentum(window_hours=6.0, momentum_threshold=0.05)
    # Anchor at first call
    s.decide(_state(0.50, close_hours=6.0))
    # Tick later — price up 10%
    orders = s.decide(_state(0.55, close_hours=5.5))
    assert len(orders) == 1
    assert orders[0].side == "yes"


def test_momentum_down_triggers_buy_no():
    s = ClosingMomentum(window_hours=6.0, momentum_threshold=0.05)
    s.decide(_state(0.60, close_hours=6.0))
    orders = s.decide(_state(0.55, close_hours=5.5))  # 8% drop
    assert len(orders) == 1
    assert orders[0].side == "no"


def test_does_not_reenter_after_fill():
    from predmarkets.engine.paper_fill import PaperFill

    s = ClosingMomentum(window_hours=6.0, momentum_threshold=0.01)
    s.decide(_state(0.50, close_hours=6.0))
    orders = s.decide(_state(0.55, close_hours=5.5))
    # simulate engine feeding the fill back
    for o in orders:
        s.on_fill(
            PaperFill(
                timestamp=datetime(2025, 1, 1, 13, 0),
                platform=o.platform, market_id=o.market_id,
                side=o.side, order_side=o.order_side, size=o.size,
                fill_price=0.55, strategy_id=s.strategy_id,
            )
        )
    # Next tick with even stronger momentum — should NOT emit another order
    assert s.decide(_state(0.60, close_hours=5.0)) == []
