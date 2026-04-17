// app.js — Portfolio UI glue. Hooks engine.js + strategies.js to the new layout.

import { loadManifoldDataset, manifoldDatasetToEvents, runBacktest } from "./engine.js";
import {
  kellySizing, closingMomentum, contrarianUnderdog, favoriteLongshot, buyAndHold,
} from "./strategies.js";

// ---------- Strategy catalogue ----------
const CATALOGUE = [
  {
    id: "closing-momentum",
    name: "Closing momentum",
    blurb: "Ride 5%+ moves in the final hours before close. Enters each market once.",
    theory: "In the final 6 hours before close, markets that have moved 5%+ from their window-open price tend to keep moving. Enters once per market.",
    factory: (opts) => closingMomentum({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      momentumThreshold: 0.05, windowHours: 6,
    }),
    slider: { key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.10, step: 0.01, default: 0.03,
              format: (v) => `${(v*100).toFixed(0)}%` },
  },
  {
    id: "contrarian-underdog",
    name: "Contrarian underdog",
    blurb: "Buy YES on longshots priced below threshold. Tests whether underdogs are underpriced.",
    theory: "Buys YES on markets priced below the threshold in the last 3 hours. Pays 3x+ when underdogs hit.",
    factory: (opts) => contrarianUnderdog({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      maxYesPrice: opts.threshold, windowHours: 3,
    }),
    slider: { key: "threshold", label: "Max YES price", min: 0.05, max: 0.50, step: 0.01, default: 0.30,
              format: (v) => v.toFixed(2) },
  },
  {
    id: "favorite-longshot",
    name: "Favorite-longshot fade",
    blurb: "Fade heavy favorites by buying NO. Tests overpricing of locks.",
    theory: "Fades heavily-favored markets by buying NO when YES ≥ threshold. Tests the academic finding that favorites are overpriced.",
    factory: (opts) => favoriteLongshot({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      minYesPrice: opts.threshold, windowHours: 3,
    }),
    slider: { key: "threshold", label: "Min YES price", min: 0.55, max: 0.95, step: 0.01, default: 0.70,
              format: (v) => v.toFixed(2) },
  },
  {
    id: "kelly-sizing",
    name: "Kelly sizing",
    blurb: "Quarter-Kelly bets with an oracle that pushes price toward 50%.",
    theory: "Kelly sizing bets proportional to edge. Oracle here pushes prices toward 50% (crude mean-reversion). Quarter-Kelly to reduce variance.",
    factory: (opts) => kellySizing({
      pOracle: (m) => m.yesPrice < 0.5 ? Math.min(0.85, m.yesPrice + 0.15) : Math.max(0.15, m.yesPrice - 0.15),
      assignedCapital: opts.bankroll, kellyFractionMultiplier: 0.25,
    }),
    slider: null,
  },
  {
    id: "buy-and-hold",
    name: "Buy YES at open",
    blurb: "Naive baseline — buys YES on every market at its opening price.",
    theory: "Naive baseline — buys YES at the opening price of every market. Everything else should beat this.",
    factory: (opts) => buyAndHold({ assignedCapital: opts.bankroll, betFraction: opts.betFraction }),
    slider: { key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.10, step: 0.01, default: 0.03,
              format: (v) => `${(v*100).toFixed(0)}%` },
  },
];
const BY_ID = Object.fromEntries(CATALOGUE.map(c => [c.id, c]));

// ---------- State ----------
const state = {
  strategyId: "closing-momentum",
  shuffleSeed: 1,
  nMarkets: 120,
  bankroll: 10_000,
  params: {},
  chart: null,
  dataset: null,
  titleByKey: new Map(),
};

// ---------- Utility ----------
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function fmtMoney(v, { sign = false } = {}) {
  if (v == null) return "—";
  const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sign) return "$" + s;
  return (v >= 0 ? "+" : "−") + "$" + s;
}
function fmtPct(v, { sign = false, digits = 1 } = {}) {
  if (v == null) return "—";
  const s = (v * 100).toFixed(digits) + "%";
  if (!sign) return s;
  return (v >= 0 ? "+" : "") + s;
}

// ---------- Strategy deck ----------
function renderStrategyDeck() {
  const deck = $("strategy-deck");
  deck.innerHTML = "";
  for (const cfg of CATALOGUE) {
    const btn = document.createElement("button");
    btn.className = "strat-card" + (cfg.id === state.strategyId ? " active" : "");
    btn.innerHTML = `<div class="name">${escapeHtml(cfg.name)}</div><div class="desc">${escapeHtml(cfg.blurb)}</div>`;
    btn.addEventListener("click", () => selectStrategy(cfg.id));
    deck.appendChild(btn);
  }
}

function selectStrategy(id) {
  state.strategyId = id;
  state.params = {};
  const cfg = BY_ID[id];
  if (cfg.slider) state.params[cfg.slider.key] = cfg.slider.default;
  renderStrategyDeck();
  renderSliderSlot();
  runPrimary();
}

// ---------- Slider slot ----------
function renderSliderSlot() {
  const slot = $("slider-slot");
  const cfg = BY_ID[state.strategyId];
  if (!cfg.slider) {
    slot.innerHTML = `<label>&nbsp;</label><div class="dim" style="font-size:12px;padding:10px 0">No tunable parameter</div>`;
    return;
  }
  const s = cfg.slider;
  slot.innerHTML = `
    <div class="slider-head"><label style="margin:0">${s.label}</label><span class="val" id="sv-${s.key}">${s.format(state.params[s.key])}</span></div>
    <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${state.params[s.key]}" id="sl-${s.key}" />
  `;
  const input = $("sl-" + s.key);
  input.addEventListener("input", (e) => {
    state.params[s.key] = parseFloat(e.target.value);
    $("sv-" + s.key).textContent = s.format(state.params[s.key]);
  });
  input.addEventListener("change", runPrimary);
}

// ---------- Chart ----------
function renderChart(result) {
  const ctx = $("equity-chart").getContext("2d");
  const data = result.equityCurve.map((p, i) => ({ x: i, y: p.equity }));
  if (state.chart) state.chart.destroy();
  state.chart = new window.Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Equity", data,
          borderColor: "#7dd3fc", backgroundColor: "rgba(125, 211, 252, 0.09)",
          borderWidth: 2, tension: 0.2, pointRadius: 0, fill: true,
        },
        {
          label: "Starting bankroll",
          data: data.map(d => ({ x: d.x, y: state.bankroll })),
          borderColor: "rgba(255,255,255,0.20)", borderWidth: 1.2, borderDash: [5, 5],
          pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#161d2e", borderColor: "rgba(255,255,255,0.10)", borderWidth: 1,
          titleColor: "#f2f5fb", bodyColor: "#c6cfe0", displayColors: false, padding: 10,
          callbacks: {
            title: (items) => `Event ${items[0].parsed.x}`,
            label: (item) => `$${item.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          },
        },
      },
      scales: {
        x: { type: "linear", grid: { color: "rgba(255,255,255,0.04)" },
             ticks: { color: "#4e5a73", font: { size: 11 } },
             title: { display: false } },
        y: { grid: { color: "rgba(255,255,255,0.04)" },
             ticks: { color: "#4e5a73", font: { size: 11 }, callback: (v) => "$" + v.toLocaleString() } },
      },
    },
  });
}

// ---------- Metric rendering ----------
function metricClass(value, badBelow, goodAbove, lowIsGood = false) {
  if (value == null) return "";
  if (lowIsGood) return value <= goodAbove ? "pos" : value >= badBelow ? "neg" : "warn";
  return value >= goodAbove ? "pos" : value <= badBelow ? "neg" : "warn";
}

function setMetric(id, value, hint, cls) {
  const v = $(id);
  v.textContent = value;
  v.className = "val " + (cls || "");
  const h = $(id + "-hint");
  if (h) h.textContent = hint || h.textContent;
}

function renderResult(result) {
  const pnl = result.finalEquity - result.startingBankroll;
  const pnlPct = pnl / result.startingBankroll;
  const cfg = BY_ID[state.strategyId];

  // Primary PnL
  const pnlBig = $("pnl-big");
  pnlBig.textContent = fmtMoney(pnl, { sign: true });
  pnlBig.className = "pnl-big " + (pnl >= 0 ? "pos" : "neg");

  // Caption
  const capt = $("pnl-caption");
  const pctClass = pnl >= 0 ? "pos" : "neg";
  const outcome = result.bankrupt
    ? "Strategy went bankrupt — spent entire bankroll during the run."
    : pnl > 500 ? "Solidly profitable across the dataset."
    : pnl > 0 ? "Barely positive. Wins covered losses but no meaningful edge."
    : pnl > -1000 ? "Small loss — roughly at the coin-flip level after fees."
    : "Significant loss. Slippage and wrong-side bets dominated.";
  capt.innerHTML = `<span class="pct ${pctClass}">${fmtPct(pnlPct, { sign: true })}</span>${outcome}`;

  // Summary box
  $("active-strategy-name").textContent = cfg.name.toUpperCase();
  $("theory-text").textContent = cfg.theory;

  // Metric strip
  setMetric("m-sharpe",
    result.sharpe == null ? "—" : result.sharpe.toFixed(2),
    result.sharpe == null ? "insufficient data" : result.sharpe > 1 ? "good" : result.sharpe > 0 ? "marginal" : "poor",
    metricClass(result.sharpe, 0, 1));
  setMetric("m-drawdown",
    fmtPct(result.drawdown, { digits: 1 }),
    result.drawdown < 0.10 ? "mild" : result.drawdown < 0.25 ? "moderate" : "severe",
    result.drawdown < 0.15 ? "pos" : result.drawdown < 0.30 ? "warn" : "neg");
  setMetric("m-winrate",
    result.winRate == null ? "—" : fmtPct(result.winRate),
    `${result.closedPositions.length} positions closed`, "");
  setMetric("m-brier",
    result.brier == null ? "—" : result.brier.toFixed(3),
    result.brier == null ? "no forecasts" : result.brier < 0.20 ? "well-calibrated" : result.brier < 0.25 ? "near coin-flip" : "overconfident",
    metricClass(result.brier, 0.25, 0.20, true));
  setMetric("m-trades",
    String(result.tradeList.length), "total fills", "");
  setMetric("m-bankrupt",
    result.bankrupt ? "YES" : "NO",
    result.bankrupt ? "equity hit zero" : "solvent through the run",
    result.bankrupt ? "neg" : "pos");

  renderChart(result);
  renderTrades(result);
  $("chart-subhead").textContent = `${result.tradeList.length} trades · starting $${result.startingBankroll.toLocaleString()}`;
}

// ---------- Trades drawer ----------
function renderTrades(result) {
  const tbody = $("trade-tbody");
  tbody.innerHTML = "";
  const rows = result.tradeList.slice(0, 100);
  for (const f of rows) {
    const title = state.titleByKey.get(`${f.platform}|${f.marketId}`) || f.marketId;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono dim">${f.timestamp}</td>
      <td title="${escapeHtml(title)}">${escapeHtml(title.length > 56 ? title.slice(0, 56) + "…" : title)}</td>
      <td><span class="side-pill ${f.side}">${f.orderSide} ${f.side}</span></td>
      <td class="num">${f.size.toLocaleString()}</td>
      <td class="num">${f.fillPrice.toFixed(3)}</td>
      <td class="num">${(f.fillPrice * f.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>`;
    tbody.appendChild(tr);
  }
  if (result.tradeList.length > rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="dim" style="text-align:center">… and ${result.tradeList.length - rows.length} more</td>`;
    tbody.appendChild(tr);
  }
  $("trade-count").textContent = `${result.tradeList.length} trade${result.tradeList.length === 1 ? "" : "s"}`;
}

// ---------- Primary run ----------
function runPrimary() {
  if (!state.dataset) return;
  const cfg = BY_ID[state.strategyId];
  const strategy = cfg.factory({
    bankroll: state.bankroll,
    betFraction: state.params.betFraction ?? 0.03,
    threshold: state.params.threshold ?? 0.30,
  });
  const { events, titleByKey, selectedMarkets } = manifoldDatasetToEvents(state.dataset, {
    shuffleSeed: state.shuffleSeed, nMarkets: state.nMarkets,
  });
  state.titleByKey = titleByKey;
  const result = runBacktest({ strategy, events, bankroll: state.bankroll });
  renderResult(result);
  $("run-count").textContent = `${selectedMarkets.length} real Manifold markets · ${events.length.toLocaleString()} price ticks`;
}

// ---------- Leaderboard ----------
function runLeaderboard() {
  if (!state.dataset) return;
  const { events } = manifoldDatasetToEvents(state.dataset, { shuffleSeed: 1, nMarkets: 120 });
  const rows = [];
  for (const cfg of CATALOGUE) {
    const strategy = cfg.factory({
      bankroll: 10_000,
      betFraction: (cfg.slider && cfg.slider.key === "betFraction") ? cfg.slider.default : 0.03,
      threshold: (cfg.slider && cfg.slider.key === "threshold") ? cfg.slider.default : 0.30,
    });
    const r = runBacktest({ strategy, events, bankroll: 10_000 });
    rows.push({
      id: cfg.id, name: cfg.name, blurb: cfg.blurb,
      pnl: r.finalEquity - 10_000,
      pnlPct: (r.finalEquity - 10_000) / 10_000,
      sharpe: r.sharpe, dd: r.drawdown, trades: r.tradeList.length,
      bankrupt: r.bankrupt,
    });
  }
  rows.sort((a, b) => b.pnl - a.pnl);
  const wrap = $("leaderboard-rows");
  wrap.innerHTML = "";
  rows.forEach((r, i) => {
    const pnlCls = r.pnl >= 0 ? "pos" : "neg";
    const rank = i + 1;
    const rankCls = rank === 1 ? "rank gold" : "rank";
    const div = document.createElement("div");
    div.className = "lb-row";
    div.innerHTML = `
      <div class="${rankCls}">${rank}</div>
      <div class="nm">${escapeHtml(r.name)}<span class="d">${escapeHtml(r.blurb)}</span></div>
      <div class="v ${pnlCls}">${fmtMoney(r.pnl, { sign: true })}</div>
      <div class="v ${pnlCls} hide-sm">${fmtPct(r.pnlPct, { sign: true })}</div>
      <div class="v hide-sm">${r.sharpe == null ? "—" : r.sharpe.toFixed(2)}</div>
      <div class="v hide-sm">${fmtPct(r.dd)}</div>
      <div class="v hide-sm">${r.trades}</div>
      <div class="status">${r.bankrupt ? '<span class="pill bad">BANKRUPT</span>' : (r.pnl >= 0 ? '<span class="pill ok">SOLVENT</span>' : '<span class="pill bad">LOSS</span>')}</div>`;
    wrap.appendChild(div);
  });
}

// ---------- Boot ----------
async function boot() {
  renderStrategyDeck();
  // Init params with defaults
  for (const c of CATALOGUE) if (c.slider) state.params[c.slider.key] = c.slider.default;
  renderSliderSlot();

  // Wire controls
  $("bankroll-input").addEventListener("change", (e) => {
    state.bankroll = Math.max(100, Math.floor(parseFloat(e.target.value) || 10_000));
    e.target.value = state.bankroll;
    runPrimary();
  });
  $("markets-input").addEventListener("change", (e) => {
    state.nMarkets = Math.max(1, Math.min(120, parseInt(e.target.value || "120", 10)));
    e.target.value = state.nMarkets;
    runPrimary();
  });
  $("seed-input").addEventListener("change", (e) => {
    state.shuffleSeed = Math.max(1, parseInt(e.target.value || "1", 10));
    e.target.value = state.shuffleSeed;
    runPrimary();
  });
  $("rerun-button").addEventListener("click", runPrimary);

  // Trades drawer
  const tw = $("trades-wrap");
  $("trades-toggle").addEventListener("click", () => tw.classList.toggle("open"));

  try {
    state.dataset = await loadManifoldDataset();
  } catch (err) {
    $("theory-text").textContent =
      "Failed to load real dataset. Serve docs/ from a web server (not file://).";
    console.error(err);
    return;
  }

  const fetched = new Date(state.dataset.fetched_at_ms).toISOString().slice(0, 10);
  $("hero-dataset-info").textContent = fetched;

  runPrimary();
  runLeaderboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
