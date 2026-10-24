"""Market universe for the weekly review: each market, its textbook drivers and how to read them.

A driver is (series_key, expected_sign, why). expected_sign is the textbook sign of the correlation between
the market's daily move and the driver's daily move (+1 / -1). The build script compares the recent
correlation with this sign to say whether the market is trading "textbook", "inverted" or "disconnected"
from each driver, and which driver is currently in charge (the podcast's "which story is the market trading").

Series keys are Yahoo symbols or derived keys built in build.py (US2Y, US_EA2, FR_DE, HYG_TLT, ...).
cot: (dataset, CFTC market name before ' - ', sign) where sign=+1 if a long futures position is long THIS
market as quoted (long EUR futures = long EURUSD) and -1 if it is short it (long JPY futures = short USDJPY).
asia=True marks markets that close before New York, so same-date correlation with US drivers uses the
previous US day (otherwise the US move lands on the next Asian session and the correlation is understated).
"""

FX = {
    'EURUSD': dict(sym='EURUSD=X', group='G10 FX', ccys=['EUR', 'USD'], banks=['ECB', 'Fed'],
        drivers=[('US_EA2', -1, 'US-euro 2y rate gap: wider = USD-positive'),
                 ('US_DE10', -1, 'US-German 10y gap'),
                 ('FR_DE', -1, 'French spread (fiscal stress): wider = EUR-negative'),
                 ('^STOXX50E', +1, 'Euro equities / euro-area growth'),
                 ('BZ=F', -1, 'Oil: Europe imports energy (terms of trade)')],
        cot=('tff', 'EURO FX', +1)),
    'USDJPY': dict(sym='USDJPY=X', group='G10 FX', ccys=['JPY', 'USD'], banks=['BoJ', 'Fed'],
        drivers=[('US10Y', +1, 'US yields: the carry engine'),
                 ('US_JP10', +1, 'US-Japan 10y gap'),
                 ('^NDX', +1, 'Risk appetite: carry trades fund in yen'),
                 ('^VIX', -1, 'Stress: yen repatriation / hedge demand')],
        cot=('tff', 'JAPANESE YEN', -1)),
    'GBPUSD': dict(sym='GBPUSD=X', group='G10 FX', ccys=['GBP', 'USD'], banks=['BoE', 'Fed'],
        drivers=[('US_GB10', -1, 'US-gilt 10y gap'),
                 ('GB10Y', +1, 'Gilt yields: + if growth/BoE, - if fiscal-stress selloff ("release valve")'),
                 ('^GSPC', +1, 'Global risk appetite'),
                 ('EURUSD=X', +1, 'European block move')],
        cot=('tff', 'BRITISH POUND', +1)),
    'USDCAD': dict(sym='USDCAD=X', group='G10 FX', ccys=['CAD', 'USD'], banks=['BoC', 'Fed'],
        drivers=[('CL=F', -1, 'Oil: Canada exports it (terms of trade)'),
                 ('US_CA2', +1, 'US-Canada 2y rate gap'),
                 ('^GSPC', -1, 'Risk appetite (CAD is pro-cyclical)')],
        cot=('tff', 'CANADIAN DOLLAR', -1)),
    'AUDUSD': dict(sym='AUDUSD=X', group='G10 FX', ccys=['AUD', 'USD'], banks=['RBA', 'Fed'],
        drivers=[('HG=F', +1, 'Copper: China / metals demand'),
                 ('USDCNH=X', -1, 'China currency'),
                 ('^NDX', +1, 'Global risk proxy'),
                 ('GC=F', +1, 'Gold: Australian export')],
        cot=('tff', 'AUSTRALIAN DOLLAR', +1)),
    'NZDUSD': dict(sym='NZDUSD=X', group='G10 FX', ccys=['NZD', 'USD'], banks=['RBNZ', 'Fed'],
        drivers=[('AUDUSD=X', +1, 'Antipodean block'),
                 ('^GSPC', +1, 'Global risk proxy'),
                 ('US2Y', -1, 'US front end')],
        cot=('tff', 'NZ DOLLAR', +1)),
    'USDCHF': dict(sym='USDCHF=X', group='G10 FX', ccys=['CHF', 'USD'], banks=['SNB', 'Fed'],
        drivers=[('US10Y', +1, 'US yields'),
                 ('^VIX', -1, 'Safe haven: CHF up in stress'),
                 ('GC=F', -1, 'Gold / haven complex')],
        cot=('tff', 'SWISS FRANC', -1)),
    'AUDNZD': dict(sym='AUDNZD=X', group='G10 crosses', ccys=['AUD', 'NZD'], banks=['RBA', 'RBNZ'],
        drivers=[('HG=F', +1, 'Metals (AUD) vs dairy (NZD)'), ('^AXJO', +1, 'Australian equities')], cot=None),
    'EURGBP': dict(sym='EURGBP=X', group='G10 crosses', ccys=['EUR', 'GBP'], banks=['ECB', 'BoE'],
        drivers=[('GB10Y', -1, 'Gilt yields (BoE / UK fiscal)'), ('FR_DE', -1, 'Euro fiscal stress')], cot=None),
    'EURCHF': dict(sym='EURCHF=X', group='G10 crosses', ccys=['EUR', 'CHF'], banks=['ECB', 'SNB'],
        drivers=[('^STOXX50E', +1, 'European risk appetite'), ('FR_DE', -1, 'Euro fiscal stress'), ('^VIX', -1, 'Haven flows')], cot=None),
}
EM = {
    'USDMXN': dict(sym='USDMXN=X', group='EM FX', ccys=['MXN', 'USD'], banks=['Banxico', 'Fed'],
        drivers=[('^VIX', +1, 'Carry unwinds when vol rises'), ('^GSPC', -1, 'US growth / risk'),
                 ('CL=F', -1, 'Oil'), ('USDBRL=X', +1, 'LatAm carry block')],
        cot=('tff', 'MEXICAN PESO', -1)),
    'USDBRL': dict(sym='USDBRL=X', group='EM FX', ccys=['BRL', 'USD'], banks=['BCB', 'Fed'],
        drivers=[('^VIX', +1, 'Carry / risk'), ('HG=F', -1, 'Commodities (iron ore not available; copper as proxy)'),
                 ('EWZ', -1, 'Brazil equities (local flows)')],
        cot=('tff', 'BRAZILIAN REAL', -1)),
    'USDCNH': dict(sym='USDCNH=X', group='EM FX', ccys=['CNY', 'USD'], banks=['PBoC', 'Fed'],
        drivers=[('DX-Y.NYB', +1, 'Broad dollar'), ('^HSI', -1, 'China equities'), ('HG=F', -1, 'China demand')], cot=None),
    'USDZAR': dict(sym='USDZAR=X', group='EM FX', ccys=['ZAR', 'USD'], banks=['SARB', 'Fed'],
        drivers=[('GC=F', -1, 'Gold / precious metals exporter'), ('^VIX', +1, 'Carry / risk'), ('HG=F', -1, 'Metals')],
        cot=('tff', 'SO AFRICAN RAND', -1)),
    'USDKRW': dict(sym='USDKRW=X', group='EM FX', ccys=['KRW', 'USD'], banks=['BoK', 'Fed'],
        drivers=[('^KS11', -1, 'KOSPI (chip exporters)'), ('SOXX', -1, 'Global semis cycle'), ('DX-Y.NYB', +1, 'Broad dollar')], cot=None),
    'EURCZK': dict(sym='EURCZK=X', group='CE3 FX', ccys=['CZK', 'EUR'], banks=['CNB', 'ECB'],
        drivers=[('^STOXX50E', -1, 'European risk (CZK pro-cyclical)'), ('EURPLN=X', +1, 'CE3 block')], cot=None),
    'EURPLN': dict(sym='EURPLN=X', group='CE3 FX', ccys=['PLN', 'EUR'], banks=['NBP', 'ECB'],
        drivers=[('^STOXX50E', -1, 'European risk'), ('^VIX', +1, 'Risk')], cot=None),
}
INDICES = {
    'S&P 500': dict(sym='^GSPC', group='Equities', ccys=['USD'], banks=['Fed'],
        drivers=[('US10Y', -1, 'Discount rate (sign flips to + in a growth scare: bonds hedge)'),
                 ('HYG_TLT', +1, 'Credit appetite'), ('DX-Y.NYB', -1, 'Dollar / financial conditions'),
                 ('CL=F', -1, 'Oil as a growth tax'), ('^VIX', -1, 'Vol')],
        cot=('tff', 'E-MINI S&P 500', +1)),
    'Nasdaq 100': dict(sym='^NDX', group='Equities', ccys=['USD'], banks=['Fed'],
        drivers=[('US10Y', -1, 'Long-duration growth stocks vs yields'), ('SOXX', +1, 'Semis / AI capex'),
                 ('HYG_TLT', +1, 'Credit (AI funding)'), ('BTC-USD', +1, 'Liquidity / speculation')],
        cot=('tff', 'NASDAQ MINI', +1)),
    'Russell 2000': dict(sym='^RUT', group='Equities', ccys=['USD'], banks=['Fed'],
        drivers=[('US2Y', -1, 'Small caps borrow floating: front-end sensitive'), ('HYG_TLT', +1, 'Credit'), ('^GSPC', +1, 'Beta')], cot=None),
    'Euro Stoxx 50': dict(sym='^STOXX50E', group='Equities', ccys=['EUR'], banks=['ECB'],
        drivers=[('FR_DE', -1, 'Euro fiscal stress / banks'), ('^GSPC', +1, 'US lead'), ('BZ=F', -1, 'Energy importer'), ('EURUSD=X', -1, 'Exporters vs stronger euro')], cot=None),
    'CAC 40': dict(sym='^FCHI', group='Equities', ccys=['EUR'], banks=['ECB'],
        drivers=[('FR_DE', -1, 'French spread'), ('^STOXX50E', +1, 'European block')], cot=None),
    'DAX': dict(sym='^GDAXI', group='Equities', ccys=['EUR'], banks=['ECB'],
        drivers=[('DE10Y', -1, 'Bund yields'), ('^GSPC', +1, 'Global risk'), ('USDCNH=X', -1, 'China demand')], cot=None),
    'FTSE 100': dict(sym='^FTSE', group='Equities', ccys=['GBP'], banks=['BoE'],
        drivers=[('BZ=F', +1, 'Energy-heavy index'), ('GBPUSD=X', -1, 'Dollar earners'), ('GB10Y', -1, 'Gilts')], cot=None),
    'Nikkei 225': dict(sym='^N225', group='Equities', ccys=['JPY'], banks=['BoJ'], asia=True,
        drivers=[('USDJPY=X', +1, 'Weaker yen lifts exporters'), ('^NDX', +1, 'US tech lead (prior US day)'), ('SOXX', +1, 'Chips (prior US day)')], cot=None),
    'KOSPI': dict(sym='^KS11', group='Equities', ccys=['KRW'], banks=['BoK'], asia=True,
        drivers=[('SOXX', +1, 'Memory / AI hardware (prior US day)'), ('^NDX', +1, 'US tech (prior US day)')], cot=None),
    'Hang Seng': dict(sym='^HSI', group='Equities', ccys=['HKD', 'CNY'], banks=['PBoC'], asia=True,
        drivers=[('USDCNH=X', -1, 'China currency'), ('^NDX', +1, 'US tech (prior US day)')], cot=None),
    'ASX 200': dict(sym='^AXJO', group='Equities', ccys=['AUD'], banks=['RBA'], asia=True,
        drivers=[('HG=F', +1, 'Miners'), ('^GSPC', +1, 'US lead (prior US day)')], cot=None),
}
RATES = {
    'US 2y': dict(sym='US2Y', kind='yield', group='Rates', ccys=['USD'], banks=['Fed'],
        drivers=[('CL=F', +1, 'Oil -> headline inflation -> Fed (flips - in a growth scare)'), ('^GSPC', +1, 'Risk-on = fewer cuts / more hikes')],
        cot=('tff', 'UST 2Y NOTE', -1)),
    'US 10y': dict(sym='US10Y', kind='yield', group='Rates', ccys=['USD'], banks=['Fed'],
        drivers=[('CL=F', +1, 'Oil / inflation channel (- = growth-scare channel)'), ('^NDX', -1, 'Textbook: yields up hurt stocks; + means bonds hedge stocks'),
                 ('T10YIE', +1, 'Inflation expectations'), ('DE10Y', +1, 'Global duration')],
        cot=('tff', 'UST 10Y NOTE', -1)),
    'US 30y': dict(sym='US30Y', kind='yield', group='Rates', ccys=['USD'], banks=['Fed'],
        drivers=[('US2Y', +1, 'Front end'), ('T10YIE', +1, 'Inflation / term premium')], cot=('tff', 'UST BOND', -1)),
    'Bund 10y': dict(sym='DE10Y', kind='yield', group='Rates', ccys=['EUR'], banks=['ECB'],
        drivers=[('US10Y', +1, 'US spillover'), ('BZ=F', +1, 'Energy inflation'), ('FR_DE', -1, 'Flight to quality from France')], cot=None),
    'Gilt 10y': dict(sym='GB10Y', kind='yield', group='Rates', ccys=['GBP'], banks=['BoE'],
        drivers=[('US10Y', +1, 'US spillover'), ('GBPUSD=X', -1, '+ = growth/BoE; - = fiscal "release valve" selloff')], cot=None),
    'JGB 10y': dict(sym='JP10Y', kind='yield', group='Rates', ccys=['JPY'], banks=['BoJ'], asia=True,
        drivers=[('US10Y', +1, 'Global duration'), ('USDJPY=X', +1, 'Weak yen -> BoJ pressure')], cot=None),
    'Canada 10y': dict(sym='CA10Y', kind='yield', group='Rates', ccys=['CAD'], banks=['BoC'],
        drivers=[('US10Y', +1, 'US spillover'), ('CL=F', +1, 'Oil')], cot=None),
    'French spread (proxy)': dict(sym='FR_DE', kind='yield', group='Rates', ccys=['EUR'], banks=['ECB'],
        drivers=[('IT_DE', +1, 'Contagion: Italy moving with France?'), ('^STOXX50E', -1, 'European risk')], cot=None),
}
COMMODITIES = {
    'WTI crude': dict(sym='CL=F', group='Commodities', ccys=['USD'], banks=[],
        drivers=[('XLE', +1, 'Energy equities (do they believe the move?)'), ('^GSPC', +1, 'Demand (- = supply shock)'), ('HG=F', +1, 'Growth metals: + demand story, - supply story'), ('DX-Y.NYB', -1, 'Dollar')],
        cot=('disagg', 'WTI-PHYSICAL', +1)),
    'Gold': dict(sym='GC=F', group='Commodities', ccys=['USD'], banks=['Fed'],
        drivers=[('DFII10', -1, 'Real yields (textbook)'), ('DX-Y.NYB', -1, 'Dollar'), ('SI=F', +1, 'Precious block'), ('BTC-USD', +1, 'Debasement / liquidity trade')],
        cot=('disagg', 'GOLD', +1)),
    'Silver': dict(sym='SI=F', group='Commodities', ccys=['USD'], banks=[],
        drivers=[('GC=F', +1, 'Gold'), ('HG=F', +1, 'Industrial demand')], cot=('disagg', 'SILVER', +1)),
    'Copper': dict(sym='HG=F', group='Commodities', ccys=['USD', 'CNY'], banks=[],
        drivers=[('USDCNH=X', -1, 'China'), ('^GSPC', +1, 'Global growth')], cot=('disagg', 'COPPER- #1', +1)),
    'Nat gas (US)': dict(sym='NG=F', group='Commodities', ccys=['USD'], banks=[],
        drivers=[('CL=F', +1, 'Energy complex')], cot=('disagg', 'NAT GAS NYME', +1)),
}
CRYPTO = {
    'Bitcoin': dict(sym='BTC-USD', group='Crypto', ccys=['USD'], banks=['Fed'],
        drivers=[('^NDX', +1, 'Tech / speculation'), ('DX-Y.NYB', -1, 'Dollar liquidity'), ('GC=F', +1, 'Debasement trade')],
        cot=('tff', 'BITCOIN', +1)),
}
UNIVERSE = {**FX, **EM, **INDICES, **RATES, **COMMODITIES, **CRYPTO}

# Cross-market regime gauges: the podcast's "which story is the market trading" in one table.
# (a, b, textbook_sign, what a flip means)
REGIME_PAIRS = [
    ('CL=F', 'US10Y', +1, 'Oil vs yields: + = oil is an inflation story; - = oil is a growth tax (2008-style)'),
    ('^NDX', 'US10Y', -1, 'Stocks vs yields: - = rates drive stocks; + = growth scare, bonds hedge stocks'),
    ('HYG_TLT', '^NDX', +1, 'Credit vs tech: high + = credit and equities are one trade (credit stress leading)'),
    ('DX-Y.NYB', '^GSPC', -1, 'Dollar vs stocks: - = safe-haven dollar; ~0/+ = "sell America" or liquidity dash'),
    ('AUDUSD=X', '^NDX', +1, 'Aussie vs tech: near 0 = AUD trading commodities not risk'),
    ('GC=F', 'DFII10', -1, 'Gold vs real yields: near 0/+ = gold trading liquidity or debasement, not rates'),
    ('BTC-USD', '^NDX', +1, 'Bitcoin vs tech: high = one liquidity complex'),
    ('XLE', 'CL=F', +1, 'Energy stocks vs oil: falling = equity investors fade the oil move'),
    ('USDJPY=X', 'US10Y', +1, 'Yen vs yields: high = yen is a pure rates trade'),
    ('FR_DE', 'IT_DE', +1, 'France vs Italy spreads: high = euro-periphery contagion, low = France-specific'),
]

# Nasdaq calendar country -> currency, for the "what's on the calendar" section.
COUNTRY_CCY = {'United States': 'USD', 'Euro Zone': 'EUR', 'Germany': 'EUR', 'France': 'EUR', 'Italy': 'EUR', 'Spain': 'EUR',
               'Japan': 'JPY', 'United Kingdom': 'GBP', 'Canada': 'CAD', 'Australia': 'AUD', 'New Zealand': 'NZD',
               'Switzerland': 'CHF', 'China': 'CNY', 'Mexico': 'MXN', 'Brazil': 'BRL', 'South Africa': 'ZAR',
               'South Korea': 'KRW', 'Czech Republic': 'CZK', 'Poland': 'PLN', 'Hong Kong': 'HKD'}
