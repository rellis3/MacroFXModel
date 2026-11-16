# One desk bias (2026-11-16)

Owner, 2026-11-16: one decisive bias per market for the day, and stick to it. If a quant read is a coin flip and serves
no purpose, hide it; if it serves a purpose, keep it and show it as what it is, a slower data-driven bias next to the
discretionary one.

## The rule

| Layer | What it is | Where it shows | Moves |
|---|---|---|---|
| **Desk call** (the one lean) | The morning desk run's rating per market (`/api/desk-run`, `head.book.instruments[n].rating`; the summary `head.ratings`) | Desk Terminal Assets cards ("Desk call" label), today.html card lean chip ("Desk ▲ LONG"), card accent, "wrong if" price, lean groups, Market Picture, drawer timeline | Once a day (issued ~07:50 London). Intraday desk updates show only in the full card view as an "intraday note", never as a change of call |
| **Macro tilt (slow)** | The bias engine (`js/biasEngine.js`, theory-v1), relabelled from "Engine" | Beside the desk call on the terminal cards; Currencies, Pair, Overview, Macro section; "tilt differs" chip when it disagrees with the desk call | Weeks, not hours |
| Retired from the card face | today.html direction tag (`directionFor`), about 42% at the next close on its own ledger | "tape tag" chip inside All reads only | Its calculation and its forward ledger (`ledgerCallFor`, the morning snapshot) are unchanged, so its record stays comparable |

## Why the desk call is the headline and not a quant read

The 2026-11-15 daily-bias review (plans/DAILY_BIAS_REVIEW.md, bias-evidence.html) found no public-data source that calls
next-day direction above a coin flip: MTF structure, HMM, slow clock, regime rules, positioning, quadrant, coherence and
meta-labelling were all null or underpowered, with evidence packs. A quant direction call would therefore be a coin flip
wearing a number. The desk call is at least one decision, made once, and it is scored every evening (Desk Score,
`/api/desk-score/record`) and on the same-day bias scoreboard beside the engine and Max Cole's signals
(`/api/direction-ledger?sameday=1`). It is interim: 6 eligible days at 2026-11-16, S mean −0.15. It earns trust only
from that record.

## The macro tilt's visibility

The engine had never been back-tested when it shipped. A point-in-time back-test is running on branch
`claude/bias-engine-backtest` (prereg in forge/). Its verdict decides the tilt's visibility:

- **Holds at 5 or 20 days:** keep it, labelled with its measured hit rate.
- **Context only:** keep it in the Macro section and the full card view; take it off the card face.
- **Null:** hide it from the desk login (a tabRegistry `preview` reason). The owner still sees it, and forward scoring
  continues.
