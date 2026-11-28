// js/qlikeAlertRoutes.js: the I/O half of the QLIKE level alerts (logic: js/qlikeLevelAlerts.js, pure and tested).
//   tick() (server.js runs it as service qlikeAlerts, every 60 s while the FX week is open): the day's QLIKE per-line CFD board (read only, the same stored
//        board the v3 export and the KLineChart use), each watched market's 00:00 London open (one M1 candle, once a session),
//        one OANDA pricing call for every watched market; a level reached since the last check becomes one log row, and the
//        sendable rows of a check go out as ONE Telegram message (tgMaster.qlikeLevels, default on).
//   GET /api/qlike-alerts?n=40   the log (sent and held), the levels watched today and the rules.
// State: KV qlike_alerts_v1 { gate, log, lastSession } written only when something happened; the per-market prices are memory only.
// DESCRIPTION ONLY: where price is against the forecast's range, never a trade.
import { qlikeTodayLevels } from './ladderV2ShadowRoutes.js';
import { qlikeParams } from './ladderV2Qlike.js';
import { oandaCandles } from './volStateRoutes.js';
import { londonParts } from './jarvis/jarvisLogic.js';
import { QLA_DEFAULTS, QLA_LINES, QLA_NOTE, QLA_EVIDENCE, londonMidnightMs, levelPrices, checkMarket, alertText, gate, emptyGate, rollSession, telegramMessage, appendLog, parseList } from './qlikeLevelAlerts.js';

const KV_KEY = 'qlike_alerts_v1', BOARD_TTL = 30 * 60e3, OPEN_RETRY = 5 * 60e3;

export function mountQlikeAlerts(app, deps) {
  const { kv, fetchPrices, notify = async () => false, muted = () => false, weekOpen = () => true, now = () => Date.now(), log = console,
    getBoard = () => qlikeTodayLevels('cfd'), paramsOf = sym => qlikeParams(sym, 'cfd'),
    fetchOpen = async (inst, ms) => { const c = await oandaCandles(inst, `granularity=M1&count=1&from=${encodeURIComponent(new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000000000Z'))}`); return c[0]?.o ?? null; } } = deps;
  const o = {
    ...QLA_DEFAULTS,
    lines: parseList(process.env.QLIKE_ALERT_LINES, Object.keys(QLA_LINES), QLA_DEFAULTS.lines),
    markets: parseList(process.env.QLIKE_ALERT_MARKETS, null, QLA_DEFAULTS.markets),
    dailyCap: Math.max(1, Math.min(60, Number(process.env.QLIKE_ALERT_DAILY_CAP) || QLA_DEFAULTS.dailyCap)),
  };
  // memory: this session's board, opens and per-market reach state (one entry per watched market: bounded)
  let mem = { session: null, board: null, boardAt: 0, opens: {}, openTry: {}, mk: {} }, saved = null, busy = false, lastRun = null;

  const load = async () => {
    if (saved) return saved;
    let j = null; try { const raw = await kv.get(KV_KEY); j = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; } catch (e) { throw new Error(`KV read: ${e.message}`); }
    saved = { gate: j?.gate ?? emptyGate(), log: Array.isArray(j?.log) ? j.log : [] };
    return saved;
  };

  async function tick(trigger = 'poll') {
    const t = now();
    if (busy) return { ok: false, why: 'already running' };
    if (!weekOpen(t)) { lastRun = { at: new Date(t).toISOString(), trigger, idle: 'FX week closed' }; return lastRun; }
    busy = true;
    try {
      const lp = londonParts(t);
      if (!mem.board || t - mem.boardAt > BOARD_TTL || mem.board.session !== mem.session) {
        const b = await getBoard().catch(e => { log.warn?.('[qlike-alerts] board', e.message); return null; });
        if (b?.ok && b.levels) { if (b.session !== mem.session) mem = { session: b.session, board: b, boardAt: t, opens: {}, openTry: {}, mk: {} }; else { mem.board = b; mem.boardAt = t; } }
      }
      if (!mem.board) { lastRun = { at: new Date(t).toISOString(), trigger, idle: 'no QLIKE board yet' }; return lastRun; }
      // the board for session D is live from 00:00 to 22:00 London on D (it is built for D from 22:00 the evening before)
      if (mem.session !== lp.date || lp.mins >= 22 * 60) { lastRun = { at: new Date(t).toISOString(), trigger, idle: `outside the session (${mem.session}, London ${lp.hm})` }; return lastRun; }
      const names = o.markets.filter(s => mem.board.levels[s] && paramsOf(s)?.oanda);
      const midnight = londonMidnightMs(mem.session);
      for (const s of names) {
        if (Number.isFinite(mem.opens[s]) || t - (mem.openTry[s] ?? 0) < OPEN_RETRY) continue;
        mem.openTry[s] = t;
        try { const v = await fetchOpen(paramsOf(s).oanda, midnight); if (Number.isFinite(v) && v > 0) mem.opens[s] = v; } catch (e) { log.warn?.(`[qlike-alerts] open ${s}: ${e.message}`); }
      }
      const live = names.filter(s => Number.isFinite(mem.opens[s]));
      if (!live.length) { lastRun = { at: new Date(t).toISOString(), trigger, idle: 'no session opens yet' }; return lastRun; }
      const prices = await fetchPrices(live.map(s => paramsOf(s).oanda)).catch(e => { log.warn?.('[qlike-alerts] prices', e.message); return {}; });
      const events = [];
      for (const s of live) {
        const px = prices?.[paramsOf(s).oanda]; if (!Number.isFinite(px)) continue;
        const r = checkMarket(levelPrices(mem.board.levels[s], mem.opens[s], o.lines), mem.mk[s], px);
        mem.mk[s] = r.st;
        for (const h of r.hits) events.push({ key: `${mem.session}|${s}|${h.line}`, market: s, line: h.line, side: h.side, tau: h.tau, level: +h.level.toPrecision(8), price: px, kind: h.kind, session: mem.session, text: alertText(s, h, paramsOf(s)) });
      }
      lastRun = { at: new Date(t).toISOString(), trigger, session: mem.session, watched: live.length, priced: live.filter(s => Number.isFinite(prices?.[paramsOf(s).oanda])).length, events: events.length };
      if (!events.length) return lastRun;
      const st = await load();
      const g = gate(rollSession(st.gate, mem.session), events, t, o);
      st.gate = g.state; st.log = appendLog(st.log, g.events, o.keepLog);
      await kv.put(KV_KEY, JSON.stringify({ gate: st.gate, log: st.log }));   // saved before sending: a restart never resends
      const msg = !muted() ? telegramMessage(g.events, lp.hm) : null;
      if (msg) { try { await notify(msg); } catch (e) { log.warn?.('[qlike-alerts] telegram', e.message); } }
      lastRun = { ...lastRun, sent: g.events.filter(e => e.send).length, held: g.events.filter(e => !e.send).length, muted: muted() };
      log.log?.(`[qlike-alerts] ${g.events.map(e => `${e.market} ${e.line}${e.send ? '' : ' (held)'}`).join(', ')}`);
      return lastRun;
    } catch (e) { log.warn?.('[qlike-alerts]', e.message); lastRun = { at: new Date(t).toISOString(), trigger, error: e.message }; return lastRun; }
    finally { busy = false; }
  }

  app.get('/api/qlike-alerts', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const st = await load(), n = Math.min(200, parseInt(req.query.n) || 40), lp = londonParts(now());
      const today = (st.gate?.day === lp.date ? st.gate.sent : 0) ?? 0;
      const watching = mem.board ? o.markets.filter(s => mem.board.levels[s] && Number.isFinite(mem.opens[s])).map(s => ({
        market: s, open: mem.opens[s], last: mem.mk[s]?.prev ?? null, reached: Object.keys(mem.mk[s]?.done ?? {}),
        levels: levelPrices(mem.board.levels[s], mem.opens[s], o.lines).map(l => ({ line: l.line, price: +l.price.toPrecision(8) })) })) : [];
      res.json({ ok: true, session: mem.session, muted: muted(), lastRun, rules: { lines: o.lines, markets: o.markets, dailyCap: o.dailyCap, quiet: '22:00-07:00 London', once: 'once per level per session' },
        sentToday: today, watching, log: st.log.slice(0, n), evidence: QLA_EVIDENCE, note: QLA_NOTE });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  return { tick, state: () => ({ mem, saved, lastRun, o }) };
}
