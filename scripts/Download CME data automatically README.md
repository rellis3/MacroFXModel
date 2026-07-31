# Scraping CME QuikStrike (or similar bot-protected, JS-heavy sites)

A playbook for pulling structured data out of an authenticated site that
(a) blocks true headless browsers and (b) doesn't offer a clean CSV/API
export — only PDFs, or data rendered into a chart/table by JavaScript.

## 1. Get past bot protection

CME's Akamai protection blocks true headless Chromium outright (confirmed:
connection errors even with a valid, logged-in session). Fix:

- Launch Playwright with `headless=False`.
- For unattended/background runs, launch the window **off-screen**
  (e.g. `args=["--window-position=-32000,-32000"]`) instead of using a real
  headless flag. It's still a real, visible-to-the-OS browser window — just
  not visible to a human — and that's enough to pass bot detection that a
  true headless flag would trip.
- Use a **persistent browser profile**
  (Playwright's `launch_persistent_context`, pointed at a fixed directory
  on disk) so you log into the site manually **once**, and every future run
  reuses that saved session automatically.

## 2. Find the actual data-bearing element — investigate before scraping

Don't guess selectors blindly. Write a throwaway inspection script first
that:

- Finds the relevant iframe (many of these widgets embed their real content
  in an iframe pointed at a separate app/subdomain) — loop the page's
  frames and match on a distinctive URL substring.
- Checks whether the visible chart is a **JS charting library object** —
  e.g. for Highcharts, evaluate `() => Highcharts.charts` in that frame's
  JS context. If it's non-empty, the underlying data is sitting in memory
  and readable directly (each series typically exposes its data points as
  `{x, y}` pairs) — no need to export or parse anything.
- Checks whether the grid is a **genuine HTML `<table>`** — even better
  than a chart object, since it's just cell text you can read straight out
  of the DOM.
- Only falls back to exporting a PDF/image and parsing that if neither of
  the above holds — that route is far less reliable (layout-dependent text
  extraction) and should be a last resort.

## 3. Handle navigation quirks

These cost the most trial and error in practice:

- **A synthetic click can silently no-op** on flyout/dropdown menus.
  Calling `.click()` via JS evaluation (`el => el.click()`) dispatches an
  *untrusted* event, and some menu widgets ignore untrusted clicks
  entirely — the page just doesn't respond, with no error thrown. If a
  click "does nothing," switch to the automation library's **native** click
  action (a real, trusted, OS-level input event) instead.
- **Some interactions open a new browser tab**, not the current one. After
  any click that might navigate, search **every open tab**, not just the
  one you started with, for the frame/content you're expecting.
- **Product/instrument selectors** are often a popup you click through
  hierarchically (e.g. Category → Subcategory → Item). Find each level by
  its visible text rather than a hardcoded element ID — IDs frequently
  shift depending on which item was last selected.
- Find tables/elements by **structure, not a fixed index** (e.g. "the table
  whose first data row starts with the text 'STRIKE'") — decoy tables,
  menus, and controls elsewhere on the page make a fixed index unreliable
  across different accounts/sessions/products.

## 4. Parse into a stable schema

Watch for **merged header cells** (colspan) sitting above flat data
columns — a very common pattern for grids with grouped columns (e.g. one
header label per group, but two data columns underneath it). Compare the
header row's cell count to a data row's cell count: if the header has
fewer cells, each header cell spans multiple data columns. Work out the
mapping arithmetically (e.g. header index `i` → data columns
`1 + i*2` and `2 + i*2` for a "2 sub-columns per group" layout) rather than
assuming a 1:1 column correspondence.

Save the result as JSON with a **minimal, stable shape** that doesn't leak
details of where the data came from (table vs. chart, which specific tool)
— downstream code should be able to consume it the same way regardless of
source or format.

## 5. Write atomically

Write to a temporary file first, then rename/replace it onto the final
path. Anything else reading that file on a schedule (a live dashboard, a
cron job) should never be able to observe a half-written file mid-scrape.

## 6. Make it safe to run in parallel

Most browser automation tools **lock a profile directory to one running
instance** — two processes can't share the same logged-in profile
concurrently. To run multiple pulls at once (e.g. one per product/instrument):

1. Copy the already-logged-in default profile once per concurrent pull
   (each copy starts out authenticated, since it's a copy of a session
   that already logged in).
2. Point each concurrent run at its own copy via a `--profile-dir`-style
   argument, so they never contend for the same lock.
