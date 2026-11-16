/**
 * The extra daily series the Insight tab's "Spreads & ratios" board needs beyond the daily market bundle (/api/drill-series), read-only.
 *   GET /api/spread-extras   { ok, series: { key: { dates: [iso], values: [num] } }, missing: [{ key, id, why }], from, to, at }
 * Eight FRED series that the bundle does not carry: the 3-month bill (DTB3), the effective fed funds rate (DFF), the 10-year term premium (THREEFYTP10),
 * SOFR and the Fed's floor (IORB), the reverse-repo balance (RRPONTSYD), the Fed balance sheet (WALCL) and the Treasury cash account (WDTGAL), the last two
 * converted to $bn. Each is a daily or weekly record; the board lines them up with the bundle's dates (js/terminal/spreadsDerived.js) and never fills a
 * gap beyond the series' own cadence. Nothing is written, no model is called, no vendor is added: it is the same keyless FRED CSV the bundle uses.
 * About 6.5 years each, one at a time (a burst of parallel hits is what gets FRED to refuse), cached for six hours; a failed series is named in `missing`
 * and the rest still serve.   mountSpreadExtras(app, { fredCsv, now })  fredCsv(id) resolves to [{ date, value }].
 */
export const EXTRA_FRED = [
  { key: 'dtb3', id: 'DTB3', scale: 1, unit: '%', what: '3-month Treasury bill' },
  { key: 'dff', id: 'DFF', scale: 1, unit: '%', what: 'effective fed funds rate' },
  { key: 'tp10', id: 'THREEFYTP10', scale: 1, unit: '%', what: '10-year term premium (NY Fed model)' },
  { key: 'sofr', id: 'SOFR', scale: 1, unit: '%', what: 'SOFR' },
  { key: 'iorb', id: 'IORB', scale: 1, unit: '%', what: "interest on reserve balances (the Fed's floor)" },
  { key: 'rrp', id: 'RRPONTSYD', scale: 1, unit: '$bn', what: 'overnight reverse-repo balance' },
  { key: 'walcl', id: 'WALCL', scale: 1e-3, unit: '$bn', what: 'Fed balance sheet (weekly)' },
  { key: 'tga', id: 'WDTGAL', scale: 1e-3, unit: '$bn', what: 'Treasury General Account (weekly)' },
];
export const TTL_MS = 6 * 3600e3;
const YEARS = 6.5;

export function createSpreadExtras({ fredCsv, now = () => Date.now() }) {
  let held = null, inflight = null;
  async function build() {
    const since = new Date(now() - YEARS * 365.25 * 864e5).toISOString().slice(0, 10);
    const series = {}, missing = [];
    for (const s of EXTRA_FRED) {
      try {
        const pts = (await fredCsv(s.id)).filter(o => o.date >= since && Number.isFinite(o.value));
        if (pts.length < 30) throw new Error(`only ${pts.length} observations`);
        series[s.key] = { dates: pts.map(o => o.date), values: pts.map(o => +(o.value * s.scale).toFixed(4)) };
      } catch (e) { missing.push({ key: s.key, id: s.id, why: String(e?.message ?? e) }); }
    }
    const all = Object.values(series); if (!all.length) return { ok: false, error: 'FRED returned none of the extra series', missing };
    return { ok: true, series, missing, from: all.map(a => a.dates[0]).sort()[0], to: all.map(a => a.dates.at(-1)).sort().at(-1), at: new Date(now()).toISOString() };
  }
  async function get(force = false) {
    if (!force && held && now() - held.t < TTL_MS) return held.data;
    if (inflight) return inflight;
    inflight = build().then(d => { if (d.ok) held = { t: now(), data: d }; return d; }).finally(() => { inflight = null; });
    return inflight;
  }
  return { get };
}

export function mountSpreadExtras(app, deps) {
  const x = createSpreadExtras(deps);
  app.get('/api/spread-extras', async (_req, res) => {
    try { const d = await x.get(); res.set('Cache-Control', 'public, max-age=1800'); res.status(d.ok ? 200 : 503).json(d); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  return x;
}
