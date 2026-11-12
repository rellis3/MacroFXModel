# Free College: Stochastic Processes (course) · Lecture 2 "Random Variables"

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=rmohxKoyMOg (Lecture 2) · course repo https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes |
| ReelScribe id | j5731rbj96thsqx46h4jkz4d258j3can · 76 min (4,580 s) |
| Recorded | unknown (repo's last commit 2026-10-28; weeks 1-3 posted) |
| Processed | 2026-11-12 |
| Notebook | none for this course. The repo holds PDFs only (handwritten lecture notes, typeset homework, typeset solutions), MIT licence |
| Kind | **Learning resource for the owner**, not a research-method source |

## Lesson
QG is running a free, 16-week, upper-undergraduate course in stochastic processes. It follows Ross, *Introduction to
Probability Models* (10th ed.) and has one 75-minute lecture a week, a 20-problem, 100-point homework each week with a
separate step-by-step solutions PDF, and two midterms (weeks 7 and 13). Lecture 2 closes the probability review
(independence versus mutual exclusivity, mutual independence) and then covers random variables: PMF/PDF/CDF, the
standard distribution table, expectation and variance, covariance, joint and marginal distributions, and the weak LLN
and CLT. It ends with a short simulation. For this desk the value is the **homework sets**: graded, ordered from easy to
hard, with worked solutions. That is exactly what the how-to-learn note (`2026-11-12-how-to-learn.md`) found Theory Lab
lacks.

## Syllabus by week

**The README schedule and the material actually posted don't line up.** The README puts Markov chains in Lecture 2.
The posted Lecture 2 (video + notes + HW2) is a random-variables review, and Markov chains begin in Lecture 3. The
course runs roughly one lecture behind its README. Treat the README rows from Lecture 3 on as provisional.

Course prerequisites (README): probability (random variables, conditional probability, independence, expectation,
variance), calculus (differentiation, integration, series, basic ODEs), linear algebra (matrix multiplication, matrix
powers, linear systems) and following derivations. Python helps but isn't required.

| Week | Topics (as posted for 1-3; as planned in the README after that) | Extra prerequisites beyond the course-wide list | Material in repo |
|---|---|---|---|
| 1 | Probability foundations: random experiment, sample space, events, axioms, complement/addition rules, equally likely outcomes, counting (permutations, combinations), conditional probability, partitions, total probability, Bayes | none | notes, HW1, solutions |
| 2 | Independence vs mutual exclusivity, mutual vs pairwise independence; random variables as maps; discrete/continuous, PMF/PDF/CDF; Bernoulli, binomial, geometric, Poisson, uniform, exponential, normal; E, Var, linearity, Var(aX+b); covariance, Var(X+Y); joint and marginal distributions, independent RVs; weak LLN, CLT | Week 1; integration (densities) | notes (cumulative), HW2, solutions |
| 3 | Probability trees for dependent games, first-step analysis (expected rounds to the next win, waiting for HH/HT/HTH), the "state" idea, Markov property, DTMC definition, transition matrix, multistep transitions via matrix powers (Chapman-Kolmogorov), absorbing-state trick (P(3 heads in a row within 10 flips)) | Week 2; matrix multiplication | notes (cumulative), HW3 (+2 optional interview-style bonus problems), solutions |
| 4 (README L3) | Classifying states: communication, classes, irreducibility, recurrence/transience, periodicity, absorbing chains | Week 3 | not yet posted |
| 5 (README L4) | Stationary distributions (πP = π), limiting probabilities, long-run proportions, intro to long-run rewards | Week 4; solving linear systems | not yet posted |
| 6 (README L5) | Random walks, gambler's ruin, absorption and hitting probabilities, expected hitting/absorption times | Weeks 3-4 (first-step analysis) | not yet posted |
| 7 (README L6) | Time reversibility, detailed balance, random walks on graphs, DTMC review, simulations | Weeks 4-6 | not yet posted |
| 8 (README L7) | **Midterm I** (probability + DTMCs); exponential distribution, memorylessness, competing exponential clocks | Weeks 1-7 | not yet posted |
| 9 (README L8) | Poisson process: counting processes, independent/stationary increments, exponential inter-arrivals, n-th arrival time | exponential distribution | not yet posted |
| 10 (README L9) | Superposition, thinning, conditional arrival times/order statistics, nonhomogeneous Poisson (intensity functions) | Week 9 | not yet posted |
| 11 (README L10) | Compound Poisson (random sums, mean/variance); intro to CTMCs: holding times, rates, generator matrices | Weeks 9-10; law of total variance | not yet posted |
| 12 (README L11) | Birth-death processes; Kolmogorov forward/backward equations | CTMCs; basic ODEs | not yet posted |
| 13 (README L12) | CTMC stationary behaviour (πQ = 0), global/detailed balance, reversibility, review | Week 12 | not yet posted |
| 14 (README L13) | **Midterm II** (exponential, Poisson, CTMCs); renewal processes | Weeks 8-13 | not yet posted |
| 15 (README L14) | Renewal function, elementary renewal theorem, renewal-reward, long-run cost models | renewal processes | not yet posted |
| 16 (README L15) | Queueing: Kendall notation, Little's law, M/M/1, stability, finite capacity, blocking | birth-death; renewal-reward | not yet posted |
| 17 (README L16) | Brownian motion: Gaussian independent increments, covariance, drift, random walk → BM limit, synthesis. Itô/SDEs explicitly **out of scope** | CLT; random walks | not yet posted |

If the one-lecture shift holds, the course will run about 17 lectures, or the README will be compressed later.
Re-check the repo as weeks are added.

## Approach (how Lecture 2 teaches)
- **Definition, then picture, then derivation from earlier definitions.** Every object is a boxed definition, then a
  sketch, then derived from what came before: P(A|B) = P(A) under independence comes from substituting into last week's
  conditional-probability definition. Mutually exclusive ⇒ not independent is set up as P ⇒ Q, with the contrapositive.
- **Intuition sentence for each formal object.** A random variable "is a map". A PDF value is "likelihood in an epsilon
  neighbourhood", not a probability, so integrate. A marginal "is just a compression of information". Variance is "if
  we miss the mark … how far away are we".
- **One reference table** of seven distributions with PMF/PDF, mean and variance, written before mean and variance are
  defined ("cart before the horse") so later examples can use it.
- **A Socratic question** to undergrads: explain the 3.5 average of a die without using "average/mean/expected".
- **Closes with a short simulation in a notebook** (Cursor, reusing week 1's market-making notebook). A binomial(10, 0.7)
  histogram, then the running sample mean converging (LLN), then 1,000 means of 100 draws giving a normal (CLT). The
  notebook isn't in the repo.
- **Finance asides tied to the maths**, not market calls: returns aren't IID, so the LLN's "same data-generating
  distribution" condition fails; Var(X+Y) has a 2Cov term, which is where diversification comes from.
- **Homework design** (from the PDFs): 20 problems in five sections, from identifying definitions up to "synthesis"
  problems that chain three or four tools (for example HW1 P20: Poisson arrivals, thinning, total expectation, total
  variance, conditioning a series). Each set has assigned Ross reading and says "show reasoning … Python may check
  arithmetic but provide derivations". HW3 says explicitly what is *not* required yet (no classification or stationary
  distributions), which works as a scope gate. Solutions are a separate PDF, so you can attempt first and grade after.
- Lecture notes are handwritten iPad pages, and **each week's PDF repeats all earlier weeks' pages** (cumulative).
  They are images to text extraction (pdftotext gives OCR-grade garble), so they're for reading, not search.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "we're not trying to predict anything … We're observing a distribution and then looking at an expected value … if you're correct on average, you'll be able to make money" [12:41] (QG) | method | ALREADY DO: forecast = how much, not which way (memory `feedback_lessons_on_track`); direction bar Phase 0 (`project_direction_bar`) |
| 2 | LLN needs the data-generating distribution to stay put; stock returns "That's not IID" [71:59] (QG) | method | ALREADY DO: era gate and block bootstrap (see how-to-learn claim 1); REPEAT of how-to-learn's point, not a new lesson |
| 3 | Bernoulli/binomial for up/down assume independence; returns may carry "an autocorrelation structure" [41:38] (QG) | mechanism | ALREADY DO: direction nulls across the Evidence Book; `hurst-variance-ratio`, `stationarity-acf-pacf` lessons |
| 4 | Var(X+Y) = Var X + Var Y + 2Cov; decorrelation gives a diversification benefit "for every strategy" [61:47] (QG) | mechanism | ON FILE: factor blend (trend + yield corr 0.06 halves drawdown, `project_factor_blend`); see method lesson #7 (judge it in stress windows) |
| 5 | Uniform draws + inverse CDF are how a computer samples any distribution (QG) | method | Textbook; no Theory Lab lesson states inverse-transform sampling (0 hits for "inverse transform") |

## What we could learn
Learning, not research rules. All three points sit in the "For the owner's own learning" section of
`education/RESEARCH_METHOD_LESSONS.md` and add no new numbered lesson.

1. **Graded problem sets: DON'T DO, and this course supplies them for the probability/Markov core.** Theory Lab lessons
   end with a short self-test (`vark.js` grading) and `practice.html` drills. Neither has 20 graded problems running from
   easy to hard with worked solutions. QG's homework sets do. Suggested use: attempt the set, grade it against the
   solutions PDF, and set a 100% bar on each section before moving on (the how-to-learn rule). Write the score in
   `theory-lab/journal.html` or the decision journal. **Link to the PDFs only. Never copy problems into the repo.**
2. **Prerequisite gates: DON'T DO, and the course shows a cheap pattern.** HW3 states what it does *not* require yet.
   A per-lesson "you need: …" line plus a "done when: HW-n ≥ 100%" line in `paths-data.js` would give Theory Lab both
   gates with no new content. That edit is the owner's call.
3. **Coverage gaps the course fills** (from a `git grep` of `theory-lab/lessons`, micro decks excluded): no lesson
   teaches counting/combinatorics as a topic, joint/marginal distributions for discrete RVs, the laws of total
   expectation/variance (only a mention in `regime-switching-state-space`), Chebyshev, first-step analysis, Poisson
   processes as a topic (they appear inside `merton-jump-diffusion` and `change-point-detection`), state
   classification, renewal theory or queueing. Markov chains appear only as Layer 1-2 of `hidden-markov-models`.

## Where it slots into Theory Lab
Mapping each week onto existing lessons (`git ls-files theory-lab/lessons | grep -v micro`) and paths
(`theory-lab/assets/paths-data.js`). HW links point to GitHub. Spaces in folder names are `%20`.

| Week | Read in Theory Lab first | Graded problem set (the gate) | Gap Theory Lab leaves |
|---|---|---|---|
| 1 Probability foundations | Core path: `primer-probability`, `bayesian-inference`; `action-base-rates` (base rate ≈ HW1 P7) | [HW1](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%201/Homework_1___Free_College__Stochastic_Processes.pdf) · [solutions](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%201/Homework_1_Solutions___Free_College__Stochastic_Processes.pdf) · [notes](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%201/Free%20College_%20Stochastic%20Processes.pdf) | counting; pairwise vs mutual independence (HW1 P17) |
| 2 Random variables, moments, LLN/CLT | Core path: `primer-probability`, `primer-stats-normal`, `primer-correlation-regression`; `action-expected-value`; Risk path `markowitz-black-litterman` (HW2 P20 is two-asset portfolio variance) | [HW2](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%202/Stochastic_Processes_Homework_2.pdf) · [solutions](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%202/Stochastic_Processes_Homework_2_Solutions.pdf) · [notes](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%202/Free%20College_%20Stochastic%20Processes_L2.pdf) | joint/marginal PMFs, Chebyshev, total variance (HW2 P19 random sum), common-shock covariance (HW2 P18) |
| 3 First-step analysis, Markov chains, matrix powers | Foundations path `linear-algebra-matrices` (matrix powers); Systems/Quant ML `hidden-markov-models` (Layers 1-2 only); `regime-switching-state-space` | [HW3](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%203/Stochastic_Processes_Homework_3.pdf) · [solutions](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%203/Stochastic_Processes_Homework_3_Solutions.pdf) · [notes](https://github.com/romanmichaelpaolucci/Free-College-Stochastic-Processes/blob/main/Week%203/Free%20College_%20Stochastic%20Processes%203.pdf) | first-step analysis; "what belongs in a state" (HW3 P11-12) |
| 4-5 State classification, stationary distributions | `hidden-markov-models` (long-run share), `mcmc-metropolis-gibbs` (stationarity) | not posted yet | classification, limiting vs stationary |
| 6 Random walks, gambler's ruin, hitting times | `drawdowns-risk-of-ruin`, `kelly-criterion`; desk link: P(touch) / first passage (method lesson #13) | not posted yet | first-passage maths |
| 7 Reversibility | `mcmc-metropolis-gibbs` (detailed balance) | not posted yet | n/a |
| 8-11 Exponential, Poisson, compound Poisson | `merton-jump-diffusion`, `institutional-bates-model`, `change-point-detection`, `institutional-avellaneda-stoikov` (arrivals) | not posted yet | Poisson process as a topic; thinning; nonhomogeneous intensity |
| 11-13 CTMCs, Kolmogorov equations | Stochastic path `fokker-planck-equation` (the continuous-state forward equation); `regime-switching-state-space` | not posted yet | generator matrices |
| 14-16 Renewal, queueing | `limit-order-books`, `execution-algorithms` (queues at a price level) | not posted yet | renewal-reward; Little's law |
| 17 Brownian motion | Stochastic path entry: `ito-lemma`, `fractional-brownian-motion`, `bootstrapping-monte-carlo` | not posted yet | random walk → BM limit |

**Suggested order for the owner:** the course is a natural **bridge between the Core path and the Stochastic Calculus
& Pricing path**. Paths-data starts the stochastic path at `ito-lemma` with no discrete-time stochastic-process
groundwork in front of it. Weeks 1-3 can be done now against lessons that already exist. Weeks 4-17 add material
Theory Lab doesn't have. Pace: one week's homework at a time, solutions only after a full attempt, next week only at
100% on the set (redo the wrong problems).

## Research ideas
Not carded. A probability course makes no new testable market claim. Claims 2-4 are already on file. One personal
learning exercise, not a study: redo HW3 P9 (win/loss transition matrix) on the owner's own closed-trade record and
compare P(W|W) with P(W|L). The trade pulls are gitignored (`feedback_public_repo_no_pnl`), so keep it off the repo.

## Quotes
- [12:41] "we're not trying to predict anything, right? Random is intentional as the word" (QG)
- [13:12] "if you're correct on average, you'll be able to make money, and that's kind of the gist of the application of statistics in the real world" (QG)
- [48:12] "Can you explain to me in like plain English what that quantity is without using the words average, mean, expected value" (QG)
- [61:47] "if we have a diversification benefit … that goes for every strategy and that's a big deal" (QG)
- [71:59] "That's not IID. That's not IID. That's a very important thing to understand here" (QG)
