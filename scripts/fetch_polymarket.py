"""Fetch resolved binary Polymarket markets + tick-level price history.

Output shape matches docs/data/manifold.json so engine.js can consume it identically.

Usage:
    python scripts/fetch_polymarket.py [--limit 200] [--out docs/data/polymarket.json]

Data sources:
    - Gamma API (discovery):   https://gamma-api.polymarket.com/markets
    - CLOB API (price history):https://clob.polymarket.com/prices-history
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import urllib.request
import urllib.parse
import urllib.error

GAMMA = "https://gamma-api.polymarket.com/markets"
CLOB_HISTORY = "https://clob.polymarket.com/prices-history"


HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (prediction-markets-lab data fetch; +https://github.com/matthewnyc2/prediction-markets-lab)",
}

def http_get_json(url: str, *, tries: int = 3, pause: float = 0.5) -> Any:
    last_err: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            time.sleep(pause * (2 ** attempt))
    raise RuntimeError(f"GET {url} failed after {tries} tries: {last_err}")


def is_binary_yes_no(market: dict) -> bool:
    outcomes = market.get("outcomes")
    if isinstance(outcomes, str):
        try:
            outcomes = json.loads(outcomes)
        except json.JSONDecodeError:
            return False
    if not isinstance(outcomes, list) or len(outcomes) != 2:
        return False
    labels = [str(o).lower() for o in outcomes]
    return set(labels) == {"yes", "no"}


def resolved_outcome(market: dict) -> str | None:
    """Return 'yes' / 'no' / 'cancelled' / None (unknown)."""
    prices_raw = market.get("outcomePrices")
    if isinstance(prices_raw, str):
        try:
            prices = json.loads(prices_raw)
        except json.JSONDecodeError:
            return None
    else:
        prices = prices_raw
    if not isinstance(prices, list) or len(prices) != 2:
        return None
    try:
        yes_p, no_p = float(prices[0]), float(prices[1])
    except (TypeError, ValueError):
        return None
    if yes_p > 0.99 and no_p < 0.01:
        return "yes"
    if no_p > 0.99 and yes_p < 0.01:
        return "no"
    if abs(yes_p - 0.5) < 0.01 and abs(no_p - 0.5) < 0.01:
        return "cancelled"
    return None


def fetch_resolved_markets(target: int, page_size: int = 500) -> list[dict]:
    """Page through Gamma API picking resolved binary yes/no markets until target reached."""
    kept: list[dict] = []
    offset = 0
    while len(kept) < target and offset < 10_000:
        params = urllib.parse.urlencode({
            "closed": "true",
            "limit": page_size,
            "offset": offset,
            "order": "volumeNum",
            "ascending": "false",
        })
        data = http_get_json(f"{GAMMA}?{params}")
        page = data if isinstance(data, list) else data.get("data", [])
        if not page:
            break
        for m in page:
            if not is_binary_yes_no(m):
                continue
            outcome = resolved_outcome(m)
            if outcome is None:
                continue
            m["_resolution"] = outcome
            kept.append(m)
            if len(kept) >= target:
                break
        offset += page_size
        print(f"  scanned offset={offset} kept={len(kept)}/{target}", flush=True)
    return kept


def yes_token_id(market: dict) -> str | None:
    raw = market.get("clobTokenIds")
    if isinstance(raw, str):
        try:
            ids = json.loads(raw)
        except json.JSONDecodeError:
            return None
    else:
        ids = raw
    if not isinstance(ids, list) or len(ids) < 1:
        return None
    return str(ids[0])


def fetch_price_history(token_id: str, fidelity: int = 720) -> list[dict]:
    """Returns list of {t: unix_seconds, p: price} from CLOB."""
    params = urllib.parse.urlencode({
        "market": token_id,
        "interval": "all",
        "fidelity": fidelity,
    })
    try:
        data = http_get_json(f"{CLOB_HISTORY}?{params}")
    except RuntimeError:
        return []
    return data.get("history", []) or []


def to_tick_list(history: list[dict], resolution_ms: int) -> list[dict]:
    """Convert CLOB history into engine tick shape: {t, yesPrice, closeInHours}.

    t is kept in MILLISECONDS to match manifold.json; closeInHours is computed
    from resolution_ms - t.
    """
    out = []
    for pt in history:
        t_ms = int(pt["t"]) * 1000
        yes_price = float(pt["p"])
        hours_to_close = max(0.1, (resolution_ms - t_ms) / 3_600_000)
        out.append({
            "t": t_ms,
            "yesPrice": max(0.01, min(0.99, yes_price)),
            "closeInHours": round(hours_to_close, 2),
        })
    return out


def build_market_record(m: dict, history: list[dict]) -> dict:
    # The last price tick is when trading actually stopped — use it as the
    # effective resolution time. Polymarket's `endDate` is often the UMA oracle
    # deadline (months or years in the future), not the event date, so it's
    # useless for computing "hours-to-close".
    resolution_ms = int(history[-1]["t"]) * 1000 if history else 0
    ticks = to_tick_list(history, resolution_ms) if resolution_ms else []
    try:
        volume = float(m.get("volume") or 0)
    except (TypeError, ValueError):
        volume = 0.0

    return {
        "platform": "polymarket",
        "marketId": str(m.get("id")),
        "marketTitle": m.get("question", ""),
        "slug": m.get("slug", ""),
        "url": f"https://polymarket.com/market/{m.get('slug','')}",
        "volume": volume,
        "uniqueBettors": None,
        "createdTime": _iso_to_ms(m.get("createdAt")),
        "resolutionTime": resolution_ms,
        "resolution": m.get("_resolution", "cancelled"),
        "ticks": ticks,
    }


def _iso_to_ms(s: str | None) -> int | None:
    if not s:
        return None
    try:
        parsed = time.strptime(s.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S%z")
        return int(time.mktime(parsed) * 1000)
    except (ValueError, TypeError):
        try:
            parsed = time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
            return int(time.mktime(parsed) * 1000)
        except ValueError:
            return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--out", default="docs/data/polymarket.json")
    ap.add_argument("--fidelity", type=int, default=720, help="CLOB bar width in minutes")
    ap.add_argument("--min-ticks", type=int, default=5, help="skip markets with fewer ticks than this")
    args = ap.parse_args()

    print(f"[1/3] Discovering top {args.limit} resolved binary markets from Gamma…", flush=True)
    candidates = fetch_resolved_markets(target=int(args.limit * 1.4))
    print(f"  found {len(candidates)} resolved binary candidates", flush=True)

    print(f"[2/3] Fetching price history for each (CLOB, fidelity={args.fidelity}min)…", flush=True)
    records: list[dict] = []
    for i, m in enumerate(candidates):
        tok = yes_token_id(m)
        if not tok:
            continue
        hist = fetch_price_history(tok, fidelity=args.fidelity)
        if len(hist) < args.min_ticks:
            continue
        rec = build_market_record(m, hist)
        records.append(rec)
        if len(records) % 10 == 0 or i == len(candidates) - 1:
            print(f"  {len(records):>4} markets kept / {i+1} scanned "
                  f"| latest: {rec['marketTitle'][:60]!r} ({len(rec['ticks'])} ticks)",
                  flush=True)
        if len(records) >= args.limit:
            break
        time.sleep(0.08)

    print(f"[3/3] Writing {len(records)} markets to {args.out}", flush=True)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "platform": "polymarket",
        "source": "https://gamma-api.polymarket.com + https://clob.polymarket.com",
        "fetched_at_ms": int(time.time() * 1000),
        "market_count": len(records),
        "filter": f"closed=true, binary yes/no, outcomePrices resolved, top-{args.limit} by volume",
        "markets": records,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    total_bytes = out_path.stat().st_size
    print(f"Done. {len(records)} markets, {total_bytes:,} bytes.")


if __name__ == "__main__":
    main()
