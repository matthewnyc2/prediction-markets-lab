# run_backtest — pseudocode

Contract: contracts/handle_i_bt_006.json (inherits INV-006, TS-02, FS-003).

## Inputs
- strategy: Strategy   # one of the 5 built-ins
- platforms: list[Platform]
- date_range: (from_date, to_date)
- bankroll: int > 0
- data_handler: DataHandler — provides stored-price-history

## Outputs
- BacktestResult:
    final_equity: float
    equity_curve: list[(timestamp, equity)]
    trade_list: list[PaperFill]
    sharpe_ratio: float | None
    sortino_ratio: float | None
    brier_score: float | None
    max_drawdown: float
    win_rate: float | None
    bankrupt: bool

## Preconditions
- bankroll >= 1
- date_range.from <= date_range.to
- data_handler provides stored-price-history only (INV-006)
- at least one platform selected

## Algorithm (event-driven replay)

```
portfolio = new Portfolio(bankroll)
events = data_handler.events_in_order(platforms, date_range)
equity_curve = [(date_range.from, bankroll)]
closed_positions = []

FOR event in events:
    IF portfolio.equity <= 0:
        bankrupt = true
        BREAK   # CSC-006 halt

    market_state = build_market_state(event)
    orders = strategy.decide(market_state)

    FOR order in orders:
        fill_price = slippage_model(event.mid_price, order.size, event.book_depth, order.side)
        fill = PaperFill(event.timestamp, event.market, order.side, order.size, fill_price)
        portfolio.apply_fill(fill)
        strategy.on_fill(fill)

    # Settlement on resolution
    IF event.type == "market_resolution":
        closed = portfolio.settle_resolution(event.market, event.outcome)
        closed_positions.extend(closed)

    equity_curve.append((event.timestamp, portfolio.equity))

# Compute metrics post-run
returns = daily_returns_from(equity_curve)
result.sharpe_ratio  = sharpe_ratio(returns)
result.sortino_ratio = sortino_ratio(returns)
result.max_drawdown  = max_drawdown([e for (_, e) in equity_curve])
forecasts, outcomes = extract_forecasts_and_outcomes(closed_positions)
result.brier_score   = brier_score(forecasts, outcomes)
result.win_rate      = win_rate([(pos.pnl, pos.was_cancelled) for pos in closed_positions])
result.final_equity  = portfolio.equity
result.equity_curve  = equity_curve
result.trade_list    = portfolio.all_fills
result.bankrupt      = (portfolio.equity <= 0)
RETURN result
```

## Postconditions (TS-02 signals)
- result.final_equity is a finite number
- result.equity_curve has >= 2 points
- result.sharpe_ratio, sortino_ratio, brier_score: float or None (per metric pseudocode)
- No outbound calls to live trading endpoints during the run (INV-006/INV-007)

## Verification checks
1. Trivial market with no orders → final_equity == bankroll, equity_curve stable
2. Winning strategy → final_equity > bankroll
3. Bankrupt strategy → bankrupt == True, equity_curve terminates mid-run
4. Completed run → all metrics fields non-null (except brier for MM-style strategies)
