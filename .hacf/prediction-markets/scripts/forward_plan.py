"""
HACF Phase 2 Step G — forward implementation plan.

Reverses state-chain.json and annotates with contract refs, parallelism,
dependency order, and complexity estimates. Groups into waves.
"""
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
chain = json.loads((ROOT / "state-chain.json").read_text(encoding="utf-8"))
meta  = json.loads((ROOT / "behavior-metadata.json").read_text(encoding="utf-8"))
by_id = {m["interaction_id"]: m for m in meta["interactions"]}

# Not every interaction is in the state-chain. For the full implementation
# plan, include ALL interactions but wave-sort them by dependencies.
wave = {}

def compute_wave(iid, guard=None):
    guard = guard or set()
    if iid in wave:
        return wave[iid]
    if iid in guard:
        # cycle breaker (shouldn't happen given acyclic design)
        return 0
    guard.add(iid)
    row = by_id.get(iid)
    if not row:
        wave[iid] = 0
        return 0
    deps = [d for d in row.get("dependencies", []) if d in by_id]
    wave[iid] = 0 if not deps else max(compute_wave(d, guard) for d in deps) + 1
    return wave[iid]

for iid in by_id:
    compute_wave(iid)

# ------------------------------------------------------------
# Complexity estimates
# ------------------------------------------------------------
def estimate_complexity(m):
    iid = m["interaction_id"]
    cat = m.get("async_mode")
    trigger = m["trigger"].lower()
    # Long-running + critical path
    if iid in ("I-BT-006",):  # run backtest
        return "complex"
    if iid in ("I-DI-004",):   # manifold sync (reconstruct from bets)
        return "complex"
    if iid in ("I-MD-005",):   # submit paper trade — atomic + invariants
        return "complex"
    if iid.startswith("I-DI-") and "sync" in trigger:
        return "moderate"
    if "run-backtest" in trigger or "save-as-comparison" in trigger:
        return "moderate"
    if "toggle" in trigger and "strategy" in m["source_state"]:
        return "moderate"
    if cat == "async-await":
        return "moderate" if "page load" in trigger else "simple"
    return "simple"

# ------------------------------------------------------------
# Build waves
# ------------------------------------------------------------
waves = defaultdict(list)
for iid, w in wave.items():
    m = by_id[iid]
    waves[w].append({
        "interaction_id": iid,
        "target_function": m["target_function"],
        "contract_file": f"contracts/{m['target_function']}.json",
        "source_state": m["source_state"],
        "trigger": m["trigger"],
        "async_mode": m["async_mode"],
        "complexity": estimate_complexity(m),
        "depends_on": [d for d in m["dependencies"] if d in by_id],
    })

max_wave = max(wave.values()) if wave else 0
plan = {
    "project": "prediction-markets",
    "phase": "2", "step": "G",
    "produced_at": "2026-04-16",
    "total_steps": len(by_id),
    "total_waves": max_wave + 1,
    "parallelization_notes": [
        "Wave 0: all 'page load' api_calls and all 'click sidebar nav' interactions — fully independent, parallel-safe",
        "Wave 1: dependent form inputs (size-input requires side-button selection); strategy toggles require capital set; add-from-backtest requires add-run opened",
        "Wave 2: submit operations that depend on Wave 1 (submit-paper-trade, toggle-on after capital, add-comparison after picker opened)",
        "Wave 3+: chained downstream effects (e.g., save-as-comparison depends on run-backtest success)"
    ],
    "waves": [
        {
            "wave": w,
            "size": len(waves[w]),
            "parallel_safe": True,
            "complexity_distribution": {
                "simple":   sum(1 for x in waves[w] if x["complexity"] == "simple"),
                "moderate": sum(1 for x in waves[w] if x["complexity"] == "moderate"),
                "complex":  sum(1 for x in waves[w] if x["complexity"] == "complex"),
            },
            "interactions": waves[w]
        }
        for w in sorted(waves)
    ],
    "critical_path": {
        "description": "Longest dependency chain leading to a terminal state",
        "path": []
    }
}

# Critical path trace (example: TS-01 path)
# I-STR-001 (page load) -> I-STR-005 (capital set) -> I-STR-002 (toggle on) -> I-DASH-013 (recent trades)
# Extract manually from known deps
cp = []
current = "I-DASH-013"
while current and current in by_id:
    cp.append(current)
    deps = [d for d in by_id[current]["dependencies"] if d in by_id]
    current = deps[0] if deps else None
plan["critical_path"]["path"] = list(reversed(cp))

(ROOT / "implementation-plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")

print(f"Step G/H -- Implementation Plan Generated ({plan['total_steps']} steps in {plan['total_waves']} waves)")
for w in sorted(waves):
    c = plan["waves"][w]["complexity_distribution"]
    print(f"  Wave {w}: {len(waves[w])} ({c['simple']} simple, {c['moderate']} moderate, {c['complex']} complex)")
