"""Portfolio — tracks paper-positions, equity, realised/unrealised PnL (INV-001)."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from predmarkets.engine.paper_fill import PaperFill


@dataclass(slots=True)
class PositionRecord:
    """Aggregated paper-position on a single (platform, market, side)."""

    platform: str
    market_id: str
    side: Literal["yes", "no"]
    size: int  # signed net contracts
    avg_entry: float  # volume-weighted average entry price
    entry_ts: datetime
    closed: bool = False
    realised_pnl: float = 0.0
    was_cancelled: bool = False
    account_after: float | None = None
    cash_after: float | None = None


@dataclass(slots=True)
class Portfolio:
    """INV-001: equity = bankroll + realised + unrealised. Single-writer."""

    starting_bankroll: float
    cash: float = field(init=False)
    positions: dict[tuple[str, str, str], PositionRecord] = field(default_factory=dict)
    all_fills: list[PaperFill] = field(default_factory=list)
    closed_positions: list[PositionRecord] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.starting_bankroll <= 0:
            raise ValueError(f"bankroll must be > 0, got {self.starting_bankroll}")
        self.cash = float(self.starting_bankroll)

    def equity_at(self, mark_prices: dict[tuple[str, str, str], float]) -> float:
        """Mark-to-market equity given a price lookup for open positions."""
        unrealised = 0.0
        for key, pos in self.positions.items():
            if pos.closed:
                continue
            mark = mark_prices.get(key, pos.avg_entry)
            unrealised += (mark - pos.avg_entry) * pos.size
        return self.cash + unrealised

    def apply_fill(self, fill: PaperFill) -> None:
        """Credit/debit cash and update the position ledger (PR-001)."""
        self.all_fills.append(fill)
        key = (fill.platform, fill.market_id, fill.side)
        self.cash -= fill.cost
        existing = self.positions.get(key)
        if existing is None:
            self.positions[key] = PositionRecord(
                platform=fill.platform,
                market_id=fill.market_id,
                side=fill.side,
                size=fill.size,
                avg_entry=fill.fill_price,
                entry_ts=fill.timestamp,
            )
            return
        new_size = existing.size + fill.size
        existing.avg_entry = (
            (existing.avg_entry * existing.size + fill.fill_price * fill.size) / new_size
        )
        existing.size = new_size

    def settle_resolution(
        self, platform: str, market_id: str, outcome: Literal["yes", "no", "cancelled"]
    ) -> list[PositionRecord]:
        """Close all open positions on this market and pay out accordingly."""
        closed: list[PositionRecord] = []
        for side in ("yes", "no"):
            key = (platform, market_id, side)
            pos = self.positions.get(key)
            if pos is None or pos.closed:
                continue
            if outcome == "cancelled":
                self.cash += pos.avg_entry * pos.size  # refund cost (OQ-03)
                pos.was_cancelled = True
                pos.realised_pnl = 0.0
            else:
                payout = 1.0 if side == outcome else 0.0
                self.cash += payout * pos.size
                pos.realised_pnl = (payout - pos.avg_entry) * pos.size
            pos.closed = True
            closed.append(pos)
            self.closed_positions.append(pos)
        return closed
