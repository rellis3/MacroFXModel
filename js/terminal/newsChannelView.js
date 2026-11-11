// The "Share channel" settings modal on the Desk Terminal News tab (owner request 2026-11-11).
// Connect the desk's tier 1-2 headlines to a SEPARATE Telegram channel others can join: bot token, channel, tiers, on/off, a preview of the exact message, a real test send.
// The server (js/newsChannel.js, /api/news-channel*) keeps the token; this page only ever sees its last four characters. Pure render helpers + a small mount, tested in newsChannelView.test.mjs.
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const SETUP_STEPS = [
  'In Telegram, message @BotFather, send /newbot and follow the prompts. It gives you a bot token (long text with a colon in it). Paste it below.',
  'Create a Telegram channel (New Channel). Name it, for example, Macro News. A public channel gets a link like t.me/macro_news; a private one is joined by invite link.',
  'Open the channel, Administrators, Add Administrator, and add your bot with permission to post messages.',
  'Enter the channel below: @macro_news for a public channel, or its number (it starts -100) for a private one. Press Save, then Send test.',
  'To add people: share the channel link. In the channel settings you can make invite links that are single-use, expire, or need your approval.',
];

export function statusLine(s) {
  if (!s?.ok) return '<span class="chip dn">not available</span>';
  if (!s.configured) return '<span class="chip">not connected</span>';
  const bits = [s.on ? '<span class="chip up">on</span>' : '<span class="chip gold">paused</span>', `<span class="chip">${esc(s.chatId)}</span>`, `<span class="chip">tier ${s.tiers?.length === 1 ? '1 only' : '1 and 2'}</span>`];
  if (s.masterOn === false) bits.push('<span class="chip dn">all Telegram is muted (master switch)</span>');
  const last = s.lastSendAt ? `Last note sent ${esc(new Date(s.lastSendAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }))} London.` : 'Nothing sent since the server last started.';
  return `${bits.join(' ')}<p class="muted" style="margin-top:6px">${last}${s.lastError ? ` <b style="color:var(--dn)">Last problem: ${esc(s.lastError)}</b>` : ''}</p>`;
}

/** The Telegram HTML the server builds (only <b>, <i>, <a href=https://...>) shown as a chat bubble. Anything else is escaped; links must be http(s). */
export function bubbleHtml(tg) {
  // The message is already Telegram HTML (its text is entity-escaped, so any "<" is a tag). Keep <b>, <i> and <a href="https://...">; escape every other angle bracket or quote.
  const safe = String(tg ?? '').replace(/<(\/?)(b|i)>|<a href="(https?:\/\/[^"\s<>]+)">|<\/a>|[<>"]/g, (m, slash, tag, url) => {
    if (tag) return `<${slash}${tag}>`;
    if (url) return `<a href="${url}" target="_blank" rel="noopener noreferrer">`;
    if (m === '</a>') return m;
    return m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&quot;';
  });
  return safe.replace(/\n/g, '<br>');
}

export function modalHtml(s) {
  const tiers = s?.tiers?.length === 1 ? '1' : '12';
  return `<div class="ch"><span class="lbl">Share the news with a Telegram channel</span><button class="x" aria-label="Close">✕</button></div>
<p class="muted">Sends the desk's tier 1 and 2 headlines to a channel of your own: the headline as a link to the article, why it matters, then the longs and shorts grouped with flags and arrows. It never includes the desk's own book cards. Context, not a signal.</p>
<div id="nc-status">${statusLine(s)}</div>
<div class="sec" style="margin-top:12px"><h2 style="font-size:14px">Connection</h2></div>
<label class="muted" for="nc-token">Bot token ${s?.configured ? `(saved, ${esc(s.tokenHint)}; leave empty to keep it)` : '(from @BotFather)'}</label>
<input id="nc-token" type="password" autocomplete="off" spellcheck="false" placeholder="${s?.configured ? '••••••••••' : '123456789:AA...'}" style="width:100%;margin:4px 0 10px;background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:8px;padding:9px 10px;font:14px var(--sans)">
<label class="muted" for="nc-chat">Channel (@name, or the -100... number)</label>
<input id="nc-chat" type="text" autocomplete="off" spellcheck="false" value="${esc(s?.chatId ?? '')}" placeholder="@macro_news" style="width:100%;margin:4px 0 10px;background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:8px;padding:9px 10px;font:14px var(--sans)">
<label class="muted" for="nc-tiers">What to send</label>
<select id="nc-tiers" style="width:100%;margin:4px 0 10px;background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:8px;padding:9px 10px;font:14px var(--sans)"><option value="12"${tiers === '12' ? ' selected' : ''}>Tier 1 and tier 2 (up to 6 and 10 an hour)</option><option value="1"${tiers === '1' ? ' selected' : ''}>Tier 1 only (up to 6 an hour)</option></select>
<label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input id="nc-on" type="checkbox"${s?.on === false ? '' : ' checked'}> <span>Sending is on</span></label>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="nc-save">Save</button><button class="btn" id="nc-test"${s?.configured ? '' : ' disabled'}>Send test</button>${s?.configured ? '<button class="btn" id="nc-off">Disconnect</button>' : ''}</div>
<p id="nc-msg" class="muted" role="status" style="margin-top:8px"></p>
<div class="sec" style="margin-top:12px"><h2 style="font-size:14px">What members will see</h2><span class="lbl" id="nc-prev-l"></span></div>
<div id="nc-prev" class="card" style="background:var(--bg3);font-size:14px;line-height:1.55;overflow-wrap:anywhere">Loading…</div>
<details style="margin-top:12px"><summary class="muted" style="cursor:pointer">How to set it up, and how to add people</summary><ol class="muted" style="margin:8px 0 0 18px">${SETUP_STEPS.map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ol></details>`;
}

export function mount({ doc = document, fetchFn = (...a) => fetch(...a), open }) {
  const g = id => doc.getElementById(id);
  const call = async (url, method = 'GET', body) => {
    try { const r = await fetchFn(url, { method, cache: 'no-store', credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401) return { ok: false, error: 'Log in to the dashboard first.' };
      return (await r.json().catch(() => null)) ?? { ok: false, error: 'unreadable answer' }; } catch (e) { return { ok: false, error: e.message }; }
  };
  const preview = async () => { const p = await call('/api/news-channel/preview'); const el = g('nc-prev'); if (!el) return; el.innerHTML = p.ok ? bubbleHtml(p.html) : esc(p.error ?? 'No preview.'); const l = g('nc-prev-l'); if (l) l.textContent = p.ok ? (p.real ? 'from the latest headline' : 'a sample headline') : ''; };
  async function show() {
    const s = await call('/api/news-channel');
    open(modalHtml(s));
    preview();
    const say = (t, bad) => { const m = g('nc-msg'); if (m) { m.textContent = t; m.style.color = bad ? 'var(--dn)' : ''; } };
    g('nc-save').onclick = async () => {
      const r = await call('/api/news-channel', 'POST', { token: g('nc-token').value.trim() || undefined, chatId: g('nc-chat').value.trim(), tiers: g('nc-tiers').value === '1' ? [1] : [1, 2], on: g('nc-on').checked });
      if (!r.ok) return say(r.error ?? 'Could not save.', true);
      await show(); const m = g('nc-msg'); if (m) m.textContent = 'Saved. Press Send test to check it reaches the channel.';
    };
    const test = g('nc-test'); if (test) test.onclick = async () => { say('Sending…'); const r = await call('/api/news-channel/test', 'POST'); say(r.ok ? 'Sent. Check the channel.' : `Not sent: ${r.error ?? 'unknown problem'}`, !r.ok); const st = await call('/api/news-channel'); const el = g('nc-status'); if (el) el.innerHTML = statusLine(st); };
    const off = g('nc-off'); if (off) off.onclick = async () => { if (!confirm('Disconnect the channel? The saved token is deleted.')) return; const r = await call('/api/news-channel', 'DELETE'); if (!r.ok) return say(r.error ?? 'Could not disconnect.', true); await show(); };
  }
  return { show };
}
