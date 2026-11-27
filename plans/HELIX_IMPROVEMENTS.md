# Helix improvements: review of 2026-11-27

Five read-only reviews, one each on analysis, look and feel, data and feeds, sound/voice/broadcast, and overview
and navigation. File references are as of commit 20cddad5. The rules for every change below:

- Helix describes. It never forecasts or makes a trade call.
- Changes to calculations go in as a side-by-side layer, never as an edit to the live calculation.
- The gamma "amplified" wording stays as it is.
- Names and branding are the owner's call. Some text still says Jarvis or J.A.R.V.I.S., and that waits for the owner.

Size: S is under an hour, M is a few hours, L is about a session.

---

## Wave 0: wrong or risky now (fix first)

| # | Problem | Where | Fix |
|---|---|---|---|
| 0.1 | The broadcast script reads out "Short: X. Long: Y.", "it favours A against B", and says the calls are scored nightly. Uploads default to *unlisted*, but they are still trade calls on YouTube. | `broadcastPanels.js:128-135, 300-309` | Describe the engine's tilt in words. Never say long/short. Drop the scoring line from public renders. |
| 0.2 | Advice in the narration: "watch which gives way", "size it as one", "wider stops, smaller size", "a breakout needs more proof". | `netCore.js:255,261`, `jarvisVolCore.js:92-95` | Reword as description. Replace "on edge" with the validated vix-inversion fact (day one only). |
| 0.3 | "One day in four runs bigger" is spoken after the median range. In fact half of all days run bigger than the median. | `broadcastCore.js:146` | Speak the p75 figure, or say "half the days run bigger". |
| 0.4 | `timesWord` says "about 1 times" for ratios from 1.25 to 1.5. | `jarvisSessionCore.js:~301` | Use one decimal below 2. |
| 0.5 | Evening actual vs forecast: `num()` drops the units, so 1.2M against 950K is read as "below". | `eveningCore.js:39-44` | Parse the K/M/B/% suffixes. |
| 0.6 | The evening baseline window steps back in fixed UTC days, so it is an hour out for 16 days after a DST change. A US 08:30 print is then compared with the cash open. | `eveningCore.js:30` | Step back in the release's local clock time. |
| 0.7 | Missing vol cells are filled with 1, so a market with no bar reads "1.0× normal" and is averaged in. | `jarvisVolCore.js:47-56,84` | Treat them as missing, not normal. |
| 0.8 | Precedent `unitFor` uses `Date.now()`, so historical replays see later releases (lookahead). | `precedentCore.js:172`, `eventReplayCore.js:53` | Pass `now` through. |
| 0.9 | A "strongest/weakest currency" is always named, even when every currency is flat. | `jarvisCcyCore.js:51-56`, `jarvisWxCore.js:136` | Say "no clear leader" under FLAT. |
| 0.10 | `jf` accepts 4xx/5xx bodies as data and has no timeout. One hung route stalls the whole broadcast `gather()`. | `jarvisView.js:279` | Check `r.ok`, add a 15 s timeout, dedupe requests in flight, keep a per-route cache. |
| 0.11 | The broadcast can upload with lines unspoken. The only audio check is a peak above -50 dB, and the drone alone passes it. | `record_broadcast.py:275-279` | Return voiced/total lines and refuse anything under 100%. |
| 0.12 | ElevenLabs lines come out pitched up about 1.6 semitones in frame mode (`playbackRate` 1.1 on the buffer). | `jarvisVoiceClient.js:56,151` | Send `voice_settings.speed` and play at 1.0. |
| 0.13 | A failed line falls back to the browser voice. In frame mode that voice is never in the recorded WAV, so the line is silent. | `jarvisView.js:268` | Pre-render every line before recording; abort on a gap. |
| 0.14 | The offline audio is capped at 900 s and the cut is ignored, so the end of a long run is silent. | `vclock.js:49,109`, `jarvisModBroadcast.js:375` | Size the buffer from the script length and fail loudly if it is still too short. |
| 0.15 | Catch-up runs: a 07:00 run that starts late is titled "Afternoon"; a missed 21:00 run fires the next morning. | `broadcast_core.py:56-58` | Add a time-window guard and `--part`. |
| 0.16 | Shockwave and the release paths read the fixed-month IBKR contracts. They go stale quietly at the 30 Nov and 8 Dec rolls. | `live_push.py` via `IB_SPEC` | The roll plan in `DATA_CAPTURE_G10.md` §3, phase 1. |
| 0.17 | Drill-bundle refresh storm: no in-flight guard, and a failure leaves `at` unchanged, so every request starts its own refresh. | `server.js:22863-22912, 23101` | Hold one shared promise and back off after a failure. |
| 0.18 | Stale data drawn as live: Gamma (no OI date), Net (ignores `stale`), Markets/Session (keep the old moves), and the weekend snapshot on the globe. | `jarvisViewGamma.js:40`, `jarvisViewNet.js:82`, `jarvisModMarkets.js:17-19`, `jarvisViewSession.js:35` | Add an as-of chip (see 3.2). |
| 0.19 | ALERTS adds "SENT TO YOUR PHONE" a second time when re-opened. The card holds a stale height. | `jarvisView.js:393-400`, `stableRender.js:25-38` | Rebuild the section; exempt `#jarvis` from the height hold. |
| 0.20 | `--cy` is undefined (falls back to raw cyan). Under the colour-blind theme, calls and long gamma are the same colour. | `jarvisView.js:134`, `themes.css:9` | Define the token; give each colour one meaning (see 2.1). |

## Wave 1: analysis (what Helix says)

1. **Move so far measured against the usual move by this hour.** At 07:00 the moves are divided by the full-day median, so "quiet start" is mostly the time of day. Add a ratio scaled by the share of daily variance done by this hour (`hourProfile`; first-hour-fraction is validated) (M).
2. **Base rates for "unusual".** Twice the median happens on about 17% of days. Say "a 1-in-40 day" from each market's own 250 sessions, point in time, and give the expected count. The vol line that is always "three times or more" gets fixed (M).
3. **A baseline for network "splits".** At r=0.6 the signs disagree about 30% of the time by chance, across about 300 pairs. Require a residual z of 2 or more and say how often that happens (S–M).
4. **Evening release reactions against the same release's own history**, plus the surprise in σ. The validated surprise-size result gives range-only lines (M).
5. **Adaptive chain noise floors shown next to the fixed ones.** Flag where the fixed floor is under half the adaptive one (M).
6. **Shockwave scaled to today's vol.** Skip the "most recent big release" scene on days with no release. Give the up/down count with its interval (S–M).
7. **Validated context in the day ahead:** pre-release ranging (about 12% narrower), the session after CPI, the Monday / month-start profile (S).
8. **Surprise "mostly beaten"** becomes "k of n beat", needing n of 4 or more and a winsorised median (S).
9. **Gamma: say the OI capture date.** For FX, add the "FX still does not carry it" qualifier in a separate sentence; the amplified wording stays as it is (S).
10. **Holiday and half-day tags:** Thanksgiving and today's half day are read as real quiet sessions (S).
11. **Precedent up-share with a 95% interval** and the market's unconditional up-share (S).
12. **The new G10 data:** 2y gap to the US for each currency, auction tail and bid-to-cover percentile, and SOFR p99 − IORB with the month-end note (M–L; the routes are in 3.6).

## Wave 2: look and feel

1. **One meaning per colour:** separate direction colours from regime colours; accents never carry meaning; up/down always paired with a shape (Session's filled/hollow candles). Fix VOL's ▲/▼ and Net's green/red for correlation (M).
2. **Canvas text in the HUD font.** There are 243 hard-coded `ui-monospace` strings, which Chrome on Windows doesn't support. Read `--mono` after `document.fonts.ready` (S).
3. **One headline per view:** a shared header slot with a 28–36px hero figure, sub-line and as-of. Today nothing is over 16px and titles sit at a different height in every view (M).
4. **Labels laid out by measured width:** the broadcast's 15px floor breaks the fixed offsets in Board, Session and Vol (S).
5. **Frame budget:** drop to DPR 1 when frames run slow, 30 fps when idle or under reduced motion, no backdrop blur over a moving 3D layer, opacity written only when it changes, take `nodes.find` and the double sort out of the per-frame loop (M).
6. **Daylight theme:** force dark tokens on `#jarvis`, or derive panel colours from the theme (S–M).
7. **Keys and scales on the older 2D chain views** (orbit, skyline, bubbles, 2D globe) (S).
8. **Finish reduced motion:** live listener; cover the boot glitch, the dock pulse and the 2D particles (S).
9. **Cross-fade between views,** keeping the last two GL pipelines alive (S–M).
10. **Phone layout from the safe area;** a "?" button for the key on short screens (M).
11. **Keyboard focus through canvas items,** plus an `aria-live` headline (M).
12. **New views:**
    - FLIP MAP: every market's distance to its gamma flip.
    - RANGE USED vs IMPLIED: a scatter.
    - THE DAY SO FAR: London 00–24, with releases as pylons over the move per 15 minutes.

## Wave 3: data and feeds

1. **`/api/helix/bundle`.** One payload built on the server after the desk run, with `{asOf, source, stale}` on each block. It replaces the 70–90 request fan-out in `gather()` (L).
2. **As-of chip on every view** from a shared loader result `{data, asOf, stale}` (M).
3. **Shared client cache with in-flight dedupe:** 3× oi-store, 3× bias-engine and 2× desk-run become one each (S).
4. **Server hot routes:** a shared promise in `getSessionStatus` (cold-cache OANDA fan-out); memoise the parsed oi-store and GEX per KV version (S).
5. **Slim headline feed:** `/api/drill-series?keys=…&tail=60` instead of the 236 KB bundle every 2 minutes (S).
6. **`/api/g10-rates` and `/api/funding-board`** from the new R2 capture (M).
7. **Helix daily record:** inputs, headline, plan, the text of every scene and the watcher summary, saved to R2 as `helix/days/<date>.json` for replay and scoring (M).
8. **Server-side `/api/vol-terrain`** replaces 25 `/ohlc-range` calls (M).
9. **Wire in data Helix doesn't use yet** (S each):
    - wider-market breadth
    - forecast hit-rates and QLIKE today
    - xccy basis, CVOL, FX carry
    - funding-read
    - event-impact and release-reactions
    - `dxyIce` in the tone scene
10. **Roll health from `rates-legs/_health.json`** on the Shockwave label and the System panel (S).
11. **Data-quality flags:** a `degraded` block makes the broadcast say "data partial" (S).
12. **Fixed refresh time for the drill bundle** (22:30 UK, after FRED/Cboe) in place of boot + 24 h (S).
13. **Intraday MOVE/DXY stress line** once a few weeks of `i15_` bars exist (S).

## Wave 4: sound, voice, broadcast

1. **Pre-render every line before recording** (see 0.13) (M).
2. **Loudness chain:** a limiter on the bus and a two-pass `loudnorm I=-14:TP=-1` in `encode()` (S).
3. **Duck the drone** about 8 dB under the voice. Whooshes only at segment changes (today 25–30 per video) (S).
4. **Captions (.srt) from the script timings** in frame mode, uploaded with `captions.insert` (needs the force-ssl scope) (M).
5. **Chapters in the description** from the bumper times; drop the "N s · voice:" line (S).
6. **Title carries the headline; tags from the markets named;** thumbnail from the headline card (S–M).
7. **One spoken-text normaliser:** pairs, bp, the Unicode minus, 2s10s, $, K/M/B, vs, Q3, 25-delta, prices, clock times, and the free text from the wire and skew scenes. SSML breaks after key numbers (M).
8. **ElevenLabs:** `speed`, `previous_text`/`next_text`, a pronunciation dictionary, and a check that the script fits the character budget before recording (S).
9. **Opening hook on the headline number;** a phrase bank keyed by date; day-on-day deltas; a sign-off that knows Friday (S).
10. **Keep the laptop awake** for the run (`SetThreadExecutionState`). Alert on FAILED (a site badge or Telegram via the server) (S).
11. **`--upload-only` and an upload retry queue;** `freezedetect`/`blackdetect` before upload (S).
12. **Desk run vs recorder profile clash** at 07:00–07:20; `wait_desk_run` skips a run that has not started yet (S).
13. **New formats:**
    - an audio-only podcast feed (MP3 + RSS from the WAV) (S);
    - a release-day special 30–45 min after a rank-3 print (M);
    - a Friday weekly recap (M);
    - a 45–60 s Short cut (M).

## Wave 5: overview and navigation

1. **TODAY home screen** (still, the default). One line from each section, each opening its picture: the broadcast lead, links broken, the top 3 unusual moves, board tone, the next big release, gamma walls, alerts (L).
2. **"Since you last looked":** links that broke or healed, new big moves, alerts sent. `deskSince` already exists in the terminal (M).
3. **Open in terminal from every market name or row** (`deskKchart.show`, `openPairPage`, `deskEventReplay.open`, `deskOiDrill.open`). No Helix file uses them today (M).
4. **Fix dead clicks:** RADAR rows never show the card while a panel is open; RANKED LIST rows only spin the globe (S).
5. **Command arguments and deep links:** `helix yields`, `helix board 1d`, `#helix/<view>`. Remember section, panel, window and region (S).
6. **`/` go-to box, 1–6 section keys, `?` help overlay** (S–M).
7. **Voice navigation:** "show yields" goes to the view, not to a paid ASK (S).
8. **One alert inbox:** the tab watcher, the server watcher and the desk alerts in one place, with the same dedupe, a cap and quiet hours (M).
9. **Telegram and notification links back** to the right view; the "while you slept" digest shown in Helix (S).
10. **Time scrub on every view** via the terminal's as-of mode (L).
11. **Trim duplicate views:** the chain drawn 6–7 ways, gamma 3, vol 2, currencies 2. Put them behind a "style" toggle; owner decision (M).
12. **Reachable plug-in panels:** the `render()` text of view modules (board3d, yields, dayahead…) can't be opened today (S).
13. **Pop-out second-screen mode** (M).

---

## Suggested order for a 24-hour push

Phase 1 runs first, alone. Its fixes touch shared files that the later lanes edit too: the `jf` loader, the voice client, broadcastPanels and stableRender. Once it lands, phases 2–4 can run as parallel lanes. They touch separate files, except the overlaps noted under phase 4.

1. **Wave 0 fixes plus the IBKR roll.** Everything in this phase is correctness or risk.
2. **Broadcast lane:** wave 4, items 1–3, 5–8 and 10–12.
3. **Data lane:** wave 3, items 1–6 and 10–11.
4. **Look-and-feel lane:**
   - wave 2, items 1–5 and 8;
   - wave 5, items 3–7.

   Overlaps with the other lanes: wave 2.3 puts the as-of chip in each view's header, so it needs wave 3.2's loader result. Wave 5.7's voice routing edits the same `jarvisView.js` voice path that the broadcast lane's pre-render work changes.
5. **Bigger builds after that:** the TODAY home screen, the analysis items in wave 1, the G10/funding view, and the new formats.
