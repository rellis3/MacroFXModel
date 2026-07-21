# Paul Tudor Jones — what's worth keeping (and what to leave)

> Distilled from a 2026 *Invest Like The Best* interview retold as a thread
> (Goshawk Trades, 28 Apr). **Read this as discretionary-macro wisdom, not as
> edge.** PTJ is a discretionary macro trader; almost nothing here is a
> mechanical, testable signal, and the framing is heavy with survivorship (we
> hear his playbook *because* he didn't blow up — thousands with the same
> playbook did). This doc exists to (a) pull the two or three points that
> genuinely map to how this platform already thinks, and (b) name plainly the
> parts that are folklore so we don't dress them up later.
>
> Honest prior: as a source of *new* systematic edge, this interview is ~null.
> As a sanity-check on the risk/macro doctrine already in `CLAUDE.md`, a couple
> of points are worth pinning down.

---

## The one genuinely useful hook: valuation ≠ catalyst

> "The yen has been undervalued for years. But valuation alone doesn't move
> price — you need a catalytic moment."

This is the most transferable idea in the whole piece, and it's one we already
**proved the hard way**:

- The **Market Valuation Engine** (`js/mve/*`, `MARKET_VALUATION_ENGINE.md`)
  tested **null** as a timing signal and is shelved as a read-only viewer wired
  into nothing. A "fair value" number tells you *direction of the eventual
  pull*, not *when* — exactly PTJ's point.
- Corollary for anything we build next: **a level/valuation is a context filter,
  not a trigger.** This is the same conclusion `VOL_LEVEL_LESSONS.md` reached
  independently ("the lines are context / confluence, not mechanical triggers").
  Two separate investigations landing on the same wall is worth remembering.

**Takeaway for the codebase:** any signal whose thesis is "X is cheap/rich"
must be paired with a separate *catalyst / timing* gate before it's tradeable.
Don't backtest a fair-value fade with no trigger and expect it to survive — we've
already watched that fail twice.

---

## The 4-bucket catalyst checklist (useful framing for a *macro* model)

PTJ claims almost every big move he's traded originates in one of four places:

1. **A market carried away in one direction** — an imbalance that ran too long.
2. **A central bank doing something it shouldn't.**
3. **A government doing something it shouldn't.**
4. **A leverage unwind** — usually through derivatives (see the crash list below).

This is not edge, and it isn't falsifiable as stated (it's broad enough to fit
almost anything after the fact). But as a **catalyst taxonomy** for a Macro FX
model it's a cheap, useful lens — it's roughly the axis `MACRO_BOT_DESIGN.md`
and the macro-tier score already grope toward. Use it as a *checklist* when
framing a macro thesis ("which bucket is this, and what's the catalyst?"),
**not** as a claim that being in a bucket predicts returns.

Where it connects to existing work:
- Bucket 4 (leverage) → the "where's the leverage" lens for stress design in
  `CREDIT_STRESS_TEST.md`. PTJ's crash list is the same idea: **1987** (portfolio
  insurance), **1998 LTCM** (derivatives), **2000** (IPO-unlock equity supply),
  **2008** (housing derivatives), **1980 silver** (Bunker Hunt corner →
  liquidation-only). Different decade, same mechanism.
- Buckets 2–3 (central banks / governments) → the macro-tier / event side of the
  platform. A reminder that policy *changes* are the catalysts, not policy
  *levels*.

---

## Risk-first — already house doctrine, reinforced not extended

> "Every great trader is first and foremost a risk manager. You're only worth
> what you can write a check for tomorrow."

This adds nothing new — it *is* `CLAUDE.md` house rule #4 ("the real retail edge
is risk, not the entry: diversification, vol-based sizing, cut losers, let
winners run") and the whole point of `TRADING_SAFETY_LAYER.md`. Worth noting only
because a 50-year discretionary macro trader independently lands on the same
conclusion the platform's own doctrine already encodes: **the durable edge is on
the risk/sizing/liquidity side, not the entry.** Liquidity specifically — never
be trapped in size when vol explodes — maps to vol-based position sizing, which
we already treat as load-bearing.

No action; this is confirmation, not a new requirement.

---

## What is folklore — do NOT dress this up as method

Named explicitly so it doesn't leak back in later as if it were testable:

- **The boxing analogy / "survive for the openings" / "a few knockout rounds a
  year."** Retrospective narrative. The systematic translation is just
  "don't get forced out before a rare setup" = position sizing, already covered.
  It is *not* a claim we can time the rare setups.
- **"Exquisite execution — buy when there's blood on the ground, sell at
  elation."** This is discretionary sentiment reading. We have no honest,
  after-cost, OOS way to operationalise "maximum fear" as a mechanical trigger,
  and the folklore ban in `CLAUDE.md` applies. Sentiment/positioning extremes
  are at best a *weak* conditioning variable, never a signal on their own.
- **The daily schedule / "I work harder now / 800k emails."** Personal habit,
  not transferable edge.
- **Calling the specific yen top off a new PM "like Reagan/Thatcher/Trump."**
  A single discretionary macro bet, unfalsifiable as a rule, survivorship-lit.
  Interesting, not a system.

---

## Bottom line

Nothing here is new tradeable edge, and this doc should never be cited as
evidence for one. Two things are worth carrying forward:

1. **Valuation ≠ catalyst** — pair any cheap/rich signal with a separate timing
   gate, or expect the MVE/vol-level null again.
2. **The 4-bucket catalyst checklist** — a cheap framing device for macro
   theses, used as a checklist, not a predictor.

Everything else either restates doctrine we already hold on better evidence
(risk-first) or is discretionary folklore we deliberately don't build on.
