// Egress meter — where do the bytes that LEAVE this box go?
//
// Railway bills outbound bandwidth ($0.05/GB) and gives one number for the
// whole service; the 2026-09-15..17 window showed 392 GB in 2.6 days (~6 GB/h)
// against a projected $128 bill, with no way to see which endpoint or
// background job was responsible. This counts every byte in three buckets,
// since process boot, and GET /api/egress-audit reports them ranked:
//
//   http — every response body, by route template (after compression, so
//          it's the number the bill sees), split by client class so a bot
//          polling a fat endpoint shows up separately from a browser tab
//   kv   — every Cloudflare KV PUT body, by key (the KV REST API is outbound)
//   r2   — every R2 upload from server.js, by key prefix
//
// Persists across redeploys (this box redeploys several times a day, so a
// since-boot number alone never accumulated a useful picture): the ledger is
// loaded from KV key `egress_audit` at boot, flushed every FLUSH_MS and on
// SIGTERM, and carries per-label totals since `since` plus a per-UTC-day
// series (last 60 days) so the trend after a fix is visible, not just the
// total. Counting itself stays pure and synchronous -- no I/O on any
// request path; the flush is the only writer.

export const KV_KEY = 'egress_audit';
const FLUSH_MS = 5 * 60_000;
const DAYS_KEPT = 60;

const _buckets = { http: new Map(), kv: new Map(), r2: new Map() };
const _days = new Map();                 // 'YYYY-MM-DD' -> { http, kv, r2 } bytes
let _since = new Date().toISOString();
let _deploys = 1;
let _totalBytes = 0;
let _bootAt = Date.now();
let _dirty = false;
let _kv = null;                          // { get(key), put(key, value) } -- injected by server.js

function _today() { return new Date().toISOString().slice(0, 10); }

export function noteBytes(bucket, label, bytes) {
  if (!bytes || bytes <= 0) return;
  const m = _buckets[bucket];
  if (!m) return;
  const row = m.get(label) || { bytes: 0, count: 0 };
  row.bytes += bytes;
  row.count += 1;
  m.set(label, row);
  const d = _today();
  const day = _days.get(d) || { http: 0, kv: 0, r2: 0 };
  day[bucket] += bytes;
  _days.set(d, day);
  _totalBytes += bytes;
  _dirty = true;
}

function _serialize() {
  const obj = m => Object.fromEntries([...m.entries()]);
  const days = [..._days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-DAYS_KEPT);
  return { since: _since, deploys: _deploys, total_bytes: _totalBytes, savedAt: new Date().toISOString(),
           buckets: { http: obj(_buckets.http), kv: obj(_buckets.kv), r2: obj(_buckets.r2) },
           days: Object.fromEntries(days) };
}

function _restore(saved) {
  if (!saved || typeof saved !== 'object') return;
  _since = saved.since || _since;
  _deploys = (saved.deploys || 0) + 1;
  _totalBytes += saved.total_bytes || 0;
  // ADD the saved totals onto whatever this boot already counted (requests
  // served while the ledger was loading), never replace.
  for (const b of ['http', 'kv', 'r2']) {
    for (const [label, row] of Object.entries(saved.buckets?.[b] || {})) {
      const cur = _buckets[b].get(label) || { bytes: 0, count: 0 };
      _buckets[b].set(label, { bytes: cur.bytes + (row.bytes || 0), count: cur.count + (row.count || 0) });
    }
  }
  for (const [d, row] of Object.entries(saved.days || {})) {
    const cur = _days.get(d) || { http: 0, kv: 0, r2: 0 };
    _days.set(d, { http: cur.http + (row.http || 0), kv: cur.kv + (row.kv || 0), r2: cur.r2 + (row.r2 || 0) });
  }
  _dirty = true;
}

// server.js calls this once with its kv module. Loads the ledger, then flushes
// on a timer and on shutdown. Never throws -- a KV hiccup just means this
// deploy's numbers start from the last flush.
export async function egressPersist(kvApi) {
  _kv = kvApi;
  try {
    const raw = await _kv.get(KV_KEY);
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    _restore(saved);
  } catch (e) { console.warn('[egress] ledger load failed, starting fresh:', e.message); }
  const flush = async () => {
    if (!_dirty || !_kv) return;
    _dirty = false;
    try { await _kv.put(KV_KEY, JSON.stringify(_serialize())); }
    catch (e) { _dirty = true; console.warn('[egress] ledger flush failed:', e.message); }
  };
  const timer = setInterval(flush, FLUSH_MS);
  timer.unref?.();
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { flush().finally(() => process.exit(0)); });
  return flush;
}

function _clientClass(ua = '') {
  if (/python-requests|python-urllib|aiohttp/i.test(ua)) return 'py';
  if (/node|undici|axios|got\//i.test(ua)) return 'node';
  if (/Mozilla/i.test(ua)) return 'browser';
  if (!ua) return 'none';
  return 'other';
}

// Express middleware. Register it BEFORE compression(): compression replaces
// res.write/res.end with its own and calls the previous ones with the
// compressed chunks, so counting at this layer sees the on-the-wire size.
export function egressMiddleware(req, res, next) {
  let sent = 0;
  const origWrite = res.write;
  const origEnd = res.end;
  res.write = function (chunk, ...rest) {
    if (chunk) sent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
    return origWrite.call(this, chunk, ...rest);
  };
  res.end = function (chunk, ...rest) {
    if (chunk && typeof chunk !== 'function') sent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, typeof rest[0] === 'string' ? rest[0] : undefined);
    return origEnd.call(this, chunk, ...rest);
  };
  res.on('finish', () => {
    // Route template where Express has one (app.get('/api/x/:pair')), else the
    // literal path with any query stripped -- static files and 404s land here.
    const tmpl = req.route?.path ? (req.baseUrl || '') + req.route.path : (req.path || req.url.split('?')[0]);
    noteBytes('http', `${req.method} ${tmpl} [${_clientClass(req.get('user-agent'))}]`, sent);
  });
  next();
}

function _rank(m, limit) {
  return [...m.entries()]
    .map(([label, r]) => ({ label, bytes: r.bytes, count: r.count, avg_kb: +(r.bytes / r.count / 1024).toFixed(1) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map(r => ({ ...r, mb: +(r.bytes / 1e6).toFixed(2), share_pct: +((100 * r.bytes) / Math.max(1, _totalBytes)).toFixed(1) }));
}

export function egressSnapshot(limit = 40) {
  const hours = Math.max(1 / 60, (Date.now() - Date.parse(_since)) / 3_600_000);
  const sum = m => [...m.values()].reduce((a, r) => a + r.bytes, 0);
  const gbPerDay = (_totalBytes / 1e9) * (24 / hours);
  const days = [..._days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14)
    .map(([d, r]) => ({ day: d, gb: +((r.http + r.kv + r.r2) / 1e9).toFixed(3), http_gb: +(r.http / 1e9).toFixed(3), kv_gb: +(r.kv / 1e9).toFixed(3), r2_gb: +(r.r2 / 1e9).toFixed(3) }));
  return {
    since: _since,
    deploys: _deploys,
    this_boot: new Date(_bootAt).toISOString(),
    hours: +hours.toFixed(2),
    days,
    total_gb: +(_totalBytes / 1e9).toFixed(3),
    projected_gb_per_day: +gbPerDay.toFixed(2),
    projected_usd_per_month: +(gbPerDay * 30 * 0.05).toFixed(2),
    by_bucket_gb: { http: +(sum(_buckets.http) / 1e9).toFixed(3), kv: +(sum(_buckets.kv) / 1e9).toFixed(3), r2: +(sum(_buckets.r2) / 1e9).toFixed(3) },
    top: [
      ..._rank(_buckets.http, limit).map(r => ({ bucket: 'http', ...r })),
      ..._rank(_buckets.kv, limit).map(r => ({ bucket: 'kv', ...r })),
      ..._rank(_buckets.r2, limit).map(r => ({ bucket: 'r2', ...r })),
    ].sort((a, b) => b.bytes - a.bytes).slice(0, limit),
    note: 'Bytes leaving this process only. Python loops (refresh_m1 R2 uploads: ~26 x ~25MB per market hour until throttled) are not visible here.',
  };
}
