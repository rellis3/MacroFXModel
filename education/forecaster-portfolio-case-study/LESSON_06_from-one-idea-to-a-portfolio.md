# Case Study: The Forecaster Portfolio — Lesson 06 of 17

## From One Idea to a *Portfolio*

> **Source:** Colez Trades (cog) education, "Case Study: The Forecaster
> Portfolio". Module 02 · The System. Case Study · Lesson 06 of 17 (CS · 06).
> Page: cog000.github.io/Forecaster-Portfolio-Case-Study/lesson-06/
>
> **Transcription note:** copied from full-page screenshots of the lesson,
> taken 2026-10-27 in a desktop browser (1200 px wide) after entering the
> access key and accepting the disclaimer. Nothing has been added or inferred.
> The original screenshots are kept in `screenshots/lesson-06/`: 01–31 are the
> page in order, and 32–40 are landscape close-ups of formula boxes 01–09.
> Each figure below names the screenshot it appears in and is described in
> words (axes, lines, colours, labels, caption), as shown. Where something was
> not visible it is marked **[not captured]**. Checkpoint answers are listed
> as shown; the lesson did not mark a correct answer.
>
> **Also from the page (2026-10-27):** the charts step through numbered stages
> as they appear, and the screenshots show each chart's final stage. The
> titles of the earlier stages, and the disclaimer shown before the lesson
> opens, were read from the page itself and are marked *(from page)*. Only
> text shown on the page was used.

**Before you begin** *(from page; a disclaimer shown, and accepted, before the lesson opens)*

*Educational purpose*

This case study is educational. Nothing in it is financial or investment
advice, a recommendation, or an offer of any service, and we do not offer
signals. It does not take account of your circumstances, and any decision you
make is your own.

*About the track record*

Every return and ratio attributed to the Forecaster Portfolio comes from a
historical track record: the system's parameters applied to historical data.
It is not a record of live trades or real capital. Only charts labelled
Historical track record show its results; the others are teaching
illustrations or published research.

*Risk*

Past performance, whether actual or simulated, is not a reliable indicator of
future results. Trading carries a high risk of loss, including loss of more
than your initial capital with some leveraged products. We take care over
accuracy but cannot guarantee it, and accept no liability for decisions based
on this material.

Tick box: "I have read and understood this disclaimer." Button: "Continue".

*Ten legs in two books. How separate sources of return combine, measured on the Forecaster Portfolio's own correlation structure.*

### The arithmetic of *diversification*

*What ten legs with near-zero correlation buy, and where the arithmetic stops.*

| | |
|---|---|
| Series | Case Study: The Forecaster Portfolio |
| Subject | Portfolio construction evidence |
| Method | Correlation, random matrices, tail dependence |
| Reading time | About 45 minutes |

A single edge is a source of return; a portfolio of edges is a source of
return with less risk, provided the edges are different from one another. The
Forecaster Portfolio holds ten legs in two books, and this lesson measures how
different they are: the correlation between them, how many independent sources
of risk they amount to, and whether their independence survives the worst
days.

The evidence is the record's own correlation structure, shown as images and
summarised in the text. Legs are numbered, never named. The record's figures
are shown before trading costs; a later costing module adds them. The lesson
also sets out the theory behind each measurement, from Markowitz's arithmetic
to random-matrix theory and tail dependence, so that the Forecaster
Portfolio's numbers can be read against what the theory leads one to expect.

---

## §01 · Diversification

### Why a *portfolio*

*The arithmetic of combining sources of return, and what the record's legs
achieve.*

Markowitz's insight of 1952 was that the risk of a portfolio depends not only
on the risk of its parts but on how they move together. For N sources of
return with equal volatility σ and average pairwise correlation ρ̄, the
variance of an equal-weight portfolio is σ² multiplied by 1/N plus (1 −
1/N)ρ̄. The first term falls towards zero as sources are added; the second
does not. Average correlation sets a floor beneath which no amount of
diversification can push risk, which is why diversification is often described
as the only free lunch in finance and why the lunch is smaller than it looks
when the sources are related.

Figure 1.1 shows the arithmetic. With independent sources, volatility falls as
one over the square root of N: ten sources leave 31.6% of a single source's
volatility, forty leave 15.8%. With an average correlation of 0.1 the curve
flattens early; at 0.3 it stops at 54.8% however many sources are added, so
that forty correlated sources are worth about five independent ones.
Everything a portfolio can buy is decided by the correlations, not by the
count.

**01 · DIVERSIFICATION — The variance of an equal-weight portfolio**
*(screenshots 03, 32)*

    σ_p² = σ² [ 1/N + (1 − 1/N) ρ̄ ]

*Takeaway:* Variance falls with the number of sources N towards a floor set by
their average correlation ρ̄.

**FIGURE 1.1 — What correlation decides** *(screenshots 03, 04; animated,
stepped)*

- **What it shows:** portfolio volatility, % of one leg's (y-axis 0% to 100%;
  ticks 0%, 25%, 50%, 75%, 100%) against number of legs, equal weight (x-axis
  1 to 40; ticks 1, 10, 20 and "40 legs"). Four smooth curves all start at
  100% at one leg and fall steeply, then flatten:
  - a red curve, the highest, ending at 40 legs at "71.6%";
  - a grey curve below it, ending at "56.3%";
  - a dark curve below that, ending at "35.0%";
  - a green curve, the lowest, ending at "15.8%", with a marker at 10 legs
    labelled "Ten independent legs · 31.6%" (green).
- A dashed horizontal line sits at 54.8%, with a grey marker on it at 25 legs
  labelled "Floor at correlation 0.3 · 54.8%". Each curve ends at 40 legs with
  its value labelled: red "71.6%", grey "56.3%", dark "35.0%", green "15.8%".
- Pale shading fills the area under the curves (pinkish towards the red curve,
  grey towards the bottom). No legend is drawn on the chart as captured; the
  caption names average correlations of 0, 0.1, 0.3 and 0.5. *(from page)* The
  chart's data lists the legend as: green "Correlation 0", dark "0.1", grey
  "0.3", red "0.5".
- **Step 3 (shown at the top of the chart) — "3 · At an average correlation of
  0.3, forty legs are no better than about five independent ones".**
- *(from page)* Step 1: "Independent legs: volatility falls as one over the
  square root of N".
- *(from page)* Step 2: "Correlated legs fall towards a floor set by the
  average correlation".
- **Caption:** *Volatility of an equal-weight portfolio against the number of
  legs, as a share of one leg's, for average correlations of 0, 0.1, 0.3 and
  0.5.*
- Source tag: ANALYTIC · MARKOWITZ

The Forecaster Portfolio was built on that arithmetic. Its ten legs are
separate sources of return, grouped into two books: Book A holds Legs 1 to 5
and Book B holds Legs 6 to 10. The legs are numbered rather than named, and
nothing about what any leg does is described in this series. What can be
measured is how they move together, and the answer is that they barely do: the
average pairwise correlation of their daily returns is 0.000.

Figure 1.2 is built from the record's own correlation matrix. It adds the legs
one at a time, in order, and shows the volatility of the equal-weight
combination as a share of a single leg's. After five legs the combination
carries 0.489 of one leg's volatility; after all ten, 0.316. The curve lies on
top of the line for independent legs, because with an average correlation of
zero the arithmetic of Markowitz delivers the whole of its promise: the
portfolio has 31.6% of a leg's volatility, a reduction of 68.4%, with each
leg's expected return intact.

**FIGURE 1.2 — Risk falls as the legs join** *(screenshots 04, 05)*

- **What it shows:** portfolio volatility, % of one leg's (y-axis 0 to 100,
  ticks every 20) against legs combined, in order (x-axis 1 to 10). Legend,
  top right:
  - a grey dashed line, "Independent legs: 1/√N";
  - a thick green line with round markers at each leg, "The record's legs, from
    the real correlation matrix".
- Both lines start at 100 at one leg and fall together. The green line sits
  just above the dashed line from three legs onwards and meets it again at ten
  legs.
- **Markers:** green "5 legs · 48.9%" above the line at five legs; green "10
  legs · 31.6%" above the end of the line at ten legs.
- **Caption:** *Volatility of the equal-weight combination of the record's
  legs, added in order, as a share of one leg's, built from the real
  correlation matrix and compared with the line for independent legs.*
- Source tag: HISTORICAL TRACK RECORD · CORRELATION MATRIX · SUMMARY
  STATISTICS

Equal weights are the simplest case, and the arithmetic generalises. If legs
differ in volatility, weighting each by the inverse of its volatility gives
every leg the same risk budget, so that no single leg dominates the
portfolio's variance; weighting so that each leg contributes equally to total
risk, with correlations taken into account, is the principle of equal risk
contribution. Both are ways of making the count of legs mean what it appears
to mean. A portfolio of ten legs in which one carries half the risk is, in the
terms of this lesson, a portfolio of far fewer than ten.

A single number summarises how much a portfolio has gained from its structure.
Choueifaty and Coignard's diversification ratio divides the weighted average
of the legs' volatilities by the volatility of the portfolio itself. For
independent legs of equal volatility it equals the square root of N; for
perfectly correlated legs it equals one. For the record's ten legs, with
average correlation 0.000, the ratio is about 1 divided by 0.316, which is
3.16, the largest value ten legs can achieve. §03 asks the related but
distinct question of how many independent sources of risk the ten legs really
amount to.

The consequence for the risk-adjusted return is direct. If ten legs had equal
expected returns and equal volatility and were independent, the portfolio's
Sharpe ratio would be √10, about 3.16, times a single leg's. The legs are not
equal, and the next chapters examine how far from independent they are, but
the direction of the effect is what matters here: the portfolio's Sharpe ratio
of 3.51, reported in Lesson 8, is the property of the combination, and no
single leg is expected to show it.

This is also why Lesson 2 insisted on breadth. The research programme that
produced the Forecaster Portfolio searched many directions and kept the few
that produced edges; a portfolio needs not only edges but edges that differ,
and the value of each new leg is set by its correlation with the legs already
held rather than by its own return alone. A tenth leg correlated 0.5 with the
others would add little; a tenth leg uncorrelated with them adds almost a full
independent source.

> *Average correlation sets the floor. At zero, ten legs deliver the whole of
> what diversification can promise.*

**CHECKPOINT** — Ten legs have an average pairwise correlation of 0.3. Roughly
what share of one leg's volatility does the equal-weight portfolio carry?
- 31.6%
- About 60%
- About 10%

---

## §02 · Correlation

### The correlation *structure*

*Reading the matrix, and knowing which of its numbers are real.*

A correlation matrix for ten legs holds forty-five distinct pairs. Figure 2.1
shows the record's, redrawn: each cell is the correlation of two legs' daily
returnsover *[sic: no space on the page]* the record. Blue cells mark pairs that move together, red cells
pairs that move apart, and pale cells pairs with no measurable relation. The
matrix is almost entirely pale. The strongest pair, Legs 4 and 5, reaches
0.420; the most negative pair reaches −0.170; everything else lies close to
zero.

The two books are visible in the structure. Within Book A the average
correlation is 0.049, within Book B 0.008, and across the books −0.023. The
books are not merely administrative groupings; they are sources of return that
are as unrelated to each other as the legs within them, which is what §04
relies on when it asks whether one book's worst days are the other's.

**FIGURE 2.1 — The correlation matrix of the ten legs** *(screenshots 07, 08)*

- **What it shows:** a ten-by-ten correlation heatmap, rows and columns Leg 1
  to Leg 10 (columns labelled at an angle). The title "Book A" sits above the
  first five columns and "Book B" above the last five; thick dark lines
  separate Legs 1–5 from Legs 6–10, in both directions. Each cell shows its
  correlation to two decimals. Colour bar at right, "Pairwise correlation of
  daily returns", from −0.6 (dark blue) through 0.0 (white) to 0.6 (dark red);
  ticks −0.6, −0.4, −0.2, 0.0, 0.2, 0.4, 0.6.
- The diagonal cells are dark red (no number shown). Cell values, row by row
  (off-diagonal):
  - Leg 1: −0.03, 0.07, 0.04, −0.01 | −0.01, 0.01, 0.03, −0.13, 0.03
  - Leg 2: −0.03, 0.04, −0.01, 0.00 | −0.04, 0.00, 0.02, 0.00, −0.02
  - Leg 3: 0.07, 0.04, 0.01, −0.04 | −0.02, −0.04, 0.01, 0.05, −0.06
  - Leg 4: 0.04, −0.01, 0.01, 0.42 | 0.03, −0.06, 0.00, −0.01, −0.07
  - Leg 5: −0.01, 0.00, −0.04, 0.42 | −0.05, −0.07, −0.17, −0.02, 0.01
  - Leg 6: −0.01, −0.04, −0.02, 0.03, −0.05 | 0.05, 0.02, 0.04, 0.01
  - Leg 7: 0.01, 0.00, −0.04, −0.06, −0.07 | 0.05, 0.05, −0.02, −0.01
  - Leg 8: 0.03, 0.02, 0.01, 0.00, −0.17 | 0.02, 0.05, 0.04, −0.03
  - Leg 9: −0.13, 0.00, 0.05, −0.01, −0.02 | 0.04, −0.02, 0.04, −0.07
  - Leg 10: 0.03, −0.02, −0.06, −0.07, 0.01 | 0.01, −0.01, −0.03, −0.07
  (In each row the cells to the left of "|" are Legs 1–5 and those to the right
  Legs 6–10, with the leg's own diagonal cell omitted.)
- The Legs 4–5 cells (0.42, twice) are mid-red; the Leg 5–Leg 8 and Leg 1–Leg 9
  cells (−0.17 and −0.13, each twice) are pale blue; every other cell is near
  white or very pale.
- **Caption:** *Pairwise correlation of the legs' daily returns over the
  record, redrawn from the fixed matrix. Books A and B are separated by the
  lines.*
- Source tag: HISTORICAL TRACK RECORD · CORRELATION MATRIX

What does near-zero correlation buy? Figure 2.2 answers in variance. For ten
equal-weight legs, portfolio variance as a share of one leg's is 10% plus 90%
of the average correlation. At the record's average of 0.000 it is 10%, the
independent value; at 0.3 it would be 37%. Each tenth of average correlation
costs nine percentage points of variance reduction, and the record gives up
almost none of it.

**FIGURE 2.2 — What near-zero correlation buys** *(screenshots 08, 09)*

- **What it shows:** portfolio variance, % of one leg's (y-axis, ticks 0%, 25%,
  50%) against average pairwise correlation (x-axis, ticks 0, 0.2, 0.4, 0.6).
  A single dark straight line rises from the left edge of the plot (about 5% at
  an average correlation of about −0.05) to the right end at 0.6, with grey
  shading beneath it.
- **Markers:** a green dot at correlation 0 labelled "The record · 0.000 · 10%
  of a leg's variance" (green); a red dot at 0.3 labelled "0.3 · 37%" (red); a
  dark dot at 0.6 labelled "64.0%".
- **Caption:** *Variance of an equal-weight portfolio of ten legs as a share
  of one leg's, against the average pairwise correlation, with the record
  marked.*
- Source tag: ANALYTIC · MARKOWITZ

Pearson correlation, the measure in the matrix, captures the average linear
relation between two legs. Two legs can be linearly uncorrelated and still
related, moving together only on their largest days, or related through a
curve rather than a line; rank correlation, which compares the ordering of
returns rather than their size, is less sensitive to a few extreme days, and
the two measures are compared when a pair is suspected of hiding dependence in
its tails. For the record the two tell the same story in the matrix as a
whole, and §04 goes to the tails directly.

A matrix of near-zero pairs also answers a question that a single correlation
cannot: whether the legs share a common factor. If one hidden driver moved
every leg, pairwise correlations would be modestly positive throughout, and
the first eigenvalue of the matrix, examined in §03, would stand far above the
others. The record's matrix shows neither. Its two negative pairs are as small
as its positive ones, and should be read the same way: as values within
estimation noise rather than as hedges, since a correlation of −0.170 is no
further from zero than the noise allows.

Not every number in a correlation matrix is real. A correlation estimated from
T observations carries a standard error of about (1 − r²)/√T, whichfor *[sic: no space on the page]* the
record's 1,181 days is about 0.029 near zero. A measured correlation of 0.05
is therefore indistinguishable from nothing, and a matrix of forty-five pairs
estimated from the same data will show several values of that size by chance
alone. Only pairs well beyond twice the standard error can be treated as
structure; by that test the record has one, Legs 4 and 5 at 0.420, and §03
shows that the same conclusion follows from the mathematics of random
matrices.

Correlation is also a limited description. It measures the average linear
relation between two legs over the whole record, with every day weighted
equally; it says nothing about whether the relation strengthens on the worst
days, which is the question of §04, or whether it changes between regimes, the
question of §05. The matrix is the starting point of the analysis of
diversification, not its conclusion.

> *Forty-five pairs, one of them clearly real. The rest lie within the noise
> of estimation, which is exactly what independent sources should look like.*

**02 · ESTIMATION — The standard error of a correlation** *(screenshots 10,
33)*

    SE(r̂) ≈ (1 − r²) / √T  ≈  0.029  at T = 1,181

*Takeaway:* A correlation estimated from T observations is uncertain by about
(1 − r²)/√T; near zero, about 0.029 over the record.

**CHECKPOINT** — A pair of legs shows a correlation of 0.05 over 1,181 days.
What should be concluded?
- The legs are related
- Nothing: the value lies within the estimation noise of about 0.03
- The legs are negatively related

---

## §03 · Random matrices

### Random matrices and *effective bets*

*Which structure in the matrix is real, and how many independent sources of
risk the legs amount to.*

§02 ended with a test of single correlations. A matrix can be tested as a
whole, through its eigenvalues. Any correlation matrix can be decomposed into
independent directions of variation, each with an eigenvalue measuring how
much of the total variance it carries; ten legs give ten eigenvalues summing
to ten. If the legs were independent and their correlations known exactly,
every eigenvalue would equal one. Estimated from a finite record, they spread
out even when nothing is correlated, because sampling noise alone creates
apparent structure.

Random-matrix theory says how far they spread. Marchenko and Pastur showed
that for N uncorrelated series observed over T periods, the eigenvalues of the
estimated correlation matrix fall within an interval set by the ratio N/T,
between (1 − √(N/T))² and (1 + √(N/T))². For ten legs over 1,181 days the
noise occupies 0.82 to 1.19. An eigenvalue inside it carries no information;
an eigenvalue above it marks structure that noise cannot explain.

**03 · NOISE — The Marchenko-Pastur ceiling** *(screenshots 11, 34)*

    λ± = (1 ± √(N/T))²      (N = 10, T = 1,181: 0.82 to 1.19)

*Takeaway:* For N uncorrelated series over T periods, the eigenvalues of an
estimated correlation matrix lie between (1 − √(N/T))² and (1 + √(N/T))²;
anything above is real structure.

Figure 3.1 shows the record's spectrum against the noise. Nine of the ten
eigenvalues lie inside it. One stands above, at 1.481, and it belongs to the
direction shared by Legs 4 and 5, the pair that §02 identified from its single
correlation of 0.420. The smallest eigenvalue is 0.533, below the floor, which
is the complementary signature of the same pair: two legs that move together
also leave a direction in which they cancel. Everything else in the matrix is
consistent with independence. This is a stronger statement than the average
correlation of zero, because an average can conceal offsetting structure; the
spectrum shows there is one piece of structure and no more.

**FIGURE 3.1 — The spectrum against the noise** *(screenshots 11, 12)*

- **What it shows:** eigenvalue of the correlation matrix (y-axis 0.0 to 1.6,
  ticks every 0.2) against eigenvalue, in order (x-axis 1 to 10). Ten vertical
  bars, labelled above each with its value:
  - bar 1, red: 1.481 (bold);
  - bars 2 to 10, dark navy: 1.178, 1.117, 1.083, 1.009, 0.954, 0.949, 0.888,
    0.808, 0.533.
- A pale blue horizontal band runs across the chart from 0.82 to 1.19; a dotted
  line sits at 1.0. Legend, top right: the pale blue swatch, "Noise:
  Marchenko-Pastur 0.82 to 1.19".
- **Annotation:** a red arrow from the text "Legs 4 and 5: the one pair above
  the noise" to the top of bar 1.
- **Caption:** *Eigenvalues of the record's correlation matrix in order,
  against the Marchenko-Pastur noise interval for ten series over 1,181 days.
  One eigenvalue stands above it.*
- Source tag: HISTORICAL TRACK RECORD · CORRELATION MATRIX · SUMMARY
  STATISTICS

How many independent sources of risk, then, do ten legs amount to? The
question has more than one answer, and they must be distinguished. The
participation ratio treats the eigenvalues as a distribution and asks how many
equal ones would give the same spread: for the record it is 9.47. The entropy
measure asks the same question with a different weighting, counting small
directions more generously: 9.72. The variance ratio, the number of
independent legs that would give the equal-weight portfolio its measured
variance, is 10.02, marginally above ten because the small negative
correlations reduce variance slightly below the independent value.

Figure 3.2 shows why the definitions matter, on four stylised matrices. For
independent legs all three give ten. For a single common factor at correlation
0.3, the participation ratio collapses towards three while entropy stays near
six, because one large direction dominates the squared sum more than the
logarithmic one. For two blocks of five legs at 0.5, both fall to about three,
the two blocks plus the remainder. The record's structure, one strong pair and
nothing else, costs about half a bet by either measure. When a portfolio is
said to carry a number of effective bets, the definition must be stated; the
Forecaster Portfolio carries about nine and a half by the participation ratio,
which is the most conservative of the three, and that is the figure this
series uses.

**04 · EFFECTIVE BETS — Three definitions** *(screenshots 13, 35)*

    N_PR = (Σ_i λ_i)² / Σ_i λ_i²,    N_ent = exp(−Σ_i p_i ln p_i),  p_i = λ_i / Σ_j λ_j,
        N_var = 1 / (wᵀ C w)

*Takeaway:* The participation ratio, the entropy measure and the variance
ratio each count independent sources of risk differently; the series uses the
participation ratio, the most conservative.

**FIGURE 3.2 — Why the definition matters** *(screenshot 13)*

- **What it shows:** grouped bars, y-axis ticks 0, 5, 10, against four
  categories on the x-axis. Legend, top right: dark navy "Participation
  ratio"; green "Entropy". Bar values, as labelled (participation ratio, then
  entropy):
  - "All independent": 10.0, 10.0;
  - "One strong pair (the record's shape)": 9.5, 9.7;
  - "One common factor at 0.3": 5.5, 7.7;
  - "Two blocks of five at 0.5": 5.0, 6.8.
- **Caption:** *Effective bets by the participation ratio and by entropy for
  four stylised ten-leg correlation structures, including one shaped like the
  record's.*
- Source tag: ANALYTIC · MODEL MATRICES

The contrast with a portfolio of equities shows what the spectrum is
measuring. For a universe of stocks the first eigenvalue typically stands far
above the noise and carries a large share of total variance, the market mode
in which all stocks rise and fall together, with a few further eigenvalues
marking sectors; such a portfolio of a hundred names may amount to a handful
of effective bets. The Forecaster Portfolio's spectrum has no market mode. Its
largest eigenvalue is barely above the noise and belongs to a single pair, so
its ten legs are closer to ten independent bets than most portfolios of a
hundred assets.

Effective bets also connect to the fundamental law of Lesson 3. There, the
information ratio grew with the square root of breadth, the number of
independent bets a year. A portfolio's breadth is not the number of positions
it holds but the number of independent sources of risk among them multiplied
by how often each is refreshed, and the spectrum is how the first factor is
measured. Ten legs with a participation ratio of 9.47 contribute almost their
full count to breadth; ten legs sharing a common factor would contribute far
less, whatever their individual quality.

Random-matrix methods are now standard in institutional portfolio
construction. Estimated correlation matrices are cleaned by shrinking the
eigenvalues inside the noise interval towards their average before the matrix
is used for weighting, a practice that Laloux, Cizeau, Bouchaud and Potters
introduced and that Ledoit and Wolf developed into general shrinkage
estimators; without it, a portfolio optimised on a noisy matrix allocates
confidently to structure that does not exist. For the Forecaster Portfolio the
cleaned matrix and the raw one tell the same story, which is itself evidence:
there is almost nothing to clean.

> *One eigenvalue above the noise, nine inside it. Ten legs behave as about
> nine and a half independent sources of risk.*

**CHECKPOINT** — Nine of ten eigenvalues lie inside the Marchenko-Pastur
interval and one lies above it. What does this show?
- The matrix is pure noise
- One real piece of structure, and otherwise independence
- All legs are correlated

---

## §04 · Tails

### Does diversification survive the *worst days*?

*Correlation describes the average day. The question that matters is the worst
one.*

Every measure so far weights every day equally. An allocator's concern is
different: whether the legs that are independent on average remain independent
on the days when losses are largest, because that is when diversification is
needed and when, in many portfolios, it fails. Correlations that rise in
stress are the rule rather than the exception in markets, for reasons §05
develops, and a correlation matrix estimated over all days cannot show whether
a portfolio shares that weakness.

The direct test counts coincidences. Take the worst 5% of days for one series,
exactly 59 days out of 1,181 with ties broken by date, and the worst 5% for
another. If the two were independent, the number of days on both lists would
follow a known distribution with an expected value of k²/T, which is 2.95. The
record shows four such days between its two books. A count of 4 or more would
occur under independence with probability 0.34, about one time in three, so
the count gives no evidence of dependence in the tails: the books' worst days
coincide about as often as those of two unrelated series would. Figure 4.1
shows the full distribution with the observed count marked.

**05 · TAILS — Joint worst days under independence** *(screenshots 16, 36)*

    E[joint worst days] = k² / T = 59² / 1,181 = 2.95,      p = Pr(X ≥ 6) (hypergeometric) = 0.068

*Takeaway:* If two series were independent, the number of days in both worst
5% lists has expected value k²/T; the exact probability of the observed count
comes from the hypergeometric distribution.

**FIGURE 4.1 — How often the books' worst days coincide** *(screenshot 16)*

- **What it shows:** probability (y-axis, ticks 0%, 10%, 20%, 30%) of each
  number of joint worst days (x-axis 0 to 12; x-axis title "Days that are among
  the worst 5% for both series, if the two were independent (expected 2.95;
  observed 4)"). Bars, labelled above:
  - dark navy, 0 to 3 days: 4.5%, 14.7%, 23.2%, 23.6%;
  - red, 4 to 8 days: 17.3%, 9.8%, 4.5%, 1.7%, 0.5%;
  - 9 days is a barely visible red sliver, with no label; 10, 11 and 12 show no
    visible bar.
- **Caption:** *Probability of each number of joint worst days if the two
  books were independent, with the observed count of four and beyond marked.*
- Source tag: ANALYTIC · HYPERGEOMETRIC DISTRIBUTION

Figure 4.2 asks what correlation the count implies. Under a normal model for
the two books, the expected number of joint worst days rises steeply with
their correlation. The observed four corresponds to a correlation of about
0.08, close to zero and close to the average correlation across the books of
−0.023. A count this near its independent value cannot separate a small tail
correlation from none, and that is the reading the evidence supports: whatever
the books share on their worst days is too small for 59 days a book to detect.

**FIGURE 4.2 — What four joint days imply** *(screenshot 17)*

- **What it shows:** expected joint worst days out of 59 (y-axis 0 to 10, ticks
  every 2) against the correlation between the two series (x-axis 0 to 0.3,
  ticks 0, 0.1, 0.2, 0.3). A dark curve rises from about 2.95 at 0 to about
  8.42 at 0.3, with grey shading beneath. A red dashed horizontal line at 4.
- **Markers:** a green dot at the left end, "Independence · 2.95" (green); a
  red dot where the curve meets the dashed line, at about 0.08, labelled "4
  joint days implies about 0.08" (red); a dark dot at the right end labelled
  "8.42". The dashed line is labelled "Observed · 4" (red), at its right end.
- **Caption:** *Expected joint worst days out of 59 against the correlation
  between two series under a normal model, with the observed count and its
  implied correlation marked.*
- Source tag: ANALYTIC · BIVARIATE NORMAL

The count has a formal counterpart. The lower tail-dependence coefficient of
two series is the probability that one lies in its worst fraction q of days
given that the other does, in the limit of small q. Under independence it
equals q; under a normal distribution it tends to zero as q shrinks whatever
the correlation, which is why the normal model understates tail risk; under
distributions with heavier joint tails, such as the Student-t, it stays
positive. The record's count is an estimate of this coefficient at q of 5%:
four of 59 days, a rate of 6.8%, against the 5% that independence implies.

Figure 4.3 traces the same estimate across the whole lower tail, from the
worst 2% of days to the worst quarter, against the line independence implies
and the central 90% of what 2,000 random re-pairings of the two books' days
produce. A re-pairing keeps each book's own returns exactly and destroys only
their alignment in time, so its spread is the honest measure of what chance
alone does with tails of each size. Each tail holds exactly its share of the
days, as in the count, so the curve at 5% is the count. From the worst 4% to
the worst 10% of days the estimate sits a little above the independence line,
well inside the spread; from 11% outward it runs below the line, along the
lower edge of the spread, and at 24% and 25% it falls below the spread
altogether: on ordinary bad days the books move together less often than
independence implies. Nowhere does the curve rise above what chance produces.
The figure finds no tail dependence, and at the widest tails it finds the
opposite, books whose bad days tend to avoid each other.

**FIGURE 4.3 — How much the books share across the whole lower tail**
*(screenshots 18, 19)*

- **What it shows:** share of shared tail days (y-axis 0 to about 0.28, ticks 0,
  0.05, 0.10, 0.15, 0.20, 0.25) against tail fraction q, the worst share of
  days in each book (x-axis 2% to 25%; ticks 5%, 10%, 15%, 20%, 25%). Legend,
  top left:
  - a pale blue band, "Independence, central 90% of 2,000 re-pairings";
  - a grey dashed line, "Independence, λ = q";
  - a green line, "The two books: Book B in its tail when Book A is in its
    tail".
- The grey dashed line rises steadily from about 0.02 at q = 2% to 0.25 at
  25%. The pale band widens around it: from about 0 to 0.08 at the left end to
  about 0.17 to 0.285 at 25%. The green line starts at about 0.04 at 2%, dips to
  about 0.03 at 3%, is about 0.07 at 5%, jumps to about 0.10 at 6%, stays close
  to the dashed line from about 9% to 15% (about 0.10 to 0.12), then runs below
  it: about 0.15 at 16-19%, about 0.18 at 20%, about 0.19-0.20 from 21% to 24%,
  and about 0.21 at 25%. At 24% and 25% it lies at or below the band's lower
  edge.
- **Markers:** a dark dot on the green line at 5% (about 0.07) with an arrow
  from the text "5%: 4 of 59 days, 2.95 expected"; a red dot at 24% (about 0.20)
  and one at 25% (about 0.21), with a red line to the text "Below the spread:
  fewer shared bad days than independence" (red).
- **Caption:** *Lower-tail dependence of the two books, the share of Book A's
  worst fraction q of days on which Book B is also in its worst fraction q,
  for q from 2% to 25%, against independence and the central 90% of 2,000
  random re-pairings of the books' days. Each tail holds exactly its share of
  the 1,181 days, ties broken by date, so at 5% the curve is the count of
  Figure 4.1.*
- Source tag: HISTORICAL TRACK RECORD · TWO BOOKS, QUANTILE SUMMARY · REDRAWN
  FROM THE RESEARCH DIAGNOSTIC

The count and the curve ask whether the books' worst days coincide. Figure 4.4
asks what each book did on the other's worst days, day by day. Each panel
takes one book's 59 worst days in date order and adds up the other book's
return across them. On Book A's 59 worst days, on which its own returns summed
to −140.2% of starting capital, Book B made +15.6%; on Book B's 59 worst days,
on which its own returns summed to −46.6%, Book A made +24.1%. Each book
offset part of the other's losses on the days that mattered most, which is the
behaviour a count of coincidences is too coarse to show, and neither total
rests on one or two days. The figures are simple sums of daily percentages of
the starting capital, the convention of Lesson 8, so a total beyond 100%
describes 59 separate days spread over four and a half years, not one loss.

**FIGURE 4.4 — What each book did on the other's worst days** *(screenshot
19)*

- **What it shows:** two side-by-side step charts of running return, "% of
  starting capital, simple" (shared y-axis label, left).
  - Left panel, titled "Book B P&L on Book A's 59 worst days: +15.6%": x-axis
    "Book A tail day # (chronological)", 0 to 60 (ticks 0, 10, … 60); y-axis 0
    to 16 (ticks every 2). A green stepped line with pale green shading beneath
    rises slowly from 0 to about 3 by day 7, stays between about 2 and 3 to day
    25, then climbs to about 8 at day 34, about 10 at day 42, and a peak of about
    16 at day 55, ending at about 15 at day 59.
    Grey text inside the panel: "Book A on the same days: −140.2%".
  - Right panel, titled "Book A P&L on Book B's 59 worst days: +24.1%": x-axis
    "Book B tail day # (chronological)", 0 to 60; y-axis 0 to 25 (ticks 0, 5,
    10, 15, 20, 25). A blue stepped line with pale blue shading beneath dips
    slightly below 0 in the first five days, then rises to about 19 by day 20,
    moves between about 16 and 23 through day 50, peaks at about 24.5 near day
    54, and ends at about 24 at day 59. A horizontal line
    at 0. Grey text inside the panel: "Book B on the same days: −46.6%".
- **Caption:** *Left: Book B's running return across Book A's 59 worst days,
  in date order. Right: Book A's across Book B's. Each panel notes the book's
  own total on the same days. Simple sums of daily returns, in percent of
  starting capital.*
- Source tag: HISTORICAL TRACK RECORD · TWO BOOKS, WORST-DAY SUBSETS ·
  RESEARCH DIAGNOSTIC, CROPPED

The honest summary is that the record's diversification survives its worst
days. Four coincidences against an expected three is a difference chance
produces about one time in three, the implied correlation of about 0.08 is
close to zero, the quantile curve never rises above what chance produces and
at the widest tails falls below it, and on each book's worst days the other
book made money. Lesson 15 follows the portfolio's worst stretches across many
reorderings of its own days, and Lesson 8 reports what the worst days did to
the portfolio as a whole. This chapter establishes what the direct measures
can and cannot say: no dependence between the books' worst days is detectable
in four and a half years, and none large enough to undo the arithmetic of §01.

> *Four joint worst days against three expected, about one chance in three: no
> detectable tail dependence, and each book made money on the other's worst
> days.*

Markets as a whole show the stronger version of this behaviour. Longin and
Solnik found that correlations between international equity markets rise in
bear markets and not in bull markets, so that diversification across countries
weakens precisely in the downturns it was bought for. A portfolio whose legs
are built from distinct sources of return, rather than from assets exposed to
the same economic cycle, is the structural answer, and the joint-day count is
how that answer is checked rather than assumed.

**CHECKPOINT** — Two books each have 59 worst days out of 1,181 and share four
of them, against 2.95 expected under independence. What does the count show?
- Strong dependence between the books in their tails
- Nothing distinguishable from independence: 4 or more would occur by chance
  about one time in three
- That the books are negatively related

---

## §05 · Regimes

### *Regimes* and correlation

*Why correlations rise in stress without anything about the legs changing, and
how that is tested.*

Correlations in markets are not constants. They rise in stress, and §04 found
a trace of the same tendency between the record's two books. The reason is
mechanical and worth deriving, because it shows what protects a portfolio and
what does not. Suppose two legs share a common factor, each return being its
own exposure to the factor plus an independent part. Their correlation is the
product of the two exposures and the factor's variance, divided by the product
of their total volatilities. If the factor's volatility rises while everything
else stays the same, the shared part of each leg grows relative to its
independent part, and the correlation rises, with no change in the legs' logic
or exposures at all.

**06 · COMMON FACTORS — Correlation from a shared factor** *(screenshots 21,
37)*

    r_i = β_i f + ε_i   ⇒   ρ_ij = β_i β_j σ_f² / √( (β_i² σ_f² + σ_i²)(β_j² σ_f² + σ_j²) )

*Takeaway:* Two legs with exposures to a common factor are correlated in
proportion to the factor's variance; when the factor turns volatile,
correlation rises by itself.

Figure 5.1 shows the arithmetic. Two legs whose shared factor accounts for a
tenth of their independent variance on calm days are correlated 0.09. If the
factor's volatility doubles, their correlation rises to 0.29; if it triples,
as common factors do in a liquidity stress, to 0.47. Nothing about the legs
changed; what changed was the environment. The same figure shows two legs with
a fifth of that factor exposure, whose correlation stays below 0.2 even at
four times the calm volatility. The protection is not in the legs' quality but
in how little they share.

This is the mechanism behind the liquidity spirals of Lesson 4 and the regime
problem of Lesson 5: in stress, one factor, forced liquidation by leveraged
holders, moves many markets at once, and everything exposed to it becomes
correlated. Figure 5.2 translates the effect into portfolio risk for ten legs.
With the shared factor of Figure 5.1, the equal-weight portfolio's volatility
rises from near the independent value to about two thirds of a single leg's
when the factor triples; with a fifth of that exposure it barely moves. A
portfolio's diversification in stress is decided by its exposure to common
factors, which is exactly what the record's spectrum in §03 measured: no
market mode, and one shared direction confined to a single pair.

**FIGURE 5.1 — Correlation rises with the factor's volatility** *(screenshot
22; animated, stepped)*

- **What it shows:** correlation between the two legs (y-axis 0 to 1; ticks 0,
  0.25, 0.5, 0.75, 1) against volatility of the common factor, multiple of its
  calm value (x-axis: "Calm", "×2", "×3", "×4"). Two curves rising left to
  right, each with light shading beneath:
  - a dark navy curve, from about 0.09 at "Calm" to 0.62 at "×4", with markers
    "Doubled · 0.29" (navy, at ×2), "Tripled · 0.47" (red dot, at ×3) and
    "0.62" (navy, at ×4);
  - a green curve below it, from about 0.02 to 0.24 at "×4" (label "0.24"),
    with a green marker at about ×3.5 (about 0.20) labelled "A fifth of the factor
    exposure: still below 0.2".
- **Step 3 (shown at the top of the chart) — "3 · At three times the calm
  volatility it reaches 0.47: diversification weakens exactly when it is
  needed".**
- *(from page)* Step 1: "Two legs that share a weak common factor: correlation
  0.09 on calm days".
- *(from page)* Step 2: "When the factor's volatility doubles, nothing about
  the legs changes, yet their correlation rises to 0.29".
- **Caption:** *Correlation between two legs that share a common factor,
  against the factor's volatility relative to calm days, for two sizes of
  factor exposure.*
- Source tag: ANALYTIC · ONE-FACTOR MODEL

**FIGURE 5.2 — What stress does to diversification** *(screenshots 22, 23)*

- **What it shows:** portfolio volatility, % of one leg's (ten legs) (y-axis 0%
  to 100%; ticks 0%, 25%, 50%, 75%, 100%) against volatility of the common
  factor, multiple of its calm value (x-axis "Calm", "×2", "×3", "×4"). Legend,
  top left: a dark navy line, "Factor exposure as in Figure 5.1"; a green line,
  "A fifth of that exposure".
- The navy curve rises from about 43% at "Calm" to 80.9% at "×4"; the green
  curve rises from about 34% to about 56%. Grey shading beneath the navy curve,
  green beneath the green. A dashed horizontal line at 31.6%, labelled
  "Independent legs · 31.6%" at its right end.
- **Markers:** navy dot at ×3 "Shared factor, tripled · 73%"; green dot at ×3
  "Weak factor, tripled · 49%" (green); navy dot at ×4 labelled "80.9%".
- **Caption:** *Volatility of an equal-weight portfolio of ten legs, as a
  share of one leg's, against the common factor's volatility, for the two
  exposures of Figure 5.1.*
- Source tag: ANALYTIC · ONE-FACTOR MODEL

Measuring correlation in stress has a pitfall of its own. If correlations are
estimated only on volatile days, they come out higher than the true dependence
even when nothing has changed, because the volatile sample over-represents the
shared factor; Forbes and Rigobon showed that much of what had been reported
as contagion between markets was this bias, and gave the correction, which
rescales a correlation measured in a volatile period by the ratio of
variances. The joint-worst-day count of §04 does not suffer from it, because
it conditions on rank rather than on magnitude, which is one reason this
series prefers counts of coincidences to correlations measured in stress.

**07 · MEASUREMENT — The Forbes-Rigobon correction** *(screenshots 23, 24,
38)*

    ρ* = ρ √(1 + δ) / √(1 + δ ρ²),      δ = σ²_stress / σ²_calm − 1

*Takeaway:* A correlation measured in a volatile period overstates dependence;
dividing out the rise in variance recovers the underlying value.

Institutions also model the change directly. Engle's dynamic conditional
correlation model lets each pair's correlation evolve from day to day as a
function of recent co-movement, so that a rise in stress shows up as a rising
estimate rather than as a bias; regime-switching models go further and let
correlations jump between a calm state and a stressed one with estimated
probabilities of each. Both are descriptive rather than protective: they
measure how much correlation has risen, not how to prevent it, and the
protection remains structural, in how little the legs share.

The bluntest institutional test is the correlation stress scenario, in which
every pairwise correlation is set to one and the portfolio's risk recomputed.
For ten legs of equal volatility the equal-weight portfolio's volatility then
rises from 31.6% of a leg's to 100%, a multiple of 3.16, and that multiple is
the price of relying on diversification: it measures what the portfolio would
lose if every source of return collapsed into one. A portfolio built from
distinct sources never pays the full price, but a careful allocator sizes
positions knowing what the full price would be.

The tests that institutions apply follow from the mechanism. Correlations are
estimated conditionally, on days when a stress indicator is active, and
corrected for the variance bias; rolling windows show whether the structure of
§02 holds through time; and the resampling of Lesson 15 asks how the portfolio
would have fared across many orderings of its own days, including orderings in
which its stress days cluster. For the Forecaster Portfolio, the strongest
evidence is structural: an average correlation of 0.000, a spectrum without a
market mode, and books that offset rather than compound each other's worst
days. The record has not yet been through every kind of stress, which Lesson 5
explained a record of its length cannot have been, so the conclusion is
bounded by the regimes it has seen.

> *Correlation rises in stress by arithmetic, not by malice. The defence is to
> share as little as possible with the factors that stress inflames.*

**CHECKPOINT** — Two legs share a common factor and are correlated 0.09 on
calm days. The factor's volatility triples and nothing else changes. What
happens to their correlation?
- It stays at 0.09
- It rises to about 0.47
- It falls

---

## §06 · Inheritance

### What the portfolio *inherits*

*How the legs' skewness, kurtosis, Sharpe ratios and drawdowns combine, and
what Lessons 8 and 15 inherit from this one.*

A portfolio inherits its properties from its legs, but not one for one. Lesson
1 showed how skewness and kurtosis diminish as returns are aggregated over
time; the same arithmetic applies across legs. For independent legs of equal
weight and volatility, the portfolio's skewness is a single leg's divided by
√N and its excess kurtosis a single leg's divided by N. Figure 6.1 shows the
decline: ten legs leave 31.6% of a leg's skewness and 10% of its excess
kurtosis. A portfolio of independent legs is therefore closer to normal than
any of its parts, which is why the distribution examined in Lesson 9 is a
property of the combination.

**08 · MOMENTS — How skewness and kurtosis aggregate across legs**
*(screenshots 25, 26, 39)*

    γ_p = γ / √N,      κ_p = κ / N      (independent legs, equal weight and volatility)

*Takeaway:* Across N independent legs, skewness falls as 1/√N and excess
kurtosis as 1/N, as they do across time.

**FIGURE 6.1 — Shape diminishes across legs as it does across time**
*(screenshot 26; animated, stepped)*

- **What it shows:** share of one leg's value (y-axis 0% to 100%; ticks 0, 25%,
  50%, 75%, 100%) against independent legs, equal weight (x-axis 1 to 40; ticks
  1, 10, 20 and "40 legs"). Two curves start at 100% at one leg and fall:
  - a dark navy curve, flattening to about 16% at 40 legs (end label "0.16%"),
    with a marker at 10 legs labelled "Ten legs · skewness 31.6%";
  - a red curve, below it, falling faster, to about 2.5% at 40 legs (no end
    label), with a red marker at 10 legs labelled "Ten legs · kurtosis 10%".
- Faint shading fills the area beneath the curves (pinkish towards the red
  curve).
- **Step 3 (shown at the top of the chart) — "3 · Ten legs: skewness at 32% of
  a leg's, excess kurtosis at 10%. Aggregation across legs works like
  aggregation across time".**
- *(from page)* Step 1: "Skewness of the portfolio falls as one over the square
  root of the number of independent legs".
- *(from page)* Step 2: "Excess kurtosis falls faster, as one over the number
  of legs".
- **Caption:** *Skewness and excess kurtosis of an equal-weight portfolio of
  independent legs, as a share of one leg's, against the number of legs.*
- Source tag: ANALYTIC · MODEL CALCULATION

The Sharpe ratio moves the other way. For legs of equal Sharpe ratio and
volatility, the portfolio's Sharpe ratio is a single leg's multiplied by √N
and divided by the square root of 1 + (N − 1)ρ̄. Figure 6.2 shows the curves.
At zero correlation ten legs multiply the ratio by 3.16; at 0.1 by 2.29; at
0.3 by only 1.64, and the curve flattens so that further legs add almost
nothing. The record's average correlation of 0.000 places it on the top curve.
This is the quantitative content of the claim in §01 that the portfolio's
Sharpe ratio of 3.51 is a property of the combination: it is what ten modest,
independent sources become when they are held together.

**09 · RISK-ADJUSTED RETURN — How the Sharpe ratio scales with legs**
*(screenshots 27, 40)*

    S_p / S = √N / √(1 + (N − 1) ρ̄)

*Takeaway:* The portfolio's Sharpe ratio grows with √N at zero correlation and
flattens towards 1/√ρ̄ as correlation rises.

**FIGURE 6.2 — What ten independent legs are worth** *(screenshot 27)*

- **What it shows:** portfolio Sharpe ratio, multiple of one leg's (y-axis
  "1×" to "6×"; ticks 1×, 2×, 3×, 4×, 5×, 6×) against legs of equal Sharpe ratio
  and volatility (x-axis 1 to 40; ticks 1, 10, 20 and "40 legs"). Legend, top
  left: a green line "Correlation 0"; a dark navy line "0.1"; a grey line "0.3".
  - The green curve rises steadily to about 6.3 at 40 legs (label "6.32");
  - the navy curve rises and flattens, to about 2.9 at 40 legs;
  (An end label "6.32" sits beside the green curve's last point at 40 legs.)
  - the grey curve flattens earlier, to about 1.8 at 40 legs.
- Shading beneath each curve (green, grey, grey).
- **Markers:** green dot at 10 legs on the green curve labelled "The record ·
  ten legs at correlation 0 · 3.16×" (green); navy dot at 10 legs on the navy
  curve labelled "At 0.1 · 2.29×".
- **Caption:** *Sharpe ratio of an equal-weight portfolio as a multiple of one
  leg's, against the number of legs, for average correlations of 0, 0.1 and
  0.3, with the record's ten legs marked.*
- Source tag: ANALYTIC · MODEL CALCULATION

Drawdowns aggregate least kindly. A portfolio's deepest drawdown is not an
average of its legs' drawdowns, because the legs' worst periods do not
coincide when they are independent and the portfolio's own worst period is a
path property of the combination. It is usually far shallower than the legs'
own, which is diversification seen through time, but it can only be measured
on the portfolio's own path, which is what Lesson 8 does for the record's
deepest fall of 17.25% and what Lesson 15 does across simulated paths. The
tail dependence of §04 enters here: coincident worst days are the mechanism by
which legs' drawdowns can overlap, and the count of six against three is the
measure of how often they did.

What this lesson passes forward is a set of measured structural facts about
the record: ten legs in two books; an average correlation of 0.000; one shared
direction, Legs 4 and 5, and nothing else above the noise; about 9.47
effective bets by the participation ratio; four joint worst days against three
expected, no more than chance gives; and books that offset each other's worst
days. Lesson 7 turns to how the system reached this structure through five
builds, and Lesson 8 to what the combination produced.

> *Across legs as across time: skewness shrinks by √N, kurtosis by N, and the
> Sharpe ratio grows by √N when the legs are independent.*

The expected depth of a drawdown has a known shape. For a strategy with a
stable Sharpe ratio S and volatility σ, the expected deepest drawdown over a
long record grows with σ divided by S and with the logarithm of the record's
length: higher volatility deepens it, a higher Sharpe ratio shallows it, and a
longer record uncovers a deeper one simply by giving bad luck more chances. A
portfolio of independent legs improves the first two factors at once, because
its volatility falls by √N while its Sharpe ratio rises by √N, so that the
ratio σ/S that governs drawdown falls by a factor of N. Ten independent legs
can therefore be expected to suffer drawdowns an order of magnitude shallower,
relative to their return, than any one of them.

This is diversification seen through time. Across legs, diversification
reduces the variance of each day; through time, it reduces the chance that the
legs' worst stretches line up. The two are the same arithmetic applied in
different directions, and the record's structural facts, near-zero correlation
and modest tail dependence, bear on both. Lesson 8 measures what the
combination actually produced over its 1,181 days, and Lesson 15 asks how much
of that was the particular ordering of its days rather than the structure
itself.

**CHECKPOINT** — Ten legs of equal Sharpe ratio and volatility have average
correlation 0.3. By what factor does the equal-weight portfolio improve on a
single leg's Sharpe ratio?
- 3.16
- About 1.64
- 10

**Next in the series** *(from page)*: Next · Lesson 07 — How the System
Evolved. Five builds, one that fell, and what selection among builds flatters:
the correction that Lesson 12 applies.

---

## Appendix · Glossary and sources

### Terms and *sources*

| Term | Definition |
|---|---|
| Diversification | Reducing risk by combining sources of return that do not move together. |
| Average pairwise correlation | The mean of the correlations of all distinct pairs; it sets the floor of portfolio variance. |
| Book | A group of legs managed together; the record has two. |
| Eigenvalue | The variance carried by one independent direction of a correlation matrix. |
| Marchenko-Pastur interval | The span of eigenvalues produced by noise alone for N series over T periods. |
| Effective bets | The number of independent sources of risk a portfolio amounts to, by a stated definition. |
| Tail dependence | The tendency of series to move together on their most extreme days. |
| Common factor | A source of variation shared by several legs; the cause of correlation. |
| Conditional correlation | Correlation measured on a subset of days, such as stressed ones. |
| Market mode | A dominant eigenvalue in which all assets move together. |

### Sources

- Markowitz (1952). Portfolio selection, Journal of Finance 7(1).
- Choueifaty and Coignard (2008). Toward maximum diversification, Journal of Portfolio Management 35(1).
- Marchenko and Pastur (1967). Distribution of eigenvalues for some sets of random matrices, Mathematics of the USSR-Sbornik 1(4).
- Laloux, Cizeau, Bouchaud and Potters (1999). Noise dressing of financial correlation matrices, Physical Review Letters 83(7).
- Ledoit and Wolf (2004). A well-conditioned estimator for large-dimensional covariance matrices, Journal of Multivariate Analysis 88(2).
- Longin and Solnik (2001). Extreme correlation of international equity markets, Journal of Finance 56(2).
- Forbes and Rigobon (2002). No contagion, only interdependence: measuring stock market comovements, Journal of Finance 57(5).
- Engle (2002). Dynamic conditional correlation, Journal of Business and Economic Statistics 20(3).
- Joe (1997). Multivariate Models and Dependence Concepts, Chapman and Hall.

*Educational content only. Not financial advice.*
