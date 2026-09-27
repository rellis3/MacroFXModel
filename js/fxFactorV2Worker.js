/**
 * Worker-thread entry for the research-only FX factor v2 / OU pairs runs.
 * server.js fetches the data (async I/O on the main thread) and hands it here so
 * the CPU-heavy backtests never block the main event loop that the live bots and
 * schedulers share. workerData = { kind: 'factor' | 'ou', data, opts }.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { runFxFactorV2 } from './fxFactorV2.js';
import { runOuBook, OU_EXITS_V21 } from './ouPairsEngine.js';

const { kind, data, opts } = workerData || {};
try {
  let result;
  if (kind === 'factor') result = runFxFactorV2(data, opts || {});
  else if (kind === 'ou') {
    const { exits, ...rest } = opts || {};
    result = runOuBook(data.pairs, { ...rest, ...(exits === 'v21' ? OU_EXITS_V21 : {}) });
  }
  else throw new Error(`unknown kind '${kind}'`);
  parentPort.postMessage({ ok: true, result });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e?.message || String(e) });
}
