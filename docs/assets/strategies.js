// strategies.js — Browser port of src/predmarkets/strategies/*.py
// Same public shape: each strategy has {strategyId, displayName, decide, onFill}

import { kellyFraction } from "./engine.js";

// ---------- helpers ----------
function mkOrder(platform, marketId, side, size, strategyId) {
  return { platform, marketId, side, orderSide: "buy", size, strategyId };
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
          const bet = kellyFractionMultiplier * fStar * assignedCapital;
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
        const bet = betFraction * assignedCapital;
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
        const bet = betFraction * assignedCapital;
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
        const bet = betFraction * assignedCapital;
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
        const bet = betFraction * assignedCapital;
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
