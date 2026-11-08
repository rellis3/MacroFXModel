# Paper Library (owner request, 2026-11-08)

A page where every paper the desk holds can be searched, filtered by area, read in the browser and listened to. Linked from the
command bar: Learn ▾ → Library.

## Owner's rules for this build
1. **No platform spend.** The new features make no model calls and no paid-API calls: tagging, search, the listen script, desk
   links and "read next" are rule-based. Nothing in the build or its tests may call a production endpoint that spends money
   (any POST to `/api/research-pod/{run,case/reply,case/review,backlog,investigate,image,paper,card,thread}`), and local tests
   mock every model and TTS call. GET reads of production are fine.
2. **Equations are key.** The reader must not turn equations into garbage. See "Equations" below.
3. **Browser voice first**, plus a button that makes an MP3 which does **not** read the paper verbatim (a briefing).
4. **Copyright.** The papers are private to the owner. Every route that serves paper text, PDFs or audio is behind the site login
   (`requireAuth` or the zone check; verify with an unauthenticated `curl` that gets 401/redirect, not content). No paper text,
   PDF or audio is ever committed: tests use synthetic fixtures written for the test.

## What exists already
- Uploaded PDFs: R2 `research/papers/<id>.pdf` and `.txt` (first 300k chars), `js/researchLibrary.js` (`uploadKey`, queue in KV
  `research_pod_queue`, items `{ id, title, upload:{name,bytes,chars,at,stored,sha}, status }`).
- Read papers: KV `research_pod_papers` (`js/literature.js`): `{ id, title, authors, year, venue, url, doi, arxiv, ssrn, kind,
  readFrom ('pdf'|'arxiv-html'|'abstract'|'upload (pdf)'), notes:{claim,mechanism,data,method,effect,outOfSample,costs,relevance,
  stance,caveats,testHere,crossRefs}, citedBy }`.
- Evidence Book `js/deskEvidence.js`; research cases `js/researchCase.js` (`caseFromDossier` is the pattern for a case from a paper).
- `scripts/pdf/pdfWorker.mjs` + `_pdfText` (server.js): pdf-parse in a worker thread. Theory Lab lessons: `theory-lab/lessons/*.html`.
- The SSRN download list: `education/papers/SSRN_DOWNLOAD_LIST.md` (links `abstractid=<id>`).
- Command bar: `js/commandHub.js`, Learn dropdown `chubDDedu`.

## Equations (how they are handled without a model)
pdf-parse accepts a custom `pagerender`, which receives pdf.js text items with position: `str`, `transform` (x = e, y = f),
`width`, `height`, `fontName`. The text pipeline keeps positions, so it can:
- rebuild lines by y and detect two columns by x;
- find headings by font height, drop running headers/footers and page numbers, rejoin hyphenated words;
- detect equation blocks (centered or short lines, high density of math glyphs/Greek/operators, sub/superscript items with
  smaller height and shifted y, a trailing equation number like `(3)`), and give each a **page and bounding box** in PDF units;
- detect tables (aligned numeric columns) and the reference list the same way.

The reader then shows an equation as an **image crop of the original page** (pdf.js renders the page; the box is cut out), not
as mangled text, with "page N · open PDF here". Tables the same. Listening skips both ("an equation appears here").
Cleaned text is never presented as exact: every page offers "original PDF".

## API contract (all under login; JSON unless stated)
- `GET /api/library/papers` → `{ ok, papers:[Paper], topics:[{ key, label, count }], sources:[{ key, label, count }], totals:{ all, fullText, abstractOnly } }`
  The list is the card view: no `notes`, `desk`, `abstract` or `theory` (they come with `GET /paper?id=`); instead `card` (one "In short" line), `cardMuted` and `read` (the desk has notes). Concurrent first loads share one catalog build.
  `Paper` = `{ id, title, authors, year, venue, url, ssrn, arxiv, doi, kind, readFrom, hasText, hasPdf, chars, pages, uploadedAt,
  source:{ key, label }, tags:[{ key, label, source:'auto'|'manual' }], notes:{claim,mechanism,data,method,effect,outOfSample,costs,relevance,stance,
  caveats,testHere}|null, desk:[{ id, verdict, claim }], progress:{ pct, pos, at, done }|null, audio:{ briefing:{ status:'none'|
  'working'|'ready'|'error', secs, error } } }`
  Includes uploaded-but-unread PDFs (title from the first text line, no notes yet) and abstract-only papers (`hasText:false`).
- `GET /api/library/paper?id=` → `{ ok, paper:Paper, blocks:[Block]|null, pages:n }`, `Block` = `{ i, type:'h1'|'h2'|'p'|'eq'|'table'|
  'fig'|'refs', text, page, bbox:[x0,y0,x1,y1]|null, label? }` (`bbox` in PDF units, origin bottom-left, with the page's width/height
  in `pageSize:{ [page]:[w,h] }`).
- `GET /api/library/search?q=&tags=a,b&sources=ssrn,nber&limit=40` → `{ ok, hits:[{ id, score, title, snippets:[{ block, text }] }] }` (full text, ranked).
- `GET /api/library/pdf?id=` → the PDF stream, `Accept-Ranges`, behind login.
- `POST /api/library/progress { id, pct, pos, done }`; `POST /api/library/tags { id, add:[key], remove:[key] }` (manual overrides, KV).
- `POST /api/library/case { id }` → creates a research case from the paper (no model call) → `{ ok, caseId }`.
- `GET /api/library/todo` → `{ ok, items:[{ id, title, year, part, url, held }] }` (the SSRN list, ticked off as papers are held).
- `GET /api/library/read-next` → `{ ok, ids:[id], why:{ id: 'matches open case "…"' } }`.
- `GET /api/library/listen?id=&mode=briefing|full` → `{ ok, sentences:[string], title, secs }` for the browser voice (equations, tables,
  references skipped; symbols spelled out; `briefing` is non-verbatim: abstract, the desk's notes, the conclusion).
- `POST /api/library/audio { id, mode:'briefing' }` → starts MP3 creation (free voice only) → `{ ok, job }`;
  `GET /api/library/audio?id=&mode=briefing` → `audio/mpeg` stream with `Accept-Ranges` (lock-screen playback), 404 if none.

## Topics (rule-based; a paper can have several)
volatility · jump / diffusion · Brownian motion & stochastic processes · options & dealer gamma · COT & positioning · FX & carry ·
trend & momentum · mean reversion & pairs · rates & FOMC · gold & commodities · risk & portfolio · backtest & method ·
microstructure & order flow · machine learning · regimes & HMM. Keyword families with weights over title, abstract, notes and
full text; a topic needs a minimum score; the owner can add or remove tags by hand.

## Sources (rule-based; one per paper)
`sourceOf(record)` in `js/paperCatalog.js` gives `{ key, label }` from fields we already hold. First rule that fires wins: (1) a curated
collection named by the queue item's `source` ('151 Trading Strategies (Kakushadze & Serur 2018)' -> `k151`, 'QuantConnect strategy
library' -> `quantconnect`); (2) identifiers: `ssrn`, `arxiv`, DOI prefix (10.2139/ssrn, 10.48550/arxiv, 10.3386 = NBER); (3) url host
(arxiv.org, ssrn.com, nber.org, federalreserve.gov / newyorkfed.org / other Reserve Banks -> `fed`, ecb.europa.eu, bankofengland.co.uk,
bis.org, imf.org); (4) `venue` text; (5) the rest of the queue `source` ('SSRN manifest' -> `ssrn`, 'reading list' -> `reading`);
(6) an upload: SSRN-style or arXiv-style file name, else `upload` ("Other upload"); (7) `other`. Keys: ssrn, arxiv, nber, fed, ecb,
boe, bis, imf, k151, quantconnect, reading, upload, other. The list response's `sources` has only those present, with counts.
Filtering: topics and sources are two chip groups, OR within a group, AND between them; the selection is remembered in
localStorage; `search?sources=` applies after ranking (so it ranks the top 100 first); the card and the reader head show the label.

## Theory Lab links
Tag → lessons that exist in `theory-lab/lessons/` (e.g. Brownian motion → ito-lemma, fractional-brownian-motion, girsanov-risk-neutral;
jump → institutional-jump-detection-tests, institutional-bates-model; volatility → garch-volatility, institutional-har-rv, heston-model).
A test must check every linked lesson file exists.

## Out of scope (needs paid model calls; not built now)
"Ask this paper", model-written walkthrough scripts, model-cleaned text, model auto-tagging, paid TTS voices.

## Built so far (pure modules, merged locally 2026-11-08)
`js/paperText.js` + `js/paperPages.js` + `scripts/pdf/pagesWorker.mjs` (positioned text → blocks with equation/table boxes),
`js/paperAudio.js` (`speechSentences` → `[{ text, block }]` ≤110 chars; `briefingScript`; `chunkForTts`), `js/paperTts.js`
(free `edge` voice via msedge-tts; `makeMp3`), `js/paperCatalog.js` (tags, search index, desk/theory links, to-get list, read-next,
`caseFromPaper`). Read their headers and tests for the exact signatures.

## Listening rules (from Theory Lab, `theory-lab/assets/tts.js`: read it, do not edit it)
The Theory Lab already fixed browser-voice stopping. Follow it exactly:
- utterances ≤110 characters (already produced by `speechSentences`);
- queue ALL remaining utterances synchronously inside the click/skip/rate-change handler (the engine's own queue plays them); never
  chain `speak()` from `onend`/`onerror` (iOS Safari and Android drop async-chained calls);
- NO `pause()`/`resume()` keep-alive (it killed playback on Android);
- a generation token so stale callbacks from a superseded batch are no-ops; `cancel()` on `pagehide` and `beforeunload`;
- progress/highlight from each utterance's `onstart`; speed and voice remembered in `localStorage`; prev/next paragraph, play/pause.
The MP3 (`<audio>`) uses the Media Session API (lock-screen title, play/pause, seek) and remembers its position.

## Styling and zones
The page looks like the Theory Lab: its dark tokens (`--bg:#0f1117; --s1:#1a1d27; --s2:#22263a; --border:#2a2f45; --text:#e8eaf2;
--blue:#4f7df0; --green:#10b981; --amber:#fbbf24; --purple:#a78bfa`, DM Sans/DM Mono), its cards (`.tl-card`), filter chips (like the
level filter on `theory-lab/hub.html`), status badges, kicker/title/meta lines, progress rings, the sticky listen bar. BUT
`/theory-lab/*` is the separate **education** login zone (`authZoneForPath`, `AUTH_EDU_PREFIXES`): a main-zone page must not
load its files or the owner is bounced to a second login. So `library.html` is a main-zone page with its own `css/library.css`
(copy the tokens and component styles you need; do not link into /theory-lab/). Links to Theory Lab lessons open in a new tab.
Phone first (430px, no page-level horizontal scroll).

## Equations as maths (owner request 2026-11-08; spend approved and capped)
An equation block can carry LaTeX, drawn with KaTeX in the reader; the image crop of the original page is always one tap away (`Original` on each
equation, and a header switch `Equations: Rendered | Original`, remembered in localStorage). Three layers; the best one wins (arXiv > model > rules):
1. **Rules** (`js/mathLatex.js`, free): the positioned items and drawn rules the worker keeps on each eq block (`block.src`, cached blocks v3) become LaTeX:
   rows by baseline, scripts by size and shift, Greek and cmsy/cmex/Symbol glyph tables, `\frac` from drawn bars, `\sqrt` from a radical touching a bar,
   big operators with limits, accents, cases, aligned systems at the first relation sign, `\left \right` around tall content, `\tag` from the equation number.
   A confidence 0..1 (unknown glyphs, stray accents, unmatched rules, unbalanced brackets, prose-like runs, table-like blocks...); the reader renders at >= 0.8.
2. **arXiv** (`js/arxivMath.js`, free): for a paper with an arXiv id the `<math alttext>` of arxiv.org/html/<id> (else ar5iv) is matched to the blocks by equation
   number plus a symbol-bag similarity, then by document order; one request per paper, >= 3 s apart, generic User-Agent, cached in the paper's math file.
3. **Model** (`js/libraryMath.js`, DeepSeek task `library-math`, ledger `brief`): `POST /api/research-pod/math { calls: 1-12 }` sends ~25 unresolved equations per
   call (linearised geometry plus the sentence before and after), validates every answer with KaTeX, and stops at 1500 calls in total (KV `library_math_v1`,
   reserved before each call). `GET /api/research-pod/math` is the status. Papers with notes first.
Storage: R2 `research/papers/<id>.math.json`. `GET /api/library/paper` adds `latex`, `latexSource` ('arxiv'|'model'|'rule') and `latexConf` to eq blocks.
Tests use synthetic position fixtures only; the real-PDF evaluation is a local script and no paper text is committed. Listening still skips equations.

## Figures, tables and footnotes (owner request 2026-11-08: charts and tables must look like charts and tables)
A 'Figure N' block used to crop only its caption line, and small tables of numbers read as paragraphs of number soup. Blocks cache is now **v4**
(`blocks.json` of an older version is rebuilt on the next open).
- **Graphics regions** (`js/pdfGraphics.js`, run per page by `scripts/pdf/pagesWorker.mjs`, kept as `pages[].gfx = [[x0,y0,x1,y1,'i'|'v',n]]`): the operator list is
  walked with a CTM / clip / form-XObject stack; every painted image (`i`) and path (`v`) becomes a box; boxes within 6 units merge. Dropped: thin full-width
  rules, page frames and full-page backgrounds, white fills, glyph-sized stencils, regions under ~22 x 22 units.
- **Matching** (`attachFigureGraphics` in `js/paperText.js`): per caption, candidate regions above and below it in its column(s), no body text between, scored by
  gap with the document's usual side winning ties; one region per caption, then the other panels of a multi-panel figure; tick labels, legends and axis titles
  inside the region are absorbed (not read as text). The fig block's box = caption + graphic + 3.5 units, and the block has `gfx:true`. No region: caption only.
- **Tables**: cells packed into one pdf.js item are split (`4.81%    5.19%`, glued labels, back-to-back negatives); a "Table N" caption with no strict rows is
  anchored (aligned numeric rows under or over it, or the lines between the rules under it). The block box includes the framing rules; the reader shows an
  image crop, the text is the caption only; listening says "A table appears here." and the numbers are no longer in the search text.
- **Footnotes**: a raised superscript-sized number glued to a word is cut from the paragraph when the same number starts a footnote line lower on the page; that
  footnote body is a `p` block with `foot:true` (small in the reader, skipped when listening).
- **Reader**: figure and table crops fit the container width (`max-width:100%`); a tap opens an overlay with the same box re-rendered sharper
  (`zoomView` in `js/library/crop.js`, ~1800 px wide, bounded pixels), Fit / Full size (scrolls inside the overlay, never the page), Open PDF, Esc to close.
- Also fixed on the way: a table's wide cell gap on a short column is no longer taken for the page gutter; text heights that are several times the real glyph
  size (old Word/Acrobat output) are rescaled; figures and tables set after the References heading are kept; a page with a JPEG no longer makes the whole
  extraction fail ("Image is not defined" in the worker).

## Index and retrieval (owner request 2026-11-08; no model call, no spend)
`js/libraryIndex.js` (pure): one compact row per paper `{ id, t, y, src, tg, c, ev, co, m, me, ef, tx, cs, vd }` (about 60-90 tokens; `indexStats()`), rule-based
TF-IDF-like `search()` (topic / source / year filters, boosts for out-of-sample notes and our verdicts, maths boost only for model / equation queries, deterministic
ties), `digest(paper)` (<= ~900 chars, up to 3 figure/table notes) and `buildContext(query, index, papers)` -> `{ text, ids }` ('[P1] id: ...' list with a citing header).
Cache: R2 `research/papers/_index.json` (rows + retrieval vectors), rebuilt when the catalog's content signature changes. Routes (same login gate as the rest):
`GET /api/library/index` (rows + stats), `GET /api/library/find?q=&n=&topics=&sources=&years=&notes=1&digest=1` (ranked rows with `score` and `why`, optional digests).
The library page has an Index tab (a row per paper, filter box that calls /find).
Researchers (flag **off** by default): `LIBRARY_CONTEXT=1` in the server environment adds a `LIBRARY:` section (the best 6 papers' digests) to each researcher's prompt
(round 1 and later rounds) and to the Head of Research's review; the injected ids are saved on the round / review as `libraryIds` and are accepted as `citations` in
addition to the held-paper ids (the existing `paperIds` check is unchanged). Off, the prompts are byte-identical. `GET|POST /api/research-pod/case/library-preview?id=&text=`
returns the text that would be injected, without any model call.
