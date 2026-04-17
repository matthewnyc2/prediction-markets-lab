// strategies.js — Browser port of src/predmarkets/strategies/*.py
// Same public shape: each strategy has {strategyId, displayName, decide, onFill}
//
// SIZING INVARIANTS (every strategy must obey these):
//   1. Bets are sized off state.accountValue (current mark-to-market equity),
//      NOT a fixed reference from the strategy's open.  That way winnings
//      compound and losses shrink future bet size.
//   2. Each bet is clamped to state.cash (available settled cash).  The
//      strategy cannot spend money it doesn't have.  The margin check in
//      engine.applyFill rejects over-drafts defensively, but the strategy
//      should never even try to place one.

import { kellyFraction } from "./engine.js";

function mkOrder(platform, marketId, side, size, strategyId) {
  return { platform, marketId, side, orderSide: "buy", size, strategyId };
}

// How much dollars this strategy is willing to risk on ONE bet right now.
// Uses current account value × bet fraction, then clamps to available cash.
function sizeOne(state, fallbackCapital, betFraction) {
  const capital = state.accountValue != null ? state.accountValue : fallbackCapital;
  const cash = state.cash != null ? state.cash : capital;
  const want = betFraction * capital;
  return Math.max(0, Math.min(cash, want));
}

// ---------- Kelly sizing ----------
export function kellySizing({ pOracle, kellyFractionMultiplier = 0.25, assignedCapital = 10_000, minCloseHours = 1.0 } = {}) {
  const entered = new Set();
  const fills = [];
  return {
    strategyId: "kelly-sizing",
    displayName: "Kelly sizing",
    description: "Sizes bets proportional to edge vs an oracle probability. Quarter-Kelly by default to cap variance.",
    decide(state) {
      const orders = [];
      const cash = state.cash != null ? state.cash : assignedCapital;
      const capital = state.accountValue != null ? state.accountValue : assignedCapital;
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.closeInHours < minCloseHours) continue;
        const p = pOracle(m);
        if (p == null) continue;
        const tryOne = (side) => {
          const price = side === "yes" ? m.yesPrice : m.noPrice;
          const fStar = kellyFraction(p, m.yesPrice, side);
          if (fStar <= 0 || price <= 0) return null;
          const want = kellyFractionMultiplier * fStar * capital;
          const bet = Math.max(0, Math.min(cash, want));
          const size = Math.floor(bet / price);
          if (size < 1) return null;
          return mkOrder(m.platform, m.marketId, side, size, "kelly-sizing");
        };
        const o = tryOne("yes") || tryOne("no");
        if (o) orders.push(o);
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Closing momentum ----------
export function closingMomentum({ windowHours = 6.0, momentumThreshold = 0.05, betFraction = 0.05, assignedCapital = 10_000 } = {}) {
  const entered = new Set();
  const anchor = new Map();
  const fills = [];
  return {
    strategyId: "closing-momentum",
    displayName: "Closing momentum",
    description: "In the final N hours before close, ride the price if it has moved more than threshold from its window-open value.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.closeInHours > windowHours || m.closeInHours <= 0) continue;
        if (!anchor.has(key)) anchor.set(key, m.yesPrice);
        const a = anchor.get(key);
        if (a <= 0) continue;
        const momentum = (m.yesPrice - a) / a;
        let side = null;
        if (momentum >= momentumThreshold) side = "yes";
        else if (momentum <= -momentumThreshold) side = "no";
        if (!side) continue;
        const price = side === "yes" ? m.yesPrice : m.noPrice;
        if (price <= 0) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / price);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, side, size, "closing-momentum"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Contrarian underdog ----------
export function contrarianUnderdog({ maxYesPrice = 0.30, windowHours = 3.0, betFraction = 0.05, assignedCapital = 10_000 } = {}) {
  const entered = new Set();
  const fills = [];
  return {
    strategyId: "contrarian-underdog",
    displayName: "Contrarian underdog",
    description: "In the final hours, buy YES on any market priced below a cutoff — underdog longshots often outperform their implied probability.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.closeInHours > windowHours || m.closeInHours <= 0) continue;
        if (m.yesPrice > maxYesPrice) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / m.yesPrice);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, "yes", size, "contrarian-underdog"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Favorite-longshot ----------
export function favoriteLongshot({ minYesPrice = 0.70, windowHours = 3.0, betFraction = 0.05, assignedCapital = 10_000 } = {}) {
  const entered = new Set();
  const fills = [];
  return {
    strategyId: "favorite-longshot",
    displayName: "Favorite-longshot fade",
    description: "Fade overpriced favorites: buy NO when market prices YES at 70%+. Exploits the well-documented overpricing of heavy favorites in prediction markets.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.closeInHours > windowHours || m.closeInHours <= 0) continue;
        if (m.yesPrice < minYesPrice) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / m.noPrice);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, "no", size, "favorite-longshot"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Inverse baseline: buy NO on everything ----------
export function sellAndHold({ assignedCapital = 10_000, betFraction = 0.05 } = {}) {
  const entered = new Set();
  const fills = [];
  return {
    strategyId: "sell-and-hold",
    displayName: "Buy NO at open",
    description: "Inverse baseline: buys NO on every new market at its opening price. On Polymarket where most 'will X win?' markets resolve NO, this is the short-bias default.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.noPrice <= 0) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / m.noPrice);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, "no", size, "sell-and-hold"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Mean reversion: buy YES after a sharp drop ----------
export function meanReversion({ dropThreshold = 0.15, lookbackHours = 48, betFraction = 0.03, assignedCapital = 10_000, maxEntryPrice = 0.85 } = {}) {
  const entered = new Set();
  const priceHistory = new Map();
  const fills = [];
  return {
    strategyId: "mean-reversion",
    displayName: "Mean-reversion bounce",
    description: "Buys YES after the price drops by the threshold in the lookback window. Bets that sharp drops overshoot and bounce back.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.yesPrice > maxEntryPrice) continue;
        const hist = priceHistory.get(key) || [];
        hist.push({ t: state.t, yesPrice: m.yesPrice });
        const windowTicks = Math.max(1, Math.round(lookbackHours / 12));
        if (hist.length > windowTicks + 1) hist.shift();
        priceHistory.set(key, hist);
        if (hist.length < 2) continue;
        const peak = Math.max(...hist.map(p => p.yesPrice));
        const drop = (peak - m.yesPrice) / peak;
        if (drop < dropThreshold) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / m.yesPrice);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, "yes", size, "mean-reversion"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Confirmed favorite: trust high-priced favorites near close ----------
export function confirmedFavorite({ minYesPrice = 0.85, windowHours = 96, betFraction = 0.03, assignedCapital = 10_000 } = {}) {
  const entered = new Set();
  const fills = [];
  return {
    strategyId: "confirmed-favorite",
    displayName: "Ride confirmed favorites",
    description: "Buys YES on heavy favorites (≥ threshold) in the final window before close. Tests whether late-stage high prices correctly predict YES resolution.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        if (m.closeInHours > windowHours || m.closeInHours <= 0) continue;
        if (m.yesPrice < minYesPrice) continue;
        if (m.yesPrice >= 1) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / m.yesPrice);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, "yes", size, "confirmed-favorite"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}

// ---------- Passive baseline (for comparison) ----------
export function buyAndHold({ assignedCapital = 10_000, betFraction = 0.05 } = {}) {
  const entered = new Set();
  const fills = [];
  return {
    strategyId: "buy-and-hold",
    displayName: "Buy YES at open",
    description: "Naive baseline: buys YES on every new market at its opening price with a fixed fraction of capital.",
    decide(state) {
      const orders = [];
      for (const m of state.markets) {
        const key = `${m.platform}|${m.marketId}`;
        if (entered.has(key)) continue;
        const bet = sizeOne(state, assignedCapital, betFraction);
        const size = Math.floor(bet / m.yesPrice);
        if (size < 1) continue;
        orders.push(mkOrder(m.platform, m.marketId, "yes", size, "buy-and-hold"));
      }
      return orders;
    },
    onFill(fill) {
      fills.push(fill);
      entered.add(`${fill.platform}|${fill.marketId}`);
    },
  };
}
