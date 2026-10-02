// 1-minute VIX / VXN recorder (started 2026-10-02). Yahoo Finance serves 1-minute bars for only the last 7 days, so this
// job pulls them every 6 hours and keeps them, building the minute-level history needed to test COG's "VIX vs Nasdaq
// relative move" idea at the vol lines later (the hourly version is in fade-continue-book: VIX_DIVERGENCE_RESULTS.md).
// Source is Yahoo's unofficial chart endpoint: free, no key, can change or rate-limit without notice — failures are
// recorded in the status, never retried in a loop.
// Storage (R2): vix_m1/<SYM>/<YYYY-MM-DD>.json = { sym, date, t:[sec], o:[], h:[], l:[], c:[] } per UTC date, merged on
// every pull (union by timestamp); vix_m1/status.json = { lastRun, ok, perSym: { SYM: { days, lastBar, error } } }.
export const VIX_SYMBOLS = [{ sym: 'VIX', yahoo: '^VIX' }, { sym: 'VXN', yahoo: '^VXN' }];
const URL = y => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=1m&range=7d`;

export function createVixCapture({ r2, fetchImpl = fetch, log = console }) {
  let running = false;

  async function pullOne({ sym, yahoo }) {
    const r = await fetchImpl(URL(yahoo), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
    const res = (await r.json())?.chart?.result?.[0];
    const t = res?.timestamp ?? [], q = res?.indicators?.quote?.[0] ?? {};
    if (!t.length) throw new Error('Yahoo returned no bars');
    const byDay = new Map();
    t.forEach((ts, i) => {
      if (q.close?.[i] == null) return;
      const d = new Date(ts * 1000).toISOString().slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, new Map());
      byDay.get(d).set(ts, [q.open[i], q.high[i], q.low[i], q.close[i]]);
    });
    for (const [date, bars] of byDay) {
      const key = `vix_m1/${sym}/${date}.json`;
      const prev = await r2.getJSON(key).catch(() => null);
      if (prev?.t) prev.t.forEach((ts, i) => { if (!bars.has(ts)) bars.set(ts, [prev.o[i], prev.h[i], prev.l[i], prev.c[i]]); });
      const ts = [...bars.keys()].sort((a, b) => a - b);
      await r2.putJSON(key, { sym, date, t: ts, o: ts.map(x => bars.get(x)[0]), h: ts.map(x => bars.get(x)[1]), l: ts.map(x => bars.get(x)[2]), c: ts.map(x => bars.get(x)[3]) });
    }
    return { days: [...byDay.keys()].sort(), lastBar: new Date(t.at(-1) * 1000).toISOString() };
  }

  async function tick(reason = 'scheduled') {
    if (running) return { skipped: 'already running' };
    if (!r2.configured()) return { ok: false, error: 'R2 not configured' };
    running = true;
    const status = (await r2.getJSON('vix_m1/status.json').catch(() => null)) ?? { perSym: {} };
    try {
      for (const s of VIX_SYMBOLS) {
        try {
          const got = await pullOne(s), prev = status.perSym[s.sym] ?? {};
          const days = [...new Set([...(prev.days ?? []), ...got.days])].sort();
          status.perSym[s.sym] = { days, lastBar: got.lastBar, error: null };
        } catch (e) {
          status.perSym[s.sym] = { ...(status.perSym[s.sym] ?? {}), error: `${new Date().toISOString()} ${e.message}` };
          log.warn?.(`[vix-capture] ${s.sym}: ${e.message}`);
        }
      }
      status.lastRun = new Date().toISOString(); status.reason = reason;
      status.ok = VIX_SYMBOLS.every(s => !status.perSym[s.sym]?.error);
      await r2.putJSON('vix_m1/status.json', status);
      return status;
    } finally { running = false; }
  }

  function mount(app) {
    app.get('/api/vix-capture', async (_req, res) => {
      try { res.json((await r2.getJSON('vix_m1/status.json')) ?? { perSym: {}, note: 'no capture yet' }); }
      catch (e) { res.status(503).json({ error: e.message }); }
    });
    app.post('/api/vix-capture/run', async (_req, res) => res.json(await tick('manual')));
  }
  return { tick, mount };
}
