"""
HACF Phase 2 Step E — backward chain derivation.

For each terminal state, trace backward through behavior-metadata.json
to find the set of interactions that must fire (with dependencies) to
produce its observable signals. Then reverse into forward order.

Output: state-chain.json (backward + forward representations)
"""
import json
from pathlib import Path
from collections import defaultdict, deque

ROOT = Path(__file__).resolve().parent.parent
meta = json.loads((ROOT / "behavior-metadata.json").read_text(encoding="utf-8"))
ts   = json.loads((ROOT / "terminal-states.json").read_text(encoding="utf-8"))
imap = json.loads((ROOT / "interaction-map.json").read_text(encoding="utf-8"))

# Build lookups
by_id = {m["interaction_id"]: m for m in meta["interactions"]}

# ------------------------------------------------------------
# Explicit seed mapping: which interactions DIRECTLY produce the
# observable signals of each terminal state. These are the leaf
# nodes of the backward chain (the ones that make TS true).
# ------------------------------------------------------------
TS_LEAVES = {
    "TS-01": [
        "I-STR-002",  # toggle strategy on
        "I-MD-005",   # paper-fill submitted (from strategy decide loop or manual)
        "I-DASH-013", # recent-trades panel shows new fill (derived)
    ],
    "TS-02": [
        "I-BT-006",   # run backtest
        "I-BT-007",   # results panel reveal (success state)
    ],
    "TS-03": [
        "I-CMP-005",  # confirm comparison-run selection
        "I-CMP-008",  # TS-03 satisfied condition
    ],
}

# ------------------------------------------------------------
# Backward chain: for each leaf, walk dependencies transitively
# ------------------------------------------------------------
def backward_for_terminal(ts_id: str) -> dict:
    leaves = TS_LEAVES.get(ts_id, [])
    visited = set()
    chain = []  # ordered by insertion (root-to-leaf after reverse)
    queue = deque(leaves)
    while queue:
        iid = queue.popleft()
        if iid in visited:
            continue
        visited.add(iid)
        row = by_id.get(iid)
        if not row:
            continue
        chain.append({
            "interaction_id": iid,
            "source_state": row["source_state"],
            "trigger": row["trigger"],
            "target_function": row["target_function"],
            "async_mode": row["async_mode"],
            "depends_on": row["dependencies"],
            "produces_signal_for_ts": ts_id if iid in leaves else None,
        })
        for dep in row.get("dependencies", []):
            if dep not in visited:
                queue.append(dep)
    # Backward order: leaves first → dependencies last
    return {"terminal_state": ts_id, "backward": chain}

# Per-terminal chains
per_ts_chains = [backward_for_terminal(t["id"]) for t in ts["terminal_states"]]

# ------------------------------------------------------------
# Unified backward chain: union across all TS
# ------------------------------------------------------------
all_in_chain = {}
for c in per_ts_chains:
    for node in c["backward"]:
        iid = node["interaction_id"]
        if iid not in all_in_chain:
            all_in_chain[iid] = dict(node)
            all_in_chain[iid]["terminal_states"] = [c["terminal_state"]] if node.get("produces_signal_for_ts") else []
        else:
            if node.get("produces_signal_for_ts") and node["produces_signal_for_ts"] not in all_in_chain[iid]["terminal_states"]:
                all_in_chain[iid]["terminal_states"].append(node["produces_signal_for_ts"])

# ------------------------------------------------------------
# Topological wave assignment (Kahn) for forward chain
# Wave 0 = no dependencies in the chain
# Wave N = max(dependency wave) + 1
# ------------------------------------------------------------
wave = {}
def compute_wave(iid):
    if iid in wave:
        return wave[iid]
    node = all_in_chain.get(iid)
    if not node:
        wave[iid] = 0
        return 0
    deps_in_chain = [d for d in node["depends_on"] if d in all_in_chain]
    if not deps_in_chain:
        wave[iid] = 0
    else:
        wave[iid] = max(compute_wave(d) for d in deps_in_chain) + 1
    return wave[iid]

for iid in all_in_chain:
    compute_wave(iid)

# ------------------------------------------------------------
# Forward chain: sorted by wave asc, then interaction_id
# ------------------------------------------------------------
forward = []
for iid, node in sorted(all_in_chain.items(), key=lambda kv: (wave[kv[0]], kv[0])):
    node = dict(node)
    node["wave"] = wave[iid]
    forward.append(node)

max_wave = max(wave.values()) if wave else 0
waves = defaultdict(list)
for f in forward:
    waves[f["wave"]].append(f["interaction_id"])

state_chain = {
    "project": "prediction-markets",
    "phase": "2", "step": "E",
    "produced_at": "2026-04-16",
    "terminal_states_covered": [t["id"] for t in ts["terminal_states"]],
    "total_states_in_chain": len(all_in_chain),
    "total_waves": max_wave + 1,
    "per_terminal_backward_chains": per_ts_chains,
    "unified_forward_chain": forward,
    "waves": {str(k): v for k, v in sorted(waves.items())},
    "orphans": [],  # no orphans since we build bottom-up from seeds + deps
    "gaps": [],
}

(ROOT / "state-chain.json").write_text(json.dumps(state_chain, indent=2), encoding="utf-8")

print(f"Step E/H -- State Chain Derived ({len(all_in_chain)} states, {max_wave+1} waves, {len(ts['terminal_states'])} terminal states)")
for w in sorted(waves):
    print(f"  Wave {w}: {len(waves[w])} interactions → {waves[w]}")
