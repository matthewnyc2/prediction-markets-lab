"""CLI entry point — `python -m predmarkets.cli backtest --strategy kelly --platform mock`.

Runs a canonical backtest proving TS-02 works end-to-end.
"""

import argparse
import json
import sys
from pathlib import Path

from predmarkets.adapters.mock_adapter import MockAdapter
from predmarkets.engine.backtester import Backtester, BacktestResult
from predmarkets.strategies.kelly_sizing import KellySizing
from predmarkets.strategies.base import MarketView


def _oracle_factory(hint: float = 0.08) -> object:
    """Return an oracle that is mildly informed — biases p a bit toward the true value."""
    # For mock runs we inject a small positive edge over market mid, so Kelly takes some bets.
    def oracle(market: MarketView) -> float:
        mid = market.yes_price
        # Mildly confident bias: if mid > 0.5 push up, if < 0.5 push down
        delta = hint if mid > 0.5 else -hint
        return max(0.02, min(0.98, mid + delta))

    return oracle


def _print_summary(result: BacktestResult, bankroll: float) -> None:
    pnl = result.final_equity - bankroll
    print("\n=== Backtest result ===")
    print(f"  Starting bankroll  : ${bankroll:>12,.2f}")
    print(f"  Final equity       : ${result.final_equity:>12,.2f}   (PnL ${pnl:+,.2f})")
    print(f"  Trades             : {len(result.trade_list):>12}")
    print(f"  Closed positions   : {len(result.closed_positions):>12}")
    print(f"  Sharpe ratio       : {'—' if result.sharpe is None else f'{result.sharpe:>12.4f}'}")
    print(f"  Sortino ratio      : {'—' if result.sortino is None else f'{result.sortino:>12.4f}'}")
    print(f"  Brier score        : {'—' if result.brier is None else f'{result.brier:>12.4f}'}")
    print(f"  Max drawdown       : {result.drawdown:>12.2%}")
    wr = result.win_rate_value
    print(f"  Win rate           : {'—' if wr is None else f'{wr:>12.2%}'}")
    print(f"  Bankrupt           : {result.bankrupt}")


def cmd_backtest(args: argparse.Namespace) -> int:
    if args.platform != "mock":
        print(f"error: only 'mock' adapter is available in this build (got {args.platform!r})", file=sys.stderr)
        return 2
    if args.strategy != "kelly":
        print(f"error: only 'kelly' strategy is available in this build (got {args.strategy!r})", file=sys.stderr)
        return 2
    adapter = MockAdapter(seed=args.seed)
    events = adapter.stream_events(n_markets=args.markets, ticks_per_market=args.ticks)
    strategy = KellySizing(
        kelly_fraction_multiplier=args.kelly_fraction,
        assigned_capital=args.bankroll,
        p_oracle=_oracle_factory(hint=args.edge),
    )
    backtester = Backtester(bankroll=args.bankroll)
    result = backtester.run(events, strategy)
    _print_summary(result, args.bankroll)
    if args.json_output:
        out = {
            "final_equity": result.final_equity,
            "trades": len(result.trade_list),
            "sharpe": result.sharpe, "sortino": result.sortino, "brier": result.brier,
            "max_drawdown": result.drawdown, "win_rate": result.win_rate_value,
            "bankrupt": result.bankrupt,
        }
        Path(args.json_output).write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(f"\nJSON written: {args.json_output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="predmarkets", description="Prediction markets paper trader + backtester")
    sub = p.add_subparsers(dest="cmd", required=True)
    bt = sub.add_parser("backtest", help="Run a backtest")
    bt.add_argument("--strategy", default="kelly", choices=["kelly"])
    bt.add_argument("--platform", default="mock", choices=["mock"])
    bt.add_argument("--bankroll", type=float, default=10_000.0)
    bt.add_argument("--kelly-fraction", type=float, default=0.25)
    bt.add_argument("--markets", type=int, default=3, help="number of mock markets")
    bt.add_argument("--ticks", type=int, default=60, help="ticks per market")
    bt.add_argument("--seed", type=int, default=1)
    bt.add_argument("--edge", type=float, default=0.08, help="oracle bias over market mid")
    bt.add_argument("--json-output", type=str, default=None)
    bt.set_defaults(func=cmd_backtest)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
