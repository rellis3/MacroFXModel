# Layer 7: Stop Orders and Execution. Literature Spec

From published research and the trader's words only; no repository files read. **No winner declared; nothing run on our data.**

Tags: [V] = checked by search this session, usually abstract level. [V2] = secondary source only. [M] = from memory, check before relying on it.

Prompt: C.OG's stop orders exist because the vol forecaster is "a single layer in a multi layer system."

## Null to beat (standard results, my derivation)
Drift μ, vol σ, target +a, stop −b:
- **Target first:** P = (1 − e^(2μb/σ²)) / (e^(−2μa/σ²) − e^(2μb/σ²)); at μ=0, b/(a+b).
- **Touch within T:** Φ((μT−a)/(σ√T)) + e^(2μa/σ²)Φ((−a−μT)/(σ√T)); at μ=0, 2Φ(−a/(σ√T)).
- **Symmetric:** P ≈ ½ + μd/(2σ²). Sharpe 0.5 at d = 1 daily σ: about 1.6pp.
- **Discrete monitoring:** shift barrier 0.5826σ√Δt [V2], for close-based triggers only.

**Optional stopping.** On a martingale, no a, b, entry type or level gives positive gross expected R. Placement only reshapes the distribution; costs make it negative. Claims need a source of drift.

**Vol clock.** σ²(τ) = σ²_d·s(τ), V(τ) = Σ_{u>τ} s(u) (Andersen-Bollerslev). At μ=0, P(touch) = 2Φ(−d/(σ_d√V(τ))). A line reached late has less follow-through by construction.

## Candidates
| | Rule |
|---|---|
| A | Stop entry at line, bracket a, b |
| B | Limit fade at line, bracket a, b |
| C | Stop just past a round number near the line (Osler) |
| D | OCO stops at both lines |
| E | A or B only when a higher layer permits |
| F | Exit at a time or remaining-variance limit |

**Placement.** Maximise E[R] over (a,b) from the joint, *ordered* MAE/MFE path (Sweeney [M]). Marginal MAE and MFE ignore order and are censored by the exit tested.

## Evidence

### Stop-order flow at levels
**Osler 2003 JF [V].** Take-profits cluster at round numbers; stop-losses *just beyond* them. Helps explain stalls at levels and acceleration after breaks. Association only.

**Osler 2005 (conference version read [V]; JIMF venue [M]).** Minute quotes 1996-98, NY hours; 9,655 orders from one bank, 1999-2000. Arrival within 0.01% of 00/50 levels, against arbitrary levels. Source partly garbled in extraction; confirm figures.

| Reversal, 15 min | Round | Arbitrary | |
|---|---|---|---|
| USD/DEM | 59.3% | 54.8% | significant |
| USD/JPY | 60.1% | 57.3% | significant |
| USD/GBP | 58.1% | 56.6% | not significant |

- Cross speed (DEM): 0.061% vs 0.054%, about 0.7bp, likely at or below many retail spreads (my comparison).
- Reversal effect lasts to about 30 minutes; crossing at least 2 hours; two-day differences negative.
- Stronger in the less liquid NY afternoon. Noticeable cascades about weekly (informal estimate) against about 5 round-number crossings daily.
- Caveats: one bank; quotes not trades; cascades not directly observed.

**Other levels.** Garzarelli et al. 2014 [V]: nine LSE stocks, 2002 ticks; bounce above 0.5, shuffled about 0.5; rises with prior bounces at 45-90s, not significantly at 180s. Chung-Bellotti 2021 [V]: repeat bounces rise, decay over time, not AR(1). Sonnemans 2006 [V2]: Dutch stocks pass round numbers less often.

**Central gap.** I found **no evidence of order clustering at vol-scaled forecast levels**. Osler's mechanism needs resting orders. A private line has none unless others compute something similar or it coincides with a round number or prior extreme. A reaction there could be distributional exhaustion instead. Test the interaction.

### Breakouts
- **Equity, positive:** ORB on QQQ 2016-23, zero slippage per summary [V2]; ORB on "stocks in play" [V2]; SPY noise area, open·(1 ± mean move to that minute over 14 days), Sharpe 1.33 net, 2007-24 [V2]. All Zarattini-Aziz(-Barbon), commercially affiliated; no independent peer-reviewed replication found.
- **Equity mechanism:** first half-hour predicts last (Gao et al. 2018 JFE [V]); short-gamma hedging (Baltussen et al. 2021 JFE [V]).
- **Crude:** ORB above zero (Holmberg et al. 2013 FRL [V]); costs unverified.
- **FX, weak:** filter and MA profits gone by the early 1990s (Neely-Weller-Ulrich 2009 JFQA [V]); intraday rules unprofitable (Curcio et al. 1997 [V]); migrated to EM (Neely-Weller 2013 [V]); RUB intraday momentum tied to explicit hours and overnight-averse liquidity providers (Elaut et al. 2018 JFM [V]), so transfer to near-24h majors is doubtful.
- **Gold:** nothing retrieved.

### Stop exits
- Kaminski-Lo 2014 JFM [V]: under a random walk stops only reduce return; with momentum they can help. Stopping premium Δμ = E[r_stop] − E[r]; random-walk Δμ = −p_o(μ − r_f) [M].
- Lo-Remorov 2017 JFM [V]: tight stops underperform through costs; need high serial correlation; modest downside benefit.
- Leung-Li [V]: OU spread; higher stop implies lower optimal target, so they are not separable.
- All low-frequency; intraday use is extrapolation.

### Stop vs limit
Limits gain price but face execution and adverse-selection risk [V]; marginal limit orders break even (Glosten 1994 [V2]). Limit orders distort performance inference (Linnainmaa 2010 [M]). I found no head-to-head of stop entries against limit fades in FX, and nothing on FX stop slippage.

### Time of day and flow
- Periodicity strongly shapes high-frequency dynamics; filter first (Andersen-Bollerslev 1997 JEF [V]). DM-$ 5-minute, one year, 1992-93, with announcements (1998 JF [V]). Flexible Fourier form [M].
- Currencies weaken in local hours (Breedon-Ranaldo 2013 JMCB [V]).
- At least half of macro news's DM/$ effect runs through order flow (Evans-Lyons [V]).

## Where evidence is mixed
- **Reverse or cascade?** Both occur at the same levels: reversal more frequent and shorter; crossing larger and longer. Neither shown net of cost. Prior-bounce evidence is equities, not FX.
- **Breakouts:** positive in equities; decayed in major FX.
- **Stops:** return-reducing in a random walk; useful only with momentum.

## Testing in isolation
**Unit:** one order per instrument, line and day; bracket frozen before trigger.

**Metrics:** net R with date-block CI; excess target-first rate over first-passage P using remaining variance; excess move at 15m, 30m, 1h, 2h; post-touch variance against the expected profile; fill rate.

**Benchmarks, all required:**
1. **Placebo levels** matched on remaining-σ distance, instrument and time.
2. Analytical first-passage value.
3. Same order at random times.
4. A vs B at identical touches; gross results should nearly cancel, and the gap reveals costs.
5. Round-number interaction: line near 00/50 against not.
6. Simulated random walk with intraday profile and fat tails: zero gross.

**Costs:** spread by instrument and hour; stop slippage with a stress case; commission; swap. Report cost/b, since tight stops raise cost in R.

## Pitfalls
- **1-minute bars:** target and stop in one bar are unordered; use ticks or assume stop first.
- **Bid/ask:** buy stops trigger on ask; mid bars understate triggers and costs.
- **Limit fills:** touch is not fill; require trade-through. Fills are adversely selected.
- **Stop fills:** slippage is worst in cascades, the case stop entries seek.
- **Selection:** touched days have higher vol; only matched placebos handle this.
- **Timing:** lines frozen at the open; check DST.
- **Grid search:** placement points are trials.
- **Dated evidence:** Osler's data predates electronic dominance.
- **Asset fit:** Osler's evidence is FX; gamma mechanisms apply to indices.

## Links
icmaif.soc.uoc.gr/Year/8conf/docs/Osler-Price%20Cascades-03-03.doc · ideas.repec.org/a/bla/jfinan/v58y2003i5p1791-1819.html · dspace.mit.edu/handle/1721.1/114876 · ar5iv.arxiv.org/html/1110.5197 · nber.org/papers/w5783
