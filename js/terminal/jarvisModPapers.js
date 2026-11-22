// js/terminal/jarvisModPapers.js: PAPERS panel. Builds a query from the HUD (nodes that moved beyond noise, broken links) and lists library papers that touch those themes,
// plus what the repo's OWN Evidence Book says. DESCRIPTION ONLY. Papers describe other markets and eras; our tests are the check.
import { registerJarvisModule } from './jarvisModules.js';

const VCOL = { validated: 'var(--up)', null: 'var(--dn)', underpowered: 'var(--gold)', context: 'var(--tx2)' };
export const autoQuery = (st, names = {}) => {
  const g = st?.graph, moved = (g?.nodes ?? []).filter(n => n.end?.moved).map(n => names[n.key] ?? n.key);
  const broken = (g?.edges ?? []).filter(e => e.verdict === 'broken').map(e => e.short);
  return [...new Set([...moved, ...broken])].join(' ').slice(0, 300);
};

registerJarvisModule({
  id: 'papers', label: 'PAPERS',
  render(pane, api) {
    const esc = api.esc, auto = autoQuery(api.st, api.names);
    pane.innerHTML = `<div style="padding:10px;color:var(--tx);font-size:12px;overflow:auto;max-height:100%">
      <div style="display:flex;gap:6px;margin-bottom:8px"><input data-q value="${esc(auto)}" placeholder="free text (blank = what moved)" style="flex:1;background:var(--bg1);color:var(--tx);border:1px solid var(--line);padding:5px"/>
      <button data-go style="background:var(--bg1);color:var(--blue2);border:1px solid var(--line);padding:5px 10px;cursor:pointer">SEARCH</button></div>
      <div data-out style="color:var(--tx2)">Searching...</div>
      <div style="margin-top:10px;color:var(--tx2);font-size:11px">Papers describe other markets and eras; our tests are the check.</div></div>`;
    const out = pane.querySelector('[data-out]'), box = pane.querySelector('[data-q]');
    let top = [];
    const run = async () => {
      const q = box.value.trim();
      if (!q) { out.innerHTML = '<span style="color:var(--tx2)">Nothing has moved beyond noise yet. Type a topic above.</span>'; return; }
      out.textContent = 'Searching...';
      const r = await api.jf('/api/jarvis/papers?limit=8&q=' + encodeURIComponent(q)).catch(() => null);
      if (!r?.ok) { out.innerHTML = '<span style="color:var(--tx2)">The papers route is not available (owner login, or the server has not loaded it).</span>'; return; }
      top = r.papers.slice(0, 3);
      const papers = r.papers.length ? r.papers.map(p => `<div style="margin:6px 0;padding:6px;border:1px solid var(--line)">
        <div>${/^https?:\/\//i.test(p.url ?? '') ? `<span data-open="${esc(p.url)}" style="color:var(--blue2);cursor:pointer;text-decoration:underline">${esc(p.title)}</span>` : esc(p.title)}</div>
        <div style="color:var(--tx2);font-size:11px">${esc([p.year, p.venue].filter(Boolean).join(' / '))} matched: ${esc(p.why.join(', '))}${p.tags?.length ? ' / ' + esc(p.tags.join(', ')) : ''}</div></div>`).join('')
        : `<div style="color:var(--tx2)">${esc(r.note ?? 'No paper matched.')}</div>`;
      const tests = r.ourTests.length ? r.ourTests.map(t => `<div style="margin:5px 0"><span style="border:1px solid ${VCOL[t.verdict] ?? 'var(--line)'};color:${VCOL[t.verdict] ?? 'var(--tx2)'};padding:0 5px;font-size:10px">${esc(String(t.verdict).toUpperCase())}</span> ${esc(t.claim)}
        <span style="color:var(--tx2);font-size:10px"> ${esc(t.source ?? '')}</span></div>`).join('') : '<div style="color:var(--tx2)">No Evidence Book entry overlaps this query.</div>';
      out.innerHTML = `<div style="color:var(--gold)">TOP PAPERS (${esc(r.indexed)} indexed)</div>${papers}
        <div style="color:var(--gold);margin-top:10px">WHAT OUR OWN TESTS SAY</div>${tests}
        ${top.length ? '<button data-sum style="margin-top:10px;background:var(--bg1);color:var(--blue2);border:1px solid var(--line);padding:5px 10px;cursor:pointer">ASK MACH TO SUMMARISE THE TOP 3</button>' : ''}`;
      out.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => api.win.open(el.getAttribute('data-open'), '_blank', 'noopener')));
      out.querySelector('[data-sum]')?.addEventListener('click', () => api.ask('Summarise what these papers found, in plain words, and say what our own tests found on the same theme (description only, no forecast): ' + top.map(p => `"${p.title}" (${p.year ?? 'n.d.'})`).join('; ')));
    };
    pane.querySelector('[data-go]').addEventListener('click', run); box.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    run();
  },
});
