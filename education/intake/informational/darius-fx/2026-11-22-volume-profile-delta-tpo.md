# Volume profile + delta + TPO: stacking a low volume node, single prints and a delta outlier (Darius FX short)

| | |
|---|---|
| Lane / source | informational / darius-fx (new creator; lane assigned provisionally, see sources.md) |
| Speaker(s) | DFX = Darius FX (tag every claim). OWNER = the owner's question "This an idea?" |
| URL | none (12 screenshots plus pasted voice-over) |
| ReelScribe id | none |
| Recorded | unknown; the post said "1 week ago" on 2026-11-22. Short animated explainer, about 12 frames |
| Processed | 2026-11-22 |

## Lesson
A price chart carries three separate kinds of information that a volume profile alone hides. Volume at price says
**where** trade happened, the delta profile (buy minus sell aggression at each price) says **who** was pushing, and the
TPO (Market Profile letters, time at price) says **how long** price stayed. Fat means accepted, thin means rejected.
The video's trade idea: after an impulse, look for one price where a low volume node, single prints and a delta outlier
coincide; when price returns to that zone and the sellers get absorbed, enter on the reclaim.

## Approach
- **Question**: where, who, how long, asked in that order, then "do all three agree at one price?" No benchmark and no
  horizon are named.
- **Evidence**: one drawn chart (a profile beside a short run of candles at 19,840 to 19,895, so NQ-like, instrument
  and date not stated). It looks designed rather than recorded: one clean impulse, round levels. No sample, no count,
  no losers shown.
- **Kill rule**: the stop sits under the zone; nothing says what would make him drop the idea.
- **Habit**: stack independent-looking descriptors at one price. Worth testing whether they are independent.

## Claims
| # | Claim (DFX) | Type | On file? |
|---|---|---|---|
| 1 | "Volume tells you where, it doesn't tell you who or how long." | understanding | ON FILE as description: `footprint.html` draws the volume profile, a delta panel and a TPO view with single prints outlined |
| 2 | "The fat bars are where the business got done." | description | ON FILE: POC and value area are computed in `value-migration-nq` (POC drift, VAH/VAL) |
| 3 | "Delta profile: who was aggressive there?" | mechanism | PARTLY: real aggressor flow exists only for 6E/6J (`orderflow-lead-aggressor` NULL as a lead, `footprint-absorption` NULL); NQ delta is a proxy (`value-migration-nq-delta-proxy` NULL; the proxy recovers r about 0.10 of the part price does not explain) |
| 4 | "Fat means accepted, thin means rejected." (TPO) | mechanism | PARTLY: `tpo-ib-follow` NULL (an accepted IB break does not carry to the close), `tpo-ib-fade` NULL (a failed poke is not a fade). Both test one level, the initial balance, not profile nodes |
| 5 | "This level traded heavy volume, but price barely stayed. That's not acceptance, that's size passing through." | mechanism, testable | UNTESTED. Heavy volume with little time is a volume-versus-TPO divergence. Nearest: `failed-auction-volume` (thin vs heavy probes, UNDERPOWERED: 621 setups, volume question unanswered) |
| 6 | "Single prints mean price ran through fast. So when it comes back, it should reject fast too." | trading | UNTESTED. Nearest: footprint agenda Q4 (revisit of stacked-imbalance zones, carded, not run); `day-recon-reach-forecast-specific` (levels no more special than comparable lines) |
| 7 | "A low volume node, single prints, and a delta outlier from the last push. All on one price. Price comes back. Sellers lean in and get absorbed... Buyers take control and it trends." | trading (confluence) | UNTESTED as a stack. Components are partly on file (3, 5, 6). Expect the first two to be one fact: a low volume node and a single print are both "little happened here", so they are two readings of the same thing |
| 8 | "Entry under reclaim, stop under the zone. Target the next high volume node." | entry and management | UNTESTED. Read against lesson #27: any such exit must be run on random entries first |
| 9 | "Comment bootcamp and I'll send you my order flow course." | sales funnel | A lead, not a source. 417 comments on the post. No P&L, no sample, no date |

## What we could learn
- **The three-lens frame is a good teaching device.** ALREADY DO in `footprint.html` (profile, delta, TPO with single
  prints outlined). A Theory Lab piece on reading the three together does not exist (only order-flow imbalance and VPIN
  lessons); optional, and only with the desk's verdicts beside it.
- **Count the independent facts before counting confluence.** LVN and single prints at the same price are likely one
  measurement twice. The first step of any test is the overlap between the flags. DO WORSE for confluence-style
  features generally (`live-range-confluence-book`, `combined-range` stack features; not checked this session whether
  they report pairwise overlap).
- **A single drawn example is not evidence of a setup.** DON'T DO; added to the Disagree table of
  `education/RESEARCH_METHOD_LESSONS.md`. It needs the distribution over all such zones against matched zones (lesson #1).
- **The "trap" is the testable part.** The claim that heavy volume with little time is "size passing through" is the
  one idea here that separates this from the nulls already banked.

## Research ideas
Carded in `.claude/skills/research-director/agendas/volume-footprints.md` as Q6 and Q7 (section "Added by intake
2026-11-22"). Candidates only; nothing started.
- **Q6** (11/15): returns to an impulse-left low-volume or single-print zone on NQ and ES 1-minute data, against
  matched zones with no such property; with the volume-high, time-low contrast from claim 5 as a named condition.
- **Q7** (9/15, gated on Q6): add a delta outlier at the zone, on 6E and 6J where the exchange aggressor flag exists.
- Not carded: the entry and exit rule (claim 8) until Q6 shows a zone effect at all; management is not an edge (#27).

## Quotes
- "Volume tells you where, it doesn't tell you who or how long." (DFX)
- "That's not acceptance, that's size passing through." (DFX)
- "Single prints mean price ran through fast. So when it comes back, it should reject fast too." (DFX)
- "Entry under reclaim, stop under the zone." (DFX)
