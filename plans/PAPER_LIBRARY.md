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
- `GET /api/library/papers` → `{ ok, papers:[Paper], topics:[{ key, label, count }], totals:{ all, fullText, abstractOnly } }`
  `Paper` = `{ id, title, authors, year, venue, url, ssrn, arxiv, doi, kind, readFrom, hasText, hasPdf, chars, pages, uploadedAt,
  tags:[{ key, label, source:'auto'|'manual' }], notes:{claim,mechanism,data,method,effect,outOfSample,costs,relevance,stance,
  caveats,testHere}|null, desk:[{ id, verdict, claim }], progress:{ pct, pos, at, done }|null, audio:{ briefing:{ status:'none'|
  'working'|'ready'|'error', secs, error } } }`
  Includes uploaded-but-unread PDFs (title from the first text line, no notes yet) and abstract-only papers (`hasText:false`).
- `GET /api/library/paper?id=` → `{ ok, paper:Paper, blocks:[Block]|null, pages:n }`, `Block` = `{ i, type:'h1'|'h2'|'p'|'eq'|'table'|
  'fig'|'refs', text, page, bbox:[x0,y0,x1,y1]|null, label? }` (`bbox` in PDF units, origin bottom-left, with the page's width/height
  in `pageSize:{ [page]:[w,h] }`).
- `GET /api/library/search?q=&tags=a,b&limit=40` → `{ ok, hits:[{ id, score, title, snippets:[{ block, text }] }] }` (full text, ranked).
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
