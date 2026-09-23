/**
 * IV Forecast export — the production "Forecast p50/75/90" daily export with the σ
 * swapped to the option market's 30-day ATM implied vol on the instruments where
 * that measurably beat the realized-vol ladder out of sample.
 *
 * Evidence (forge/IV_LADDER_PREREG.md, forge/out_vol_iv/compare.json, 2026-09-23):
 * same London 00-22 sessions, same rows, same 6 walk-forward folds, 2020-09 → 2026-08.
 * H-L pinball vs the realized ladder: EURUSD −4.1%, GBPUSD −4.1%, AUDUSD −2.5%,
 * USDCAD −3.1%, USDCHF −3.1% (lower is better). USDJPY (+1.0%) and NQ (+2.0%) LOST,
 * so they are deliberately NOT swapped — every other block is the production ladder,
 * byte-for-byte. Weekly/monthly IV rungs were badly calibrated OOS, so this is
 * daily-only.
 *
 * Output goes through the SAME `buildLadderExportText` as the production export, so
 * every Pine indicator that parses that paste parses this one unchanged.
 *
 * Pure: no network, no clock (`now` is passed in).
 */
import { buildLadder } from './forecastLadder.js';
import { LADDER_PARAMS as IV_LADDER_PARAMS } from './forecastLadderParamsIV.js';
import { constantMaturityIV } from './ivMetrics.js';
import { buildLadderExportText } from './ladderExport.js';

export const IV_LADDER_INSTRUMENTS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDCHF'];

// The capture runs ~05:40 UTC and carries the PRIOR day's settlement. 72h lets a
// Monday export use Saturday's capture (Friday's settle) if Monday's has not run
// yet; anything older falls back to the realized ladder rather than drawing
// week-old IV as if it were today's.
export const IV_MAX_AGE_H = 72;

const _norm = x => String(x).toLowerCase().replace(/[/_]/g, '');

/**
 * @param {object} latest   forecastState.latest ({ session_label, instruments })
 * @param {object} oiStore  parsed oi_store `data` (keyed 'EUR/USD', 'NAS100_USD', …)
 * @param {Array}  registry VOL_INSTRUMENTS ({ name, oandaInstrument, assetClass })
 * @param {number} now      ms epoch
 * @returns {{ instruments, swapped: [{name, iv30, savedAtMs}], skipped: [{name, reason}] }}
 */
export function buildIvInstruments(latest, oiStore, registry, now) {
  const src = latest?.instruments ?? {};
  const instruments = {};
  const swapped = [], skipped = [];
  const keys = Object.keys(oiStore ?? {});
  const byName = Object.fromEntries((registry ?? []).map(c => [c.name, c]));

  for (const [name, fc] of Object.entries(src)) {
    instruments[name] = fc;
    if (!IV_LADDER_INSTRUMENTS.includes(name)) continue;
    const cfg = byName[name];
    const key = cfg && keys.find(k => _norm(k) === _norm(cfg.oandaInstrument));
    const inst = key ? oiStore[key] : null;
    const pts = inst?.ivTermStructure?.points;
    const savedAt = inst?.ivSavedAtMs ?? inst?.savedAtMs ?? null;
    if (!Array.isArray(pts) || !pts.length) { skipped.push({ name, reason: 'no IV term structure' }); continue; }
    if (!Number.isFinite(savedAt) || (now - savedAt) > IV_MAX_AGE_H * 3600_000) {
      skipped.push({ name, reason: 'IV capture stale' }); continue;
    }
    const iv30 = constantMaturityIV(pts);
    if (!(iv30 > 0)) { skipped.push({ name, reason: 'no expiry >= 5 DTE' }); continue; }
    const base = fc?.ladder;
    const lad = buildLadder(iv30 / Math.sqrt(252), {
      instrument: name, assetClass: cfg.assetClass ?? 'fx',
      // Pass the production tag through AS-IS, null included: null means "calendar
      // unreadable" and must stay x1.0, not become 'none' (the quiet-day discount).
      eventTag: base ? base.event_tag : 'none', horizon: 'daily', ladderParams: IV_LADDER_PARAMS,
    });
    instruments[name] = { ...fc, ladder: lad };
    swapped.push({ name, iv30: +(iv30 * 100).toFixed(2), savedAtMs: savedAt });
  }
  return { instruments, swapped, skipped };
}

/** Full export text. The trailing note deliberately names NO ticker and none of the
 *  row tokens (RANGE / MOVE / OPEN HIGH / OPEN LOW / DRIFT): the Pine parser switches
 *  blocks on any line containing a ticker, so a footer that listed them would be read
 *  as a section header. */
export function buildIvLadderExportText(latest, oiStore, registry, now) {
  const { instruments, swapped, skipped } = buildIvInstruments(latest, oiStore, registry, now);
  let text = buildLadderExportText({ session_label: latest?.session_label, instruments }, 'daily');
  const at = swapped.length
    ? new Date(Math.max(...swapped.map(s => s.savedAtMs))).toISOString().slice(0, 16).replace('T', ' ')
    : null;
  text += `\n[IV forecast: ${swapped.length} of ${IV_LADDER_INSTRUMENTS.length} USD majors use CME 30-day ATM implied vol`
        + (at ? ` (captured ${at} UTC)` : '')
        + ` · every other block is the standard realized-vol ladder]`;
  return { text, swapped, skipped };
}
