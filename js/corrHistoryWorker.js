/**
 * Worker-thread entry for the 6-hourly correlation history build (server.js buildCorrHistoryJS).
 * server.js fetches the OANDA H4 bars (async I/O on the main thread) and the COT block, then hands them here: the
 * rolling correlations, the 12 MB JSON.stringify and the file writes all happen off the event loop.
 *
 * workerData = { barData, opts: { pairs, factorProxies, window, step, years }, cot, historyPath, panelPath, panelDays }
 * Posts { ok, nRecords, kb, pairs, alerts, panel } — `alerts` is the hedge_alerts_cache summary, `panel` the terminal's
 * daily-close payload (both small enough for KV).
 */
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { computeCorrHistory, alertsSummary, buildPanel } from './corrHistoryCompute.js';

const { barData, opts, cot, historyPath, panelPath, panelDays } = workerData || {};
try {
  const output = computeCorrHistory(barData, opts);
  if (!output) throw new Error('no pairs with data');
  output.cot_corr = cot?.corr ?? {};
  output.cot_corr_generated = cot?.generated ?? null;
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(output));
  const kb = Math.round(fs.statSync(historyPath).size / 1024);
  const panel = buildPanel(barData, { syms: Object.keys(barData), days: panelDays ?? 780, records: output.records });
  if (panel && panelPath) fs.writeFileSync(panelPath, JSON.stringify(panel));
  parentPort.postMessage({ ok: true, nRecords: output.records.length, kb, pairs: output.pairs, alerts: alertsSummary(output), panel });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e?.message || String(e) });
}
