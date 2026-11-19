// js/terminal/jarvisModPrecedent.js: the PRECEDENT panel of the Jarvis HUD. Pick a release family and a market; see how that market moved in the 30 minutes after past releases, in units of its typical
// 30-minute reaction (GET /api/jarvis/precedent, owner-only). History, not a forecast: the direction of a release reaction is not predictable from the release alone.
import { registerJarvisModule } from './jarvisModules.js';

export const FAMILIES = [['CPI', 'US CPI'], ['NFP', 'US payrolls'], ['FOMC', 'Fed decision'], ['ECB', 'ECB decision'], ['BOE', 'BoE decision'], ['BOJ', 'BoJ decision'], ['PCE', 'US PCE'], ['RETAIL', 'US retail sales'], ['GDP', 'US GDP'], ['REFUNDING', 'Treasury refunding'], ['UKFISCAL', 'UK budget']];
export const MARKETS = [['nq', 'Nasdaq'], ['es', 'S&P 500'], ['eurusd', 'Euro / Dollar'], ['gbpusd', 'Pound / Dollar'], ['usdjpy', 'Dollar / Yen'], ['gold', 'Gold'], ['dx', 'Dollar index'], ['vix', 'VIX'], ['gilt', 'Gilt future'], ['bund', 'Bund future']];
const KEY = 'jarvis.precedent.pick';
const fin = v => typeof v === 'number' && Number.isFinite(v);
const escT = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Histogram bars as inline SVG. bins = [{lo,hi,count}]; the zero line is drawn between the bins that straddle 0. */
export function histSvg(bins, w = 300, h = 90) {
  const b = (bins ?? []).filter(x => x && fin(x.count)); if (!b.length) return '';
  const max = Math.max(1, ...b.map(x => x.count)), bw = w / b.length, base = h - 14;
  const bars = b.map((x, i) => { const bh = Math.round((x.count / max) * (base - 6)); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${base - bh}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh}" style="fill:${x.lo >= 0 ? 'var(--blue2)' : 'var(--tx2)'}"><title>${escT(`${x.lo} to ${x.hi}: ${x.count}`)}</title></rect>`; }).join('');
  const zi = b.findIndex(x => x.lo >= 0), zx = zi < 0 ? w : zi * bw;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="histogram of 30-minute reactions">${bars}<line x1="${zx.toFixed(1)}" x2="${zx.toFixed(1)}" y1="2" y2="${base}" style="stroke:var(--line)"/><text x="2" y="${h - 2}" font-size="9" style="fill:var(--tx2)">${escT(b[0].lo)}</text><text x="${w - 2}" y="${h - 2}" font-size="9" text-anchor="end" style="fill:var(--tx2)">${escT(b.at(-1).hi)}</text></svg>`;
}

/** A tiny sparkline for one release path (units); the release minute is the faint vertical line. */
export function sparkSvg(path, w = 90, h = 30) {
  const v = (path ?? []).map((y, i) => ({ y, i })).filter(p => fin(p.y)); if (v.length < 2) return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
  const lim = Math.max(1, ...v.map(p => Math.abs(p.y))), n = path.length, X = i => (i / (n - 1)) * w, Y = y => h / 2 - (y / lim) * (h / 2 - 2);
  const d = v.map((p, k) => `${k ? 'L' : 'M'}${X(p.i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  const rx = X(Math.round((30 / 270) * (n - 1)));
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="reaction path"><line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" style="stroke:var(--line)"/><line x1="${rx.toFixed(1)}" x2="${rx.toFixed(1)}" y1="0" y2="${h}" style="stroke:var(--line)"/><path d="${d}" fill="none" style="stroke:var(--gold)" stroke-width="1.4"/></svg>`;
}

export const statLine = d => {
  const s = d?.stats; if (!d || !d.n || !s) return 'No stored reactions for this pair.';
  const f = v => (fin(v) ? v.toFixed(2) : 'n/a');
  return `N ${d.n} · median size ${f(s.medianAbs)} · middle half ${f(s.p25)} to ${f(s.p75)} · p90 ${f(s.p90)} (in ${d.unit})${s.shareUp != null ? ` · up ${Math.round(s.shareUp * 100)}% of ${d.n}` : ''}`;
};
export const headerText = d => `What markets did the last ${d?.n ?? 'N'} times this was released (history, not a forecast)`;
export const askQuestion = d => {
  if (!d || !d.n || !d.stats) return '';
  const s = d.stats;
  return `Describe how ${d.market} reacted to ${d.family} releases (${d.n} of them): median size ${s.medianAbs}, p25 ${s.p25}, p75 ${s.p75}, p90 ${s.p90} typical 30-minute reactions${s.shareUp != null ? `, up in ${Math.round(s.shareUp * 100)}%` : ''}. What does history show and what does it not show? History only, no forecast.`;
};
const load = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && FAMILIES.some(f => f[0] === j.family) && MARKETS.some(m => m[0] === j.market)) return j; } catch { /* none */ } return { family: 'CPI', market: 'nq' }; };
const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } };
const opts = (list, sel) => list.map(([v, l]) => `<option value="${escT(v)}"${v === sel ? ' selected' : ''}>${escT(l)}</option>`).join('');

export function bodyHtml(d) {
  if (!d) return '';
  if (d.error) return `<div style="color:var(--dn)">${escT(d.error)}</div>`;
  const last = (d.last ?? []).map(r => `<div style="text-align:center"><div style="font-size:10px;color:var(--tx2)">${escT(r.date)}</div>${sparkSvg(r.path)}<div style="font-size:10px">${fin(r.size) ? (r.size >= 0 ? '+' : '−') + Math.abs(r.size).toFixed(1) : 'n/a'} ${escT(r.dirWord)}</div></div>`).join('');
  return `<div style="font-weight:600;margin:6px 0">${escT(headerText(d))}</div><div style="font-size:12px;margin-bottom:6px">${escT(statLine(d))}</div>${histSvg(d.histogram)}
<div style="font-size:11px;color:var(--tx2);margin:6px 0 2px">Last ${(d.last ?? []).length} releases, 30 minutes before to 4 hours after (faint line = the release)</div><div style="display:flex;gap:8px;flex-wrap:wrap">${last}</div>
<ul style="margin:8px 0;padding-left:16px;font-size:11px;color:var(--tx2)">${(d.caveats ?? []).map(c => `<li>${escT(c)}</li>`).join('')}</ul><button type="button" data-ask style="border:1px solid var(--line);background:var(--bg1);color:var(--blue2);padding:4px 8px;cursor:pointer"${d.n ? '' : ' disabled'}>ASK ABOUT THIS</button>`;
}

registerJarvisModule({
  id: 'precedent', label: 'PRECEDENT',
  async render(pane, api) {
    const pick = load();
    pane.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap"><select data-f style="background:var(--bg1);color:var(--tx);border:1px solid var(--line)">${opts(FAMILIES, pick.family)}</select><select data-m style="background:var(--bg1);color:var(--tx);border:1px solid var(--line)">${opts(MARKETS, pick.market)}</select></div><div data-body style="margin-top:6px;color:var(--tx2)">Loading...</div>`;
    const body = pane.querySelector('[data-body]'), fs = pane.querySelector('[data-f]'), ms = pane.querySelector('[data-m]');
    let seq = 0;
    const go = async () => {
      const p = { family: fs.value, market: ms.value }, my = ++seq; save(p); body.textContent = 'Loading...';
      let d; try { d = await api.jf(`/api/jarvis/precedent?family=${encodeURIComponent(p.family)}&market=${encodeURIComponent(p.market)}`); } catch (e) { d = { error: String(e?.message ?? e) }; }
      if (my !== seq) return;
      if (d && d.ok === false) d = { error: d.error ?? 'no data' };
      body.innerHTML = bodyHtml(d);
      body.querySelector('[data-ask]')?.addEventListener('click', () => api.ask(askQuestion(d)));
    };
    fs.addEventListener('change', go); ms.addEventListener('change', go); await go();
  },
});
