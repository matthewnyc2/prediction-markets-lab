"""Smoke test for Backtester — proves TS-02 (backtest produces scored results)."""

from predmarkets.adapters.mock_adapter import MockAdapter
from predmarkets.engine.backtester import Backtester
from predmarkets.strategies.kelly_sizing import KellySizing
from predmarkets.strategies.base import MarketView


def informed_oracle(market: MarketView) -> float:
    # slight bias toward current mid ± 0.08 — mimics mild edge
    delta = 0.08 if market.yes_price > 0.5 else -0.08
    return max(0.02, min(0.98, market.yes_price + delta))


def test_backtest_completes_and_produces_scored_results_ts02():
    adapter = MockAdapter(seed=42)
    events = adapter.stream_events(n_markets=3, ticks_per_market=30)
    strategy = KellySizing(
        kelly_fraction_multiplier=0.25,
        assigned_capital=10_000.0,
        p_oracle=informed_oracle,
    )
    result = Backtester(bankroll=10_000.0).run(events, strategy)

    # TS-02 signals:
    assert result.final_equity > 0
    assert len(result.equity_curve) >= 2
    # Metrics computed (any may be None if insufficient data, but never crash)
    assert result.drawdown >= 0.0
    # At least some trades should have happened
    assert len(result.trade_list) > 0
    # Did NOT reach a real trading api — proven by design (no network code imported)


def test_backtest_with_no_strategy_bets_is_stable():
    class Passive(KellySizing):
        def decide(self, market_state):  # noqa: D401
            return []

    adapter = MockAdapter(seed=1)
    events = adapter.stream_events(n_markets=1, ticks_per_market=10)
    strategy = Passive(p_oracle=lambda m: 0.5)
    result = Backtester(bankroll=5000.0).run(events, strategy)

    assert result.final_equity == 5000.0
    assert len(result.trade_list) == 0
    assert not result.bankrupt
