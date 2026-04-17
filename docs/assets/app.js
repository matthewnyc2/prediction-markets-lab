// app.js — Portfolio UI glue. Hooks engine.js + strategies.js to the current HTML layout.

import { loadDataset, datasetToEvents, runBacktest } from "./engine.js";
import {
  kellySizing, closingMomentum, contrarianUnderdog, favoriteLongshot, buyAndHold,
  sellAndHold, meanReversion, confirmedFavorite,
} from "./strategies.js";

// ---------- Strategy catalogue ----------
const CATALOGUE = [
  {
    id: "closing-momentum",
    name: "Closing momentum",
    blurb: "Ride 5%+ moves in the final 3 days before close. Enters each market once.",
    theory: "In the final 72 hours before close, markets that have moved 5%+ from their window-open price tend to keep moving. Enters once per market.",
    factory: (opts) => closingMomentum({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      momentumThreshold: 0.05, windowHours: 72,
    }),
    slider: { key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.10, step: 0.01, default: 0.03,
              format: (v) => `${(v*100).toFixed(0)}%` },
  },
  {
    id: "contrarian-underdog",
    name: "Contrarian underdog",
    blurb: "Buy YES on longshots priced below threshold. Tests whether underdogs are underpriced.",
    theory: "Buys YES on markets priced below the threshold in the last 4 days before close. Pays 3x+ when underdogs hit.",
    factory: (opts) => contrarianUnderdog({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      maxYesPrice: opts.threshold, windowHours: 96,
    }),
    slider: { key: "threshold", label: "Max YES price", min: 0.05, max: 0.50, step: 0.01, default: 0.30,
              format: (v) => v.toFixed(2) },
  },
  {
    id: "favorite-longshot",
    name: "Favorite-longshot fade",
    blurb: "Fade heavy favorites by buying NO. Tests overpricing of locks.",
    theory: "Fades heavily-favored markets by buying NO when YES ≥ threshold in the last 4 days. Tests the academic finding that favorites are overpriced.",
    factory: (opts) => favoriteLongshot({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      minYesPrice: opts.threshold, windowHours: 96,
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
  {
    id: "sell-and-hold",
    name: "Buy NO at open",
    blurb: "Inverse baseline — buys NO on every market. On Polymarket where most 'will X win?' markets resolve NO, this is the short-bias default.",
    theory: "Buys NO on every market at opening price. Tests whether the high NO-resolution rate of prediction markets overwhelms price efficiency.",
    factory: (opts) => sellAndHold({ assignedCapital: opts.bankroll, betFraction: opts.betFraction }),
    slider: { key: "betFraction", label: "Bet fraction", min: 0.01, max: 0.10, step: 0.01, default: 0.03,
              format: (v) => `${(v*100).toFixed(0)}%` },
  },
  {
    id: "mean-reversion",
    name: "Mean-reversion bounce",
    blurb: "Buys YES after a price drops sharply — tests whether fear overshoots.",
    theory: "Tracks each market's recent high-water mark. Buys YES if price drops by the threshold from that high within the lookback window. Tests whether real-money panics create oversold bounces.",
    factory: (opts) => meanReversion({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      dropThreshold: opts.threshold, lookbackHours: 48, maxEntryPrice: 0.85,
    }),
    slider: { key: "threshold", label: "Drop threshold", min: 0.05, max: 0.40, step: 0.01, default: 0.15,
              format: (v) => `${(v*100).toFixed(0)}%` },
  },
  {
    id: "confirmed-favorite",
    name: "Ride confirmed favorites",
    blurb: "Buys YES on heavy favorites in the final days. Tests the 'favorites are correctly priced' thesis from the long side.",
    theory: "Buys YES on markets priced ≥ threshold in the final window before close. Near resolution, strong favorites should usually win — if markets are efficient, these bets earn the small edge of a correctly-priced near-certain event.",
    factory: (opts) => confirmedFavorite({
      assignedCapital: opts.bankroll, betFraction: opts.betFraction,
      minYesPrice: opts.threshold, windowHours: 96,
    }),
    slider: { key: "threshold", label: "Min YES price", min: 0.75, max: 0.98, step: 0.01, default: 0.90,
              format: (v) => v.toFixed(2) },
  },
];
const BY_ID = Object.fromEntries(CATALOGUE.map(c => [c.id, c]));

// ---------- State ----------
const state = {
  strategyId: "closing-momentum",
  startMs: 0,        // filled after dataset loads — defaults to earliest resolution
  endMs: 0,          // filled after dataset loads — defaults to latest resolution
  datasetMinMs: 0,   // earliest resolution in the dataset
  datasetMaxMs: 0,   // latest resolution in the dataset
  nMarkets: 200,
  bankroll: 10_000,
  params: {},
  chart: null,
  dataset: null,
  titleByKey: new Map(),
  urlByKey: new Map(),
};

function isoDay(ms) {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}
function dayMs(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso + "T00:00:00Z");
  return Number.isFinite(t) ? t : 0;
}

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

function renderStrategyCountCopy() {
  const count = String(CATALOGUE.length);
  setText("strategy-count", count);
  setText("leaderboard-strategy-count", count);
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
// One dot per bet-settlement day, NOT per calendar day. Days when the person
// placed no bets (nothing settled) are skipped. X axis is the trading-day
// index starting from the window's first day; Y axis is the account balance
// right after that bet resolved. A Day 0 anchor at starting bankroll is
// prepended so the line begins at the number in the user's head.
function betSettlementPoints(result, startingBankroll) {
  const DAY = 86_400_000;
  const closed = (result.closedPositions || []).filter(p => !p.wasCancelled && p.accountAfter != null);
  if (closed.length === 0) return { data: [{ x: 0, y: startingBankroll }], dates: [""] };

  // Sort by resolution time ascending so the dots walk forward in time.
  closed.sort((a, b) => (a.resolutionTimeMs || 0) - (b.resolutionTimeMs || 0));

  // Anchor Day 0 at the day BEFORE the first settlement (or at the equity
  // curve's first day if available) so the starting bankroll is visible.
  const firstTimeMs = closed[0].resolutionTimeMs || result.equityCurve[0]?.wallTimeMs || 0;
  const curveStartMs = result.equityCurve.length && result.equityCurve[0].wallTimeMs
    ? result.equityCurve[0].wallTimeMs
    : firstTimeMs;
  const anchorDay = Math.floor(curveStartMs / DAY);

  const data = [{ x: 0, y: startingBankroll }];
  const dates = [new Date(anchorDay * DAY).toISOString().slice(0, 10)];
  for (const pos of closed) {
    const dayIdx = Math.floor((pos.resolutionTimeMs || 0) / DAY) - anchorDay;
    data.push({ x: Math.max(1, dayIdx), y: pos.accountAfter });
    dates.push(new Date((pos.resolutionTimeMs || 0)).toISOString().slice(0, 10));
  }
  return { data, dates };
}

function renderChart(result, startingBankroll) {
  const canvas = $("equity-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { data, dates } = betSettlementPoints(result, startingBankroll);
  // Color each dot by direction vs. the previous day's balance:
  // green = money up, red = money down, gray = unchanged or Day 0.
  const GREEN = "#16a34a", RED = "#dc2626", GRAY = "#94a3b8";
  const pointColors = data.map((d, i) => {
    if (i === 0) return GRAY;
    const prev = data[i - 1].y;
    if (d.y > prev) return GREEN;
    if (d.y < prev) return RED;
    return GRAY;
  });

  if (state.chart) state.chart.destroy();
  state.chart = new window.Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Daily balance",
          data,
          showLine: false,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
        },
        {
          label: "Starting bankroll",
          data: data.map(d => ({ x: d.x, y: startingBankroll })),
          borderColor: "rgba(0,0,0,0.30)", borderWidth: 1.2, borderDash: [5, 5],
          pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      plugins: {
        legend: { display: true, position: "top", align: "end",
                  labels: { boxWidth: 14, font: { size: 11 }, color: "#4e5a73" } },
        tooltip: {
          callbacks: {
            title: (items) => {
              const d = items[0].parsed.x;
              if (d === 0) return "Day 0 — starting bankroll";
              const calendar = dates[d - 1];
              return calendar ? `Day ${d} (${calendar})` : `Day ${d}`;
            },
            label: (item) => `$${item.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: data.length ? data[data.length - 1].x : undefined,
          ticks: {
            font: { size: 11 },
            stepSize: Math.max(1, Math.ceil((data.length ? data[data.length - 1].x : 1) / 8)),
            callback: (v) => `Day ${v}`,
            autoSkip: false,
          },
          title: {
            display: true,
            text: "Trading day",
            font: { size: 11, weight: "500" },
            color: "#4e5a73",
          },
        },
        y: {
          ticks: { font: { size: 11 }, callback: (v) => "$" + v.toLocaleString() },
          title: {
            display: true,
            text: "How much money you have",
            font: { size: 11, weight: "500" },
            color: "#4e5a73",
          },
        },
      },
    },
  });
}

// ---------- Examples: every bet this strategy placed ----------
function fmtDateTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function renderExamples(result) {
  const host = $("examples");
  if (!host) return;
  const closed = result.closedPositions.filter(p => !p.wasCancelled);
  if (closed.length === 0) {
    host.innerHTML = `<div class="dim" style="padding:16px">This strategy didn't enter any markets in this run.</div>`;
    return;
  }
  // Sort chronologically by resolution time so each row's running-balance
  // walks forward through the run.
  const sorted = closed.slice().sort((a, b) => (a.resolutionTimeMs || 0) - (b.resolutionTimeMs || 0));
  // Compute a CLEAN running balance = starting bankroll + cumulative
  // realised P&L up to and including this row. Unlike the engine's
  // mark-to-market snapshot, this only moves when a bet actually settles —
  // no phantom jumps from other open positions' prices moving.
  let running = result.startingBankroll || 10000;
  const runningAfter = new Map();
  for (const pos of sorted) {
    running += pos.realisedPnl;
    runningAfter.set(pos, running);
  }
  const wins = sorted.filter(p => p.realisedPnl > 0).length;
  const losses = sorted.filter(p => p.realisedPnl <= 0).length;

  const bankroll = result.startingBankroll || 10000;
  const rows = sorted.map(pos => {
    const key = `${pos.platform}|${pos.marketId}`;
    const title = state.titleByKey.get(key) || pos.marketId;
    const url = state.urlByKey.get(key);
    const pnl = pos.realisedPnl;
    const cost = pos.avgEntry * pos.size;
    const payout = cost + pnl;             // what the position returned at settle
    const exitPrice = pos.size > 0 ? payout / pos.size : 0;
    const pct = cost > 0 ? pnl / cost : 0;
    const acctAfter = runningAfter.get(pos);
    const totalChange = acctAfter != null ? acctAfter - bankroll : null;
    const cls = pnl >= 0 ? "pos" : "neg";
    const totalCls = totalChange == null ? "" : (totalChange >= 0 ? "pos" : "neg");
    const side = pos.side.toUpperCase();
    const titleCell = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(title)}">${escapeHtml(title.length > 90 ? title.slice(0, 90) + "…" : title)} ↗</a>`
      : `<span title="${escapeHtml(title)}">${escapeHtml(title.length > 90 ? title.slice(0, 90) + "…" : title)}</span>`;
    return `
      <tr>
        <td class="bet-title">${titleCell}</td>
        <td class="bet-date mono">${fmtDateTime(pos.entryTimeMs)}</td>
        <td class="bet-side"><span class="side-${pos.side}">${side}</span></td>
        <td class="bet-size num">${pos.size.toLocaleString()}</td>
        <td class="bet-entry num">$${pos.avgEntry.toFixed(3)}</td>
        <td class="bet-cost num">${fmtMoney(cost)}</td>
        <td class="bet-date mono">${fmtDateTime(pos.resolutionTimeMs)}</td>
        <td class="bet-exit num">$${exitPrice.toFixed(3)}</td>
        <td class="bet-payout num">${fmtMoney(payout)}</td>
        <td class="bet-pnl num ${cls}">${fmtMoney(pnl, { sign: true })}</td>
        <td class="bet-pct num ${cls}">${fmtPct(pct, { sign: true })}</td>
        <td class="bet-account num mono">${acctAfter != null ? fmtMoney(acctAfter) : "—"}</td>
        <td class="bet-pct num ${totalCls} mono">${totalChange == null ? "—" : fmtMoney(totalChange, { sign: true })}</td>
      </tr>`;
  }).join("");

  host.innerHTML = `
    <div class="bets-summary">
      <b>${closed.length}</b> bets total ·
      <span class="pos"><b>${wins}</b> won</span> ·
      <span class="neg"><b>${losses}</b> lost</span>
      <span class="dim" style="margin-left:auto;font-size:12px">click any market title to open the live Polymarket page ↗</span>
    </div>
    <div class="bets-scroll">
      <table class="bets-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Entered</th>
            <th>Side</th>
            <th class="num">Shares</th>
            <th class="num">Price paid</th>
            <th class="num">Paid ($)</th>
            <th>Resolved</th>
            <th class="num">Exit price</th>
            <th class="num">Received ($)</th>
            <th class="num">P&L</th>
            <th class="num">Return</th>
            <th class="num">Account after</th>
            <th class="num">Total change</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
  setText("run-summary", `${cfg.name} — ${result.tradeList.length} bets placed across ${new Set(result.tradeList.map(f => f.marketId)).size} real Polymarket markets.`);

  // Technical metrics (details drawer)
  setText("q-sharpe", result.sharpe == null ? "—" : result.sharpe.toFixed(2));
  setText("q-sortino", result.sortino == null ? "—" : result.sortino.toFixed(2));
  setText("q-brier", result.brier == null ? "—" : result.brier.toFixed(3));
  setText("q-drawdown", fmtPct(result.drawdown, { digits: 1 }));
  setText("q-winrate", result.winRate == null ? "—" : fmtPct(result.winRate));
  setText("q-closed", String(closedEligible.length));
  setText("q-fills", String(result.tradeList.length));
  setText("q-bankrupt", result.bankrupt ? "YES" : "NO");

  renderChart(result, result.startingBankroll);
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
  const { events, titleByKey, urlByKey } = datasetToEvents(state.dataset, {
    startMs: state.startMs, endMs: state.endMs, nMarkets: state.nMarkets,
  });
  state.titleByKey = titleByKey;
  state.urlByKey = urlByKey;
  const result = runBacktest({ strategy, events, bankroll: state.bankroll });
  renderResult(result);
}

// ---------- Leaderboard ----------
function runLeaderboard() {
  if (!state.dataset) return;
  const { events } = datasetToEvents(state.dataset, {
    startMs: state.startMs, endMs: state.endMs, nMarkets: 200,
  });
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
  renderStrategyCountCopy();
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
    state.nMarkets = Math.max(1, Math.min(200, parseInt(e.target.value || "200", 10)));
    e.target.value = state.nMarkets;
    runPrimary();
  });
  wire("start-date-input", "change", (e) => {
    state.startMs = dayMs(e.target.value);
    runPrimary();
    runLeaderboard();
  });
  wire("end-date-input", "change", (e) => {
    state.endMs = dayMs(e.target.value);
    runPrimary();
    runLeaderboard();
  });
  wire("rerun-btn", "click", () => { runPrimary(); runLeaderboard(); });

  try {
    state.dataset = await loadDataset("data/polymarket.json");
  } catch (err) {
    setText("run-summary", "Failed to load real dataset. Serve docs/ from a web server (not file://).");
    console.error(err);
    return;
  }

  const fetched = new Date(state.dataset.fetched_at_ms).toISOString().slice(0, 10);
  setText("dataset-date", fetched);

  // Compute the dataset's resolution-time range and seed the date inputs.
  const resMs = state.dataset.markets
    .map(m => m.resolutionTime || 0)
    .filter(t => t > 0);
  if (resMs.length) {
    state.datasetMinMs = Math.min(...resMs);
    state.datasetMaxMs = Math.max(...resMs);
    // Default window = current calendar year, clamped to dataset bounds.
    const year = new Date().getUTCFullYear();
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd   = Date.UTC(year, 11, 31);
    state.startMs = Math.max(state.datasetMinMs, yearStart);
    state.endMs   = Math.min(state.datasetMaxMs, yearEnd);
    const startIn = $("start-date-input");
    const endIn   = $("end-date-input");
    if (startIn) {
      startIn.min = isoDay(state.datasetMinMs);
      startIn.max = isoDay(state.datasetMaxMs);
      startIn.value = isoDay(state.startMs);
    }
    if (endIn) {
      endIn.min = isoDay(state.datasetMinMs);
      endIn.max = isoDay(state.datasetMaxMs);
      endIn.value = isoDay(state.endMs);
    }
    setText("dataset-range", `${isoDay(state.datasetMinMs)} → ${isoDay(state.datasetMaxMs)}`);
  }

  runPrimary();
  runLeaderboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
