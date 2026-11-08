// Margin stamps and download boilerplate that must never be read aloud or shown as text (pure, never throws):
//   arXiv:1107.1834v1 [q-fin.CP] 10 Jul 2011 (also with spaced characters, as a rotated margin stamp extracts),
//   "Electronic copy available at: https://ssrn.com/abstract=123", "Downloaded from ...", "Working Paper No. 12" alone,
//   doi / URL only lines.
const CAT = String.raw`[a-z](?:\s?[a-z-]){1,12}(?:\s?\.\s?[A-Za-z]\s?[A-Za-z]?)?`;
const ARXIV_CAT = String.raw`(?:\s*\[\s*` + CAT + String.raw`\s*\]|\s+[a-z](?:\s?[a-z-]){1,12}\s?\.\s?[A-Za-z]\s?[A-Za-z])?`;
const ARXIV_DATE = String.raw`(?:\s*(?:\d\s?){1,2}\s*[A-Z]\s?[a-z]\s?[a-z]\s?(?:[a-z]\s?){0,6}\.?\s*(?:\d\s?){4})?`;
// new style 1107.1834v1 and old style hep-th/9901001v2; digits may be separated by single spaces
const ARXIV = new RegExp(String.raw`a\s?r\s?X\s?i\s?v\s?:\s?(?:(?:\d\s?){4}\.\s?(?:\d\s?){4,5}|[a-z]+(?:-[a-z]+)?\s?/\s?(?:\d\s?){7})(?:v\s?\d{1,2})?` + ARXIV_CAT + ARXIV_DATE, 'gi');
const ELECTRONIC = /Electronic\s+copy\s+available(?:\s+at)?\s*:?\s*(?:https?:\/\/)?(?:papers\.)?(?:ssrn\.com(?:\/abstract\s*=\s*\d+)?)?/gi;
const ELECTRONIC_LINE = /^Electronic\s+copy\b.{0,120}$/i;
const DOWNLOADED = /^Downloaded\s+from\b.{0,160}$/i;
const WORKING = /^(?:[A-Za-z&.,' -]{0,60}\s)?Working\s+Paper(?:\s+Series)?(?:\s+No\.?)?\s*#?\s*\d{0,6}\s*$/i;
const URL_ONLY = /^(?:doi\s*:?\s*)?(?:https?:\/\/\S+|www\.\S+|10\.\d{4,9}\/\S+|(?:[a-z0-9-]+\.)+(?:com|org|edu|net|gov|io)\/\S*)$/i;

/** Text with arXiv stamps and "Electronic copy available" strings removed (whitespace tidied). */
export function stripStamps(text) {
  try {
    const t = String(text ?? '');
    if (!/a\s?r\s?x\s?i\s?v|electronic\s+copy/i.test(t)) return t;
    return t.replace(ARXIV, ' ').replace(ELECTRONIC, ' ').replace(/[ \t]{2,}/g, ' ').replace(/^\s+|\s+$/g, (m) => (m.includes('\n') ? m : ''));
  } catch { return String(text ?? ''); }
}

/** True for a standalone stamp / boilerplate line (the whole string is nothing but a stamp). */
export function isStampLine(text) {
  try {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (DOWNLOADED.test(t) || WORKING.test(t) || URL_ONLY.test(t) || ELECTRONIC_LINE.test(t)) return true;
    const rest = stripStamps(t).replace(/[\s.,;:|\-–—]+/g, '');
    return rest.length === 0 || (t !== stripStamps(t) && rest.length <= 3);
  } catch { return false; }
}

/** Blocks without stamps: stamp-only paragraphs are removed (block indexes renumbered), stamp text inside others is cut. */
export function cleanBlocks(blocks) {
  try {
    if (!Array.isArray(blocks)) return blocks;
    let changed = false;
    const out = [];
    for (const b of blocks) {
      if (!b || b.type !== 'p' || typeof b.text !== 'string') { out.push(b); continue; }
      if (isStampLine(b.text)) { changed = true; continue; }
      const s = stripStamps(b.text);
      if (s !== b.text) { changed = true; out.push({ ...b, text: s.trim() }); } else out.push(b);
    }
    if (!changed) return blocks;
    return out.map((b, i) => (b && typeof b === 'object' && 'i' in b ? { ...b, i } : b));
  } catch { return blocks; }
}
