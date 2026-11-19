// js/jarvis/jarvisExplain.js: POST /api/jarvis/explain (owner-only). Point at a day, get a short description of what surrounded it, from the
// stores that already exist (the news wire, the event schedule, the desk book) and the client's chain summary. One model call, cached per
// (date, days, market) for the London day, capped at 40 a day, single flight. Description only: never a forecast, never a trade.
import { isDate, normDays, windowDates, newsCoverage, cacheKey, pickWindowNews, pickWindowEvents, cleanChain, deskHeadline, buildPrompt, validateExplain, daysAgo, NEWS_KEEP_HOURS } from './explainCore.js';

const CAP = 40;
export async function mount(app, deps) {
  const { express, ownerOnly, aiAnyKey, callModel, parseModelJson, londonDate, selfJson } = deps;
  let day = { date: null, n: 0, cache: new Map() }, busy = false;
  app.post('/api/jarvis/explain', ownerOnly, express.json({ limit: '16kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const today = londonDate(Date.now());
    if (day.date !== today) day = { date: today, n: 0, cache: new Map() };
    try {
      const b = req.body ?? {};
      if (!isDate(b.date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' });
      if (b.date > today) return res.status(400).json({ ok: false, error: 'that date has not happened yet' });
      const days = normDays(b.days), market = b.market ? String(b.market).slice(0, 20) : null, key = cacheKey(b.date, days, market);
      const hit = day.cache.get(key); if (hit) return res.json({ ...hit, cached: true });
      if (!aiAnyKey()) return res.status(503).json({ ok: false, error: 'no model key on the server' });
      if (day.n >= CAP) return res.status(429).json({ ok: false, error: `the daily limit of ${CAP} explanations is reached` });
      if (busy) return res.status(409).json({ ok: false, error: 'another explanation is running; try again in a moment' });
      busy = true;
      try {
        const dates = windowDates(b.date, days), caveats = [], coverageNews = newsCoverage(b.date, days, today);
        if (coverageNews !== 'full') caveats.push(`the headline wire keeps only the last ${NEWS_KEEP_HOURS} hours, so it ${coverageNews === 'none' ? 'does not reach' : 'only partly reaches'} ${b.date}${days > 1 ? ` (window of ${days} days)` : ''}`);
        let news = [], events = [], desk = null;
        try { const w = await selfJson(`/api/desk-news?hours=${NEWS_KEEP_HOURS}&tier=2`); news = pickWindowNews(w.items, dates, londonDate); } catch { caveats.push('the news wire could not be read'); }
        if (dates.includes(today) || daysAgo(b.date, today) <= 1) {
          try { const ev = await selfJson('/api/event-day'); events = pickWindowEvents(ev.events, dates, londonDate); } catch { caveats.push('the event schedule could not be read'); }
        } else caveats.push('the event schedule store holds only today and tomorrow, so releases for that date are not included');
        try { desk = deskHeadline(await selfJson(`/api/desk-run?date=${b.date}`)); } catch { /* no desk run that day */ }
        const chain = cleanChain(b.chain);
        const { system, prompt } = buildPrompt({ date: b.date, days, market, today, news, events, chain, desk, coverage: { news: coverageNews } });
        day.n++;
        const r = await callModel({ task: 'desk-analyst', system, prompt, maxTokens: 1_500, label: 'jarvis:explain' });   // one paid call; a failure is never retried
        const txt = r.text ?? (Array.isArray(r.content) ? r.content.map(c => c?.text ?? '').join('') : '');
        const v = validateExplain(parseModelJson(txt, 'jarvis:explain'));
        if (!v.ok) return res.status(502).json({ ok: false, error: `the model did not return a usable explanation (${v.errors.join('; ')})` });
        const out = { ok: true, ...v.value, covered: { news: news.length, events: events.length }, caveats, stripped: v.stripped ?? 0, model: r.model ?? null, date: b.date, days, market, label: 'description of what surrounded the day: not a forecast, not a signal' };
        day.cache.set(key, out);
        res.json(out);
      } finally { busy = false; }
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
