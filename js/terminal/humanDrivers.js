/**
 * Plain-English wording for the Desk Terminal's "What drives this" panel (the Pair page and each card's modal).
 *
 * Presentation only. The analysts' stored reports are read as they are (cardDrivers in cardExplain.js does the
 * signing); nothing here changes a number, a rating or a prompt. This module turns ids and scores into words:
 *   - one plain name per analyst (rates_cb -> "Central banks & rates"), with a safe fallback for an id it has not met;
 *   - one friendly name per data feed (fed-path -> "Fed path"), so the sources read like sources, not routes;
 *   - a one-line takeaway per analyst and a summary line, built by rule from the existing net push (no model, no
 *     invented view, no trade wording: "tailwind" / "headwind" mean the push is up / down for this market);
 *   - text helpers: a boundary-aware trim (never mid-word, mid-number or inside a bracket), a sentence split and a
 *     figure highlighter that escapes everything it prints.
 * The stored claims are NOT truncated (checked on the live run, 2026-11-15: median 293 characters, longest 500); the
 * old panel cut them at 200 characters at render time, which is where "the widest stru" and "(mean path ~431bp to ~46" came from.
 * Pure. Tested in js/terminal/humanDrivers.test.mjs.
 */

/** One plain name per analyst id (the ids are the DESK_SKILLS in js/deskPack.js). */
export const ANALYST_LABEL = {
  global_market: 'Global tone & risk appetite',
  credit_funding: 'Credit & funding',
  events_news: 'Events & news',
  rates_cb: 'Central banks & rates',
  yields_curve: 'Yields & the curve',
  macro_economy: 'Economy & inflation',
  cot_positioning: 'Positioning',
  vol_iv: 'Volatility',
  options_oi: 'Options & dealer flow',
  levels_structure: 'Levels & structure',
  evidence_memory: 'Track record & memory',
};

const titleCase = s => String(s ?? '').replace(/[_-]+/g, ' ').trim().replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase());
/** The analyst's plain name; an id this table has not met is title-cased (never shown as snake_case). */
export const analystLabel = id => ANALYST_LABEL[id] ?? (titleCase(id) || 'Analyst');

/** Friendly feed names, keyed by the route id the analysts cite in their evidence. Unknown ids fall back to prettyFeed(). */
export const FEED_LABEL = {
  'fed-path': 'Fed path', 'fomc/latest': 'FOMC statement', 'fomc-latest': 'FOMC statement', 'rate-diff': 'Rate differentials',
  'rates': 'Policy rates', 'rates-regime': 'Rate regime', 'speech-drift': 'Central-bank speeches', 'fed-speakers': 'Fed speakers',
  'ecb/latest': 'ECB statement', 'boe/latest': 'BoE statement', 'boj/latest': 'BoJ statement', 'boc/latest': 'BoC statement',
  'rba/latest': 'RBA statement', 'rbnz/latest': 'RBNZ statement', 'rbnz/decisions': 'RBNZ decisions', 'snb/latest': 'SNB statement',
  'beigebook/latest': 'Beige Book', 'cb-expectations': 'Rate expectations (futures)', 'world-rates': 'World policy rates',
  'policy-rates': 'Policy rates', 'carry-vol': 'Carry against vol', 'treasury-auctions': 'Treasury auctions',
  'macro-scorecard': 'Macro scorecard', 'macro-changes': 'Macro changes', 'nowcast': 'Cleveland nowcast', 'cpi': 'CPI',
  'ppi': 'PPI', 'gdp': 'GDP', 'ism': 'ISM', 'retail-sales': 'Retail sales', 'trade-balance': 'Trade balance',
  'consumer-confidence': 'Consumer confidence', 'labor-market': 'Labour market', 'econ-surprise': 'Economic surprises',
  'econ-trend': 'Economic trend', 'gpr': 'Geopolitical risk', 'leading-indicators': 'Leading indicators',
  'global-yields': 'Global yields', 'real-yield': 'Real yields', 'yield-curve': 'Yield curve', 'yield-context': 'Yield context',
  'yield-coupling': 'Yield coupling', 'yield-spread/plan': 'Yield-spread signals', 'term-premium': 'Term premium',
  'spread-episodes/live': 'Spread episodes', 'xccy-basis': 'Cross-currency basis',
  'cot-state': 'CFTC positioning', 'cot-extremes': 'CFTC extremes', 'oanda-book': 'Retail positioning', 'oanda-book/history': 'Retail positioning',
  'credit-stress': 'Credit stress', 'credit-quality': 'Credit quality', 'credit-board': 'Credit board', 'liquidity-pulse/data': 'Liquidity pulse',
  'liquidity-gate/live': 'Liquidity gate', 'liquidity-board': 'Liquidity board', 'bank-credit': 'Bank credit', 'credit-leads-equities': 'Credit-leads-equities',
  'chain-read': 'Chain read', 'chain-extra': 'Chain extras', 'regime': 'Growth and inflation regime', 'hmm/regimes': 'Volatility regimes',
  'market-sense/last': 'Market-sense checks', 'world-stress': 'World stress', 'risk-flags': 'Risk flags', 'gold-etf-flow': 'Gold ETF flows',
  'wider-market': 'Wider market', 'em-gauges': 'Emerging-market gauges', 'fair-value': 'Fair value', 'fx-fair-value': 'FX fair value',
  'events': 'Economic calendar', 'event-day': 'Event-day context', 'release-calls': 'Release calls', 'news-outcome': 'News outcomes',
  'earnings-ahead': 'Earnings ahead', 'fiscal/events': 'Fiscal events', 'desk-news': 'News wire', 'desk-weekly': 'Weekly strategist view',
  'cvol': 'CME implied vol', 'daily-read': 'Daily read', 'today-reads': 'Daily reads', 'forecast-path': 'Forecast path',
  'exhaustion-ladder': 'Exhaustion ladder', 'options-skew': 'Options skew', 'hedging-summary': 'Dealer hedging', 'oi-levels': 'Option-interest levels',
  'oi-today': 'Option interest', 'levels': 'Level engine', 'asia-today': 'Asia session', 'daily-open-fib': 'Daily-open Fibonacci levels',
  'weekmap': 'Week map', 'range-calls': 'Range calls', 'trade-decision/state': 'Market state', 'trade-state': 'Market state',
  'swing-map': 'Swing map', 'ledger': 'Desk ledger', 'direction-ledger': 'Direction ledger', 'eod-review': 'End-of-day review',
  'morning-brief': 'Morning brief', 'desk-memory': 'Desk memory', 'daily-snapshot': 'Daily snapshot', 'trend-basket': 'Trend basket',
  'rates-nasdaq': 'Rates against Nasdaq',
};

const PAIR6 = /^[A-Z]{6}$/;
const prettyInst = s => { const t = String(s ?? '').trim(); return PAIR6.test(t) ? `${t.slice(0, 3)}/${t.slice(3)}` : titleCase(t.toLowerCase()); };
/** "trade-decision/state:USDCAD" -> "Market state · USD/CAD"; an unknown id -> sentence case, never a route. */
export function prettyFeed(id) {
  const raw = String(id ?? '').trim(); if (!raw) return '';
  const [base, inst] = raw.split(':');
  const lab = FEED_LABEL[base] ?? titleCase(base.replace(/\/latest$/, '').replace(/\//g, ' '));
  return inst ? `${lab} · ${prettyInst(inst)}` : lab;
}

/** An analyst's evidence string -> [{ id, label, note }]. Commas inside brackets do not split; a bracketed "TESTED NULL" becomes a plain note. */
export function parseEvidence(ev) {
  const out = [];
  for (const tok of String(ev ?? '').split(/[;,]\s*(?![^()]*\))/)) {
    const t = tok.trim(); if (!t) continue;
    const m = t.match(/^([^()]+?)\s*(?:\(([^)]*)\))?\s*$/); if (!m) continue;
    const id = m[1].trim(); let note = (m[2] ?? '').trim();
    if (/null|underpowered|untested|tested/i.test(note)) note = 'tested before: no clear edge found';
    else if (/priced in usd/i.test(note)) note = '';
    out.push({ id, label: prettyFeed(id), note: note || null });
  }
  return out;
}

/** "1542h" / 5 -> "9 weeks old" style age, in words a reader uses. */
export function ageWords(ageH) {
  const h = Number(ageH); if (!Number.isFinite(h)) return '';
  if (h < 36) return `${Math.max(1, Math.round(h))} hour${Math.round(h) === 1 ? '' : 's'} old`;
  const d = h / 24; if (d < 21) return `${Math.round(d)} days old`;
  return `${Math.round(d / 7)} weeks old`;
}
/** A feed gap in a sentence: "Term premium (9 days old)", "Cross-currency basis (no data)". */
export function gapPhrase(g) {
  const lab = prettyFeed(g?.id ?? g?.feed ?? '');
  const st = String(g?.status ?? '').toLowerCase();
  const tail = /stale/.test(st) ? (g?.ageH != null ? ageWords(g.ageH) : 'out of date') : /empty|gap|error|missing|fail/.test(st) ? 'no data' : (st || 'unavailable');
  return `${lab} (${tail})`;
}
/** "2 inputs weren't available this morning" / "1 input ...". */
export const gapCount = n => `${n} input${n === 1 ? '' : 's'}`;

/** Stale-feed strings from cardDrivers ("fed-path (stale, 257h)") -> "Fed path (10 days old)". */
export function staleWords(s) {
  const m = String(s ?? '').match(/^(.+?)\s*\((\w+)(?:,\s*([\d.]+)h)?\)\s*$/);
  return m ? gapPhrase({ id: m[1], status: m[2], ageH: m[3] != null ? Number(m[3]) : null }) : prettyFeed(s);
}

// ───────────────────────────────────────────── words from scores ─────────────────────────────────────────────

/** A net push on the market -> { word, cls, strength }. Push > 0 favours a higher price (tailwind), < 0 a lower one (headwind). */
export function stance(net) {
  const n = Number(net) || 0, a = Math.abs(n);
  if (a < 1) return { word: 'Neutral', cls: 'flat', strength: 'none' };
  const strength = a >= 4 ? 'strong' : a >= 2 ? 'clear' : 'mild';
  return n > 0 ? { word: 'Tailwind', cls: 'up', strength } : { word: 'Headwind', cls: 'dn', strength };
}
const ART = { strong: 'A strong', clear: 'A clear', mild: 'A mild' };
/** The one-line takeaway under an analyst's name. */
export function takeaway(a, mkt) {
  const s = stance(a.net), both = (a.forN > 0 && a.againstN > 0) || (a.points ?? []).some(p => p.push > 0) && (a.points ?? []).some(p => p.push < 0);
  if (s.cls === 'flat') return both ? `Pulls both ways, roughly neutral for ${mkt}.` : `Roughly neutral for ${mkt}.`;
  return `${ART[s.strength]} ${s.word.toLowerCase()} for ${mkt}${both ? ', though not every point agrees' : ''}.`;
}
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
/** The summary line at the top of the panel, from the analysts' stances. Descriptive; never a trade word. */
export function summaryLine(analysts, mkt) {
  const by = { dn: [], up: [], flat: [] };
  for (const a of analysts ?? []) by[stance(a.net).cls].push(analystLabel(a.id));
  if (!analysts?.length) return '';
  const parts = [];
  if (by.dn.length) parts.push(`${list(by.dn)} ${by.dn.length === 1 ? 'leans' : 'lean'} against ${mkt}`);
  if (by.up.length) parts.push(`${list(by.up)} ${by.up.length === 1 ? 'leans' : 'lean'} ${mkt}'s way`);
  if (by.flat.length) parts.push(`${list(by.flat)} ${by.flat.length === 1 ? 'is' : 'are'} roughly neutral`);
  const s = parts.join('; ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}
/** How the points reach this market, from cardDrivers().channels ("direct", "USD leg (quote)", "the dollar (priced in USD)", "risk appetite"). */
export function channelsPhrase(channels, mkt) {
  const c = (channels ?? []).filter(Boolean), via = [];
  for (const x of c) {
    if (x === 'direct') continue;
    if (/dollar/i.test(x)) via.push('the dollar');
    else if (/risk appetite/i.test(x)) via.push('risk appetite');
    else { const m = x.match(/^([A-Z]{3}) leg/); via.push(m ? m[1] : x); }
  }
  return via.length ? `Points that bear on ${mkt}, directly and through ${list([...new Set(via)])}.` : `Points that bear on ${mkt} directly.`;
}

// ───────────────────────────────────────────── text helpers ─────────────────────────────────────────────

const OPEN = '([{', CLOSE = ')]}';
const unclosed = str => { let n = 0; for (const ch of str) { if (OPEN.includes(ch)) n++; else if (CLOSE.includes(ch)) n = Math.max(0, n - 1); } return n; };
/**
 * Trim text to at most `max` characters, ending on a sentence, then a clause, then a word, never inside a bracket,
 * never mid-number and never splitting a surrogate pair. Returns the text unchanged if it already fits. An ellipsis
 * is added only when text was cut and the result does not already end a sentence.
 */
export function fitText(text, max = 160) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = max; if (/[\uD800-\uDBFF]/.test(s[cut - 1] ?? '')) cut--;
  const floor = Math.floor(max * 0.4);
  const boundary = re => { let best = -1, m; const g = new RegExp(re.source, 'g'); while ((m = g.exec(s))) { const end = m.index + m[0].length; if (end > cut) break; if (m.index >= floor) best = end; if (!m[0].length) g.lastIndex++; } return best; };
  let at = boundary(/[.!?](?=\s)/);                                   // a sentence end (a decimal point is never followed by a space)
  if (at < 0) at = boundary(/[;:—–](?=\s)|,(?=\s)/);                  // a clause end
  if (at < 0) { const sp = s.lastIndexOf(' ', cut); at = sp >= floor ? sp : -1; }   // a word end
  let out;
  if (at < 0) out = s.slice(0, cut).replace(/[\w.,%+−~-]*$/, '');   // no boundary at all: drop the partial token
  else out = s.slice(0, at);
  out = out.replace(/[\s,;:—–-]+$/, '');
  for (let guard = 0; guard < 8 && unclosed(out); guard++) {           // never end inside a bracket
    const i = Math.max(out.lastIndexOf('('), out.lastIndexOf('['), out.lastIndexOf('{'));
    if (i <= 0) break;
    out = out.slice(0, i).replace(/[\s,;:—–-]+$/, '');
  }
  return /[.!?]$/.test(out) ? out : `${out}…`;
}

/** Split into sentences without breaking on decimals, versions or "U.S.": a stop must be followed by space and a capital or bracket. */
export function sentences(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim(); if (!s) return [];
  const out = []; let start = 0, m; const re = /[.!?]\s+(?=[A-Z(["'])/g;
  while ((m = re.exec(s))) { out.push(s.slice(start, m.index + 1)); start = m.index + m[0].length; }
  out.push(s.slice(start));
  return out.filter(Boolean);
}

/**
 * A stored claim -> { lead, rest }: the first sentence (or, if that runs long, up to its first clause break after ~60
 * characters) leads; the remainder follows in a quieter weight. The text is never shortened.
 */
export function splitLead(claim, { long = 200 } = {}) {
  const ss = sentences(claim); if (!ss.length) return { lead: '', rest: '' };
  let lead = ss[0], rest = ss.slice(1).join(' ');
  if (lead.length > long) {
    const m = /(;|\s—\s|,\s(?:so|with|while|but|which)\s)/g; let k, at = -1;
    while ((k = m.exec(lead))) { if (k.index >= 60 && k.index <= long) { at = k.index + (k[0].startsWith(';') ? 1 : 0); break; } }
    if (at > 0) { rest = `${lead.slice(at).replace(/^[\s;,—-]+/, '')}${rest ? ` ${rest}` : ''}`; lead = lead.slice(0, at).replace(/[\s,;—-]+$/, ''); if (!/[.!?]$/.test(lead)) lead += '.'; rest = rest.charAt(0).toUpperCase() + rest.slice(1); }
  }
  return { lead, rest };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-28" -> "28 Oct" (this year) or "28 Oct 2025". */
export function niceDate(iso, refYear) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return String(iso);
  const mo = Number(m[2]); if (mo < 1 || mo > 12) return String(iso);
  return `${Number(m[3])} ${MON[mo - 1]}${Number(m[1]) === refYear ? '' : ` ${m[1]}`}`;
}
const FIG = /(^|[^\w.])([+−-]?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:bps?|pp|%|σ|×|x\b|(?:st|nd|rd|th) percentile))?)/g;
const DATE = /\d{4}-\d{2}-\d{2}/g;
const isKey = f => /(bps?|pp|%|σ|×|x|percentile)$/.test(f) || f.includes('.') || (/^[+−-]?\d[\d,]{3,}/.test(f) && !/^(19|20)\d\d$/.test(f.replace(/^[+−-]/, '')));
/**
 * HTML for a stored sentence: dates written plainly, the figures that matter (units, decimals, levels) picked out in
 * <b class="hd-n">, everything else plain. Every piece is escaped by `esc` first; it never builds markup from the text.
 */
export function emphasise(text, esc, { refYear = new Date().getUTCFullYear() } = {}) {
  const s = String(text ?? ''); let out = '', last = 0;
  const dates = [...s.matchAll(DATE)];
  const seg = str => {
    let o = '', i = 0, m; FIG.lastIndex = 0;
    while ((m = FIG.exec(str))) {
      const pre = m[1], fig = m[2], start = m.index + pre.length;
      o += esc(str.slice(i, start));
      o += isKey(fig) ? `<b class="hd-n">${esc(fig)}</b>` : esc(fig);
      i = start + fig.length;
    }
    return o + esc(str.slice(i));
  };
  for (const d of dates) { out += seg(s.slice(last, d.index)) + `<span class="hd-d">${esc(niceDate(d[0], refYear))}</span>`; last = d.index + d[0].length; }
  return out + seg(s.slice(last));
}
