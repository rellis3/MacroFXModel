// oi-profile-lines, stage 0: pull the nightly OI archive (oi_raw_<date>) and the day's vol forecast (vol_forecast_<date>) from Cloudflare KV.
// READ-ONLY: GET and key-list calls only, nothing is written to KV. Run with the Railway env so the CF vars exist:
//   railway run node scripts/oi-profile-lines/pull_kv.mjs <outDir>
// Files already on disk are skipped, so a re-run only fetches new days.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) { console.error('usage: pull_kv.mjs <outDir>'); process.exit(1); }
const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
const NS = process.env.CF_KV_NAMESPACE_ID || '37e632371b754333bcbb33093f33b3bb';
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) { console.error('CF_ACCOUNT_ID / CF_API_TOKEN not set (run under railway run)'); process.exit(1); }
const BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${NS}`;
const H = { Authorization: `Bearer ${CF_API_TOKEN}` };

async function get(url) {
  for (let a = 0; a < 5; a++) {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(60_000) });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 1000 * 2 ** a)); continue; }
    return r;
  }
  throw new Error('rate limited: ' + url);
}
async function listKeys(prefix) {
  const keys = []; let cursor = null;
  do {
    const r = await get(`${BASE}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    const j = await r.json();
    if (!j.success) throw new Error(JSON.stringify(j.errors));
    keys.push(...j.result.map(k => k.name));
    cursor = j.result_info?.cursor || null;
  } while (cursor);
  return keys;
}

fs.mkdirSync(out, { recursive: true });
for (const prefix of ['oi_raw_', 'vol_forecast_']) {
  const keys = (await listKeys(prefix)).filter(k => /\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  let got = 0, skip = 0, miss = 0;
  for (const k of keys) {
    const f = path.join(out, `${k}.json`);
    if (fs.existsSync(f) && fs.statSync(f).size > 0) { skip++; continue; }
    const r = await get(`${BASE}/values/${encodeURIComponent(k)}`);
    if (!r.ok) { miss++; console.warn(k, r.status); continue; }
    fs.writeFileSync(f, await r.text()); got++;
  }
  console.log(`${prefix}: ${keys.length} keys (${keys[0]} .. ${keys.at(-1)}), fetched ${got}, already had ${skip}, failed ${miss}`);
}
