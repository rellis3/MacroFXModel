"""Release Reaction schedule, part 2: the events with no US headline number. ECB, BoE and BoJ rate decisions, UK Budgets / fiscal statements and US Treasury quarterly refundings.
Hand-kept lists, checked against the banks' own calendars (js/ecbCalendar.js, js/boeCalendar.js, js/bojCalendar.js for 2026-27; the surprise store for 2024-25 dates) and the fiscal
study's event list (scripts/fiscal-event-reaction/events.mjs, js/fiscalEvents.js). Add each new meeting / Budget / refunding here as well as there.
Times, by rule rather than from the vendor feed (the feed's ECB and BoE times are an hour out on several winter dates):
  ECB   14:15 Frankfurt (the monetary policy statement; the press conference follows at 14:45)
  BoE   12:00 London
  BoJ   no fixed time: the statement lands when the meeting ends, usually 02:30-04:00 UTC. The minute is taken from USD/JPY: the largest 1-minute move between 01:30 and 05:30 UTC
        on the decision day (boj_time below). Against the 4 times the vendor recorded to the minute in 2024-25: the two winter ones match (02:52 exactly, 02:25 vs 02:30), the two
        summer ones are exactly one hour later than the vendor, the same daylight-saving error the vendor shows on its ECB and BoE stamps (see LAYER1_CHECKS.md). When the largest
        move is less than 1.3x the second largest the minute is marked weak. Because the minute is chosen by the move, the BoJ "clock" check is circular and the size of the first
        minute is flattered; the 30-minute and later numbers are not.
  UK fiscal  the clock in the fiscal study (12:30 London unless the statement started elsewhere; Budget 2025 at 11:40, when the OBR outlook was published early)
  US refunding  08:30 New York
"""
import numpy as np, pandas as pd

ECB = ['2024-04-11', '2024-06-06', '2024-07-18', '2024-09-12', '2024-10-17', '2024-12-12', '2025-01-30', '2025-03-06', '2025-04-17', '2025-06-05', '2025-07-24', '2025-09-11',
       '2025-10-30', '2025-12-18', '2026-02-05', '2026-03-19', '2026-04-30', '2026-06-11', '2026-07-23', '2026-09-10', '2026-10-29', '2026-12-17']
BOE = ['2024-05-09', '2024-06-20', '2024-08-01', '2024-09-19', '2024-11-07', '2024-12-19', '2025-02-06', '2025-03-20', '2025-05-08', '2025-06-19', '2025-08-07', '2025-09-18',
       '2025-11-06', '2025-12-18', '2026-02-05', '2026-03-19', '2026-04-30', '2026-06-18', '2026-07-30', '2026-09-17', '2026-11-05', '2026-12-17']
BOJ = ['2024-04-26', '2024-06-14', '2024-07-31', '2024-09-20', '2024-10-31', '2024-12-19', '2025-01-24', '2025-03-19', '2025-05-01', '2025-06-17', '2025-07-31', '2025-09-19',
       '2025-10-30', '2025-12-19', '2026-01-23', '2026-03-19', '2026-04-28', '2026-06-16', '2026-07-31', '2026-09-18', '2026-10-30', '2026-12-18']
UK_FISCAL = [('2024-10-30', 'Autumn Budget 2024', '12:30'), ('2025-03-26', 'Spring Statement 2025', '12:30'), ('2025-11-26', 'Budget 2025', '11:40'),
             ('2026-03-03', 'Spring Forecast 2026', '12:30'), ('2026-10-28', 'Budget 2026', '12:30')]
REFUNDING = ['2024-05-01', '2024-07-31', '2024-10-30', '2025-02-05', '2025-04-30', '2025-07-30', '2025-11-05', '2026-02-04', '2026-05-06', '2026-08-05', '2026-11-04']
NAMES = {'ECB': 'ECB rate decision', 'BOE': 'BoE rate decision', 'BOJ': 'BoJ rate decision', 'UKFISCAL': 'UK Budget / statement', 'REFUNDING': 'US Treasury refunding'}
BOJ_VENDOR = {'2024-06-14': '02:23', '2024-09-20': '01:52', '2024-12-19': '02:52', '2025-03-19': '02:25'}      # the surprise store's to-the-minute UTC stamps (2024-25), used only as a check


def _at(date, hhmm, tz):
    return pd.Timestamp(f'{date} {hhmm}', tz=tz).tz_convert('UTC')


def boj_time(date, usdjpy=None):
    """UTC instant of a BoJ statement: the start of the largest 1-minute USD/JPY move, 01:30-05:30 UTC on the day; 03:00 UTC when no 1-minute data covers it (a meeting ahead)"""
    if usdjpy is not None:
        a, b = pd.Timestamp(f'{date} 01:30', tz='UTC'), pd.Timestamp(f'{date} 05:30', tz='UTC')
        x = usdjpy[(usdjpy.index >= a - pd.Timedelta(minutes=1)) & (usdjpy.index <= b)]
        if len(x) > 120:
            d = np.log(x).diff().abs().dropna()
            if len(d) > 1 and d.max() > 0:
                top = d.nlargest(2); weak = top.iloc[0] < 1.3 * top.iloc[1]
                return d.idxmax(), 'from USD/JPY' + (' (weak: the largest move is not distinct)' if weak else '')
    return pd.Timestamp(f'{date} 03:00', tz='UTC'), 'placeholder 03:00 UTC'


def cb_events(usdjpy=None):
    out = []
    for d in ECB: out.append(dict(t=_at(d, '14:15', 'Europe/Berlin'), family='ECB', name=NAMES['ECB'], timing='14:15 Frankfurt'))
    for d in BOE: out.append(dict(t=_at(d, '12:00', 'Europe/London'), family='BOE', name=NAMES['BOE'], timing='12:00 London'))
    for d in BOJ:
        t, how = boj_time(d, usdjpy); out.append(dict(t=t, family='BOJ', name=NAMES['BOJ'], timing=how))
    for d, nm, hh in UK_FISCAL: out.append(dict(t=_at(d, hh, 'Europe/London'), family='UKFISCAL', name=nm, timing=f'{hh} London'))
    for d in REFUNDING: out.append(dict(t=_at(d, '08:30', 'America/New_York'), family='REFUNDING', name=NAMES['REFUNDING'], timing='08:30 New York'))
    now = pd.Timestamp.now(tz='UTC')
    for e in out: e.update(actual=None, consensus=None, status='upcoming' if e['t'] > now else 'history')
    return out
