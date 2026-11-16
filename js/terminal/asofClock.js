// js/terminal/asofClock.js: the whole-terminal as-of clock (Desk Terminal, PREVIEW feature, registry id widget.asof).
//
// Pick a moment and every board redraws as the saved records showed it then, under a banner "Viewing Thu 12 Nov 14:30 UTC, not live". How: js/terminal/asofBoot.js
// wraps fetch; this module installs the answerer that gate calls. The answerer serves each market-data read from the daily FULL record of the feeds taken at or
// before the as-of time (with the five-minute strength scores laid over it), cuts candles at the time, reads the morning book by date, passes the person's own
// saved settings through, and REFUSES everything else with a plain "no record at that time". Nothing live is shown in a past view; the rules are in js/asofCore.js.
//
// A desk login whose switch is off never loads this file (terminalFeel.js), so it sees no button, no banner and no hold on its page.
import * as C from '../asofCore.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonResp = (obj, Resp) => new Resp(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });
const PLAY_KEY = 'deskAsofPlay';

export function mountAsof({ doc = globalThis.document, win = globalThis.window ?? globalThis, now = () => Date.now(), Resp = globalThis.Response, store = null } = {}) {
  const A = win.__deskAsof;
  const btn = doc?.getElementById?.('asofbtn');
  if (!A || !btn) return false;
  const real = A.realFetch ?? win.fetch.bind(win);
  const ss = store ?? (() => { try { return win.sessionStorage; } catch { return null; } })();
  const st = { cv: null, pts: [], index: null, loadP: null, fulls: new Map(), playing: false, speed: 10, timer: null, last: 0, log: new Map(), popOpen: false };

  // ── coverage: what the saved records hold (loaded once, when the control opens or an as-of time is set) ──
  async function readJson(url) { const r = await real(url, { cache: 'no-store' }); try { return await r.json(); } catch { return null; } }
  function loadCoverage() {
    if (st.loadP) return st.loadP;
    st.loadP = (async () => {
      const index = await readJson('/api/desk-snapshots/index');
      if (!index?.ok) throw new Error('the snapshot index did not answer');
      const first = index.coreDays?.[0] ?? index.fullDays?.[0];
      let pts = [];
      if (first) {
        const j = await readJson(`/api/desk-snapshots?fields=strength&step=1&max=3000&from=${first}&to=${new Date(now() + 86_400_000).toISOString().slice(0, 10)}`);
        pts = (j?.ok ? j.points : []).filter(p => Number.isFinite(p?.ts)).sort((a, b) => a.ts - b.ts);
      }
      st.index = index; st.pts = pts; st.cv = C.coverage(index, pts);
      return st.cv;
    })().catch(e => { st.loadP = null; throw e; });
    return st.loadP;
  }
  /** The FULL daily record taken at or before the as-of time: try London dates newest first until one was taken early enough. */
  async function fullFor(asOf) {
    await loadCoverage();
    const loaded = [];
    for (const ld of C.fullCandidates(st.index.fullDays, asOf)) {
      if (!st.fulls.has(ld)) { const j = await readJson(`/api/desk-snapshots/full?date=${ld}`); st.fulls.set(ld, j?.ok ? j.snapshot : null); }
      const snap = st.fulls.get(ld); if (snap) loaded.push(snap);
      const pick = C.chooseFull(loaded, asOf); if (pick) return pick;
    }
    return null;
  }

  // ── the answerer ──
  const note = (key, how, extra = {}) => { st.log.set(key, { key, how, ...extra }); A.log = [...st.log.values()]; paintSoon(); };
  async function answer(pathSearch, realF) {
    const asOf = A.t, c = C.classify(pathSearch, 'GET');
    if (c.kind === 'pass') { note(pathSearch, 'pass'); return realF(pathSearch, { cache: 'no-store' }); }
    if (c.kind === 'bars') {
      const r = await realF(pathSearch, { cache: 'no-store' }); let j = null; try { j = await r.json(); } catch { /* refused below */ }
      if (!j?.ok) { note(pathSearch, 'refused'); return jsonResp(C.refusal(asOf, st.cv?.firstCore, pathSearch), Resp); }
      note(pathSearch, 'cut'); return jsonResp(C.truncateBars(j, asOf), Resp);
    }
    if (c.kind === 'deskrun') {
      const r = await realF(C.deskRunUrl(pathSearch, asOf), { cache: 'no-store' }); let j = null; try { j = await r.json(); } catch { /* refused below */ }
      if (!j?.ok) { note(pathSearch, 'refused'); return jsonResp(C.refusal(asOf, st.cv?.firstCore, pathSearch), Resp); }
      note(pathSearch, 'deskrun', { date: C.deskRunDate(asOf) }); return jsonResp(j, Resp);
    }
    await loadCoverage();
    const snap = await fullFor(asOf);
    const m = snap ? C.matchFeed(snap.feeds, c.key) : null;
    if (!m || !m.feed?.ok || m.feed.json == null) { note(c.key, 'refused'); return jsonResp(C.refusal(asOf, st.cv?.firstCore, c.key), Resp); }
    let body = m.feed.json;
    const core = c.key === 'ccy-strength' ? C.pointAtOrBefore(st.pts, asOf) : null;
    if (core && core.ts > snap.ts) { body = C.overlayStrength(body, core); note(c.key, 'overlay', { ts: core.ts, base: snap.ts }); }
    else note(c.key, 'snapshot', { ts: snap.ts, ld: snap.ld, approx: m.approx });
    if (body && typeof body === 'object' && !Array.isArray(body)) body = { ...body, asofRecord: { ts: snap.ts, ld: snap.ld, asOf: C.formatAsofParam(asOf), approx: m.approx } };
    return jsonResp(body, Resp);
  }

  // ── the page: button, banner, panel ──
  const header = doc.querySelector('header.top');
  const bar = doc.createElement('div'); bar.id = 'asofbar'; bar.className = 'asof-bar'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); bar.setAttribute('data-surface', 'widget.asof'); bar.hidden = true;
  if (header?.after) header.after(bar); else doc.body.appendChild(bar);
  const pop = doc.createElement('div'); pop.id = 'asofpop'; pop.className = 'asof-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Time machine'); pop.setAttribute('data-surface', 'widget.asof'); pop.hidden = true;
  doc.body.appendChild(pop);

  let paintT = null;
  function paintSoon() { if (paintT) return; paintT = (win.setTimeout ?? setTimeout)(() => { paintT = null; paintLog(); paintBar(); }, 250); }
  function counts() {
    const v = [...st.log.values()], n = h => v.filter(x => x.how === h).length;
    return { rec: n('snapshot') + n('overlay') + n('deskrun') + n('cut'), none: n('refused'), pass: n('pass') };
  }
  function paintBar() {
    if (!A.active) { bar.hidden = true; return; }
    const k = counts();
    bar.hidden = false;
    bar.innerHTML = `<b class="asof-t">${esc(C.bannerText(A.t))}</b><span class="asof-s">${k.rec} reading${k.rec === 1 ? '' : 's'} from the record${k.none ? `, ${k.none} with no record at that time` : ''}</span>
<span class="asof-b"><button type="button" class="btn" data-asof="open">Time controls</button><button type="button" class="btn" data-asof="live">Back to live</button></span>`;
  }
  function paintBtn() {
    btn.hidden = false;
    btn.textContent = A.active ? `As of ${C.formatClock(A.t).replace(' UTC', '')}` : 'Time machine';
    btn.setAttribute('aria-expanded', String(st.popOpen));
    btn.classList?.toggle?.('asof-live', !!A.active);
  }
  function logHtml() {
    const by = C.describeLog([...st.log.values()]);
    const rows = Object.entries(C.HOW_LABEL).map(([h, label]) => {
      const list = by[h] ?? []; if (!list.length) return '';
      const keys = list.slice(0, 12).map(x => `<code>${esc(String(x.key).replace(/^\/api\//, ''))}</code>`).join(' ');
      return `<div class="asof-lr"><b>${esc(label)}: ${list.length}</b><div class="asof-keys">${keys}${list.length > 12 ? ` and ${list.length - 12} more` : ''}</div></div>`;
    }).join('');
    return rows || '<p class="muted">Nothing has been read yet.</p>';
  }
  function paintLog() { const el = pop.querySelector('#asof-log'); if (el) el.innerHTML = logHtml(); }
  function paintPop() {
    const cv = st.cv, t = A.t ?? now();
    const pos = cv ? C.position(cv, t) : 'empty';
    const warn = !cv ? '' : pos === 'before' ? `<p class="asof-warn">That is before the first snapshot (${esc(C.formatClock(cv.firstCore))}). Every board would say there is no record.</p>` : pos === 'after' ? '<p class="asof-warn">That is after the last snapshot. Use Back to live for now.</p>' : '';
    pop.innerHTML = `<div class="asof-h"><b>Time machine</b><span class="chip">preview</span><button type="button" class="btn" data-asof="close" aria-label="Close the time controls">×</button></div>
<p class="asof-p">Pick a moment and the whole terminal redraws as the saved records showed it then. Nothing live is shown in a past view: a board with no record at that time says so. It describes what was shown; it is not a forecast.</p>
<div class="asof-row"><label for="asof-dt">Date and time (UTC)</label><input id="asof-dt" type="datetime-local" value="${esc(C.formatLocalInput(t))}"${cv?.firstCore ? ` min="${esc(C.formatLocalInput(cv.firstCore))}"` : ''}><button type="button" class="btn" data-asof="go">Go</button></div>
<div class="asof-row asof-q" role="group" aria-label="Move the time">${[['-1d', '−1 day'], ['-1h', '−1 hour'], ['+1h', '+1 hour'], ['+1d', '+1 day']].map(([o, l]) => `<button type="button" class="btn" data-asof-off="${o}">${l}</button>`).join('')}</div>
${cv?.nCore ? `<div class="asof-row"><input id="asof-scrub" type="range" aria-label="Scrub through the snapshots" min="${cv.firstCore}" max="${cv.lastCore}" step="300000" value="${Math.min(Math.max(t, cv.firstCore), cv.lastCore)}"><span id="asof-scrubl" class="asof-sl">${esc(C.formatClock(Math.min(Math.max(t, cv.firstCore), cv.lastCore)))}</span></div>` : ''}
<div class="asof-row asof-play" role="group" aria-label="Play forward"><button type="button" class="btn" data-asof="play" aria-pressed="${st.playing}">${st.playing ? '❚❚ Pause' : '▶ Play'}</button>${C.SPEEDS.map(s => `<button type="button" class="btn" data-asof-speed="${s}" aria-pressed="${s === st.speed}">x${s}</button>`).join('')}</div>
${warn}<p class="asof-p muted" id="asof-cov">${esc(cv ? C.coverageText(cv) : 'Reading what the snapshots cover…')}</p>
<details class="asof-d"><summary>What you are seeing</summary><div id="asof-log">${logHtml()}</div></details>
<p class="asof-p muted">Your own settings (alerts, monitors, saved searches, favourites) are not market data, so they stay live and keep working. Candles are cut at the time. Boards built from a daily feed show that feed as it stood at the day's record, not minute by minute; only the currency strength scores are laid over at five-minute detail.</p>`;
  }
  function openPop() { st.popOpen = true; pop.hidden = false; paintPop(); paintBtn(); loadCoverage().then(() => { if (st.popOpen) paintPop(); }).catch(e => { const c = pop.querySelector('#asof-cov'); if (c) c.textContent = `The snapshot index could not be read (${e.message}).`; }); }
  function closePop() { st.popOpen = false; pop.hidden = true; paintBtn(); }

  // ── moving the clock ──
  const urlWith = ms => { const u = new URL(win.location.href); if (ms == null) { u.searchParams.delete('asof'); if (/^#asof=/.test(u.hash)) u.hash = ''; } else u.searchParams.set('asof', C.formatAsofParam(ms)); return u.toString(); };
  /** Set a time: a fresh load under the clock, so every board (including ones built lazily) is built from the record. */
  function setTime(ms, { play = false } = {}) {
    if (!Number.isFinite(ms)) return false;
    try { if (play && ss) ss.setItem(PLAY_KEY, JSON.stringify({ speed: st.speed })); else ss?.removeItem?.(PLAY_KEY); } catch { /* fine */ }
    win.location.assign(urlWith(ms)); return true;
  }
  function goLive() { st.playing = false; stopLoop(); try { ss?.removeItem?.(PLAY_KEY); } catch { /* fine */ } A.deactivate(); win.location.assign(urlWith(null)); return true; }
  /** Move while playing or scrubbing: redraw the boards that load() builds, without a page load. Boards built lazily redraw when they next load. */
  function inPlace(ms) {
    A.t = ms; st.log.clear(); A.log = [];
    try { win.history?.replaceState?.(null, '', urlWith(ms).replace(win.location.origin, '')); } catch { /* the address stays */ }
    paintBar(); paintBtn();
    const dt = pop.querySelector('#asof-dt'); if (dt) dt.value = C.formatLocalInput(ms);
    const sl = pop.querySelector('#asof-scrubl'); if (sl) sl.textContent = C.formatClock(ms);
    const sc = pop.querySelector('#asof-scrub'); if (sc) sc.value = String(ms);
    try { win.load?.(); } catch (e) { console.warn('asof redraw', e); }
    try { win.dispatchEvent?.(new win.Event('deskasof')); } catch { /* no events here */ }
  }
  function step(offMs) {
    if (!Number.isFinite(offMs)) return false;
    if (A.active) { inPlace(A.t + offMs); return true; }
    return setTime(now() + offMs);
  }
  function stopLoop() { if (st.timer) { (win.clearTimeout ?? clearTimeout)(st.timer); st.timer = null; } }
  function loop() {
    stopLoop(); if (!st.playing || !A.active) return;
    st.timer = (win.setTimeout ?? setTimeout)(() => {
      const t = now(), dt = t - st.last; st.last = t;
      const last = st.cv?.lastCore ?? A.t;
      const nt = C.advance(A.t, dt, st.speed, last);
      inPlace(nt);
      if (nt >= last) { st.playing = false; paintPop(); return; }
      loop();
    }, 1500);
  }
  function togglePlay() {
    if (!A.active) { const v = pop.querySelector('#asof-dt')?.value; const t = C.parseAsofValue(v ? `${v}Z` : null) ?? (st.cv?.firstCore ?? null); return t != null ? setTime(t, { play: true }) : false; }
    st.playing = !st.playing; st.last = now(); paintPop(); loop(); return true;
  }

  // ── events ──
  const onClick = e => {
    const t = e.target?.closest?.('[data-asof],[data-asof-off],[data-asof-speed]'); if (!t) return;
    if (t.dataset.asofOff) { const off = C.parseOffset(t.dataset.asofOff); const base = A.active ? A.t : (C.parseAsofValue(pop.querySelector('#asof-dt')?.value ? `${pop.querySelector('#asof-dt').value}Z` : null) ?? now()); if (A.active) step(off); else setTime(base + off); return; }
    if (t.dataset.asofSpeed) { st.speed = Number(t.dataset.asofSpeed); if (st.playing) st.last = now(); paintPop(); return; }
    switch (t.dataset.asof) {
      case 'close': closePop(); btn.focus?.(); break;
      case 'open': openPop(); break;
      case 'live': goLive(); break;
      case 'play': togglePlay(); break;
      case 'go': { const v = pop.querySelector('#asof-dt')?.value; const ms = C.parseAsofValue(v ? `${v}Z` : null); if (ms != null) setTime(ms); break; }
      default: break;
    }
  };
  pop.addEventListener('click', onClick); bar.addEventListener('click', onClick);
  const onBtn = () => (st.popOpen ? closePop() : openPop());
  btn.addEventListener('click', onBtn);
  const onKey = e => { if (e.key === 'Escape' && st.popOpen) { closePop(); btn.focus?.(); } };
  doc.addEventListener('keydown', onKey);
  pop.addEventListener('input', e => { const t = e.target; if (t?.id === 'asof-scrub') { const sl = pop.querySelector('#asof-scrubl'); if (sl) sl.textContent = C.formatClock(Number(t.value)); } });
  pop.addEventListener('change', e => { const t = e.target; if (t?.id === 'asof-scrub' && A.active) inPlace(Number(t.value)); else if (t?.id === 'asof-scrub') setTime(Number(t.value)); });

  const api = {
    set: ms => setTime(ms), live: goLive, step, open: openPop, close: closePop,
    act(a) {
      switch (a?.op) {
        case 'live': return goLive();
        case 'set': return setTime(a.t);
        case 'step': return step(a.ms);
        case 'open': openPop(); return true;
        default: return false;
      }
    },
    state: () => ({ active: !!A.active, t: A.t, playing: st.playing, speed: st.speed, coverage: st.cv }),
    _answer: answer,
  };
  win.deskAsof = api;

  // ── start: with an as-of time in the address, bring the clock up and let the held reads go ──
  paintBtn();
  doc.documentElement?.classList?.add?.('asof-ready');
  if (A.requested && A.t != null && A.holding) {
    loadCoverage().then(() => {
      A.activate((p, realF) => answer(p, realF), A.t);
      doc.documentElement?.classList?.add?.('asof-on'); paintBar(); paintBtn();
      let resume = null; try { resume = ss?.getItem?.(PLAY_KEY); ss?.removeItem?.(PLAY_KEY); } catch { /* fine */ }
      if (resume) { try { const r = JSON.parse(resume); if (C.SPEEDS.includes(r.speed)) st.speed = r.speed; } catch { /* default */ } st.playing = true; st.last = now(); win.setTimeout?.(loop, 4000); }
    }).catch(e => { A.abandon(`the snapshots could not be read (${e.message})`); paintBtn(); const n = doc.createElement('div'); n.className = 'asof-toast'; n.setAttribute('role', 'status'); n.textContent = `The time machine could not load (${e.message}), so this page is live.`; doc.body.appendChild(n); win.setTimeout?.(() => n.remove(), 8000); });
  }
  return true;
}
