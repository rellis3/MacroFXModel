# Progression Path Breakdown & Analysis (C.OG): notes

*Source: a 30-minute video by C.OG (Colez Trades / @QuantitativeAndMacroInsights), taken
from its auto-generated transcript and five screenshots. It walks through the whole path:*
1. *why systems with no edge still show winners,*
2. *what to benchmark against,*
3. *validation and paper trading,*
4. *using prop-firm challenges as a short-term way to raise capital, costed properly.*

---

## The one-paragraph version

Short-term variance makes **losing systems produce winners**: in a group of traders all
running the same losing method, a third are in profit after 10 trades. Those are the people
posting screenshots. Keep trading and the **drift** (the system's true average per trade)
always wins; by a few hundred trades almost nobody is still up. So:
- judge a system on a full, leak-free track record, and Monte-Carlo it to check the
  equity curve isn't a lucky path;
- require it to **beat buy-and-hold** (otherwise why take the risk);
- **paper trade** to confirm live results fall in the backtest's distribution.

If the system is good but your capital is small, prop-firm challenges can be a
**short-term** way to build capital, as long as you simulate your pass rate on the firm's
rules and track **everything net of costs**. The firms profit when traders fail, so it's a
funnel to exploit carefully, not a long-term home.

---

## The images, explained

### 1. The equity curve (hand-drawn, first screenshot)
A white line that zig-zags upward. An **equity curve** is just the account balance over
time drawn as a line: start at, say, 100,000, every win steps it up, every loss steps it
down. Everything else in the lesson is about how much to trust the shape of that one line.

### 2. Many paths of the same system (second screenshot)
Several coloured curves (blue, yellow, red, white) inside a pink envelope, all heading up
and to the right. It's **one system, several possible histories**. Four people run the same
rules but start at different times (2022, 2023, 2025, two weeks ago), so each sees a
different curve. Monte Carlo generates many such paths from the system's statistics.

Two things describe the fan:
- **Drift:** the average slope. Here it's clearly up.
- **Volatility:** how wide the fan is. Here the paths stay close together and none goes
  negative.

A good system has **positive drift and a tight fan**. A single backtest is just one of
these paths, and it might be the lucky one.

### 3. "Why some people still make money": 600 traders on a losing method (screenshots 1–3)
An interactive chart from the micro-learning bank, "The Bank" lesson 2 of "Start Here".
- 600 simulated traders all run **the same method, which loses 0.2% per trade on average**.
- The chart shows each trader's cumulative result (%) against trades taken, and a slider
  moves from 10 to 1,000 trades.

| Trades | Share of the 600 in profit | What's on screen |
|---|---|---|
| **10** | **35.0%** | A thin fan around 0%, green above and red below. "At this stage the winners look skilled, sound confident, and have screenshots." |
| 50 | "a large group" (≈ 1 in 5 by the maths below) | "They are not doing anything different from the others" |
| **380** | **0.7%** | A red cloud sloping down past −60% and toward −120%. "Almost nobody is left above the line. The drift was always going to win." |

**Why the numbers come out like that.** After *n* trades, a trader's total is roughly normal
with mean −0.2%·*n* and spread σ·√*n*, where σ is the per-trade volatility. The mean grows
with *n* but the spread only with √*n*, so the drift eventually swamps the luck.

Solving 35% profitable at *n* = 10 gives σ ≈ **1.6% per trade**. That same σ predicts:
- about **19% still in profit at 50 trades**;
- about **0.9% at 380 trades**, close to the 0.7% shown.

The slider is behaving exactly as the maths says. This shows how many trades you need
before a result means anything: with a small edge and noisy trades, it's **hundreds**,
not ten.

### 4. The Prop Firm Toolkit (fourth screenshot)
C.OG's tool ("Colez Trades — Prop Firm Toolkit") simulates prop-challenge outcomes from a
trade model. In the screenshot:

| Setting / result | Value | Meaning |
|---|---|---|
| Firm / program | FTMO, 2-Step Challenge | Step 1 target **10%**, step 2 target **5%**, minimum **4 days** each |
| Trade model | Source "Forecaster Portfolio", historical, **~2.6 trades/day** | Real historical trades, resampled ("empirical") |
| Scale k | **2.00×** | Risk multiplier on the historical trades. Flagged in red: "worst historical day breaches the daily limit" |
| Paths | **20,000** Monte Carlo paths (run in 311 ms) | |
| **Funded rate** | **56.9%** (11,377 of 20,000) | Share of paths passing both steps |
| **Blown** | **43.1%** (8,623 hit the max-loss floor) | |
| Cleared step 1 | 14,402 (**72.0%**) | |
| Fully funded | 11,377 (**79.0% of step-1 survivors**) | |
| Median days to funded | **17 d** (mean 19.9; P10 9 d, P90 35 d) | |
| Median worst drawdown | **−7.9%** (mean −7.1%; 1-in-20 −10.0%) | |
| Chart | Equity-path fan for step 1, dashed target line at **+10%** | |

His point: at 2× risk the pass rate is "just over a coin flip", so **lower the risk and
re-simulate**. The daily-loss limit is what's biting, as the red warning shows.

**An extra benchmark worth knowing (ours, not in the video):** what would a system with
**no edge at all** score? If the max-loss floor is 10% (FTMO's standard; it's cut off in the
screenshot), the classic gambler's-ruin result for a driftless walk gives:
- **Step 1** (+10% before −10%): 10 / (10+10) = **50%**, against the toolkit's **72%**.
- **Step 2** (+5% before −10%): 10 / (5+10) ≈ **67%**, against the toolkit's **79%**.
- **Both steps:** ≈ **33%** before daily limits and minimum days, against the toolkit's
  **57%**.

So 56.9% is well above what luck alone would produce. But the right comparison is **the
zero-edge pass rate under the same rules**, not 50%. A no-edge trader already passes a
third of the time, which is exactly why the challenge business works for the firm.

### 5. The costs spreadsheet (fifth screenshot)
A Google Sheet:
- **benchmark** 40% against **buy and hold S&P** 15%, with **50,000** as a capital figure;
- **cost** 200 × 5 accounts;
- columns **projected return** and **net of costs**, still being filled in.

It's the simplest possible habit: **money in against money out**, for every account.

---

## The lesson in steps

1. **Short-term profits prove nothing.** Even a negative system has a winning tail early
   on, and that tail is where social media's screenshots come from. The losing side stays
   quiet. Keep trading and "the drift is always going to win".
2. **Judge the system, not the path.** Build a full historical track record with no
   look-ahead or data mining:
   - in-sample, out-of-sample, walk-forward, and parameter stability;
   - Monte Carlo the result to check it's a consistent, tight fan with positive drift, not
     one lucky curve.
3. **Benchmark against buy-and-hold.** If the system doesn't beat simply holding the S&P,
   don't take the extra risk. Back to the idea bank.
4. **Paper trade to re-validate.** Live results should fall inside the backtest's
   distribution. If the backtest says 30–40% a year with a 15–20% max drawdown, and four
   months live are −20%, that points to look-ahead, a coding error or a broken backtest.
   You want to find that before any money is at risk.
5. **Then a burn-in phase at low risk, then deployment.**
6. **The capital problem.** 40% a year on £1,000 is £400, which isn't worth much. Prop
   firms offer a **short-term** way to build capital, to be rotated back into your own
   systems:
   - their business earns from failed challenge fees;
   - trades usually aren't placed in a real market;
   - your wins are their losses, a clear conflict of interest.

   Using them well needs a system with a **consistent, well-shaped distribution**. It
   doesn't need an extraordinary one.
7. **Simulate the challenge before you pay for it.** Load the trade model into the toolkit,
   find the risk level that keeps the pass rate high and daily-loss breaches rare, and read
   the expected days to pass.
8. **Account net of costs, always.** His example:
   - 5 accounts × £200 = **£1,000** in fees;
   - 2 blow, 1 passes step 1, 2 reach funded, 1 of those later blows, and 1 pays out
     **£5,000**;
   - what matters is payouts minus fees and profit splits.

   If that's positive and repeatable, it's a "structurally complete process": a funnel that
   feeds capital into your real systems.
9. **The learning curve.** He also drew a curve that dips down (effort that isn't paying off,
   because the approach was wrong) and then rises once the principles click. The time
   before isn't wasted: seeing *why* it failed is the turning point.

---

## Reading it honestly

The core message (variance, drift, validation, benchmarks, paper trading) is sound, and it
matches this repo's own rules (`CLAUDE.md`). Some caveats worth keeping next to it:

- **Monte Carlo on backtest trades isn't validation.** Resampling a strategy's own trades
  shows the spread of outcomes *if the backtest is true*. It says nothing about whether the
  edge survives new data. `CLAUDE.md` says the same: "Don't let Monte Carlo stand in for
  OOS." The toolkit's pass rate inherits every flaw of the input trades, and the forecaster
  portfolio feeding it is only as good as its out-of-sample record.
- **Resampling trades one at a time understates losing streaks.** If losing days cluster,
  which they do in real markets, drawing trades independently makes paths smoother than
  reality. Daily-loss and max-loss breaches then look rarer than they are. Resampling
  whole days, or blocks of days, is safer for prop rules.
- **The benchmark for a pass rate is the zero-edge pass rate**, about 33% for a 2-step
  10%/5% challenge with a 10% floor, not 50%. Report the pass rate *minus* that.
- **Challenge expected value is simple arithmetic and worth writing down:**
  > EV per attempt = P(funded) × E[payouts while funded] − fee (+ refunded fee, if the firm
  > refunds it)
  
  E[payouts] depends on the edge *continuing* after funding, and on the firm's rules
  (profit split, consistency rules, restricted news trading, payout conditions).
- **Beating buy-and-hold is a risk-adjusted question.** 40% with a 15% drawdown against the
  S&P's ~15% is a fair comparison only once drawdown and volatility are in the picture.
  Sharpe and Calmar do that. The S&P has had −25% to −34% drawdowns in recent years
  (2020, 2022).
- **Counterparty risk.** Firms can change rules, deny payouts or close. A process built on
  them should be priced as uncertain income, not a salary.

---

## How it maps to this repo

| Lesson idea | Where it already lives here |
|---|---|
| Drift wins; short samples mislead | `metricsCore.sharpeStdError` (report every Sharpe ± SE), `minTrackRecordLength` (how long a record must be) |
| Monte Carlo is expectation-setting, not OOS | `CLAUDE.md` "Output analysis" rules |
| Paper trading must land in the backtest's distribution | The MVE book **forward tracker** (`MVE_BOOK_FORWARD_TRACKER.md`): parity replay, KILL-DRAWDOWN at 1.5× the backtest drawdown, KILL-INCONSISTENT when forward Sharpe falls below backtest − 2 SE |
| Benchmark vs buy-and-hold | `education/buy-and-hold-notes.md`; every card's naive-benchmark rule |
| Prop-firm rules | `js/overnightHoldEngine.js` `runPropFirmRuleCheck`: daily loss, static/trailing drawdown, target and time, consistency, run on one backtest path |
| **Not built** | A prop-challenge **Monte Carlo pass-rate** brick: resample daily P&L in blocks, apply a named firm's rules, and report pass rate against the zero-edge baseline, time to pass, and EV net of fees |

---

## Key takeaways

1. **Early profit on a losing system is expected.** 35% of traders on a −0.2%/trade method
   are up after 10 trades, and 0.7% after 380. Needing hundreds of trades is normal.
2. **A system is a distribution, not a curve.** Look for positive drift and a tight fan of
   paths.
3. **Beat buy-and-hold on a risk-adjusted basis, or don't deploy.**
4. **Paper trade to catch backtest errors before money does.**
5. **Prop firms are a short-term capital funnel with a built-in conflict of interest.**
   Simulate the pass rate against the zero-edge baseline, and account for every account
   net of all costs.

---

## Appendix: full transcript (verbatim)

*Auto-generated captions as pasted, unedited apart from paragraph breaks and the section
headings, which mark where the video changes topic. Spelling slips from the captions ("Monte
Cara", "residules", "varian") are left as they were.*

### Intro

So today, this video is going to be covering just a groundup breakdown and also a directional process for how you can be approaching everything, why we're doing everything this way, and the best way to actually maximize the ROI. So, we're going to start off today just in the micro bank, and particularly this lesson here. Now, the reason for this is there's just a couple little things I wanted to run through. And it's just understanding how in in short-term variance is how even systems with no edge can still seem like they're yielding returns and just really breaking that down from the basics.

### The equity curve and the distribution of paths

And for that, I'll be using purely this graph here. So all this is showing is essentially these distributions here are within a system. You have your equity curve. So it looks something like this. All an equity curve is is when you see your account balance on a uh on an account. Say you're taking positions, you're seeing that number going up and down. All an equity curve is is translating that number into a graph. So for example, say here you're starting with let's say 100,000 in an account. This is just easy round number to work off. Say you begin executing and you're having some positively returning alongside some small little negatively returning positions. So this is simply just all your wins and losses then translated into a curve. So all this is is showing how your balance looks like over time. So your starting balance here, you've gone up, you you've lost a few positions, so it's gone down, you've won a few more and it's gone up. I'm simply just laying that out as a chart.

And then within each system, we can then take the metrics and we can model this as a distribution. So all that means is simply within a system, it it's going to have certain parameters that it's going to perform within. So we can model this as its drift and its volatility component. And then what then that then lets us do is simulate different outcomes of the same model. So let's say we took five people. We had person one there. Can I make this a little bit bigger for the sake of So that's person one, person two, person three, and person four. If person one starts in, let's say, 2022, so they're all using the same system. Person one starts in 2022. Person two starts in 2023. Person three started in 2025, and person four started 2 weeks ago. They're all using the same system. However, their personal equity curves are going to look different because they're starting at different times. And when we model distributions under Monte Cara, we're essentially trying to capture components like this. So we know that a system has an equity curve. But we also want to know is is this equity curve an artifact? And if we model multiple different paths under the same systems distribution, how does that then look? So if we now come here. So within this single system equity curve we can also have slightly different one here. We can also have another slightly different one. And here also one slightly different. So you see how these are all the same system but because there's different potential paths and we'll we'll go into this in more detail in future about Monte Carlo and different distributions and how you can uh formulate just the different paths. But all this is showing is within the same system there isn't just one route. there's going to be different potential paths and we want to see within those paths is there consistency and we can then model the drift and the volatility. So we can see the here we have a a clear upwards drift. So we can see here that these are all clearly going upwards. And then for the volatility component there's no uh curves that are going negative. There's no curves that are going to the middle. They're all fairly consistent and fairly close together and that's really really important.

### Artifacts: a negative system through the slider

So next what this then moves on to is artifacts. So if we look here back onto this so we can see that using a system and for the sake of this example this is going to be a system with no edge a negative edge. So this is going to be a negatively performing and returning system. So after 10 trades in this system we can see that there is uh positive returning path and also negatively returning paths. So what this means is even with a negatively returning system the short-term variance and by variance we just mean like variation the different potential paths and what's possible under the systems distribution. We can see that short-term profits are possible. So this is where you would be seeing online where people are posting all of their winning positions, their profits. They're saying they're doing so well when in reality is it's likely that they're using a completely negatively returning system and they're just on the favorable side of variance. And all that means is that this upside uh return here is not an artifact of an edge. It's an artifact of a short-term variable that's not going to persist.

So now if we move along to few more trades, we'll go to 70 60 trades. So we can now see that the further we continue executing the system is a real edge and real uh drift is starting to show a lot more. So here we can see on the downside the losses are now clearly showing a lot more than these winning people. Now the these Say, say the way you follow a system online, you if you just look up day trading on YouTube, you'll see hundreds of people just telling you a system claiming it's it's going to have an insane edge when that's simply not the case. In large majority of situations and and it's much much higher than you think. It's almost all where these are all negatively returning systems. they don't have an edge. And however, when you see people posting profit saying, "Oh, this is working." It's because they're on the short time shortterm variance on this side of the distribution. When we know that if you actually do a full historic track record and assess everything, you'll be able to see the full drift and full metrics and be able to then capture and see, wait a minute, this is a negatively returning system. So we know that everything up here this is not going to persist and if we keep executing the the drift is always going to win. However, in this case here, while there still is people up here in the green, this is still where you'll be seeing everyone posting, oh, I'm doing so well with X uh X amount this month. all of these sort of profits and returns. Whilst this side is probably just maybe staying quiet and wondering what they're doing wrong, wondering why they're not seeing the same results when you would essentially always going to fail from the start. because the these red side down here is a product of the system that's going to persist and it's just going to keep on continuing in this in this drift. However, however, at the same time, the people who are on the fortunate side of the distribution currently, we know that that's not going to persist. So, this is just short-term uh favorable variance.

Now, if we continue on, we can see the pictures just getting clearer and clearer and clearer. And then you can just see the drift more and more. And all of a sudden, all of these green people up here, the drift has now won because this is the real system. So, the system was a negative negatively returning system since the very start. However, because there was people on the fortunate side of a of a variance that does not persist, it's short-term variance. That's why people have seeming to be successful with something that clearly doesn't work. So, if you've ever sat in a scenario where you've learned something online, you see all these people showing X, Y, and Zed, but then when it comes to you actually testing this yourself, you're simply not seeing the same results. That's because this is the real component of the system. Clear negative returns. Everything up on this side is short-term variance and it's not going to last. And you're not planning on executing a system just to hopefully get lucky at the start. You want to be in this for longevity. You want to have something that's structurally complete and it you can actually do a full track record on in in your back testing and uh validation. You need to ensure that we don't want look ahead or any other uh data leakage data mining coming into play. So in the other education you'll see this is why we then have this hard validation and testing where we have in sample out sample walk forward parameter stability all of these validation methods before a single dollar or pound is even risked in a real market. And the reason why is we want to see the actual systems truth. We we don't want to see that oh at the very very start you might have got a little bit lucky and then seen some green returns. We want to know that is this system even a profitable system and clearly in this case it's not. So why would anybody care that they could be lucky on the fortunate side of varian short term when you know that longer term if you continue executing this system you're going to be in the red. you're going to be negatively returning. And this is unbelievably more common than you think. And this is why we have to do all of the validation and testing that we do. And that's also why this is so so important

### The model theory series and the learning curve

and then just to move on from this as well. So back in the microlearning here, if you don't have any ideas, we have this new series here. So we can see that this is a start to finish model theory walkthrough where the aim of this is you can see the logic behind everything. You can click through this understand the full construction the logic how it then develops into the actual equity curves which we can see a little bit later here. I think I might have gone past it. Here it is. So here we can see how then later this translates into an equity curve. Why we need that equity curve. Why we also need Monte Carlo simulations just to ensure that this equity curve isn't a lucky path. We want to see if we simulate all of the possible paths under that models models metrics. Are they all consistent? Is there low volatility where the paths are close together and do they all have a structurally positive drift?

So this then allows you to you're understanding why things you may have previously learned, seen in other places, why you always felt that you were doing something wrong and it was something down to you when in reality what you had in the first place. You you were destined to fail pretty much because you weren't seeing all of these conflicts of interest and just all of these wrong assumptions being made. that's going against all the basic principles of what you need. And now after seeing that and it might feel as if you're in a position where you're like, "Oh, oh no, all of that time I've spent there is completely wasted." However, you're now in a position where let's say here, just do a little graph here. So before here, so when you begin without all of these correct basic principles, without learning this education and seeing exactly where everything's derived from, is it logical? Is there data to back this up and you don't want to be taking people's word for anything. You want to see this and validate everything yourself through data and through your own validation. So we can see from this example there on like your journey, your learning path. It's very possible you're on just a downward trend where you're all the effort you're putting in is not yielding any learning or development. And then we can see now that that's because structurally it wasn't in a position where you were using just the right approaches where you weren't seeing the underlying truth and the underlying uh validity of everything. But then as soon as you get past that point where you can now see, oh, that makes so much more sense and now understand it, that time is not wasted at all because now that you're aware of that, that is then where the tables turn and everything can then start going up and now you're now seeing this upward progression and you're now making really good advances in learning in your own developments and that is just extremely extremely important.

### The benchmark and paper trading

And then the next thing I'm going to touch on is just what do you actually want to be looking for. So for example, we know that beating the market itself, even something like S&P buy and hold, that's not something everybody can do at all. And what you need to be able to uh assess and validate is are your ideas actually outperforming the market? Because if it's not outperforming buy and hold, then you don't want to be taking unnecessary risks to underperform a simple buy and hold. So that is going to be your benchmark. And just to show how accessible this all is, this is just going to be in Google Sheets. It's free to use. So just delay this out. So your benchmark, this is going to be buy and hold S&P. So if you're not outperforming the S&P, then it's likely you don't really want to be deploying this idea. You want to keep testing, keep finding new ideas to test and use. And then the perfect place to do this is right down here. This new series that we've started. So you're going to be able to come straight into here. Find a new idea. You don't have to take take his word for anything. This is the theory. So you can then source the data which I'll be showing you how to do. Test the data, validate the data for a full validation suite. But then the important part is you also need the paper trading to then reorder and revalidate against your historical testing just to make sure that you're falling into the same distributions. And by distributions, all this simply means is say in your uh historical testing, you're looking at making 30% 40% a year with like a 15 20% max draw down, but when you're going live for 4 months, you're you're down. You're negatively turning down 20%. That shift means that there was probably some form of look ahead, some coding error, or just something wrong in the back test. And you want to be able to pick that up without a single dollar or single pound at risk in any market. And this is all protection of capital. And that's something very very important because we know that without the correct validation and testing in place, you're going to be ending up following these negatively returning systems without any idea what's even going on, what to expect. And then if you are fortunate to be on this lucky side of the variance, short-term variance that we know does not persist, if you keep going, you'll end up fully in the red. But if you do end up here, at first you'll be thinking, "Oh, I've got this. This is working." But then as we continue executing and you're going in the red, then you'll be thinking, "Oh, what am I doing wrong? What have I done different? What have I done or changed?" When in reality, it was never you for it was the thing you were using and you were never able to tell. That's why we put this big focus on data.

### The capital problem and prop firms

And then next we have say we have uh a system where we're now outperforming the buy and hold. So just something let's say just for sake argument sake let's say we do 40% annual return and that only comes with a 15% max draw now. So now that we have that, we can understand that if if we put capital into this, we're having a positive return. We've done the full validation, full paper trading, full auditing, everything's structurally complete. You're now at a point where you can do a burn-in phase with lower risk and then you're at the actual deployment phase. Then the problem that comes in here is if you don't have capital, this 40% may not be a lot. So, say you're only able to put in, let's say, for argument sake, £1,000, then a 40% yearly return on that is not quite that much return for the work put in. So now you need to sit and evaluate where is there a possibility where I can source more capital and that's then why we have created this toolkit here that everybody's able to use. So all this toolkit is doing is this is related to prop firms. Now the important thing to say is that the prop firm industry as as a most part is a conflict of interest. These props make money when you lose. Uh their business returns comes from uh uh challenge fees when people blow the accounts. So they're probably in almost all cases you're not trading into a live market. You're the broker's taking the other side of your positions and this business model is making money and returns on the fail challenge fees. So their balance sheet, their P&L is when you lose that helps their P&L. When you win that negatively affects their P&L. So there's a clear conflict of interest. And why is that important? Because this means that this is not a long-term solution, these prop firms. It is a short-term opportunity to help build capital and then we can rotate this back into our longerterm systems here. And instead of having a,000, let's say we do extremely well from props, we've now extracted 50,000. Suddenly on a 50,000 capital, that 40% yearly return is a lot of money. That that is a big big change. But the important thing is is again you don't want to end up in this negative negatively returning uh distribution.

### The process: idea bank, validation, the toolkit

So you need to run through this and the process will look like you can come onto the micro bank. We have all of these ideas here. We have the new macro terminal where you can see logical factors and I'll be given so much uh education just on explaining system construction. We'll have a full series here of many many system ideas. So you can come here, you can click here and you can see okay this is a system theory. This is using for example exposure vectors, principal components, translating this into deployable systems with residules and you can take this idea source the data and validate the system and then you can see before any capital is at risk. Is this likely to be a positively returning system or is this likely to be a negatively returning system? And you're able to map everything. And you have you can have a full track record of important metrics. So the important metrics I won't I won't go into too much detail but we know we care about max draw down sharp sortino uh annual returns and we can see all of that at a fair view and we can also deploy in paper to reorder and validate everything. And then from that point what we can then do is we can come you can all come straight into the toolkit here. You can upload your models straight in. It gives a nice view of just your equity curves and your distributions. But more importantly you can also simulate your pass rates of these accounts. So for example if we say crank the risk up. So here we can say we can see that for example there's a 56% uh pass rate which you you're just over a coin flip. So at that point you can reassess and think okay what's hindering this performance? We can see are the daily draw downs uh becoming an issue. So let's just lower the risk. we can re simulate and then you can see all of the expected uh pass rates to expected times that you'll be looking to pass and then just everything laid out really really nicely.

### Net of costs: the spreadsheet

And then from here, why is this important? If you're able to which which you're all able to do this, you're all able to have uh positive returning uh things with prop firms because there's a challenge fee structure and that's something that actually works in your favor. So in in this scenario, you don't actually need an insanely performing system. All you need is a consistent system that has the right shape distribution and then all you're looking for is at the end of this you say we we just want to be net positive of of costs. So so we want to include our costs and this is something really important. This is why we're on the Google sheet. So you want to see sit here you can do something very simple cost and you can say if I have five accounts let's say they're 200 each. So here we have our five accounts. We can see here that that sums up to a th00and. So our cost currently is a th00and. We can run this through the toolkit. We can see our expected distributions. Then we can then see a projected return. So this something you can all be doing. Projected return. You can get your figures in here. So per account uh just the EV which is expected value. And then all you want to be at the end is you just want a net of costs. And then you want to be sitting here and constantly analyzing what are you putting out, putting in versus getting out. And then is this positive in your favor? So let's say we have these five accounts. Let's say that two of them are lost. One of them gets through a phase one. Let's say then we have two left. Both of these are then into the uh live phase, let's say. Even though with a prop firm, it's not actually going into a live market. They're taking the other side of that trade. But uh moving on. So from here, we have these two accounts live. Then maybe one of these we then lose. However, this one we then get a 5,000 payout. Then all we want to sit and assess is after we've take taken all the costs out. So the costs of all of these accounts to actually purchase them and then also the cost of a profit split or any other costs that come into this are return minus the cost. Is this positive or negative? If it's positive then you can then see oh this is a structurally complete pro process. So that's a repeatable process where you have a funnel and a process where you're having a positive return that you can then able to rotate into the systems you're building on a live account and then you're building up your capital for that. And then this is an extremely healthy process. But the most important thing of this all is the data validation. And you need to be really on top of um looking at your costs versus your returns net of costs because again coming back to this this lesson here, we really want to make sure that you're not ending up on this side of the distribution. And you want to have really fair views and accurate views on everything you're doing.

### Recap

So just to recap just the process here, there's a significant amount of new resources on the way which is going to help you all to be able to develop your own systems. You're all so much closer to this than you already think. And some of you are already doing this and performing unbelievably well. You're you're also uh there's also people in the group already where they're performing unbelievably well on these prop firms and pulling positive returns. So if you ever want to help with any of this, just drop a message into the uh chat and then there will always be someone there to help. Either one of them will be happy to help as a community or I'll be there to help myself. Then from this, so just to recap, so we are validating ideas, we are then seeing do these ideas and systems outperform just the standard buy and hold. If they don't, we don't want to be taking unnecessary risk over something we're not outperforming. So now it's back to the drawing board. You're back to the microlearning where you can test some more system ideas that we'll have a full series on. And also we got many many new things on the way where if you currently don't feel confident uh confident coming up with your own ideas, there'll be theory sitting here ready for you. So all you need to do is click in, take some time just to click through everything, learn how it works, and then you're working through the process of using the other lessons from the education bank about uh data modeling. you're testing these ideas, auditing the ideas, and then you can also see if I if I don't have the capital to actually use my system that I've now created, what routes can I take to help work on that? And then this is where then you can test things like this with Monte Carlo against a prop firm challenges. And then you can begin to structure a really good process where you're maximizing your ROI, but you're also being accountable and responsible for actually understanding the data and performance of what you're using, which is the most important thing out of anything. So, what I'll do is I'll leave this here today and then if anybody has any questions at all, uh, make sure to keep on sending those across to me and then I'll help out everywhere where I can and we can get everybody set up and working towards some really, really good progression.
