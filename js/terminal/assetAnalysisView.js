/**
 * The Analyse button (owner 2026-11-10): a deep read of ONE market, on demand, on DeepSeek. Shown on the Pair tab and
 * in the asset card pop-up. POST /api/desk-asset-analyse (js/assetAnalysis.js); today's read is kept on the server, so
 * opening the same market again is free and only "Run again" spends.
 *
 * boxHtml(inst) is the empty card; mount(box) fills it (reads [data-aa] for the market).
 */
const h = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FIT = { supports: ['up', 'supports'], contradicts: ['dn', 'contradicts'], mixed: ['gold', 'mixed'], 'no data': ['', 'no data'] };
const AGREE = { agree: ['up', 'agrees with the card'], disagree: ['dn', 'disagrees with the card'], partly: ['gold', 'partly agrees with the card'] };

export function boxHtml(inst) {
  return `<div class="card aa-box" data-aa="${h(inst)}" style="margin-top:14px"><div class="ch"><span class="lbl">Deep read · ${h(inst)}</span><span class="r" data-aa-btns></span></div><div data-aa-body><p class="muted" style="margin:0">Checking for today's read…</p></div></div>`;
}

const list = xs => (xs?.length ? `<ul style="margin:4px 0 0;padding-left:18px">${xs.map(x => `<li>${h(x)}</li>`).join('')}</ul>` : '<span class="muted">none</span>');

export function analysisHtml(r) {
  const a = r.analysis, ag = AGREE[a.card?.agree] ?? AGREE.partly;
  const nContra = a.drivers.filter(d => d.fits === 'contradicts').length;
  return `<p style="margin:0 0 8px;font-weight:600">${h(a.headline)}</p>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span class="chip ${ag[0]}">${h(ag[1])}</span><span class="chip">confidence ${h(a.confidence)}</span>${nContra ? `<span class="chip dn">${nContra} driver${nContra === 1 ? '' : 's'} against</span>` : ''}${r.card ? `<span class="chip">card ${h(r.card.rating)} · size ${h(r.card.size ?? '–')}</span>` : '<span class="chip gold">no morning card</span>'}</div>
${a.card?.why ? `<p class="muted" style="margin:0 0 10px">${h(a.card.why)}</p>` : ''}
<div class="scroll"><table><thead><tr><th>Driver</th><th>Today</th><th></th></tr></thead><tbody>${a.drivers.map(d => { const f = FIT[d.fits] ?? FIT.mixed; return `<tr><td style="min-width:120px"><b>${h(d.driver)}</b></td><td class="muted" style="font-size:12.5px">${h(d.reading)}</td><td><span class="chip ${f[0]}" style="font-size:10px">${f[1]}</span></td></tr>`; }).join('')}</tbody></table></div>
${a.contradictions.length ? `<div class="lbl" style="margin-top:12px">What does not fit</div>${list(a.contradictions)}` : ''}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px">
<div><div class="lbl" style="color:var(--up)">Bull case</div><p style="margin:4px 0 0">${h(a.bull || '–')}</p></div>
<div><div class="lbl" style="color:var(--dn)">Bear case</div><p style="margin:4px 0 0">${h(a.bear || '–')}</p></div></div>
${a.levels ? `<div class="lbl" style="margin-top:12px">Levels</div><p class="mono" style="margin:4px 0 0;font-size:12.5px">${h(a.levels)}</p>` : ''}
<div class="lbl" style="margin-top:12px">Watch</div>${list(a.watch)}
${a.gaps.length ? `<div class="lbl" style="margin-top:12px">Gaps</div>${list(a.gaps)}` : ''}
<p class="tt-note">${h(r.provider ?? '')} ${h(r.model ?? '')} · ${r.at ? new Date(r.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) + ' London' : ''}${r.bookDate ? ` · book of ${h(r.bookDate)}` : ' · no morning book today'}. One market read against its own drivers, the morning book, the analysts, its pack data, headlines and the Evidence Book. Context, untested: it never changes a card.</p>`;
}

export async function mount(box) {
  const inst = box?.dataset?.aa; if (!inst) return;
  const body = box.querySelector('[data-aa-body]'), btns = box.querySelector('[data-aa-btns]');
  const setBtn = (label, force) => {
    btns.innerHTML = `<button class="btn" type="button" style="padding:3px 10px" title="Runs on DeepSeek, about a cent a read">${h(label)}</button>`;
    btns.querySelector('button').onclick = () => run(force);
  };
  const show = r => { body.innerHTML = analysisHtml(r); setBtn('Run again', true); };
  const run = async force => {
    btns.querySelector('button')?.setAttribute('disabled', '');
    body.innerHTML = `<p class="muted" style="margin:0">Analysing ${h(inst)} on DeepSeek… about 20-60 seconds.</p>`;
    let r; try { r = await fetch('/api/desk-asset-analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inst, force }) }).then(x => x.json()); } catch (e) { r = { ok: false, error: e.message }; }
    if (!box.isConnected) return;
    if (r?.ok) show(r); else { body.innerHTML = `<p class="muted" style="margin:0">The read failed: ${h(r?.error ?? 'no answer')}.</p>`; setBtn('Try again', !!force); }
  };
  // the ✦ Analyse button on a live Assets card opens the card with this set: run at once (today's read, if any, is shown free)
  const auto = globalThis.aaAutoRun === inst; if (auto) globalThis.aaAutoRun = null;
  let r = null; try { r = await fetch(`/api/desk-asset-analyse?inst=${encodeURIComponent(inst)}`, { cache: 'no-store' }).then(x => x.json()); } catch { /* offline: offer the button */ }
  if (!box.isConnected) return;
  if (auto) box.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  if (r?.ok) show(r);
  else if (auto) run(false);
  else { body.innerHTML = `<p class="muted" style="margin:0">The morning book gives each market a few sentences. <b>Analyse</b> reads ${h(inst)} on its own: every driver for this kind of market checked against today's data, what contradicts the move, the bull and bear case, and the levels. Runs on DeepSeek, about a cent a read.</p>`; setBtn(`Analyse ${inst}`, false); }
}
