// Headless test for oi-dashboard.html's candle chart (no network, no browser).
//   node js/oiChart.test.mjs
//
// WHY THIS EXISTS. The chart shipped with four faults that were only findable by running
// it: M15/H4 hit a granularity the API didn't serve; the error path wrote innerHTML into
// the chart's own host element and destroyed the canvas (so ONE failure wedged it until
// F5); nothing ever re-fetched; and the first fix scheduled the next poll only on success,
// so a single transient failure silently stopped refreshing for the rest of the session.
// Every one of those is a runtime behaviour that `node --check` and a syntax parse pass
// happily. This harness extracts the real functions out of the HTML and drives them
// against DOM + LightweightCharts stubs so the behaviour is actually asserted.
//
// It runs the SHIPPING source (sliced out of oi-dashboard.html), not a copy — a copy would
// drift from the page and assert nothing about what users load.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, 'oi-dashboard.html'), 'utf8');

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// ── stubs ────────────────────────────────────────────────────────────────────
function makeEl(id) {
  return {
    id, _html: '', style: {}, textContent: '', children: [],
    set innerHTML(v) { this._html = v; this.wiped = (this.wiped || 0) + 1; },
    get innerHTML() { return this._html; },
    insertAdjacentHTML(_pos, v) { this._html += v; this.wiped = (this.wiped || 0) + 1; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 0, bottom: 0 }),
  };
}

function harness({ fetchImpl, tf = 'H1' }) {
  const els = { pxChart: makeEl('pxChart'), pxMsg: makeEl('pxMsg'), pxAge: makeEl('pxAge') };
  const timers = new Map(); let seq = 0, now = 1_000_000;
  const chart = {
    created: 0, fits: 0, setDataCalls: 0, lastData: null, destroyedCanvas: false,
  };
  const sandbox = {
    document: {
      getElementById: id => els[id] || null,
      addEventListener: () => {}, querySelectorAll: () => [], hidden: false,
    },
    window: { LightweightCharts: true },
    LightweightCharts: {
      CrosshairMode: { Normal: 0 }, LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
      createChart(el) {
        chart.created++; chart.host = el;
        return {
          addCandlestickSeries: () => ({
            setData(rows) {
              // A real Lightweight-Charts series draws into the canvas inside its host
              // element. If anything replaced that host's innerHTML, the canvas is gone and
              // the write is silently lost — model exactly that.
              if (chart.host.wiped) { chart.destroyedCanvas = true; return; }
              chart.setDataCalls++; chart.lastData = rows;
            },
            createPriceLine: () => ({}), removePriceLine: () => {},
            applyOptions: () => {},
          }),
          addLineSeries: () => ({ setData: () => {}, applyOptions: () => {} }),
          removeSeries: () => {},
          timeScale: () => ({ fitContent: () => { chart.fits++; } }),
        };
      },
    },
    fetch: fetchImpl,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: () => 0,
    Date: { now: () => now },
    Math, JSON, Number, String, Object, Array, Promise, isNaN, parseFloat, console,
    encodeURIComponent,
  };
  sandbox.globalThis = sandbox;
  return { els, timers, chart, sandbox,
    advance(ms) { now += ms; },
    get now() { return now; },
    // fire the single pending timer
    async fire() {
      const [id, t] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0] || [];
      if (!id) return false;
      timers.delete(id); await t.fn(); return true;
    },
    pendingWait() { const t = [...timers.values()][0]; return t ? t.ms : null; },
  };
}

// Pull the real functions out of the page and evaluate them in the sandbox.
function loadChartCode(h, ctx) {
  const grab = (startMarker, endMarker) => {
    const i = h.indexOf(startMarker);
    if (i < 0) throw new Error('marker not found: ' + startMarker);
    const j = h.indexOf(endMarker, i);
    if (j < 0) throw new Error('end marker not found: ' + endMarker);
    return h.slice(i, j);
  };
  const src = [
    grab('const _TF_POLL=', 'function chartLevels'),
    grab('async function loadCandles(', 'function chartToolbar'),
  ].join('\n');
  const pre = `
    let OANDA_SYM={'EUR/USD':'EUR_USD'}, SYM='EUR/USD', STORE={'EUR/USD':{spot:1.14}};
    const esc = s => String(s);
    const drawLines = () => {}, drawCone = () => {};
    let _chart=null,_series=null,_priceLines=[],_candleCache={};
    let _tf='${ctx.tf || 'H1'}';
  `;   // _TF_POLL/_pollTimer/_coneSeries/CONE_ON come from the grabbed page source itself
  const post = `
    return { mountChart, loadCandles, schedulePoll, chartMsg, paintAge,
             state: () => ({ _tf, _pollFails, _lastCandleAt, _chartToken, cache:_candleCache }),
             setTf: v => { _tf = v; } };
  `;
  const keys = Object.keys(ctx.sandbox);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...keys, `${pre}\n${src}\n${post}`);
  return fn(...keys.map(k => ctx.sandbox[k]));
}

const okRes = (n = 3) => ({
  ok: true,
  json: async () => ({ values: Array.from({ length: n }, (_, i) => ({
    t: 1700000000 + i * 60, open: 1.1, high: 1.2, low: 1.0, close: 1.15 })) }),
});
const errRes = (status, msg) => ({ ok: false, status, json: async () => ({ error: msg }) });

console.log('[chart: a failed load must NOT destroy the chart canvas]');
{
  // The original bug: M15 400s -> error text written into #pxChart -> canvas gone -> every
  // later setData silently lost, i.e. "frozen until F5".
  let mode = 'fail';
  const H = harness({ fetchImpl: async () => (mode === 'fail' ? errRes(400, 'Unsupported granularity: M15') : okRes()) });
  const api = loadChartCode(html, H);
  await api.mountChart();
  ok('error is shown to the user', /Unsupported granularity/.test(H.els.pxMsg.innerHTML), H.els.pxMsg.innerHTML.slice(0, 60));
  ok('error text went to the OVERLAY, not the chart host', H.els.pxChart.wiped === undefined);
  ok('the 400 reason is surfaced, not a bare status', !/HTTP 400/.test(H.els.pxMsg.innerHTML));
  ok('a Retry affordance is offered', /pxRetry/.test(H.els.pxMsg.innerHTML));

  mode = 'ok';
  await api.mountChart(true);
  ok('chart RECOVERS in-session (no reload needed)', H.chart.setDataCalls === 1, 'setData calls=' + H.chart.setDataCalls);
  ok('canvas was never treated as destroyed', H.chart.destroyedCanvas === false);
  ok('the chart was created once and reused', H.chart.created === 1, String(H.chart.created));
  ok('overlay cleared on success', !H.els.pxMsg.innerHTML);
}

console.log('[chart: polling keeps running - including after a failure]');
{
  let calls = 0, mode = 'ok';
  const H = harness({ fetchImpl: async () => { calls++; return mode === 'ok' ? okRes() : errRes(502, 'OANDA 502'); } });
  const api = loadChartCode(html, H);
  await api.mountChart();
  ok('first paint fetched', calls === 1, String(calls));
  ok('a poll is scheduled after success', H.pendingWait() !== null, String(H.pendingWait()));

  // THE REGRESSION THIS PINS: scheduling only on success meant one blip killed refresh
  // permanently. Fail a poll, then assert another poll is still queued.
  mode = 'fail'; H.advance(200_000); await H.fire();
  ok('failed poll still queues the next one', H.pendingWait() !== null, String(H.pendingWait()));
  ok('failure backs the interval off', H.pendingWait() > 180_000, String(H.pendingWait()));

  mode = 'ok'; H.advance(600_000); await H.fire();
  ok('recovers and repaints once the feed returns', H.chart.setDataCalls >= 2, String(H.chart.setDataCalls));
  ok('backoff resets after a success', H.pendingWait() === 180_000, String(H.pendingWait()));
}

console.log('[chart: a poll must not yank the view; first paint must fit]');
{
  const H = harness({ fetchImpl: async () => okRes() });
  const api = loadChartCode(html, H);
  await api.mountChart();
  const afterFirst = H.chart.fits;
  H.advance(200_000); await H.fire();
  ok('first paint fits content', afterFirst === 1, String(afterFirst));
  ok('a poll does NOT refit (view stays where you put it)', H.chart.fits === afterFirst, String(H.chart.fits));
}

console.log('[chart: stale response from a pair you already left is discarded]');
{
  // Switching pairs used to let a slow response land on the new pair's chart.
  let release; const gate = new Promise(r => { release = r; });
  let n = 0;
  const H = harness({ fetchImpl: async () => { n++; if (n === 1) { await gate; return okRes(9); } return okRes(3); } });
  const api = loadChartCode(html, H);
  const slow = api.mountChart();          // pair A, hangs
  await api.mountChart();                 // pair B, resolves first
  const afterB = H.chart.lastData?.length;
  release(); await slow;
  ok('the superseded response is dropped', H.chart.lastData?.length === afterB, `${afterB} -> ${H.chart.lastData?.length}`);
  ok('only the newest render painted', H.chart.setDataCalls === 1, String(H.chart.setDataCalls));
}

console.log('[chart: candle cache has a TTL - it cannot serve forever]');
{
  let calls = 0;
  const H = harness({ fetchImpl: async () => { calls++; return okRes(); } });
  const api = loadChartCode(html, H);
  await api.loadCandles();
  await api.loadCandles();
  ok('a second call inside the TTL is served from cache', calls === 1, String(calls));
  H.advance(120_000);
  await api.loadCandles();
  ok('past the TTL it refetches (no permanent staleness)', calls === 2, String(calls));
  await api.loadCandles(true);
  ok('force bypasses the cache', calls === 3, String(calls));
}

console.log('[chart: freshness stamp tells a live chart from a stalled one]');
{
  const H = harness({ fetchImpl: async () => okRes() });
  const api = loadChartCode(html, H);
  await api.mountChart();
  ok('age shown after a paint', /updated \d+s ago/.test(H.els.pxAge.textContent), H.els.pxAge.textContent);
  H.advance(10 * 60_000); api.paintAge();
  ok('old data reads in minutes', /updated \d+m ago/.test(H.els.pxAge.textContent), H.els.pxAge.textContent);
  ok('and is coloured as a warning', H.els.pxAge.style.color === '#e8615f', H.els.pxAge.style.color);
}

console.log('[chart: every offered timeframe is one the API actually serves]');
{
  // The original defect in one assertion: the toolbar advertised M15 and H4 while
  // /api/oanda_ohlc5m only defined M5|H1|D, so two buttons were guaranteed 400s.
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const tbl = server.slice(server.indexOf('const _OHLC_GRAN'), server.indexOf('app.get(\'/api/oanda_ohlc5m\''));
  const served = new Set([...tbl.matchAll(/^\s*(M\d+|H\d+|D)\s*:/gm)].map(m => m[1]));
  const offered = (html.match(/const tf=\[([^\]]+)\]/) || [])[1]
    ?.split(',').map(s => s.trim().replace(/'/g, '')) || [];
  ok('toolbar offers at least M5/M15/H1/D', ['M5', 'M15', 'H1', 'D'].every(t => offered.includes(t)), offered.join('|'));
  const missing = offered.filter(t => !served.has(t));
  ok('EVERY offered timeframe is served by the API', missing.length === 0, 'missing: ' + (missing.join(',') || 'none'));
  ok('the chart requests the live forming bar', /incomplete=1/.test(html));
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
