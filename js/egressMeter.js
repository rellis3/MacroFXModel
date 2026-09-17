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
// Deliberately in-memory and reset on redeploy: it is a diagnostic, not a
// ledger. Pure counting, no timers, no I/O — safe on every request path.

const _buckets = { http: new Map(), kv: new Map(), r2: new Map() };
const _bootAt = Date.now();
let _totalBytes = 0;

export function noteBytes(bucket, label, bytes) {
  if (!bytes || bytes <= 0) return;
  const m = _buckets[bucket];
  if (!m) return;
  const row = m.get(label) || { bytes: 0, count: 0 };
  row.bytes += bytes;
  row.count += 1;
  m.set(label, row);
  _totalBytes += bytes;
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
  const hours = Math.max(1 / 60, (Date.now() - _bootAt) / 3_600_000);
  const sum = m => [...m.values()].reduce((a, r) => a + r.bytes, 0);
  const gbPerDay = (_totalBytes / 1e9) * (24 / hours);
  return {
    since: new Date(_bootAt).toISOString(),
    hours: +hours.toFixed(2),
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
