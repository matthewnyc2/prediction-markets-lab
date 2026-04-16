"""
HACF Phase 2 Step F — generate function contracts.

For each interaction in behavior-metadata.json, emit one contract file
in contracts/ that inherits async_mode, timeout_ms, retry_policy,
concurrency_policy, failure_transitions, side_effects. Adds function
signature (inputs, outputs, preconditions, postconditions).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
meta = json.loads((ROOT / "behavior-metadata.json").read_text(encoding="utf-8"))
(ROOT / "contracts").mkdir(exist_ok=True)

# ------------------------------------------------------------
# Category-based signature templates
# ------------------------------------------------------------
def signature_for(inter: dict) -> dict:
    cat_hints = {
        # Broad categories
        "page load":          {"inputs": [], "outputs": [{"name": "screen_state", "type": "ScreenState"}]},
        "click sidebar":      {"inputs": [{"name": "nav_target", "type": "ScreenId"}], "outputs": []},
        "click Sync now":     {"inputs": [{"name": "platform", "type": "Platform"}], "outputs": [{"name": "sync_job_id", "type": "str"}]},
        "Sync now":           {"inputs": [{"name": "platform", "type": "Platform"}], "outputs": [{"name": "sync_job_id", "type": "str"}]},
        "Retry":              {"inputs": [{"name": "platform", "type": "Platform"}], "outputs": [{"name": "sync_job_id", "type": "str"}]},
        "Export CSV":         {"inputs": [{"name": "filters", "type": "FilterSet"}], "outputs": [{"name": "file", "type": "CsvBlob"}]},
        "Export JSON":        {"inputs": [{"name": "filters", "type": "FilterSet"}], "outputs": [{"name": "file", "type": "JsonBlob"}]},
        "submit-paper-trade": {"inputs": [{"name": "platform", "type": "Platform"}, {"name": "market_id", "type": "str"},
                                           {"name": "side", "type": "MarketSide"}, {"name": "size", "type": "int"}],
                                "outputs": [{"name": "paper_fill", "type": "PaperFill"}]},
        "run-backtest":       {"inputs": [{"name": "strategy_id", "type": "StrategyId"}, {"name": "platforms", "type": "list[Platform]"},
                                           {"name": "date_range", "type": "DateRange"}, {"name": "bankroll", "type": "int"}],
                                "outputs": [{"name": "backtest_result", "type": "BacktestResult"}]},
        "save-as-comparison": {"inputs": [{"name": "backtest_id", "type": "str"}], "outputs": [{"name": "comparison_run", "type": "ComparisonRun"}]},
        "toggle Kelly":       {"inputs": [{"name": "strategy_id", "type": "StrategyId"}, {"name": "state", "type": "Literal['on','off']"}], "outputs": []},
        "toggle":             {"inputs": [{"name": "strategy_id", "type": "StrategyId"}, {"name": "state", "type": "Literal['on','off']"}], "outputs": []},
        "size input":         {"inputs": [{"name": "size", "type": "int"}], "outputs": []},
        "filter pill":        {"inputs": [{"name": "filter_key", "type": "str"}, {"name": "filter_value", "type": "str"}], "outputs": []},
        "column sort":        {"inputs": [{"name": "column", "type": "str"}, {"name": "direction", "type": "Literal['asc','desc']"}], "outputs": []},
        "market row click":   {"inputs": [{"name": "platform", "type": "Platform"}, {"name": "market_id", "type": "str"}], "outputs": []},
        "attribution bar":    {"inputs": [{"name": "strategy_id", "type": "StrategyId"}], "outputs": []},
        "running-pnl":        {"inputs": [{"name": "strategy_id", "type": "StrategyId"}], "outputs": []},
        "timeframe toggle":   {"inputs": [{"name": "window", "type": "Literal['7d','30d','90d','ytd','all']"}], "outputs": []},
        "date-range":         {"inputs": [{"name": "date_range", "type": "DateRange"}], "outputs": []},
        "30s poll":           {"inputs": [], "outputs": [{"name": "revalidated_state", "type": "ScreenState"}]},
        "refresh":            {"inputs": [], "outputs": [{"name": "revalidated_state", "type": "ScreenState"}]},
        "add-run":            {"inputs": [], "outputs": []},
        "remove-run":         {"inputs": [{"name": "comparison_run_id", "type": "str"}], "outputs": []},
        "run label edit":     {"inputs": [{"name": "comparison_run_id", "type": "str"}, {"name": "label", "type": "str"}], "outputs": []},
        "parameter":          {"inputs": [{"name": "strategy_id", "type": "StrategyId"}, {"name": "params", "type": "dict"}], "outputs": []},
        "capital":            {"inputs": [{"name": "strategy_id", "type": "StrategyId"}, {"name": "capital_usd", "type": "int"}], "outputs": []},
        "starting-bankroll":  {"inputs": [{"name": "bankroll", "type": "int"}], "outputs": []},
        "platform in multi":  {"inputs": [{"name": "platform", "type": "Platform"}, {"name": "enabled", "type": "bool"}], "outputs": []},
        "strategy picker":    {"inputs": [{"name": "strategy_id", "type": "StrategyId"}], "outputs": []},
        "BUY YES":            {"inputs": [], "outputs": []},
        "BUY NO":             {"inputs": [], "outputs": []},
        "status transitions": {"inputs": [{"name": "adapter", "type": "Platform"}, {"name": "new_status", "type": "AdapterStatus"}], "outputs": []},
        "strategy .py file":  {"inputs": [{"name": "path", "type": "str"}], "outputs": [{"name": "strategy_id", "type": "StrategyId"}]},
    }
    trigger = inter["trigger"].lower()
    for hint, sig in cat_hints.items():
        if hint.lower() in trigger:
            return sig
    # Default fallback
    return {"inputs": [], "outputs": []}

# ------------------------------------------------------------
# Preconditions / postconditions based on references
# ------------------------------------------------------------
INVARIANT_PRECONDITIONS = {
    "INV-001": "equity == simulated_bankroll + sum(closed_position.realised_pnl) + sum(open_position.unrealised_pnl) BEFORE call",
    "INV-002": "market.price ∈ [0, 1]",
    "INV-003": "if transitioning to state='on', strategy.assigned_capital > 0",
    "INV-004": "paper_fill.market_id exists in markets AND paper_fill.source in (strategy_ids ∪ {'manual'})",
    "INV-006": "backtest execute reads stored_price_history only; no live endpoint calls",
    "INV-007": "no write to a real-money trading endpoint on any platform adapter",
    "INV-008": "sum(s.assigned_capital for s in strategies where s.state=='on') + new_capital <= equity",
    "INV-010": "brier_score is defined only when strategy.strategy_id != 'market-maker'",
}

def derive_preconditions(inter: dict, meta_row: dict) -> list:
    pre = []
    for r in meta_row.get("validation_rule_refs", []):
        if r in INVARIANT_PRECONDITIONS:
            pre.append({"ref": r, "condition": INVARIANT_PRECONDITIONS[r]})
    # Category-specific
    if "submit-paper-trade" in inter["trigger"].lower():
        pre.append({"ref": "INV-004", "condition": "market exists and is open"})
        pre.append({"ref": "local", "condition": "size > 0 AND side in {'yes','no'}"})
    if "toggle" in inter["trigger"].lower() and "on" in inter["trigger"].lower():
        pre.append({"ref": "INV-003", "condition": "assigned_capital > 0"})
        pre.append({"ref": "INV-008", "condition": "sum of on-strategy capital + this capital <= equity"})
    if "run-backtest" in inter["trigger"].lower() or (inter["trigger"].lower() == "click run-backtest button"):
        pre.append({"ref": "config",  "condition": "strategy_id valid, platforms non-empty, date_range valid, bankroll >= 1"})
    return pre

def derive_postconditions(inter: dict, meta_row: dict) -> list:
    post = []
    if "submit-paper-trade" in inter["trigger"].lower():
        post.append({"ref": "INV-001", "condition": "equity recomputed to reflect new paper_fill"})
        post.append({"ref": "PR-001",  "condition": "paper_fill + paper_position written atomically"})
        post.append({"ref": "CSC-002", "condition": "paper-trades ledger and dashboard recent-trades show new row"})
    if "toggle" in inter["trigger"].lower():
        post.append({"ref": "PR-002",  "condition": "strategy_state_log row appended with previous + new state"})
        post.append({"ref": "CSC-001 or CSC-007", "condition": "dashboard active-strategies-panel reflects new state"})
    if "run-backtest" in inter["trigger"].lower() or (inter["trigger"].lower() == "click run-backtest button"):
        post.append({"ref": "TS-02",   "condition": "backtest_result has non-null final_equity, sharpe, brier, win_rate, equity_curve"})
        post.append({"ref": "INV-006", "condition": "zero outbound calls to live adapter endpoints during run"})
    if "save-as-comparison" in inter["trigger"].lower():
        post.append({"ref": "CSC-004", "condition": "compare.overlay-pnl-chart has new color-coded series; comparison-table has new row"})
    if "sync" in inter["trigger"].lower():
        post.append({"ref": "PR-004",  "condition": "ingest-markets idempotent on (platform, platform-market-id)"})
        post.append({"ref": "CSC-005", "condition": "dashboard platform-health reflects adapter status change"})
    return post

# ------------------------------------------------------------
# Emit contracts
# ------------------------------------------------------------
count = 0
for m in meta["interactions"]:
    iid = m["interaction_id"]
    sig = signature_for(m)
    contract = {
        "contract_id": f"C-{iid}",
        "interaction_id": iid,
        "function": {
            "name": m["target_function"],
            "module_hint": f"backend.handlers.{m['source_state'].replace('-','_')}" if m["async_mode"] == "async-await" else f"frontend.handlers.{m['source_state'].replace('-','_')}",
            "inputs": sig["inputs"],
            "outputs": sig["outputs"],
        },
        # INHERITED from behavior-metadata (authority hierarchy: contract > metadata)
        "behavior_inherited": {
            "async_mode":          m["async_mode"],
            "timeout_ms":          m["timeout_ms"],
            "retry_policy":        m["retry_policy"],
            "concurrency_policy":  m["concurrency_policy"],
            "idempotency_rule":    m["idempotency_rule"],
            "ui_locking_rule":     m["ui_locking_rule"],
            "failure_transitions": m["failure_transitions"],
            "side_effects":        m["side_effects"],
        },
        "preconditions":  derive_preconditions(m, m),
        "postconditions": derive_postconditions(m, m),
        "references": {
            "validation_rule_refs": m["validation_rule_refs"],
            "external_rule_refs":   m["external_rule_refs"],
            "source_state":         m["source_state"],
            "success_transition":   m["success_transition"],
        },
    }
    filename = f"{m['target_function']}.json"
    (ROOT / "contracts" / filename).write_text(json.dumps(contract, indent=2), encoding="utf-8")
    count += 1

print(f"Step F/H -- Function Contracts Generated ({count} contracts in contracts/)")
