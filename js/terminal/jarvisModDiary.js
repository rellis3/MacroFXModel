// js/terminal/jarvisModDiary.js: the DIARY panel (HELIX MEMORY). Browse the days Helix has recorded (helix/days/<date>.json), read what it said part by part, see how each checkable
// claim held up by the close (the evening scorer, helix/scores/<date>.json), jump to the view a line played over, search across days, and read the rolling SCORECARD (hit-rate per
// kind of claim with n and a 95% Wilson interval). Owner-only routes: /api/helix/{diary,diary/search,scorecard}. DESCRIPTION ONLY: calibration of descriptions, not a trading record.
import { registerJarvisModule, viewsOf } from './jarvisModules.js';
import { FAMILIES } from './helixDiaryCore.js';

const pc = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
const MARK = { true: ['✓', 'var(--up)', 'held'], false: ['✗', 'var(--dn)', 'did not hold'], null: ['–', 'var(--tx2)', 'not checkable'] };
const BTN = 'background:var(--bg1);color:var(--blue2);border:1px solid var(--line);padding:4px 9px;cursor:pointer';

/** The scorecard as HTML (pure, for the panel and its test). sc = /api/helix/scorecard reply. */
export function scorecardHtml(sc, esc) {
  const s = sc?.summary;
  if (!s) return `<div style="color:var(--tx2)">No day has been scored yet. The scorer runs each evening from ${esc(sc?.scoreAt ?? '22:10 London')} on the days a broadcast was recorded.</div>`;
  const rows = Object.entries(s.kinds ?? {}).map(([id, k]) => `<tr><td title="${esc(k.rule)}">${esc(k.label ?? id)}</td><td style="text-align:right">${k.n ? `${k.hits} / ${k.n}` : '–'}</td><td style="text-align:right">${pc(k.rate)}</td><td style="text-align:right;color:var(--tx2)">${k.n ? `${pc(k.lo)}–${pc(k.hi)}` : ''}</td><td style="text-align:right;color:var(--tx2)">${k.days ?? 0}</td></tr>`).join('');
  const ch = s.kinds?.net_as_one?.chancePerMember;
  return `<table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="color:var(--tx2)"><td>CLAIM</td><td style="text-align:right">HELD / CHECKED</td><td style="text-align:right">RATE</td><td style="text-align:right">95% INTERVAL</td><td style="text-align:right">DAYS</td></tr>${rows}
    <tr style="border-top:1px solid var(--line)"><td>All kinds</td><td style="text-align:right">${s.all?.hits ?? 0} / ${s.all?.n ?? 0}</td><td style="text-align:right">${pc(s.all?.rate)}</td><td style="text-align:right;color:var(--tx2)">${s.all?.n ? `${pc(s.all.lo)}–${pc(s.all.hi)}` : ''}</td><td style="text-align:right;color:var(--tx2)">${s.nDays ?? 0}</td></tr></table>
    <div style="color:var(--tx2);font-size:10px;margin-top:4px">${esc(s.from ?? '')} to ${esc(s.to ?? '')}. Hover a claim for the rule it is held to.${ch != null ? ` Moving as one: by chance alone a member shares the anchor's usual sign about ${pc(ch)} of the time.` : ''} ${esc(s.note ?? '')}</div>`;
}
/** One day as HTML (pure). d = /api/helix/diary reply; views = Set of view ids that exist (a line whose view is missing gets no jump button). */
export function dayHtml(d, esc, views = null) {
  if (!d?.ok) return `<div style="color:var(--tx2)">${esc(d?.error ?? 'No record for that day.')}</div>`;
  const res = new Map((d.score?.results ?? []).map(r => [`${r.part}|${r.id}`, r]));
  const parts = (d.parts ?? []).map(p => {
    const claims = (p.claims ?? []).filter(c => c.spoken).map(c => { const r = res.get(`${p.part}|${c.id}`), m = MARK[String(r ? r.hit : null)]; return `<div style="font-size:11px"><span style="color:${m[1]}" title="${esc(m[2])}">${m[0]}</span> ${esc(c.id)}${r?.why ? ` <span style="color:var(--tx2)">${esc(r.why)}</span>` : r ? '' : ' <span style="color:var(--tx2)">not scored yet</span>'}</div>`; }).join('');
    const lines = (p.lines ?? []).filter(l => l.kind !== 'bumper').map(l => `<div style="margin:4px 0"><span style="color:var(--gold);font-size:10px">${esc(String(l.title ?? l.kind ?? '').toUpperCase())}</span>${l.view && (!views || views.has(l.view)) ? ` <button type="button" data-view="${esc(l.view)}" style="${BTN};padding:0 5px;font-size:10px">▶ ${esc(l.view.toUpperCase())}</button>` : ''}<div>${esc(l.text)}</div></div>`).join('');
    return `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:6px"><div style="color:var(--blue2)">${esc(p.part.toUpperCase())} <span style="color:var(--tx2);font-size:10px">${esc(p.savedAt ?? '')} · ${esc(p.mode ?? '')}</span></div>
      ${p.headline ? `<div style="margin:4px 0"><b>${esc(p.headline)}</b></div>` : ''}${p.dayDelta ? `<div style="color:var(--tx2);font-size:11px">Day on day: ${esc(p.dayDelta)}</div>` : ''}
      ${claims ? `<div style="margin:6px 0;padding:5px;border:1px solid var(--line)"><div style="color:var(--gold);font-size:10px">CHECKED AT THE CLOSE</div>${claims}</div>` : ''}${lines}</div>`;
  }).join('');
  const tags = [d.unusual ? `unusual (up to ${d.maxRatio}× usual)` : 'no market at twice its usual', ...(d.families ?? [])].map(esc).join(' · ');
  return `<div style="color:var(--tx2);font-size:11px">${tags}</div>${parts}`;
}
/** Search hits as HTML (pure). */
export function hitsHtml(r, esc) {
  if (!r?.ok) return `<div style="color:var(--tx2)">${esc(r?.error ?? 'The diary routes are not available (owner login, or the server has not loaded them).')}</div>`;
  if (!r.hits.length) return `<div style="color:var(--tx2)">Nothing matched in ${r.searched} stored day${r.searched === 1 ? '' : 's'} (${esc(r.from)} to ${esc(r.to)}).</div>`;
  return `<div style="color:var(--tx2);font-size:10px">${r.hits.length} day${r.hits.length === 1 ? '' : 's'} of ${r.searched} searched${r.clipped ? ' (range clipped to 120 days)' : ''}</div>` + r.hits.map(h => `<div style="margin:6px 0;padding:5px;border:1px solid var(--line)">
    <span data-day="${esc(h.date)}" style="color:var(--blue2);cursor:pointer;text-decoration:underline">${esc(h.date)}</span> <span style="color:var(--tx2);font-size:10px">${h.unusual ? 'unusual · ' : ''}${esc((h.families ?? []).join(', '))}${h.score?.n ? ` · ${h.score.hits}/${h.score.n} held` : ''}</span>
    ${h.hits.map(x => `<div style="font-size:11px;margin-top:3px"><span style="color:var(--gold);font-size:10px">${esc(x.part.toUpperCase())} · ${esc(String(x.title ?? '').toUpperCase())}</span> ${esc(x.snippet)}</div>`).join('')}</div>`).join('');
}

registerJarvisModule({
  id: 'diary', label: 'DIARY',
  render(pane, api) {
    const esc = api.esc, fams = Object.keys(FAMILIES);
    pane.innerHTML = `<div style="padding:10px;color:var(--tx);font-size:12px;overflow:auto;max-height:100%">
      <h3 style="margin:0 0 6px">HELIX DIARY</h3>
      <details data-sc><summary style="cursor:pointer;color:var(--gold)">SCORECARD: how the descriptions held up by the close</summary><div data-scout style="margin-top:6px;color:var(--tx2)">Loading…</div></details>
      <div style="display:flex;gap:6px;margin:10px 0 4px;flex-wrap:wrap"><button data-prev style="${BTN}">◀</button><input data-date type="date" style="background:var(--bg1);color:var(--tx);border:1px solid var(--line);padding:3px"/><button data-next style="${BTN}">▶</button><button data-today style="${BTN}">LATEST</button></div>
      <div data-dayout style="color:var(--tx2)">Loading…</div>
      <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:8px"><div style="color:var(--gold)">SEARCH WHAT HELIX SAID</div>
        <div style="display:flex;gap:6px;margin:6px 0;flex-wrap:wrap"><input data-q placeholder="words, or &quot;a phrase&quot;" style="flex:1;min-width:140px;background:var(--bg1);color:var(--tx);border:1px solid var(--line);padding:4px"/>
        <input data-mk placeholder="market (GOLD)" size="9" style="background:var(--bg1);color:var(--tx);border:1px solid var(--line);padding:4px"/>
        <select data-fam style="background:var(--bg1);color:var(--tx);border:1px solid var(--line)"><option value="">any release</option>${fams.map(f => `<option>${esc(f)}</option>`).join('')}</select>
        <label style="color:var(--tx2);font-size:11px"><input data-un type="checkbox"/> unusual only</label><button data-go style="${BTN}">SEARCH</button></div>
        <div data-hits></div></div>
      <div style="margin-top:10px;color:var(--tx2);font-size:11px">What Helix said and how the words held up by the close. Calibration of descriptions, not a trading record.</div></div>`;
    const $ = s => pane.querySelector(s), views = new Set(['globe', 'candles', 'skyline', 'bubbles', 'orbit', ...viewsOf().map(v => v.id)]);
    let cur = null;
    const wire = el => {
      el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { try { api.setView?.(b.getAttribute('data-view')); } catch (e) { /* the view may be gone */ } }));
      el.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => load(b.getAttribute('data-day'))));
    };
    async function load(date) {
      const box = $('[data-dayout]'); box.textContent = 'Loading…';
      let d = null; try { d = await api.jf(`/api/helix/diary?date=${encodeURIComponent(date)}`, { cache: 'no-store' }); } catch (e) { d = { ok: false, error: 'The diary route is not available (owner login, or the server has not loaded it).' }; }
      if (!d?.ok && d?.latest && d.latest !== date && !cur) return load(d.latest);       // first open on a day with no record: go to the newest stored day
      cur = d?.ok ? d : { ...d, date }; $('[data-date]').value = date;
      box.innerHTML = dayHtml(d, esc, views); wire(box);
    }
    $('[data-date]').addEventListener('change', e => e.target.value && load(e.target.value));
    $('[data-prev]').addEventListener('click', () => cur?.prev && load(cur.prev));
    $('[data-next]').addEventListener('click', () => cur?.next && load(cur.next));
    $('[data-today]').addEventListener('click', () => { cur = null; load(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })); });
    $('[data-sc]').addEventListener('toggle', async e => {
      if (!e.target.open) return;
      let sc = null; try { sc = await api.jf('/api/helix/scorecard', { cache: 'no-store' }); } catch (er) { sc = null; }
      $('[data-scout]').innerHTML = sc?.ok ? scorecardHtml(sc, esc) : '<span>The scorecard route is not available (owner login).</span>';
    });
    const search = async () => {
      const p = new URLSearchParams(); const q = $('[data-q]').value.trim(), mk = $('[data-mk]').value.trim().toUpperCase(), f = $('[data-fam]').value;
      if (q) p.set('q', q); if (mk) p.set('market', mk); if (f) p.set('family', f); if ($('[data-un]').checked) p.set('unusual', '1');
      const out = $('[data-hits]'); out.textContent = 'Searching…';
      let r = null; try { r = await api.jf(`/api/helix/diary/search?${p}`, { cache: 'no-store' }); } catch (e) { r = null; }
      out.innerHTML = hitsHtml(r, esc); wire(out);
    };
    $('[data-go]').addEventListener('click', search); $('[data-q]').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    load(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }));
  },
});
