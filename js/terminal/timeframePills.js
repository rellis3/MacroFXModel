/**
 * Timeframe pills for the Desk Terminal's candle charts: one component, used by every chart that has intraday bars.
 *
 *   mountTfBar(host, { family, inst, days, fetchJson, apply })
 *
 * It draws the 5m / 15m / 30m / 1h / 4h pills and a row of honest chips into `host`, fetches the bars for the chosen timeframe from
 * /api/desk-bars (one cached OANDA call per instrument and timeframe, shared by every viewer: js/deskBarsCore.js), and hands them to the chart through
 * `apply(bars, { tf, fit, meta })`. The chart stays the chart's own; this only chooses the candle size.
 *
 *   - the last choice is remembered per chart FAMILY ('pair', 'asset') in localStorage, every access in try/catch (a private window must still work);
 *   - the chips say what is true: "forming" while the last candle is still being built, "closed · as at Fri 21:00 UTC" while the FX week is shut
 *     (js/marketClock.js), and nothing is invented for the gap;
 *   - while the market is open and the tab is visible the bars refresh on a timer sized to the timeframe (a minute for 5m, ten for 1h and 4h);
 *   - arrow keys move between the pills; each is a real button with aria-pressed; colours are tokens only (see terminal-tabs.css, .tfp-*).
 *
 * dailyChip() is the other half: the muted "daily data" label for the charts that have no intraday series, so it is clear why they carry no pills.
 * Pure helpers are exported and tested by js/terminal/timeframePills.test.mjs; the DOM part is exercised in the headless render.
 */
import { TF_KEYS, DEFAULT_TF, tfOf, describeBars } from '../deskBarsCore.js';
import { clockState } from '../marketClock.js';

export { TF_KEYS, DEFAULT_TF };
const KEY = 'deskTf:';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The remembered timeframe for a chart family, or the default. Never throws. */
export function loadTf(family, store = safeStore()) {
  try { const v = store?.getItem(KEY + family); return TF_KEYS.includes(v) ? v : DEFAULT_TF; } catch { return DEFAULT_TF; }
}
export function saveTf(family, tf, store = safeStore()) {
  try { if (TF_KEYS.includes(tf)) store?.setItem(KEY + family, tf); } catch { /* storage blocked: the choice just is not remembered */ }
}

export const barsUrl = (inst, tf, days) => `/api/desk-bars?inst=${encodeURIComponent(inst)}&tf=${tf}${days ? `&days=${days}` : ''}`;
/** How often an open chart reloads: as often as the server refreshes its answer (a minute for 5m, ten for 1h and 4h). */
export const refreshMs = tf => tfOf(tf).ttlMs;

export function pillsHtml(active, { tfs = TF_KEYS, label = 'Candle size' } = {}) {
  return `<div class="tfp" role="group" aria-label="${esc(label)}">${tfs.map(k => `<button type="button" class="tfp-b" data-tf="${k}" aria-pressed="${k === active}">${k}</button>`).join('')}</div>`;
}

const utcHm = sec => new Date(sec * 1000).toISOString().slice(11, 16);
/** The chips under the pills. info = describeBars(...); clock = clockState(now). */
export function chipsHtml(info, clock, { loading = false, error = null } = {}) {
  const out = [];
  if (error) out.push(`<span class="tfp-chip err" role="status">${esc(error)}</span>`);
  else if (loading) out.push('<span class="tfp-chip" role="status">loading</span>');
  if (info?.forming) out.push(`<span class="tfp-chip forming" title="The last candle opened at ${utcHm(info.lastOpen)} UTC and is still being built; it will change until it closes at ${utcHm(info.lastClose)} UTC.">forming · opened ${utcHm(info.lastOpen)} UTC</span>`);
  if (clock && clock.open === false && clock.short) out.push(`<span class="tfp-chip closed" title="${esc(clock.label ?? '')}">${esc(clock.short)}</span>`);
  return out.join('');
}

/** The muted label for a chart with no intraday series (FRED, COT, BIS, nowcasts, official yield prints ...). */
export const dailyChip = (note = 'daily data', title = 'This series is published once a day or slower, so it has no intraday view.') => `<span class="tfp-chip daily" title="${esc(title)}">${esc(note)}</span>`;

/**
 * Mount the pills + chips into `host` and keep the chart fed.
 *   family     remembers the choice ('pair', 'asset')
 *   inst       the desk instrument name (EURUSD, NQ ...)
 *   days       { '1h': 8 } overrides of how far back each timeframe goes; the server clamps
 *   fetchJson  url -> Promise<json> (the page's getJson: honours the viewer rules)
 *   apply      (bars, { tf, fit, meta }) draws them; fit is true when the timeframe just changed (refit the view) and false on a refresh (keep the user's zoom)
 *   onError    optional (message, tf)
 * Returns { stop(), reload(), get tf() }.
 */
export function mountTfBar(host, { family, inst, days = {}, fetchJson, apply, onError = null, now = () => Date.now(), store = safeStore() }) {
  let tf = loadTf(family, store), seq = 0, stopped = false, timer = null, info = null, error = null, loading = false;
  host.innerHTML = `<div class="tfp-row">${pillsHtml(tf)}<span class="tfp-chips" aria-live="polite"></span></div>`;
  const chipsEl = host.querySelector('.tfp-chips');
  const paint = () => {
    for (const b of host.querySelectorAll('[data-tf]')) b.setAttribute('aria-pressed', String(b.dataset.tf === tf));
    chipsEl.innerHTML = chipsHtml(info, clockState(now()), { loading, error });
  };
  async function load(fit) {
    const my = ++seq, t = tf;
    loading = !info; error = null; paint();
    let r; try { r = await fetchJson(barsUrl(inst, t, days[t])); } catch (e) { r = { ok: false, error: e?.message ?? 'request failed' }; }
    if (stopped || my !== seq) return;
    loading = false;
    if (!r?.bars?.length) { error = r?.error ?? 'No price bars for this timeframe.'; info = null; paint(); onError?.(error, t); return; }
    info = describeBars(r.bars, tfOf(t), now());
    try { apply(r.bars, { tf: t, fit, meta: r }); } catch (e) { error = 'The chart could not draw these bars.'; console.warn('timeframePills apply', e); }
    paint();
  }
  const schedule = () => { clearTimeout(timer); if (!stopped) timer = setTimeout(tick, refreshMs(tf)); };
  async function tick() {
    if (stopped) return;
    if (!host.isConnected) { stop(); return; }
    // refresh only while someone can see it and the market is moving; a shut market keeps its last bars
    if (globalThis.document?.visibilityState !== 'hidden' && clockState(now()).open) await load(false);
    schedule();
  }
  function pick(k) {
    if (!TF_KEYS.includes(k) || k === tf) return;
    tf = k; saveTf(family, k, store); info = null; load(true); schedule();
  }
  function stop() { stopped = true; clearTimeout(timer); }
  host.addEventListener('click', e => { const b = e.target.closest?.('[data-tf]'); if (b) pick(b.dataset.tf); });
  host.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = TF_KEYS.indexOf(tf), j = Math.min(TF_KEYS.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
    if (j === i) return;
    e.preventDefault(); pick(TF_KEYS[j]); host.querySelector(`[data-tf="${TF_KEYS[j]}"]`)?.focus();
  });
  load(true); schedule();
  return { stop, reload: () => load(false), get tf() { return tf; } };
}
