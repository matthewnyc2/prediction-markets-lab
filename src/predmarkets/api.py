"""High-level Python API — the single entry point for Claude-driven experiments.

Typical usage:

    from predmarkets.api import run_backtest, show_result
    from predmarkets.strategies.kelly_sizing import KellySizing

    strategy = KellySizing(p_oracle=lambda m: 0.6 if m.yes_price < 0.5 else 0.4)
    result = run_backtest(strategy, markets=10, bankroll=10_000, save_as="my_test")
    show_result(result)
"""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path

from predmarkets.adapters.mock_adapter import MockAdapter
from predmarkets.engine.backtester import Backtester, BacktestResult
from predmarkets.strategies.base import Strategy

_DEFAULT_RESULTS_DIR = Path("results")


def run_backtest(
    strategy: Strategy,
    *,
    platform: str = "mock",
    markets: int = 10,
    ticks_per_market: int = 40,
    seed: int = 1,
    bankroll: float = 10_000.0,
    save_as: str | None = None,
    results_dir: Path | str | None = None,
) -> BacktestResult:
    """Run a backtest and return the scored result.

    Args:
        strategy: an instance of a Strategy subclass.
        platform: currently only "mock". Real adapters arrive in a later session.
        markets: number of synthetic markets (mock adapter only).
        ticks_per_market: price-history length per market.
        seed: deterministic replay seed.
        bankroll: starting simulated bankroll in USD.
        save_as: if provided, saves the result to results/{save_as}.json.
        results_dir: override the results folder (default: ./results).

    Returns:
        BacktestResult with equity curve, metrics, and full trade list.
    """
    if platform != "mock":
        raise NotImplementedError(
            f"Platform {platform!r} adapter not yet built. "
            "Use platform='mock' until real adapters land."
        )
    adapter = MockAdapter(seed=seed)
    events = adapter.stream_events(n_markets=markets, ticks_per_market=ticks_per_market)
    result = Backtester(bankroll=bankroll).run(events, strategy)
    if save_as is not None:
        save_result(result, save_as, results_dir=results_dir)
    return result


def save_result(
    result: BacktestResult,
    name: str,
    *,
    results_dir: Path | str | None = None,
) -> Path:
    """Persist a BacktestResult as JSON under results/{name}.json."""
    base = Path(results_dir) if results_dir else _DEFAULT_RESULTS_DIR
    base.mkdir(parents=True, exist_ok=True)
    payload = _result_to_dict(result)
    payload["saved_at"] = datetime.utcnow().isoformat()
    payload["name"] = name
    path = base / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2, default=_json_default), encoding="utf-8")
    return path


def show_result(result: BacktestResult, bankroll: float | None = None) -> None:
    """Pretty-print a BacktestResult to stdout."""
    pnl = result.final_equity - (bankroll if bankroll is not None else 0.0)
    print("\n=== Backtest result ===")
    if bankroll is not None:
        print(f"  Starting bankroll  : ${bankroll:>12,.2f}")
    print(f"  Final equity       : ${result.final_equity:>12,.2f}"
          + (f"   (PnL ${pnl:+,.2f})" if bankroll is not None else ""))
    print(f"  Trades             : {len(result.trade_list):>12}")
    print(f"  Closed positions   : {len(result.closed_positions):>12}")
    _print_metric("Sharpe ratio",  result.sharpe,   fmt="{:>12.4f}")
    _print_metric("Sortino ratio", result.sortino,  fmt="{:>12.4f}")
    _print_metric("Brier score",   result.brier,    fmt="{:>12.4f}")
    print(f"  Max drawdown       : {result.drawdown:>12.2%}")
    _print_metric("Win rate",      result.win_rate_value, fmt="{:>12.2%}")
    print(f"  Bankrupt           : {result.bankrupt}")


def _print_metric(label: str, value: float | None, fmt: str) -> None:
    rendered = "            -" if value is None else fmt.format(value)
    print(f"  {label:<18} : {rendered}")


def _result_to_dict(result: BacktestResult) -> dict:
    return {
        "final_equity": result.final_equity,
        "sharpe": result.sharpe,
        "sortino": result.sortino,
        "brier": result.brier,
        "drawdown": result.drawdown,
        "win_rate": result.win_rate_value,
        "bankrupt": result.bankrupt,
        "trade_count": len(result.trade_list),
        "closed_position_count": len(result.closed_positions),
        "equity_curve": [
            {"timestamp": ts.isoformat(), "equity": eq} for ts, eq in result.equity_curve
        ],
        "trades": [
            {
                "timestamp": f.timestamp.isoformat(),
                "platform": f.platform,
                "market_id": f.market_id,
                "side": f.side,
                "order_side": f.order_side,
                "size": f.size,
                "fill_price": f.fill_price,
                "strategy_id": f.strategy_id,
            }
            for f in result.trade_list
        ],
    }


def _json_default(obj: object) -> object:
    if is_dataclass(obj):
        return asdict(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"not serialisable: {type(obj).__name__}")
