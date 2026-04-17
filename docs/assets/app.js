// app.js — Portfolio UI glue. Hooks engine.js + strategies.js to the current HTML layout.

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
    name: "Kelly sizing (no edge)",
    blurb: "Bets proportional to edge — but uses the market price as its oracle, so there IS no edge. Demonstrates Kelly's textbook baseline.",
    theory: "Kelly sizes each bet proportional to the edge between your probability estimate and the market price. This demo uses the market price itself as the estimate — zero edge by construction — so Kelly correctly bets zero. To see Kelly work, you need a real edge predictor.",
    factory: (opts) => kellySizing({
      pOracle: (m) => m.yesPrice,
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
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
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
  if (!deck) return;
  deck.innerHTML = "";
  for (const cfg of CATALOGUE) {
    const btn = document.createElement("button");
    btn.className = "strat-card" + (cfg.id === state.strategyId ? " active" : "");
    btn.dataset.strategy = cfg.id;
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
  if (!slot) return;
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
  const canvas = $("equity-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const data = result.equityCurve.map((p, i) => ({ x: i, y: p.equity }));
  if (state.chart) state.chart.destroy();
  state.chart = new window.Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Equity", data,
          borderColor: "#1652f0", backgroundColor: "rgba(22, 82, 240, 0.10)",
          borderWidth: 2, tension: 0.2, pointRadius: 0, fill: true,
        },
        {
          label: "Starting bankroll",
          data: data.map(d => ({ x: d.x, y: state.bankroll })),
          borderColor: "rgba(0,0,0,0.22)", borderWidth: 1.2, borderDash: [5, 5],
          pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Event ${items[0].parsed.x}`,
            label: (item) => `$${item.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          },
        },
      },
      scales: {
        x: { type: "linear", ticks: { font: { size: 11 } }, title: { display: false } },
        y: { ticks: { font: { size: 11 }, callback: (v) => "$" + v.toLocaleString() } },
      },
    },
  });
}

// ---------- Examples ----------
function renderExamples(result) {
  const host = $("examples");
  if (!host) return;
  const closed = result.closedPositions.filter(p => !p.wasCancelled);
  if (closed.length === 0) {
    host.innerHTML = `<div class="dim" style="padding:16px">This strategy didn't enter any markets in this run.</div>`;
    return;
  }
  // Pick most-profitable, most-losing, and a middle bet.
  const sorted = closed.slice().sort((a, b) => b.realisedPnl - a.realisedPnl);
  const picks = [sorted[0]];
  if (sorted.length > 1) picks.push(sorted[sorted.length - 1]);
  if (sorted.length > 2) picks.push(sorted[Math.floor(sorted.length / 2)]);

  host.innerHTML = "";
  for (const pos of picks) {
    const title = state.titleByKey.get(`${pos.platform}|${pos.marketId}`) || pos.marketId;
    const pnl = pos.realisedPnl;
    const cls = pnl >= 0 ? "pos" : "neg";
    const side = pos.side.toUpperCase();
    const card = document.createElement("div");
    card.className = "example-card";
    card.innerHTML = `
      <div class="ex-title">${escapeHtml(title.length > 80 ? title.slice(0, 80) + "…" : title)}</div>
      <div class="ex-line"><span class="k">Bet</span><span class="v">${side} · ${pos.size.toLocaleString()} shares at ${pos.avgEntry.toFixed(3)}</span></div>
      <div class="ex-line"><span class="k">Outcome</span><span class="v ${cls}">${fmtMoney(pnl, { sign: true })}</span></div>`;
    host.appendChild(card);
  }
}

// ---------- Result rendering ----------
function renderResult(result) {
  const pnl = result.finalEquity - result.startingBankroll;
  const pnlPct = pnl / result.startingBankroll;
  const cfg = BY_ID[state.strategyId];

  // Big PnL + percentage pill
  const pnlBig = $("pnl-big");
  if (pnlBig) {
    pnlBig.textContent = fmtMoney(pnl, { sign: true });
    pnlBig.className = "pnl " + (pnl >= 0 ? "pos" : "neg");
  }
  const pct = $("pnl-pct");
  if (pct) {
    pct.textContent = fmtPct(pnlPct, { sign: true });
    pct.className = "pct-pill " + (pnl >= 0 ? "pos" : "neg");
  }

  // Verdict sentence
  const verdict = result.bankrupt
    ? "Strategy went bankrupt — spent the entire bankroll before the run ended."
    : result.tradeList.length === 0 ? "Zero bets placed — no markets met this strategy's entry criteria."
    : pnl > 500 ? "Solidly profitable across this dataset."
    : pnl > 0 ? "Barely positive — wins covered losses but no meaningful edge."
    : pnl === 0 ? "Broke even."
    : pnl > -1000 ? "Small loss — roughly coin-flip after slippage."
    : "Significant loss — slippage and wrong-side bets dominated.";
  setText("verdict", verdict);

  // Preface
  setText("result-strategy", cfg.name);
  setText("result-markets", String(result.equityCurve.length ? new Set(result.tradeList.map(f => f.marketId)).size : 0));

  // Before / after
  setText("ba-start", fmtMoney(result.startingBankroll));
  setText("ba-end", fmtMoney(result.finalEquity));

  // Fact cards
  const closedEligible = result.closedPositions.filter(p => !p.wasCancelled);
  const wins = closedEligible.filter(p => p.realisedPnl > 0).length;
  setText("f-bets", String(result.tradeList.length));
  setText("f-bets-sub", `across ${new Set(result.tradeList.map(f => f.marketId)).size} markets`);
  setText("f-wins", String(wins));
  setText("f-wins-sub", result.winRate == null ? "no closed bets" : `${(result.winRate * 100).toFixed(0)}% win rate`);
  // Worst = lowest equity point reached
  const minEquity = result.equityCurve.reduce((m, p) => Math.min(m, p.equity), result.startingBankroll);
  setText("f-worst", fmtMoney(minEquity));

  // Chart subheading
  setText("chart-sub", `${result.tradeList.length} trades · starting ${fmtMoney(result.startingBankroll)}`);

  // Run summary
  setText("run-summary", `${cfg.name} — ${result.tradeList.length} bets placed across ${new Set(result.tradeList.map(f => f.marketId)).size} real Manifold markets.`);

  // Technical metrics (details drawer)
  setText("q-sharpe", result.sharpe == null ? "—" : result.sharpe.toFixed(2));
  setText("q-sortino", result.sortino == null ? "—" : result.sortino.toFixed(2));
  setText("q-brier", result.brier == null ? "—" : result.brier.toFixed(3));
  setText("q-drawdown", fmtPct(result.drawdown, { digits: 1 }));
  setText("q-winrate", result.winRate == null ? "—" : fmtPct(result.winRate));
  setText("q-closed", String(closedEligible.length));
  setText("q-fills", String(result.tradeList.length));
  setText("q-bankrupt", result.bankrupt ? "YES" : "NO");

  renderChart(result);
  renderExamples(result);
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
  const { events, titleByKey } = manifoldDatasetToEvents(state.dataset, {
    shuffleSeed: state.shuffleSeed, nMarkets: state.nMarkets,
  });
  state.titleByKey = titleByKey;
  const result = runBacktest({ strategy, events, bankroll: state.bankroll });
  renderResult(result);
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
      bankrupt: r.bankrupt,
    });
  }
  rows.sort((a, b) => b.pnl - a.pnl);
  const wrap = $("lb-rows");
  if (!wrap) return;
  wrap.innerHTML = "";
  rows.forEach((r, i) => {
    const pnlCls = r.pnl >= 0 ? "pos" : "neg";
    const rank = i + 1;
    const row = document.createElement("div");
    row.className = "lb-row";
    row.innerHTML = `
      <div class="rk">${rank}</div>
      <div class="nm">${escapeHtml(r.name)}<span class="d">${escapeHtml(r.blurb)}</span></div>
      <div class="v ${pnlCls}" style="text-align:right">${fmtMoney(r.pnl, { sign: true })} <span class="dim" style="font-size:12px">(${fmtPct(r.pnlPct, { sign: true })})</span></div>
      <div class="status hide-sm">${r.bankrupt ? '<span class="pill bad">BANKRUPT</span>' : (r.pnl >= 0 ? '<span class="pill ok">PROFIT</span>' : '<span class="pill bad">LOSS</span>')}</div>`;
    wrap.appendChild(row);
  });
}

// ---------- Boot ----------
async function boot() {
  renderStrategyDeck();
  for (const c of CATALOGUE) if (c.slider) state.params[c.slider.key] = c.slider.default;
  renderSliderSlot();

  const wire = (id, event, handler) => {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  };
  wire("bankroll-input", "change", (e) => {
    state.bankroll = Math.max(100, Math.floor(parseFloat(e.target.value) || 10_000));
    e.target.value = state.bankroll;
    runPrimary();
  });
  wire("markets-input", "change", (e) => {
    state.nMarkets = Math.max(1, Math.min(120, parseInt(e.target.value || "120", 10)));
    e.target.value = state.nMarkets;
    runPrimary();
  });
  wire("seed-input", "change", (e) => {
    state.shuffleSeed = Math.max(1, parseInt(e.target.value || "1", 10));
    e.target.value = state.shuffleSeed;
    runPrimary();
  });
  wire("rerun-btn", "click", runPrimary);

  try {
    state.dataset = await loadManifoldDataset();
  } catch (err) {
    setText("run-summary", "Failed to load real dataset. Serve docs/ from a web server (not file://).");
    console.error(err);
    return;
  }

  const fetched = new Date(state.dataset.fetched_at_ms).toISOString().slice(0, 10);
  setText("dataset-date", fetched);

  runPrimary();
  runLeaderboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
