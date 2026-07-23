// cog-standalone/server.js
// ─────────────────────────────────────────────────────────────────────────────
// A fully SELF-SUFFICIENT, isolated Railway service for the COG Forecast Replay
// page. It does NOT depend on the main dashboard at all — it talks DIRECTLY to
// Cloudflare KV (the same namespace, so the reference store is shared) and to
// OANDA (for candles), using its own credentials. That means it keeps working
// even when the main site is locked down.
//
// It serves ONLY cog-replay.html plus the four endpoints that page calls; every
// other path returns 404. Deploy this FOLDER on its own (Railway → Root Directory
// = cog-standalone) so nothing else from the repo ships with it.
//
// ── Required env vars (set on THIS Railway service — same values as the main app) ──
//   OANDA_KEY            OANDA API key (candles)
//   OANDA_ENV            'live' (default) or 'practice' — must match the key
//   CF_ACCOUNT_ID        Cloudflare account ID
//   CF_API_TOKEN         API token with KV read+write on the namespace
//   CF_KV_NAMESPACE_ID   (optional) KV namespace ID — defaults to the shared one below
//
// WRITES: the reference Save endpoint is enabled so others can keep the KV store
// current in your absence. For a read-only share, delete the app.post(...) line.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Cloudflare KV (REST) — mirrors kv.js so the reference store is shared ──────
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;
const CF_KV_NS_ID   = process.env.CF_KV_NAMESPACE_ID || '37e632371b754333bcbb33093f33b3bb';
const CF_OK   = !!(CF_ACCOUNT_ID && CF_API_TOKEN);
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NS_ID}`;
const CF_HEADERS = { Authorization: `Bearer ${CF_API_TOKEN}` };

async function kvGet(key) {
  const r = await fetch(`${CF_BASE}/values/${encodeURIComponent(key)}`, { headers: CF_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`CF KV GET ${key}: ${r.status}`);
  return await r.text();
}
async function kvPut(key, value) {
  const r = await fetch(`${CF_BASE}/values/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { ...CF_HEADERS, 'Content-Type': 'text/plain' }, body: value,
  });
  if (!r.ok) throw new Error(`CF KV PUT ${key}: ${r.status}`);
}

// ── OANDA candles — ported verbatim from server.js fetchOandaCandleRange ───────
function oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
}
async function fetchOandaCandleRange(instrument, gran, fromISO, toISO) {
  const key = process.env.OANDA_KEY, base = oandaBase();
  const toMs = Date.parse(toISO);
  const align = gran === 'D' ? '&alignmentTimezone=Europe%2FLondon&dailyAlignment=0' : '';
  let from = fromISO;
  const out = [];
  for (let page = 0; page < 40; page++) {
    const url = `${base}/v3/instruments/${encodeURIComponent(instrument)}/candles`
              + `?granularity=${gran}&from=${encodeURIComponent(from)}&count=5000&price=M${align}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`OANDA ${instrument} ${gran} HTTP ${r.status}`);
    const candles = (await r.json()).candles ?? [];
    let lastTime = null, stop = false;
    for (const c of candles) {
      if (!c.mid) continue;
      const tMs = Date.parse(c.time);
      if (tMs > toMs) { stop = true; break; }
      if (c.complete === false && gran !== 'D') continue;
      out.push({
        _ms: tMs,
        datetime: new Date(c.time).toLocaleString('sv-SE', { timeZone: 'Europe/London' }).substring(0, 19),
        open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c,
      });
      lastTime = c.time;
    }
    if (stop || candles.length < 5000 || !lastTime) break;
    from = lastTime;
  }
  const seen = new Set();
  return out.filter(v => (seen.has(v._ms) ? false : (seen.add(v._ms), true))).map(({ _ms, ...v }) => v);
}

// ── COG export parser — ported verbatim from server.js _parseExportText ────────
function parseExportText(text) {
  const result = {};
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const hdr = line.match(/^────\s+(\S+)\s+─/);
    if (hdr) { cur = hdr[1]; result[cur] = {}; continue; }
    if (!cur) continue;
    const vol = line.match(/Volatility.*?:\s*([\d.]+)%/);
    if (vol) { result[cur].vol = parseFloat(vol[1]); continue; }
    const hl = line.match(/High to Low.*?:\s*([\d.]+)%.*?([\d.]+)%/);
    if (hl) { result[cur].hl_med = parseFloat(hl[1]); result[cur].hl_75 = parseFloat(hl[2]); continue; }
    const oc = line.match(/Open to Close.*?:\s*([\d.]+)%.*?([\d.]+)%/);
    if (oc) { result[cur].oc_med = parseFloat(oc[1]); result[cur].oc_75 = parseFloat(oc[2]); }
  }
  return result;
}

app.use(express.json({ limit: '1mb' }));

// Load the page at boot, but never let a read error crash the process — the
// healthcheck must still come up so the deploy can report a clear state.
let PAGE = '';
try {
  PAGE = fs.readFileSync(path.join(__dirname, 'cog-replay.html'), 'utf8');
} catch (e) {
  console.error('[cog-standalone] could not read cog-replay.html:', e.message);
}

// Healthcheck target — ALWAYS 200, no env or file dependency, so a healthy
// process is never marked unhealthy. Reports what's configured so the first
// deploy is diagnosable from the URL alone.
app.get('/api/config', (_req, res) => res.json({
  ok: true, service: 'cog-replay-standalone',
  page_loaded: PAGE.length > 0,
  cloudflare_kv: CF_OK, oanda: !!process.env.OANDA_KEY,
}));

// The ONLY page this service serves.
app.get(['/', '/cog-replay.html'], (_req, res) => {
  if (!PAGE) return res.status(500).type('text/plain').send('cog-replay.html not bundled with this deploy');
  res.type('html').send(PAGE);
});

// ── The four endpoints cog-replay.html calls, served directly ─────────────────

// All stored COG reference dates, parsed → { date: { INST: {vol,hl_med,hl_75,oc_med,oc_75} } }
app.get('/api/vol-forecast/reference-dump', async (_req, res) => {
  if (!CF_OK) return res.status(503).json({ ok: false, error: 'CF_ACCOUNT_ID / CF_API_TOKEN not set' });
  try {
    const idxRaw = await kvGet('vol_reference_index').catch(() => null);
    const dates = idxRaw ? JSON.parse(idxRaw).map(e => e.date).filter(Boolean).sort() : [];
    const ref = {};
    for (const d of dates) {
      const raw = await kvGet(`vol_reference_${d}`).catch(() => null);
      if (!raw) continue;
      try { ref[d] = parseExportText(JSON.parse(raw).text); } catch { /* skip malformed */ }
    }
    res.json({ ok: true, dates: Object.keys(ref).length, ref });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Load one day's raw export.
app.get('/api/vol-forecast/reference/:date', async (req, res) => {
  if (!CF_OK) return res.status(503).json({ ok: false, error: 'CF_ACCOUNT_ID / CF_API_TOKEN not set' });
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
  try {
    const raw = await kvGet(`vol_reference_${date}`);
    if (!raw) return res.status(404).json({ ok: false, error: `No reference data for ${date}` });
    res.json({ ok: true, ...JSON.parse(raw) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Save a day's export back to the shared KV (+ maintain the index).
app.post('/api/vol-forecast/reference/:date', async (req, res) => {
  if (!CF_OK) return res.status(503).json({ ok: false, error: 'CF_ACCOUNT_ID / CF_API_TOKEN not set' });
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'body.text required' });
  try {
    await kvPut(`vol_reference_${date}`, JSON.stringify({ date, text, saved_at: new Date().toISOString() }));
    const idxRaw = await kvGet('vol_reference_index').catch(() => null);
    const idx = idxRaw ? JSON.parse(idxRaw) : [];
    if (!idx.find(e => e.date === date)) { idx.unshift({ date }); if (idx.length > 120) idx.pop(); }
    await kvPut('vol_reference_index', JSON.stringify(idx));
    res.json({ ok: true, date });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// OANDA candles for the chart. ?symbol=EUR_USD&from=&to=&granularity=M15
const RANGE_GRAN = new Set(['M5', 'M15', 'M30', 'H1', 'D']);
app.get('/api/ohlc-range', async (req, res) => {
  if (!process.env.OANDA_KEY) return res.status(503).json({ error: 'OANDA_KEY not set' });
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: 'symbol param required' });
  const gran = String(req.query.granularity || 'M15').toUpperCase();
  if (!RANGE_GRAN.has(gran)) return res.status(400).json({ error: `Unsupported granularity: ${gran}` });
  const from = String(req.query.from ?? ''), to = String(req.query.to ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'from & to required as YYYY-MM-DD' });
  }
  const fromISO = `${from}T00:00:00Z`, toISO = `${to}T23:59:59Z`;
  if (Date.parse(toISO) < Date.parse(fromISO)) return res.status(400).json({ error: 'to must be ≥ from' });
  const instrument = String(symbol).replace('/', '_');
  try {
    const values = await fetchOandaCandleRange(instrument, gran, fromISO, toISO);
    res.json({ values, meta: { symbol, granularity: gran, from, to, count: values.length } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Everything else is invisible.
app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(PORT, '0.0.0.0', () => console.log(
  `[cog-standalone] COG replay on :${PORT} — page ${PAGE.length > 0 ? 'loaded' : 'MISSING'}, CF KV ${CF_OK ? 'configured' : 'MISSING'}, OANDA ${process.env.OANDA_KEY ? 'configured' : 'MISSING'}`
));
