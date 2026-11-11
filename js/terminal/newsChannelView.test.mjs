// Tests for js/terminal/newsChannelView.js.   node js/terminal/newsChannelView.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { statusLine, bubbleHtml, modalHtml, SETUP_STEPS } from './newsChannelView.js';
import { channelMessage } from '../newsChannel.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const SAVED = { ok: true, configured: true, chatId: '@macro_news', on: true, tiers: [1, 2], tokenHint: '••••saw0', masterOn: true, lastSendAt: null, lastError: null };

t('status: not connected, connected, paused, muted, and a problem is shown', () => {
  assert.match(statusLine({ ok: true, configured: false }), /not connected/);
  assert.match(statusLine(SAVED), /chip up">on[\s\S]*@macro_news[\s\S]*tier 1 and 2/);
  assert.match(statusLine({ ...SAVED, on: false, tiers: [1] }), /paused[\s\S]*tier 1 only/);
  assert.match(statusLine({ ...SAVED, masterOn: false }), /muted \(master switch\)/);
  assert.match(statusLine({ ...SAVED, lastError: 'Forbidden: bot is not a member <b>' }), /Last problem: Forbidden: bot is not a member &lt;b&gt;/);
  assert.match(statusLine({ ok: false }), /not available/);
});

t('the modal never contains the token, keeps the channel, and offers test and disconnect only once saved', () => {
  const m = modalHtml(SAVED);
  assert.ok(m.includes('••••saw0') && m.includes('value="@macro_news"') && m.includes('id="nc-off"') && !/id="nc-test" disabled/.test(m));
  assert.ok(/type="password"/.test(m) && !/value="[0-9]{6,}:/.test(m));
  const fresh = modalHtml({ ok: true, configured: false });
  assert.ok(/id="nc-test" disabled/.test(fresh) && !fresh.includes('nc-off') && fresh.includes('@BotFather'));
  assert.ok(modalHtml({ ...SAVED, chatId: '"><img src=x onerror=alert(1)>' }).includes('&quot;&gt;&lt;img'), 'the channel value is escaped');
  assert.ok(SETUP_STEPS.length >= 5 && SETUP_STEPS.some(s => /invite/i.test(s)));
});

t('the preview bubble shows the real Telegram message: bold, italics and https links work, everything else is escaped', () => {
  const tg = channelMessage({ id: 'x', title: 'US CPI <hot> & more', link: 'https://example.com/a?x=1&y=2', ms: Date.parse('2026-11-11T14:32:00Z'), sources: ['Reuters'], tier: 1, read: { tier: 1, why: 'Why.', impact: { USD: 2, EUR: -1 } } });
  const b = bubbleHtml(tg);
  assert.match(b, /<b>TIER 1<\/b>/); assert.match(b, /<a href="https:\/\/example\.com\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"><b>US CPI &lt;hot&gt; &amp; more<\/b><\/a>/);
  assert.match(b, /🟢 <b>LONG<\/b>[\s\S]*🇺🇸 USD ▲▲/); assert.match(b, /🔴 <b>SHORT<\/b>[\s\S]*🇪🇺 EUR ▼/); assert.ok(b.includes('<br>'));
  assert.ok(!bubbleHtml('<script>alert(1)</script><a href="javascript:alert(1)">x</a>').includes('<script>'));
  assert.ok(!/<a href="javascript/.test(bubbleHtml('<a href="javascript:alert(1)">x</a>')));
});

t('wired into the News tab, and the page sends only what the server needs', () => {
  const tabs = fs.readFileSync(new URL('./terminalTabs.js', import.meta.url), 'utf8');
  assert.ok(tabs.includes("import * as NCV from './newsChannelView.js'") && tabs.includes('data-newsch') && tabs.includes('NCV.mount({ open: openModal }).show()'));
  const v = fs.readFileSync(new URL('./newsChannelView.js', import.meta.url), 'utf8');
  for (const u of ["'/api/news-channel'", "'/api/news-channel/test'", "'/api/news-channel/preview'"]) assert.ok(v.includes(u), u);
});

console.log(`newsChannelView: ${n} tests ok`);
