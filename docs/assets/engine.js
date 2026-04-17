// engine.js — Browser port of predmarkets engine (Python → JS)
// Source: src/predmarkets/engine/*.py + metrics/*.py + adapters/mock_adapter.py

// ---------- Deterministic PRNG (mulberry32) ----------
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Metrics ----------
export function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function brierScore(forecasts, outcomes) {
  if (forecasts.length !== outcomes.length) throw new Error("length mismatch");
  if (forecasts.length === 0) return null;
  let s = 0;
  for (let i = 0; i < forecasts.length; i++) {
    const e = forecasts[i] - outcomes[i];
    s += e * e;
  }
  return s / forecasts.length;
}

export function sharpeRatio(returns, rf = 0, annF = 252) {
  if (returns.length < 2) return null;
  const excess = returns.map(r => r - rf);
  const sigma = stdev(excess);
  if (sigma === 0) return null;
  return (mean(excess) / sigma) * Math.sqrt(annF);
}

export function sortinoRatio(returns, target = 0, annF = 252) {
  if (returns.length < 2) return null;
  const excess = returns.map(r => r - target);
  const downside = excess.map(e => Math.min(0, e) ** 2);
  const dVar = downside.reduce((a, b) => a + b, 0) / downside.length;
  if (dVar === 0) return null;
  return (mean(excess) / Math.sqrt(dVar)) * Math.sqrt(annF);
}

export function maxDrawdown(curve) {
  if (!curve.length) return 0;
  let peak = curve[0], maxDd = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export function winRate(closedPositions) {
  const eligible = closedPositions.filter(p => !p.wasCancelled);
  if (eligible.length === 0) return null;
  const wins = eligible.filter(p => p.realisedPnl > 0).length;
  return wins / eligible.length;
}

export function kellyFraction(p, marketPrice, side) {
  if (p < 0 || p > 1) throw new Error("p out of range");
  if (marketPrice <= 0 || marketPrice >= 1) return 0;
  if (side !== "yes" && side !== "no") throw new Error("bad side");
  let b, pEff, q;
  if (side === "yes") {
    b = (1 - marketPrice) / marketPrice;
    pEff = p;
  } else {
    b = marketPrice / (1 - marketPrice);
    pEff = 1 - p;
  }
  q = 1 - pEff;
  const fStar = (b * pEff - q) / b;
  if (fStar <= 0) return 0;
  return Math.min(1, Math.max(0, fStar));
}

// ---------- Slippage ----------
export function slippageFillPrice(mid, size, orderSide, bookTopSize) {
  if (mid <= 0 || mid >= 1) throw new Error("mid out of (0,1)");
  if (size <= 0) throw new Error("size <= 0");
  const topSize = Math.max(1, bookTopSize);
  const base = 0.01;
  let fill = orderSide === "buy" ? mid + base : mid - base;
  if (size > topSize) {
    const excessTiers = Math.ceil((size - topSize) / topSize);
    const extra = 0.01 * excessTiers;
    fill += orderSide === "buy" ? extra : -extra;
  }
  return Math.max(0, Math.min(1, fill));
}

// ---------- Real adapter: load resolved Manifold markets from a JSON dataset ----------
// Dataset produced by scripts/fetch_manifold.py (pulls real bets from api.manifold.markets).
export async function loadManifoldDataset(url = "data/manifold.json") {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load ${url}: ${resp.status}`);
  return await resp.json();
}

export function manifoldDatasetToEvents(payload, { shuffleSeed = 0, nMarkets = 0 } = {}) {
  const allMarkets = Array.isArray(payload.markets) ? payload.markets.slice() : [];
  const markets = shuffleSeed > 0 ? deterministicShuffle(allMarkets, shuffleSeed) : allMarkets;
  const selected = nMarkets > 0 ? markets.slice(0, nMarkets) : markets;
  const events = [];
  const titleByKey = new Map();
  let t = 0;
  for (const m of selected) {
    titleByKey.set(`${m.platform}|${m.marketId}`, m.marketTitle);
    const ticks = Array.isArray(m.ticks) ? m.ticks : [];
    for (const tick of ticks) {
      events.push({
        t: t++,
        platform: m.platform,
        marketId: m.marketId,
        marketTitle: m.marketTitle,
        yesPrice: Math.max(0.02, Math.min(0.98, tick.yesPrice)),
        // Manifold is a constant-function market maker (CFMM), not an order book.
        // Retail-sized bets don't meaningfully move price — skip the tier-walking penalty
        // by setting book depth very high. Remaining fills pay only the 1¢ base slippage.
        bookTopSize: 10_000_000,
        eventType: "tick",
        closeInHours: Math.max(0.1, tick.closeInHours ?? 24),
        resolution: "",
      });
    }
    events.push({
      t: t++,
      platform: m.platform,
      marketId: m.marketId,
      marketTitle: m.marketTitle,
      yesPrice: m.resolution === "yes" ? 1 : 0,
      bookTopSize: 1000,
      eventType: "resolution",
      resolution: m.resolution,
      closeInHours: 0,
    });
  }
  return { events, titleByKey, selectedMarkets: selected };
}

function deterministicShuffle(arr, seed) {
  const rng = makeRng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Mock adapter (kept only for engine testing / fallback) ----------
export function generateMockEvents(opts = {}) {
  const {
    seed = 1,
    nMarkets = 10,
    ticksPerMarket = 40,
    trueProbabilities = null,
    bookTopSize = 400,
  } = opts;

  const rng = makeRng(seed);
  const events = [];
  const defaultProbs = [0.7, 0.3, 0.55, 0.5, 0.8, 0.2, 0.65, 0.35];
  const probs = trueProbabilities && trueProbabilities.length
    ? Array.from({ length: nMarkets }, (_, i) => trueProbabilities[i % trueProbabilities.length])
    : Array.from({ length: nMarkets }, (_, i) => defaultProbs[i % defaultProbs.length]);

  let t = 0;
  for (let m = 0; m < nMarkets; m++) {
    const mid = `mock-${String(m).padStart(3, "0")}`;
    const title = `Synthetic market ${m}`;
    let price = 0.5;
    for (let tick = 0; tick < ticksPerMarket; tick++) {
      const drift = (probs[m] - price) * 0.04;
      const noise = (rng() - 0.5) * 0.04;
      price = Math.max(0.02, Math.min(0.98, price + drift + noise));
      events.push({
        t: t++,
        platform: "mock",
        marketId: mid,
        marketTitle: title,
        yesPrice: price,
        bookTopSize,
        eventType: "tick",
        closeInHours: Math.max(1, ticksPerMarket - tick),
        resolution: "",
      });
    }
    // Resolution
    const outcome = rng() < probs[m] ? "yes" : "no";
    events.push({
      t: t++,
      platform: "mock",
      marketId: mid,
      marketTitle: title,
      yesPrice: outcome === "yes" ? 1 : 0,
      bookTopSize,
      eventType: "resolution",
      resolution: outcome,
      closeInHours: 0,
    });
  }
  return events.sort((a, b) => a.t - b.t);
}

// ---------- Portfolio ----------
export function createPortfolio(bankroll) {
  return {
    startingBankroll: bankroll,
    cash: bankroll,
    positions: new Map(),  // key = `${platform}|${mid}|${side}`
    allFills: [],
    closedPositions: [],
  };
}

export function applyFill(portfolio, fill) {
  portfolio.allFills.push(fill);
  const key = `${fill.platform}|${fill.marketId}|${fill.side}`;
  portfolio.cash -= fill.fillPrice * fill.size;
  const existing = portfolio.positions.get(key);
  if (!existing) {
    portfolio.positions.set(key, {
      platform: fill.platform,
      marketId: fill.marketId,
      side: fill.side,
      size: fill.size,
      avgEntry: fill.fillPrice,
      entryT: fill.timestamp,
      closed: false,
      realisedPnl: 0,
      wasCancelled: false,
    });
    return;
  }
  const newSize = existing.size + fill.size;
  existing.avgEntry = (existing.avgEntry * existing.size + fill.fillPrice * fill.size) / newSize;
  existing.size = newSize;
}

export function settleResolution(portfolio, platform, marketId, outcome) {
  const closed = [];
  for (const side of ["yes", "no"]) {
    const key = `${platform}|${marketId}|${side}`;
    const pos = portfolio.positions.get(key);
    if (!pos || pos.closed) continue;
    if (outcome === "cancelled") {
      portfolio.cash += pos.avgEntry * pos.size;  // refund cost (OQ-03)
      pos.wasCancelled = true;
      pos.realisedPnl = 0;
    } else {
      const payout = side === outcome ? 1 : 0;
      portfolio.cash += payout * pos.size;
      pos.realisedPnl = (payout - pos.avgEntry) * pos.size;
    }
    pos.closed = true;
    closed.push(pos);
    portfolio.closedPositions.push(pos);
  }
  return closed;
}

export function markEquity(portfolio, latestPrices) {
  let unrealised = 0;
  for (const [key, pos] of portfolio.positions) {
    if (pos.closed) continue;
    const latest = latestPrices.get(`${pos.platform}|${pos.marketId}`) ?? pos.avgEntry;
    const mark = pos.side === "yes" ? latest : 1 - latest;
    unrealised += (mark - pos.avgEntry) * pos.size;
  }
  return portfolio.cash + unrealised;
}

// ---------- Backtester ----------
export function runBacktest({ strategy, events, bankroll }) {
  const portfolio = createPortfolio(bankroll);
  const equityCurve = [];
  const latest = new Map();
  let bankrupt = false;

  for (const event of events) {
    const equityNow = markEquity(portfolio, latest);
    if (equityNow <= 0) {
      bankrupt = true;
      equityCurve.push({ t: event.t, equity: 0 });
      break;
    }
    latest.set(`${event.platform}|${event.marketId}`, event.yesPrice);

    const state = {
      t: event.t,
      markets: [{
        platform: event.platform,
        marketId: event.marketId,
        marketTitle: event.marketTitle,
        yesPrice: event.yesPrice,
        noPrice: 1 - event.yesPrice,
        closeInHours: event.closeInHours,
      }],
    };
    const orders = strategy.decide(state);
    for (const order of orders) {
      const mid = order.side === "yes" ? event.yesPrice : 1 - event.yesPrice;
      const clampedMid = Math.max(0.01, Math.min(0.99, mid));
      const fillPrice = slippageFillPrice(clampedMid, order.size, order.orderSide, event.bookTopSize);
      const fill = {
        timestamp: event.t,
        platform: order.platform,
        marketId: order.marketId,
        side: order.side,
        orderSide: order.orderSide,
        size: order.size,
        fillPrice,
        strategyId: order.strategyId,
      };
      applyFill(portfolio, fill);
      strategy.onFill(fill);
    }
    if (event.eventType === "resolution") {
      settleResolution(portfolio, event.platform, event.marketId, event.resolution || "cancelled");
    }
    equityCurve.push({ t: event.t, equity: markEquity(portfolio, latest) });
  }

  const equityValues = equityCurve.map(p => p.equity);
  const dailyReturns = [];
  for (let i = 1; i < equityValues.length; i++) {
    if (equityValues[i - 1] > 0) {
      dailyReturns.push(equityValues[i] / equityValues[i - 1] - 1);
    }
  }
  const forecasts = [], outcomes = [];
  for (const pos of portfolio.closedPositions) {
    if (pos.wasCancelled) continue;
    forecasts.push(pos.side === "yes" ? pos.avgEntry : 1 - pos.avgEntry);
    outcomes.push(pos.realisedPnl > 0 ? 1 : 0);
  }

  return {
    finalEquity: equityValues.length ? equityValues[equityValues.length - 1] : portfolio.cash,
    startingBankroll: bankroll,
    equityCurve,
    tradeList: portfolio.allFills,
    closedPositions: portfolio.closedPositions,
    sharpe: sharpeRatio(dailyReturns),
    sortino: sortinoRatio(dailyReturns),
    brier: forecasts.length ? brierScore(forecasts, outcomes) : null,
    drawdown: maxDrawdown(equityValues),
    winRate: winRate(portfolio.closedPositions),
    bankrupt,
  };
}
