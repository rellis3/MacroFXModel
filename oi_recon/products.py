"""Instrument registry for the OI recon — which venue actually lists each chain.

Mirrors `OI_CME_PAIRS` in js/oi.js (13 instruments), but adds the thing the JS
list deliberately blurs: that set is "has a listed options market", not "is on
CME". FDAX options are Eurex and FTSE100 options are ICE — no cmegroup.com URL
will ever return them, so the recon marks them out of scope rather than
reporting a 404 as if it were a failure of the script.

`slug` is the cmegroup.com product page path used to DISCOVER the real data
endpoints — it is a starting point for navigation, not an assertion that the
path is current. Recon records the HTTP status for each so wrong slugs surface
as data instead of as exceptions.
"""

# venue: 'CME' | 'EUREX' | 'ICE'
# slug:  path under https://www.cmegroup.com/markets/ (CME only)
PRODUCTS = [
    # ── FX (G10) ─────────────────────────────────────────────────────────────
    dict(sym='EUR/USD',    venue='CME',   fut='6E', slug='fx/g10/euro-fx',
         note='the fixture pair — recon output for this one is diffable against js/fixtures/'),
    dict(sym='GBP/USD',    venue='CME',   fut='6B', slug='fx/g10/british-pound'),
    dict(sym='USD/JPY',    venue='CME',   fut='6J', slug='fx/g10/japanese-yen',
         note='CME quotes JPY/USD — strikes are the INVERSE of the OANDA pair'),
    dict(sym='AUD/USD',    venue='CME',   fut='6A', slug='fx/g10/australian-dollar'),
    dict(sym='USD/CAD',    venue='CME',   fut='6C', slug='fx/g10/canadian-dollar',
         note='CME quotes CAD/USD — inverse, same trap as JPY'),
    dict(sym='USD/CHF',    venue='CME',   fut='6S', slug='fx/g10/swiss-franc',
         note='CME quotes CHF/USD — inverse'),

    # ── Metals ───────────────────────────────────────────────────────────────
    dict(sym='XAU/USD',    venue='CME',   fut='GC', slug='metals/precious/gold',
         note='924-strike ladder per CLAUDE.md — the paste-size ceiling case'),

    # ── Equity index ─────────────────────────────────────────────────────────
    dict(sym='NAS100_USD', venue='CME',   fut='NQ', slug='equities/nasdaq/nasdaq-100'),
    dict(sym='SPX500_USD', venue='CME',   fut='ES', slug='equities/sp/e-mini-sandp-500'),
    dict(sym='US30_USD',   venue='CME',   fut='YM', slug='equities/dow-jones/e-mini-dow'),
    dict(sym='US2000_USD', venue='CME',   fut='RTY', slug='equities/russell/e-mini-russell-2000'),

    # ── NOT CME — no cmegroup.com endpoint exists for these ───────────────────
    dict(sym='DE30_USD',   venue='EUREX', fut='FDAX', slug=None,
         note='FDAX options are Eurex. Separate source (eurex.com public data) — out of CME scope'),
    dict(sym='UK100_GBP',  venue='ICE',   fut='Z',    slug=None,
         note='FTSE100 options are ICE Futures Europe. Out of CME scope'),
]

CME_PRODUCTS = [p for p in PRODUCTS if p['venue'] == 'CME']


def by_symbol(sym):
    for p in PRODUCTS:
        if p['sym'] == sym:
            return p
    return None
