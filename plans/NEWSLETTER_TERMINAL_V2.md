# The terminal newsletter, version 2 (review and prototype)

Dated 2026-11-16. Hand-kept. Review and design only: nothing on the live site changes with this document. The prototype files live in the owner's scratchpad, not in the repo (see "What was built").

## 1. What the terminal newsletter is today

- **What it is.** "The Chain, Terminal edition" (js/newsletterTerminal.js, built 2026-11-03). It is the desk run (the AI analysts, the debate, the manager's ruling) and yesterday's review, drawn in the Desk Terminal's colours: deep navy, purple structure, gold theses, green and red for direction, mono labels.
- **Where it is built.** In the browser, on the Atlas page (atlas.html, buildTerminal). It only happens when the owner clicks the build button. Nothing is scheduled (the code says "click-only", and the brief is manual by design).
- **Where it is kept and seen.** The built HTML is saved in the newsletter archive (KV key newsletter_archive_v1, kind desk-terminal, gzip, about 50 KB each, 100 issues kept). It opens from Atlas as a page or prints to PDF. The only delivery channel is a Telegram click that sends the HTML as a file attachment (POST /api/newsletter/telegram, needs NEWSLETTER_TG_TOKEN). There is no email and no image.
- **Data sources.** The desk run for almost everything, plus /api/policy-rates, /api/macro-scorecard, /api/desk-news and /api/world-stress. None of the Desk Terminal's own boards feed it.
- **How it is drawn.** Inline SVG strings inside one self-contained HTML file: a gauge, score rings, horizontal bars, a forecast ladder, a world map (paths computed with d3 on Atlas). No scripts, no fetched fonts or images, so it reads the same forwarded or printed.
- **Size of the 16 Nov 2026 issue** (fetched from the live archive): 298 KB, 7 pages, 4,775 words of prose, 25 SVG graphics.
- **The pictogram** (js/newsletterPicto.js, 2026-11-04) is the desk brief on one landscape A4 page in a hand-drawn style: cream paper, wobbly inked boxes, two handwriting fonts, watercolour washes, cartoon icons. 303 words, 22 SVGs, 257 KB. It is a different look from the terminal on purpose.
- **Sibling editions** built from the same click: the daily and weekly (about 10,400 words on 16 Nov), the desk magazine (7,500), the desk brief, the evening edition. The audit (plans/NEWSLETTER_AUDIT_2026-10-24.md) and magazine plan (plans/NEWSLETTER_MAGAZINE.md) cover those.

## 2. Findings: the five biggest weaknesses

I rendered the 16 Nov issue at 390 px wide inside a phone-width frame. It does fit the screen (no sideways scroll). The weaknesses are about what it is, not whether it fits.

1. **It is the desk run in a terminal costume, not the terminal.** Its graphics are the AI desk's output (a dial for the ruling, rings for scores, bars for exposure). None of the terminal's own boards appear: no currency strength in σ, no yield curve with ghosts, no Fed path, no vol clock, no regime, no unusual-now, no calendar drills. The owner's ask, "a terminal newsletter based upon the terminal", is not what the current file is.
2. **The first screen is a wall of text.** On the 16 Nov issue the cover has one graphic (the gauge) after about 150 words of standfirst, then an italic thesis, then four "explain" cards. At phone width the four cards become narrow columns of about 8 words a line.
3. **The same sentence appears three times and internal tags leak.** "Credit quality is cracking at the tail: CCC OAS 1314bp +32bp/20d ..." is in the standfirst, in the "What it tells us" card and in the drivers list. The raw route and board names show through ("— credit-board", "liquidity-gate/live", "credit-stress / credit-quality", a stray "/...;" in the uncertain card). The clean() helper strips snake_case ids but not these.
4. **It carries trade-plan content into a document that is shared.** Playbook cards print ENTRY, TARGET, size and conviction. The viewer rule is analysis, not trades. Separately, GET /api/newsletter/archive and /api/newsletter/issue answered from here with no login (the issue page has a sandbox Content-Security-Policy, but no auth). I could not tell whether that is intended, so it is UNVERIFIED and needs the owner's call before any edition with private content is stored there.
5. **It is manual, file-only and not phone-friendly to receive.** A person on Telegram on a phone gets an .html attachment, which many phones open badly. There is no image, no link and no schedule. The pictogram has the same problem, plus its text is cut with "..." in several boxes ("short the dollar-bloc and short the index...") and the "wrong 108.63" labels on the desk's view row are cryptic.

What works and should be kept: the palette and mono labels are already the terminal's; every number comes from data, not a model; the file is self-contained and prints; the disclaimer footer; the "what the desk could not see" honesty; the review of yesterday.

## 3. The standing rules this design keeps

- **Short and institutional** (owner, 2026-10-24): every addition must replace or tighten. So the new edition has fewer words than today's, not more. Graphics replace prose.
- **Evidence rules:** range, timing and size are described; direction is never a signal. Every chart that touches direction carries its evidence wording. Graded language, no binary "null".
- **Viewer rules:** no trades, cost, or private tooling in anything saved where others can read it.
- **Point in time:** each figure carries its as-at time. The prototype prints "as at 11:02 UTC" and which close the curve is from.
- **Manual by design:** the brief is never scheduled. The new edition is built the same way, on a click (see decisions).

## 4. The proposed edition: "The Chain // Terminal", visual

A phone-first magazine page, one column to 620 px, dark and light variants, in the terminal's palette. Every section is a board the terminal already draws, taken from the same route, with one rule-built line under it (written by code from the numbers, not by a model).

| # | Section | Chart | Data route | Replaces (words saved) |
|---|---|---|---|---|
| 1 | Masthead, headline, seven stress chips | chips | /api/world-stress | cover standfirst plus drivers (about 450) |
| 2 | Regime | quadrant name, growth and inflation arrows, checks met | /api/regime-board | explain cards |
| 3 | Currency strength, 4 windows | heat strip, 8 currencies by 1H/4H/1D/1W in σ | /api/ccy-strength | the currencies page (about 600) |
| 4 | US yield curve with ghosts | curve now against 1w, 1m, 3m ago | /api/replay/curve | the yield exhibit prose |
| 5 | Fed path | hike odds by meeting with 1d/1w/1m ticks | /api/fed-path | policy paragraphs |
| 6 | Vol clock | nine dials of range used against the forecast median | /api/vol-clock | each-market prose |
| 7 | Unusual now | ranked bars of the 8 most extreme series by percentile, with the by-chance count | the daily market bundle (Insight board) | what is moving markets |
| 8 | Correlation and cross-asset (weekly only) | matrix with changed pairs ringed | Insight cross-asset | weekly prose |
| 9 | OI terrain with the live price line | the terrain image for one market, price against walls in σ | /api/oi-store plus desk-bars | option zone prose |
| 10 | Seven lights | lights with details | /api/world-stress | stress list |
| 11 | Coming up | calendar rows, plus the release drill chip (past reactions, size not direction) | /api/calendar-ahead and the calendar drills | releases ahead |
| 12 | Yesterday | the score bar chart and one line (kept from today's edition) | the desk review | stays, trimmed |

Rules for it: eight to twelve sections maximum; a section with no data is left out, never a placeholder; the desk run's ruling stays as ONE short block (the regime word, the conviction, the top three drivers as one line each), not four. Trade-plan cards (entry, target, size) are not in this edition.

**Word budget.** Today's terminal edition: 4,775 words of prose. The prototype: about 430 words of prose and about 160 words of chart labels, from 12 sections' worth of the terminal's data, so the net change is down by about 4,000 words. The rule "net words must not rise" holds with room to add the desk ruling block (about 120 words) and yesterday's review (about 100).

## 5. The second terminal pictogram: "The market on a page"

- **What.** One portrait image, 1080 by 1500, in the terminal's glow style (not hand-drawn). It sits beside the hand-drawn pictogram, not instead of it, so there are two: the cream "desk brief" and the dark "terminal" one.
- **Layout.** A header with date and regime. A currency wheel: eight spokes, outer bar the 1-week strength in σ, inner bar the 4-hour. Below it two panels side by side, the yield curve with ghosts and the Fed hike odds with ticks. A strip of nine dials for range used with marks at the median and the 75th and 90th percentile days. A row of seven stress lights. A one-line disclaimer.
- **Rules.** Every figure from the same routes as the edition, as-at time printed, no model-written words, no trade fields. Panels with no data are left out and the grid closes up.
- **Format.** SVG built as a string (like today), rendered to PNG for sharing. 1080 by 1500 reads on a phone without zoom.

## 6. Delivery: what is realistic

- **Today:** HTML file by Telegram. Poor on phones.
- **Realistic next step, no new server software:** the Atlas page already builds everything in the browser. Add a step that draws the pictogram SVG onto a canvas and saves it as a PNG (browsers do this natively, including the glow filters and the system mono font), uploads it to the archive beside the HTML, and sends it with the existing Telegram photo sender (sendTelegramPhoto in server.js) with a caption and a link to the hosted issue page. Phones show the picture inline, and the link opens the full edition as a web page (GET /api/newsletter/issue already serves it).
- **Not realistic yet:** rendering SVG to PNG on Railway. The repo has no image renderer in its Node dependencies (no resvg, sharp, puppeteer or playwright in package.json) and the Dockerfile is Node plus Python. A server-side route (for example @resvg/resvg-js, which needs a bundled mono font) is possible but is a new dependency and UNVERIFIED on this image. Email needs inline images or hosted URLs and the repo has no email sender, so I do not recommend it.
- **Link access.** Before the issue link is sent to anyone, the owner must decide who can open /api/newsletter/issue (see weakness 4).

## 7. What was built (prototype, not in the repo)

All generated from live routes on 2026-11-16 at 11:02 UTC, by a script that reads the saved route output. Files, in the scratchpad `C:\Users\relli\AppData\Local\Temp\claude\181f22e54fe44b96\ada3f133-3642-4302-83f2-c5e05d3e9659\scratchpad\nl2\`:

- newsletter_terminal_proto.html (dark) and newsletter_terminal_proto_light.html
- newsletter_terminal_proto_390.png and newsletter_terminal_proto_390_light.png (rendered inside a 390 px frame)
- pictogram_terminal_proto.svg and pictogram_terminal_proto.png (1080 by 1500)
- build_proto.py (the generator) and the route snapshots it read

Prototype sections: masthead and stress chips, regime, strength heat strip, yield curve with ghosts, Fed odds, nine vol dials, seven lights, calendar. Not in the prototype: unusual-now, correlation, the OI terrain with the live price line, the desk ruling block and yesterday's review.

**Found while building:** an SVG filter on a perfectly vertical or horizontal line has a zero-size box and draws nothing in Chrome. Use filterUnits="userSpaceOnUse" for glow on lines. Also, headless Chrome will not render narrower than about 500 px, so phone-width checks need a 390 px iframe.

## 8. Tests to add (when built)

- Word budget test on the terminal edition (prose words under a ceiling, like the 380-word idea-of-the-day test).
- No leaked ids: no snake_case id, no route-style tag (word-dash-word board names) in the text.
- Every section's data comes from a named route; a section with no data is absent, not empty (fixture with one route missing).
- No trade fields (entry, target, size) in the saved issue.
- As-at time and the curve's last-close date appear on the page.
- A 390 px render check (iframe) in the same way as the screenshot test, if a headless browser is available in CI.
- The PNG step: canvas output is non-blank and 1080 by 1500.

## 9. Effort

- Visual edition from the terminal's routes (sections 1 to 8, 10 to 12): medium to large, a few days. Most chart code can be lifted from the prototype and the terminal's own board modules.
- Unusual-now, correlation and the OI terrain overlay in a static form: medium each.
- Second pictogram as a module with tests: small to medium (the prototype is the design).
- Canvas to PNG in Atlas plus the Telegram photo and link: small.
- Server-side rendering on Railway: medium and uncertain.

## 10. Decisions needed from the owner

1. Replace the current terminal edition with the visual one (my recommendation), or keep both for a few weeks?
2. Keep the desk run's ruling as one short block in it, or drop it from this edition and leave it to the magazine and brief?
3. Who may open the archived issue pages: should the archive and issue routes need the owner login? (Today they answer without one.)
4. Pictogram: add the dark terminal one beside the hand-drawn one (my recommendation), or replace the hand-drawn one?
5. Delivery: PNG plus link on Telegram through the Atlas click (recommended), or also try a server-side image render?
6. Which markets get the OI terrain section (one pinned market, or the top mover)?

## 11. Not verified

- Anything past the static prototype: no built module, no test, no change on the live Atlas page.
- How the prototype looks in email clients or in Telegram's file preview.
- Whether the archive routes are open on purpose.
- The unusual-now, correlation and OI terrain sections as static images (the live boards draw them in the browser, so their static form is a build task, not a copy).
