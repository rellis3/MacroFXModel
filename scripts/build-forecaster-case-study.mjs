// scripts/build-forecaster-case-study.mjs — render the Forecaster Portfolio case-study transcriptions
// (education/forecaster-portfolio-case-study/LESSON_*.md) into reader pages on the COG Hub.
//
//   node scripts/build-forecaster-case-study.mjs
//
// Writes cog/lessons/forecaster-portfolio/lesson-NN.html (one per lesson file) and rewrites the block between
// <!-- FPCS:START --> and <!-- FPCS:END --> in cog/hub.html. Idempotent; re-run after adding a lesson.
// The markdown files stay the source of truth. The rendered pages drop the source-site URL line
// (js/lessonNoBankLinks.test.mjs: no cog page links to that site). Screenshots are linked from
// education/ (not copied), so they load for a viewer who also holds the education-zone login.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'education', 'forecaster-portfolio-case-study');
const OUT = path.join(root, 'cog', 'lessons', 'forecaster-portfolio');
const HUB = path.join(root, 'cog', 'hub.html');
const SHOTS_REL = '../../../education/forecaster-portfolio-case-study/screenshots';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s, shotDir) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  // "screenshot 07", "screenshots 03, 04, 19", "close-up 20" → links to the PNGs
  h = h.replace(/\b(screenshots?|close-ups?)((?:[\s,]+(?:and\s+)?\d{2}(?:–\d{2})?)+)/g, (m, word, nums) =>
    word + nums.replace(/\d{2}/g, n => `<a href="${shotDir}/${n}.png" target="_blank" rel="noopener">${n}</a>`));
  return h;
}

function render(md, shotDir) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlank = l => !l.trim();
  while (i < lines.length) {
    const l = lines[i];
    if (isBlank(l)) { i++; continue; }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    const hm = /^(#{1,4}) (.*)$/.exec(l);
    if (hm) { const n = Math.min(hm[1].length + 1, 4); out.push(`<h${n}>${inline(hm[2], shotDir)}</h${n}>`); i++; continue; }
    if (/^ {4}\S/.test(l)) {
      const buf = [];
      while (i < lines.length && (/^ {4}/.test(lines[i]) || (isBlank(lines[i]) && /^ {4}\S/.test(lines[i + 1] || '')))) buf.push(lines[i++].slice(4));
      out.push(`<pre class="fp-formula">${esc(buf.join('\n'))}</pre>`); continue;
    }
    if (l.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^> ?/, ''));
      const paras = buf.join('\n').split(/\n\s*\n/).filter(p => p.trim() && !/^\s*\*?\*?Page:/.test(p));
      const body = paras.map(p => `<p>${inline(p.split('\n').filter(x => !/^Page:\s/.test(x.trim())).join(' '), shotDir)}</p>`).join('');
      out.push(`<blockquote class="fp-quote">${body}</blockquote>`); continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      const hasHead = head.some(c => c);
      out.push('<table class="fp-table">' + (hasHead ? `<thead><tr>${head.map(c => `<th>${inline(c, shotDir)}</th>`).join('')}</tr></thead>` : '') +
        `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c, shotDir)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*- /.test(l)) {
      // nested list: indentation by 2 spaces per level; continuation lines are indented text
      const items = [];
      while (i < lines.length && !isBlank(lines[i]) && (/^\s*- /.test(lines[i]) || /^\s+\S/.test(lines[i]))) {
        const m = /^(\s*)- (.*)$/.exec(lines[i]);
        if (m) items.push({ lvl: Math.floor(m[1].length / 2), text: m[2] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      let h = '', depth = -1;
      for (const it of items) {
        while (depth < it.lvl) { h += '<ul>'; depth++; }
        while (depth > it.lvl) { h += '</li></ul>'; depth--; }
        if (h.endsWith('</li>') || /<li>/.test(h) && !h.endsWith('<ul>')) h += '</li>';
        h += `<li>${inline(it.text, shotDir)}`;
      }
      while (depth >= 0) { h += '</li></ul>'; depth--; }
      out.push(h.replace(/<\/li><\/li>/g, '</li>')); continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,4} |---\s*$|>|\||\s*- | {4}\S)/.test(lines[i])) buf.push(lines[i++].trim());
    out.push(`<p>${inline(buf.join(' '), shotDir)}</p>`);
  }
  return out.join('\n');
}

const plain = s => s.replace(/[*_`]/g, '').trim();
const files = fs.readdirSync(SRC).filter(f => /^LESSON_\d{2}_.*\.md$/.test(f)).sort();
fs.mkdirSync(OUT, { recursive: true });
const lessons = files.map(f => {
  const md = fs.readFileSync(path.join(SRC, f), 'utf8');
  const num = /^LESSON_(\d{2})_/.exec(f)[1];
  const title = plain((/^## (.*)$/m.exec(md) || [, f])[1]);
  const series = plain((/^# (.*)$/m.exec(md) || [, ''])[1]);
  const mod = (/Module (\d{2} · [^.]+)\./.exec(md.replace(/\n>\s*/g, ' ')) || [, ''])[1];
  const dek = plain((md.split('\n').find(l => /^\*[^*].*\*$/.test(l.trim()) && l.trim().length > 40) || '').trim());
  return { f, md, num, title, series, mod, dek };
});

for (const [k, L] of lessons.entries()) {
  const shotDir = `${SHOTS_REL}/lesson-${L.num}`;
  const shots = fs.existsSync(path.join(SRC, 'screenshots', `lesson-${L.num}`))
    ? fs.readdirSync(path.join(SRC, 'screenshots', `lesson-${L.num}`)).filter(f => f.endsWith('.png')).sort() : [];
  const body = render(L.md.replace(/^# .*\n/, '').replace(/^## .*\n/m, ''), shotDir);
  const prev = lessons[k - 1], next = lessons[k + 1];
  const nav = `<div class="fp-nav">${prev ? `<a href="lesson-${prev.num}.html">← Lesson ${prev.num} · ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="lesson-${next.num}.html">Lesson ${next.num} · ${esc(next.title)} →</a>` : '<span></span>'}</div>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forecaster Portfolio ${L.num} · ${esc(L.title)} — COG Hub — MacroFX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../../theory-lab/assets/theory.css">
<style>
  .fp-formula{font-family:'DM Mono',monospace;white-space:pre-wrap;overflow-x:auto;padding:14px 16px;border-radius:8px;background:var(--bg2,rgba(127,127,127,.08));border:1px solid var(--border,rgba(127,127,127,.25))}
  .fp-quote{border-left:3px solid var(--accent,#3aa0ff);margin:18px 0;padding:4px 16px;color:var(--text2,inherit)}
  .fp-table{border-collapse:collapse;margin:14px 0;width:100%}.fp-table td,.fp-table th{border:1px solid var(--border,rgba(127,127,127,.25));padding:6px 10px;vertical-align:top;text-align:left}
  .fp-nav{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:24px 0}
  .fp-shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.fp-shots a{display:block;font-size:12px;text-align:center}
  .fp-shots img{width:100%;height:auto;border-radius:6px;border:1px solid var(--border,rgba(127,127,127,.25));background:rgba(127,127,127,.08);min-height:60px}
  #page li{margin:4px 0}
</style>
</head>
<body>
<div id="page">
  <!-- Generated by scripts/build-forecaster-case-study.mjs from education/forecaster-portfolio-case-study/${L.f}. Edit the .md and re-run; do not edit this file. -->
  <div class="tl-crumb"><a href="../../hub.html">COG Hub</a> / Case Study: The Forecaster Portfolio / Lesson ${L.num}</div>
  <div class="tl-kicker">${esc(L.series)}${L.mod ? ' · Module ' + esc(L.mod) : ''}</div>
  <h1 class="tl-title">${esc(L.title)}</h1>
  ${L.dek ? `<p class="tl-dek">${esc(L.dek)}</p>` : ''}
  <div class="tl-meta"><span class="tl-status course">VERBATIM TRANSCRIPTION — the lesson's own words; figures described from screenshots, nothing added</span></div>
  ${nav}
${body}
  <hr>
  <h2>Screenshots (${shots.length})</h2>
  <p>The original captures, in page order (formula close-ups at the end). They load from the education folder.</p>
  <div class="fp-shots">${shots.map(s => `<a href="${shotDir}/${s}" target="_blank" rel="noopener"><img loading="lazy" src="${shotDir}/${s}" alt="Lesson ${L.num} screenshot ${s.replace('.png', '')}">${s.replace('.png', '')}</a>`).join('')}</div>
  ${nav}
</div>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, `lesson-${L.num}.html`), html);
}

const cards = lessons.map(L => `      <a class="tl-card" href="lessons/forecaster-portfolio/lesson-${L.num}.html">
        <div class="tl-card-num">CS · ${L.num}${L.mod ? ' · Module ' + esc(L.mod) : ''}</div>
        <h3>${esc(L.title)}</h3>
        <p>${esc(L.dek || '')}</p>
      </a>`).join('\n');
const block = `<!-- FPCS:START (generated by scripts/build-forecaster-case-study.mjs) -->
  <div class="tl-cat">
    <h2>Case Study: The Forecaster Portfolio</h2>
    <div class="tl-cat-sub">Word-for-word transcriptions of the Colez Trades case-study lessons (${lessons.length} of 17 so far), with every figure described from the screenshots. The source of truth is <a href="../education/forecaster-portfolio-case-study/">education/forecaster-portfolio-case-study/</a>; these pages are rendered from it. Course material, not this repo's tested result.</div>
    <div class="tl-grid">
${cards}
    </div>
  </div>
<!-- FPCS:END -->`;
let hub = fs.readFileSync(HUB, 'utf8');
const nl = hub.includes('\r\n') ? '\r\n' : '\n';
const blk = block.replace(/\n/g, nl);
if (/<!-- FPCS:START[\s\S]*?<!-- FPCS:END -->/.test(hub)) hub = hub.replace(/<!-- FPCS:START[\s\S]*?<!-- FPCS:END -->/, blk);
else {
  const anchor = '  <div class="tl-cat">' + nl + "    <h2>COG — This Repo's Own Case Study</h2>";
  if (!hub.includes(anchor)) throw new Error('hub anchor not found');
  hub = hub.replace(anchor, blk + nl + nl + anchor);
}
fs.writeFileSync(HUB, hub);
console.log(`rendered ${lessons.length} lessons → cog/lessons/forecaster-portfolio/; hub block updated`);
