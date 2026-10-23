// js/readTime.js — how long a Theory Lab / cog lesson takes to READ, from the page itself.
//
// WHY: the "~16 min read" label was typed by hand and never checked. Measured 2026-10-23 on 189 lessons: the median
// lesson says ~17 minutes and holds about 6,000 words of prose, which is ~27 minutes at 230 wpm and ~30 at the
// 200 wpm a technical text deserves; 104 of 189 labels understated by more than 60%.
//
// WHAT COUNTS as reading: the lesson body. WHAT DOES NOT: scripts/styles/SVG text, the audio script (a listening
// alternative, labelled with its own minutes), the ELI5 box (optional), the quizzes (practice, not reading), the
// header chrome. Equations are not read word by word: display math counts as ~8 words, inline math as 1.
// Pure: a string in, a number out.

export const WPM = 200;                       // technical prose with formulas, not a novel
const SKIP_CLASSES = ['tl-listen', 'tl-eli5', 'tl-quiz', 'tl-answer', 'tl-glossary-link'];
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col']);

/** The prose a reader reads, with skipped blocks removed (balanced-tag aware). */
export function readableText(html) {
  const s = String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(s)?.[1] ?? s;
  const out = [];
  const stack = [];                            // open tags: { tag, skip }
  let skipDepth = 0, i = 0;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(body))) {
    if (!skipDepth) out.push(body.slice(i, m.index));
    i = m.index + m[0].length;
    const tag = m[1].toLowerCase(), closing = m[0][1] === '/', selfClose = /\/\s*>$/.test(m[0]) || VOID.has(tag);
    if (closing) {
      for (let k = stack.length - 1; k >= 0; k--) {
        const top = stack.pop();
        if (top.skip) skipDepth--;
        if (top.tag === tag) break;
      }
    } else if (!selfClose) {
      const cls = /class\s*=\s*"([^"]*)"/i.exec(m[2])?.[1] ?? '';
      const skip = SKIP_CLASSES.some(c => cls.split(/\s+/).includes(c)) || /id\s*=\s*"(?:eli5|tts)[^"]*"/i.test(m[2]) && tag !== 'button';
      stack.push({ tag, skip }); if (skip) skipDepth++;
    }
  }
  if (!skipDepth) out.push(body.slice(i));
  return out.join(' ');
}

/** Words a reader reads (equations discounted), from raw HTML. */
export function readWords(html) {
  let t = readableText(html).replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  t = t.replace(/\\\[[\s\S]*?\\\]/g, ' EQ EQ EQ EQ EQ EQ EQ EQ ').replace(/\\\([\s\S]*?\\\)/g, ' EQ ').replace(/\$\$[\s\S]*?\$\$/g, ' EQ EQ EQ EQ EQ EQ EQ EQ ');
  return t.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
}

export function readMinutes(html, wpm = WPM) {
  return Math.max(1, Math.round(readWords(html) / wpm));
}

/** The label currently on the page ("~16 min read" -> 16), or null. */
export function labelMinutes(html) {
  const m = /~?\s*(\d+)\s*min(?:ute)?s?\s*read/i.exec(String(html ?? ''));
  return m ? +m[1] : null;
}
