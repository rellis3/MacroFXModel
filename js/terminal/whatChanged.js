/**
 * What changed since yesterday's book (Desk Terminal, "Changed" tab; the owner's build list #7).
 *
 * Compares today's desk run with the previous one (currency biases, the global tone, cards added / removed /
 * flipped / resized), the world-stress tiles against the last snapshot taken on an earlier day, and the chain links
 * that broke or came back in the desk watch's log since the previous book. Each change gets a weight for how much it
 * matters to the book, and the list is ranked by it. Pure: the page fetches, this compares.
 *
 * The weights are a reading order, not a model: a flipped card the book is sized in outranks a bias that moved one
 * notch, which outranks a stress tile going amber, which outranks a chain link nobody trades.
 */

export const DIRN = { STRONG_LONG: 2, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -2 };
const LEVEL = { ok: 0, watch: 1, stress: 2 };
const CONV = { low: 1, medium: 2, high: 3 };

/** The parts of a desk run (/api/desk-run) a comparison needs; null when the run has no head book. */
export function bookOf(run) {
  if (!run?.head?.ok || !run.head.book) return null;
  const b = run.head.book, cv = run.debate?.currency?.view;
  const biases = cv?.currencies ? Object.fromEntries(Object.entries(cv.currencies).map(([k, v]) => [k, Number(v?.bias) || 0]))
    : Object.fromEntries(Object.entries(b.currencies ?? {}).map(([k, v]) => [k, Number(v?.bias) || 0]));
  const cards = Object.fromEntries(Object.entries(b.instruments ?? {}).map(([k, c]) => [k, { rating: c.rating ?? 'FLAT', dir: DIRN[c.rating] ?? 0, conviction: c.conviction ?? null, size: Number(c.size) || 0, why: c.why ?? '' }]));
  return { date: run.date ?? null, finishedAt: run.finishedAt ?? null, tone: b.global?.tone ?? null, conviction: run.debate?.global?.view?.conviction ?? null, ranking: cv?.ranking ?? null, biases, cards };
}

const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const word = r => String(r ?? 'FLAT').replace('_', ' ').toLowerCase();

/** Book changes: tone, currency biases, cards. Each item { kind, key, title, detail, weight, dir }. */
export function diffBooks(prev, cur) {
  const out = [];
  if (!prev || !cur) return out;
  if (prev.tone !== cur.tone && (prev.tone || cur.tone)) out.push({ kind: 'tone', key: 'tone', title: `Global tone ${word(prev.tone)} → ${word(cur.tone)}`, detail: `conviction ${prev.conviction ?? '?'} → ${cur.conviction ?? '?'}`, weight: 6, dir: 0 });
  else if (prev.conviction && cur.conviction && prev.conviction !== cur.conviction) out.push({ kind: 'tone', key: 'conviction', title: `Global conviction ${prev.conviction} → ${cur.conviction}`, detail: `tone still ${word(cur.tone)}`, weight: 2, dir: 0 });
  for (const c of new Set([...Object.keys(prev.biases ?? {}), ...Object.keys(cur.biases ?? {})])) {
    const a = prev.biases?.[c] ?? 0, b = cur.biases?.[c] ?? 0; if (a === b) continue;
    const flip = sgn(a) !== 0 && sgn(b) !== 0 && sgn(a) !== sgn(b);
    out.push({ kind: 'bias', key: c, title: `${c} bias ${a > 0 ? '+' : ''}${a} → ${b > 0 ? '+' : ''}${b}${flip ? ' (flipped)' : ''}`, detail: flip ? 'the currency changed sides' : Math.abs(b) > Math.abs(a) ? 'stronger view' : 'weaker view', weight: 2 * Math.abs(b - a) + (flip ? 3 : 0), dir: sgn(b - a) });
  }
  for (const k of new Set([...Object.keys(prev.cards ?? {}), ...Object.keys(cur.cards ?? {})])) {
    const a = prev.cards?.[k] ?? { rating: 'FLAT', dir: 0, size: 0 }, b = cur.cards?.[k] ?? { rating: 'FLAT', dir: 0, size: 0 };
    const sizeA = a.dir ? a.size : 0, sizeB = b.dir ? b.size : 0;
    if (sgn(a.dir) !== sgn(b.dir)) {
      if (!a.dir) out.push({ kind: 'card', key: k, change: 'added', title: `${k} new ${word(b.rating)}`, detail: `size ${sizeB}${b.conviction ? ` · ${b.conviction} conviction` : ''}`, weight: 2 + 6 * sizeB + (CONV[b.conviction] ?? 1) * 0.5, dir: sgn(b.dir) });
      else if (!b.dir) out.push({ kind: 'card', key: k, change: 'removed', title: `${k} ${word(a.rating)} dropped`, detail: `was size ${sizeA}`, weight: 2 + 6 * sizeA, dir: -sgn(a.dir) });
      else out.push({ kind: 'card', key: k, change: 'flipped', title: `${k} flipped ${word(a.rating)} → ${word(b.rating)}`, detail: `size ${sizeA} → ${sizeB}`, weight: 5 + 6 * (sizeA + sizeB), dir: sgn(b.dir) });
      continue;
    }
    if (!b.dir) continue;
    const parts = [];
    if (a.rating !== b.rating) parts.push(`${word(a.rating)} → ${word(b.rating)}`);
    if (a.conviction !== b.conviction && a.conviction && b.conviction) parts.push(`conviction ${a.conviction} → ${b.conviction}`);
    const dSize = +(sizeB - sizeA).toFixed(2);
    if (Math.abs(dSize) >= 0.1) parts.push(`size ${sizeA} → ${sizeB}`);
    if (!parts.length) continue;
    out.push({ kind: 'card', key: k, change: 'resized', title: `${k} ${word(b.rating)}: ${parts.join(' · ')}`, detail: dSize > 0 ? 'more of it' : dSize < 0 ? 'less of it' : 'same size', weight: 1 + 4 * Math.abs(dSize) + (a.rating !== b.rating ? 1.5 : 0) + (a.conviction !== b.conviction ? 0.5 : 0), dir: sgn(b.dir) });
  }
  return out;
}

/** World-stress tiles whose colour changed. prev / cur: { overall, tiles: [{ id, label, level, detail }] }. */
export function stressChanges(prev, cur) {
  const out = [];
  if (!prev?.tiles || !cur?.tiles) return out;
  if (prev.overall && cur.overall && prev.overall !== cur.overall) out.push({ kind: 'stress', key: 'overall', title: `World stress ${prev.overall} → ${cur.overall}`, detail: 'the overall reading', weight: 1.5 + 2 * Math.abs((LEVEL[cur.overall] ?? 0) - (LEVEL[prev.overall] ?? 0)), dir: sgn((LEVEL[cur.overall] ?? 0) - (LEVEL[prev.overall] ?? 0)) });
  const before = Object.fromEntries(prev.tiles.map(t => [t.id, t]));
  for (const t of cur.tiles) {
    const p = before[t.id]; if (!p || p.level === t.level) continue;
    const d = (LEVEL[t.level] ?? 0) - (LEVEL[p.level] ?? 0);
    out.push({ kind: 'stress', key: t.id, title: `${t.label} ${p.level} → ${t.level}`, detail: `${p.detail ?? ''} → ${t.detail ?? ''}`, weight: 1 + 1.5 * Math.abs(d), dir: sgn(d) });
  }
  return out;
}

/**
 * Chain links that broke or came back, from the desk watch's log (/api/desk-watch .log, events on 'chain-*' ids).
 * Only the LAST event per link inside [sinceMs, untilMs] counts, so a link that broke and healed twice reads once.
 * bookInsts: instruments the book holds, so a broken link that ends on one of them weighs more.
 */
export function chainFlips(log, sinceMs, untilMs = Infinity, bookInsts = []) {
  const last = new Map();
  for (const e of log ?? []) {
    if (!String(e?.id ?? '').startsWith('chain-')) continue;
    const t = Date.parse(e.at); if (!Number.isFinite(t) || t < sinceMs || t > untilMs) continue;
    if (!['started', 'cleared'].includes(e.event)) continue;
    const p = last.get(e.id); if (!p || Date.parse(p.at) <= t) last.set(e.id, e);
  }
  const held = new Set((bookInsts ?? []).map(s => String(s).toLowerCase()));
  return [...last.values()].map(e => {
    const link = e.id.slice('chain-'.length), touches = link.split('-').some(n => held.has(n === 'spx' ? 'spx500' : n));
    const label = String(e.label ?? link).replace(/^Chain link broken:\s*/, '');
    return e.event === 'started'
      ? { kind: 'chain', key: link, change: 'broke', title: `${label}: holding → broken`, detail: String(e.detail ?? '').slice(0, 220), weight: 2 + (touches ? 1.5 : 0), dir: 1, at: e.at }
      : { kind: 'chain', key: link, change: 'healed', title: `${label}: broken → no longer broken`, detail: String(e.detail ?? '').slice(0, 220), weight: 1 + (touches ? 1 : 0), dir: -1, at: e.at };
  });
}

/** Everything, ranked by weight (ties: book first, then stress, then chain). */
export function whatChanged({ prevRun = null, curRun = null, prevStress = null, curStress = null, watchLog = [], sinceMs = null, untilMs = Infinity } = {}) {
  const prev = bookOf(prevRun), cur = bookOf(curRun);
  const order = { tone: 0, card: 1, bias: 2, stress: 3, chain: 4 };
  const since = sinceMs ?? (prev?.finishedAt ? Date.parse(prev.finishedAt) : Date.now() - 864e5);
  const bookInsts = cur ? Object.entries(cur.cards).filter(([, c]) => c.dir && c.size > 0).map(([k]) => k) : [];
  const items = [...diffBooks(prev, cur), ...stressChanges(prevStress, curStress), ...chainFlips(watchLog, since, untilMs, bookInsts)]
    .map(x => ({ ...x, weight: +x.weight.toFixed(2) }))
    .sort((a, b) => b.weight - a.weight || (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || String(a.key).localeCompare(String(b.key)));
  const count = k => items.filter(x => x.kind === k).length;
  return { prevDate: prev?.date ?? null, curDate: cur?.date ?? null, since: Number.isFinite(since) ? new Date(since).toISOString() : null, items,
    summary: { book: count('card') + count('bias') + count('tone'), stress: count('stress'), chain: count('chain') } };
}

/** The world-stress snapshot store (server KV): one snapshot per London date, newest kept. */
export function recordSnap(store, date, snap, keep = 14) {
  const s = { ...(store ?? {}) };
  if (!s[date]) s[date] = snap;   // the first look of the day is the day's snapshot
  const keys = Object.keys(s).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keep))) delete s[k];
  return s;
}
/** The newest snapshot taken on a day before `date`, as { date, ...snap }, or null. */
export function previousSnap(store, date) {
  const k = Object.keys(store ?? {}).filter(d => d < date).sort().at(-1);
  return k ? { date: k, ...store[k] } : null;
}
/** The fields of /api/world-stress worth keeping. */
export const stressSnapOf = ws => (ws?.ok && Array.isArray(ws.tiles) ? { at: ws.at ?? null, overall: ws.overall ?? null, tiles: ws.tiles.map(t => ({ id: t.id, label: t.label, level: t.level, detail: t.detail })) } : null);
