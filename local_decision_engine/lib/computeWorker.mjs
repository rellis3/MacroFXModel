/**
 * computeWorker.mjs — runs computeZones() on a separate OS thread via
 * Node's worker_threads, so it can never block server.mjs's main event
 * loop (and therefore never delay an incoming /plan or /decide response),
 * no matter how long a single pair's atlasWalk takes.
 *
 * Measured live 2026-09-18: real per-pair cost is 1.3-2.8s at the 100-day
 * local window -- 2-4x the ~500-800ms this codebase's docs had assumed
 * (this machine is evidently slower/busier than whatever baseline that
 * came from) -- and a full 17-pair cold warm-up took 31.4s. Yielding
 * between pairs (server.mjs's earlier fix) only interleaves opportunities
 * for a pending request to be served from cache; it doesn't reduce how
 * long any SINGLE synchronous call blocks, and a single call at this real
 * cost can approach half of even an 8s client timeout on its own. Moving
 * the compute off-thread is the actual fix, not another yield-granularity
 * tweak.
 */
import { parentPort } from 'worker_threads';
import { computeZones } from './zonePricer.mjs';

parentPort.on('message', (msg) => {
  const { id, pair, book, packed, earlyExit, earlyExitThreshold } = msg;
  try {
    const t0 = Date.now();
    const result = computeZones(pair, { book, packed, earlyExit, earlyExitThreshold });
    parentPort.postMessage({ id, ok: true, result, ms: Date.now() - t0 });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message });
  }
});
