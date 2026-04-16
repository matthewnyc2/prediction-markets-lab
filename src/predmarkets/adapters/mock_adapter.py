"""Mock adapter — deterministic fabricated price-history for local backtests.

Used when no real platform data is available. Produces a synthetic event
stream that exercises the engine end-to-end. Emits one market that opens
at yes=0.5, drifts toward the true outcome with noise, and resolves.
"""

from datetime import datetime, timedelta
from typing import Literal

from predmarkets.engine.market_event import MarketEvent


def generate_mock_events(
    seed: int = 1,
    n_markets: int = 3,
    ticks_per_market: int = 60,
    true_probabilities: list[float] | None = None,
) -> list[MarketEvent]:
    """Return a deterministic list of MarketEvents for N mock markets.

    Each market opens at yes=0.5, drifts toward its true probability with a
    seeded random-walk, then resolves based on the true probability.
    """
    import random  # stdlib only — deterministic with seed

    rng = random.Random(seed)
    events: list[MarketEvent] = []
    base_time = datetime(2025, 1, 1, 12, 0, 0)
    probs = true_probabilities or [0.7, 0.3, 0.55][:n_markets]
    if len(probs) != n_markets:
        probs = (probs * ((n_markets // len(probs)) + 1))[:n_markets]

    for m_idx in range(n_markets):
        market_id = f"mock-{m_idx:03d}"
        title = f"Mock market {m_idx} — true p={probs[m_idx]:.2f}"
        price = 0.5
        for tick_idx in range(ticks_per_market):
            drift = (probs[m_idx] - price) * 0.04
            noise = rng.uniform(-0.02, 0.02)
            price = max(0.02, min(0.98, price + drift + noise))
            events.append(
                MarketEvent(
                    timestamp=base_time + timedelta(hours=tick_idx, minutes=m_idx),
                    platform="mock",
                    market_id=market_id,
                    market_title=title,
                    yes_price=price,
                    book_top_size=100,
                    event_type="tick",
                    close_in_hours=max(1.0, ticks_per_market - tick_idx),
                )
            )
        # Resolution
        outcome: Literal["yes", "no"] = "yes" if rng.random() < probs[m_idx] else "no"
        events.append(
            MarketEvent(
                timestamp=base_time + timedelta(hours=ticks_per_market + m_idx),
                platform="mock",
                market_id=market_id,
                market_title=title,
                yes_price=1.0 if outcome == "yes" else 0.0,
                book_top_size=100,
                event_type="resolution",
                resolution=outcome,
                close_in_hours=0.0,
            )
        )
    events.sort(key=lambda e: e.timestamp)
    return events


class MockAdapter:
    """Adapter-shaped wrapper around generate_mock_events()."""

    platform = "mock"

    def __init__(self, seed: int = 1) -> None:
        self.seed = seed

    def stream_events(self, n_markets: int = 3, ticks_per_market: int = 60) -> list[MarketEvent]:
        return generate_mock_events(
            seed=self.seed, n_markets=n_markets, ticks_per_market=ticks_per_market
        )
