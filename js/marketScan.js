/**
 * The market scan — sixty tiles are unreadable, so the page reads them for you.
 *
 * The job: look across every market this desk carries, decide which handful are
 * genuinely unusual RIGHT NOW, rank them, and say what each one means. That is
 * the difference between a dashboard and a scanner — a dashboard shows you
 * everything equally, a scanner tells you where to look first.
 *
 * WHAT COUNTS AS UNUSUAL. Not "it moved". A market moving is the base case.
 * Unusual is a move that is large against ITS OWN history: a z-score of the
 * 20-session change against the last three years of 20-session changes. That
 * makes a 40bp move in the 2-year and a 6% move in gold comparable, which is
 * the only way to rank a board that mixes rates, spreads and prices.
 *
 * WHAT IT IS NOT. The scan says "this is rare", never "this is about to
 * happen". Rarity is a measurement; a forecast is a claim, and the claims on
 * this desk live in the evidence book with their intervals. Every finding here
 * carries its own `means` and `notMeans` for that reason.
 *
 * Pure: no fetch, no DOM. Tested in js/marketScan.test.mjs.
 */

/** The board. `kind` decides the unit and how a move is expressed. */
export const BOARD = [
  // rates
  { key: 'us2y',    label: 'US 2-year',        group: 'Rates', kind: 'rate', what: 'The market’s vote on what the Fed does over the next year or two.' },
  { key: 'us10y',   label: 'US 10-year',       group: 'Rates', kind: 'rate', what: 'The world’s discount rate: real yield plus expected inflation.' },
  { key: 'us30y',   label: 'US 30-year',       group: 'Rates', kind: 'rate', what: 'The vote on inflation credibility and how much the government must borrow.' },
  { key: 'tips',    label: 'Real 10-year',     group: 'Rates', kind: 'rate', what: 'The true cost of money once inflation is taken out. The most connected number on the board.' },
  { key: 'bei',     label: 'Breakevens',       group: 'Rates', kind: 'rate', what: 'What the bond market expects inflation to average over ten years.' },
  { key: 'curve',   label: '2s10s curve',      group: 'Rates', kind: 'gap', what: 'Ten-year minus two-year. Steepening = the long end leading; flattening = the Fed leading.', derived: (v) => (v.us10y != null && v.us2y != null) ? v.us10y - v.us2y : null },
  { key: 'giltgap', label: 'Gilt − UST',  group: 'Rates', kind: 'gap',  what: 'UK yields against US. Who is repricing faster — the pound’s rate leg.' },
  { key: 'bundgap', label: 'Bund − UST',  group: 'Rates', kind: 'gap',  what: 'German against US. The euro’s rate leg, and the tightest of the three.' },
  { key: 'jgbgap',  label: 'JGB − UST',   group: 'Rates', kind: 'gap',  what: 'Japanese against US. The carry-unwind channel and the yen’s rate leg.' },
  // credit and volatility
  { key: 'hy',      label: 'High-yield OAS',   group: 'Credit & fear', kind: 'rate', what: 'What junk borrowers pay over Treasuries. Lenders vote here before equity does.' },
  { key: 'vix',     label: 'VIX',              group: 'Credit & fear', kind: 'level', what: 'The price of thirty days of insurance on the S&P.' },
  // the dollar and FX
  { key: 'dxy',     label: 'Broad dollar',     group: 'FX', kind: 'price', what: 'The price of the unit everything else is quoted in.' },
  { key: 'eurusd',  label: 'EUR/USD',          group: 'FX', kind: 'price', what: 'The biggest pair — mostly the dollar, partly the Bund gap.' },
  { key: 'gbpusd',  label: 'GBP/USD',          group: 'FX', kind: 'price', what: 'The pound. Its rate leg is the weakest of the three on this board.' },
  { key: 'usdjpy',  label: 'USD/JPY',          group: 'FX', kind: 'price', what: 'The haven pair and the carry trade’s home.' },
  { key: 'audusd',  label: 'AUD/USD',          group: 'FX', kind: 'price', what: 'The China-and-metals proxy.' },
  { key: 'usdcad',  label: 'USD/CAD',          group: 'FX', kind: 'price', what: 'Canada exports oil, so this one has a commodity leg.' },
  // equities
  { key: 'spx',     label: 'S&P 500',          group: 'Equities', kind: 'price', what: 'The broad benchmark — less duration than the Nasdaq, so slower to answer real yields.' },
  { key: 'nq',      label: 'Nasdaq',           group: 'Equities', kind: 'price', what: 'Long-duration equity: its earnings sit far out, so a real-yield move discounts them hardest.' },
  // commodities
  { key: 'oil',     label: 'Crude (WTI)',      group: 'Commodities', kind: 'price', what: 'The first domino in the inflation chain.' },
  { key: 'crack',   label: 'Crack spread',     group: 'Commodities', kind: 'usd', what: 'A refiner’s margin. Says whether the pump price follows crude down.' },
  { key: 'gold',    label: 'Gold',             group: 'Commodities', kind: 'price', what: 'Four different trades wearing one name — rates, dollar, reserve, fear.' },
  { key: 'copper',  label: 'Copper',           group: 'Commodities', kind: 'price', what: 'The growth commodity: up with global demand, down with a scare.' },
  { key: 'btc',     label: 'Bitcoin',          group: 'Crypto', kind: 'price', what: 'High-beta risk most days; the anti-dollar trade on the days the dollar story is about credibility.' },
];

const WINDOW = 20, HIST = 750;                      // 20 sessions, ranked against ~3 years

const val = (b, key, i) => b?.series?.[key]?.[i] ?? null;
function change(b, key, i, kind, derived) {
  const get = j => { if (!derived) return val(b, key, j); const v = {}; for (const k of Object.keys(b.series ?? {})) v[k] = val(b, k, j); return derived(v); };
  const now = get(i), then = get(i - WINDOW);
  if (now == null || then == null) return null;
  if (kind === 'price') return then !== 0 ? (now / then - 1) * 100 : null;
  if (kind === 'rate' || kind === 'gap') return (now - then) * 100;   // percent -> bp, once
  return now - then;                                 // level, usd
}

/** z of the latest 20-session change against its own history of 20-session changes. */
export function scoreSeries(bundle, spec, i) {
  const hist = [];
  for (let k = Math.max(WINDOW, i - HIST); k <= i; k++) { const c = change(bundle, spec.key, k, spec.kind, spec.derived); if (c != null) hist.push(c); }
  if (hist.length < 60) return null;
  const now = hist[hist.length - 1];
  const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length);
  if (!(sd > 0)) return null;
  const sorted = hist.slice().sort((a, b) => a - b);
  const pct = sorted.filter(v => v <= now).length / sorted.length;
  // FRED skips US holidays and OANDA does not, so the newest date can be blank
  // for a rates row -- walk back to the last real print rather than showing a dash
  const lastAt = j => { if (!spec.derived) return val(bundle, spec.key, j); const v = {}; for (const k of Object.keys(bundle.series ?? {})) v[k] = val(bundle, k, j); return spec.derived(v); };
  let last = null; for (let j = i; j > i - 10 && j >= 0; j--) { const v = lastAt(j); if (v != null) { last = v; break; } }
  return { key: spec.key, label: spec.label, group: spec.group, kind: spec.kind, what: spec.what,
           last, change: now, z: (now - mean) / sd, pct, n: hist.length };
}

/** The whole board, scored. */
export function scanBoard(bundle, i = (bundle?.dates?.length ?? 1) - 1) {
  return BOARD.map(s => scoreSeries(bundle, s, i)).filter(Boolean);
}

/**
 * What the reader should look at first, and what each one means. `links` are
 * today's chain verdicts, so a finding can point at a broken mechanism rather
 * than just a big number.
 */
export function findings(board = [], { links = [], limit = 3 } = {}) {
  const by = k => board.find(b => b.key === k) ?? null;
  const out = [];
  const rare = z => Math.abs(z) >= 2 ? 'rare' : Math.abs(z) >= 1.5 ? 'unusual' : null;

  // 1. the single most extreme series on the board
  for (const b of board.slice().sort((x, y) => Math.abs(y.z) - Math.abs(x.z))) {
    const word = rare(b.z); if (!word) break;
    out.push({ kind: 'extreme', key: b.key, rank: Math.abs(b.z) + 2, title: `${b.label} is ${word}`,
      seen: `${b.label} has moved ${fmtChange(b)} over twenty sessions — ${b.z > 0 ? 'higher' : 'lower'} than ${Math.round((b.z > 0 ? b.pct : 1 - b.pct) * 100)}% of twenty-session moves in the last three years (z ${b.z >= 0 ? '+' : ''}${b.z.toFixed(1)}).`,
      means: `${b.what} A move this size in ${b.label.toLowerCase()} is the kind that reprices the things attached to it, so it is worth asking what else on the board has followed and what has not — that is where the story usually is.`,
      notMeans: 'Rare is a measurement, not a forecast. A move being unusual says nothing about whether it continues, reverses or stalls — the only forward claims on this desk live in the evidence book, each with its interval.', z: b.z });
    break;
  }
  // 2. credit and equity disagreeing — the classic tell
  { const v = by('vix'), h = by('hy'), s = by('spx');
    if (v && h && s) {
      if (h.z >= 1 && Math.abs(s.z) < 1) out.push({ kind: 'credit-lead', key: 'hy', rank: 3 + h.z, title: 'Credit is moving while equities are not',
        seen: `High-yield spreads ${fmtChange(h)} (z ${h.z.toFixed(1)}) while the S&P is ${fmtChange(s)} (z ${s.z.toFixed(1)}).`,
        means: 'Lenders repricing risk without equity holders joining is the order these two usually move in. Credit is the slower, meaner judge: it is pricing the probability of not being repaid, which is a harder question than what a share is worth.',
        notMeans: 'It is not a signal that equities must follow. This desk has no tested credit-leads-equity effect — it is a state worth knowing, and a reason to be sceptical of a calm-looking index.' });
      if (v.z >= 1.5 && h.z < 0.5) out.push({ kind: 'fear-no-credit', key: 'vix', rank: 2.5 + v.z, title: 'Fear is up and credit does not care',
        seen: `The VIX ${fmtChange(v)} (z ${v.z.toFixed(1)}) with high-yield spreads ${fmtChange(h)} (z ${h.z.toFixed(1)}).`,
        means: 'An equity scare that credit ignores is usually about equity — positioning, hedging demand, an expiry — rather than about the economy.',
        notMeans: 'It does not mean the fear is fake or that it must unwind. It means the two markets are pricing different things, which is information about WHAT the move is, not about where it goes.' }); } }
  // 3. a broken link on the chain, which is a mechanism failing rather than a big number
  { const broken = (links ?? []).filter(l => l.verdict === 'broken');
    if (broken.length) {
      const ends = {}; for (const l of broken) { ends[l.a?.label] = (ends[l.a?.label] ?? 0) + 1; ends[l.b?.label] = (ends[l.b?.label] ?? 0) + 1; }
      const common = Object.entries(ends).sort((a, b) => b[1] - a[1])[0];
      out.push({ kind: 'broken', key: 'chain', rank: 2 + broken.length,
        title: broken.length > 1 ? `${broken.length} textbook links are broken` : 'A textbook link is broken',
        seen: broken.slice(0, 3).map(l => `${l.a?.label} ${l.a?.text} but ${l.b?.label} ${l.b?.text}`).join('; ') + '.',
        means: broken.length > 1 && common && common[1] > 1
          ? `${common[0]} is an end of ${common[1]} of them, which usually means that market — not the several on the other side — is the one behaving unusually. Something not on this board is driving it.`
          : 'The usual driver is not what is moving the second market. That is the story worth going to find.',
        notMeans: 'It does not mean the link will resolve. Tested here (S5): when a link breaks there is no tendency for either leg to be the one that corrects.' }); } }
  // 4. the commodity complex disagreeing with itself
  { const o = by('oil'), c = by('crack'), b = by('bei');
    if (o && c && o.change <= -5 && c.z >= 1) out.push({ kind: 'crack', key: 'crack', rank: 2 + c.z, title: 'Crude is falling and the refining margin is not',
      seen: `Crude ${fmtChange(o)} while the crack spread ${fmtChange(c)} (z ${c.z.toFixed(1)})${b ? `, with breakevens ${fmtChange(b)}` : ''}.`,
      means: 'Crude and fuel are two markets. A wide crack means the pump price stays up even as crude falls — and this desk measured that inflation pricing does not take the relief either (+15bp of breakevens against the case where both fall).',
      notMeans: 'It is not a range fact and not a direction call on crude — both tested, both null. It changes what you expect from the next inflation print, not what you trade.' }); }
  // 5. nothing unusual is itself the finding, and the common one
  if (!out.length) out.push({ kind: 'quiet', key: null, rank: 0, title: 'Nothing on the board is unusual',
    seen: `The largest twenty-session move is ${board.length ? board.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0].label : '—'}, and even that is inside its normal range.`,
    means: 'This is the correct read on most days, and it is worth saying out loud: the base case is that nothing macro is happening. A quiet board is when stories get invented.',
    notMeans: 'It does not mean the session will be small. Intraday range comes from the calendar and volatility clustering, not from the macro board being interesting.' });

  return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
}

/** Format a scored row's move in its own unit. */
export function fmtChange(b) {
  if (!b || b.change == null) return '—';
  const v = b.change, s = v > 0 ? '+' : '';
  if (b.kind === 'price') return `${s}${v.toFixed(1)}%`;
  if (b.kind === 'usd') return `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(0)}`;
  return `${s}${Math.round(v)}bp`;
}
/** Format a scored row's level in its own unit. */
export function fmtLevel(b) {
  if (!b || b.last == null) return '—';
  if (b.kind === 'rate') return `${b.last.toFixed(2)}%`;
  if (b.kind === 'gap') return `${Math.round(b.last * 100)}bp`;      // carried in percent
  if (b.kind === 'usd') return `$${b.last.toFixed(0)}`;
  if (b.kind === 'level') return b.last.toFixed(1);
  return b.last >= 1000 ? b.last.toFixed(0) : b.last.toFixed(b.last < 10 ? 4 : 2);
}
