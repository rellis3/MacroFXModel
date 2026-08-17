"""report_html — renders a self-contained static dashboard from a study's
JSON output. No server, no CDN: the small result JSONs are embedded inline at
generation time (the multi-megabyte raw session_table.json is NOT embedded —
the dashboard only needs the aggregated cells).

Usage: python3 -m SessionResearch.report_html --pair gold
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Session Research — __PAIR_UPPER__</title>
<style>
  :root {
    --bg:#0d1117; --card:#161b22; --border:#30363d; --text:#e6edf3; --text2:#c3c2b7; --text3:#8b949e;
    --good:#0ca30c; --warn:#d29922; --crit:#e34948;
    --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
    --asia:rgba(57,135,229,.16); --london:rgba(217,89,38,.16); --overlap:rgba(25,158,112,.16); --ny:rgba(201,133,0,.16); --late:rgba(139,148,158,.10);
  }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--text); font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; padding:24px }
  h1 { font-size:20px; margin:0 0 4px } h2 { font-size:15px; margin:26px 0 8px; color:var(--text) }
  h3 { font-size:12px; margin:0 0 10px; color:var(--text3); text-transform:uppercase; letter-spacing:.04em; font-weight:600 }
  .sub { color:var(--text3); font-size:12px; margin-bottom:6px; max-width:900px }
  .meta { color:var(--text3); font-size:11.5px; margin-bottom:18px }
  .card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:16px 18px; margin-bottom:18px }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:18px }
  @media (max-width:900px) { .grid2 { grid-template-columns:1fr } }
  table { border-collapse:collapse; font:11px/1.5 ui-monospace,'DM Mono',monospace; width:100% }
  th,td { padding:5px 10px; border-bottom:1px solid var(--border); text-align:right; white-space:nowrap }
  th { color:var(--text3); font-weight:600; text-align:right; position:sticky; top:0; background:var(--card) }
  th:first-child,td:first-child { text-align:left }
  .twrap { max-height:420px; overflow:auto; border:1px solid var(--border); border-radius:6px }
  .pos { color:var(--good) } .neg { color:var(--crit) } .muted { color:var(--text3) }
  .pass { color:var(--good); font-weight:600 } .fail { color:var(--text3) }
  .legend { display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:var(--text3); margin:6px 0 14px }
  .legend span { display:inline-flex; align-items:center; gap:5px }
  .sw { width:10px; height:10px; border-radius:2px; display:inline-block }
  .finding { font-size:13px; line-height:1.65; max-width:880px }
  .finding b { color:var(--text) }
  .caveat { font-size:11.5px; color:var(--text3); border-left:2px solid var(--warn); padding:4px 0 4px 10px; margin-top:10px; max-width:860px }
  svg { display:block; overflow:visible }
  .bar-label { fill:var(--text3); font-size:10px; font-family:ui-monospace,monospace }
  .val-label { fill:var(--text); font-size:10.5px; font-family:ui-monospace,monospace; font-weight:600 }
  .axis-line { stroke:var(--border) }
  .tooltip { position:fixed; background:var(--card); border:1px solid var(--border); border-radius:6px; padding:7px 10px; font:11px/1.5 ui-monospace,monospace; color:var(--text); pointer-events:none; z-index:50; display:none; box-shadow:0 4px 16px rgba(0,0,0,.4) }
</style>
</head>
<body>
  <h1>Session Research — __PAIR_UPPER__</h1>
  <div class="sub">Does the Asia / London / London-NY overlap / NY session cycle predict itself? 10 years of M1 data, session-level range &amp; direction handoffs, hour-of-day move sizing, and the pre-open-spike -&gt; fade pattern — every test run against a circular-shift null (not a plain shuffle, which regime-clustered volatility would trivially beat) and pooled into one honest Benjamini-Hochberg FDR correction. Stats/probabilities only — this is the research pass, not a signal generator.</div>
  <div class="meta" id="meta"></div>

  <div class="card">
    <h2 style="margin-top:0">Reading this report</h2>
    <div class="finding">
      <p><b>Range persists across the session handoff.</b> A wide (or quiet) session's range is a real, if modest, predictor of the next session's range — positive across every one of the 7 tested handoffs, weakening the more sessions apart the pair is (Asia&#8594;London beats Asia&#8594;NY), which is what a genuine local effect looks like rather than noise.</p>
      <p><b>Direction does not carry over.</b> Whether a session closed up or down is close to a coin flip for predicting the next session's direction, in every handoff tested. Trend continuation across sessions is not supported by this data.</p>
      <p><b>The pre-open spike finding is the strongest, most specific result.</b> A large move in the 15 minutes before a session opens is reliably followed by <i>reduced</i> continuation (more reversal) over the next 15&#8211;60 minutes, at all four session opens, and it survives the circular-shift null everywhere it was tested. This is close to what the screenshot that prompted this study described &#8212; not "always," but a real, repeatable statistical tilt.</p>
      <p><b>Hour-of-day range differences are enormous but not surprising.</b> The 12:00&#8211;15:00 UTC window (US data releases into the London/NY overlap) runs at up to ~1.9&#215; the average hour's range; the 21:00&#8211;04:00 UTC tail runs at ~0.6&#215;. This is well-known market structure, included here mainly as a sanity check that the pipeline recovers a known truth before trusting it on the less obvious questions above.</p>
      <p><b>By the time Asia ends, nearly half the day is already "spent."</b> Median 44.5% of the day's eventual range has printed by 07:00 UTC, 65% by 12:00 UTC — and a wide morning predicts a wide afternoon (range compounds through the day rather than reverting to a fixed daily budget), more strongly the later the checkpoint. The day's move-so-far, by contrast, barely predicts its close — direction not carrying over at the session level (above) holds at the whole-day level too.</p>
      <p><b>The walk-forward prediction model mostly confirms the null, and that's the honest, useful result.</b> A real Ridge/Logistic model, trained only on the past and tested year-by-year going forward, was built to predict the rest of the day from what's happened so far. For <i>range</i> it beats "ignore today entirely" by a small, inconsistent margin — but does not clearly beat the trivial one-variable version of the same idea, and a model trained on scrambled outcomes does about as well roughly a third to a half of the time. For <i>direction</i> there is no walk-forward skill anywhere, and at the London and Overlap checkpoints the trained model is <i>significantly worse</i> than just assuming today's move-so-far continues. This independently reproduces the handoff finding above via a completely different method — see "Can this predict the rest of the day?" below before building anything on it.</p>
      <p><b>Impulsive swings do reverse more than grind swings — for scalping horizons, that edge is real but small, and it's not quite symmetric.</b> Generalizing the pre-open-spike pattern to ANY confirmed swing pivot at M5 (not just session opens): a fast, sharp push into a swing low or high produces a modestly higher win-rate bounce/fade than a slow grind to the same price (roughly +1&#8211;2 points of win-rate, surviving BH-FDR at most horizons — real, but don't mistake statistically-real for large). At the 5-minute horizon the two directions are close to identical (46.96% vs 46.93% win-rate, not distinguishable, p=0.96) — genuinely "not just one way." By 15&#8211;30 minutes a real asymmetry opens up: impulsive-low bounces pull ahead of impulsive-high fades (50.1% vs 48.3% at 30 min, p=0.0017) — plausibly gold's decade-long uptrend making dip-buys hold up slightly better than top-fades over this sample, not a universal law.</p>
    </div>
    <div class="caveat">Full-sample quantile thresholds (spike/tercile cuts) are fit on the whole 10-year window, which is standard for a descriptive/inferential study like this one but is <b>not</b> walk-forward-safe — a live rule built on these thresholds needs its cut points refit on training data only, exactly like <code>forge/discover.py</code> already does for level backtests. Nothing here has been checked against trading costs, spread, or slippage.</div>
  </div>

  <div class="card">
    <h3>Average move by UTC hour — where the day's range actually comes from</h3>
    <div class="legend" id="hour-legend"></div>
    <div id="hour-chart"></div>
  </div>

  <div class="grid2">
    <div class="card">
      <h3>How much of the day's range is already in, by each checkpoint</h3>
      <div id="dayflow-chart"></div>
    </div>
    <div class="card">
      <h3>Range persistence through the day (Spearman &#961;, so-far vs. remaining)</h3>
      <div id="dayflow-persist-chart"></div>
    </div>
  </div>

  <div class="card">
    <h3>Can this predict the rest of the day? — walk-forward model vs. baselines</h3>
    <div class="sub">Ridge (range) / Logistic (direction), expanding walk-forward by calendar year, vs. a climatology baseline (train-set average, ignores today) and a persistence baseline (the trivial one-variable version of the same idea). <span class="pos">green</span> = model beats that baseline; <span class="neg">red</span> = model loses to it; bold = the difference survives BH-FDR. <code>p_vs_null</code> is the model refit on circularly-shifted training targets — the closer to 1, the more the model's apparent skill looks like what a scrambled-target model achieves by chance.</div>
    <div class="twrap"><table id="forecast-table"></table></div>
  </div>

  <div class="grid2">
    <div class="card">
      <h3>Impulsive vs. grind swings — win rate at 15 min</h3>
      <div class="legend">
        <span><i class="sw" style="background:var(--s1)"></i>grind pivot (bottom quartile displacement)</span>
        <span><i class="sw" style="background:var(--s2)"></i>impulsive pivot (top quartile displacement)</span>
      </div>
      <div id="impulse-chart"></div>
      <div class="sub" style="margin-top:8px">"Win" = price moves &#8805;0.10&#215;ATR in the expected reversal direction (up after a low, down after a high) within the horizon.</div>
    </div>
    <div class="card">
      <h3>Impulse-low vs. impulse-high win rate, by horizon — is it symmetric?</h3>
      <div id="impulse-symmetry-chart"></div>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <h3>Range handoff — Spearman &#961; (session range vs. next session's range)</h3>
      <div id="handoff-chart"></div>
    </div>
    <div class="card">
      <h3>Pre-open spike &#8594; reversal rate (30 min after open)</h3>
      <div class="legend">
        <span><i class="sw" style="background:var(--s1)"></i>ordinary open (bottom 75% of pre-open moves)</span>
        <span><i class="sw" style="background:var(--s2)"></i>spike open (top quartile pre-open move)</span>
      </div>
      <div id="spike-chart"></div>
    </div>
  </div>

  <h2>Full handoff results</h2>
  <div class="twrap"><table id="handoff-table"></table></div>

  <h2>Full spike / gap-fill results</h2>
  <div class="twrap"><table id="spike-table"></table></div>

  <h2>Full day-flow results</h2>
  <div class="twrap"><table id="dayflow-table"></table></div>

  <h2>Full impulse results</h2>
  <div class="twrap"><table id="impulse-table"></table></div>

  <h2>Day of week (descriptive, not FDR-tested)</h2>
  <div class="twrap"><table id="dow-table"></table></div>

  <div id="tooltip" class="tooltip"></div>

<script>
const DATA = __DATA_JSON__;
const el = id => document.getElementById(id);
const fmt = (v,d=3) => (v===null||v===undefined||Number.isNaN(v)) ? '—' : (+v).toFixed(d);
const fmtP = p => (p===null||p===undefined||Number.isNaN(p)) ? '—' : (p<0.0001 ? p.toExponential(1) : p.toFixed(4));
const tip = el('tooltip');
function showTip(evt, html){ tip.innerHTML = html; tip.style.display='block'; moveTip(evt); }
function moveTip(evt){ tip.style.left=(evt.clientX+14)+'px'; tip.style.top=(evt.clientY+14)+'px'; }
function hideTip(){ tip.style.display='none'; }

el('meta').textContent = `${DATA.meta.data_start.slice(0,10)} → ${DATA.meta.data_end.slice(0,10)} · ${DATA.meta.m1_rows.toLocaleString()} M1 bars · ${DATA.meta.n_trading_day_sessions.toLocaleString()} session-days · ${DATA.meta.n_hypotheses_pooled} hypotheses pooled, ${DATA.meta.n_bh_pass} survive BH-FDR @ q=${DATA.meta.bh_q} · generated ${DATA.meta.generated_at.slice(0,16).replace('T',' ')} UTC`;

// ---- hour-of-day bar chart with session bands ----
(function(){
  const rows = DATA.intraday.filter(r => r.metric === 'range_atr').sort((a,b)=>a.hour-b.hour);
  const W = 900, H = 200, padL = 34, padB = 20, padT = 8;
  const bw = (W - padL) / 24;
  const maxV = Math.max(...rows.map(r=>r.value)) * 1.08;
  const y = v => H - padB - (v / maxV) * (H - padB - padT);
  const bands = [['asia',0,7],['london',7,12],['overlap',12,16],['ny',16,21],['late',21,24]];
  let svg = `<svg viewBox="0 0 ${W} ${H+16}" width="100%" height="${H+16}">`;
  for (const [name, lo, hi] of bands) {
    svg += `<rect x="${padL + lo*bw}" y="${padT}" width="${(hi-lo)*bw}" height="${H-padB-padT}" fill="var(--${name})"></rect>`;
  }
  svg += `<line class="axis-line" x1="${padL}" y1="${H-padB}" x2="${W}" y2="${H-padB}" stroke-width="1"></line>`;
  rows.forEach((r,i) => {
    const x = padL + i*bw + bw*0.14, w = bw*0.72;
    const yy = y(r.value), h = (H-padB) - yy;
    svg += `<rect data-i="${i}" x="${x}" y="${yy}" width="${w}" height="${Math.max(h,1)}" rx="3" fill="var(--s1)" style="cursor:pointer"></rect>`;
    if (i % 3 === 0) svg += `<text class="bar-label" x="${x+w/2}" y="${H-padB+13}" text-anchor="middle">${r.hour}</text>`;
  });
  svg += `</svg>`;
  el('hour-chart').innerHTML = svg;
  const legend = bands.map(([name]) => `<span><i class="sw" style="background:var(--${name})"></i>${name}</span>`).join('');
  el('hour-legend').innerHTML = legend + `<span><i class="sw" style="background:var(--s1)"></i>mean range (× daily ATR)</span>`;
  el('hour-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i];
    rect.addEventListener('mousemove', e => showTip(e, `<b>${r.hour}:00 UTC</b><br>mean range: ${fmt(r.value)} × ATR<br>n=${r.n} · p=${fmtP(r.primary_p ?? r.p)}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- handoff range-persistence bar chart ----
(function(){
  const rows = DATA.handoff.filter(r => r.metric === 'range_spearman').sort((a,b)=>b.value-a.value);
  const W = 420, rowH = 30, padL = 100, padR = 46;
  const H = rows.length * rowH + 10;
  const maxV = Math.max(...rows.map(r=>Math.abs(r.value))) * 1.15;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  rows.forEach((r,i) => {
    const y0 = i*rowH + 6, bh = rowH - 12;
    const w = (r.value/maxV) * (W - padL - padR);
    const color = r.bh_pass ? 'var(--good)' : 'var(--text3)';
    svg += `<text class="bar-label" x="${padL-8}" y="${y0+bh/2+3}" text-anchor="end">${r.pair}</text>`;
    svg += `<rect data-i="${i}" x="${padL}" y="${y0}" width="${Math.max(w,2)}" height="${bh}" rx="3" fill="${color}" style="cursor:pointer"></rect>`;
    svg += `<text class="val-label" x="${padL+w+6}" y="${y0+bh/2+3}">${fmt(r.value,2)}</text>`;
  });
  svg += `</svg>`;
  el('handoff-chart').innerHTML = svg;
  el('handoff-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i];
    rect.addEventListener('mousemove', e => showTip(e, `<b>${r.pair}</b><br>range ρ = ${fmt(r.value)}<br>n=${r.n} · p_perm=${fmtP(r.p_perm)}<br>${r.bh_pass ? '<span class="pass">survives BH-FDR</span>' : '<span class="fail">does not survive BH-FDR</span>'}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- spike reversal grouped bar chart ----
(function(){
  const rows = DATA.spike_fade.filter(r => r.metric === 'spike_reversal_rate' && r.post_min === 30);
  const order = ['asia','london','overlap','ny'];
  rows.sort((a,b)=>order.indexOf(a.boundary)-order.indexOf(b.boundary));
  const W = 420, H = 220, padL = 40, padB = 24, padT = 10;
  const groupW = (W - padL) / rows.length;
  const barW = groupW * 0.32, gap = groupW * 0.06;
  const maxV = 0.7;
  const y = v => H - padB - v*(H-padB-padT)/maxV;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  svg += `<line class="axis-line" x1="${padL}" y1="${y(0.5)}" x2="${W}" y2="${y(0.5)}" stroke-width="1" stroke-dasharray="2,3"></line>`;
  svg += `<text class="bar-label" x="${padL-6}" y="${y(0.5)+3}" text-anchor="end">.50</text>`;
  svg += `<line class="axis-line" x1="${padL}" y1="${H-padB}" x2="${W}" y2="${H-padB}" stroke-width="1"></line>`;
  rows.forEach((r,i) => {
    const cx = padL + i*groupW + groupW/2;
    const x1 = cx - gap/2 - barW, x2 = cx + gap/2;
    const y1 = y(r.reversal_rate_nonspike), y2v = y(r.reversal_rate_spike);
    svg += `<rect data-i="${i}" data-k="0" x="${x1}" y="${y1}" width="${barW}" height="${H-padB-y1}" rx="3" fill="var(--s1)" style="cursor:pointer"></rect>`;
    svg += `<rect data-i="${i}" data-k="1" x="${x2}" y="${y2v}" width="${barW}" height="${H-padB-y2v}" rx="3" fill="var(--s2)" style="cursor:pointer"></rect>`;
    svg += `<text class="bar-label" x="${cx}" y="${H-padB+13}" text-anchor="middle">${r.boundary}</text>`;
  });
  svg += `</svg>`;
  el('spike-chart').innerHTML = svg;
  el('spike-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i]; const spike = rect.dataset.k === '1';
    const v = spike ? r.reversal_rate_spike : r.reversal_rate_nonspike;
    rect.addEventListener('mousemove', e => showTip(e, `<b>${r.boundary} open, 30min</b><br>${spike?'spike':'ordinary'} reversal rate: ${fmt(v)}<br>n=${r.n} · p_perm=${fmtP(r.p_perm)}<br>${r.bh_pass ? '<span class="pass">survives BH-FDR</span>' : '<span class="fail">does not survive BH-FDR</span>'}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- day-flow: fraction of day's range already in, by checkpoint ----
(function(){
  const order = ['post_asia','post_london','post_overlap'];
  const label = {post_asia:'after Asia (07:00)', post_london:'after London (12:00)', post_overlap:'after Overlap (16:00)'};
  const rows = DATA.dayflow.filter(r => r.metric === 'frac_of_day_range_used_median')
    .sort((a,b)=>order.indexOf(a.checkpoint)-order.indexOf(b.checkpoint));
  const W = 420, rowH = 34, padL = 150, padR = 46;
  const H = rows.length * rowH + 10;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  rows.forEach((r,i) => {
    const y0 = i*rowH + 7, bh = rowH - 14;
    const w = Math.min(r.value,1) * (W - padL - padR);
    svg += `<text class="bar-label" x="${padL-8}" y="${y0+bh/2+3}" text-anchor="end">${label[r.checkpoint]||r.checkpoint}</text>`;
    svg += `<rect data-i="${i}" x="${padL}" y="${y0}" width="${Math.max(w,2)}" height="${bh}" rx="3" fill="var(--s3)" style="cursor:pointer"></rect>`;
    svg += `<text class="val-label" x="${padL+w+6}" y="${y0+bh/2+3}">${(r.value*100).toFixed(0)}%</text>`;
  });
  svg += `</svg>`;
  el('dayflow-chart').innerHTML = svg;
  el('dayflow-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i];
    rect.addEventListener('mousemove', e => showTip(e, `<b>${label[r.checkpoint]||r.checkpoint}</b><br>median ${(r.value*100).toFixed(1)}% of day's eventual range already in<br>mean ${(r.mean*100).toFixed(1)}% · n=${r.n}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- day-flow: does range-so-far predict remaining range (compounding vs. reverting)? ----
(function(){
  const order = ['post_asia','post_london','post_overlap'];
  const label = {post_asia:'after Asia', post_london:'after London', post_overlap:'after Overlap'};
  const rows = DATA.dayflow.filter(r => r.metric === 'range_so_far_vs_remaining_spearman')
    .sort((a,b)=>order.indexOf(a.checkpoint)-order.indexOf(b.checkpoint));
  const W = 420, rowH = 34, padL = 100, padR = 46;
  const H = rows.length * rowH + 10;
  const maxV = Math.max(...rows.map(r=>Math.abs(r.value))) * 1.3;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  rows.forEach((r,i) => {
    const y0 = i*rowH + 7, bh = rowH - 14;
    const w = (r.value/maxV) * (W - padL - padR);
    const color = r.bh_pass ? 'var(--good)' : 'var(--text3)';
    svg += `<text class="bar-label" x="${padL-8}" y="${y0+bh/2+3}" text-anchor="end">${label[r.checkpoint]||r.checkpoint}</text>`;
    svg += `<rect data-i="${i}" x="${padL}" y="${y0}" width="${Math.max(w,2)}" height="${bh}" rx="3" fill="${color}" style="cursor:pointer"></rect>`;
    svg += `<text class="val-label" x="${padL+w+6}" y="${y0+bh/2+3}">${fmt(r.value,2)}</text>`;
  });
  svg += `</svg>`;
  el('dayflow-persist-chart').innerHTML = svg;
  el('dayflow-persist-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i];
    rect.addEventListener('mousemove', e => showTip(e, `<b>${label[r.checkpoint]||r.checkpoint}</b><br>range-so-far vs. remaining-range ρ = ${fmt(r.value)}<br>n=${r.n} · p_perm=${fmtP(r.p_perm)}<br>${r.bh_pass ? '<span class="pass">survives BH-FDR</span>' : '<span class="fail">does not survive BH-FDR</span>'}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- impulse vs. grind win rate, grouped by low/high, at 15 min ----
(function(){
  const rows = DATA.impulse.filter(r => r.metric === 'win_rate_impulse_vs_grind' && r.horizon_min === 15);
  const order = ['low','high'];
  rows.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
  const W = 420, H = 220, padL = 40, padB = 24, padT = 10;
  const groupW = (W - padL) / rows.length;
  const barW = groupW * 0.32, gap = groupW * 0.06;
  const maxV = 0.6;
  const y = v => H - padB - v*(H-padB-padT)/maxV;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  svg += `<line class="axis-line" x1="${padL}" y1="${y(0.5)}" x2="${W}" y2="${y(0.5)}" stroke-width="1" stroke-dasharray="2,3"></line>`;
  svg += `<text class="bar-label" x="${padL-6}" y="${y(0.5)+3}" text-anchor="end">.50</text>`;
  svg += `<line class="axis-line" x1="${padL}" y1="${H-padB}" x2="${W}" y2="${H-padB}" stroke-width="1"></line>`;
  rows.forEach((r,i) => {
    const cx = padL + i*groupW + groupW/2;
    const x1 = cx - gap/2 - barW, x2 = cx + gap/2;
    const y1 = y(r.win_rate_grind), y2v = y(r.win_rate_impulse);
    svg += `<rect data-i="${i}" data-k="0" x="${x1}" y="${y1}" width="${barW}" height="${H-padB-y1}" rx="3" fill="var(--s1)" style="cursor:pointer"></rect>`;
    svg += `<rect data-i="${i}" data-k="1" x="${x2}" y="${y2v}" width="${barW}" height="${H-padB-y2v}" rx="3" fill="var(--s2)" style="cursor:pointer"></rect>`;
    svg += `<text class="bar-label" x="${cx}" y="${H-padB+13}" text-anchor="middle">${r.kind}</text>`;
  });
  svg += `</svg>`;
  el('impulse-chart').innerHTML = svg;
  el('impulse-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i]; const impulsive = rect.dataset.k === '1';
    const v = impulsive ? r.win_rate_impulse : r.win_rate_grind;
    rect.addEventListener('mousemove', e => showTip(e, `<b>${r.kind}, 15min</b><br>${impulsive?'impulsive':'grind'} win rate: ${fmt(v)}<br>n=${r.n} · p=${fmtP(r.p)}<br>${r.bh_pass ? '<span class="pass">survives BH-FDR</span>' : '<span class="fail">does not survive BH-FDR</span>'}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- impulse-low vs. impulse-high win rate across horizons (symmetry) ----
(function(){
  const rows = DATA.impulse.filter(r => r.metric === 'low_vs_high_win_rate').sort((a,b)=>a.horizon_min-b.horizon_min);
  const W = 420, H = 220, padL = 40, padB = 24, padT = 10;
  const groupW = (W - padL) / rows.length;
  const barW = groupW * 0.32, gap = groupW * 0.06;
  const maxV = 0.6;
  const y = v => H - padB - v*(H-padB-padT)/maxV;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">`;
  svg += `<line class="axis-line" x1="${padL}" y1="${y(0.5)}" x2="${W}" y2="${y(0.5)}" stroke-width="1" stroke-dasharray="2,3"></line>`;
  svg += `<text class="bar-label" x="${padL-6}" y="${y(0.5)+3}" text-anchor="end">.50</text>`;
  svg += `<line class="axis-line" x1="${padL}" y1="${H-padB}" x2="${W}" y2="${H-padB}" stroke-width="1"></line>`;
  rows.forEach((r,i) => {
    const cx = padL + i*groupW + groupW/2;
    const x1 = cx - gap/2 - barW, x2 = cx + gap/2;
    const y1 = y(r.win_rate_low), y2v = y(r.win_rate_high);
    const c1 = r.bh_pass ? 'var(--good)' : 'var(--s1)';
    svg += `<rect data-i="${i}" data-k="0" x="${x1}" y="${y1}" width="${barW}" height="${H-padB-y1}" rx="3" fill="${c1}" style="cursor:pointer"></rect>`;
    svg += `<rect data-i="${i}" data-k="1" x="${x2}" y="${y2v}" width="${barW}" height="${H-padB-y2v}" rx="3" fill="var(--s4)" style="cursor:pointer"></rect>`;
    svg += `<text class="bar-label" x="${cx}" y="${H-padB+13}" text-anchor="middle">${r.horizon_min} min</text>`;
  });
  svg += `</svg>`;
  el('impulse-symmetry-chart').innerHTML = svg;
  el('impulse-symmetry-chart').querySelectorAll('rect[data-i]').forEach(rect => {
    const r = rows[+rect.dataset.i]; const isLow = rect.dataset.k === '0';
    const v = isLow ? r.win_rate_low : r.win_rate_high;
    rect.addEventListener('mousemove', e => showTip(e, `<b>${r.horizon_min}min, ${isLow?'impulse-low bounce':'impulse-high fade'}</b><br>win rate: ${fmt(v)}<br>n=${r.n} · p=${fmtP(r.p)}<br>${r.bh_pass ? '<span class="pass">low vs. high difference survives BH-FDR</span>' : '<span class="fail">difference does not survive BH-FDR</span>'}`));
    rect.addEventListener('mouseleave', hideTip);
  });
})();

// ---- tables ----
function buildTable(id, rows, cols) {
  const t = el(id);
  t.innerHTML = '<thead><tr>' + cols.map(c=>`<th>${c[0]}</th>`).join('') + '</tr></thead>' +
    '<tbody>' + rows.map(r => '<tr>' + cols.map(c => `<td>${c[1](r)}</td>`).join('') + '</tr>').join('') + '</tbody>';
}
buildTable('handoff-table', DATA.handoff.sort((a,b)=> (a.primary_p??1)-(b.primary_p??1)), [
  ['pair', r=>r.pair], ['metric', r=>r.metric], ['n', r=>r.n], ['value', r=>fmt(r.value)],
  ['p', r=>fmtP(r.p)], ['p_perm', r=>fmtP(r.p_perm)],
  ['BH', r=>r.bh_pass?'<span class="pass">pass</span>':'<span class="fail">—</span>'],
]);
buildTable('spike-table', DATA.spike_fade.sort((a,b)=> (a.primary_p??1)-(b.primary_p??1)), [
  ['boundary', r=>r.boundary], ['post_min', r=>r.post_min], ['metric', r=>r.metric], ['n', r=>r.n],
  ['value', r=>fmt(r.value)], ['p', r=>fmtP(r.p)], ['p_perm', r=>fmtP(r.p_perm)],
  ['BH', r=>r.bh_pass?'<span class="pass">pass</span>':'<span class="fail">—</span>'],
]);
buildTable('dayflow-table', DATA.dayflow.sort((a,b)=> (a.primary_p??1)-(b.primary_p??1)), [
  ['checkpoint', r=>r.checkpoint], ['metric', r=>r.metric], ['n', r=>r.n], ['value', r=>fmt(r.value)],
  ['p_perm', r=>fmtP(r.p_perm)],
  ['BH', r=>r.bh_pass?'<span class="pass">pass</span>':'<span class="fail">—</span>'],
]);
buildTable('impulse-table', DATA.impulse.sort((a,b)=> (a.primary_p??1)-(b.primary_p??1)), [
  ['kind', r=>r.kind], ['horizon (min)', r=>r.horizon_min], ['metric', r=>r.metric],
  ['session', r=>r.session??'—'], ['n', r=>r.n], ['value', r=>fmt(r.value)],
  ['p', r=>fmtP(r.p)], ['p_perm', r=>fmtP(r.p_perm)],
  ['BH', r=>r.bh_pass?'<span class="pass">pass</span>':'<span class="fail">—</span>'],
]);
buildTable('dow-table', DATA.day_of_week, [
  ['day', r=>r.dow], ['n', r=>r.n], ['mean range (×ATR)', r=>fmt(r.mean_range_atr)], ['mean |return| (×ATR)', r=>fmt(r.mean_abs_ret_atr)],
]);
const fCls = r => r.bh_pass ? (r.better_than_baseline ? 'pos' : 'neg') : (r.better_than_baseline ? '' : 'muted');
const fLabel = r => (r.bh_pass ? '<b>' : '') + (r.better_than_baseline ? 'beats' : 'loses to') + (r.bh_pass ? '</b>' : '');
buildTable('forecast-table', DATA.forecast_cells.sort((a,b)=> (a.checkpoint>b.checkpoint?1:-1) || (a.target>b.target?1:-1)), [
  ['checkpoint', r=>r.checkpoint], ['target', r=>r.target], ['vs.', r=>r.metric.replace('beats_','')],
  ['n', r=>r.n], ['model', r=>fmt(r.value)], ['baseline', r=>fmt(r.baseline)],
  ['result', r=>`<span class="${fCls(r)}">${fLabel(r)}</span>`],
  ['p', r=>fmtP(r.p)], ['p_vs_null', r=>fmtP(r.p_vs_null)],
]);

document.addEventListener('mousemove', e => { if (tip.style.display==='block') moveTip(e); });
</script>
</body>
</html>
"""


def build_report(pair: str, out_dir: str = "SessionResearch/out") -> Path:
    base = Path(out_dir) / pair
    payload = {
        "meta": json.loads((base / "meta.json").read_text()),
        "handoff": json.loads((base / "handoff.json").read_text()),
        "intraday": json.loads((base / "intraday.json").read_text()),
        "spike_fade": json.loads((base / "spike_fade.json").read_text()),
        "dayflow": json.loads((base / "dayflow.json").read_text()),
        "forecast_cells": json.loads((base / "forecast_cells.json").read_text()),
        "impulse": json.loads((base / "impulse.json").read_text()),
        "day_of_week": json.loads((base / "day_of_week.json").read_text()),
    }
    html = TEMPLATE.replace("__PAIR_UPPER__", pair.upper()).replace(
        "__DATA_JSON__", json.dumps(payload))
    out_path = base / f"{pair}-session-research.html"
    out_path.write_text(html)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair", default="gold")
    ap.add_argument("--out", default="SessionResearch/out")
    args = ap.parse_args()
    path = build_report(args.pair, args.out)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
