// app.js — UI glue between the engine and the DOM.

import { generateMockEvents, runBacktest } from "./engine.js";
import {
  kellySizing,
  closingMomentum,
  contrarianUnderdog,
  favoriteLongshot,
  buyAndHold,
} from "./strategies.js";

// ---------- Strategy catalogue ----------
const CATALOGUE = {
  "kelly-sizing": {
    factory: (opts) => kellySizing({
      pOracle: (m) => m.yesPrice < 0.5 ? Math.min(0.95, m.yesPrice + 0.15)
                                        : Math.max(0.05, m.yesPrice - 0.15),
      assignedCapital: opts.bankroll,
      kellyFractionMultiplier: 0.25,
    }),
    theory: "Kelly sizing bets proportional to edge. Assumes you can estimate a better probability than the market. Quarter-Kelly reduces variance.",
    sliders: [],
  },
  "closing-momentum": {
    factory: (opts) => closingMomentum({
      assignedCapital: opts.bankroll,
      betFraction: opts.betFraction,
      momentumThreshold: 0.05,
      windowHours: 6,
    }),
    theory: "In the final hours before close, markets that have moved 5%+ from their window-open price tend to keep moving. Enters once per market.",
    sliders: [{ key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.20, step: 0.01, default: 0.05, format: (v) => `${(v*100).toFixed(0)}%` }],
  },
  "contrarian-underdog": {
    factory: (opts) => contrarianUnderdog({
      assignedCapital: opts.bankroll,
      betFraction: opts.betFraction,
      maxYesPrice: opts.threshold,
      windowHours: 3,
    }),
    theory: "Buys YES on markets priced below the threshold in the last 3 hours. Pays 3x+ when underdogs hit. Tests whether longshots are systematically underpriced.",
    sliders: [
      { key: "threshold", label: "Max YES price", min: 0.05, max: 0.50, step: 0.01, default: 0.30, format: (v) => v.toFixed(2) },
      { key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.20, step: 0.01, default: 0.05, format: (v) => `${(v*100).toFixed(0)}%` },
    ],
  },
  "favorite-longshot": {
    factory: (opts) => favoriteLongshot({
      assignedCapital: opts.bankroll,
      betFraction: opts.betFraction,
      minYesPrice: opts.threshold,
      windowHours: 3,
    }),
    theory: "Fades heavily-favored markets by buying NO when YES ≥ threshold. Tests the academic finding that favorites are systematically overpriced.",
    sliders: [
      { key: "threshold", label: "Min YES price", min: 0.55, max: 0.95, step: 0.01, default: 0.70, format: (v) => v.toFixed(2) },
      { key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.20, step: 0.01, default: 0.05, format: (v) => `${(v*100).toFixed(0)}%` },
    ],
  },
  "buy-and-hold": {
    factory: (opts) => buyAndHold({ assignedCapital: opts.bankroll, betFraction: opts.betFraction }),
    theory: "Naive baseline — buys YES at the opening price of every market. Useful as a 'what if I didn't think at all' reference.",
    sliders: [{ key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.20, step: 0.01, default: 0.05, format: (v) => `${(v*100).toFixed(0)}%` }],
  },
};

// ---------- State ----------
const state = {
  strategyId: "closing-momentum",
  seed: 42,
  nMarkets: 20,
  ticksPerMarket: 40,
  bankroll: 10_000,
  params: {},
  chart: null,
};

// ---------- Chart ----------
function renderChart(result) {
  const ctx = document.getElementById("equity-chart").getContext("2d");
  const data = result.equityCurve.map((p, i) => ({ x: i, y: p.equity }));
  if (state.chart) state.chart.destroy();
  state.chart = new window.Chart(ctx, {
    type: "line",
    data: {
      datasets: [{
        label: "Equity",
        data,
        borderColor: "#7dd3fc",
        backgroundColor: "rgba(125, 211, 252, 0.08)",
        borderWidth: 1.75,
        tension: 0.15,
        pointRadius: 0,
        fill: true,
      }, {
        label: "Starting bankroll",
        data: data.map(d => ({ x: d.x, y: state.bankroll })),
        borderColor: "rgba(255,255,255,0.20)",
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: {
        legend: { labels: { color: "#8ea0bd", font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#182236",
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          titleColor: "#e6edf7",
          bodyColor: "#d0d6e0",
          displayColors: false,
          callbacks: {
            title: (items) => `Tick ${items[0].parsed.x}`,
            label: (item) => `Equity: $${item.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#566178", font: { size: 11 } },
          title: { display: true, text: "Event tick", color: "#566178", font: { size: 11 } },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#566178", font: { size: 11 }, callback: (v) => `$${v.toLocaleString()}` },
        },
      },
    },
  });
}

// ---------- Metrics ----------
function fmt(value, { kind = "currency", prec = 2 } = {}) {
  if (value == null) return "—";
  if (kind === "currency") return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (kind === "pct") return `${(value * 100).toFixed(prec)}%`;
  if (kind === "signed-pct") return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(prec)}%`;
  if (kind === "decimal") return value.toFixed(prec);
  if (kind === "signed-dollar") {
    const sign = value >= 0 ? "+" : "−";
    return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

function setTile(id, value, deltaText, deltaClass) {
  document.getElementById(id).textContent = value;
  const deltaEl = document.getElementById(id + "-delta");
  if (deltaEl) {
    deltaEl.textContent = deltaText || "";
    deltaEl.className = "tile-delta " + (deltaClass || "");
  }
}

function renderResult(result) {
  const pnl = result.finalEquity - result.startingBankroll;
  const pnlPct = pnl / result.startingBankroll;
  const pnlClass = pnl >= 0 ? "pos" : "neg";
  setTile("tile-pnl", fmt(pnl, { kind: "signed-dollar" }), fmt(pnlPct, { kind: "signed-pct" }), pnlClass);
  setTile("tile-equity", fmt(result.finalEquity, { kind: "currency" }), `from $${result.startingBankroll.toLocaleString()}`, "dim");
  setTile("tile-sharpe", fmt(result.sharpe, { kind: "decimal", prec: 2 }), result.sharpe == null ? "insufficient data" : result.sharpe > 1 ? "good" : result.sharpe > 0 ? "marginal" : "poor", resultClass(result.sharpe, 0, 1));
  setTile("tile-brier", fmt(result.brier, { kind: "decimal", prec: 3 }), result.brier == null ? "no forecasts" : result.brier < 0.20 ? "well-calibrated" : result.brier < 0.25 ? "near coin-flip" : "overconfident", resultClass(result.brier, 0.25, 0.20, true));
  setTile("tile-drawdown", fmt(result.drawdown, { kind: "pct", prec: 1 }), result.drawdown < 0.1 ? "mild" : result.drawdown < 0.25 ? "moderate" : "severe", result.drawdown < 0.15 ? "pos" : result.drawdown < 0.30 ? "warn" : "neg");
  setTile("tile-winrate", fmt(result.winRate, { kind: "pct", prec: 1 }), result.winRate == null ? "no closed trades" : `${result.closedPositions.length} closed`, "dim");
  setTile("tile-trades", String(result.tradeList.length), `${result.closedPositions.length} closed`, "dim");
  setTile("tile-bankrupt", result.bankrupt ? "yes" : "no", result.bankrupt ? "equity hit zero" : "solvent", result.bankrupt ? "neg" : "pos");

  renderChart(result);
  renderTradeTable(result);
}

function resultClass(value, badBelow, goodAbove, lowIsGood = false) {
  if (value == null) return "dim";
  if (lowIsGood) {
    if (value <= goodAbove) return "pos";
    if (value >= badBelow) return "neg";
    return "warn";
  }
  if (value >= goodAbove) return "pos";
  if (value <= badBelow) return "neg";
  return "warn";
}

function renderTradeTable(result) {
  const tbody = document.getElementById("trade-tbody");
  tbody.innerHTML = "";
  const rows = result.tradeList.slice(0, 50);
  for (const f of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono dim">${f.timestamp}</td>
      <td>${f.marketId}</td>
      <td><span class="side-pill ${f.side}">${f.orderSide.toUpperCase()} ${f.side.toUpperCase()}</span></td>
      <td class="num mono">${f.size}</td>
      <td class="num mono">${f.fillPrice.toFixed(3)}</td>
      <td class="num mono">${(f.fillPrice * f.size).toFixed(2)}</td>`;
    tbody.appendChild(tr);
  }
  document.getElementById("trade-count").textContent = `${result.tradeList.length} trade${result.tradeList.length === 1 ? "" : "s"}`;
  if (result.tradeList.length > rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="dim" style="text-align:center">… and ${result.tradeList.length - rows.length} more</td>`;
    tbody.appendChild(tr);
  }
}

// ---------- Run ----------
function run() {
  const cfg = CATALOGUE[state.strategyId];
  document.getElementById("theory-text").textContent = cfg.theory;

  const strategy = cfg.factory({
    bankroll: state.bankroll,
    betFraction: state.params.betFraction ?? 0.05,
    threshold: state.params.threshold ?? 0.30,
  });

  const events = generateMockEvents({
    seed: state.seed,
    nMarkets: state.nMarkets,
    ticksPerMarket: state.ticksPerMarket,
    bookTopSize: 400,
  });

  const result = runBacktest({ strategy, events, bankroll: state.bankroll });
  renderResult(result);
  document.getElementById("run-count").textContent =
    `${state.nMarkets} synthetic markets × ${state.ticksPerMarket} ticks · seed ${state.seed}`;
}

// ---------- UI wiring ----------
function buildStrategyTabs() {
  const row = document.getElementById("strategy-tabs");
  row.innerHTML = "";
  for (const [id, cfg] of Object.entries(CATALOGUE)) {
    const btn = document.createElement("button");
    btn.textContent = cfg.factory({ bankroll: 10000, betFraction: 0.05, threshold: 0.30 }).displayName;
    btn.className = "tab" + (id === state.strategyId ? " active" : "");
    btn.dataset.id = id;
    btn.addEventListener("click", () => {
      state.strategyId = id;
      state.params = {};
      for (const s of (CATALOGUE[id].sliders || [])) state.params[s.key] = s.default;
      buildStrategyTabs();
      buildSliders();
      run();
    });
    row.appendChild(btn);
  }
}

function buildSliders() {
  const wrap = document.getElementById("strategy-sliders");
  wrap.innerHTML = "";
  const cfg = CATALOGUE[state.strategyId];
  for (const s of (cfg.sliders || [])) {
    if (!(s.key in state.params)) state.params[s.key] = s.default;
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `
      <div class="slider-label">
        <span>${s.label}</span>
        <span class="slider-value mono" id="sv-${s.key}">${s.format(state.params[s.key])}</span>
      </div>
      <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${state.params[s.key]}" id="sl-${s.key}" />`;
    wrap.appendChild(row);
    const slider = row.querySelector(`#sl-${s.key}`);
    slider.addEventListener("input", (e) => {
      state.params[s.key] = parseFloat(e.target.value);
      row.querySelector(`#sv-${s.key}`).textContent = s.format(state.params[s.key]);
    });
    slider.addEventListener("change", run);
  }
}

function buildRunControls() {
  document.getElementById("bankroll-input").addEventListener("change", (e) => {
    const v = Math.max(100, Math.floor(parseFloat(e.target.value) || 10_000));
    state.bankroll = v;
    e.target.value = v;
    run();
  });
  document.getElementById("seed-input").addEventListener("change", (e) => {
    state.seed = parseInt(e.target.value || "42", 10);
    run();
  });
  document.getElementById("markets-input").addEventListener("change", (e) => {
    state.nMarkets = Math.max(1, Math.min(100, parseInt(e.target.value || "20", 10)));
    e.target.value = state.nMarkets;
    run();
  });
  document.getElementById("reseed-button").addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 9999);
    document.getElementById("seed-input").value = state.seed;
    run();
  });
  document.getElementById("rerun-button").addEventListener("click", run);
}

// ---------- Boot ----------
function boot() {
  for (const s of (CATALOGUE[state.strategyId].sliders || [])) state.params[s.key] = s.default;
  buildStrategyTabs();
  buildSliders();
  buildRunControls();
  run();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
