// ladder-v2 SHADOW exports for the v3 page (logic: js/ladderV2Shadow.js). READ-ONLY: OANDA candles in, paste text
// out; nothing is written and nothing live reads it.
//
//   GET /api/vol-forecast/ladder-v2/export?kind=forecast|exhaustion&track=cfd|fut
//
// Inputs: NAS100 NY-close daily bars from 2016 (har_rv_log), XAU / EUR 5-minute mid candles for the last 45 days
// (HAR-CJ). Cached 10 minutes.
import { oandaCandles } from './volStateRoutes.js';
import { PARAMS, nqSigma, harcjSigma, buildText, sessionDate, nyKey } from './ladderV2Shadow.js';

const TTL_MS = 10 * 60e3;
let cache = null, cacheAt = 0, building = null;

async function m5Closes(instrument, days = 45) {
  const out = [];
  let from = Math.floor(Date.now() / 1000) - days * 86400;
  for (let guard = 0; guard < 6; guard++) {
    const iso = new Date(from * 1000).toISOString().replace(/\.\d{3}Z$/, '.000000000Z');
    const c = await oandaCandles(instrument, `granularity=M5&count=5000&from=${encodeURIComponent(iso)}`);
    const done = c.filter(x => x.complete);
    for (const x of done) if (!out.length || x.t > out[out.length - 1][0]) out.push([x.t, x.c]);
    if (c.length < 5000) break;
    from = c[c.length - 1].t + 1;
  }
  return out;
}

async function build() {
  const session = sessionDate();
  const d = await oandaCandles(PARAMS.instruments.NQ.oanda,
    `granularity=D&dailyAlignment=17&alignmentTimezone=${encodeURIComponent('America/New_York')}&count=5000&from=${encodeURIComponent('2015-12-01T00:00:00.000000000Z')}`);
  const d1 = d.filter(x => x.complete).map(x => ({ key: nyKey(x.t), open: x.o, high: x.h, low: x.l, close: x.c }));
  const [gold, eur] = await Promise.all([m5Closes(PARAMS.instruments.GOLD.oanda), m5Closes(PARAMS.instruments.EURUSD.oanda)]);
  const sigmas = { NQ: nqSigma(d1, session), GOLD: harcjSigma('GOLD', gold, session), EURUSD: harcjSigma('EURUSD', eur, session) };
  return { session, sigmas, at: Date.now() };
}

async function inputs() {
  if (cache && Date.now() - cacheAt < TTL_MS && cache.session === sessionDate()) return cache;
  if (!building) building = build().then(v => { cache = v; cacheAt = Date.now(); return v; }).finally(() => { building = null; });
  return building;
}

export { build as buildLadderV2Inputs };   // diagnostics / live check

export function mountLadderV2Shadow(app) {
  app.get('/api/vol-forecast/ladder-v2/export', async (req, res) => {
    const kind = req.query.kind === 'exhaustion' ? 'exhaustion' : 'forecast';
    const track = req.query.track === 'fut' ? 'fut' : 'cfd';
    try {
      const { session, sigmas } = await inputs();
      res.set('X-Ladder-V2-Asof', Object.entries(sigmas).map(([k, v]) => `${k}:${v?.asof ?? 'none'}`).join(','));
      res.type('text/plain').send(buildText(kind, track, sigmas, session));
    } catch (e) {
      res.status(500).type('text/plain').send(`Error: ${e.message}`);
    }
  });
}
