"""Fetch resolved binary prediction markets from Manifold's public API.

Writes a normalised dataset to docs/data/manifold.json that the browser
backtester consumes directly. No auth required; Manifold's public endpoints
are open at 500 req/min/IP.

Endpoints used (docs.manifold.markets/api):
  GET /v0/markets             — paginated list of recently-created markets
  GET /v0/market/{id}         — single market detail (fallback)
  GET /v0/bets?contractId=... — bet history from which price-over-time is
                                reconstructed via probBefore/probAfter fields
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def safe_print(s: str) -> None:
    try:
        print(s, flush=True)
    except UnicodeEncodeError:
        print(s.encode("ascii", "replace").decode("ascii"), flush=True)

BASE = "https://api.manifold.markets"
HEADERS = {"User-Agent": "prediction-markets-lab/0.1 (+https://github.com/matthewnyc2/prediction-markets-lab)"}
TARGET_MARKETS = 120
MIN_BETS = 12
MIN_VOLUME = 50
MAX_SCAN_PAGES = 40


def http_get(path: str, *, retries: int = 3) -> object:
    url = f"{BASE}{path}"
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(1 + i * 2)
    raise RuntimeError(f"giving up on {url}: {last}")


def scan_resolved_binary_markets() -> list[dict]:
    """Page through /v0/markets collecting resolved BINARY markets with YES/NO outcomes."""
    out: list[dict] = []
    before: str | None = None
    for page in range(MAX_SCAN_PAGES):
        qs = "limit=1000"
        if before:
            qs += f"&before={urllib.parse.quote(before)}"
        batch = http_get(f"/v0/markets?{qs}")
        if not batch:
            break
        for m in batch:
            if (
                m.get("isResolved")
                and m.get("outcomeType") == "BINARY"
                and m.get("resolution") in ("YES", "NO")
                and float(m.get("volume") or 0) >= MIN_VOLUME
                and m.get("uniqueBettorCount", 0) >= 5
            ):
                out.append(m)
        before = batch[-1]["id"]
        print(f"  page {page+1}: scanned {len(batch)} markets, total kept {len(out)}", flush=True)
        if len(out) >= TARGET_MARKETS * 3:
            break
        time.sleep(0.2)
    return out


def fetch_bets(contract_id: str) -> list[dict]:
    """Pull bet history for one market. Manifold returns newest-first."""
    bets = http_get(f"/v0/bets?contractId={urllib.parse.quote(contract_id)}&limit=1000")
    if not isinstance(bets, list):
        return []
    return bets


def build_ticks_from_bets(bets: list[dict], resolution_time_ms: int) -> list[dict]:
    """Reconstruct (timestamp, yes_price) series from probBefore/probAfter."""
    bets = sorted(bets, key=lambda b: b.get("createdTime", 0))
    ticks: list[dict] = []
    for bet in bets:
        prob = bet.get("probAfter")
        ts_ms = bet.get("createdTime")
        if prob is None or ts_ms is None:
            continue
        prob = max(0.01, min(0.99, float(prob)))
        if resolution_time_ms and ts_ms > resolution_time_ms:
            continue
        hours_until_close = max(0.0, (resolution_time_ms - ts_ms) / 3_600_000.0) if resolution_time_ms else 24.0
        ticks.append({
            "t": int(ts_ms),
            "yesPrice": round(prob, 4),
            "closeInHours": round(hours_until_close, 2),
        })
    return ticks


def to_market_record(market: dict, ticks: list[dict]) -> dict:
    resolution = "yes" if market["resolution"] == "YES" else "no"
    resolution_time = int(market.get("resolutionTime") or market.get("closeTime") or ticks[-1]["t"] + 1000)
    title = (market.get("question") or "").strip()[:200]
    return {
        "platform": "manifold",
        "marketId": market["id"],
        "marketTitle": title,
        "slug": market.get("slug"),
        "url": market.get("url") or f"https://manifold.markets/{market.get('creatorUsername', '')}/{market.get('slug', '')}",
        "volume": round(float(market.get("volume") or 0), 2),
        "uniqueBettors": int(market.get("uniqueBettorCount") or 0),
        "createdTime": int(market.get("createdTime") or ticks[0]["t"]),
        "resolutionTime": resolution_time,
        "resolution": resolution,
        "ticks": ticks,
    }


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    out_dir = repo_root / "docs" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "manifold.json"

    print(f"scanning resolved binary markets from {BASE} ...", flush=True)
    candidates = scan_resolved_binary_markets()
    print(f"found {len(candidates)} candidate markets; pulling bet history ...", flush=True)

    keepers: list[dict] = []
    for i, m in enumerate(candidates):
        if len(keepers) >= TARGET_MARKETS:
            break
        try:
            bets = fetch_bets(m["id"])
        except Exception as e:
            print(f"  [{i+1}] skip {m['id']}: {e}", flush=True)
            continue
        resolution_time = int(m.get("resolutionTime") or m.get("closeTime") or 0)
        ticks = build_ticks_from_bets(bets, resolution_time)
        if len(ticks) < MIN_BETS:
            continue
        rec = to_market_record(m, ticks)
        keepers.append(rec)
        print(f"  [{len(keepers):>3}/{TARGET_MARKETS}] {rec['marketTitle'][:72]}  ({len(ticks)} ticks, res={rec['resolution'].upper()})", flush=True)
        time.sleep(0.15)

    if not keepers:
        print("no markets survived filters; aborting", flush=True)
        return 1

    payload = {
        "platform": "manifold",
        "source": "https://api.manifold.markets/v0",
        "fetched_at_ms": int(time.time() * 1000),
        "market_count": len(keepers),
        "filter": {
            "outcomeType": "BINARY",
            "isResolved": True,
            "resolution_in": ["YES", "NO"],
            "min_volume_mana": MIN_VOLUME,
            "min_bets_with_probs": MIN_BETS,
            "min_unique_bettors": 5,
        },
        "markets": keepers,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    size_kb = out_path.stat().st_size / 1024
    print(f"\nwrote {out_path}  ({size_kb:.1f} KB · {len(keepers)} markets)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
