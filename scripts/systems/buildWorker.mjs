/**
 * Builds systems off the server's main thread (plan §9ad): a worker_threads worker that, for each job, reads the
 * trades (a backfill adapter from scripts/systems/backfill.mjs, or trades a study uploaded), normalises them, computes
 * the tearsheet and the post-mortem summary, and gzips the trade list. The server stores the result in R2 (trades and
 * tearsheet) and KV (the index). Big systems take seconds of CPU; here that does not stall the site.
 *
 * workerData: { jobs: [{ id, adapter?: true, raw?, meta? }] }. Posts { id, ok, meta, gz, tearsheet, summary } or
 * { id, ok: false, error } per job, then { done: true }.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { normaliseTrades, tearsheet } from '../../js/systemExports.js';
import { reviewSystem } from '../../js/systemReview.js';

const { SYSTEMS } = await import('./backfill.mjs');
for (const job of workerData.jobs ?? []) {
  try {
    let raw = job.raw, meta = { ...(job.meta ?? {}) };
    if (job.adapter) {
      const sys = SYSTEMS.find(s => s.id === job.id); if (!sys) throw new Error(`no adapter for ${job.id}`);
      raw = sys.trades(); meta = { model: sys.name, doc: sys.doc ?? null, evidence: sys.evidence ?? null, costs: sys.costs ?? null, note: sys.note ?? null, source: 'backfill', ...meta };
    }
    // Systems that take many trades a day at 1% each would risk the whole account daily; the studies sized them as a
    // book. Without a stated risk, scale each trade so a typical (median) trading day risks about 1% of equity.
    if (job.adapter && !raw.some(t => Number.isFinite(t.riskPct))) {
      const perDay = {}; for (const t of raw) { const d = new Date(t.exitMs).toISOString().slice(0, 10); perDay[d] = (perDay[d] ?? 0) + 1; }
      const c = Object.values(perDay).sort((a, b) => a - b), med = c[c.length >> 1] ?? 1;
      if (med > 1.5) { meta.riskPct = +(1 / med).toPrecision(3); meta.riskNote = `${med} trades on a median day: each trade risks ${meta.riskPct}% so a typical day risks about 1% (the study sized it as a book)`; }
    }
    const { trades, errors } = normaliseTrades(raw, meta);
    if (!trades.length) throw new Error(`no usable trades (${errors.slice(0, 2).join('; ')})`);
    meta.skipped = errors.length; meta.writtenAt = new Date().toISOString();
    const ts = tearsheet(trades, meta), rv = reviewSystem(trades);
    const body = `{"id":${JSON.stringify(job.id)},"meta":${JSON.stringify(meta)},"trades":[\n${trades.map(t => JSON.stringify(t)).join(',\n')}\n]}\n`;
    const gz = new Uint8Array(gzipSync(body, { level: 9 }));   // its own ArrayBuffer, so it can be transferred
    parentPort.postMessage({ id: job.id, ok: true, meta, gz, tearsheet: { id: job.id, meta, ...ts },
      summary: { trades: trades.length, from: ts.from, to: ts.to, sharpe: ts.portfolio?.sharpe ?? null, maxDD: ts.portfolio?.maxDD ?? null, meanR: rv.ok ? rv.overall.meanR : null, trend: rv.ok ? rv.decay.trend : null, survivors: rv.ok ? rv.survivors.length : null } }, [gz.buffer]);
  } catch (e) { parentPort.postMessage({ id: job.id, ok: false, error: e.message }); }
}
parentPort.postMessage({ done: true });
