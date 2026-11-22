// js/terminal/jarvisModNews.js: NEWSLETTER. Pick an issue from the newsletter archive (terminal edition, desk morning note, daily, weekly ...) and Jarvis plays it as a narrated show: a short intro, one scene per
// section with the opening of its text read aloud over a fitting 3D view, and a close. It reads what the issue already says (newsShowCore.js); nothing is added, and nothing is a forecast. Uses the SHOW
// director (voice leads, back / skip / pause / speed, record), by handing it the scenes.
import { registerJarvisModule, viewsOf } from './jarvisModules.js';
import { sectionsFromHtml, issueScenes, newestPerKind, KIND_LABEL } from './newsShowCore.js';

const CORE_VIEWS = ['globe', 'candles', 'bubbles', 'skyline', 'orbit'];
registerJarvisModule({
  id: 'news', label: 'NEWSLETTER',
  render(pane, api) {
    const { esc } = api;
    pane.innerHTML = '<h3>NEWSLETTER AS A SHOW</h3><p>Pick an issue and Helix reads it to you, section by section, over a 3D view that fits each topic. It reads what the issue already says: nothing added, nothing is advice.</p><div data-n="list"><p class="jv-sub">Looking for the latest issues...</p></div><p class="jv-sub" data-n="status"></p>';
    const status = (t, bad = false) => { const e = pane.querySelector('[data-n="status"]'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--gold)' : ''; } };
    const have = () => new Set([...CORE_VIEWS, ...viewsOf().map(v => v.id)]);
    async function play(i) {
      status('Reading the issue...');
      let html = ''; try { const r = await api.win.fetch(`/api/newsletter/issue?id=${encodeURIComponent(i.id)}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); html = await r.text(); } catch (e) { status(`Could not read that issue (${e.message}).`, true); return; }
      const scenes = issueScenes(i, sectionsFromHtml(html), have());
      if (!scenes.length) { status('That issue is mostly tables and charts with too little written text to read aloud. Try the desk morning note.', true); return; }
      status(`${scenes.length} scenes. Starting...`);
      api.win.__jarvisCustomScenes = scenes;                            // the SHOW director plays these instead of the morning brief
      api.setMod('show'); api.win.setTimeout(() => api.$('pane').querySelector('[data-s="go"]')?.click(), 250);
    }
    (async () => {
      const box = pane.querySelector('[data-n="list"]');
      let list = null; try { const r = await api.jf('/api/newsletter/archive'); if (r?.ok) list = newestPerKind(r.issues); } catch (e) { /* below */ }
      if (!list?.length) { box.innerHTML = '<p class="jv-am">The newsletter archive could not be read just now.</p>'; return; }
      box.innerHTML = list.map(i => `<div class="jv-item" style="cursor:default"><b>${esc(KIND_LABEL[i.kind])}</b> <span class="jv-sub">${esc(i.date)}</span><br><span class="jv-sub">${esc(String(i.subject ?? '').slice(0, 110))}</span><div class="jv-row"><button type="button" data-id="${esc(i.id)}">▶ PLAY AS A SHOW</button></div></div>`).join('');
      box.onclick = e => { const b = e.target.closest('button[data-id]'); if (b) play(list.find(x => x.id === b.dataset.id)); };
    })();
  },
});
