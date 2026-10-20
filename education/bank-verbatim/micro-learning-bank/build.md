# SERIES 05 - Building One, Start to Finish

A single idea carried the whole way, from one sentence to a model that has been tested honestly, using the techniques a high level analyst would actually use. Every figure is computed live as you read. Nothing is skipped and nothing is flattered.

## q1 - Mean Reversion of Residuals (? min)

Eight correlated instruments. Where is the tradeable part, how do you isolate it, and what is left once you test it honestly?

### Slide 1 - cover: Mean Reversion of *Residuals*

**eyebrow:** Worked example

**sub:** Here is a sentence: instruments that drift away from the group tend to come back. That is an idea, not a model. Over the slides that follow it becomes one, using exposure vectors and principal components, and every number you see is computed by this page as you read it. Work through it at whatever pace the material asks for, and decide now how much of the final result you expect to survive.

### Slide 2 - primer: What does it mean for two things to be *correlated*?

**answer:** Two instruments are correlated when they tend to move at the same time in the same direction. High correlation means that if one rises today, the other very probably rose too.

**analogy:** Think of eight boats moored in the same harbour. When the tide comes in, all eight rise together. Each boat also bobs a little on its own, but the tide is by far the bigger movement, and if you only watched the boats you might not realise most of what you were seeing was the water.

**why:** The next slide shows eight instruments over three years. They look like eight different things. The measurement underneath them says they mostly are not, and everything else in this lesson follows from that.

**terms:**
  -
    **t:** Correlation
    **d:** A number between minus one and one. Near one means they move together. Near zero means no relationship. Near minus one means they move opposite.
  -
    **t:** Pairwise
    **d:** Measured between every possible pair. Eight instruments make twenty eight pairs, and the average across them is one number for the whole group.

### Slide 3 - demo: Eight instruments that are mostly one instrument

**interactive demo:** `sauniverse`  (caption below)

**sub:** Select any single instrument to isolate it.

**cap:** Look at them together and the shape is obvious. They rise and fall in near unison, because most of what moves any one of them is something moving all of them. That shared movement is not an opportunity. It is the thing standing between you and the opportunity, and the first job of this model is to remove it.

**body:**
  - **Every idea starts with a universe, and the first honest question is how independent its members really are.**
  - Eight instruments with an average pairwise correlation above 0.7 are not eight bets. Holding all of them is close to holding one thing eight times, which is the diversification illusion from an earlier lesson seen from the inside.
  - But there is a second reading. If most of the movement is shared, then anything left over after removing it is genuinely specific to that instrument. That leftover is small, it is hidden, and it is where the entire trade lives.

### Slide 4 - prose: The idea, stated properly

**lead:** Every instrument here is doing two things at once. *Only one of them is worth trading.*

**body:**
  - **The first thing is the group.** When the common driver moves, everything moves with it in proportion to how exposed it is. That part is enormous, it swamps everything else, and you have no edge in predicting it.
  - **The second thing is the instrument itself.** Supply, flow, a large holder rebalancing, a piece of news that affects one name and not the others. This part is small and it is buried.
  - PULL:If the two parts can be separated, the second one can be traded without taking a view on the first.
  - That is the whole idea, and it is worth noticing how ordinary it is. There is no secret in it. The difficulty is entirely in the separation, in measuring whether the leftover behaves in a way you can profit from, and in finding out whether anything survives once the process is tested honestly.
  - **The rest of this lesson is that work, in order, with nothing skipped.**

### Slide 5 - primer: What is PCA, what are principal components, and why are they *useful*?

**answer:** PCA is a way of taking many things that move together and finding the few underlying movements that explain most of what they do. Each of those underlying movements is a principal component, and the first one is always the biggest.

**analogy:** Go back to the harbour. If you recorded the height of all eight boats every minute and asked what single thing would best explain all eight records at once, the answer is the tide. That is the first component. Take the tide out of the records and ask again, and the next best explanation might be the wake from a passing ferry that rocks the boats on one side up while the other side goes down. That is the second. What is left after both is each boat bobbing on its own.

**why:** The next slide measures exactly this for the eight instruments: how much of all their movement is explained by the first component, then the second, and so on. The answer is the first real measurement of the lesson, and it is larger than most people expect.

**terms:**
  -
    **t:** Principal component
    **d:** One of the underlying shared movements. The first explains the most, the second the next most, and so on down.
  -
    **t:** Variance explained
    **d:** The share of all the movement that one component accounts for. If the first component explains 76 percent, three quarters of everything you see is one thing.
  -
    **t:** Decomposition
    **d:** The act of splitting each instrument into its share of the components plus whatever is left over.

### Slide 6 - demo: How much of it is one thing

**interactive demo:** `sascree`  (caption below)

**sub:** Change how many common drivers you allow the model to remove.

**cap:** This is the first real measurement of the lesson. One component accounts for nearly three fifths of everything these eight instruments do, and a second adds a substantial amount more, so between them they explain about three quarters of it. Everything beyond those two is small and increasingly unstable. The number you choose here decides what counts as a common driver and what counts as tradeable leftover, and it is the first genuine modelling decision.

**body:**
  - **A principal component is not a thing in the world. It is a direction in the data along which the instruments move together.**
  - The first component is the largest such direction, the second is the largest of what remains after the first is removed, and so on. Nothing about that construction knows what a market is, which is both its strength and its most dangerous property.
  - Keep too few and real common movement leaks into your residual, where you will mistake it for opportunity. Keep too many and you start removing the very thing you wanted to trade.

### Slide 7 - demo: How many components are *real*

**interactive demo:** `sanoisek`  (caption below)

**nosim:** True

**sub:** The scree against what pure noise would have produced.

**cap:** The scree showed one large component and a tail of small ones, and the tail has no elbow. This is the same chart with a band added: the share each component would claim if the eight series were pure noise of the same length. Components above the band carry structure. Components inside it would have appeared anyway.

**body:**
  - **The number of components to keep is the single most consequential setting in this method, and reading it off an elbow is a guess dressed as a measurement.**
  - The honest test is a comparison. Decompose eight series of pure noise, the same length, many times over, and see what share the first, second and third components claim by chance. That is the baseline. Anything the real universe puts above it is structure. Anything inside it is indistinguishable from what noise does.
  - Here two components clear the band and the third does not, which is why the model keeps two. Not because two looked right, but because three would have meant hedging against noise. A hedge, explained properly a few slides from here, is a second position held to cancel a risk in the first, and a hedge against noise removes signal along with it.

### Slide 8 - concepts: What a component is, and what it is not

**items:**
  -
    **i:** bars
    **t:** It is a direction, not a cause
    **d:** It tells you what moves together. It never tells you why, and it cannot.
  -
    **i:** shuffle
    **t:** It is estimated, not given
    **d:** Computed from a finite window, so it carries estimation error that grows as the window shrinks.
  -
    **i:** loop
    **t:** It rotates over time
    **d:** Recompute on a later window and the components shift. Structure is not fixed.
  -
    **i:** target
    **t:** It is unnamed
    **d:** Calling the first one the market is a story you are adding, and the maths does not support it.

**body:**
  - **The most common error with this technique is naming a component and then reasoning about the name.** The mathematics gives you a direction and a set of exposures. Everything else is interpretation you supplied.
  - That matters because the interpretation is where overconfidence enters. A component that looks like a sector this year may be something else next year, and a model that assumed the label will keep trading as though nothing changed.
  - The discipline is to use the components for what they demonstrably are, a way to strip out shared movement, and to avoid building any part of the logic on what you think they represent.

**beat4:** Because principal components are usually taught as dimensionality reduction, where the goal is compression and the labels genuinely do not matter. Carried into markets, that framing quietly encourages you to treat the output as structure rather than as an estimate, and the fact that it produces confident looking numbers from any data at all is exactly what makes it so easy to misuse.

### Slide 9 - primer: What is a *factor*, and what does it mean to have *exposure* to one?

**answer:** A factor is a shared movement that many instruments respond to. Your exposure to it is how strongly a particular instrument responds. A loading is the number that measures that strength.

**analogy:** The tide is a factor. Every boat responds to it, but a boat in shallow water rises the full height of the tide while a boat already resting on the bottom barely moves. The first has high exposure to the tide, the second has low exposure. The loading is simply the number: this boat rises 1.2 metres for every metre of tide, that one rises 0.8.

**why:** The next slide draws every instrument as a set of loadings, one per component. That set is its exposure vector, and it is the thing that later decides how much of each instrument has to be sold to cancel a factor out.

**terms:**
  -
    **t:** Factor
    **d:** A shared driver. In this lesson the factors are the components found by PCA, though in other models they can be chosen by hand, such as the market or a sector.
  -
    **t:** Loading
    **d:** How much an instrument moves per unit of a factor. Positive means it moves with the factor, negative means against it.
  -
    **t:** Exposure vector
    **d:** All of one instrument's loadings written as a list, one number per factor.

### Slide 10 - prose: The exposure vector, *in full*

**lead:** Almost everything a serious analyst does with risk is done to this list of numbers, not to the price.

**body:**
  - Every instrument carries a short list of numbers saying how it responds to each shared driver. That list is its exposure vector, and it is the object the rest of this lesson operates on.
  - Start with one number. An instrument has a loading on the first component: how far it moves when that component moves. On its own that number is useful and incomplete, because there is more than one shared driver. There is a second component, and a third, and the instrument responds to each of them by a different amount.
  - Collect those responses into a list, in a fixed order, one entry per component, and you have the exposure vector. For the eight instruments in this lesson it is two numbers long, because two components cleared the noise band. In a real equity model it might be ten or twenty, one for the market, one for size, one for value, one for each sector that matters. The length is a modelling choice. The idea does not change.
  - **The vector is an address.** Think of the components as directions and the vector as a set of coordinates along them. Every instrument sits somewhere in that space, and where it sits says more about how it will behave than its name, its sector or its price history does. Two instruments with nearly the same vector will move nearly together no matter how different they look, because they are responding to the same things by the same amounts.
  - Back in the harbour, every boat has a profile: it rises this much with the tide, it rocks this much with the ferry wake. Write those two numbers down and you have described the boat in the only terms the water cares about. Two boats with the same profile are, for any question about the water, the same boat. It does not matter that one is a yacht and the other a trawler.
  - **Three things follow, and each one is used later in this lesson.**
  - The first is that the vector is what you hedge against. Cancelling a factor is not a matter of shorting the market and hoping. It requires knowing how much of each instrument to sell, and the only way to know that is to read it off the vectors. The projection that removes factor exposure, which appears a few slides from here, is arithmetic performed directly on these lists.
  - The second is that the vector is what makes instruments comparable. Prices are not comparable across instruments, and neither are returns in any useful sense. Exposure vectors are, because they are measured in the same units against the same components. That comparability is what lets a book, meaning all the positions held at once, be assessed as one object rather than as a pile of unrelated bets.
  - The third is the one people miss. **If several positions have similar vectors, a book that looks diversified is not.** Eight positions with eight nearly identical exposure vectors is one position held eight times, and it will lose eight times at once on the day that component turns. Counting positions tells you nothing. Looking at how spread out their vectors are tells you everything.
  - One caution before the measurement. The vector is estimated, not given. It comes from a finite window, so it carries error, and it moves as the market changes, which is why a later slide watches it drift and why the model re-estimates rather than fitting once. A vector is the best current description of an instrument, not a fact about it.

### Slide 11 - demo: The exposure vector

**interactive demo:** `saload`  (caption below)

**sub:** Look at each component in turn.

**cap:** These bars are the exposure vector. Each instrument has a loading on each component, and that loading says how strongly it responds when that component moves. On the first component every loading has the same sign, which is what a broad driver looks like. On the second the signs split, dividing the universe into two groups that move against each other. That split is a spread, and a spread is something you can trade.

**body:**
  - **An exposure vector is the bridge between a statistical direction and a position you can actually hold.** It tells you, for each instrument, how much of the common movement to expect and therefore how much to remove.
  - It is also what makes hedging possible. If you know an instrument has a loading of 0.35 on a driver, you know how much of a position in that driver to hold against it in order to be left with the part you care about.
  - By the third component the loadings are small and the pattern is hard to read. That is the boundary between structure and noise, and it is the reason the earlier decision about how many components to keep is not cosmetic.

### Slide 12 - demo: What the components *actually are*

**interactive demo:** `saloadings`  (caption below)

**sub:** Instrument by instrument, component by component.

**cap:** The previous slide warned against naming a component, and the warning stands. What the loadings give you is a shape: one row pointing the same way across all eight, one row split into two camps, one row with no shape at all. A shape is not a name. It is enough to form a hypothesis, and the reason to form one is practical: a hedge against something you cannot describe is a hedge you cannot check.

**body:**
  - **The name is a hypothesis, not a finding, and it is held for one reason: so that the hedge built against it can be tested.**
  - If the first component is behaving as the market, then a position neutral to it should show a market beta near zero, meaning it barely moves when the market does, measured against a market proxy. If the second is behaving as a sector, the hedge against it should look like a sector spread. Those are checks, and a component with no working name cannot be checked, only trusted.
  - When a check fails, the name was wrong, and the decomposition is telling you something about the data rather than the model. That is the discipline the previous slide asked for, and this slide is how it is practised rather than abandoned.

### Slide 13 - primer: What is a *residual*?

**answer:** A residual is what is left of an instrument's movement after the shared factors have been taken out. It is the part that belongs to that instrument alone.

**analogy:** Subtract the tide from a boat's recorded height, then subtract the ferry wake, and what remains is the boat's own bobbing: someone stepping aboard, a gust catching its hull, a line going taut. That is its residual. It is smaller than the tide, and it is the only part of the record that is specifically about that boat.

**why:** The next slide splits one instrument in two on screen: the part explained by the factors, and the residual. The entire trade in this lesson is a bet on the residual, and it cannot be seen until the factors are removed.

**terms:**
  -
    **t:** Fitted part
    **d:** The portion of the movement the factors account for. Sometimes called the systematic part.
  -
    **t:** Residual
    **d:** The remainder. Sometimes called the idiosyncratic part, which just means specific to this one instrument.
  -
    **t:** Cumulative residual
    **d:** The residuals added up over time, so you can see whether they drift away from zero and come back.

### Slide 14 - demo: Splitting one instrument in two

**interactive demo:** `sadecomp`  (caption below)

**sub:** Select any instrument to see it decomposed.

**cap:** The grey line is what the instrument did. The blue line is what it would have done if it were nothing but its exposure to the common drivers, reconstructed from its exposure vector. The amber line is the difference, and it is the only part of this instrument that is genuinely about this instrument. Notice what the amber line does. It wanders away from zero and it comes back.

**body:**
  - **This is the moment the idea becomes measurable.** Before this slide, the tradeable part was a hypothesis. Here it is a series you can look at, count and test.
  - Every instrument in this universe produces a residual line like this one, and they do not all behave the same way. Some return to zero quickly, some slowly, and some wander off without much tendency to come back at all.
  - That variation is the first thing worth measuring, because a residual that does not revert is not a trade regardless of how far it has strayed.

### Slide 15 - primer: What does it mean to *hedge*?

**answer:** To hedge is to hold a second position whose purpose is to cancel a risk in the first. You keep the part of the first position you actually want and use the second to remove the part you do not.

**analogy:** You want to bet that one boat is sitting unusually low in the water and will float back up. But if the tide goes out while you wait, every boat drops, including yours, and you lose for a reason that has nothing to do with your idea. So alongside your bet you make a second one that pays off if the tide falls. Now the tide cancels out, and what remains is purely whether your boat rises relative to the others.

**why:** The next few slides build that second position precisely, from the loadings. It turns out not to be a simple bet against the tide. It is a specific basket of the other instruments, weighted so that every factor cancels.

**terms:**
  -
    **t:** Hedge
    **d:** The offsetting position.
  -
    **t:** Neutral
    **d:** Having no net exposure to something. Market neutral means the market can rise or fall and your position is unaffected by that alone.
  -
    **t:** Basket
    **d:** A set of positions in several instruments held together as one unit.

### Slide 16 - demo: What an exposure *actually is*

**interactive demo:** `saexposure`  (caption below)

**nosim:** True

**sub:** Three separate things that get called the same word, and the one that costs you money.

**cap:** Four rows. The loading is a property of the instrument and never changes. The position is the only row you choose. The exposure is those two multiplied, one number per instrument, and their sum is your exposure to the factor. The last row is what the factor did to your account today. Move the factor and only the last row changes, because the first three were already fixed before the day began.

**body:**
  - **A loading is not an exposure, and the difference is the whole of risk management.** A loading says how far an instrument moves when a factor moves. An exposure says how much money you make when it does. One belongs to the market and the other belongs to you.
  - The arithmetic is three lines and it is worth stating plainly. The factor moves by some amount. Each instrument moves by its loading times that amount. You hold a position in each, so you earn your position times its loading times the move. Add that up across everything you hold and the total is your exposure, expressed as money per unit of factor.
  - Two things follow immediately. Exposure adds up, so a book of eight positions has one exposure number per factor rather than eight, and positions can cancel each other before you hedge anything. And exposure is the only part of the chain you control, because you cannot change an instrument's loading, only how much of it you hold.
  - Try the presets. Equal weight long carries the full factor. Concentrating in one instrument carries slightly more or less depending on its loading. Long the high loadings and short the low ones carries very little, which is beta neutrality arrived at by hand. Factor neutral carries essentially zero, and it is the only one that gets there deliberately rather than by luck.

### Slide 17 - prose: Factors are exposures you hold *whether or not you chose them*

**body:**
  - **Every position is a bundle. The part you meant to buy is inside it, and so is everything that moves with it.**
  - Buy one instrument because its residual is stretched and you have also bought its loading on the market, its loading on the sector, and its loading on whatever the third component turns out to be. None of those were the idea. All of them will decide the result on most days, because the shared movement is larger than the specific movement, which is what the scree plot already showed.
  - The retail version of this technique buys the stretched instrument and waits. The professional version buys the stretched instrument and simultaneously sells a basket that cancels each unwanted loading, so that what remains is a position in the residual and nothing else. The next four slides build that basket, show what it is not, watch it drift, and then apply it to a whole book rather than one position.
  - Nothing in this act is specific to mean reversion. It is how any position in a correlated universe is turned into a position in one thing.

### Slide 18 - demo: The factor neutral *position*

**interactive demo:** `saneutral`  (caption below)

**sub:** One instrument held, the basket that neutralises it, and how many components to remove.

**cap:** A unit position in one instrument carries a loading on every component. Neutralising the first two removes those exactly and leaves the rest. The hedge that does it is a specific basket across the other instruments, computed from the loadings rather than guessed, and it is not a short of the market. Realised volatility falls by most of its value, because most of the volatility was never the residual.

**body:**
  - **The hedge is a projection. The position is a vector, each component is a direction, and the hedged position is what is left after removing its shadow along each unwanted direction.**
  - That is why the basket has the shape it has. Each instrument's weight in the hedge is set by how much it loads on the components being removed, so instruments that load heavily on the market end up heavily shorted and instruments that barely load are barely touched.
  - Slide the number of components. Removing one cancels the market and leaves the sector bet in. Removing two cancels both. Removing three starts to eat into the residual itself, because the third component is mostly noise and neutralising noise means neutralising some of your signal. The choice of how many is a modelling decision, and the scree plot earlier is its justification.

### Slide 19 - primer: What is *beta*, and what do dollar neutral and beta neutral mean?

**answer:** Beta is how much an instrument moves for every unit the market moves. A beta of 1.2 means it typically moves 20 percent more than the market. Dollar neutral means you have sold as much money as you have bought. Beta neutral means the betas cancel, so the market itself cannot move your position.

**analogy:** Two boats: one rises 1.2 metres per metre of tide, the other 0.8. If you go long one and short the other in equal money, you are dollar neutral, but the tide still moves you, because 1.2 minus 0.8 is not zero. To be beta neutral you would short 1.5 of the second boat for every 1 of the first, so the tide effect is 1.2 against 1.2 and cancels.

**why:** The next slide hedges the same position three different ways. All three are commonly called hedged, and they leave very different risks behind. The names matter because they hide which risks are still in the position.

**terms:**
  -
    **t:** Beta
    **d:** Sensitivity to the market, or to any single named factor.
  -
    **t:** Dollar neutral
    **d:** Equal money long and short. Says nothing about risk.
  -
    **t:** Beta neutral
    **d:** Market sensitivity cancels. Says nothing about any second factor.
  -
    **t:** Factor neutral
    **d:** Every measured factor cancels. What remains is residual.

### Slide 20 - demo: Three hedges, three *different bets*

**interactive demo:** `saschemes`  (caption below)

**sub:** Dollar neutral, beta neutral, factor neutral, on the same long position.

**cap:** Dollar neutral shorts equal value of the other instruments. Beta neutral shorts the market in proportion to the position's beta. Factor neutral removes each estimated component. All three are described as hedged, and they leave different things behind. Only one of them is a bet on the residual.

**body:**
  - **Equal value is not equal exposure.** A high beta instrument hedged with equal value of low beta instruments is still long the market, and the reverse is still short it. Dollar neutrality is a statement about capital, not about risk.
  - Beta neutrality fixes the first factor and stops there. Whatever the second component is, it is untouched, and in a universe where the second component is a sector or a rate the beta neutral position is a sector bet in a market neutral costume.
  - Factor neutral is the only one of the three whose remaining variance is residual. It is also the only one whose construction depends on the decomposition being right, which is why the earlier slides on the scree and the loadings are not preamble. They are what this hedge is built from.

### Slide 21 - demo: A hedge goes wrong *on its own*

**interactive demo:** `sadrift`  (caption below)

**sub:** Pick how often it is re-sized, and watch what the book carries in between.

**cap:** The top strip is the cause: this instrument's exposure to the market genuinely shifts, settling, moving through a change, and settling again. The lower panel is the consequence. A hedge is sized from a measurement taken on one day, and every day after that the measurement is a little more out of date. The gap between the two is a market bet nobody placed. Re-sizing closes it and then it opens again, which is why the shape is a sawtooth rather than a line.

**body:**
  - **A hedge is not a thing you own. It is a measurement, and measurements go stale.** The number that said sell this much was true on the day it was taken. Business mix changes, index membership changes, a rate regime turns, and quietly it stops being true.
  - **The danger is that nothing tells you.** The book still reports itself as factor neutral, because the report is computed from the same stale number. There is no alert, no error and no bad fill. There is only a bet growing in the background, and the first time anyone finds out is the day the market moves a long way and a supposedly neutral book loses money.
  - That is the whole argument for re-estimating on a rolling basis. Not elegance, and not because the mathematics demands it. Because **the hedge is only as current as its last measurement**, and the cost of an old one is invisible until it is expensive.
  - How often is a real decision with a real answer. Run through the five policies above. Going from never to yearly helps enormously. Yearly to quarterly helps a lot. Monthly to daily barely helps at all, because by then what is left is not staleness but the error in the measurement itself, and measuring more often does not make a noisy measurement quieter. **Re-estimate often enough to track the change, and no more often than that.**
  - This is why the model in this lesson re-estimates its decomposition at every step. The instruments here are small and the computation is cheap, so the most frequent policy costs nothing. On a large book it would be a genuine trade, and the sawtooth above is how you would decide it.

### Slide 22 - primer: What is a *book*?

**answer:** A book is all the positions you hold at once, treated as a single thing. Its risk is not the sum of each position's risk, because positions can offset each other.

**analogy:** If you are long one boat that rises with the tide and short another that also rises with the tide, you are already partly hedged against the tide without having done anything, because when it comes in your long gains and your short loses. Look at the two together and the tide barely matters. Look at either alone and it is the biggest risk you hold.

**why:** The next slide holds four positions at once and shows the book's net exposure against what you would get by adding up each position on its own. The difference is exposure you never have to hedge, because the positions hedge each other.

**terms:**
  -
    **t:** Book
    **d:** The whole portfolio, considered together.
  -
    **t:** Net exposure
    **d:** The book's total sensitivity to a factor after longs and shorts have offset.
  -
    **t:** Gross
    **d:** The total size of all positions ignoring sign. What you pay costs on.

### Slide 23 - demo: Hedging the book, *not the position*

**interactive demo:** `sabook`  (caption below)

**sub:** Several positions at once, their net exposure, and one basket for all of them.

**cap:** Four positions held together. Add up each leg's exposure as if it stood alone and the total is large. Net them and it is about half, because a long and a short in instruments that load the same way cancel each other before any hedge is bought. The basket on the right neutralises what remains. Toggle positions in and out and watch some of them raise the book's exposure while others lower it.

**body:**
  - **The hedge is a property of the book, not of each position in it.** Two residual bets that happen to load the same way on the market are, together, a market bet, and two that load opposite ways are, together, a smaller one than either alone.
  - This is the part that separates a portfolio from a collection of trades. A collection hedges each trade. A portfolio nets first and hedges the remainder, and the difference is both cheaper and more accurate, because every unit of hedge is a unit of cost and a unit of estimation error.
  - It also changes how you read a new position. Before asking whether a candidate residual is attractive, ask what it does to the book's net exposure. Sometimes a mediocre residual is worth holding because it hedges the rest for free, and sometimes an excellent one is not, because it doubles an exposure the book already carries.

### Slide 24 - primer: What is *mean reversion*, and what is a *half life*?

**answer:** Something mean reverts if, when it strays from its usual level, it tends to come back. The half life is how long it takes to come halfway back. A short half life means it snaps back quickly; a very long one means it barely reverts at all.

**analogy:** Push a boat away from its mooring and let go. The line pulls it back, fast at first and then slower as it nears home. If it covers half the distance in ten seconds, its half life is ten seconds. A boat with no line at all does not come back, and its half life is effectively infinite.

**why:** The next slides estimate the half life of each residual. But there is a trap, and it is the most important one in the lesson: the way residuals are constructed makes them look as if they revert even when they do not, and the trap has to be understood before the number can be trusted.

**terms:**
  -
    **t:** Mean reversion
    **d:** The tendency to return toward an average after moving away from it.
  -
    **t:** Half life
    **d:** The time for a displacement to decay by half. Estimated from the data, not assumed.
  -
    **t:** Random walk
    **d:** A series with no tendency to return anywhere. Each step is as likely up as down, and it has no home.

### Slide 25 - concepts: Half life, and the trap underneath it

**items:**
  -
    **i:** loop
    **t:** Half life
    **d:** How long a displacement takes to decay by half. Short means it reverts quickly, long means it barely reverts at all.
  -
    **i:** trend
    **t:** Measured, not assumed
    **d:** Estimated from the residual itself, by regressing each change on the level that preceded it.
  -
    **i:** eye
    **t:** It sets the holding period
    **d:** A half life of fifteen days implies a trade measured in weeks, not minutes, and costs follow from that.
  -
    **i:** shuffle
    **t:** It can be manufactured
    **d:** A residual is orthogonal to the factors by construction, which makes it look more mean reverting than it is.

**body:**
  - **The fourth item is the one that catches people, and it caught the first version of this model.**
  - When you remove factor exposure using components estimated from the same window, the leftover is forced to be uncorrelated with those factors over that window. That constraint alone pushes the residual back toward zero, whether or not anything real is happening.
  - So a short half life is not by itself evidence. It is evidence only when the residual keeps reverting on data that was not used to estimate the factors, which is precisely what the validation later in this lesson is testing.

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **Half life assumes the residual behaves like a simple decaying process, and real residuals often do not.** Reversion speed changes with volatility and with market conditions, so a single number is an average across states rather than a constant.
  - It remains useful because it sets an order of magnitude for the holding period and therefore for the cost budget. Treat it as a rough scale rather than a parameter to optimise.

### Slide 26 - demo: Reversion that was *manufactured*

**interactive demo:** `saspurious`  (caption below)

**nosim:** True

**sub:** Every residual reverts in the window it was fitted on. Only some revert after it.

**cap:** In the fitting window all eight residuals report a finite half life, because each was made orthogonal to the factors on that exact window, and that constraint alone pulls it back toward zero. Hold the loadings fixed and step forward, and the picture changes. The band is what a pure random walk reports on a window this long, and a random walk always reports something. Only residuals that beat the band are evidence.

**body:**
  - **A random walk, de-meaned over a finite window, will always look as if it mean reverts. It is the most reliable false positive in the whole discipline.**
  - That is why the half life alone is never the test. The test is the half life against what noise would report under the identical procedure on the identical window length, which is the same comparison used to choose the number of components. One principle, applied twice.
  - The reveal button shows which residuals were built to revert and which were built as random walks. The band separates them without being told, and it is the only thing on this page that does.

### Slide 27 - primer: What is a *z-score*, and why standardise?

**answer:** A z-score says how far something is from its usual level, measured in units of how much it normally varies. A z of 2 means two typical swings above average; minus 1.5 means one and a half typical swings below. It lets you compare things that live on completely different scales.

**analogy:** One boat normally bobs ten centimetres, another normally bobs a metre. Both are currently thirty centimetres above their usual line. For the first boat that is a lot, three times its normal swing. For the second it is nothing. Standardising turns both into the same question: how unusual is this, for this boat?

**why:** The next slide groups every day by how far each residual had strayed, in z-score units, and asks what happened next. That grouping only works because every residual has been put on the same scale.

**terms:**
  -
    **t:** Standardise
    **d:** Subtract the average and divide by the typical swing, so every series is centred on zero and measured in the same unit.
  -
    **t:** Displacement
    **d:** How far from the average, in those units. The lesson uses it and z-score to mean the same thing.
  -
    **t:** Threshold
    **d:** A z-score level at which the model acts. Entry at 1.5 means the trade opens when the residual is one and a half swings from home.

### Slide 28 - demo: Does the displacement predict anything

**interactive demo:** `sapredict`  (caption below)

**nosim:** True

**sub:** Every instrument, every day, grouped by how far the residual had strayed.

**cap:** This is the test that decides whether there is a trade here at all, and it is the one most people skip. Group every observation by how far the residual had already drifted, then measure what happened the following day. Residuals that were well below their own average moved up next. Those above moved down. The relationship is measured rather than assumed, and it is the only reason to continue.

**body:**
  - **Notice the shape rather than the size.** The bars step downward from left to right, which is what a reversion relationship looks like when it is real.
  - Now notice that it does not fade at the edges. The outermost groups pull hardest of all, which is what you would hope to see and is not always what you find. In many signals the relationship weakens or reverses out there, and when it does this measurement shows it before a single position has been taken.
  - This one measurement decides whether the rule that follows is worth writing, and it also prices one of its choices. The rule caps how far it will lean. Since the pull is strongest at the extremes, that cap gives up edge, and it is bought on purpose: a rule without one takes its largest position in the most extreme situation it has ever seen, which is exactly where a model is most likely to be wrong about its own assumptions.

### Slide 29 - prose: From a relationship to a position

**lead:** A relationship in the data is not a rule. *A rule has to say what you hold, and how much.*

**body:**
  - **The measurement gave a shape.** The further the residual has strayed, the more it tends to come back, and on this universe the pull is strongest at the extremes rather than weakest.
  - A threshold rule would throw most of that away. It would ignore everything inside the threshold and take a full position outside it, which treats a residual at 1.6 identically to one at 4.0 while treating 1.4 as nothing at all.
  - PULL:So the position is proportional to the displacement, and capped for risk rather than because the relationship stops.
  - Then two more decisions, both of which follow from earlier slides rather than from preference. Positions are sized by inverse volatility, so a quiet instrument and a violent one contribute comparable risk. And the whole book is neutralised against the components, so that what remains is a bet on residuals rather than a bet on the universe.
  - **That last decision is not a refinement. The next slide shows what happens without it.**

### Slide 30 - demo: Why the position has to be hedged

**interactive demo:** `sahedge`  (caption below)

**nosim:** True

**sub:** The same signal, run twice. One version carries a bet nobody placed.

**cap:** The identical signal, run twice on the same days. Green is the version neutralised against the common drivers, and its exposure to the first component is zero on every single day, because the projection removes it rather than shrinking it. Red is the same signal with that step skipped. Its exposure is whatever the day's stretched residuals happen to add up to, which is nobody's decision.

**body:**
  - **This is the most commonly skipped step in retail attempts at this technique, and it is the one that makes the results meaningless.**
  - An unhedged residual trade is a directional position wearing a statistical costume. When it works you will attribute the profit to your signal. When it fails you will attribute the loss to bad luck. Neither attribution is correct, and you will learn nothing either way.
  - **Be careful about what this figure does and does not claim.** It does not say the unhedged version performs worse. Over a run of universes the two often finish in much the same place, because an accidental bet is as likely to help as to hurt. What it says is that the unhedged version is carrying a risk that was never chosen, never sized and never reported, and a risk like that is not a problem until the day it is a very large one.
  - The hedge is what makes the result interpretable. It is the difference between testing your idea and testing the market.

### Slide 31 - concepts: The model, stated in full

**items:**
  -
    **i:** book
    **t:** Estimate
    **d:** On a rolling window, standardise returns and take the leading components as the common drivers.
  -
    **i:** bars
    **t:** Isolate
    **d:** Remove each instrument's factor exposure to leave the residual, then measure its displacement from its own average.
  -
    **i:** target
    **t:** Position
    **d:** Lean against the displacement in proportion to it, capped for risk rather than because the pull fades, sized by inverse volatility.
  -
    **i:** check
    **t:** Neutralise
    **d:** Remove the book's remaining exposure to the components so the position is a bet on residuals alone.

**body:**
  - **Four steps, each traceable to a measurement made earlier in this lesson rather than to a preference.** That traceability is what separates a model from a set of settings.
  - It is also what makes the model criticisable, which is the point. Anyone can ask why two components and not three, and the honest answer is a chart, not an opinion.
  - Everything up to here is construction. Nothing so far tells you whether it works, and construction is the part most people mistake for the finished job.

### Slide 32 - code: The loop, *as it runs*

**sub:** Every line here is executed by this page. This is the model, not a description of it.

**label:** ONE PASS PER DAY, FROM THE FIRST DAY THE WINDOW IS FULL

**code:**
  -
    **t:** for each day t, once 120 days of history exist:
    **k:** key
  -
    **t:** window   = returns of all 8 instruments over the last 120 days
    **k:** step
  -
    **t:** V, R     = decompose(window, K=2)
    **k:** step
    **c:** components and residuals, estimated fresh
  -
    **t:** for each instrument i:
    **k:** step
  -
    **t:** c      = cumulative sum of R[i]
    **c:** the residual path
  -
    **t:** z[i]   = (last(c) - mean(c)) / sd(c)
    **c:** how far it has strayed, standardised
  -
    **t:** target = -z[i]
    **c:** lean against the displacement
  -
    **t:** if |z| < 0.2: target = 0
    **k:** dim
    **c:** dead band, no trade near home
  -
    **t:** if |z| > 1.5: target = +/- 1.5
    **k:** dim
    **c:** cap, bought for risk not because the pull fades
  -
    **t:** w[i]   = target / sd(instrument i)
    **c:** size by inverse volatility
  -
    **t:** for each component k in 1..K:
    **k:** step
  -
    **t:** w      = w - V[k] * (V[k] . w)
    **c:** project out the factor exposure
  -
    **t:** w        = w / sum(|w|)
    **k:** step
    **c:** gross weight of exactly one
  -
    **t:** turnover = sum(|w - w_yesterday|)
    **k:** step
  -
    **t:** pnl      = (w . returns[t+1]) - turnover * cost
    **k:** step
    **c:** what happened next, minus what it cost
  -
    **t:** equity   = equity * (1 + pnl)
    **k:** step

**body:**
  - **Sixteen lines, and everything the previous thirty slides established is in them.** The decomposition is line three. The residual is line five. The displacement is line six. The lean, the dead band and the cap are lines seven to nine. Sizing is line ten. The hedge is lines eleven and twelve. Costs are line fifteen.
  - Nothing is hidden and nothing is left to a framework. If a reader disagrees with a choice, the line it lives on is right there, and the next three slides show what each line does on a real day.
  - This is what an executable system looks like at its smallest: a loop with every decision visible. Production adds data plumbing, monitoring and a manifest around it, which is the subject of a later slide. It does not add a different loop.

### Slide 33 - demo: One day, *step by step*

**interactive demo:** `saday`  (caption below)

**nosim:** True

**sub:** Pick any day and watch the loop run on it, one row per line.

**cap:** Six rows, one per stage of the loop. The displacement, the leaned target with its dead band and cap, the sizing, the neutralisation, the final weights, and what those weights earned the next day. The eight bars on the last row add to the day's return. Scrub across the sample and the mechanics never change; only the numbers do.

**body:**
  - **This is where a rule becomes a position, and a position becomes a number in the account.** Most people have never seen the middle of that chain, because the tools they use hide it, and a hidden chain is one you cannot audit.
  - Two things to watch as you scrub. The exposure to the components is large on row three and exactly zero on row four, every day, which is the hedge doing its job. And the sign of a bar on the last row is not the sign of the position above it; a long position earns a loss when the instrument falls, and that is where the day's return actually comes from.
  - The dead band and the cap are visible as grey and gold on the top row. Grey residuals are near home and carry no position. Gold ones are beyond the cap, where the lean stops increasing by choice rather than because the pull has faded.

### Slide 34 - prose: Why any of this *matters*

**lead:** Everything so far has been machinery. This is what the machinery is for.

**body:**
  - A market return has two parts. There is the part everything shares, which is the market going up or down, and there is the part specific to one instrument. The first part is large, it is free, and you do not need a model to own it. The second part is small, it is hidden underneath the first, and it is the only part that can be turned into a return that does not depend on the market cooperating.
  - **Everything in this lesson has been in service of getting at that second part.** The decomposition finds what is shared. The residual is what is left. The exposure vector says how much of the shared part each instrument carries, and the hedge cancels it. What survives is a position whose profit or loss has almost nothing to do with whether the market rose.
  - That is worth building for one reason above all others: **it is a different source of return from the one everybody already owns.** A person holding an index is exposed to one thing. If it falls, everything they hold falls with it. A position in a residual can make money on a day the index falls by four percent, not because it is clever about direction, but because direction was removed from it before the position was taken.
  - The next few slides show the machinery turning into an account. One day becomes a set of weights, the weights meet the following day, and the result compounds. What you should watch for is not the size of the number. It is that the line is built from a rule you have already read in full, applied the same way every day, with nothing chosen after the fact.
  - **How this becomes a system rather than an example.** The loop is the same whatever the signal is. Replace the residual displacement with a carry measure, a flow imbalance or a positioning extreme, and the decomposition, the hedge, the sizing and the accounting are all unchanged. That is what makes the architecture worth learning once: the expensive part is the plumbing and the discipline, and those are reusable. The idea on top of them is the cheap part, and it will be replaced many times.
  - Anyone running this properly holds several such ideas at once, each hedged against the same factors, each contributing a small uncorrelated stream. None of them is impressive alone. The reason to do it this way is that a handful of small uncorrelated returns combine into something steadier than any one of them, and steadiness is what lets a position be held at size.
  - One honest note before the curve. **This universe is generated, and it was built with a real effect inside it.** That is deliberate: a teaching example in which nothing works teaches only that nothing works. The mechanics, the arithmetic and the failures shown later are exactly what they would be on real data. The size of the result is not, and no real market hands you four instruments with reliable reversion and tells you which they are.

### Slide 35 - demo: How the curve is *built*

**interactive demo:** `sacurve`  (caption below)

**nosim:** True

**sub:** The same daily returns, compounded, played out from the first day.

**cap:** Watch it build. Each step multiplies equity by one plus that day's net return, which is the last row of the previous slide summed and charged for costs. When it finishes, the line it earned before costs fades in behind, and the distance between the two is what turnover took.

**body:**
  - **An equity curve is not a picture of a strategy. It is the running product of a few hundred small numbers, and every one of them came from the loop.**
  - The distance between the two lines is the cost of turnover, meaning how much of the book is bought and sold each day. The money paid out only ever accumulates, because every rebalance pays and nothing ever refunds, though the visible gap between two compounding curves can narrow when equity falls. On a model that trades this often with edges this small, that gap is the difference between a result and no result, which the later slide on costs makes precise.
  - Watch where it goes sideways or falls. A drawdown is not a loss; it is a period of being below the best you have done, and its depth and length are what decide whether a real person keeps running the system. The deepest one here is reported when the line finishes. A model that works on average but spends a year underwater is a model nobody will still be running when it recovers.
  - **One note on units, because mixing them is how numbers mislead.** Every percentage on this slide and the next is **cumulative over the window**, not annual. The window is 379 steps, which at one step per trading day is about a year and a half, so a cumulative figure of roughly twenty six percent is nearer sixteen percent a year. Every Sharpe ratio in this lesson, a measure of return divided by how bumpy that return was, explained in full two slides from here, is the opposite convention: it is **annualised**, scaled by the square root of two hundred and fifty two. Both are standard, they are not comparable to each other, and a result that does not say which it is using should not be trusted.

### Slide 36 - demo: Where the P&L *came from*

**interactive demo:** `saattr`  (caption below)

**nosim:** True

**sub:** The curve, decomposed by instrument and by whether the residual genuinely reverts.

**cap:** The book traded all eight instruments with the same rule. Four of them were built to revert and four were built as random walks, and the model was never told which. Split the cumulative return by that fact and the answer is stark: the genuine reverters carried the result, and the random walks earned what trading noise with a reversion rule always earns, which is nothing minus costs.

**body:**
  - **Attribution is the question of where the money came from, and it is the first thing to ask of any curve that looks good.**
  - Here the answer is clean because the universe was built with the answer inside it. In a real market nobody hands you the list of which residuals revert, which is exactly why the earlier slide compared every half life to what noise would produce. That comparison is the closest a practitioner gets to this split.
  - It also says something about the four random walks: they were not neutral. They cost money, through turnover on positions that had no reason to exist. A system that could exclude them would have kept the whole of the reverters' contribution, and the noise band is how it would try.

### Slide 37 - flow: The system, *as it would run*

**sub:** The loop is the centre. Production is everything around it.

**steps:**
  -
    **t:** Data
    **d:** Exchange reported returns, cleaned, sessions aligned, rolls handled, stored immutably with a hash. The loop reads from here and never from a live feed directly.
  -
    **t:** Window
    **d:** The trailing 120 days, assembled from the store at each step. The window length is a parameter, fixed in advance, and recorded.
  -
    **t:** Estimate
    **d:** PCA on the window. Two components kept, because two beat the noise band. The loadings are re-estimated every step, which is what keeps the hedge current.
  -
    **t:** Signal
    **d:** Residuals, their cumulative paths, and each one's standardised displacement. The dead band and cap are applied here.
  -
    **t:** Construct
    **d:** Inverse volatility sizing, then the projection that removes factor exposure, then normalisation to unit gross. The output is a weight vector.
  -
    **t:** Rebalance
    **d:** The difference between today's weights and yesterday's is the turnover. It is what gets executed, and what gets charged.
  -
    **t:** Account
    **d:** Realised return, cost, net, equity, drawdown, and the day's attribution by instrument. Written to a log that is never edited.
  -
    **t:** Monitor
    **d:** Live against backtest inside a tolerance band, factor structure against its history, and the retirement conditions declared before the first trade.

**body:**
  - **Eight stages, and the loop from four slides ago is stages three to seven.** The two stages before it are where the case study wing spends most of its time, because they are where most real failures begin. The stage after it is what separates a system that is running from one that is merely still switched on.
  - Every stage has an input, an output and a parameter, and every parameter is written down before the first run. That record is the manifest, and it is what makes a result from six months ago reproducible and a live divergence diagnosable.
  - Nothing here is specific to residual mean reversion. Replace the estimate and signal stages and the same architecture runs a trend system, a carry system or a spread. The architecture is the reusable part; the loop is the part that changes.

### Slide 38 - primer: What is a *Sharpe ratio*, and what do in sample and out of sample mean?

**answer:** The Sharpe ratio is return divided by the bumpiness of that return. A high Sharpe means steady gains; a low one means the gains were there but the ride was rough, or the gains were mostly luck. In sample is the data you used to build the model. Out of sample is data the model never saw.

**analogy:** Two routes across the harbour take the same time on average. One is smooth. The other arrives on time by lurching between very fast and nearly stopped. Same average speed, very different Sharpe. And a route you planned by studying last week's currents will look excellent on last week's currents. The only test is whether it works on next week's.

**why:** The next slide reports the model's Sharpe on the data it was built on, then on data it never saw, then after paying costs, across twelve separate universes. The gap between the first number and the last is the honest size of the edge.

**terms:**
  -
    **t:** Sharpe ratio
    **d:** Average return divided by the standard deviation of return. Above one is usually considered good after costs; above two is rare and deserves suspicion.
  -
    **t:** In sample
    **d:** The fitting data. Results here are always flattering, because the model was chosen to fit them.
  -
    **t:** Out of sample
    **d:** Unseen data. The only place a result can count as evidence.

### Slide 39 - demo: What the number becomes

**interactive demo:** `savalidate`  (caption below)

**nosim:** True

**sub:** Twelve independent universes, each built and tested from scratch. Charge what you like per trade.

**cap:** Nothing here is selected. Each dot is a complete universe, generated independently, with the model built on the first stretch and tested on data it has never seen. The in sample column is what the model claims about itself. The middle column is what it delivers on unseen data. The right column is what arrives after costs. Read the gap between them, because that gap is the entire subject of this slide.

**body:**
  - **The edge is real, and it is about half what the model claims.** That is the honest summary, and it is a far better outcome than most ideas reach.
  - The in sample figure is positive in every universe, which sounds impressive until you remember that it was built on that data. What matters is the middle column, and the difference between the two is not bad luck. It is the portion of the in sample result that was never available to anybody.
  - Then costs. Push the slider and watch the right hand column fall. At a few basis points per trade, a basis point being one hundredth of one percent, this model is close to a coin flip, and that is with turnover it cannot avoid, because the holding period is set by the half life rather than chosen.

**beat4:** Because published results almost never state which of these three columns they are quoting, and the first is both the largest and the cheapest to produce. Presenting the middle or the right hand column requires giving up data you could have used, and admitting a smaller number, so the incentive runs entirely one way.

### Slide 40 - primer: What does a trade actually *cost*, and what is a basis point?

**answer:** Every trade costs something: the gap between buying and selling prices, the commission, and the price moving against you as you deal. A basis point is one hundredth of one percent, and trading costs are usually quoted in them. Two basis points on a thousand pounds is twenty pence.

**analogy:** Every time you move a boat between moorings you pay the harbour a small fee and lose a little to the current. It seems trivial per move. A strategy that moves boats constantly pays it constantly, and a strategy whose profit per move is also small can find the fee is most of the profit.

**why:** The next slide explains why this particular model is unusually sensitive to cost. It trades often, its profit per trade is small by design, and the hedge basket moves every time the loadings are re-estimated. Each of those multiplies the fee.

**terms:**
  -
    **t:** Basis point
    **d:** 0.01 percent. One hundred of them make one percent.
  -
    **t:** Spread
    **d:** The gap between the price you can buy at and the price you can sell at. You lose it every time you cross.
  -
    **t:** Turnover
    **d:** How much of the book is traded per period. High turnover means costs are paid often.

### Slide 41 - concepts: Why costs bite this model in particular

**items:**
  -
    **i:** loop
    **t:** The half life sets the turnover
    **d:** A residual that decays in fifteen days implies a position changed every few days. You did not choose that, the data did.
  -
    **i:** bars
    **t:** The edge is per unit of risk, not per trade
    **d:** Residual moves are small by construction, so the cost per trade is large relative to what each trade is trying to capture.
  -
    **i:** target
    **t:** Hedging multiplies the trades
    **d:** Every position carries an offsetting leg, so a single decision produces turnover on both sides of the book.
  -
    **i:** shuffle
    **t:** Costs are certain, the edge is not
    **d:** The cost is charged on every trade with no variance. The edge arrives as an average across many of them.

**body:**
  - **This is where most statistical arbitrage attempts actually die, and it has nothing to do with the signal.**
  - The holding period is not a preference here. It falls out of the half life, which was measured rather than chosen, and it dictates how often the book turns over. A faster reverting residual gives a cleaner signal and a worse cost problem at the same time.
  - So the honest question is never whether the edge exists. It is whether the edge per unit of turnover exceeds the cost per unit of turnover, and that comparison has to be made before anything is deployed rather than discovered afterwards.

**beat4:** Because costs are invisible in every backtest that does not deliberately model them, and modelling them properly requires assumptions you would rather not make. It is far easier to produce a gross result, and gross results are what get published, so an entire layer of the problem simply disappears from view.

### Slide 42 - primer: What is *overfitting*?

**answer:** Overfitting is when a model has been adjusted until it matches the past so closely that it has memorised the noise along with the pattern. It then looks excellent on the data it was built from and fails on anything new, because the noise does not repeat.

**analogy:** Study the harbour for a month and you can find a rule that predicts every single wave you saw, if you make the rule complicated enough. Rule seventeen: on the third Tuesday, after a red boat passes, the water rises. It fits perfectly. It also means nothing, and next month it will be wrong, because the red boat and the Tuesday were coincidence.

**why:** The next slide searches many settings for the model and shows what the best of them looks like. The best setting is always impressive. Whether it means anything depends on how many were tried, which is the question the slide is really about.

**terms:**
  -
    **t:** Overfitting
    **d:** Fitting the noise. The more settings you try, the more certain it becomes.
  -
    **t:** Parameter
    **d:** A setting the model has, such as a lookback length or an entry threshold.
  -
    **t:** Search
    **d:** Trying many combinations of parameters and keeping the best. Also called tuning or optimisation.

### Slide 43 - demo: The tuning trap

**interactive demo:** `sasearch`  (caption below)

**nosim:** True

**sub:** Every parameter combination, measured on the held out period.

**cap:** Here is what happens if you decide the held out result is disappointing and go looking for better settings. Every one of these bars is a Sharpe ratio from the period you promised not to touch. The best one looks like a discovery. It is the highest bar in a histogram whose centre sits far below it, and the moment you searched this period it stopped being held out.

**body:**
  - **This is the same machine as the overfitting lesson, applied to the one thing that was supposed to be protected from it.**
  - The uncomfortable part is that the search feels like diligence. You are not fabricating anything. You are testing carefully, comparing honestly, and choosing the best result, and the outcome is still a number that will not repeat.
  - The only defence is procedural rather than statistical. Decide the parameters before the held out period is opened, write them down, and accept whatever comes back. If you cannot resist looking, you needed a third period that you did not know about.

**caveatLabel:** Where this needs qualifying

**caveat:**
  - **This does not mean parameters can never be chosen.** They can, on the training data, using cross validation inside that period, which is exactly what the training data is for.
  - The rule being protected is narrower. The held out period answers one question once. Use it to compare fifty variants and you have converted your only honest test into another round of fitting.

### Slide 44 - compare: Two ways to arrive at the same chart

**sub:** Both produce an equity curve. Only one of them means anything.

**left:**
  **h:** The version that proves nothing
  **chip:** Unfalsifiable
  **items:**
    - Parameters chosen after seeing results
    - One period, no data held back
    - Positions unhedged, so the market is in the result
    - Costs applied optimistically or not at all
    - A single run, presented as the outcome

**right:**
  **h:** The version that can be judged
  **chip:** Checkable
  **items:**
    - Parameters fixed before the test
    - A held out period, opened once
    - Exposure removed, so the bet is the idea
    - Costs charged on every trade at a realistic rate
    - Many independent runs, distribution shown

**body:**
  - **The right column is harder, slower, and produces smaller numbers.** It is also the only version that tells you anything about tomorrow.
  - Every item on the left has an innocent explanation, which is why this is difficult. Nobody sets out to produce an unfalsifiable result. It happens one reasonable decision at a time.

### Slide 45 - prose: What this example was actually for

**lead:** The model is not the point. *The order is the point.*

**body:**
  - **Look back at what happened here.** A sentence became a universe, the universe was measured, the measurement suggested a decomposition, the decomposition produced a residual, the residual was tested for predictiveness before any rule was written, and the rule was shaped by that test rather than by preference.
  - Then the result was validated on data that had never been touched, charged realistic costs, and repeated across many independent universes so the answer was a distribution rather than an anecdote.
  - PULL:Every one of those steps existed to give the idea a chance to fail cheaply.
  - That is the entire craft. Not the technique, which is published in a hundred papers and implemented in a few hundred lines. The discipline of arranging the work so that a bad idea reveals itself early, on paper, rather than late, in an account.
  - **Change the technique and the order stays the same.** Momentum, carry, seasonality, anything at all. Universe, measurement, mechanism, rule, held out test, costs, repetition. The sequence is the transferable part, and it is what the rest of this bank is built to teach.

### Slide 46 - flow: What would happen next

**sub:** If this model had survived, and it has not yet.

**steps:**
  -
    **t:** Paper trading
    **d:** Confirms the rule can be executed at all, and that the data arrives when you assumed it would.
  -
    **t:** Burn in, small size
    **d:** Confirms live behaviour matches the record. At the Sharpe seen here, this needs many months to say anything.
  -
    **t:** Scaled size
    **d:** Confirms the edge survives the size. Residual trades are capacity limited, meaning only so much money fits before the trading itself moves the price against you, so this is where many stop working.
  -
    **t:** Monitoring
    **d:** Confirms it still works. Factor structure rotates, so the decomposition this model depends on will change underneath it.

**body:**
  - **The result on the previous slides is not a green light. It is permission to start the expensive part.**
  - Notice how long the burn in has to be. At the Sharpe this model achieves after costs, distinguishing a real edge from noise takes years rather than weeks, which means the honest answer to whether it works is usually not available for a long time after you would like it.
  - The last stage is the one people skip entirely. This model rests on a factor structure estimated from a rolling window, and that structure rotates. A model that is not watched will keep trading a decomposition that stopped describing the market some time ago.

### Slide 47 - check: Check yourself

**qs:**
  -
    **q:** Why must the position be neutralised against the components?
    **o:**
      - To reduce the number of trades
      - Because otherwise the result measures the idea plus a large accidental bet on the whole universe
      - Because brokers require hedged positions
    **a:** 1
    **why:** An unhedged residual trade is a directional position in disguise. Whatever the outcome, you cannot tell whether the signal or the market produced it, so the test teaches you nothing.
  -
    **q:** A residual shows a short half life on the window used to estimate the factors. What does that prove?
    **o:**
      - That it reverts and is tradeable
      - Very little, because a residual is orthogonal to those factors by construction and will look mean reverting regardless
      - That the factor model is wrong
    **a:** 1
    **why:** The orthogonality is imposed by the estimation itself. Only reversion measured on data outside that window is evidence of anything real.
  -
    **q:** The held out result disappoints, so you test fifty parameter sets on it and report the best. What have you produced?
    **o:**
      - A better model
      - The highest bar in a histogram whose centre sits well below it
      - A valid out of sample result, since the data was still unseen at the start
    **a:** 1
    **why:** The period stopped being held out the moment it was searched. Selecting the maximum of fifty noisy results reports the noise, and it will not repeat.

### Slide 48 - takeaways: What to carry forward

**keys:**
  - Most of what an instrument does is the group moving. The tradeable part is what is left after that is removed.
  - An exposure vector converts a statistical direction into a position you can actually hedge.
  - A residual looks mean reverting by construction, so reversion is only evidence when measured outside the estimation window.
  - Measure whether the signal predicts anything before writing the rule, and let the measurement shape the rule.
  - In sample flatters, costs bite, and the held out period answers one question once.

**unlocks:**
  - Separate any correlated universe into shared movement and instrument specific movement.
  - Test whether a proposed signal predicts anything before building a strategy on top of it.
  - Read any published backtest by asking which period, which costs, and how many variants were tried.

**bridge:**
  **label:** The transferable part
  **title:** The order, not the technique
  **text:** Nothing here depended on this being mean reversion, or on there being eight instruments. So what changes when the idea is momentum, or carry, or something you noticed yourself last week?
