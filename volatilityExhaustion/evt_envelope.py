"""
evt_envelope.py — do the day's extreme excursions follow the reflection-principle /
extreme-value law the forecast levels are built on? (Understanding, not edge.)

Theory: for a DRIFTLESS Brownian motion with daily vol sigma, the one-sided maximum
excursion from the open — O->H = sup_t W_t and O->L = sup_t(-W_t) — each has, by the
REFLECTION PRINCIPLE, the distribution of |N(0, sigma^2)| (a half-normal). So in
sigma-units the pooled one-sided excursions should be half-normal:
    median 0.6745 (= the forecast O-C median constant, no coincidence),
    mean   sqrt(2/pi) = 0.798,
    survival P(X>=a) = erfc(a/sqrt2)   -> a thin, Gaussian (a^2/2) tail.
The full H-L range median is Feller's 1.572 sigma; the LIL is the ASYMPTOTIC envelope
of this same tail (limsup ~ sqrt(2 log log n)) -- so the tail is where LIL-type
behaviour shows. We test the finite-horizon law directly and read the tail:
    bulk matches half-normal  -> the vol scaling is right, levels sit on the EVT law.
    tail FATTER than half-normal -> real extremes exceed the driftless-Gaussian
        envelope (fat tails / vol clustering / jumps) -> why the extreme (and the
        exhaustion band) is intrinsically harder to forecast than a diffusion says.
Pure measurement. sigma = the same causal Yang-Zhang used everywhere.
"""
import os, sys, json
import numpy as np
from scipy.special import erfc
from scipy.stats import norm
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from measure import INSTRUMENTS, HERE, CH

HN_MED = norm.ppf(0.75)                    # 0.6745  half-normal median (= O-C median constant)
HN_MEAN = np.sqrt(2 / np.pi)               # 0.7979
FELLER_HL_MED = 1.572
plt.rcParams.update({'figure.dpi': 110, 'font.size': 10, 'axes.grid': True, 'grid.alpha': .25})


def excursions(pair):
    rel, _ = INSTRUMENTS[pair]
    m1 = load_m1(os.path.join(HERE, '..', rel))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    O, H, L = daily['open'], daily['high'], daily['low']
    ok = (sig > 0) & (O > 0)
    up = (H[ok] - O[ok]) / O[ok] / sig[ok]      # O->H  in sigma-units
    dn = (O[ok] - L[ok]) / O[ok] / sig[ok]      # O->L  in sigma-units
    e = np.concatenate([up, dn])
    return e[np.isfinite(e) & (e >= 0)]


def summarize(pair, e):
    qs = [0.5, 0.75, 0.9, 0.95, 0.99]
    emp = np.quantile(e, qs)
    theo = norm.ppf([(1 + q) / 2 for q in qs])   # half-normal quantiles
    return dict(
        pair=pair, n=int(e.size),
        median_emp=round(float(np.median(e)), 3), median_theo=round(float(HN_MED), 3),
        mean_emp=round(float(e.mean()), 3), mean_theo=round(float(HN_MEAN), 3),
        q=dict(zip([str(q) for q in qs], [round(float(x), 2) for x in emp])),
        q_theo=dict(zip([str(q) for q in qs], [round(float(x), 2) for x in theo])),
        tail99_ratio=round(float(emp[-1] / theo[-1]), 2),   # >1 => fatter than Gaussian
    )


def chart(pair, e, s):
    fig, ax = plt.subplots(1, 2, figsize=(13.5, 5.2))
    # (1) survival on semilog-y: empirical vs half-normal
    xs = np.linspace(0, max(4.5, np.quantile(e, 0.999)), 300)
    emp_sf = np.array([(e >= x).mean() for x in xs])
    ax[0].semilogy(xs, erfc(xs / np.sqrt(2)), color='#555', lw=2, ls='--',
                   label='half-normal (driftless BM)')
    ax[0].semilogy(xs, np.clip(emp_sf, 1e-5, 1), color='#d62728', lw=1.8, label='empirical')
    for c, lab, col in [(HN_MED, 'O-C med 0.67σ', '#2ca02c'),
                        (FELLER_HL_MED, 'Feller H-L med 1.57σ', '#e08214')]:
        ax[0].axvline(c, color=col, lw=1.2, ls=':', label=lab)
    ax[0].set_xlabel('one-sided excursion from open (σ)'); ax[0].set_ylabel('P(excursion ≥ x)')
    ax[0].set_ylim(1e-4, 1); ax[0].set_title(f'{pair} — tail vs reflection-principle envelope')
    ax[0].legend(fontsize=8)
    # (2) QQ vs half-normal
    n = e.size
    p = (np.arange(1, n + 1) - 0.5) / n
    theo_q = norm.ppf((1 + p) / 2)
    emp_q = np.sort(e)
    idx = np.linspace(0, n - 1, 2000).astype(int)     # thin for plotting
    ax[1].scatter(theo_q[idx], emp_q[idx], s=6, alpha=.4, color='#1f77b4')
    lim = max(theo_q[idx].max(), 4)
    ax[1].plot([0, lim], [0, lim], 'k--', lw=1, label='match (45°)')
    ax[1].set_xlabel('half-normal quantile (σ)'); ax[1].set_ylabel('empirical quantile (σ)')
    ax[1].set_title(f'{pair} — QQ: tail above 45° = fatter than Gaussian\n'
                    f'99th emp {s["q"]["0.99"]}σ vs theo {s["q_theo"]["0.99"]}σ '
                    f'(×{s["tail99_ratio"]})')
    ax[1].legend(fontsize=8.5)
    fig.tight_layout(); p_ = os.path.join(CH, f'{pair}_11_evt_envelope.png')
    fig.savefig(p_); plt.close(fig)


if __name__ == '__main__':
    pairs = sys.argv[1:] or ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'NQ']
    res = {}
    print(f'{"pair":7} {"n":>6} {"medEmp/Th":>11} {"meanEmp/Th":>11} '
          f'{"95th E/T":>11} {"99th E/T":>11} {"tail×":>6}')
    for p in pairs:
        e = excursions(p); s = summarize(p, e); res[p] = s; chart(p, e, s)
        print(f'{p:7} {s["n"]:>6} {s["median_emp"]:.2f}/{s["median_theo"]:.2f}   '
              f'{s["mean_emp"]:.2f}/{s["mean_theo"]:.2f}   '
              f'{s["q"]["0.95"]:.2f}/{s["q_theo"]["0.95"]:.2f}   '
              f'{s["q"]["0.99"]:.2f}/{s["q_theo"]["0.99"]:.2f}  {s["tail99_ratio"]:>5.2f}')
    with open(os.path.join(HERE, 'evt_envelope_summary.json'), 'w') as f:
        json.dump(res, f, indent=2)
    print('\nevt_envelope_summary.json written.  tail× = 99th empirical / half-normal (>1 = fatter).')
