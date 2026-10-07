// Yield-spread book on the long FRED history (forge/YS_LONG_CONFIRM_PREREG.md). FRED public download, no key.
// Reuses the engine's own z-series and rules; replicates simulatePair's trade loop (flat size).
//   node scripts/ys_long/build.mjs
// Writes analysis/output/ys_long/trades.csv, daily_flat.csv, coverage.json; caches FRED csvs under .../fred/.
import fs from 'fs';
import path from 'path';
import { buildRollingZSeries, _shiftDate } from '../../js/zscoreSpreadEngine.js';
import { directionFromZ, resolveInverted, shouldExit, tradeReturn } from '../../js/yieldSpreadCore.js';
import { usdRole } from '../../js/macroDirectionCore.js';

const OUT = 'analysis/output/ys_long';
const FRED = path.join(OUT, 'fred');
fs.mkdirSync(FRED, { recursive: true });
const CFG = { zWindow: 126, entry: 2.0, zExit: 1.5, maxHold: 20, cost: 0.02 / 100, lagUs: 2, lagFor: 45 };
const PAIRS = [
  // key, label, FX series (quoted as the pair), foreign rate (or [old, new, switchDate]), group
  ['usdjpy', 'USDJPY', 'DEXJPUS', 'IRSTCI01JPM156N', 'original'],
  ['gbpusd', 'GBPUSD', 'DEXUSUK', 'IR3TIB01GBM156N', 'original'],
  ['audusd', 'AUDUSD', 'DEXUSAL', 'IR3TIB01AUM156N', 'original'],
  ['usdcad', 'USDCAD', 'DEXCAUS', 'IRSTCI01CAM156N', 'original'],
  ['usdchf', 'USDCHF', 'DEXSZUS', ['IRSTCI01CHM156N', 'IR3TIB01CHM156N', '1999-07-01'], 'original'],
  ['eurusd', 'EURUSD', 'DEXUSEU', 'IRSTCI01DEM156N', 'original'],
  ['nzdusd', 'NZDUSD', 'DEXUSNZ', 'IR3TIB01NZM156N', 'breadth'],
  ['usdnok', 'USDNOK', 'DEXNOUS', 'IR3TIB01NOM156N', 'breadth'],
  ['usdsek', 'USDSEK', 'DEXSDUS', 'IR3TIB01SEM156N', 'breadth'],
];

async function fred(id) {
  const f = path.join(FRED, `${id}.csv`);
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(60_000) });
    const t = await r.text();
    if (!r.ok || !t.startsWith('observation_date')) throw new Error(`FRED ${id}: not a csv`);
    fs.writeFileSync(f, t);
  }
  const m = new Map();
  for (const line of fs.readFileSync(f, 'utf8').trim().split('\n').slice(1)) {
    const [d, v] = line.split(',');
    const x = parseFloat(v);
    if (Number.isFinite(x)) m.set(d, x);
  }
  return m;
}
const shift = (obs, days) => new Map([...obs].map(([d, v]) => [_shiftDate(d, days), v]));

const us = shift(await fred('GS2'), CFG.lagUs);
const tradeRows = ['pair,group,date,exitDate,dir,entryClose,exitClose,entryZ,exitZ,holdDays,exitReason,ret'];
const flatRows = ['pair,date,ret'];
const coverage = {};
for (const [key, label, fxId, rateSpec, group] of PAIRS) {
  const fx = await fred(fxId);
  let foreign;
  if (Array.isArray(rateSpec)) {
    const [oldId, newId, sw] = rateSpec;
    const a = await fred(oldId), b = await fred(newId);
    foreign = new Map([...[...a].filter(([d]) => d < sw), ...[...b].filter(([d]) => d >= sw)]);
  } else foreign = await fred(rateSpec);
  foreign = shift(foreign, CFG.lagFor);
  const daily = [...fx].map(([date, close]) => ({ date, close })).filter(d => d.close > 0).sort((p, q) => (p.date < q.date ? -1 : 1));
  const from = daily[0].date, to = daily.at(-1).date;
  const zBy = buildRollingZSeries(us, foreign, CFG.zWindow, from, to);
  const inverted = resolveInverted(usdRole(key), { autoOrient: true });
  let pos = null, n = 0, firstZ = null;
  for (let i = 0; i < daily.length; i++) {
    const { date, close } = daily[i];
    if (pos && i > 0) flatRows.push(`${label},${date},${(pos.dir === 'LONG' ? 1 : -1) * (close - daily[i - 1].close) / daily[i - 1].close}`);
    const zi = zBy.get(date);
    if (zi == null) continue;
    firstZ ??= date;
    const z = zi.z, absZ = Math.abs(z);
    if (pos) {
      const hold = i - pos.i;
      const ex = shouldExit(absZ, hold, { zExit: CFG.zExit, maxHoldDays: CFG.maxHold });
      if (ex.exit) {
        flatRows.push(`${label},${date},${-CFG.cost}`);
        const ret = tradeReturn(pos.dir, pos.close, close) - CFG.cost;
        tradeRows.push([label, group, pos.date, date, pos.dir, pos.close, close, pos.z.toFixed(3), z.toFixed(3), hold, ex.reason, ret.toFixed(7)].join(','));
        pos = null; n++;
        continue;
      }
    }
    if (!pos && absZ >= CFG.entry) pos = { dir: directionFromZ(z, inverted), close, date, i, z };
  }
  coverage[label] = { group, fx_from: from, fx_to: to, first_z: firstZ, trades: n, inverted };
  console.log(`${label}: FX ${from}→${to}, z from ${firstZ}, ${n} trades`);
}
fs.writeFileSync(path.join(OUT, 'trades.csv'), tradeRows.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'daily_flat.csv'), flatRows.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(coverage, null, 1));
