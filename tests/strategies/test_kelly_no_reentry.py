"""Regression test for the Kelly re-entry bug.

Before the fix, KellySizing re-sized each tick for markets where edge persisted,
compounding exposure to bankruptcy. Fix: track entered markets, skip re-entry
until a closing fill.
"""

from predmarkets.adapters.mock_adapter import MockAdapter
from predmarkets.engine.backtester import Backtester
from predmarkets.strategies.base import MarketView
from predmarkets.strategies.kelly_sizing import KellySizing


def _biased_oracle(market: MarketView) -> float:
    delta = 0.1 if market.yes_price > 0.5 else -0.1
    return max(0.02, min(0.98, market.yes_price + delta))


def test_kelly_does_not_reenter_same_market_within_run():
    """One backtest over N markets should produce at most N open entries."""
    adapter = MockAdapter(seed=7)
    events = adapter.stream_events(n_markets=3, ticks_per_market=50)
    strategy = KellySizing(p_oracle=_biased_oracle, assigned_capital=10_000.0)
    Backtester(bankroll=10_000.0).run(events, strategy)

    # Unique (platform, market_id) pairs across all fills <= number of markets
    touched = {(f.platform, f.market_id) for f in strategy._fills}
    # No more than one BUY fill per market per side
    by_market_side = {}
    for f in strategy._fills:
        key = (f.platform, f.market_id, f.side)
        by_market_side[key] = by_market_side.get(key, 0) + 1
    for key, n in by_market_side.items():
        assert n == 1, f"Strategy re-entered {key}: {n} fills"
    assert len(touched) <= 3  # 3 mock markets


def test_kelly_does_not_bankrupt_on_persistent_edge():
    adapter = MockAdapter(seed=1)
    events = adapter.stream_events(n_markets=3, ticks_per_market=40)
    strategy = KellySizing(p_oracle=_biased_oracle, assigned_capital=10_000.0)
    result = Backtester(bankroll=10_000.0).run(events, strategy)
    # Bankruptcy means equity went <= 0 during replay. With the fix + quarter-Kelly
    # across 3 independent markets, this should not happen.
    assert not result.bankrupt, f"strategy went bankrupt with final equity {result.final_equity}"
    assert 0 <= result.drawdown <= 1.0, f"drawdown out of [0,1]: {result.drawdown}"
