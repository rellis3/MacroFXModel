# How C.OG sets questions

Sources, rawest first: Discord (`education/cog-snippets.md`, quotes inside `forge/*_PREREG.md`), video transcripts
(`education/progression-path-breakdown-notes.md` appendix, `education/macro-variable-context-relevance-notes.md`),
course pages verbatim (`education/bank-verbatim/*/PAGE_TEXT.md`, `education/bank-verbatim/micro-learning-bank/build.md`
and `evidence.md`), the case study (`education/forecaster-portfolio-case-study/LESSON_0*.md`). Other
`education/*-notes.md` files are mostly our paraphrase. Quotes keep his spelling.

## His questions, verbatim

**Discord**
- MAE stop table, asked "Mean median p75 or p90?" (snippets §1, 2026-09-26): "none of the above xD / The correct
  approach: / So model and test in the data what changes does actual yield any predictive power / That's then going
  to be your noise threshold / Anything below that you don't include / Then past that threshold you're then going to
  have a noise threshold for each horizon type / Let's say / 2 weeks / 1 month / 1.5 months / 2 months / So on all the
  way up to maybe 6 or 12 months / This will then give you a distribution of results so you can can then see what
  carried the best value"
- VVIX/VIX vs Nasdaq (§3, 2026-10-23): "Take a look at the ratio between how vvix and Nasdaq are pricing in
  information / So model it as a ratio and say for every % Nasdaq prices in what is the relative priced in % of vix
  all per unit time / and then you want to create a time series of that ratio and see how it looks over time and when
  that ratio is at an extreme / What then happens / Will be very interesting / Might even just get yourself a system
  idea from this"
- Follow-up (§3b): "How quickly the ratio is changing could be modelled as dR/dt. Where R is the relative change of vix
  % at time t / the relative change of Nasdaq % at time t. Just make sure to factor in the sign as they're negatively
  correlated"
- Time stop vs z-score stop (§5, 2026-10-31): "First what I would map out before anything is your actual current trade
  distribution which would allow you to also have full mfe and mae analysis / This means that rather than just testing
  a stop idea we can actually engineer this to your systems distribution"
- ES strike map (§2): "This is an insight into dynamic hedging requirements, conditional feedback loops and market
  flows"
- (2026-11-01, quoted in `forge/STRESS_FILTER_HOLD_PREREG.md`): "test some simple filters, such as high stress or low
  stress"
- Basket vs one index (§6, DM 2026-07-28): "The best thing to do would be to target a basket of equities / Rather than
  Nasdaq alone / Probability of success is much much higher with this and will relatively easy to expand to"
- New systems, not more functions (§7, DM 2026-08-18): "an even better option would be to instead spread out into new
  system construction and then run everything at a portfolio level / This will open significantly more doors for you
  and then the risk diversification benefit is very real"
- Pinning vs acceleration (§7): "using variance and volatility intraday may be too noisy / What you'll need is possibly
  an external factor that has predictive power towards forecasting pinning vs acceleration / The place most people
  begin with that is open interest"
- Mechanism first, leg by leg (§8, DM 2026-10-08): "Sofr is to capture the us side of the leg / And then estr is to
  capture the ecb/€ side of the leg / And then a differential between those could potential have data that may not be
  filled priced into evenly between all market types / They're both short term rate benchmarks and a growth/tech stock
  like the Nasdaq is very sensitive to rates"
- Data sufficiency (§8): "6 months is also enough already to start doing some testing / It most likely doesn't go back
  further because of a contract roll potentially / So you can request a continuous series / Or try probe contract by
  contract"
- Sizing (§9, ~Oct 2026): "What I would be most interested in is how close the position sizing is to the theoretical
  ceiling / There could be soemtbung very valuable there that would also then close in that max dd / And even possibly
  increase returns"
- Pinned (§10): "If we know that within all systems, we have a distribution that includes both positive and negative
  returning positions / Rather than thinking okay how do I now completely remove the losses( this will never work and
  you'll overfit and end up killing the model) / You should instead understand okay I …"
- Information hierarchy (§11): "This is using a yield spread / Yields are the return on bonds and information hierarchy
  means that in …"

**Videos**
- "Looking at the OHLC data alone … there's probably some overfitting in hindsight you could use to say why this move
  happened … the chances of being able to repeat that are quite low"
- "That's only step one." Then characterise look-back, confirmation time, direction, whether the volatility component
  matters. "We don't want to characterise that was a low at 4 when we couldn't actually characterise that until 4:45 …
  no look-ahead, no future leakage"
- "Does this have predictive power? Positive expectancy? A large enough data set to validate it?"
- "is this equity curve an artifact? And if we model multiple different paths under the same systems distribution,
  how does that then look?"
- "Are they all consistent? Is there low volatility where the paths are close together and do they all have a
  structurally positive drift?"
- "are your ideas actually outperforming the market? Because if it's not outperforming buy and hold, then you don't
  want to be taking unnecessary risks to underperform a simple buy and hold."
- "before any capital is at risk. Is this likely to be a positively returning system or is this likely to be a
  negatively returning system?"

**Course pages**
- "Does holding an instrument only overnight beat simply holding it the whole time? We run it on two markets chosen
  because they should disagree — then take the trades through the prop firm toolkit to answer the separate question
  that actually decides funding: would it survive the rules?"
- "If the two instruments reach opposite conclusions, that is the finding." / "Run the mirror test … Overnight plus
  intraday should roughly reconstruct buy & hold." / "If gross is strong and net is flat, that is not a failed test —
  it's a real finding"
- "Eight correlated instruments. Where is the tradeable part, how do you isolate it, and what is left once you test it
  honestly?"
- "instruments that drift away from the group tend to come back. That is an idea, not a model. … decide now how much
  of the final result you expect to survive."
- "Every idea starts with a universe, and the first honest question is how independent its members really are."
- "Group every observation by how far the residual had already drifted, then measure what happened the following day."
- "Nothing here depended on this being mean reversion, or on there being eight instruments. So what changes when the
  idea is momentum, or carry, or something you noticed yourself last week?"
- "Where does today's ATR sit relative to the last 6-12 months? This percentile rank tells you the regime."
- "The diagnostic question is never 'is NQ RR negative?' (yes, always). It is 'is NQ RR more or less negative than its
  recent distribution?'"
- "Divergences don't tell you what to do — they tell you to investigate. Why are markets disagreeing? What would
  resolve the divergence?" / "Does past X improve forecasts of Y beyond Y's own history?"
- "The fundamental question is not 'how well does my model fit?' but 'how well does my model predict?'" / "'Why would
  this predict returns?' is the key question." / "Does the model work in 2000-2010 AND 2010-2020? In bull AND bear
  markets?"
- "Where does the realised maximum drawdown sit among the simulated ones? What is the probability of a loss over six
  months…? How long does recovery from a drawdown of given depth typically take?"
- "How many variations did you try before this one, and where are they?"
- "Always ask: is this effect large enough to matter after costs?"
- "you stop asking 'What is the market doing now?' and start asking 'Why is it moving, and what is next?'"

## The structure under them

| Element | What it does | His example |
|---|---|---|
| **A. Construct** | build a derived variable before asking anything: ratio, speed (dR/dt), residual, differential, percentile | "model it as a ratio … per unit time" |
| **B. Condition** | turn it into a time series and condition on a state: extreme, regime, bucket | "when that ratio is at an extreme / What then happens" |
| **C. Noise threshold** | find where changes stop being noise; build only above it | "That's then going to be your noise threshold" |
| **D. Horizon family** | sweep look-backs or holding windows as a dimension | "2 weeks / 1 month / … 6 or 12 months" |
| **E. Distribution** | read the distribution of outcomes or paths, not a point | "a distribution of results … what carried the best value" |
| **F. Knowable when** | stamp at confirmation, not at the print | "until 4:45" |
| **G. Direction vs volatility** | asked separately | "whether the volatility component matters" |
| **H. Benchmark / control / mirror** | buy-and-hold, an instrument that should disagree, the mirror leg, gross vs net | "two markets chosen because they should disagree" |
| **I. The separate practical question** | profitability and rule survival are different questions | "would it survive the rules?" |
| **J. Relative to its own history** | percentile of itself, not an absolute level | "more or less negative than its recent distribution" |
| **K. Context relevance** | a variable from outside the chart with an economic reason to lead | "Why would this predict returns?"; "an external factor that has predictive power towards forecasting pinning vs acceleration" |
| **L. Mechanism first** | name what each leg captures and why the target should care, before testing | "Sofr is to capture the us side of the leg / And then estr … the ecb/€ side" |
| **M. Sizing as its own dimension** | where sizing sits against its theoretical ceiling, separate from the entry rule | "how close the position sizing is to the theoretical ceiling" |
| **N. Breadth / portfolio level** | more instruments or more systems before more filters on one | "target a basket of equities rather than Nasdaq alone"; "run everything at a portfolio level" |

**Template at his level:** *Build [derived variable] from [X, Y] (per unit time). Make it a time series. When it is at
an extreme / in [regime], what happens to [outcome] over [a family of horizons]? Find the noise threshold below which
it carries no predictive power, and compare the distribution of results across horizons against [buy-and-hold / a
control / the mirror].*

He leaves "extreme", the time unit and some inputs open on purpose (snippets "Not stated by C.OG (open)"). Keep that
in the statement; the spec line says what the sweep covers.

## His vocabulary

- **variance vs drift**: the spread of possible paths vs the true average slope; "the drift is always going to win";
  short-run profit is "favorable variance".
- **distribution / paths / artifact**: a system is a distribution; one equity curve may be an artifact.
- **noise threshold**: size below which a change carries no predictive power, per horizon.
- **horizon type**: a look-back or holding window, swept.
- **predictive power**: his test word.
- **priced in**: how much information a market has already put into its price.
- **ratio per unit time, dR/dt**: relative pricing and its speed; keep the sign.
- **extreme**: the tail of a constructed series; left undefined in the question.
- **context relevance**: an outside variable with an economic link (the opposite of hindsight on OHLC).
- **confirmation lag**: a turn is known when confirmed, not when printed.
- **characterise**: turn a seen pattern into a specification.
- **residuals, PCA, components**: remove shared movement, trade what is left; a component "is a direction, not a cause".
- **regime**: vol percentile, stress, growth/inflation quadrant.
- **MAE/MFE**: engineer stops to the system's distribution.
- **benchmark**: buy-and-hold.
- **dynamic hedging, conditional feedback loops, market flows**: his options framing.
- **external factor**: an input from outside the price series (his phrase for context relevance), e.g. open interest.
- **pinning vs acceleration**: whether price holds near a level or extends its range; a range question, not direction.
- **theoretical ceiling**: the maximum sizing the system's distribution supports; distance from it is a lever on max dd
  and returns.
- **portfolio level / risk diversification**: run several systems together rather than refine one.
- **leg**: one side of a spread and what it captures ("the us side of the leg").
- **information hierarchy**: the order in which markets price information (rates/bonds first, then credit, FX,
  equities; course page Cross-Asset Synthesis).
- **continuous series vs contract by contract**: two ways round a futures roll.

## What he says not to do

- Pick a stop from a descriptive percentile; test a stop idea instead of engineering it from the distribution.
- Explain a move after the fact from one chart.
- Stamp a turn at the print.
- Trust short-run profit or one equity curve.
- Deploy what doesn't beat buy-and-hold; take anyone's word for anything.
- Search the held-out period ("the held out period answers one question once").
- Read a residual's short half-life as evidence (mean-reverting "by construction").
- Name a PCA component and reason about the name.
- Bury a gross-strong / net-flat result, or write off a control leg.
- Confuse fit with prediction, or significance with size after costs.
- Forget the variations: "How many variations did you try before this one, and where are they?"
- Try to remove all the losses: "this will never work and you'll overfit and end up killing the model" (§10).
- Rely on intraday variance and volatility alone to forecast pinning vs acceleration: "may be too noisy" (§7).
- Keep adding functions to one system when new systems at portfolio level would diversify more (§7).
