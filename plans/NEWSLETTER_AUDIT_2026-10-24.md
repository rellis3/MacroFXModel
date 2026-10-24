# Newsletter audit, issue of 24 October 2026

A pass over the figures, dates and claims in the magazine edition (V2). Nothing here changes a threshold or a calculation. Each item says what was found, what was done, and what still needs a human check.

## Found and fixed

| # | Where | What was wrong | What changed |
|---|---|---|---|
| 1 | Page 2, yield figure | The 10-year (-32bp), real yield (-28bp) and expected inflation (-2bp) did not add up. Cause: the 10-year and the real yield last printed on 22 Oct, expected inflation printed again on 23 Oct, so the figure mixed two dates. On the shared date, 22 Oct, expected inflation is -4bp and -28 plus -4 equals -32 exactly. The 87% was real over nominal on mixed dates. | The figure and its caption use one shared date (`alignedYield` in atlas.html). The later expected-inflation print is named and left out. The share is real yield over the 10-year on that date. Test: end labels equal the caption numbers. |
| 2 | Data Desk, borrowing-cost table | Credit moves were multiplied by 100 twice, so +13bp printed as +1300bp. | Printed as received, in basis points. Test added. |
| 3 | Option zone note | "Dealers are positioned so their hedging tends to amplify moves" read as an observed behaviour on markets where it is untested. | Conditional wording where untested ("If dealers are positioned as the open interest suggests, their hedging would tend to ..."). The plain statement is kept only for the S&P 500, where the ledger validated it. |
| 4 | Accountability page | Size forecast and the directional read were blended into one right-and-wrong list. | Two separate sections. The directional review is labelled a separate test and does not feed the size record. Sample size and provenance stated. |
| 5 | Data Desk order | Part numbers ran 1, 2, 3, then 1 again. | Groups A Signals, B The world, C Currencies, D Every market. |

## Flagged, needs checking

1. **"The dollar is bought anyway" is not confirmed.** The claim rests on the broad dollar index (+0.9%), whose last print is 16 Oct, seven days before the newest data. Over the same 20 days to the latest close, the daily dollar pairs show the dollar stronger against 1 of 7 majors and weaker against 6 (EUR/USD -0.4%, GBP/USD +1.0%, USD/JPY -0.6%, AUD/USD +1.1%, USD/CAD -1.7%, USD/CHF -0.5%, NZD/USD +1.6%). The two measures cover different windows and point different ways. The issue now says so on pages 1 and 4. What to check: whether the headline should say the dollar was bought, or use a daily dollar measure for the story's window. The headline and the brief's text were not edited.
2. **Series that lag the rest.** `js/dataChecks.js` flags any series whose last print is more than three days older than the newest. Today that is the broad dollar index and the EM dollar index (both 16 Oct).
3. **The brief's own numbers.** Checked against the data: 10-year -32bp (matches), real yield -28bp (matches), Nasdaq -5.9% (matches -5.86%), gold -3.5% and below $4,000 (matches, $3,996), high-yield spread +30bp (matches, 3.10% to 3.40%), dollar +0.9% (matches the index, window issue above). Not independently checked: the brief's causal sentences ("a growth warning", "investors are paying for safety"). They are presented as the desk's reading, set against four competing hypotheses.

## Definitions the issue now states

- The 33 chain links are a fixed list, the same every day, not picked after seeing a move. A link is judged on 20 calendar days at both ends. If either end moved less than its noise floor it is quiet. If both moved, it holds or is broken by direction. The floors are fixed numbers in `js/macroChain.js`. Seven markets were added on 23 Oct 2026 after a five-year screen of history (`analysis/chain_candidates.mjs`), not this week's moves.
- The explanation labels count agreeing checks. They are not probabilities, and three of four explanations fit every check they can be tested on, so the count cannot choose between them.

## Evidence status labels

Observed data, model output, tested association, context not a signal, hypothesis, untested interpretation. Every figure or section carries one.

## V4: reader's edition (same day)

The research and every threshold are unchanged. What changed is how each result is explained, from `js/newsletterExplain.js`, so words and figures come from the same data.

- **Opening in three voices.** What the data shows (green), what it might mean (blue), what we cannot confirm (amber). A contradiction is stated only when the data shows it.
- **Every exhibit explains itself.** What you are looking at, why it matters, what it tells us, and what is uncertain, under the yield figure, the chain, the audit, positioning and each Data Desk section.
- **Chain counts reconcile.** 33 defined, 27 measurable (6 lack data), 10 quiet, 17 judged, 13 held, 4 broke. Links that use a series that stops early are marked timing unconfirmed, not a clean break.
- **Stress.** The broad warnings are listed with reading and trigger, the nine watched conditions are split into broken relationships, setup watches and background context, and the closest warning to tripping is named. The dial counts measurable warnings only (5 of 6 today).
- **Explanations.** Each states what it means, what we would see if true, what fits, what does not, which other stories look the same, and what would separate them. Broken links none of them speak to are listed as unexplained.
- **Headline.** The dollar part of the headline is marked unconfirmed under the headline. The headline text itself is not edited.
- **Data Desk.** Market blocks with the story's markets first, a key for the repeated definitions, and one shared dealer-effect caveat.
