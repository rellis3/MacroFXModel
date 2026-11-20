// js/terminal/newsShowCore.js: the pure half of the NEWSLETTER show. The newsletter archive (/api/newsletter/archive, /api/newsletter/issue?id=) holds every issue as a stored HTML page. This reads one
// (headings, then the prose under each), and turns it into SHOW scenes: a short intro, one scene per section (its heading, the opening of its text read aloud, and a 3D view that fits the topic), and a close.
// It READS what the issue already says; it adds no analysis and no opinion. The view behind a scene is decoration chosen from the heading's words. No DOM: a small tag stripper, so it can be tested in Node.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←', middot: '·', bull: '·', deg: ' degrees', pound: '£', euro: '€', yen: '¥' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = h => decode(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** [{ level, title, blocks: [text, ...] }] in page order; blocks are the <p> and <li> texts under a heading (tables and charts carry no prose and are skipped). */
export function sectionsFromHtml(html) {
  const h = String(html ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const heads = [...h.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ level: +m[1], title: strip(m[2]), at: m.index, end: m.index + m[0].length }));
  return heads.map((x, i) => {
    const body = h.slice(x.end, heads[i + 1]?.at ?? h.length), blocks = [...body.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => strip(m[2])).filter(t => t.length >= 25);
    return { level: x.level, title: x.title, blocks };
  }).filter(x => x.title);
}

/** Text made speakable: symbols spelled out, brackets and arrows quietened. */
export function speechClean(t) {
  return String(t ?? '').replace(/\s*[→⇒]\s*/g, ' to ').replace(/\s*&\s*/g, ' and ').replace(/(\d)\s*%/g, '$1 percent').replace(/(\d)\s*bp\b/gi, '$1 basis points').replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\s*[—–]\s*/g, ', ').replace(/\s*\([^)]{0,80}\)/g, '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
}

const CAPTION = /^(each |shaded|dots? |the (right|left)-hand|hypothesis|model output|sources?|note|click|tap |moves run|rates and credit print|today means|the score is|\"?history\"?|size:|bars? |a bar |uk time|read |how to read|legend)/i;
/** 1 = a real sentence worth reading aloud, 0.5 = half a sentence, 0 = a caption, footnote, number run or fragment. */
export function quality(t) {
  const s = String(t ?? '').trim(), letters = (s.match(/[A-Za-z]/g) ?? []).length;
  if (s.length < 50 || s.length > 2500 || CAPTION.test(s) || letters / s.length < 0.6 || !/^[A-Z"'(]/.test(s)) return 0;
  return /[.!?]["')]?$/.test(s) ? 1 : 0.5;
}

/** The opening of a section's prose, read aloud: whole sentences up to about maxWords words. */
export function blurb(blocks, maxWords = 55) {
  const sents = speechClean((blocks ?? []).join(' ')).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/), out = []; let n = 0;
  for (const s of sents) { const w = s.trim().split(/\s+/).length; if (out.length && n + w > maxWords) break; out.push(s.trim()); n += w; if (n >= maxWords) break; }
  return out.join(' ');
}

const RULES = [[/currenc|dollar|strongest|weakest/i, 'ccy'], [/yield|curve|rates?\b|fed\b|central bank/i, 'yields'], [/textbook|chain|driving|transmission/i, 'chainfly'], [/option|gamma|wall|dealer/i, 'gamma'],
  [/vol\b|vix|fear|stress|break|risk|could not see/i, 'vol'], [/every market|glance|stands|movers|markets?\b/i, 'candles'], [/book|desk|playbook|lean|idea|voices|made/i, 'book']];
/** The 3D view behind a section: chosen from its heading's words, falling back to the globe when that view is not available. have = a Set of view ids that exist. */
export function viewForHeading(title, have) {
  for (const [re, v] of RULES) if (re.test(title ?? '') && (!have || have.has(v))) return v;
  return 'globe';
}

export const KIND_LABEL = { 'desk-terminal2': 'Terminal edition (v2)', 'desk-terminal': 'Terminal edition', desk: 'Desk morning note', 'desk-brief': 'Desk brief', 'desk-evening': 'Evening note', daily: 'Daily Atlas', weekly: 'Weekly' };
const dayWord = iso => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00Z`)); } catch (e) { return iso; } };

/** The SHOW scenes for one issue: { id, title, view, cam, text }. issue = { kind, date, subject }. At most maxScenes sections; sections with no prose are skipped. */
export function issueScenes(issue, sections, have, { maxScenes = 6, maxWords = 55 } = {}) {
  const out = [], kind = KIND_LABEL[issue?.kind] ?? 'Newsletter', title = speechClean(issue?.subject ?? '');
  out.push({ id: 'news-intro', title: kind, view: 'globe', cam: { region: 'world' }, text: `${kind} for ${dayWord(issue?.date)}.${title ? ` ${title}.` : ''}` });
  const body = (sections ?? []).filter(s => s.level > 1 && s.blocks.length);
  for (const s of body.slice(0, maxScenes)) {
    const good = s.blocks.filter(b => quality(b) >= 1); if (!good.length) continue;
    let text = blurb(good.slice(0, 3), maxWords); const echo = speechClean(s.title).toLowerCase(); if (text.toLowerCase().startsWith(echo)) text = text.slice(echo.length).replace(/^[\s.,:;-]+/, ''); if (text.split(/\s+/).length < 8) continue;
    const view = viewForHeading(s.title, have);
    out.push({ id: `news-${out.length}`, title: s.title, view, cam: view === 'candles' ? { fly: true } : { drift: true }, text: `${speechClean(s.title)}. ${text}` });
  }
  if (out.length < 2) return [];
  out.push({ id: 'news-close', title: 'End of the issue', view: 'globe', cam: { region: 'world' }, text: 'That was the issue, read as written. It is description, not advice.' });
  return out;
}

/** The newest issue of each kind, in a sensible order for a picker. issues = the archive list. */
export function newestPerKind(issues) {
  const seen = new Map(); for (const i of issues ?? []) if (KIND_LABEL[i.kind] && !seen.has(i.kind)) seen.set(i.kind, i);
  return Object.keys(KIND_LABEL).filter(k => seen.has(k)).map(k => seen.get(k));
}
