# Desk morning bias card: three calls instead of one (proposal)

Owner, 2026-11-14: "list how bias analysis would work if the desk was a real person", then "yeah that's fine"
to turning that routine into the desk's morning output. Frame from `.claude/skills/research-director/agendas/daily-bias.md`.
Status: **proposal**, nothing built. Fields marked *(after Q1/Q2)* stay empty until those studies bank a usable number.

## Why change the card

Today each instrument gets one call: `rating` LONG/SHORT/FLAT, `conviction`, `why`, `invalidation`, `size`, plus the
range `levels`.
- **Direction is the part with no validated daily edge.** Macro direction cells: 0 of 82 validated.
- **Range is the part with 41 validated entries.** Yet day type is not stated anywhere on the card.
- **FLAT mixes two meanings:** "no view" and "expect a range".
- **Currency biases and pair ratings can disagree.** The 2026-11-12 run: USD bias +1, yet GBPJPY was LONG and GOLD
  FLAT with "USD headwind". Nothing checks this.

Everyone reads the same public inputs. What separates bias makers is weighting, timing, abstention and expression.
The card should make each of those explicit, so that each can be scored.

## The card (per instrument, issued after Asia, ~07:00 UK)

| Field | Values | Source | Scored by |
|---|---|---|---|
| `day_type` | RANGE / EXPANSION / UNCLEAR, with `p_expansion` | Q1 model *(after Q1)*; until then the σ regime from the shipped lines, labelled as that | Q1 label, 07:00–21:00 UK |
| `direction` | UP / DOWN / NO VIEW | built in the order below | bias-scoreboard same-day row |
| `p_up` | probability; NO VIEW leaves it at the base rate | conviction mapping fixed in `forge/BIAS_SCOREBOARD_PREREG.md` | Brier vs B0 |
| `conviction` | low / medium / high | analysts | abstention curve (Q5) |
| `event_state` | CLEAR / PRE-RELEASE (flat until it prints) / POST-RELEASE (surprise sign, decay) | calendar + surprise store | Q2 horizons *(after Q2)* |
| `why` | one sentence, naming the layer that decided it | analysts | — |
| `invalidation` | the level or event that ends the view | analysts | — |
| `expression` | which pairs carry the USD view and which are hedges | portfolio step | coherence check |
| `levels` | unchanged: range lines for entries only | shipped | existing |

## The order the desk fills it (the "real person" routine)

1. **Calendar.** Any tier-1 US release today sets `event_state = PRE-RELEASE` on every USD instrument. Direction is
   NO VIEW until it prints, then POST-RELEASE with the surprise sign.
2. **One USD call first.** UP / DOWN / NO VIEW from rates, the Fed path, yields, the latest surprise and risk mood.
   Every USD pair and gold inherits it. A pair can differ only with a named local reason (e.g. JPY risk-off), and the
   card flags it as `override`.
3. **Local layer.** Gold real yields, JPY risk-off, index risk appetite and gamma, crypto flows.
4. **Day type.** RANGE means direction defaults to NO VIEW and the levels card says "fade the edges". EXPANSION means
   direction is allowed.
5. **Positioning.** On release days, a crowded leveraged-fund book tilts slightly against the crowd
   (`positioning-into-release-direction`, about +0.06 ATR). A tilt only, never a call on its own.
6. **Stand-aside rule.** Conviction low → NO VIEW. Expect a third to a half of instrument-days to be NO VIEW.
7. **Expression.** At most three instruments carry the USD view. They are sized as one position.

## Checks the server runs before publishing

- **Coherence:** every USD pair's direction matches the USD call unless `override` is set with a reason.
- **Event rule:** no UP/DOWN on a USD instrument while `event_state = PRE-RELEASE`.
- **Day-type rule:** no UP/DOWN with high conviction when `day_type = RANGE`.

## Scoring (where the verdict comes from)

Every field above with a "scored by" entry lands in the bias-scoreboard forward record. Max Cole's sides, the
surprise rule and B0 are scored on the same rows. At 60 shared trading days the owner sees which layer adds anything,
and the weights follow the record, not the story.

## Build order (when the owner says go)

1. Add `day_type`, `event_state`, `direction` / `p_up` and `override` to the debate output schema (`js/deskRun.js`),
   keeping `rating` as a derived alias for older pages.
2. Add the three publish checks, and a test for each.
3. Show the card in the Desk Terminal: day type first, then the USD call, then the pairs.
4. Wire the fields into the bias-scoreboard rows.
