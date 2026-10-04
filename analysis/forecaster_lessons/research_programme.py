#!/usr/bin/env python3
"""
Lesson 02 applied to OUR research programme, from the verdict register in
`august analysis.md` (§1.1 accepted edges, §1.2 / table lines 88-96 banked nulls).
The tallies are typed in from that file; edit them as verdicts are banked.

  1  Base rate and false-discovery rate. With test size α and power, the observed pass
     rate is α(1-π) + power·π, so π̂ = (pass − α)/(power − α), and
     FDR = α(1-π)/(α(1-π) + power·π)   (L02 §05).
  2  Confirmation: posterior P(real) after a second independent pass (L02 §05: odds × LR).
  3  The fade-at-the-lines family as a beta-geometric search (L02 §03). With the lesson's
     prior Beta(1.2, 10.8) (mean 10%), after n failures: p̂_n = α/(α+β+n) and the
     expected attempts still to come = (α+β+n−1)/(α−1). The kill threshold is where
     p̂_n × value-of-success < cost-of-attempt.
"""
import math

# ── tallies (august analysis.md) ────────────────────────────────────────────
ACCEPTED = ['Range-Line / Fib Atlas (§13)', 'Yield-spread z-reversion', 'Touch motifs + double tops/bottoms',
            'Level-Atlas vote book (vp2)']
NULLS = (['POI-reaction fade', 'range-extension fade', 'z-score gated zones', 'VWAP reversion', 'VuManChu direction',
          'EMA cross / FX momentum', 'k-NN analogs + chart patterns', 'NQ-QMR (falsified)',
          'econ-trend', 'macro-direction', 'credit-stress gate', 'CB sentiment', 'GLI→FX',
          'mechanical fades at vol lines', 'hedge-v1', 'Hurst feature', 'layer2 vol-bot SL/TP', 'overnight hold',
          'max-copier', 'Dax IFO', 'MVE z-fade', 'post-FOMC drift (spec failed OOS)']
         + [f'retail strategy {i}' for i in range(1, 13)])
LIVE_CONFIRMED = 0          # none of the accepted edges has a live record in R yet; Fib Atlas paper: −$13.7k on 101 trades
FADE_FAMILY_FAILURES = ['POI fade', 'range-ext fade', 'z-score zones', 'mechanical vol-line fades', 'VWAP reversion',
                        'cog-fade', 'band-fade (Stage 1)', 'reversal-fade', '48-cell fade stop/target grid',
                        'layer2 vol-bot grid', 'vumanchu-gated fade (0/15 cells beat cost)']

n = len(ACCEPTED) + len(NULLS); k = len(ACCEPTED); pass_rate = k / n
print(f"Programme: {n} directions decided, {k} accepted → pass rate {pass_rate:.1%}; live-confirmed: {LIVE_CONFIRMED}")
for alpha, power in ((0.05, 0.8), (0.05, 0.5), (0.01, 0.8)):
    pi = max((pass_rate - alpha) / (power - alpha), 1e-6)
    fdr = alpha * (1 - pi) / (alpha * (1 - pi) + power * pi)
    lr = power / alpha
    post2 = 1 / (1 + (fdr / (1 - fdr)) / lr)
    print(f"  α={alpha:.2f} power={power:.1f}: implied base rate π≈{pi:.1%}; FDR of an accepted edge ≈ {fdr:.0%}; "
          f"after one independent confirmation P(real) ≈ {post2:.0%}")

a, b = 1.2, 10.8
m = len(FADE_FAMILY_FAILURES)
p_hat = a / (a + b + m); rem = (a + b + m - 1) / (a - 1)
print(f"\nFade-at-the-lines family: {m} failures, 0 successes")
print(f"  prior Beta({a},{b}) mean {a / (a + b):.1%} → posterior success rate {p_hat:.1%}; expected attempts still to come {rem:.0f}")
for cost_ratio in (0.02, 0.05, 0.10):
    # continue only while p̂ > cost/value; failures needed to cross: a/(a+b+n) < c → n > a/c − a − b
    n_kill = max(0, math.ceil(a / cost_ratio - a - b))
    print(f"  kill rule at cost/value {cost_ratio:.0%}: stop after {n_kill} failures → {'STOP NOW' if m >= n_kill else f'{n_kill - m} more'}")
