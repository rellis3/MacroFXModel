// js/scratchpad.js — shared "Notes" scratchpad: a floating modal, synced via
// GET/POST /api/scratchpad with a localStorage cache fallback. Injects its own
// CSS + modal markup once per page (same pattern as js/commandHub.js); the
// Notes button commandHub.js renders just calls window.scratchOpen().
(function () {
  if (!document.getElementById('scratchStyles')) {
    const style = document.createElement('style');
    style.id = 'scratchStyles';
    style.textContent = `
#scratchOverlay{display:none;position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:24px}
#scratchOverlay.open{display:flex}
#scratchModal{background:var(--s1,#111827);border:1px solid var(--border,#1e2a3a);border-radius:12px;width:100%;max-width:820px;height:min(720px,86vh);display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6)}
#scratchHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:16px 22px;border-bottom:1px solid var(--border,#1e2a3a)}
#scratchHead h3{margin:0;font-size:16px;color:var(--text,#e2e8f0);font-family:'DM Sans',sans-serif}
#scratchStatus{font-size:11.5px;color:var(--text3,#4b5563);font-family:'DM Sans',sans-serif}
#scratchBody{flex:1;padding:16px 22px;min-height:0;display:flex}
#scratchTextarea{flex:1;width:100%;resize:none;background:var(--s2,#161b27);border:1px solid var(--border,#1e2a3a);border-radius:9px;color:var(--text,#e2e8f0);font-family:'DM Mono',monospace;font-size:14.5px;line-height:1.65;padding:16px;box-sizing:border-box}
#scratchTextarea:focus{outline:none;border-color:#4f7df0}
#scratchFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 22px;border-top:1px solid var(--border,#1e2a3a);font-family:'DM Sans',sans-serif}
#scratchMeta{font-size:11px;color:var(--text3,#4b5563)}
#scratchFootBtns{display:flex;gap:8px}
@media (max-width:640px){#scratchModal{height:92vh;max-width:100%}}
`;
    document.head.appendChild(style);
  }

  if (!document.getElementById('scratchOverlay')) {
    document.body.insertAdjacentHTML('beforeend', `
<div id="scratchOverlay" onclick="if(event.target===this)scratchClose()">
  <div id="scratchModal">
    <div id="scratchHead">
      <h3>📝 Notes</h3>
      <span id="scratchStatus">saved</span>
    </div>
    <div id="scratchBody"><textarea id="scratchTextarea" placeholder="Jot anything here — synced to your account, same notes on every device…" spellcheck="false"></textarea></div>
    <div id="scratchFoot">
      <span id="scratchMeta">autosaves as you type</span>
      <div id="scratchFootBtns">
        <button class="ne-btn" onclick="scratchClear()">Clear</button>
        <button class="ne-btn primary" onclick="scratchClose()">Done</button>
      </div>
    </div>
  </div>
</div>`);
  }

  const CACHE_KEY = 'macrofx_scratchpad_cache';
  let ta, statusEl, metaEl, saveTimer, loaded = false;

  function setStatus(s, isErr) { statusEl.textContent = s; statusEl.style.color = isErr ? '#ef4444' : ''; }
  function updateMeta() {
    const words = (ta.value.match(/\S+/g) || []).length;
    const chars = ta.value.length;
    metaEl.textContent = `${words} word${words === 1 ? '' : 's'} · ${chars} char${chars === 1 ? '' : 's'} · autosaves as you type`;
  }

  async function loadFromServer() {
    try {
      const r = await fetch('/api/scratchpad');
      const j = await r.json();
      if (j?.ok && typeof j.text === 'string') {
        ta.value = j.text;
        try { localStorage.setItem(CACHE_KEY, j.text); } catch {}
        setStatus('saved'); updateMeta();
      }
    } catch (e) {
      console.error('[scratchpad] load failed:', e);
      setStatus('offline — showing local copy', true);
    }
    loaded = true;
  }

  async function saveToServer() {
    const text = ta.value;
    try { localStorage.setItem(CACHE_KEY, text); } catch {}
    setStatus('saving…');
    try {
      const r = await fetch('/api/scratchpad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || 'save failed');
      setStatus('saved');
    } catch (e) {
      console.error('[scratchpad] sync to server failed, saved locally only:', e);
      setStatus('saved locally only', true);
    }
  }

  window.scratchOpen = function () {
    if (!ta) {
      ta = document.getElementById('scratchTextarea');
      statusEl = document.getElementById('scratchStatus');
      metaEl = document.getElementById('scratchMeta');
      ta.addEventListener('input', () => {
        setStatus('editing…'); updateMeta();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveToServer, 800);
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('scratchOverlay').classList.contains('open')) scratchClose();
      });
    }
    if (!loaded) {
      try { const cached = localStorage.getItem(CACHE_KEY); if (cached != null) ta.value = cached; } catch {}
    }
    document.getElementById('scratchOverlay').classList.add('open');
    loadFromServer();
    updateMeta();
    setTimeout(() => ta.focus(), 0);
  };
  window.scratchClose = function () {
    clearTimeout(saveTimer);
    if (ta) saveToServer();
    document.getElementById('scratchOverlay').classList.remove('open');
  };
  window.scratchClear = function () {
    if (!ta || !confirm("Clear all notes? This can't be undone.")) return;
    ta.value = '';
    updateMeta();
    setStatus('editing…');
    clearTimeout(saveTimer);
    saveToServer();
    ta.focus();
  };
})();
