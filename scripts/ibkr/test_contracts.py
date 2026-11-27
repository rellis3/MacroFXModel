"""Tests for the IBKR contract registry and the continuous builder (scripts/ibkr/contracts.py, continuous.py). No network, no files.
    python scripts/ibkr/test_contracts.py        (or: python -m pytest scripts/ibkr/test_contracts.py)"""
import datetime as dt
import sys
import unittest
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / 'scripts' / 'rates_line'))
import contracts as K       # noqa: E402
import continuous as C      # noqa: E402

D = dt.date

# refresh_leg_bars.IB_SPEC exactly as it was on main before the registry (2026-11-27): the registry must reproduce it
OLD_IB_SPEC = {
    'SR3U6': ('SOFR3', 'CME', 'USD', '202609'), 'SR3Z6': ('SOFR3', 'CME', 'USD', '202612'), 'SR3H7': ('SOFR3', 'CME', 'USD', '202703'),
    'IH7': ('I', 'ICEEU', 'EUR', '202703'), 'IZ6': ('I', 'ICEEU', 'EUR', '202612'), 'ER3Z6': ('ER3', 'ICEEU', 'EUR', '202612'), 'ER3H7': ('ER3', 'ICEEU', 'EUR', '202703'),
    'SR3M7': ('SOFR3', 'CME', 'USD', '202706'), 'SR3U7': ('SOFR3', 'CME', 'USD', '202709'), 'IM7': ('I', 'ICEEU', 'EUR', '202706'), 'IU7': ('I', 'ICEEU', 'EUR', '202709'),
    'ER3U6': ('ER3', 'ICEEU', 'EUR', '202609'), 'ER3M7': ('ER3', 'ICEEU', 'EUR', '202706'), 'ER3U7': ('ER3', 'ICEEU', 'EUR', '202709'),
    'ZQV6': ('ZQ', 'CBOT', 'USD', '202610'), 'ZQX6': ('ZQ', 'CBOT', 'USD', '202611'), 'ZQZ6': ('ZQ', 'CBOT', 'USD', '202612'), 'ZQF7': ('ZQ', 'CBOT', 'USD', '202701'), 'ZQH7': ('ZQ', 'CBOT', 'USD', '202703'),
    'ZTZ6': ('ZT', 'CBOT', 'USD', '202612'), 'ZFZ6': ('ZF', 'CBOT', 'USD', '202612'), 'ZNZ6': ('ZN', 'CBOT', 'USD', '202612'),
    'ZBZ6': ('ZB', 'CBOT', 'USD', '202612'), 'UBZ6': ('UB', 'CBOT', 'USD', '202612'),
    'FGBS2612': ('GBS', 'EUREX', 'EUR', '202612'), 'FGBM2612': ('GBM', 'EUREX', 'EUR', '202612'), 'FGBL2612': ('GBL', 'EUREX', 'EUR', '202612'), 'FGBX2612': ('GBX', 'EUREX', 'EUR', '202612'),
    'FBTP2612': ('BTP', 'EUREX', 'EUR', '202612'), 'FOAT2612': ('OAT', 'EUREX', 'EUR', '202612'), 'DXZ6': ('DX', 'NYBOT', 'USD', '202612'),
    'VXX6': ('VIX', 'CFE', 'USD', '202611'), 'VXZ6': ('VIX', 'CFE', 'USD', '202612'),
    'VVIX': ('VVIX', 'CBOE', 'USD', 'IND'), 'VIX': ('VIX', 'CBOE', 'USD', 'IND'), 'VXN': ('VXN', 'CBOE', 'USD', 'IND'),
    'NQZ6': ('NQ', 'CME', 'USD', '202612'),
    '6EZ6': ('EUR', 'CME', 'USD', '202612'), '6BZ6': ('GBP', 'CME', 'USD', '202612'), '6JZ6': ('JPY', 'CME', 'USD', '202612'), 'GCZ6': ('GC', 'COMEX', 'USD', '202612'), 'ESZ6': ('ES', 'CME', 'USD', '202612'),
}
# every stem in analysis/output/stir_1m_deep on 2026-11-27 (the files the 30-minute job writes into): must be reproduced, never orphaned
DEEP_STEMS = ['CBOE_VIX', 'CBOE_VVIX', 'CBOE_VXN', 'CBOT_UBZ6', 'CBOT_ZBZ6', 'CBOT_ZFZ6', 'CBOT_ZNZ6', 'CBOT_ZQF7', 'CBOT_ZQH7', 'CBOT_ZQV6', 'CBOT_ZQX6', 'CBOT_ZQZ6',
              'CBOT_ZTZ6', 'CFE_VXX6', 'CFE_VXZ6', 'CME_6BZ6', 'CME_6EZ6', 'CME_6JZ6', 'CME_ESZ6', 'CME_NQZ6', 'CME_SR3H7', 'CME_SR3M7', 'CME_SR3U6', 'CME_SR3U7', 'CME_SR3Z6',
              'COMEX_GCZ6', 'EUREX_FBTP2612', 'EUREX_FGBL_20261208_M', 'EUREX_FGBM_20261208_M', 'EUREX_FGBS_20261208_M', 'EUREX_FGBX_20261208_M', 'EUREX_FOAT2612',
              'ICEEU_ER3H7', 'ICEEU_ER3M7', 'ICEEU_ER3U6', 'ICEEU_ER3U7', 'ICEEU_ER3Z6', 'ICEEU_IH7', 'ICEEU_IM7', 'ICEEU_IU7', 'ICEEU_IZ6', 'NYBOT_DXZ6']


def row(local, ltd, month, tc=''):
    return dict(local=local, ltd=ltd, month=month, tc=tc)


class Selection(unittest.TestCase):
    def test_vix_drops_weeklies_expired_and_keeps_depth(self):
        rows = [row('VXX6', '20261118', '202611', 'VX'), row('VX48Z6', '20261201', '202612', 'VX48'), row('VXZ6', '20261216', '202612', 'VX'),
                row('VXG7', '20270217', '202702', 'VX'), row('VXF7', '20270120', '202701', 'VX'), row('VXH7', '20270317', '202703', 'VX')]
        got = K.select_live('VX', rows, D(2026, 11, 27))
        self.assertEqual([x['local'] for x in got], ['VXZ6', 'VXF7', 'VXG7'])      # weekly VX48 and expired VXX6 out, sorted by expiry, depth 3
        self.assertEqual(got[0]['stem'], 'CFE_VXZ6')

    def test_quarterly_cycle_and_ice_timestamp(self):
        rows = [row('IZ6', '20261214 10:00:00 GB', '202612', 'I'), row('IF7', '20270118 10:00:00 GB', '202701', 'I'), row('IH7', '20270315 10:00:00 GB', '202703', 'I'),
                row('IM7', '20270614 10:00:00 GB', '202706', 'I'), row('IX6', '20261116 10:00:00 GB', '202611', 'I')]
        got = K.select_live('I', rows, D(2026, 11, 27), depth=3)
        self.assertEqual([x['name'] for x in got], ['IZ6', 'IH7', 'IM7'])      # serial IF7 off-cycle, IX6 expired
        self.assertEqual(got[0]['ltd_date'], D(2026, 12, 14))

    def test_gold_cycle_and_eurex_local_stem(self):
        g = K.select_live('GC', [row('GCZ6', '20261229', '202612'), row('GCF7', '20270127', '202701'), row('GCG7', '20270224', '202702'), row('GCX6', '20261125', '202611')], D(2026, 11, 27))
        self.assertEqual([x['name'] for x in g], ['GCZ6', 'GCG7'])
        b = K.select_live('GBL', [row('FGBL 20270308 M', '20270308', '202703', 'FGBL'), row('FGBL 20261208 M', '20261208', '202612', 'FGBL')], D(2026, 11, 27))
        self.assertEqual([x['stem'] for x in b], ['EUREX_FGBL_20261208_M', 'EUREX_FGBL_20270308_M'])
        self.assertEqual([x['stem'] for x in b], [x['local'].replace(' ', '_').join(['EUREX_', '']) for x in b])      # = IBKR's local symbol

    def test_last_trade_day_is_still_live(self):
        got = K.select_live('ZQ', [row('ZQX6', '20261130', '202611'), row('ZQZ6', '20261231', '202612')], D(2026, 11, 30))
        self.assertEqual(got[0]['name'], 'ZQX6')

    def test_pull_set_roll_window(self):
        zn = K.select_live('ZN', [row('ZNZ6', '20261221', '202612'), row('ZNH7', '20270319', '202703'), row('ZNM7', '20270621', '202706')], D(2026, 11, 27))
        self.assertEqual(K.active_index('ZN', zn, D(2026, 11, 27)), 1)                                  # ZN rolled on 25 Nov: the front is ZNH7
        self.assertEqual([x['name'] for x in K.pull_set('ZN', zn, D(2026, 11, 27))], ['ZNH7'])            # rolled: the old front is left, ZNM7 is far
        self.assertEqual([x['name'] for x in K.pull_set('ZN', zn, D(2026, 11, 20))], ['ZNZ6', 'ZNH7'])    # inside the window before the roll: both sides
        self.assertEqual(K.job_roots('auto', 10), K.job_roots('all'))
        self.assertEqual(K.job_roots('auto', 40), K.job_roots('core'))
        self.assertNotIn('JGB', K.job_roots('core'))
        nq_rows = [row('NQZ6', '20261218', '202612'), row('NQH7', '20270319', '202703')]
        self.assertEqual([x['name'] for x in K.pull_set('NQ', K.select_live('NQ', nq_rows, D(2026, 11, 2)), D(2026, 11, 2))], ['NQZ6'])          # 28 bd from the roll
        self.assertEqual([x['name'] for x in K.pull_set('NQ', K.select_live('NQ', nq_rows, D(2026, 11, 27)), D(2026, 11, 27))], ['NQZ6', 'NQH7'])  # inside 10 bd
        self.assertEqual([x['name'] for x in K.pull_set('NQ', K.select_live('NQ', nq_rows, D(2026, 11, 2)), D(2026, 11, 2), full=True)], ['NQZ6', 'NQH7'])
        sr = [row(f'SR3{c}{y}', l, m, 'SR3') for c, y, l, m in [('U', 6, '20261215', '202609'), ('Z', 6, '20270316', '202612'), ('H', 7, '20270615', '202703'), ('M', 7, '20270914', '202706')]]
        self.assertEqual([x['name'] for x in K.pull_set('SR3', K.select_live('SR3', sr, D(2026, 11, 27)), D(2026, 11, 27))], ['SR3U6', 'SR3Z6', 'SR3H7'])


class RollRules(unittest.TestCase):
    def test_known_2026_roll_dates(self):
        cases = {      # root, contract, IBKR last trade (2026-11-27 probe) -> roll date
            ('ZN', 2026, 12, D(2026, 12, 21)): D(2026, 11, 25),      # FND Mon 30 Nov; Thanksgiving 26 Nov is not a business day
            ('ZT', 2026, 12, D(2026, 12, 31)): D(2026, 11, 25),
            ('GC', 2026, 12, D(2026, 12, 29)): D(2026, 11, 25),
            ('GC', 2027, 2, D(2027, 2, 24)): D(2027, 1, 27),
            ('CGB', 2026, 12, D(2026, 12, 18)): D(2026, 11, 24),     # Montreal FND = 3 bd before 1 Dec = Thu 26 Nov
            ('GBL', 2026, 12, D(2026, 12, 8)): D(2026, 12, 3),
            ('GBS', 2026, 12, D(2026, 12, 8)): D(2026, 12, 3),
            ('BTP', 2026, 12, D(2026, 12, 8)): D(2026, 12, 3),
            ('CONF', 2026, 12, D(2026, 12, 8)): D(2026, 12, 3),
            ('JGB', 2026, 12, D(2026, 12, 14)): D(2026, 12, 7),
            ('YT', 2026, 12, D(2026, 12, 15)): D(2026, 12, 11),      # 12 Dec is a Saturday: back to Friday
            ('XT', 2027, 3, D(2027, 3, 15)): D(2027, 3, 12),
            ('NQ', 2026, 12, D(2026, 12, 18)): D(2026, 12, 10),
            ('ES', 2027, 3, D(2027, 3, 19)): D(2027, 3, 11),
            ('6E', 2026, 12, D(2026, 12, 14)): D(2026, 12, 10),
            ('6C', 2026, 12, D(2026, 12, 15)): D(2026, 12, 10),
            ('DX', 2026, 12, D(2026, 12, 14)): D(2026, 12, 7),
            ('VX', 2026, 12, D(2026, 12, 16)): D(2026, 12, 16),
            ('SR3', 2026, 9, D(2026, 12, 15)): D(2026, 12, 15),
            ('I', 2026, 12, D(2026, 12, 14)): D(2026, 12, 14),
        }
        for (k, y, m, ltd), want in cases.items():
            self.assertEqual(K.roll_date(k, y, m, ltd), want, f'{k} {y}-{m}')
            self.assertEqual(K.roll_date(k, y, m), want, f'{k} {y}-{m} from the rule-based last trading day')

    def test_rule_last_trade_matches_ibkr(self):
        ib = {('ZN', 2026, 12): '20261221', ('ZN', 2027, 3): '20270319', ('ZT', 2027, 3): '20270331', ('GC', 2027, 4): '20270428', ('GBL', 2027, 3): '20270308',
              ('DX', 2027, 3): '20270315', ('VX', 2027, 2): '20270217', ('NQ', 2027, 6): '20270617', ('6E', 2027, 3): '20270315', ('6C', 2027, 3): '20270316',
              ('JGB', 2027, 3): '20270315', ('CGB', 2027, 3): '20270319', ('YT', 2027, 3): '20270315', ('IR', 2027, 3): '20270311', ('SR3', 2026, 12): '20270316',
              ('ER3', 2026, 12): '20270316', ('SO3', 2027, 3): '20270615', ('CRA', 2026, 12): '20270316', ('I', 2027, 6): '20270614', ('ZQ', 2027, 1): '20270129',
              ('CONF', 2027, 3): '20270308'}
        for (k, y, m), s in ib.items():
            self.assertEqual(K.last_trade(k, y, m), K._ltd_date(s), f'{k} {y}-{m}')

    def test_business_days(self):
        self.assertFalse(K.is_bday(D(2026, 11, 26), 'US'))       # Thanksgiving
        self.assertTrue(K.is_bday(D(2026, 11, 26), 'EU'))
        self.assertFalse(K.is_bday(D(2026, 12, 24), 'EU'))
        self.assertEqual(K.add_bdays(D(2026, 11, 30), -2, 'US'), D(2026, 11, 25))
        self.assertEqual(K.bdays_between(D(2026, 11, 27), D(2026, 12, 3), 'EU'), 4)
        self.assertEqual(K._easter(2027), D(2027, 3, 28))


class Aliases(unittest.TestCase):
    def test_ib_spec_reproduced(self):
        self.assertEqual(K.ib_spec(), OLD_IB_SPEC)

    def test_every_existing_stem_kept(self):
        made = {K.stem_for(*[(a := K.alias(n))['root'], a['year'], a['month']]) if K.ROOTS[K.alias(n)['root']].kind != 'index' else f"{K.ROOTS[n].tag}_{n}" for n in K.LEGACY}
        self.assertTrue(set(DEEP_STEMS) <= made, set(DEEP_STEMS) - made)
        for s in DEEP_STEMS:
            p = K.parse_stem(s, 2026)
            self.assertIsNotNone(p, s)
            if p[1]:
                self.assertEqual(K.stem_for(*p), s)

    def test_aliases_point_rolled_roots_at_their_front(self):
        want = {'ZNZ6': 'ZN1', 'FGBL2612': 'GBL1', 'FBTP2612': 'BTP1', 'NQZ6': 'NQ1', '6EZ6': '6E1', 'GCZ6': 'GC1', 'VXZ6': 'VX1', 'DXZ6': 'DX1', 'SR3Z6': None, 'IH7': None, 'ZQX6': None, 'VIX': None}
        for n, to in want.items():
            self.assertEqual(K.alias(n)['continuous'], to, n)
        self.assertEqual(K.alias('ZNH7')['continuous'], 'ZN1')       # a name the registry never listed still resolves
        self.assertEqual(K.legacy_spec('ZNH7'), ('ZN', 'CBOT', 'USD', '202703'))
        self.assertEqual(K.legacy_spec('SO3Z6'), ('SONIA.N', 'ICEEU', 'GBP', '202612'))

    def test_names_round_trip_and_new_roots(self):
        for k, (y, m) in [('JGB', (2027, 3)), ('CGB', (2027, 6)), ('CRA', (2026, 12)), ('CONF', (2027, 3)), ('SO3', (2027, 9)), ('IR', (2027, 3)), ('6N', (2027, 3)), ('XT', (2026, 12))]:
            n = K.contract_name(k, y, m)
            self.assertEqual(K.parse_name(n, 2026), (k, y, m), n)
            self.assertEqual(K.parse_stem(K.stem_for(k, y, m), 2026), (k, y, m))
            self.assertIsNotNone(K.describe_stem(K.stem_for(k, y, m), 2026))
        self.assertEqual(K.stem_for('JGB', 2026, 12), 'OSE_JGBZ6')
        self.assertEqual(K.stem_for('CGB', 2026, 12), 'CDE_CGBZ26')
        self.assertEqual(K.stem_for('CONF', 2026, 12), 'EUREX_CONF_20261208_M')

    def test_continuous_aliases_file(self):
        a = C.aliases(D(2026, 11, 27), {})
        self.assertEqual(a['ZNZ6'], dict(to='ZN1', root='ZN', rollAt='2026-11-25'))
        self.assertEqual(a['FGBL2612']['rollAt'], '2026-12-03')
        self.assertNotIn('SR3Z6', a)
        self.assertNotIn('VIX', a)


def frame(start, n, base, step=0.01):
    t = pd.date_range(start, periods=n, freq='1min', tz='UTC')
    c = pd.Series([base + step * i for i in range(n)], index=t)
    return pd.DataFrame({'open': c, 'high': c + 0.005, 'low': c - 0.005, 'close': c})


class Stitch(unittest.TestCase):
    def test_roll_with_gap_logged(self):
        a = frame('2026-11-24 00:00', 4 * 1440, 110.0, 0.0)          # ZNZ6 flat at 110 to 27 Nov
        b = frame('2026-11-24 00:00', 4 * 1440, 110.5, 0.0)          # ZNH7 flat at 110.5 (a 0.5 point calendar gap)
        seq = C.sequence('ZN', 2026, 12, 2027, 3, {})
        sch = C.schedule(seq, 1)
        self.assertEqual([(n, str(e)[:10]) for n, _, e in sch], [('ZNZ6', '2026-11-25'), ('ZNH7', '2027-02-24')])
        un, adj, rolls, segs = C.stitch({'ZNZ6': a, 'ZNH7': b}, sch)
        roll_t = pd.Timestamp('2026-11-25', tz='UTC')
        self.assertTrue((un.loc[un.index < roll_t, 'contract'] == 'ZNZ6').all())
        self.assertTrue((un.loc[un.index >= roll_t, 'contract'] == 'ZNH7').all())
        self.assertEqual(un.close.iloc[0], 110.0)                    # unadjusted: steps at the roll
        self.assertEqual(un.close.iloc[-1], 110.5)
        self.assertEqual(len(rolls), 1)
        self.assertEqual((rolls[0]['date'], rolls[0]['from'], rolls[0]['to']), ('2026-11-25', 'ZNZ6', 'ZNH7'))
        self.assertAlmostEqual(rolls[0]['gap'], 0.5)
        self.assertEqual(rolls[0]['gapAt'], '2026-11-24 23:59')      # the last 1-minute bar both had before the switch
        self.assertEqual(adj.close.nunique(), 1)                     # back-adjusted: no step, a return never crosses the roll
        self.assertAlmostEqual(adj.close.iloc[0], 110.5)
        self.assertEqual([s['contract'] for s in segs], ['ZNZ6', 'ZNH7'])

    def test_no_overlap_is_flagged_not_invented(self):
        a = frame('2026-11-20 00:00', 1440, 100.0, 0.0)
        b = frame('2026-11-26 00:00', 1440, 101.0, 0.0)
        un, adj, rolls, _ = C.stitch({'ZNZ6': a, 'ZNH7': b}, C.schedule(C.sequence('ZN', 2026, 12, 2027, 3, {}), 1))
        self.assertIsNone(rolls[0]['gap'])
        self.assertIn('no common', rolls[0]['note'])
        self.assertAlmostEqual(adj.close.iloc[0], 100.0)            # not shifted

    def test_strip_rank_two(self):
        seq = C.sequence('SR3', 2026, 9, 2027, 6, {})
        self.assertEqual([z['name'] for z in seq], ['SR3U6', 'SR3Z6', 'SR3H7', 'SR3M7'])
        sch = C.schedule(seq, 2)
        self.assertEqual([(n, str(e)[:10]) for n, _, e in sch], [('SR3Z6', '2026-12-15'), ('SR3H7', '2027-03-16'), ('SR3M7', '2027-06-15')])

    def test_daily_closes_completed_days_only(self):
        f = frame('2026-11-25 22:00', 3 * 1440, 1.0, 0.0001)
        got = C.daily_closes(f, D(2026, 11, 27))
        self.assertEqual([d for d, _ in got], ['2026-11-25', '2026-11-26'])

    def test_health_flags(self):
        seq = C.sequence('ZN', 2026, 9, 2027, 6, {})
        now = pd.Timestamp('2026-11-27 15:00', tz='UTC')
        h = C.health_row('ZN', now.date(), seq, {'ZNZ6': pd.Timestamp('2026-11-27 14:59', tz='UTC')}, now)
        self.assertEqual((h['active'], h['next']), ('ZNH7', 'ZNM7'))
        self.assertIn('stale', h['flags'])                           # the active contract has rolled to ZNH7 and it has no bars
        h = C.health_row('ZN', now.date(), seq, {'ZNH7': pd.Timestamp('2026-11-27 14:59', tz='UTC')}, now)
        self.assertEqual(h['flags'], [])
        seqb = C.sequence('GBL', 2026, 9, 2027, 6, {})
        h = C.health_row('GBL', now.date(), seqb, {'FGBL2612': pd.Timestamp('2026-11-27 14:59', tz='UTC')}, now)
        self.assertEqual((h['active'], h['bdToRoll'], h['flags']), ('FGBL2612', 4, ['roll-window-no-next']))
        h = C.health_row('GBL', now.date(), seqb, {'FGBL2612': pd.Timestamp('2026-11-24 10:00', tz='UTC'), 'FGBL2703': pd.Timestamp('2026-11-27 14:00', tz='UTC')}, now)
        self.assertEqual(h['flags'], ['stale'])


if __name__ == '__main__':
    unittest.main(verbosity=1)
