// Content of vol-research-inventory.html: the volatility / forecasting / exhaustion / trade-management research
// inventory (2026-11-22). Read-only consolidation of results already in the repo: no new test was run.
//
// Every row carries `proof`: [file, regex]. scripts/vol-research-inventory/build.mjs finds the first line in that file
// matching the regex, copies it verbatim with its line number, and FAILS if any proof is missing. The page shows the
// quote and links to the line on GitHub at the commit the build ran on. Edit content here, then re-run the build.

export const META = {
  title: 'Vol, Exhaustion & Trade-Management Research Inventory',
  date: '2026-11-22',
  scope: 'Gold, NQ, EURUSD (plus the 63-track ladder-v2 rollout where relevant); CFD (OANDA M1) and futures (CME via NT8)',
  method: [
    'Read-only. No code was changed and no backtest was re-run to build this inventory.',
    'Four parallel reads of the research register (plans/RESEARCH_REGISTER.md) and every results file it points to, grouped as: forecasting models; level behaviour & exhaustion; VWAP & futures vs CFD; trade management & sessions.',
    'A study counts as evidence only if a results file exists. Code alone is classed "implemented but not evaluated".',
    'Every number on this page is quoted verbatim from its source file (the "Proof" line). The build script fails if a quote cannot be found, so a number here cannot drift from the file it cites.',
  ],
};

export const STATUS = ['Complete', 'Partially complete', 'Needs validation', 'Not investigated', 'Inconclusive'];

export const KEY_FACTS = [
  { k: 'In-flight elsewhere', v: 'ladder-per-line', d: 'Jordan\'s best HL/OH/OL/OC forecast, CFD + futures. Registered, not scored' },
  { k: 'One σ beats live', v: '52 / 63', d: 'ladder-v2 tracks VALIDATED, 0 NULL' },
  { k: 'MFE median before MAE median', v: '≈ 49%', d: 'at forecast-line touches, NQ / 6E / GC' },
  { k: '80% consumption rule', v: 'refuted', d: 'reversal odds 0.516 → 0.518, flat' },
];

export const IN_FLIGHT = {
  slug: 'ladder-per-line',
  text: 'This is almost certainly the "two new volatility calcs on CFD and futures" the other session is running. It answers Q1–Q5 below (a separate σ model per line type, chosen on that line\'s own score, vs one model for all lines; a best OC model; OC p50 as a take-profit after fading OH/OL p75). Pre-registered 2026-11-20, amendment A1 and scorer on main 2026-11-22, nothing scored yet. The register still names branch jvphone; the work is on main. Do not duplicate it.',
  proof: [
    ['forge/LADDER_PER_LINE_PREREG.md', 'Pre-registered 2026-11-20'],
    ['forge/LADDER_PER_LINE_PREREG.md', '^\\| Instruments \\|'],
    ['plans/RESEARCH_REGISTER.md', '^\\| ladder-per-line \\|'],
  ],
};

export const KEY_CLARIFICATION = {
  title: '"Exhaustion VALIDATED" does not mean "reversal"',
  text: 'In ladder-v2, exhaustion is the calibrated probability that price travels on to the next rung, given the time of day. It is validated (59/63 tracks). Every test of the lines as reversal points, fades or follows is NULL. Both statements are true at once: the forecast tells you how far price is likely to go, not which way.',
  proof: [
    ['forge/EXHAUSTION_V2_NQ_PREREG.md', 'not a reversal or a trade'],
    ['analysis/output/ladder-v2-rollout/RESULTS.md', '\\*\\*Exhaustion:\\*\\* 59 VALIDATED'],
    ['analysis/output/reversal-zones/RESULTS.md', 'H1 EXT, pullback 0\\.25σ before the next rung'],
  ],
};

// Each row: q (brief question numbers), area, work (existing studies), result, remaining, status, cls (evidence class
// of the prior work), proof.
export const SECTIONS = [
  {
    id: 'forecasting', title: 'Forecasting', rows: [
      {
        q: 'Q1', area: 'Best HL forecast', status: 'Partially complete', cls: 'Completed and validated',
        work: 'ladder-v2 pilots (NQ, gold, EURUSD), 63-track rollout, lockbox holdout',
        result: 'One σ model per instrument, picked walk-forward on a 30-cell regime-calibration score, beats the live yz_10 on 52 of 63 tracks (11 underpowered, 0 null). NQ: daily-range HAR, miss 1.49pp vs 2.40pp. Gold: HAR-CJ 1.55 vs 3.53. EURUSD: HAR-CJ 1.38 vs 2.81. Holdout HL hits 53/25/11% against targets 50/25/10.',
        remaining: 'How much of the gain is the estimator and how much is refitting widths on NY-close bars (EURCHF and GBPCHF "won" with yz_10 itself). The 63-session holdout is too short to separate v2 from live.',
        proof: [
          ['analysis/output/ladder-v2-nq/RESULTS.md', '30-cell regime miss, chosen E6'],
          ['analysis/output/ladder-v2-gold/RESULTS.md', '^\\| Chosen \\| \\*\\*HAR-CJ'],
          ['analysis/output/ladder-v2-eurusd/RESULTS.md', '^\\| Chosen \\| \\*\\*HAR-CJ 1\\.38pp'],
          ['analysis/output/ladder-v2-rollout/RESULTS.md', '\\*\\*Sigma race:\\*\\* 52 VALIDATED'],
          ['analysis/output/ladder-v2-lockbox/RESULTS.md', '^  \\| HL \\| 53 / 25 / 11'],
        ],
      },
      {
        q: 'Q2, Q3', area: 'Best OH and OL forecast', status: 'Not investigated', cls: 'Partially completed',
        work: 'Scored only inside the shared 30-cell score; no model chosen per line',
        result: 'Holdout OH 42/20/5%, OL 59/33/16% (targets 50/25/10). The lopsidedness is the holdout\'s downward drift and affects every calc equally.',
        remaining: 'Does a model chosen per line type beat the shared one? That is ladder-per-line Part A (in flight).',
        proof: [
          ['analysis/output/ladder-v2-lockbox/RESULTS.md', '^  \\| OH \\| 42 / 20 / 5'],
          ['analysis/output/ladder-v2-lockbox/RESULTS.md', 'The OH/OL imbalance is the holdout'],
          ['forge/LADDER_PER_LINE_PREREG.md', '^\\*\\*Part A\\.\\*\\*'],
        ],
      },
      {
        q: 'Q4', area: 'Best OC forecast, and its KPI', status: 'Not investigated', cls: 'Not yet investigated',
        work: 'OC was never part of model selection, only of the 12-rung guard',
        result: 'No OC-specific model exists. ladder-per-line Part B1 will choose OC on mean pinball loss, the same accuracy score as the other lines. That rewards predicting the close well, which is exactly what Jordan warned against for an exhaustion use. Part B2 (OC p50 as a take-profit) is the only purpose-based measure planned.',
        remaining: 'What KPI fits OC\'s job? It can still be amended before ladder-per-line scores.',
        proof: [
          ['forge/LADDER_PER_LINE_PREREG.md', '^\\*\\*Part B1\\.\\*\\*'],
          ['forge/LADDER_PER_LINE_PREREG.md', 'PRIMARY, per quantity q:\\*\\* mean pinball loss'],
          ['forge/LADDER_PER_LINE_PREREG.md', '^\\*\\*Part B2\\.\\*\\*'],
        ],
      },
      {
        q: 'Q5', area: 'Separate models per objective vs one shared model', status: 'Partially complete', cls: 'Completed and validated',
        work: 'ladder-mix-2020s',
        result: 'Choosing a σ per percentile: NULL (+0.02pp). Per regime and per cell: within noise. The picks were unstable year to year. Verdict: keep one σ. Widths are already fitted separately per line and percentile on that one σ, so a "per-percentile ladder" already exists in that sense.',
        remaining: 'Per line type on pinball is untested (ladder-per-line). Expect the same instability problem.',
        proof: [
          ['analysis/output/ladder-mix-2020s/RESULTS.md', 'S2 σ per percentile'],
          ['analysis/output/ladder-mix-2020s/RESULTS.md', 'S0 live yz_10'],
        ],
      },
      {
        q: 'Q6', area: 'P50 / P75 / P90 calibration', status: 'Needs validation', cls: 'Completed and validated (with gaps)',
        work: 'ladder-v2 σ-quintile tables, day-reconstruction M6, nq-line-calibration-audit',
        result: 'v2 removes the live σ\'s regime blindness (NQ p75 hits, quiet → loud fifth: live 35.7% → 21.3%; v2 25.3% → 25.8%). p90 is a 10% boundary (8.6–10.7%). Event days miss badly: on CPI/NFP/FOMC days the p75 was exceeded 34–48% of the time instead of 25%.',
        remaining: 'Event multipliers are still unfitted (runbook 1.5). No forward record yet.',
        proof: [
          ['analysis/output/ladder-v2-nq/RESULTS.md', '^\\| C live yz_10 \\| 35\\.7'],
          ['analysis/output/ladder-v2-nq/RESULTS.md', '^\\| C har_rv_log \\| 25\\.3'],
          ['analysis/output/day-reconstruction/m6/REPORT.md', 'Q5 Is p90 a 10% boundary'],
          ['plans/RESEARCH_REGISTER.md', '^\\| nq-line-calibration-audit'],
        ],
      },
      {
        q: 'Q7', area: 'Does the best model differ by asset?', status: 'Complete', cls: 'Completed and validated',
        work: 'ladder-v2 rollout, 63 instrument-tracks',
        result: 'Yes. Intraday 5-min RV HAR variants win on FX and gold, daily-range HAR on NQ, and a mix elsewhere (GARCH-t on SPX500 CFD, HAR+GARCH-t on USDCAD and CADCHF).',
        remaining: '—',
        proof: [
          ['analysis/output/ladder-v2-rollout/RESULTS.md', '^\\| SPX500 \\| C \\| VALIDATED \\| GARCH-t'],
          ['analysis/output/ladder-v2-rollout/RESULTS.md', '^\\| USDCAD \\| C \\| VALIDATED \\| HAR \\+ GARCH-t'],
        ],
      },
      {
        q: '§4–5', area: 'QLIKE, MAE loss, blends, implied vol', status: 'Inconclusive', cls: 'Completed but conflicting',
        work: 'ladder-v2 pilots and IV races, vol-layer confirms, older IV-ladder pinball studies',
        result: '50/50 blends lose on the pilots (gold HAR+GARCH-t 2.24pp vs HAR-CJ 1.55) but win 6 rollout tracks. IV over-corrects on regime calibration (EURUSD best IV arm 1.85 vs 1.28; slopes 1.13–1.16) while older pinball studies favoured it. No MAE-loss comparison exists. QLIKE is reported, never used to decide.',
        remaining: 'No head-to-head of the ladder-v2 σ against the vol-layer "chosen σ" with its frozen feedback rule.',
        proof: [
          ['analysis/output/ladder-v2-gold/RESULTS.md', '^\\| HAR \\+ GARCH-t 50/50 \\| 2\\.24'],
          ['analysis/output/ladder-v2-eurusd/RESULTS.md', 'The IV arms do not win'],
          ['analysis/output/ladder-v2-eurusd/RESULTS.md', 'Pure IV \\(2\\.65\\) and HAR \\+ IV'],
        ],
      },
    ],
  },
  {
    id: 'levels', title: 'Forecast-level behaviour & exhaustion', rows: [
      {
        q: 'Q8', area: 'How often levels are reached', status: 'Complete', cls: 'Completed and validated',
        work: 'ladder-v2 lockbox, exhaustion-v2 (NQ, gold, EURUSD + rollout), day-reconstruction M3/M6',
        result: 'Touch rates are calibrated. After a touch, the next rung is reached 67.4% of the time before 07:00 London but only 26.4% after 16:00. The plain ladder odds say a flat ~44%. The clock-aware exhaustion model is validated on 59 of 63 tracks.',
        remaining: 'The late day is still slightly over-called.',
        proof: [
          ['analysis/output/exhaustion-v2-nq/RESULTS.md', '^\\| 00–07 \\(n 626\\) \\| 67\\.4%'],
          ['analysis/output/exhaustion-v2-nq/RESULTS.md', '^\\| 16–22 \\(n 2,648\\) \\| 26\\.4%'],
          ['analysis/output/ladder-v2-rollout/RESULTS.md', '\\*\\*Exhaustion:\\*\\* 59 VALIDATED'],
        ],
      },
      {
        q: 'Q9', area: 'What happens after the first touch', status: 'Complete', cls: 'Completed and validated',
        work: 'reversal-zones (21,567 touches vs placebo), day-reconstruction M7, trade-at-lines',
        result: 'Lines are not reversal points. The chance of a 0.25σ pullback before the next rung is 81.6% at real lines vs 81.7% at shifted copies. The median overshoot is 0.174σ, the same as a random walk. Fade and follow trades at the lines are net negative after the spread.',
        remaining: '—',
        proof: [
          ['analysis/output/reversal-zones/RESULTS.md', 'H1 EXT, pullback 0\\.25σ'],
          ['analysis/output/reversal-zones/RESULTS.md', 'H2 EXT, median overshoot'],
          ['analysis/output/trade-at-lines/RESULTS.md', 'After the spread, everything is negative'],
          ['analysis/output/day-reconstruction/m7/REPORT.md', 'R7 hard stop'],
        ],
      },
      {
        q: 'Q10', area: 'Does the number of retests matter?', status: 'Needs validation', cls: 'Completed but only exploratory',
        work: 'line-touch-mae-futures (CME NQ / 6E / GC, 2016–2026)',
        result: 'No. Back vs through is a coin flip at touch 1, 2, 3 and 4+ (about 48–52%). NQ p90 leans "through", which is drift.',
        remaining: 'No pre-registration and no costed retest trade at forecast lines.',
        proof: [
          ['analysis/output/line-touch-mae-futures/RESULTS.md', 'Back vs through is a coin flip at every touch number'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| NQ p50 \\| 48\\.6%'],
        ],
      },
      {
        q: 'Q11', area: 'Range consumption and the 80% rule', status: 'Complete', cls: 'Completed and validated',
        work: 'volatilityExhaustion market-state study, day-reconstruction M3/M6/M7, remaining-travel',
        result: 'The 80% rule is refuted. Reversal odds at a fresh extreme are flat across budget used: 0.516 at 0–50% and 0.518 at 90–110%. High consumption by noon predicts a larger afternoon range, not a smaller one.',
        remaining: '—',
        proof: [
          ['volatilityExhaustion/MARKET_STATE_FINDINGS.md', '^\\| 0–50% \\| 0\\.516'],
          ['volatilityExhaustion/MARKET_STATE_FINDINGS.md', '\\*\\*90–110%\\*\\* \\| \\*\\*0\\.518'],
          ['volatilityExhaustion/MARKET_STATE_FINDINGS.md', 'FLAT\\.\\*\\* P\\(reversal\\)'],
          ['volatilityExhaustion/MARKET_STATE_FINDINGS.md', 'noon predicts \\*higher\\* afternoon range'],
        ],
      },
      {
        q: 'Q12', area: 'Approach speed', status: 'Inconclusive', cls: 'Completed (forecast-specific null)',
        work: 'day-reconstruction M5, the two VWAP atlases',
        result: 'No forecast-specific effect: none of the 12 forecast-minus-placebo differences is significant. Slow arrivals resolve less in both directions, at real and placebo lines alike. The two VWAP atlases disagree on which way speed points.',
        remaining: 'Resolve the atlas conflict (different units and outcomes).',
        proof: [
          ['analysis/output/day-reconstruction/m5/REPORT.md', 'None of the 12 forecast-minus-placebo'],
          ['analysis/output/day-reconstruction/m5/REPORT.md', 'The same effect appears at the placebo lines'],
        ],
      },
      {
        q: 'Q13', area: 'Rejection wicks and failed closes', status: 'Partially complete', cls: 'Partially completed',
        work: 'LINE-REACTION (34 instruments)',
        result: 'Candle shape adds nothing (log-loss ratio 1.000). The chance of rejection at the line equals its neighbours (line minus neighbours −0.001).',
        remaining: 'A post-touch "rotation" event (the first H1 close back inside) against placebo has never been tested on the production ladder.',
        proof: [
          ['analysis/output/line_reaction/RESULTS_chosen.md', 'candle shape adds information: False'],
          ['analysis/output/line_reaction/RESULTS_chosen.md', '^\\| p50 \\| 0\\.486'],
        ],
      },
      {
        q: 'Q14', area: 'Exhausted vs continuing moves', status: 'Complete', cls: 'Completed and validated',
        work: 'exhaustion-v2, M3–M7, vol-line-touch-layers (984 layer-state cells)',
        result: 'They can be told apart for how far price travels (the clock does it) but not for which way. No layer state in 984 cells separates them for direction.',
        remaining: '—',
        proof: [
          ['plans/RESEARCH_REGISTER.md', '^\\| vol-line-touch-layers'],
          ['analysis/output/exhaustion-v2-nq/RESULTS.md', 'One touched before 07:00 does so about 67%'],
        ],
      },
      {
        q: '§2', area: 'Dynamic re-anchoring', status: 'Inconclusive', cls: 'Implemented but not properly evaluated',
        work: 'Projected H/L levels in M3–M7; DynAnchorBot',
        result: 'Projected levels behave like placebo levels. The chart\'s Projected H/L uses the current bar\'s extreme, which is lookahead. DynAnchorBot\'s "Calmar 9.97 validated config" has no pre-registration or register row.',
        remaining: 'Only worth reopening with a lookahead-free build and a pre-registration.',
        proof: [
          ['analysis/output/day-reconstruction/SYNTHESIS.md', 'Projected H/L \\(which uses the current bar'],
          ['DynAnchorBot/dyn_anchor_mt5_bot.py', 'Calmar 9\\.97 validated config'],
        ],
      },
    ],
  },
  {
    id: 'vwap', title: 'VWAP', rows: [
      {
        q: 'Q15', area: 'Futures VWAP vs CFD VWAP', status: 'Not investigated', cls: 'Partially completed',
        work: 'nq-futures-line-race; noise-area prereg data check',
        result: 'CFD tick volume correlates only 0.43 (ES) and 0.66 (NQ) with CME contract volume. Yet line-touch outcomes are the same on both sources. Every study reset VWAP at the UTC day or London midnight. Jordan\'s per-instrument open-to-close session reset has never been used.',
        remaining: 'Measure the actual gap between the two VWAPs, using a trading-session reset.',
        proof: [
          ['forge/NOISE_AREA_MOMENTUM_PREREG.md', 'tick volume correlates only 0\\.43 / 0\\.66'],
          ['analysis/output/day-reconstruction/futures_check/RESULTS.md', '^\\| Fixed p75 \\| futures'],
          ['analysis/output/day-reconstruction/futures_check/RESULTS.md', '^\\| Fixed p75 \\| CFD'],
          ['MD files/VWAP_REVERSION_FINDINGS.md', 'session anchor = UTC day'],
        ],
      },
      {
        q: 'Q16', area: 'Return to VWAP after an extension', status: 'Needs validation', cls: 'Completed but only exploratory',
        work: 'VWAP extension atlas, gold fixed-sigma atlas',
        result: 'After a ≥1 ATR stretch, price touches VWAP again the same day only 11.5–29.5% of the time (NAS100). Against a random-walk control, gold\'s deep-band returns are real: at ±3σ, 27–30% vs 4.8%. Cells hold only ~100–200 events.',
        remaining: 'Not yet conditioned on forecast-rung extensions using futures VWAP.',
        proof: [
          ['education/vwap_extension_atlas/RESULTS.md', '^\\| NAS100 \\| up \\| 104 \\| \\*\\*11\\.5%'],
          ['education/vwap_extension_atlas/RESULTS.md', '^\\| NAS100 \\| down \\| 200 \\| \\*\\*29\\.5%'],
          ['MD files/GOLD_VWAP_FIXED_SIGMA_FINDINGS.md', '^\\| ±3σ \\| 29–30% / 27% \\| 4\\.8%'],
        ],
      },
      {
        q: 'Q17', area: 'VWAP deviation bands', status: 'Complete', cls: 'Completed and validated (negative)',
        work: 'VWAP reversion (26 pairs, 2016–2026, costed), fixed-sigma atlas',
        result: 'Band fades: 0 of 26 pairs positive out of sample (t −46.6). The VWAP bounce and band-follow modes also lose on every pair. Your original ~14-day VWAP extension indicator was not found in the repo; the closest is a frozen 20-session RMS σ band.',
        remaining: 'Locate the original Pine if it should be tested.',
        proof: [
          ['MD files/VWAP_REVERSION_FINDINGS.md', '^\\| `band_fade` \\(A\\) \\| 32,715'],
          ['MD files/VWAP_REVERSION_FINDINGS.md', '^\\| `vwap_bounce` \\(B\\) \\| 32,156'],
        ],
      },
      {
        q: 'Q18, Q24', area: 'VWAP as a target vs an MFE target', status: 'Partially complete', cls: 'Completed (strict rule) + exploratory',
        work: 'futures-exhaustion-vwap (CME NQ / 6E / GC); line-touch-mae-futures v3',
        result: 'VWAP target: 0 of 117 cells survive, 115 of 117 negative. Median-MFE target: reached first 48–50% of the time. Neither beats a coin flip, but both were tested on line-touch entries, which have no edge.',
        remaining: 'Untested on a directional entry that has an edge.',
        proof: [
          ['analysis/output/futures-exhaustion-vwap/RESULTS.md', '0 survived discovery'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| NQ \\(stop 103 t, target 94 t\\)'],
        ],
      },
      {
        q: 'Q19', area: 'Does VWAP add information beyond the forecast?', status: 'Complete', cls: 'Completed and validated (negative)',
        work: 'exhaustion-v2 X8 (VWAP distance + touch volume), vwap-stretch-line-touch',
        result: 'No. Adding VWAP distance and volume does not improve the exhaustion model (NQ 3.51pp vs 3.24pp for the best). Price is ≥1.5 VWAP SDs away at 95–98% of p75/p90 touches anyway, so "stretched" isn\'t a usable condition.',
        remaining: '—',
        proof: [
          ['analysis/output/exhaustion-v2-nq/RESULTS.md', '^\\| X8 \\(F only\\)'],
          ['analysis/output/vwap-stretch-line-touch/RESULTS.md', 'The literal rule is not a condition'],
        ],
      },
    ],
  },
  {
    id: 'source', title: 'Futures vs CFD data', rows: [
      {
        q: '§7', area: 'Ranges, models and data source', status: 'Partially complete', cls: 'Completed and validated (ranges); not investigated (source choice)',
        work: 'ladder-v2 CFD-vs-futures comparison, rollout, futures-cost-rescore',
        result: 'NQ futures and the NAS100 CFD have the same range distribution (ratios 0.994–1.007). Gold futures ranges are 2–6% larger, so gold keeps its own widths. Both tracks validate, but the winning model can differ by source (gold futures HAR-RV 5-min 1.44pp vs CFD HAR-CJ 1.55pp).',
        remaining: 'Which source should generate forecasts and which should execute is undecided. Futures inputs feeding the CFD forecast are untested (runbook 2.2).',
        proof: [
          ['analysis/output/ladder-v2-nq/RESULTS.md', 'and 1\\.007, with every 90% CI'],
          ['analysis/output/ladder-v2-gold/RESULTS.md', 'futures ranges are 2–6% larger'],
          ['analysis/output/ladder-v2-gold/RESULTS.md', '^\\| Chosen \\| \\*\\*HAR-CJ'],
        ],
      },
    ],
  },
  {
    id: 'trade', title: 'Trade management', rows: [
      {
        q: 'Q20', area: 'MFE median reached before MAE median (Jordan)', status: 'Needs validation', cls: 'Completed but only exploratory',
        work: 'line-touch-mae-futures v3 race (CME, 2016–2026); raw-level-mfe-mae (12 CFDs)',
        result: 'Already answered for line touches: a coin flip. With the stop at median MAE and the target at median MFE, the target comes first 49.7% (NQ), 49.0% (6E) and 48.2% (GC) of the time. Real lines equal placebo lines (MFE > MAE 50.0%). No costs applied.',
        remaining: 'The same question on a strategy\'s own entries (Application A) has never been asked.',
        proof: [
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| NQ \\(stop 103 t, target 94 t\\)'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| 6E \\(stop 18 t, target 17 t\\)'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| GC \\(stop 28 t, target 27 t\\)'],
          ['analysis/output/raw-level-mfe-mae/RESULTS.md', '^\\| All lines, real touches'],
        ],
      },
      {
        q: 'Q21', area: 'MFE / MAE percentiles', status: 'Complete', cls: 'Completed but only exploratory',
        work: 'line-touch-mae-futures tables, raw-level-mfe-mae',
        result: 'Full p25–p90 tables exist by touch, hour and weekday. Lines widen both tails equally (p90 1.17U vs 0.78U at placebo), so they change the spread of outcomes, not the direction.',
        remaining: '—',
        proof: [
          ['analysis/output/raw-level-mfe-mae/RESULTS.md', '^\\| All lines, real touches'],
          ['plans/RESEARCH_REGISTER.md', '^\\| raw-level-mfe-mae'],
        ],
      },
      {
        q: 'Q22', area: 'Stop distances', status: 'Partially complete', cls: 'Completed and validated (σ stops)',
        work: 'vol-layer-stops-confirm (34 instruments, unseen 2023–2026 bid/ask), raw-level-mfe-mae grid',
        result: 'Stops in σ units are validated: their hit rate is steadier month to month than fixed-width stops (+3.86pp), and the stop-odds model beats σ alone (Brier skill +4.73%). There is no market-wide noise threshold. 0 of 1,008 stop × target cells is profitable.',
        remaining: 'A best stop distance must come from a system\'s own MAE/MFE, and needs an entry that has an edge.',
        proof: [
          ['analysis/output/vol-layer-stops-confirm/RESULTS.md', '`-steady` VALIDATED'],
          ['analysis/output/vol-layer-stops-confirm/RESULTS.md', '`-skill` VALIDATED'],
          ['analysis/output/vol-layer-stops-confirm/RESULTS.md', '`-noise` CONTEXT'],
          ['analysis/output/raw-level-mfe-mae/RESULTS.md', '0 of 1,008 cells is profitable'],
        ],
      },
      {
        q: 'Q23', area: 'Targets: the forecast as a destination', status: 'Complete', cls: 'Completed and validated (negative)',
        work: 'nq-forecast-target-ev (1,550 sessions), trade-at-lines, exit studies',
        result: 'A forecast-line target adds nothing over plain holding: long at the London open with an O→C p75 limit made +0.027% per trade, but 0.026% less than just holding, and it sat at only the 81.5th percentile of shuffled forecasts.',
        remaining: 'Only tested on NQ open-long and line-touch entries, not on a directional strategy with an edge.',
        proof: [
          ['analysis/output/nq-forecast-target-ev/RESULTS.md', 'P1 \\(long at the London open'],
          ['analysis/output/nq-forecast-target-ev/RESULTS.md', 'P1 − B1 = −0\\.026%'],
          ['analysis/output/nq-forecast-target-ev/RESULTS.md', '81\\.5th percentile'],
        ],
      },
      {
        q: 'Q25', area: 'Directional vs exhaustion target logic', status: 'Inconclusive', cls: 'Partially completed',
        work: 'trade-at-lines, futures-exhaustion-vwap, Rule A',
        result: 'Both are net negative wherever tested. The only positive line-based system is Rule A (rich-day break), which is null before 2020. Its forward record is running.',
        remaining: 'Rule A forward record (judged no earlier than 2027-10-29).',
        proof: [
          ['plans/RESEARCH_REGISTER.md', '^\\| rule-a-pre2020'],
          ['plans/RESEARCH_REGISTER.md', '^\\| rule-a-book-forward'],
        ],
      },
      {
        q: 'Q26', area: 'Position size vs forecast volatility', status: 'Complete', cls: 'Completed and validated',
        work: 'vol-layer-sizing-confirm (34 instruments, unseen 2023–2026)',
        result: 'σ sizing steadies monthly risk compared with unscaled sizing (−0.075 [−0.106, −0.053]), on 34 of 34 instruments.',
        remaining: '—',
        proof: [
          ['analysis/output/vol-layer-sizing-confirm/RESULTS.md', 'σ sizing steadies monthly risk against unscaled'],
          ['analysis/output/vol-layer-sizing-confirm/RESULTS.md', '^\\| a: dev_F − dev_U'],
        ],
      },
    ],
  },
  {
    id: 'interaction', title: 'Level interaction', rows: [
      {
        q: 'Q27, Q28', area: 'Nearby levels: one level or a zone?', status: 'Needs validation', cls: 'Completed but only exploratory',
        work: 'line-touch-mae-futures v2, reversal-zones',
        result: 'Another line sits within 5 ticks on 17% (NQ), 67% (GC) and 81% (6E) of touches. Stacked touches travel about half as far both ways: stacks mean a quiet day, not a different direction. reversal-zones recommends drawing each line as a zone (the line to +0.17σ, outer edge +0.35σ).',
        remaining: 'The stack split hasn\'t been re-read in σ units, and there is no pre-registration.',
        proof: [
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '\\*\\*Stacks are common\\.\\*\\*'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', 'Stacked = quiet day'],
          ['plans/RESEARCH_REGISTER.md', '^\\| reversal-zones'],
        ],
      },
      {
        q: 'Q29', area: 'Is the further level better? (Jordan)', status: 'Complete', cls: 'Completed but only exploratory',
        work: 'line-touch-mae-futures v3, futures-line-lab preset 03',
        result: 'Tested; NULL. Keeping only the level further from price leaves the target-first share unchanged: NQ 49.7% → 49.7%, 6E 49.0% → 49.0%, GC 48.2% → 48.0%.',
        remaining: '—',
        proof: [
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '\\*\\*Better level\\*\\* \\(Jordan'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| NQ \\(stop 103 t, target 94 t\\)'],
          ['analysis/output/line-touch-mae-futures/RESULTS.md', '^\\| GC \\(stop 28 t, target 27 t\\)'],
        ],
      },
      {
        q: 'Q30', area: 'Confluence with VWAP, GEX and other levels', status: 'Complete', cls: 'Completed (null / underpowered)',
        work: 'gex-ladder-confluence, futures-exhaustion-vwap, vwap-stretch-line-touch',
        result: 'No confluence helps. At GEX-ladder confluence the bounce is 43.2% vs 47.2% without it (underpowered, wrong way). VWAP confluence: see Q18 and Q19.',
        remaining: '—',
        proof: [
          ['oi_research_book/GEX_LADDER_CONFLUENCE_RESULTS.md', 'P\\(bounce within 120 min of touch\\)'],
          ['analysis/output/futures-exhaustion-vwap/RESULTS.md', '0 survived discovery'],
        ],
      },
    ],
  },
  {
    id: 'sessions', title: 'Range & session research', rows: [
      {
        q: '§8', area: 'Asia range, session opens, range extensions', status: 'Complete', cls: 'Completed and validated (mostly negative)',
        work: 'range-edge-limit-fade (24,006 trades), range-ladder-placebo-confirm, DailyOpenResearch, SessionResearch',
        result: 'Fading the Asia range edges loses (−0.109R, on 32 of 34 instruments). The edges do revert slightly more than a shifted ladder on 15 of 15 instruments, which is context, not a tradeable edge. Range persists across session handoffs; direction does not.',
        remaining: '—',
        proof: [
          ['analysis/output/range-edge-limit-fade/RESULTS.md', '^\\| T1 sell A_1 / buy A_0'],
          ['analysis/output/range-edge-limit-fade/RESULTS.md', 'on 32 of 34 instruments'],
          ['plans/RESEARCH_REGISTER.md', '^\\| range-ladder-placebo-confirm'],
        ],
      },
    ],
  },
];

export const TOP5 = [
  { t: 'What KPI should the OC forecast be judged on?', d: 'ladder-per-line Part B1 will pick OC on pinball, which rewards predicting the close, the criterion Jordan warned against. B2 (OC as a take-profit) is the only purpose-based measure.' },
  { t: 'Jordan\'s MFE / MAE race on entries that have an edge', d: 'Every MFE/MAE, stop and target result so far uses line-touch entries, which have no edge, so about 50/50 was guaranteed. Application A (a directional strategy\'s own trades) has never been tested. Rule A is the only candidate.' },
  { t: 'Session-reset futures VWAP vs CFD VWAP', d: 'The gap between them has never been measured, and Jordan\'s per-instrument open-to-close reset has never been used.' },
  { t: 'The post-touch rotation event', d: 'The first H1 close back inside, against placebo. It is the one exhaustion mechanism never tested on the production ladder.' },
  { t: 'Event-day calibration and a forward record', d: 'The p75 was exceeded 34–48% of the time on CPI/NFP/FOMC days. Also unresolved: whether to trust the ladder-v2 σ or the vol-layer "chosen σ".' },
];

export const DONT_REPEAT = [
  '50/50 blends and per-percentile model mixing (ladder-v2 pilots, ladder-mix-2020s)',
  'Fading or following at forecast lines, including C.OG\'s own line and Setups A/B (trade-at-lines, reversal-zones, M7, cog_setups)',
  'The 80% range-consumption fade (MARKET_STATE_FINDINGS, M3/M6/M7)',
  'VWAP band fades, and VWAP as a target at line touches (VWAP_REVERSION_FINDINGS, futures-exhaustion-vwap)',
  'Jordan\'s "further level" rule and retest counts (line-touch-mae-futures v2/v3)',
  'Wick and volume shape at the line (LINE-REACTION)',
  'Confluence with VWAP, GEX or Fib (gex-ladder-confluence, vol-asia-fib, live-range-confluence-book)',
  'σ position sizing (vol-layer-sizing-confirm, already validated)',
  'Forecast-as-target from the NQ open (nq-forecast-target-ev)',
  'Futures-vs-CFD range ratios for NQ, 6E and gold (ladder-v2)',
];

export const CONFLICTS = [
  { t: 'The brief vs the evidence', d: '"Blends did not beat the best model" holds for the pilots, but blends win 6 rollout tracks. The 80% rule is refuted, not just untested. "Exhaustion validated" means calibration, not reversal.' },
  { t: 'Implied vol', d: 'Older pinball and QLIKE studies favour it; ladder-v2\'s regime calibration says it over-corrects (slopes 1.13–1.4).' },
  { t: 'Approach speed', d: 'The extension atlas says a grinding approach makes a return to VWAP less likely; the fixed-sigma atlas says a grind reverts and a spike continues. They use different units and outcomes.' },
  { t: 'Asia range', d: 'A wide Asia lowers the odds of reaching the median band later (asia-range-london), while range compounds overall (remaining-travel). They measure different things; quote neither without the other.' },
  { t: 'Unaudited positives', d: 'DynAnchorBot\'s "Calmar 9.97", the G1 "+15.4pp reversal" (CONDITIONAL_FADE_DESIGN.md) and volatilityExhaustion Phase 6\'s follow result. All predate the placebo-matched nulls and none has been re-tested with costs.' },
  { t: 'Housekeeping', d: 'The register lists ladder-per-line on branch jvphone, but the work is on main. FORECASTER_SYSTEM_BLUEPRINT.md still prefers HAR-800, which is out of date against ladder-v2. The raw M1 and NT8 data are not in cloud containers, so new tests run on the owner\'s machine or need a data pull.' },
];

export const NEXT = {
  q: 'What is the right KPI for the OC forecast, given that its job is to mark a reversal or take-profit point rather than to predict the close?',
  why: 'It is the cheapest open question and sits squarely in the brief. It is also time-sensitive: ladder-per-line has not scored yet, so the OC KPI can still be amended now. Otherwise Part B1 will choose an OC model on the very criterion Jordan said not to use.',
};

export const CONFLICT_PROOF = [
  ['MD files/CONDITIONAL_FADE_DESIGN.md', '\\+15\\.4pp'],
  ['volatilityExhaustion/README.md', '^\\| OOS \\| 85\\.8%'],
];
