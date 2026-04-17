"""Portfolio regressions around cash handling."""

from datetime import UTC, datetime

from predmarkets.engine.paper_fill import PaperFill
from predmarkets.engine.portfolio import Portfolio


def test_portfolio_rejects_fill_that_exceeds_cash() -> None:
    portfolio = Portfolio(starting_bankroll=100.0)
    fill = PaperFill(
        timestamp=datetime.now(UTC),
        platform="mock",
        market_id="m1",
        side="yes",
        order_side="buy",
        size=200,
        fill_price=1.0,
        strategy_id="too-large",
    )

    applied = portfolio.apply_fill(fill)

    assert applied is False
    assert portfolio.cash == 100.0
    assert portfolio.positions == {}
    assert portfolio.all_fills == []
