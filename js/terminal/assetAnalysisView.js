/**
 * The Analyse button (owner 2026-11-10): a deep read of ONE market, on demand, on DeepSeek. Shown on the Pair tab and
 * in the asset card pop-up. POST /api/desk-asset-analyse (js/assetAnalysis.js).
 * SHARED DAILY (owner 2026-11-13): the first press of the London day writes the read for EVERYONE and the button then goes for
 * everyone ("Shared read · synced today 09:42 UK"); only the owner keeps a Refresh, which replaces the shared copy. An earlier
 * day's read stays visible, dated, with the button back. While a colleague's read is being written the card says so and polls.
 *
 * boxHtml(inst) is the empty card; mount(box) fills it (reads [data-aa] for the market).
 */
import { stateOf, controlsHtml, confirmReplace, pollWhile } from './sharedRead.js';

const h = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FIT = { supports: ['up', 'supports'], contradicts: ['dn', 'contradicts'], mixed: ['gold', 'mixed'], 'no data': ['', 'no data'] };
const AGREE = { agree: ['up', 'agrees with the card'], disagree: ['dn', 'disagrees with the card'], partly: ['gold', 'partly agrees with the card'] };
// the shared read (every desk user) states a lean, never a position: what the data leans towards today, an observation
const BIAS = { bullish: ['up', 'data leans bullish'], bearish: ['dn', 'data leans bearish'], neutral: ['', 'data leans neither way'], mixed: ['gold', 'data is mixed'] };

export function boxHtml(inst) {
  return `<div class="card aa-box" data-aa="${h(inst)}" style="margin-top:14px"><div class="ch"><span class="lbl">Deep read · ${h(inst)}</span><span class="r" data-aa-btns></span></div><div data-aa-body><p class="muted" style="margin:0">Checking for today's read…</p></div><div data-aa-desk></div></div>`;
}

const list = xs => (xs?.length ? `<ul style="margin:4px 0 0;padding-left:18px">${xs.map(x => `<li>${h(x)}</li>`).join('')}</ul>` : '<span class="muted">none</span>');

export function analysisHtml(r) {
  const a = r.analysis, shared = a.audience === 'shared', ag = shared ? (BIAS[a.bias] ?? BIAS.mixed) : (AGREE[a.card?.agree] ?? AGREE.partly);
  const nContra = a.drivers.filter(d => d.fits === 'contradicts').length;
  return `<p style="margin:0 0 8px;font-weight:600">${h(a.headline)}</p>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span class="chip ${ag[0]}">${h(ag[1])}</span><span class="chip">confidence ${h(a.confidence)}</span>${nContra ? `<span class="chip dn">${nContra} driver${nContra === 1 ? '' : 's'} against</span>` : ''}${shared ? '' : r.card ? `<span class="chip">card ${h(r.card.rating)} · size ${h(r.card.size ?? '–')}</span>` : '<span class="chip gold">no morning card</span>'}</div>
${shared ? (a.biasWhy ? `<p class="muted" style="margin:0 0 10px">${h(a.biasWhy)}</p>` : '') : a.card?.why ? `<p class="muted" style="margin:0 0 10px">${h(a.card.why)}</p>` : ''}
<div class="scroll"><table><thead><tr><th>Driver</th><th>Today</th><th></th></tr></thead><tbody>${a.drivers.map(d => { const f = FIT[d.fits] ?? FIT.mixed; return `<tr><td style="min-width:120px"><b>${h(d.driver)}</b></td><td class="muted" style="font-size:12.5px">${h(d.reading)}</td><td><span class="chip ${f[0]}" style="font-size:10px">${f[1]}</span></td></tr>`; }).join('')}</tbody></table></div>
${a.contradictions.length ? `<div class="lbl" style="margin-top:12px">What does not fit</div>${list(a.contradictions)}` : ''}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px">
<div><div class="lbl" style="color:var(--up)">Bull case</div><p style="margin:4px 0 0">${h(a.bull || '–')}</p></div>
<div><div class="lbl" style="color:var(--dn)">Bear case</div><p style="margin:4px 0 0">${h(a.bear || '–')}</p></div></div>
${a.levels ? `<div class="lbl" style="margin-top:12px">${shared ? 'Reference levels' : 'Levels'}</div><p class="mono" style="margin:4px 0 0;font-size:12.5px">${h(a.levels)}</p>` : ''}
<div class="lbl" style="margin-top:12px">Watch</div>${list(a.watch)}
${a.gaps.length ? `<div class="lbl" style="margin-top:12px">Gaps</div>${list(a.gaps)}` : ''}
<p class="tt-note">${h(r.provider ?? '')} ${h(r.model ?? '')} · ${r.at ? new Date(r.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) + ' London' : ''}${r.bookDate ? ` · book of ${h(r.bookDate)}` : ' · no morning book today'}. One market read against its own drivers, the analysts, its pack data, headlines and the Evidence Book. ${shared ? 'Educational context: not advice and not a trade signal.' : 'Private desk version, with the morning card. Context, untested: it never changes a card.'}</p>`;
}

export async function mount(box) {
  const inst = box?.dataset?.aa; if (!inst) return;
  const body = box.querySelector('[data-aa-body]'), btns = box.querySelector('[data-aa-btns]');
  let cur = null, busy = false, pollOn = false;   // cur: the last server answer (GET or POST) for this market
  const intro = `<p class="muted" style="margin:0">The morning book gives each market a few sentences. <b>Analyse</b> reads ${h(inst)} on its own: every driver for this kind of market checked against today's data, what contradicts the move, the bull and bear case, and the levels. Runs on DeepSeek, about a cent a read. One read a day, shared: the first press writes it for everyone.</p>`;
  const draw = () => {
    if (!box.isConnected) return;
    const vs = stateOf(cur);
    btns.innerHTML = controlsHtml(vs, { genLabel: `Analyse ${inst}`, genTitle: 'Runs on DeepSeek, about a cent a read. The first press of the day writes it for everyone; after that the button goes.', busy });
    btns.querySelectorAll('[data-sr]').forEach(b => { b.onclick = () => run(b.dataset.sr === 'refresh'); });
    if (busy) return;
    if (cur?.ok) body.innerHTML = analysisHtml(cur) + (vs.state === 'generating' ? '<p class="tt-note">A colleague is writing today\'s read now; this one is the earlier read and will refresh itself.</p>' : '');
    else if (vs.state === 'generating') body.innerHTML = `<p class="muted" style="margin:0">A colleague is writing today's ${h(inst)} read now. It will appear here, about 20-60 seconds.</p>`;
    else body.innerHTML = intro;
    if (vs.state === 'generating') watch();
  };
  // another user's generation is running: look again every ~5 s until it finishes, so the read appears without a reload
  const watch = () => {
    if (pollOn) return; pollOn = true;
    pollWhile(async () => { const r = await get(); if (r) cur = r; const done = !r?.inflight; if (done) { pollOn = false; draw(); } return done; }, { alive: () => box.isConnected });
  };
  const get = async () => { try { return await fetch(`/api/desk-asset-analyse?inst=${encodeURIComponent(inst)}`, { cache: 'no-store' }).then(x => x.json()); } catch { return null; } };
  const run = async force => {
    if (busy) return;
    if (force && !confirmReplace('market read')) return;
    busy = true; draw();
    body.innerHTML = `<p class="muted" style="margin:0">Analysing ${h(inst)} on DeepSeek… about 20-60 seconds. Everyone sees it once it is written.</p>`;
    let r; try { r = await fetch('/api/desk-asset-analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inst, force }) }).then(x => x.json()); } catch (e) { r = { ok: false, error: e.message }; }
    busy = false; if (!box.isConnected) return;
    if (r?.ok) { cur = r; draw(); }
    else { const keep = cur; draw(); body.innerHTML = `<p class="muted" style="margin:0">The read failed: ${h(r?.error ?? 'no answer')}.</p>` + (keep?.ok ? analysisHtml(keep) : ''); }
  };
  // the ✦ Analyse button on a live Assets card opens the card with this set: run at once (today's shared read, if any, is shown free)
  mountDeskVersion(box, inst);
  const auto = globalThis.aaAutoRun === inst; if (auto) globalThis.aaAutoRun = null;
  cur = await get();
  if (!box.isConnected) return;
  if (auto) box.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  const vs0 = stateOf(cur);
  draw();
  if (auto && (vs0.state === 'none' || vs0.state === 'old') && vs0.showGenerate) run(false);
}

/**
 * The OWNER's private desk version (owner 2026-11-13): the read with the morning card, the plan and the levels as the desk wrote them. It has its own
 * store key on the server (kind 'assetdesk'), is never served to the desk login (403) and is not shared: it is drawn only for the owner session.
 */
function mountDeskVersion(box, inst) {
  const slot = box.querySelector('[data-aa-desk]');
  if (!slot || globalThis.deskAccessState?.role !== 'owner') return;   // fail closed: anything but a confirmed owner sees nothing here
  let cur = null, busy = false;
  const draw = msg => {
    slot.innerHTML = `<div class="ch" style="margin-top:14px"><span class="lbl">Desk version · private</span><span class="r"><button class="btn" type="button" data-aa-dk>${busy ? 'Reading…' : cur?.ok ? 'Refresh desk read' : 'Desk read'}</button></span></div>${msg ? `<p class="muted" style="margin:0">${h(msg)}</p>` : ''}${cur?.ok ? analysisHtml(cur) : (msg ? '' : '<p class="muted" style="margin:0">The version with the morning card, the plan and the levels as the desk wrote them. Only you see this, and it is not shared. One a day per market (40 a day).</p>')}`;
    slot.querySelector('[data-aa-dk]').onclick = () => run(!!cur?.ok);
  };
  const run = async force => {
    if (busy) return; busy = true; draw();
    let r; try { r = await fetch('/api/desk-asset-analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inst, audience: 'desk', force }) }).then(x => x.json()); } catch (e) { r = { ok: false, error: e.message }; }
    busy = false; if (!box.isConnected) return;
    if (r?.ok) { cur = r; draw(); } else draw(`The desk read failed: ${r?.error ?? 'no answer'}.`);
  };
  fetch(`/api/desk-asset-analyse?inst=${encodeURIComponent(inst)}&audience=desk`, { cache: 'no-store' }).then(x => x.json()).then(r => { if (r?.ok && !r.stale) cur = r; if (box.isConnected) draw(); }).catch(() => { if (box.isConnected) draw(); });
}
