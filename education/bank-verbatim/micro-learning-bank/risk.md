# SERIES 02 - Risk Before Return

Most accounts are not lost on bad ideas. They are lost on good ideas sized badly. This series is the arithmetic underneath that, starting with what a drawdown actually costs you.

## r1 - The Mathematics of Drawdown (7 min)

You are down 50 percent. What do you need to get back to level? It is not 50.

### Slide 1 - cover: The Mathematics of *Drawdown*

**eyebrow:** Lesson 01

**sub:** You are down 50 percent. What gain do you need to get back to where you started? Answer before you continue. Most people say 50, and the real number is why professional risk limits look so conservative from the outside.

### Slide 2 - demo: What it costs to get back

**interactive demo:** `recovery`  (caption below)

**sub:** Move the drawdown and watch what the recovery becomes.

**cap:** This is arithmetic, not sentiment. Down 20 percent you need 25 to recover. Down 50 you need 100. Down 70 you need 233. The curve goes vertical because you are trying to earn back a percentage of a smaller account than the one that lost it.

### Slide 3 - concepts: Why the two numbers differ

**items:**
  -
    **i:** bars
    **t:** The base changes
    **d:** A loss is taken on the account you had. The recovery is earned on the smaller account you have left.
  -
    **i:** trend
    **t:** Compounding runs both ways
    **d:** The same mechanism that grows an account quickly also makes losses expensive to undo.
  -
    **i:** loop
    **t:** Time is the hidden cost
    **d:** A deep drawdown does not only need a larger gain, it needs a longer period to produce it.
  -
    **i:** target
    **t:** Capacity to recover falls
    **d:** The smaller the account, the less each correct decision is worth in money.

**body:**
  - **Down 50 percent, a strategy earning 20 percent a year needs almost four years just to get back to level.** Nothing was wrong with the strategy. The size of the loss changed what the strategy could do for you.
  - This is why professional risk limits look conservative from the outside. They are not aiming to avoid losses. They are aiming to stay inside the range where recovery is still arithmetic rather than a project.
  - The practical rule follows directly. Cap the loss at a level where the required recovery is something your edge can produce in a reasonable time, then size everything to respect that cap.

**beat4:** Because returns are the exciting half. Recovery arithmetic is unglamorous, it makes the numbers smaller, and it caps what you can promise. A lesson about surviving does not sell as well as a lesson about compounding, so the second one gets taught and the first one gets discovered later.

### Slide 4 - demo: How long you spend under water

**interactive demo:** `underwater`  (caption below)

**sub:** Same edge every run. Only the order of the results changes.

**cap:** Every one of these paths has a positive expectancy and the same win rate. What changes is the sequence, and the sequence decides how deep you go and how long you stay there. A strategy that makes money still spends most of its life below a previous high, which is the part nobody advertises.

### Slide 5 - concepts: What a drawdown costs beyond the number

**items:**
  -
    **i:** eye
    **t:** Judgement degrades
    **d:** Decisions taken while trying to recover are rarely the decisions the system asked for.
  -
    **i:** check
    **t:** Rules get broken
    **d:** The urge to size up is strongest exactly when sizing up is most dangerous.
  -
    **i:** layers
    **t:** Constraints bind
    **d:** On a funded account a drawdown limit does not care about your expectancy. It ends the account.
  -
    **i:** shuffle
    **t:** Capital leaves
    **d:** External money withdraws during drawdowns, which removes the base the recovery needed.

**body:**
  - **The arithmetic is only half of it.** The other half is that drawdowns change behaviour, and changed behaviour is what turns a survivable loss into a terminal one.
  - Under a hard floor the effect is mechanical rather than emotional. A trailing limit converts an ordinary losing sequence into a closed account, regardless of how good the underlying edge is.
  - So the question is never only how much can I make. It is how much can I lose before the thing that makes it becomes unavailable to me.

### Slide 6 - compare: Two strategies, same return

**sub:** Identical annual return, different path.

**left:**
  **h:** Deep and volatile
  **chip:** Fragile
  **items:**
    - Peak to trough of 40 percent
    - Long stretches below the previous high
    - Sizing must be small to survive it
    - Fails most hard drawdown limits
    - Hard to hold through in practice

**right:**
  **h:** Shallow and steady
  **chip:** Durable
  **items:**
    - Peak to trough of 12 percent
    - Recovers quickly after losses
    - Supports larger size for the same risk
    - Survives funded account constraints
    - Can actually be held to completion

**body:**
  - **Two strategies with the same annual return are not equally good.** The one with the shallower path can be sized larger for the same risk, which means it produces more money from the same percentage return.
  - This is what risk adjusted return actually means. Not a ratio for a report, but the practical question of how much capital you can responsibly put behind something.
  - It is also why the path matters more than the total when a hard limit is involved. Under a drawdown floor, the deepest point decides whether the total ever arrives.

### Slide 7 - check: Check yourself

**qs:**
  -
    **q:** An account falls 40 percent. What gain is needed to return to breakeven?
    **o:**
      - 40 percent
      - About 67 percent
      - About 50 percent
    **a:** 1
    **why:** The loss is taken on the original account, the recovery is earned on what remains. 40 divided by 60 is roughly 67 percent.
  -
    **q:** Two strategies return 20 percent a year. One draws down 40 percent, the other 12. What follows?
    **o:**
      - They are equivalent, since the return is the same
      - The shallower one can carry more size for the same risk, so it produces more money
      - The deeper one is better because it takes more risk
    **a:** 1
    **why:** Risk capacity is set by the worst part of the path. A shallower drawdown supports larger position sizing at the same level of risk.
  -
    **q:** Why does a positive expectancy strategy still spend most of its time in drawdown?
    **o:**
      - Because the edge is too small
      - Because new highs are rare events and everything between them is below a previous peak
      - Because costs are too high
    **a:** 1
    **why:** Equity only sits at a high on the day it makes one. Every other day is somewhere below the last peak, which is what being under water means.

### Slide 8 - takeaways: What to carry forward

**keys:**
  - A loss and its recovery are different numbers, and the gap widens the further you fall.
  - Down 50 percent you need 100 percent back, which is a project rather than a rebound.
  - The same edge produces very different paths. Sequence decides depth, not skill.
  - A positive expectancy strategy still spends most of its life below a previous high.
  - Cap the loss at the level your edge can recover from in a reasonable time, then size to that cap.

**unlocks:**
  - Set a maximum drawdown from what your edge can realistically recover, rather than from what feels tolerable.
  - Compare two strategies properly, using the depth of the path rather than the size of the return.
  - Hold through an ordinary drawdown without concluding the strategy is broken.

**bridge:**
  **label:** Next in this series
  **title:** Risk of Ruin
  **text:** So depth decides what you can recover from. How likely are you to reach a depth you cannot? That is not a matter of opinion. It is a number you can calculate before it happens.

## r2 - Risk of Ruin (8 min)

Four hundred accounts, one strategy, one real edge. Why does a third of them die?

### Slide 1 - cover: Risk of *Ruin*

**eyebrow:** Lesson 02

**sub:** Four hundred accounts run the same strategy with the same genuine edge. How many are still alive at the end? The answer depends on one number, and it is not the win rate.

### Slide 2 - demo: The same edge, four hundred times

**interactive demo:** `ruin`  (caption below)

**sub:** Set the risk and the win rate. Every line is one account running the same strategy.

**cap:** Every account here has the same positive edge. The only thing separating the blue lines from the red ones is the order the wins and losses arrived in, and how much was risked on each. At one percent almost everyone survives to collect the edge. Push the risk higher and the strategy stops being the thing that decides the outcome.

### Slide 3 - concepts: What ruin actually is

**items:**
  -
    **i:** target
    **t:** A floor, not a feeling
    **d:** Ruin is any level at which you can no longer continue. On a funded account it is written into the rules.
  -
    **i:** loop
    **t:** It is reached by sequence
    **d:** A run of losses is normal and expected. Whether it ends you depends entirely on size.
  -
    **i:** bars
    **t:** It is calculable in advance
    **d:** Given an edge and a risk per trade, the probability of hitting the floor is a number, not an opinion.
  -
    **i:** check
    **t:** It is permanent
    **d:** Every other loss can be recovered. This one removes the ability to try.

**body:**
  - **Ruin is not the same as a bad month.** It is the point where the account, the mandate or the rules stop you continuing, and everything after it is unavailable regardless of how good the edge was.
  - A run of six or seven losses in a row at a 53 percent win rate is entirely ordinary across a few hundred trades, and roughly one account in seven will see a run of ten. The question is never whether such a run arrives, only what it costs when it does.
  - This is why sizing is decided before the trade rather than during it. During a losing sequence, the arithmetic that should govern the decision is the least available thing in the room.

**beat4:** Because the maths is invisible until it happens to you. Nothing about a single trade tells you that you were sizing at ruinous levels, and the accounts that proved it are gone and not posting. The survivors are the ones writing the content, which is exactly the sample problem this series keeps returning to.

### Slide 4 - demo: Where more risk stops paying

**interactive demo:** `optimal`  (caption below)

**sub:** Median outcome in blue, chance of being wiped out in red.

**cap:** The blue line rises, peaks, and then falls. That peak is the point where risk stops buying return and starts buying variance. Push past it and the median account does worse while the chance of being wiped out climbs toward certain. Notice how far left the safe region sits compared with the sizes most people actually trade.

### Slide 5 - concepts: Why more risk stops helping

**caveatLabel:** What this simulation assumes

**caveat:**
  - **The model here treats every trade as independent and identically distributed, which real trading is not.** Volatility clusters, losses arrive in bunches, and correlated positions turn several trades into one.
  - All three of those make ruin more likely than the simulation suggests, not less. So treat these numbers as the optimistic case, and give yourself more room than the chart implies rather than less.

**items:**
  -
    **i:** trend
    **t:** Losses compound too
    **d:** A run of losses at large size leaves a base too small for the wins that follow to matter.
  -
    **i:** layers
    **t:** Volatility costs return
    **d:** Two accounts with the same average trade end up in different places if one swings harder.
  -
    **i:** shuffle
    **t:** The floor stops the experiment
    **d:** Ruin removes the remaining trades, and the edge only pays across all of them.
  -
    **i:** eye
    **t:** Behaviour breaks first
    **d:** Long before the mathematical floor, sizing that hurts changes the decisions being made.

**body:**
  - **Larger positions do not scale returns cleanly, because the losses scale as well and they scale on a shrinking base.**
  - The clean way to see it is that an edge is paid across many trades. Anything that removes future trades removes the payment, and size is the fastest way to remove them.
  - The practical version is simple. Choose the risk per trade that keeps the probability of hitting your floor negligible across the number of trades you intend to take, and accept the slower path that comes with it.

### Slide 6 - handoff: Now run it on your own record

**sub:** The point of this lesson is the relationship. Getting your actual number is a different job, and there is a proper instrument for it.

**body:**
  - **Everything on the previous slides used invented numbers, deliberately.** A simulation built on a win rate you typed in is only as good as that win rate, and a win rate drawn from a few dozen trades is mostly noise.
  - Your own record is different. It contains the real streaks, the real tails and the real gaps between your best and worst periods, and those are exactly the features that decide whether a sequence ends an account.
  - So take this to the toolkit rather than to a calculator. It works from your actual trade history and simulates against the rules you are actually trading under.

**hand:**
  **label:** Where to do this properly
  **title:** The Prop Firm Toolkit
  **text:** Built for exactly this question, and considerably more rigorous than anything that would fit inside a lesson.
  **does:**
    - Takes your real trade history, pasted or uploaded, rather than a typed estimate.
    - Resamples it in blocks, so your genuine streaks and tails survive into the simulation.
    - Runs the rules as each firm actually specifies them, including trailing drawdowns and consistency requirements.
    - Reports expectancy, sizing and the probability of reaching a payout rather than a single headline number.
  **url:** https://cog000.github.io/Prop-Firm-Toolkit-/
  **cta:** Open the toolkit

### Slide 7 - compare: Two ways to size the same edge

**sub:** Identical strategy, different survival.

**left:**
  **h:** Sized to win quickly
  **chip:** Fragile
  **items:**
    - Large risk per decision
    - Depends on a favourable sequence
    - A normal losing run ends the account
    - Wide swings force poor decisions
    - Fails hard drawdown limits routinely

**right:**
  **h:** Sized to survive
  **chip:** Durable
  **items:**
    - Small risk per decision
    - Any sequence is survivable
    - Losing runs are uncomfortable, not terminal
    - Decisions stay closer to the plan
    - Stays inside constraints by design

**body:**
  - **The right column is not more cautious. It is more likely to still be trading when the edge pays.**
  - An edge produces its return across a large number of trades. The only way to receive it is to still be present for them, so survival is not a defensive choice, it is the mechanism.
  - Ask the question in reverse. Not how much can I make if this goes well, but how many consecutive losses can I take and still be here to place the next trade.

### Slide 8 - check: Check yourself

**qs:**
  -
    **q:** A strategy has a genuine positive edge. What determines whether an account survives to collect it?
    **o:**
      - The accuracy of the entries
      - The risk taken per trade relative to the floor
      - The number of instruments traded
    **a:** 1
    **why:** The edge is paid across many trades. Size decides whether an ordinary losing sequence removes the remaining trades before the payment arrives.
  -
    **q:** Why does the median result fall once risk per trade gets large enough?
    **o:**
      - Because commissions rise with size
      - Because losses compound on a shrinking base and ruin removes future trades
      - Because the win rate falls
    **a:** 1
    **why:** Larger losses leave less capital for the wins that follow, and accounts that hit the floor stop taking trades at all. Both drag the median down.
  -
    **q:** What is the useful question to ask about position size?
    **o:**
      - How much can I make if the next run goes well
      - How many consecutive losses can I take and still be trading
      - What size do other traders use
    **a:** 1
    **why:** Losing runs are certain to arrive. Sizing is the decision about whether they are survivable, and that has to be made before the run starts.

### Slide 9 - takeaways: What to carry forward

**keys:**
  - A positive edge does not protect you. Sizing decides whether you are present when it pays.
  - Ruin is a floor you cannot continue past, and on a funded account it is written into the rules.
  - Losing runs are expected, not unusual. Only their cost is under your control.
  - Past a certain size, more risk lowers the median result and only adds ways to lose.
  - Size so that any ordinary sequence is survivable, then let the edge do the work over time.

**unlocks:**
  - Calculate your own probability of ruin before you take the risk, rather than after.
  - Choose a risk per trade that survives any sequence you are likely to meet.
  - Read a funded account rulebook as a constraint you can size for, not an obstacle to be endured.

**bridge:**
  **label:** Next in this series
  **title:** Position Sizing and the Hidden Bet
  **text:** If size decides survival, how should size be chosen? Not by comfort, it turns out, and not once and left alone.

## r3 - Position Sizing and the Hidden Bet (7 min)

You chose a position size. What did you actually bet on when you chose it?

### Slide 1 - cover: Position Sizing and the *Hidden Bet*

**eyebrow:** Lesson 03

**sub:** You picked a position size. What were you actually betting on when you picked it? It was not only the direction. Most people have never been asked this question, which is exactly the problem.

### Slide 2 - demo: The same strategy through a change in conditions

**interactive demo:** `sizing`  (caption below)

**sub:** Volatility changes halfway through. One line keeps its size, the other keeps its risk.

**cap:** Both lines trade the identical signal on the identical data. The blue line holds position size constant, so when the market moves twice as far, it loses twice as much. The green line holds risk constant by adjusting size to conditions. Nothing about the strategy improved. The risk simply stopped drifting.

### Slide 3 - concepts: What a fixed size is assuming

**items:**
  -
    **i:** target
    **t:** That volatility is stable
    **d:** Size fixed in a quiet market becomes a much larger bet in an active one.
  -
    **i:** bars
    **t:** That every trade deserves the same exposure
    **d:** A wide stop and a tight stop are not the same risk, even at the same size.
  -
    **i:** trend
    **t:** That the account is not changing
    **d:** Fixed size on a growing account under risks, and on a shrinking one over risks.
  -
    **i:** loop
    **t:** That conditions will not persist
    **d:** Volatility clusters. A high volatility period tends to be followed by more of it.

**body:**
  - **Choosing a size is choosing a risk, whether or not you did it deliberately.** The exposure attached to a position is the size multiplied by how far the market moves, and only one of those two is under your control.
  - Volatility is not random noise around a fixed level. It clusters, so a period of larger moves usually continues, which means the drift in risk lasts long enough to matter.
  - The fix is a reordering rather than extra work. Decide the risk first, then let the size be whatever produces it.

**beat4:** Because a fixed size is easy to say and easy to follow. Two contracts is an instruction. Size derived from volatility and invalidation distance is a calculation, and calculations do not fit in a caption. Simplicity won, and the cost of it is invisible until conditions change.

### Slide 4 - demo: What the stop distance decides

**interactive demo:** `stopsize`  (caption below)

**sub:** Move the stop further away and watch what each approach costs you.

**cap:** This is the same idea on a single trade. If the stop is twice as far away and the size is unchanged, the loss is twice as large, and nothing about your conviction or the setup justified doubling it. Setting size from risk keeps the cost flat, which is what makes losses comparable to each other.

### Slide 5 - concepts: Sizing in the correct order

**items:**
  -
    **i:** check
    **t:** Choose the risk per trade
    **d:** A fixed fraction of the account, small enough that any ordinary sequence is survivable.
  -
    **i:** shuffle
    **t:** Measure the distance to invalidation
    **d:** Where the idea is wrong, expressed in the current volatility rather than a fixed number of points.
  -
    **i:** bars
    **t:** Derive the size
    **d:** Size is the output of the first two, not an input you choose separately.
  -
    **i:** loop
    **t:** Recalculate as things change
    **d:** Both the account and the volatility move, so the size that produces the same risk moves with them.

**body:**
  - **Size is an output, not a decision.** Once the risk and the invalidation distance are set, there is only one size that produces the intended exposure.
  - This also makes losses comparable, which matters more than it sounds. If every loss costs roughly the same, then a run of them tells you something about the strategy. If they vary wildly, the record is mostly noise from sizing.
  - It removes a decision from the moment it is hardest to make well. The size is computed rather than chosen, which is exactly what you want when the last three trades have gone against you.

### Slide 6 - compare: Two ways to decide exposure

**sub:** The same trade, approached from opposite ends.

**left:**
  **h:** Size first
  **chip:** Risk drifts
  **items:**
    - Position size chosen by habit or comfort
    - Risk changes with volatility
    - Wide stops cost more than tight ones
    - Losses vary in size for no useful reason
    - Exposure grows exactly when conditions worsen

**right:**
  **h:** Risk first
  **chip:** Risk is held
  **items:**
    - Risk per trade fixed in advance
    - Size derived from the stop distance
    - Every loss costs the same
    - The record measures the strategy rather than the sizing
    - Exposure falls automatically when volatility rises

**body:**
  - **The right column is not more conservative. It is more measurable.**
  - With risk held constant, the variation in your results comes from the strategy. With size held constant, it comes from whatever the market happened to be doing, and you cannot separate one from the other after the fact.
  - That separation is the whole point. You cannot improve a process whose results are dominated by an input you never intended to vary.

### Slide 7 - check: Check yourself

**qs:**
  -
    **q:** Volatility doubles. You keep position size unchanged. What happened to your risk?
    **o:**
      - It stayed the same, since the size did
      - It roughly doubled, because the same size now moves twice as far
      - It fell, because larger moves mean better entries
    **a:** 1
    **why:** Exposure is size multiplied by the distance the market travels. Holding one constant while the other doubles doubles the risk.
  -
    **q:** Two trades, same conviction, one with a stop twice as far away. Same size on both. What is wrong?
    **o:**
      - Nothing, conviction was equal
      - The wider stop risks twice as much for no additional reason
      - The tighter stop is always better
    **a:** 1
    **why:** The cost of being wrong should reflect the risk you chose, not the distance to invalidation. Size should adjust so both trades cost the same.
  -
    **q:** In the correct order, what is position size?
    **o:**
      - The first decision, based on confidence
      - An output, derived from the chosen risk and the distance to invalidation
      - A fixed number set once and left alone
    **a:** 1
    **why:** Once risk per trade and the invalidation distance are known, only one size produces the intended exposure. Size is calculated rather than chosen.

### Slide 8 - takeaways: What to carry forward

**keys:**
  - Choosing a size is choosing a risk, whether or not the choice was deliberate.
  - Fixed size assumes stable volatility, and volatility clusters instead.
  - A wider stop at the same size is simply a larger bet you did not intend to place.
  - Decide the risk, measure the invalidation distance, then let the size follow.
  - Constant risk makes losses comparable, and comparable losses are what let you measure a strategy at all.

**unlocks:**
  - Derive position size from risk and invalidation distance, so it is calculated rather than chosen.
  - Keep your losses comparable, which is what makes your own record measurable at all.
  - Adjust automatically when volatility changes, instead of finding out afterwards.

**bridge:**
  **label:** Next in this series
  **title:** Correlation and the Diversification Illusion
  **text:** Every position sized correctly. So are they still separate positions, or have you been holding one bet in five costumes?

## r4 - Correlation and the Diversification Illusion (7 min)

You hold five strategies. How many bets is that? Almost certainly not five.

### Slide 1 - cover: Correlation and the *Diversification Illusion*

**eyebrow:** Lesson 04

**sub:** You hold five strategies, so you are diversified five ways. Are you? There is a number that answers this exactly, and for most portfolios it is closer to one than to five.

### Slide 2 - demo: What diversification actually buys

**interactive demo:** `correlation`  (caption below)

**sub:** Set how many strategies you hold and how much they move together.

**cap:** Counting positions tells you nothing. Five strategies at a correlation of 0.8 carry almost the same risk as running one of them alone, because they are all expressing the same underlying bet in different clothing. The useful number is not how many you hold. It is how many independent bets you are actually making.

### Slide 3 - concepts: What correlation is doing

**items:**
  -
    **i:** layers
    **t:** Risk does not divide by count
    **d:** Two positions at a correlation of one are a single position at double the size.
  -
    **i:** bars
    **t:** Independent bets are the real unit
    **d:** Ten strategies at 0.9 correlation are close to one bet. Three genuinely independent ones are three.
  -
    **i:** target
    **t:** The benefit fades quickly
    **d:** Most of the gain from diversification arrives in the first few genuinely different exposures.
  -
    **i:** shuffle
    **t:** It is measured, not assumed
    **d:** Correlation is a number you can calculate from your own results, and usually should.

**body:**
  - **The intuition that more positions means less risk is only true when the positions are actually different.**
  - Running the same idea across five instruments is one idea. Running five entry variations of one system is one system. In both cases the risk barely falls while the workload rises.
  - The practical question is simple. If one of these positions is losing, how likely is it that the others are losing at the same time? That is correlation, and you can measure it directly from your own record.

**beat4:** Because counting positions feels like measuring risk, and it takes no work. Correlation has to be calculated from your own results, which almost nobody does, so the intuitive version stands unchallenged. It also sounds responsible, which is why it survives scrutiny it does not deserve.

### Slide 4 - demo: Correlation when it matters

**interactive demo:** `stresscorr`  (caption below)

**sub:** The green line assumes correlation stays put. The red line is what tends to happen.

**cap:** This is the part that turns an inconvenience into a serious problem. Correlations are not constant. In stressed conditions, positions that behaved independently for months start moving together, because everyone is reaching for the same exit at the same time. The diversification was real, right up to the moment it was needed.

### Slide 5 - concepts: Where hidden correlation comes from

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **Correlation as normally calculated measures a linear relationship, and market stress is not linear.** Two strategies can show a low correlation across a full sample and still fail together in the worst week, because the relationship only appears in the tails.
  - That is why the number alone is not enough. Look at what happened in the specific periods that hurt, rather than trusting a single figure computed over everything at once.

**items:**
  -
    **i:** trend
    **t:** The same underlying factor
    **d:** Different instruments often express the same exposure to growth, rates or liquidity.
  -
    **i:** loop
    **t:** The same regime dependence
    **d:** Strategies fitted in the same conditions tend to fail in the same conditions.
  -
    **i:** shuffle
    **t:** The same liquidity
    **d:** In stress, correlation rises across everything because the same participants are unwinding.
  -
    **i:** eye
    **t:** The same author
    **d:** Strategies built by one person share that person assumptions, which is a correlation nobody measures.

**body:**
  - **Most hidden correlation is not subtle once you look for it.** It comes from the positions sharing a driver that was never written down.
  - The regime version is the most common. Several strategies developed over the same few years have all been fitted to the same environment, so they are quietly one bet on that environment continuing.
  - The last item is the one people dismiss. If you built all of them, they inherit your assumptions about how markets work, and those assumptions fail together.

### Slide 6 - compare: Apparent and actual diversification

**sub:** The difference is measurable, and worth measuring.

**left:**
  **h:** Looks diversified
  **chip:** Counted
  **items:**
    - Many positions open
    - Several instruments
    - Different entry rules
    - Built at different times
    - Feels spread out

**right:**
  **h:** Is diversified
  **chip:** Measured
  **items:**
    - Low measured correlation between results
    - Different underlying drivers
    - Survives different regimes
    - Losses do not arrive together
    - Effective bet count close to position count

**body:**
  - **The left column is a description of activity. The right column is a description of risk.**
  - The test is direct. Take the returns of each strategy, calculate how they move together, and count the effective number of independent bets. If that number is close to one, the portfolio is one position however many tickets it holds.
  - And test it in the periods that hurt rather than on the full sample. Average correlation across calm and stressed conditions hides exactly the behaviour you needed to know about.

### Slide 7 - check: Check yourself

**qs:**
  -
    **q:** You hold five strategies with a correlation of 0.8 between them. What is your risk closest to?
    **o:**
      - One fifth of a single strategy
      - Close to running a single strategy on its own
      - Five times a single strategy
    **a:** 1
    **why:** At high correlation the portfolio risk barely falls below that of one strategy. You are holding roughly one independent bet, not five.
  -
    **q:** Why is average correlation misleading?
    **o:**
      - It is difficult to calculate
      - It hides the fact that correlations rise in stressed conditions, which is when it matters
      - It only applies to equities
    **a:** 1
    **why:** The average blends calm periods with stressed ones. Diversification tends to fail precisely in the stressed periods, which the average conceals.
  -
    **q:** What is the most overlooked source of correlation between your own strategies?
    **o:**
      - Trading them at the same time of day
      - That one person built them all, so they share the same assumptions
      - Using the same broker
    **a:** 1
    **why:** Strategies built by the same person inherit the same beliefs about how markets work. When those beliefs fail, they fail together, and no correlation matrix on returns will have warned you.

### Slide 8 - takeaways: What to carry forward

**keys:**
  - Counting positions is not measuring risk. Effective independent bets is the number that matters.
  - At high correlation, extra strategies add work rather than protection.
  - Correlation is not constant. It rises in stress, which is exactly when you relied on it.
  - Most hidden correlation comes from a shared driver nobody wrote down.
  - Measure it on your own results, and measure it in the periods that hurt.

**unlocks:**
  - Measure the effective number of bets you hold, rather than counting positions.
  - Test your own correlations in the periods that hurt, where the average conceals the answer.
  - Add a strategy for the right reason, because it behaves differently, not because it is another strategy.

**bridge:**
  **label:** End of series 02
  **title:** Where this leaves you
  **text:** Four lessons on the same theme. Depth decides what you can recover from, size decides whether you survive to collect the edge, and correlation decides whether your positions are as separate as they look. None of it is about being right more often. So here is the question worth sitting with: what would have to be true about your own numbers for any of this to be safe?
