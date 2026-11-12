# How to Learn and Master Quant Topics with AI ("how to learn (quant)")

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=p0zSzhBRp3k |
| ReelScribe id | j574c0tzsexbhpww559kw0754h8j0vyv · 45:00 (2,699 s) |
| Recorded | unknown |
| Processed | 2026-11-12 |

## Lesson
QG teaches one learning loop, used three ways. (1) **From scratch:** get a phased roadmap, then list the prerequisite
maths **for each phase**. Read worked lecture notes until no step is unclear, then do a graded problem set on your own
(easy word problems up to hard ones). Hand your answers back to be told where the gaps are, and move on only at 100%,
never at "80% is fine". (2) **Half-known subject:** take a short diagnostic quiz, rate how sure you are of each answer,
and get a prioritised gap list in dependency order (independence before least squares, orthogonality before PCA). Then
run loop (1) only on the gaps. (3) **At the frontier** (quadratic rough Heston+): start from what you already know
(Heston), add one change at a time, and check each new object against the simpler case it reduces to. Keep a short list
of follow-up questions. Build your own first-principles reading before you talk to the author. Then explain your
understanding back to find the next gaps. His theme: "learning about" a thing (repeating the CLT) is not mastery
(knowing where it breaks, such as fat tails). Mastery comes from many repetitions of the same problem in different
forms, and an LLM's suggestions are not a source of truth.

## Approach
- **Question (framing):** split the goal into phases with explicit prerequisites. A failure is read as "a specific
  missing piece", never "I'm bad at X". A gap is a named, fixable item.
- **Model choice and why:** for a new model, start from the nearest tractable relative (Heston: affine, closed-form
  vanillas by Fourier) and name exactly which property the extension loses (the LLM text he reads out and agrees with: "non-linear volatility feedback generally
  destroys the exponential affine closure"). Judge an extension by "is it parsimonious? Is it efficient? Is it
  effective?", not by whether it can fit, because "you can always model anything".
- **Validation:** (a) **nesting checks**: set the new parameter to its null value and confirm you get the old model back
  (H back to Brownian gives classical Heston; boost B = 0 gives QRH). (b) **Independent methods must agree before you
  change the dynamics**: Fourier/Riccati, a finite-difference PDE and Monte Carlo "should converge to the same price".
  (c) For learning, an explain-back loop: write out what you understand, let it be graded, refill the gaps.
- **Statistics he insists on:** distributions change over time; the CLT is roughly right locally but fat tails break
  it in practice ("tail-risk events would only occur once every couple hundred million years"). Mastery means knowing
  where a theorem stops holding, not just being able to state it.
- **Costs:** not covered (a learning video). He does say "there is no free lunch": mastery costs hours of repetition.
- **Failure modes:** moving on with 80% understanding ("everything builds on itself", so the gaps compound). Passive
  input (lectures, the "visual learner" label) instead of reading and solving problems. Taking LLM defaults as truth
  ("interpolated human knowledge text trained on the internet"; it set an 80% mastery target, which he calls part of
  the problem). Hand-waving in a worked solution.
- **Habit:** read the notes first, then solve every question yourself before looking at any solution, even the hard
  ones. Grade, fill the gaps, make a fresh set and repeat. Keep a running follow-up list while reading frontier
  material.
- **Kill rule (for a model):** not parsimonious, efficient or effective relative to the simpler model it nests.
- **Career context:** he works this way as a practitioner (reads papers, implements locally, e.g. rough vol "observed
  the power law dynamics"). He promises a part two on research, data mining and backtests.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "you cannot approach the higher-level material, backtest ... if you don't understand ... that distributions change over time" (QG) | method | ALREADY DO: era gate (pre-1996 training hurt, memory `feedback_lessons_on_track`); stationary/block bootstrap (`forge/evaltools.py`, `stats-defaults.md`) |
| 2 | CLT normality "does not hold even in the slightest" for stock returns because of fat tails (QG) | mechanism | Not an Evidence Book item (0 hits for "fat tails"/"kurtosis"). The desk already allows for it: Cornish-Fisher VaR and Sharpe SE with skew/kurtosis in `forge/evaltools.py`; weekend stop risk p99 2.1R (stop-risk map) |
| 3 | Leverage effect: "when the price gaps down ... significantly more vol, realized/implied" (QG) | mechanism | ON FILE: `drawdown-forecast-error-idx` and `-fx` VALIDATED (after a 20-day S&P fall, ranges run +6.6% / +5.9% above the IV-adjusted forecast; IV absorbs part of it, not all) |
| 4 | QRH+ boost term targets extreme 0DTE SPX skew (steep call wing, linear ATM, steep far-put wing) (QG) | mechanism | UNTESTED, not testable here: we have no 0DTE surface (Cboe intraday log is 15-min chain snapshots only, `project_cboe_intraday_log`). Theory Lab has `heston-model.html` and no rough-vol lesson |
| 5 | Independent numerical methods must converge before you trust a pricer (QG) | method | ALREADY DO in part: planted-signal positive control (`stats-defaults.md` 2026-10-21); reproduce the banked output exactly before a re-run (2026-10-24); planted gaps (2026-11-04) |
| 6 | Move on only at 100%; an 80% target "is contributing to the problem" (QG) | method (learning) | ALREADY DO for the build: blueprint layer order and validate each layer (`plans/FORECASTER_SYSTEM_BLUEPRINT.md`, memory `feedback_lessons_ground_up`) |
| 7 | "You don't have a visual learning style"; reading is how you learn hard things fast (QG) | method (learning) | Tension with Theory Lab's "Teach it four ways (VARK)" rule (`theory-lab-lessons` SKILL.md). See below |

## What we could learn
1. **Positive controls and nesting checks as a standing step.** His "validate each other before changing the
   dynamics" and "B = 0 reduces to QRH" are positive controls. **ALREADY DO**, but only as dated lessons in
   `research-protocol/references/stats-defaults.md` (2026-10-21, 10-24, 11-04). It isn't a prereg template field, so it
   happens when someone remembers. Change, if this repeats: one prereg line, "Positive control: the known effect or
   nested case this pipeline must recover before the real run".
2. **Gate on full understanding before the next layer.** **ALREADY DO** for the forecaster track (layer order, compliance
   review A1-A9). **DON'T DO** for the owner's own study path: Theory Lab paths (`theory-lab/assets/paths-data.js`) list
   an order but no per-lesson prerequisites and no "ready to move on" gate.
3. **Diagnostic quiz, gap list in dependency order, then targeted study.** **DON'T DO** as a learning tool. We have
   per-lesson self-test grading (`vark.js`) and drills (`practice.html`), but nothing that spans lessons and outputs a
   prioritised gap list. The research analogue (map what is known before asking) is **ALREADY DO**:
   `research-director` step 1, `evidence_map.mjs`.
4. **Start from the nearest model, add one change at a time, and name the property each change loses.** **ALREADY DO**
   in spirit (`research-director` angle "Incremental value"; "Decompose the headline"; null decomposition rule in
   `research-protocol`). The "name what the extension loses" framing is not written anywhere. A prereg could carry "what
   does this variant give up against the simpler baseline (tractability, sample, interpretability)?".
5. **LLM output is not a source of truth; check its defaults.** **ALREADY DO**: memories
   `feedback_check_catalogue_before_asserting`, `feedback_confidence_inverse_to_evidence`, `learn-intake` step 4
   (screen before writing "untested"). A useful reminder for a desk run with Claude: a default the model proposes
   (a threshold, a mastery bar, a horizon) needs a reason, like any other parameter.
6. **Learning styles.** **DISAGREE in part / DO WORSE in framing.** QG's claim matches the learning-science record
   (matching teaching to a "style" has little evidential support). Theory Lab's rule is called "Teach it four ways
   (VARK)". Several modes in one lesson (picture + equation + predict-first + worked example) is defensible as dual
   coding and practice, not as style-matching. The weaker part, by QG's standard, is effort: lessons give one faded
   worked example and a drill, not a graded problem set of increasing difficulty. Change if the owner wants it:
   rename the rule's rationale away from "styles", and add a 5-10 question problem set per lesson.
7. **Own interpretation first, then the author.** **ALREADY DO, with a different order for reproduction:**
   `feedback_get_the_source_before_reverse_engineering` asks for the author's code first when *reproducing* a tool.
   QG's order (own first-principles reading, then talk to Florian) is for *understanding* a model. They don't
   conflict: the source comes first for reproduction, your own reading first for understanding.
8. **Gaps are good news ("convexity").** **ALREADY DO** as research tone (`feedback_collaborative_research_tone`: say
   where each null points next).

## Research ideas
Not carded. The video makes no new testable market claim. The leverage effect is already VALIDATED
(`drawdown-forecast-error-idx/-fx`), and QRH+ 0DTE skew needs a 0DTE surface we don't hold. A non-research build idea
for the owner, not an agenda card: a Theory Lab "gap diagnostic" (a 10-question cross-lesson quiz with confidence
ratings that returns a gap list in dependency order and links the lessons to read), plus a problem set per lesson.

## Quotes
- [6:07] "there's a very big difference between learning about something and then learning for mastery" (QG)
- [9:09] "You need to see a thousand different flavors of the same problem to be able to connect the dots" (QG)
- [17:17] on the LLM's "aim for at least 80%": "This is not a source of truth. This is a source of what? Interpolated human knowledge text trained on the internet." (QG)
- [36:41] Fourier, PDE and Monte Carlo: "if they exist, then they should converge to the same price" (QG)
- [38:43] "You can always model anything, right? But it's like is it parsimonious? Is it efficient? Is it effective?" (QG)
