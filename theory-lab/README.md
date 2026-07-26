# Theory Lab

A from-scratch, math-explained curriculum in the quantitative concepts behind
this repo's FX/macro research — Efficient Markets, Bayesian inference,
multiple testing, mean reversion, GARCH, Hidden Markov Models, Kalman
filters, cointegration, PCA, Black-Scholes/Merton, jump-diffusion, Kelly
sizing, and Extreme Value Theory.

**Start at [`hub.html`](./hub.html)** (also linked from the dashboard's
**Learn ▾** nav menu on `index.html`).

## Why this is separate from `education/`

`education/` holds raw lecture notes transcribed from an external course
(Colez Trades) — applied trading frameworks, case studies, exam-style
recall. `theory-lab/` is the opposite direction: it starts from first
principles and builds the math up from scratch, written to be read by
someone who has never seen the notation before. Read a course-notes lesson
in `education/`, then come here when a formula or term in it needs
unpacking — or read this curriculum straight through as its own path.

## What every lesson page contains

- Plain-English intuition before any math.
- The math, step by step, with every symbol defined.
- An inline SVG chart illustrating the concept (a random-walk scatter, a
  regime-shaded price path, the Kelly growth curve, etc. — hand-built,
  no chart library, no external requests).
- A numerically worked example.
- An honest note on where the idea connects to an actual module in this
  repo — clearly marked as either **already in use** (a real, running
  brick) or a **concept/candidate** (explained here, not built or tested).
- Common pitfalls, a self-test, and further reading (real, correctly
  attributed sources).

## Math Primer (start here if you're new)

The 14 numbered lessons assume you already know mean/variance/standard
deviation, what a normal distribution is, what correlation and a
regression line are, and the difference between simple and log returns.
Four short primer lessons fill that gap from zero:

1. Descriptive Statistics & the Normal Distribution
2. Probability & Random Variables
3. Correlation & Linear Regression
4. Returns, Log-Returns & Compounding

They're linked as their own "0 · Math Primer" section at the top of
`hub.html`, ahead of Lesson 1.

Nothing in this folder is a trading signal. A lesson explaining a technique
well is not evidence the technique works here — per `CLAUDE.md`'s Lego
Principle #5, any idea from this series only earns trust after it's built
and cleared the repo's real out-of-sample bar.

## Structure

```
theory-lab/
  hub.html            — index / curriculum map, linked from index.html
  assets/theory.css   — shared stylesheet (dark theme, MathJax-rendered math)
  lessons/*.html       — the 14 lessons
```
