/**
 * Fiscal events: the UK Budget / Spring Forecast and the US Treasury's
 * Quarterly Refunding, captured and read the way the central-bank engines read
 * policy statements.
 *
 * A fiscal event moves a market through two channels a central-bank statement
 * does not: SUPPLY (how much government debt has to be sold, and at which
 * maturities) and CREDIBILITY (whether the fiscal rules are met, by how much
 * headroom). Gilts in Sept 2022 and the Treasury refunding of Nov 2023 are the
 * reference cases. So the read here is looser/tighter and more/less supply,
 * not hawkish/dovish, and the hard numbers (gilt sales, financing requirement,
 * headroom, US offering size, borrowing estimate) are pulled out of the text
 * deterministically so they never depend on the model.
 *
 * Pure: the calendar, document discovery from fetched HTML/JSON, number
 * extraction and the prompt are here and unit tested; server.js fetches,
 * keeps the text in KV (fiscal_raw_<id>_<kind>), calls the model and serves
 * /api/fiscal/*. Descriptive context only, like the central-bank tone
 * (CB_SENTIMENT_PRICE_TEST was null): it says what was announced, not which
 * way to trade.
 *
 * SOURCES (all free, no key, checked live 2026-10-28):
 *   gov.uk content API  /api/content/<path>: the Red Book publication lists an
 *     HTML attachment whose own content item carries the full text in
 *     details.body; the Budget speech is a `speech` item, body inline.
 *   obr.uk/efo/<slug>/: the whole Economic and fiscal outlook as HTML.
 *     obr.uk/efo/ redirects to the latest one (used when the slug is unknown).
 *   home.treasury.gov ".../most-recent-quarterly-refunding-documents": links
 *     (unquoted hrefs) to the Financing Estimates (Monday 15:00 ET) and the
 *     Policy Statement (Wednesday 08:30 ET) press releases.
 *   dmo.gov.uk sits behind a bot shield (perfdrive): the gilt remit revision is
 *     taken from the Red Book's Financing paragraph instead, which carries it.
 */

// ms: the moment the event starts (UK: the Chancellor stands up, 12:30 UK;
// US: the Policy Statement, 08:30 ET). Documents land after it.
export const FISCAL_EVENTS = [
  { id: 'gb-budget-2025-11-26', country: 'GB', ccy: 'GBP', kind: 'budget', title: 'Budget 2025', date: '2025-11-26', ms: Date.UTC(2025, 10, 26, 12, 30),
    docs: [{ kind: 'redbook', govuk: '/government/publications/budget-2025-document', collection: '/government/collections/budget-2025' },
      { kind: 'speech', govuk: '/government/speeches/budget-2025-speech' },
      { kind: 'obr', obr: 'economic-and-fiscal-outlook-november-2025' }] },
  { id: 'gb-spring-2026-03-03', country: 'GB', ccy: 'GBP', kind: 'forecast', title: 'Spring Forecast 2026', date: '2026-03-03', ms: Date.UTC(2026, 2, 3, 12, 30),
    docs: [{ kind: 'speech', govuk: '/government/speeches/spring-forecast-2026-speech' },
      { kind: 'obr', obr: 'economic-and-fiscal-outlook-march-2026' }] },
  { id: 'gb-budget-2026-10-28', country: 'GB', ccy: 'GBP', kind: 'budget', title: 'Budget 2026', date: '2026-10-28', ms: Date.UTC(2026, 9, 28, 12, 30),
    docs: [{ kind: 'redbook', govuk: '/government/publications/budget-2026-document', collection: '/government/collections/budget-2026' },
      { kind: 'speech', govuk: '/government/speeches/budget-2026-speech' },
      { kind: 'obr', obr: 'economic-and-fiscal-outlook-october-2026', obrLatestOnOrAfter: '2026-10-28' }] },
  { id: 'us-refunding-2026-08-05', country: 'US', ccy: 'USD', kind: 'refunding', title: 'Quarterly Refunding, Aug 2026', date: '2026-08-05', ms: Date.UTC(2026, 7, 5, 12, 30),
    quarter: '2026 - 3rd Quarter', docs: [{ kind: 'estimates' }, { kind: 'policy' }] },
  { id: 'us-refunding-2026-11-04', country: 'US', ccy: 'USD', kind: 'refunding', title: 'Quarterly Refunding, Nov 2026', date: '2026-11-04', ms: Date.UTC(2026, 10, 4, 13, 30),
    quarter: '2026 - 4th Quarter', docs: [{ kind: 'estimates' }, { kind: 'policy' }] },
];

// The documents the read waits for; anything else is added when it lands.
// A Budget is read as soon as the Red Book is in and re-read when the OBR outlook (and the speech) land.
export const CORE_DOCS = { budget: ['redbook'], forecast: ['obr'], refunding: ['policy'] };
// Give up waiting for a missing core document this long after the event and read what is there.
export const CORE_WAIT_MS = 6 * 3600_000;

export const DOC_LABEL = {
  redbook: 'HM Treasury Budget document (the Red Book)', speech: 'the Chancellor\'s statement to Parliament',
  obr: 'Office for Budget Responsibility Economic and fiscal outlook', estimates: 'US Treasury financing estimates (privately-held net marketable borrowing)',
  policy: 'US Treasury Quarterly Refunding policy statement',
};

export const previousEvent = (id, events = FISCAL_EVENTS) => {
  const ev = events.find(e => e.id === id); if (!ev) return null;
  return events.filter(e => e.country === ev.country && e.ms < ev.ms).sort((a, b) => b.ms - a.ms)[0] ?? null;
};

// ── text ─────────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/[‐-‒ ]/g, c => (c === ' ' ? ' ' : '-'))
    .replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}
// The OBR page and the Red Book are whole books (450k-580k characters). The
// prompt gets the executive summary onward, clipped; the number extraction
// below runs on the full text.
export function fromSummary(text, max) {
  const t = String(text ?? ''); const i = t.search(/\bExecutive summary\b/i);
  // the first hit is usually the contents list: take the LAST "Executive summary" in the first fifth
  let at = i; if (i >= 0) { const re = /\bExecutive summary\b/gi; let m; while ((m = re.exec(t)) && m.index < t.length / 5) at = m.index; }
  const s = at >= 0 ? t.slice(at) : t;
  return s.length > max ? s.slice(0, max) + '\n[...clipped...]' : s;
}

// ── discovery ────────────────────────────────────────────────────────────────
// gov.uk publication content item -> the path of its HTML attachment (the full text), else the first PDF url.
export function govukAttachment(item) {
  const atts = item?.details?.attachments ?? [];
  const html = atts.find(a => !a.content_type || /html/i.test(a.content_type));
  if (html?.url) return { type: 'html', path: html.url.replace(/^https?:\/\/www\.gov\.uk/, '') };
  const pdf = atts.find(a => /pdf/i.test(a.content_type ?? ''));
  return pdf?.url ? { type: 'pdf', url: pdf.url } : null;
}
// gov.uk collection -> the Red Book publication path ("Budget 2026 document", or just "Budget 2026").
export function govukRedBookFromCollection(item, year) {
  const docs = item?.links?.documents ?? [];
  const re = new RegExp(`^Budget ${year}( document)?$`, 'i');
  return docs.find(d => re.test(String(d.title ?? '').trim()))?.base_path ?? null;
}
// obr.uk/efo/ (latest) HTML -> canonical slug and published date
export function obrPageMeta(html) {
  const s = String(html ?? '');
  const slug = s.match(/<link rel="canonical" href="https:\/\/obr\.uk\/efo\/([a-z0-9-]+)\/?"/i)?.[1] ?? null;
  const published = s.match(/"datePublished":"(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return { slug, published };
}
export function obrMainText(html) {
  const s = String(html ?? ''); const m = s.match(/<main[\s\S]*?<\/main>/i);
  return htmlToText(m ? m[0] : s);
}
// Treasury refunding page -> { estimates, policy } press-release urls for the quarter
export function treasuryRefundingLinks(html, quarter) {
  const out = {}; const s = String(html ?? '');
  const re = /<a [^>]*href=["']?([^\s"'>]+)["']?[^>]*>([^<]+)<\/a>/gi; let m;
  const q = String(quarter).replace(/\s+/g, ' ').trim();
  while ((m = re.exec(s))) {
    const label = m[2].replace(/[​\s]+/g, ' ').trim(); const href = m[1].startsWith('http') ? m[1] : `https://home.treasury.gov${m[1]}`;
    if (label === `Policy Statement: ${q}`) out.policy = href;
    else if (label === `Financing Estimates: ${q}`) out.estimates = href;
  }
  return out;
}
export function treasuryPressText(html) {
  const s = String(html ?? ''); const m = s.match(/field--name-field-news-body[^>]*>([\s\S]*?)(<\/article>|<footer)/i);
  const t = htmlToText(m ? m[1] : s); const i = t.search(/WASHINGTON/);
  return i >= 0 ? t.slice(i) : t;
}

// ── numbers ──────────────────────────────────────────────────────────────────
const bn = s => (s == null ? null : +String(s).replace(/,/g, ''));
const signed = (word, v) => (v == null ? null : /decrease|reduction|fall|lower|down/i.test(word ?? '') ? -v : v);
// Red Book: "The DMO net financing requirement for 2025-26 is forecast to be £314.7 billion ...
// This will be financed through £303.7 billion of gilt sales (an increase of £4.6 billion), as well as £11 billion from the sale of Treasury bills"
export function extractRedBook(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  const nfr = t.match(/net financing requirement for (\d{4}-\d{2}) is (?:now )?forecast to be £([\d.,]+) billion/i);
  const gilts = t.match(/financed through £([\d.,]+) billion of gilt sales(?: \((?:an? )?(increase|decrease|reduction|rise|fall) of £([\d.,]+) billion\)| \((unchanged)\))?/i);
  const bills = t.match(/£([\d.,]+) billion from the sale of Treasury bills/i);
  const remit = t.match(/remit for the DMO has been (?:updated|revised)[^.]*?(increasing|decreasing|reducing|rising|falling) by £([\d.,]+) billion/i)
    ?? t.match(/net financing requirement for \d{4}-\d{2} is (?:now )?forecast to be £[\d.,]+ billion, (?:an? )?(increase|decrease|reduction|rise|fall) of £([\d.,]+) billion/i);
  // Budget 2026 wording: "The stability rule is met by £15 billion in 2029-30" -- the Treasury's own statement of
  // headroom, used until the OBR outlook (the independent figure) is captured
  const rule = t.match(/(stability rule|fiscal mandate) is met by £([\d.,]+) billion in (\d{4}-\d{2})/i);
  return {
    year: nfr?.[1] ?? null, nfr: bn(nfr?.[2]), giltSales: bn(gilts?.[1]),
    giltSalesChange: gilts ? (gilts[4] ? 0 : signed(gilts[2], bn(gilts[3]))) : null,
    bills: bn(bills?.[1]), remitChange: remit ? signed(remit[1], bn(remit[2])) : null,
    ...(rule ? { headroom: bn(rule[2]), headroomSource: 'Treasury', headroomRule: `${rule[1]} in ${rule[3]}` } : {}),
  };
}
// OBR: "... current budget to be in balance in 2029-30 is met by a margin of £22 billion (0.6 per cent of GDP), which is £12 billion (0.3 per cent of GDP) more than in March."
export function extractObr(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  const h = t.match(/met by a margin of £([\d.,]+) billion(?: \(([\d.]+) per cent of GDP\))?(?:, which is £([\d.,]+) billion(?: \([\d.]+ per cent of GDP\))? (more|less|larger|smaller|higher|lower) than (?:in )?([A-Z][a-z]+))?/);
  const rule = h ? t.slice(Math.max(0, h.index - 160), h.index).match(/([^.]*?)$/)?.[1]?.trim() ?? null : null;
  return {
    headroom: bn(h?.[1]), headroomPctGdp: h?.[2] ? +h[2] : null,
    headroomChange: h?.[3] ? (/less|smaller|lower/.test(h[4]) ? -bn(h[3]) : bn(h[3])) : null, headroomVs: h?.[5] ?? null,
    headroomRule: rule ? rule.slice(-160) : null,
  };
}
// Treasury policy statement + financing estimates
export function extractRefunding(policyText, estimatesText) {
  const p = String(policyText ?? '').replace(/\s+/g, ' '), e = String(estimatesText ?? '').replace(/\s+/g, ' ');
  const offer = p.match(/offering \$([\d.,]+) billion of Treasury securities to refund approximately \$([\d.,]+) billion/i);
  const cash = p.match(/raise new cash from private investors of approximately \$([\d.,]+) billion/i);
  const keep = /maintaining nominal coupon and FRN auction sizes for at least the next several quarters/i.test(p);
  const raise = /(?:increase|increasing) (?:nominal coupon|coupon) (?:and FRN )?auction sizes/i.test(p) && !keep;
  const est = e.match(/quarter, Treasury expects to borrow \$([\d.,]+) billion in privately-held net marketable debt, assuming an end-of-(\w+) cash balance of \$([\d.,]+) billion\. The borrowing estimate is \$([\d.,]+) billion (higher|lower) than announced/i);
  const next = e.match(/quarter, Treasury expects to borrow \$[\d.,]+ billion[^.]*\.[\s\S]*?During the ([A-Za-z]+–[A-Za-z]+ \d{4}) quarter, Treasury expects to borrow \$([\d.,]+) billion/i);
  const buyback = p.match(/buyback[^.]{0,200}\./i)?.[0] ?? null;
  return {
    offering: bn(offer?.[1]), refunding: bn(offer?.[2]), newCash: bn(cash?.[1]),
    guidance: keep ? 'maintain coupon sizes for at least the next several quarters' : raise ? 'coupon sizes to increase' : null, guidanceKept: keep,
    borrowing: bn(est?.[1]), cashBalance: bn(est?.[3]), borrowingVsPrior: est ? (est[5] === 'lower' ? -bn(est[4]) : bn(est[4])) : null,
    nextQuarter: next?.[1] ?? null, nextBorrowing: bn(next?.[2]), buyback,
  };
}
export function extractNumbers(ev, docs) {
  if (ev.kind === 'refunding') return extractRefunding(docs.policy?.text, docs.estimates?.text);
  // the OBR's figures win where it has one; a null never overwrites the Red Book's number
  const out = docs.redbook ? extractRedBook(docs.redbook.text) : {};
  const o = docs.obr ? extractObr(docs.obr.text) : {};
  if (o.headroom != null) Object.assign(out, o, { headroomSource: 'OBR' });
  return out;
}
// The numbers as rows for the page and the prompt: label, value, the change vs before.
export function numberRows(ev, n) {
  if (!n) return [];
  const g = (v, d = 1) => (v == null ? null : `£${(+v).toFixed(d).replace(/\.0$/, '')}bn`), u = v => (v == null ? null : `$${v}bn`);
  const ch = (v, f) => (v == null ? null : v === 0 ? 'unchanged' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))}`);
  const rows = ev.kind === 'refunding' ? [
    ['Refunding offering', u(n.offering), n.refunding != null ? `refunds ${u(n.refunding)}` : null],
    ['New cash raised', u(n.newCash), null],
    ['Coupon-size guidance', n.guidance, n.guidanceKept ? 'kept' : n.guidance ? 'CHANGED' : null],
    ['Borrowing this quarter', u(n.borrowing), n.borrowingVsPrior != null ? `${ch(n.borrowingVsPrior, u)} vs the last estimate` : null],
    [n.nextQuarter ? `Borrowing ${n.nextQuarter}` : 'Borrowing next quarter', u(n.nextBorrowing), null],
    ['Cash balance assumed', u(n.cashBalance), null],
  ] : [
    [`Headroom against the main fiscal rule${n.headroomSource === 'Treasury' ? ' (Treasury figure)' : ''}`, g(n.headroom), n.headroomChange != null ? `${ch(n.headroomChange, g)} vs ${n.headroomVs ?? 'last forecast'}` : null],
    [`Gilt sales${n.year ? ` ${n.year}` : ''}`, g(n.giltSales), n.giltSalesChange != null ? ch(n.giltSalesChange, g) : null],
    ['DMO net financing requirement', g(n.nfr), n.remitChange != null ? ch(n.remitChange, g) : null],
    ['Treasury bills (debt management)', g(n.bills), null],
  ];
  return rows.filter(r => r[1] != null).map(([label, value, change]) => ({ label, value, change }));
}

// ── the read ─────────────────────────────────────────────────────────────────
export const PROMPT_DOC_CHARS = { redbook: 30_000, obr: 30_000, speech: 24_000, policy: 12_000, estimates: 8_000 };
export function buildFiscalPrompt(ev, docs, numbers, prev) {
  const isUS = ev.kind === 'refunding';
  const assets = isUS ? 'US Treasuries|USD|S&P 500|Nasdaq|Gold' : 'Gilts|GBP|FTSE 100|FTSE 250|BoE path';
  const rows = numberRows(ev, numbers);
  const prevRows = prev ? numberRows(prev.ev, prev.numbers) : [];
  const docBlocks = Object.entries(docs).map(([k, d]) => `=== ${DOC_LABEL[k] ?? k} (${d.url}) ===\n${k === 'obr' || k === 'redbook' ? fromSummary(d.text, PROMPT_DOC_CHARS[k]) : String(d.text).slice(0, PROMPT_DOC_CHARS[k] ?? 12_000)}`).join('\n\n');
  const guidance = isUS
    ? `READING TECHNIQUE: the refunding moves Treasuries through SUPPLY. The guidance sentence on coupon auction sizes ("maintaining ... for at least the next several quarters") is the single most-watched line: dropping or softening it signals bigger coupon auctions (more duration supply, a term-premium risk). Also read the mix between bills and coupons, the buyback programme, and the borrowing estimate against the previous one.`
    : `READING TECHNIQUE: a UK fiscal event moves gilts and sterling through SUPPLY (the DMO's gilt sales and their maturity mix) and CREDIBILITY (the headroom against the fiscal rules as judged by the OBR, and whether the measures are back-loaded). Tax rises now with spending later reads looser than it looks; a bigger headroom built on promises reads less credible. The Bank of England reads the OBR's growth and inflation forecasts, so note anything that shifts the rate path.`;
  return `You are reading the ${ev.title} (${ev.date}) for an FX/macro trading desk. ${guidance}

NEVER name a specific individual anywhere in your output — refer to roles only (the Chancellor, the Treasury, the OBR, the Secretary).
Ground every claim in the documents below. Do NOT invent numbers, measures or quotes. If a document is missing, say what could not be read.

=== HARD NUMBERS (extracted mechanically from the documents; use these, do not recompute) ===
${rows.length ? rows.map(r => `${r.label}: ${r.value}${r.change ? ` (${r.change})` : ''}`).join('\n') : '(none extracted)'}
${prev ? `\n=== THE PREVIOUS EVENT: ${prev.ev.title} (${prev.ev.date}) ===\n${prevRows.length ? prevRows.map(r => `${r.label}: ${r.value}`).join('\n') : '(no numbers captured)'}${prev.headline ? `\nIts read: ${prev.headline}` : ''}\n` : ''}
${docBlocks}

Respond with ONLY valid JSON, no markdown:
{"headline":"one plain-English sentence, the so-what first","stance":"LOOSER|TIGHTER|NEUTRAL|MIXED (fiscal stance vs the previous plans: looser = more borrowing/spending or tax cuts)","stanceScore":-1.0 to 1.0 (negative = looser, positive = tighter),"supply":"MORE|LESS|SAME (government bond supply vs the previous plan)","credibility":"STRONGER|WEAKER|UNCHANGED (fiscal-rule headroom and how believable it is)","confidence":"LOW|MEDIUM|HIGH (how confident YOU are in this read)","summary":"2-3 plain-spoken sentences","whatChanged":"1-2 sentences against the previous event, grounded in the numbers above","keyMeasures":[{"measure":"short name","note":"one line: what it does and when"}] (max 6, most market-relevant first),"watch":"one sentence: what the market will test next (e.g. the next gilt auction, a ratings review, the BoE meeting)","keyQuotes":[{"quote":"verbatim excerpt under 30 words","why":"why it matters","asset":"${assets}","lean":"BULLISH|BEARISH|NEUTRAL"}] (max 4),"byAsset":[{"asset":"${assets}","lean":"BULLISH|BEARISH|NEUTRAL","note":"one line"}]}`;
}

// What is still missing, and whether to read now.
export function readiness(ev, haveKinds, now = Date.now()) {
  const core = CORE_DOCS[ev.kind] ?? [];
  const missing = core.filter(k => !haveKinds.includes(k));
  const waitedOut = now - ev.ms > CORE_WAIT_MS;
  return { missing, ready: haveKinds.length > 0 && (missing.length === 0 || waitedOut) };
}
// Is this event worth polling now? From its start until a full read exists; a
// day either side covers a document that lands early or a late speech.
export function shouldPoll(ev, status, now = Date.now()) {
  if (now < ev.ms - 30 * 60_000) return false;
  if (!status?.analysedKinds) return true;
  const all = ev.docs.map(d => d.kind);
  return all.some(k => !status.analysedKinds.includes(k)) && now - ev.ms < 3 * 86400_000;
}
