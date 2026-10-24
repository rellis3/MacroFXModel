# The magazine edition of the newsletter (V2)

The newsletter has two layouts built from the same data. The current layout is a dashboard of cards. The magazine layout (V2) is an editorial publication: a feature, a signature chain spread, competing explanations, an accountability page, then a Data Desk that holds every reference table.

## Where it lives

| What | File |
|---|---|
| The magazine composition, charts, print CSS | `js/newsletterMag.js` |
| Competing explanations and the daily lesson | `js/macroTheories.js` |
| The layout flag and the Data Desk assembly | `js/newsletter.js` (the `v2` branch) |
| The V2 entry point | `js/newsletterV2.js` |
| Atlas: builds both, Compare with V2 | `atlas.html` (`showNl`, `nlInput`) |
| Print a saved issue to PDF | `analysis/newsletter_pdf.mjs` |

## The pipeline

There is no server-side PDF. The newsletter is one self-contained HTML file (inline CSS and SVG, no scripts, no external requests). "Save as PDF" in Atlas opens that file and calls the browser's print. The page's own print CSS does the rest: A4 portrait pages, one `.pg` per page, and the chain spread on a named landscape page (`@page land`). `analysis/newsletter_pdf.mjs` prints the same file with headless Chrome, so a PDF can be regenerated from any saved issue without a browser window.

On a phone the same file is a single-column web page. Wide figures (the yield chart, the forecast audit, the chain) keep their full size and scroll sideways rather than shrinking to unreadable text.

## Page order

1. The story: headline, the desk's reading as a standfirst, a drop-cap article from the brief, a pull quote, and a sidebar with the two kinds of alarm.
2. Exhibit 1: the 10-year yield split into the real yield and expected inflation, with the textbook against today.
3. Exhibit 2: the chain of impact on its own landscape page, broken links numbered.
4. Exhibit 3: the four broken relationships, each drawn and explained.
5. Exhibit 4: four ways to read the same move, as an evidence matrix and argued paragraphs with a counter-argument each.
6. What to watch: how to hold the four readings, what would change the story, and today's lesson.
7. The accountability page: last issue's forecast marked, what was right and wrong, the running record.
8. The Data Desk: signals, positioning, currencies, every market, sector and credit tables, the calendar, context.
9. The back page: the question, the sources and the disclaimer.

## Rules the layout keeps

- No threshold or calculation is changed. Every figure comes from the data the current issue already carries.
- The explanations are not scored. A label counts how many of the listed checks the day's moves agree with. It is not a probability and not independent proof, and the page says so. Where several explanations fit every check, it says the count cannot choose between them and lists what only one of them needs.
- The 0 of 5 broad stress warnings and the watched conditions are two different alarms and are explained side by side. The broken chain links are counted inside the second.
- The unremovable NOT FINANCIAL ADVICE footer stays.

## Checking the print

Render every page after a layout change: `node analysis/newsletter_pdf.mjs issue.html out.pdf`, then look at each page for stranded headings, spill-over pages and unreadable charts. Known pitfalls found while building it: a multi-column block that cannot fit its first item is pushed whole to the next page, so the market cards sit behind a forced page break; a section heading is kept with its content with `break-after: avoid`; and a CSS class named `.bl` was reused by an old board experiment and broke the currency league table, so class names in the magazine CSS should stay distinct.
