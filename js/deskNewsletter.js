/**
 * The desk edition of The Chain: the newsletter writer's prompt sections and the renderer for its issue.
 *
 * Owner, 2026-11-03: the pipeline newsletter runs SIDE BY SIDE with the regular issue, in its style, so the content
 * can be compared before anything is replaced. The regular issue is untouched. This edition is saved to the same
 * archive (newsletter_archive_v1) as kind "desk", id desk-<date>, so it is never scored as a daily and never sent
 * anywhere on its own.
 *
 * Pure: the server supplies the run and the recent issues; nothing here fetches. Tested in js/deskNewsletter.test.mjs.
 * Design: plans/DESK_ANALYST_PIPELINE.md §4 (Layer 4) and §9g.
 */

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VIEW_TXT = { STRONG_LONG: 'Strong long', LONG: 'Long', FLAT: 'Flat', SHORT: 'Short', STRONG_SHORT: 'Strong short' };

/**
 * Style examples from the archive: the latest regular dailies' headline and opening, so the writer matches the voice.
 * The issue's text (js/newsletter.js) is a masthead, the kicker and headline, REGIME / CHANGED / WATCH lines, maybe a
 * "changed since" list, then the opening paragraph: the first block of real prose, which is what is taken here.
 */
export function styleExamples(issues, n = 3) {
  const isProse = b => b.length > 160 && !/^[A-Z0-9 ·:'&()-]+$/.test(b.split('\n')[0]) && !/^- /.test(b) && /[a-z]/.test(b) && /\. /.test(b);
  return (issues ?? []).filter(i => i.kind === 'daily' && i.subject && i.text).slice(0, n).map(i => {
    const blocks = String(i.text).split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const opening = (blocks.find(isProse) ?? '').replace(/\s+/g, ' ').slice(0, 900);
    return { date: i.date, headline: i.subject, opening };
  }).filter(e => e.opening);
}

/** The writer's input, top-down: the book, the rulings, the risk desk, then the style examples. */
export function newsletterSections(run, examples = []) {
  const b = run.head?.book, d = run.debate;
  const cards = Object.fromEntries(Object.entries(b?.instruments ?? {}).filter(([, c]) => c.rating !== 'FLAT' && c.rating !== 'REVIEW')
    .map(([n, c]) => [n, { rating: c.rating, conviction: c.conviction, size: c.size ?? null, sizeBeforeCap: c.sizeBeforeCap ?? null, why: c.why, plan: c.plan ?? null, invalidation: c.invalidation }]));
  return [
    ['The desk book: headline, global tone, risks, gaps', { headline: b?.headline, global: b?.global, risks: b?.risks, gaps: b?.gaps }],
    ['Global ruling', d?.global?.view ?? '(no ruling today)'],
    ['Currency ruling', d?.currency?.view ?? { currencies: b?.currencies }],
    ['The book: every instrument the desk is not flat on (sizes are after the exposure cap)', cards],
    ['Net exposure by currency (after the cap)', b?.exposure ?? '(not computed)'],
    ['Risk desk', Object.fromEntries(Object.entries(d?.risk ?? {}).map(([k, v]) => [k, v.view ? { headline: v.view.headline, warnings: v.view.warnings } : 'failed']))],
    ['Events and news analyst', run.analysts?.events_news?.report ?? '(no events report today)'],
    ['Style examples: the latest regular issues (match this voice)', examples.length ? examples : '(none in the archive)'],
  ];
}

/** The issue as a standalone HTML page and plain text, in The Chain's look. */
export function renderDeskNewsletter(issue, { date, runFinishedAt, packHealth } = {}) {
  const day = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
  const sec = issue.sections.map(s => `<section><div class="lab">${esc(s.label)}</div><h2>${esc(s.title)}</h2><p>${esc(s.body)}</p></section>`).join('');
  const ideas = issue.ideas.length ? `<section><div class="lab">Untested interpretation</div><h2>The desk's ideas</h2>
    <table><thead><tr><th>Market</th><th>View</th><th>Size</th><th>Level</th><th>Wrong if</th></tr></thead><tbody>
    ${issue.ideas.map(i => `<tr><td class="m">${esc(i.instrument)}</td><td class="v ${esc(i.view)}">${esc(VIEW_TXT[i.view])}</td><td>${i.size ?? '–'}</td><td>${esc(i.level)}<small>${esc(i.why)}</small></td><td>${esc(i.invalidation)}</td></tr>`).join('')}
    </tbody></table><p class="fine">Size: 1 is a normal position, 0 stands aside; sizes are after the desk's per-currency exposure cap.</p></section>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(issue.subject)}</title>
<style>
body{margin:0;background:#f4f6fb;color:#0b1220;font:15px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:22px 16px 60px}
.mast{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0b1220;padding-bottom:8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b6b82}
.mast b{color:#0b1220;font-size:15px;letter-spacing:.12em}
.ed{display:inline-block;margin-top:14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a5cff;border:1px solid #c9bdfc;border-radius:999px;padding:2px 10px}
h1{font-size:30px;line-height:1.2;margin:10px 0 12px;letter-spacing:-.01em}
.sf{font-size:17px;line-height:1.6;color:#1d2a3f;margin:0 0 6px}
.by{font-size:12px;color:#5b6b82;margin:8px 0 20px}
section{background:#fff;border:1px solid #dde4f0;border-radius:14px;padding:16px 18px;margin:14px 0}
section h2{font-size:18px;margin:4px 0 6px}
section p{margin:0}
.lab{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:700;color:#5b6b82}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px}
th{text-align:left;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#5b6b82;border-bottom:1px solid #dde4f0;padding:4px 6px}
td{padding:7px 6px;border-bottom:1px solid #eef2f8;vertical-align:top}
td small{display:block;color:#5b6b82;font-size:12px;margin-top:2px}
.m{font-weight:700;white-space:nowrap}.v{font-weight:700;white-space:nowrap}
.LONG,.STRONG_LONG{color:#0f9f6e}.SHORT,.STRONG_SHORT{color:#d1453b}
.fine{font-size:12px;color:#5b6b82;margin-top:8px}
.foot{font-size:12px;color:#5b6b82;margin-top:22px;border-top:1px solid #dde4f0;padding-top:10px}
@media (max-width:560px){h1{font-size:24px}.sf{font-size:16px}table{font-size:12.5px}}
</style></head><body><div class="wrap">
<div class="mast"><b>The Chain</b><span>Desk edition · ${esc(day)}</span></div>
<span class="ed">Desk edition · beside the regular issue · untested</span>
<h1>${esc(issue.subject)}</h1>
<p class="sf">${esc(issue.standfirst)}</p>
<div class="by">Written by the desk pipeline from this morning's desk book${runFinishedAt ? ` (finished ${esc(runFinishedAt.slice(11, 16))} UTC)` : ''}${packHealth?.total ? ` · ${packHealth.ok} of ${packHealth.total} feeds read` : ''}</div>
${sec}${ideas}
<div class="foot">This is the desk edition: the analyst pipeline's untested read, published beside the regular issue for comparison. It is context, not a tested signal, and it is not scored until its pre-registration is in place (plans/DESK_ANALYST_PIPELINE.md).</div>
</div></body></html>`;
  const text = [issue.subject, '', issue.standfirst, '', ...issue.sections.flatMap(s => [`${s.title} [${s.label}]`, s.body, '']),
    ...(issue.ideas.length ? ["The desk's ideas [Untested interpretation]", ...issue.ideas.map(i => `- ${i.instrument}: ${VIEW_TXT[i.view]}, size ${i.size ?? '-'}; ${i.level}; wrong if ${i.invalidation}`), ''] : []),
    'Desk edition: the analyst pipeline\'s untested read, beside the regular issue.'].join('\n');
  return { html, text };
}
