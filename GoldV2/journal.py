"""
Gold V2 Journal — event log + trade CSV + console output.

Differences vs V1:
  * events are keyed by trade_id (several trades can be open on the same
    zone cluster over time; zone_id alone was ambiguous)
  * MFE / MAE recorded on close — the data needed to tune SL/TP empirically
  * SL basis / TP basis / skip reasons logged (why a setup was taken or not)
  * BE_STOP is a distinct outcome (breakeven after TP1), matching live
    management, so labels are consistent between paper and live

Files (in log_dir):
  gold_v2_journal.jsonl  — one JSON object per line, every event type
  gold_v2_trades.csv     — one row per completed trade
"""

from __future__ import annotations
import csv
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger(__name__)

_SEP  = '─' * 70
_SEP2 = '═' * 70


def _now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class GoldV2Journal:
    def __init__(self, log_dir: str = '.'):
        os.makedirs(log_dir, exist_ok=True)
        self.log_dir    = log_dir
        self.jsonl_path = os.path.join(log_dir, 'gold_v2_journal.jsonl')
        self.csv_path   = os.path.join(log_dir, 'gold_v2_trades.csv')
        self._ensure_csv()

        self.zones_detected = 0
        self.zones_hit      = 0
        self.trades: list[dict] = []
        self.session_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # ── Zone map snapshot ─────────────────────────────────────────────────────

    def log_zone_map(self, zones: list, htf: Any, vol: Any, sess: Any,
                     debug: Optional[dict] = None) -> None:
        active = [z for z in zones if z.active]
        self.zones_detected = max(self.zones_detected, len(active))

        ev = {
            'type': 'ZONE_MAP', 'timestamp': _now(),
            'htf_bias': htf.bias, 'htf_conf': htf.confidence,
            'session': sess.current_session,
            'daily_open': sess.daily_open, 'vwap': sess.vwap,
            'poc': vol.poc, 'vah': vol.vah, 'val': vol.val,
            'matrix': debug or {},
            'zones': [_zone_dict(z) for z in active[:10]],
        }
        self._write(ev)
        self._print_zone_map(active, htf, vol, sess)

    # ── Zone interactions ─────────────────────────────────────────────────────

    def log_zone_approached(self, zone: Any, price: float, dist_pips: float) -> None:
        self.zones_hit += 1
        self._write({
            'type': 'ZONE_APPROACHED', 'timestamp': _now(),
            'zone_id': zone.zone_id, 'tf': zone.tf, 'direction': zone.direction,
            'score': zone.score, 'gp_low': zone.gp_low, 'gp_high': zone.gp_high,
            'in_gp': zone.in_gp, 'distinct_legs': zone.distinct_legs,
            'price': price, 'dist_pips': round(dist_pips, 1),
        })
        log.info(f'[ARMED]  {zone.zone_id} score={zone.score:.1f} '
                 f'legs={zone.distinct_legs}  price={price:.2f}  '
                 f'({dist_pips:.1f}p from window {zone.gp_low:.1f}–{zone.gp_high:.1f})')

    def log_skip(self, zone_id: str, stage: str, reason: str) -> None:
        """A setup that confirmed but was skipped (gate / risk box / no room)."""
        self._write({'type': 'ENTRY_SKIPPED', 'timestamp': _now(),
                     'zone_id': zone_id, 'stage': stage, 'reason': reason})
        log.info(f'[SKIP]   {zone_id}  [{stage}]  {reason}')

    def log_vu_watch(self, zone_id: str, snap: dict) -> None:
        """Armed-zone confirmation state changed — record why it can('t) enter."""
        self._write({'type': 'VU_WATCH', 'timestamp': _now(),
                     'zone_id': zone_id, **snap})
        vwap = snap['vwap'] + (f'/{snap["vwap_div"]}' if snap.get('vwap_div') not in (None, 'NONE') else '')
        log.info(f'[WATCH]  {zone_id} — {snap["verdict"]}  '
                 f'(WT {snap["wt1"]} {snap["wt"]} · MF {snap["mf"]} {snap["mf_sig"]} '
                 f'· VWAP {vwap})')

    # ── Trade lifecycle ───────────────────────────────────────────────────────

    def log_entry(self, trade: Any, zone: Any, vu: Any, plan: Any) -> None:
        sl_pips  = round(abs(trade.entry_price - trade.sl),  1)
        tp1_pips = round(abs(trade.tp1 - trade.entry_price), 1)
        tp2_pips = round(abs(trade.tp2 - trade.entry_price), 1)

        ev = {
            'type': 'ENTRY_SIGNAL', 'timestamp': _now(), 'mode': trade.mode,
            'trade_id': trade.trade_id,
            'zone_id': trade.zone_id, 'tf': zone.tf, 'score': zone.score,
            'in_gp': zone.in_gp, 'distinct_legs': zone.distinct_legs,
            'composition': getattr(zone, 'composition', []),
            'direction': trade.direction, 'entry_price': trade.entry_price,
            'sl': trade.sl, 'tp1': trade.tp1, 'tp2': trade.tp2,
            'sl_pips': sl_pips, 'tp1_pips': tp1_pips, 'tp2_pips': tp2_pips,
            'rr': round(tp2_pips / sl_pips, 2) if sl_pips > 0 else 0,
            'sl_basis': plan.sl_basis, 'tp1_basis': plan.tp1_basis,
            'tp2_basis': plan.tp2_basis,
            'lot_size': trade.lot_size, 'risk_pct': trade.risk_pct,
            'vumanchu': {
                'wt1': vu.wt1, 'wt2': vu.wt2,
                'wt_signal': vu.wt_signal, 'mf_value': vu.mf_value,
                'mf_signal': vu.mf_signal, 'vwap_signal': vu.vwap_signal,
                'vwap_divergence': vu.vwap_divergence,
                'components': vu.components_aligned, 'confidence': vu.confidence,
            },
        }
        self._write(ev)
        self.trades.append({**ev, 'result': None, 'pnl_pips': 0.0})

        arr = '▲' if trade.direction == 'LONG' else '▼'
        log.info(
            f'[ENTRY]  {arr} {trade.direction} @ {trade.entry_price:.2f}  '
            f'SL {trade.sl:.2f} (−{sl_pips}p, {plan.sl_basis})  '
            f'TP1 {trade.tp1:.2f} ({plan.tp1_basis})  '
            f'TP2 {trade.tp2:.2f} ({plan.tp2_basis})  '
            f'R:R 1:{ev["rr"]}  VuManChu {vu.components_aligned}/3 [{vu.confidence}]'
        )

    def log_tp1_hit(self, trade: Any, price: float) -> None:
        pips = self._pips(trade.trade_id, price)
        self._write({'type': 'TP1_HIT', 'timestamp': _now(),
                     'trade_id': trade.trade_id, 'zone_id': trade.zone_id,
                     'price': price, 'pnl_pips': pips})
        log.info(f'[TP1]    {trade.trade_id} @ {price:.2f}  +{pips:.1f}p — SL → breakeven')

    def log_trade_closed(self, trade: Any, price: float, reason: str) -> None:
        pips   = self._pips(trade.trade_id, price)
        if reason == 'BE_STOP':
            result = 'BREAKEVEN'
        elif reason == 'EXPIRED':
            result = 'EXPIRED'
        else:
            result = 'WIN' if pips > 0 else ('LOSS' if pips < 0 else 'BREAKEVEN')

        self._write({'type': 'TRADE_CLOSED', 'timestamp': _now(),
                     'trade_id': trade.trade_id, 'zone_id': trade.zone_id,
                     'reason': reason, 'price': price, 'pnl_pips': pips,
                     'result': result,
                     'mfe_pips': trade.mfe_pips, 'mae_pips': trade.mae_pips})
        self._patch(trade.trade_id, result, price, pips)
        self._csv_row(trade, reason, price, pips, result)

        icon = '✓' if result == 'WIN' else ('✗' if result == 'LOSS' else '~')
        log.info(f'[CLOSE]  {icon} {trade.trade_id}  {reason}  {pips:+.1f}p  '
                 f'MFE +{trade.mfe_pips:.1f} MAE −{trade.mae_pips:.1f}  → {result}')

    # ── Session summary ───────────────────────────────────────────────────────

    def print_summary(self) -> None:
        wins   = [t for t in self.trades if t.get('result') == 'WIN']
        losses = [t for t in self.trades if t.get('result') == 'LOSS']
        net    = sum(t.get('pnl_pips', 0) for t in self.trades)
        wr     = len(wins) / len(self.trades) * 100 if self.trades else 0

        log.info(_SEP2)
        log.info(f'GOLD V2 — SESSION SUMMARY  {self.session_date}')
        log.info(_SEP2)
        log.info(f'  Zones detected  : {self.zones_detected}')
        log.info(f'  Zones hit       : {self.zones_hit}')
        log.info(f'  Trades          : {len(self.trades)}')
        log.info(f'  Wins            : {len(wins)}')
        log.info(f'  Losses          : {len(losses)}')
        log.info(f'  Net pips        : {net:+.1f}')
        if self.trades:
            log.info(f'  Win rate        : {wr:.0f}%')
        log.info(_SEP2)

        self._write({
            'type': 'SESSION_SUMMARY', 'timestamp': _now(),
            'date': self.session_date, 'zones_detected': self.zones_detected,
            'zones_hit': self.zones_hit, 'trades': len(self.trades),
            'wins': len(wins), 'losses': len(losses),
            'net_pips': round(net, 1), 'win_rate_pct': round(wr, 1),
        })

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _write(self, ev: dict) -> None:
        try:
            with open(self.jsonl_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(ev) + '\n')
        except Exception as exc:
            log.debug(f'Journal write error: {exc}')

    def _ensure_csv(self) -> None:
        if os.path.exists(self.csv_path):
            return
        try:
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow([
                    'date', 'time', 'trade_id', 'zone_id', 'tf', 'direction', 'score',
                    'in_gp', 'legs', 'entry', 'sl', 'tp1', 'tp2',
                    'sl_pips', 'sl_basis', 'tp2_basis', 'rr',
                    'close_reason', 'close_price', 'pnl_pips', 'mfe_pips', 'mae_pips',
                    'result', 'vu_components', 'vu_confidence', 'composition',
                ])
        except Exception:
            pass

    def _csv_row(self, trade: Any, reason: str, price: float,
                 pips: float, result: str) -> None:
        t = next((x for x in self.trades if x.get('trade_id') == trade.trade_id), None)
        if not t:
            return
        try:
            ts = t['timestamp']
            vu = t.get('vumanchu', {})
            comp = '; '.join(str(c) for c in t.get('composition', []))
            with open(self.csv_path, 'a', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow([
                    ts[:10], ts[11:19], trade.trade_id, t.get('zone_id', ''),
                    t.get('tf', ''), t.get('direction', ''), t.get('score', 0),
                    t.get('in_gp', False), t.get('distinct_legs', 0),
                    t.get('entry_price', 0), t.get('sl', 0),
                    t.get('tp1', 0), t.get('tp2', 0),
                    t.get('sl_pips', 0), t.get('sl_basis', ''),
                    t.get('tp2_basis', ''), t.get('rr', 0),
                    reason, price, round(pips, 1),
                    trade.mfe_pips, trade.mae_pips, result,
                    vu.get('components', 0), vu.get('confidence', ''), comp,
                ])
        except Exception as exc:
            log.debug(f'CSV row error: {exc}')

    def _pips(self, trade_id: str, price: float) -> float:
        t = next((x for x in self.trades if x.get('trade_id') == trade_id), None)
        if not t:
            return 0.0
        entry = t.get('entry_price', price)
        sign  = 1 if t.get('direction') == 'LONG' else -1
        return round((price - entry) * sign, 1)

    def _patch(self, trade_id: str, result: str, price: float, pips: float) -> None:
        for t in self.trades:
            if t.get('trade_id') == trade_id:
                t['result'] = result; t['pnl_pips'] = pips; break

    def _print_zone_map(self, zones: list, htf: Any, vol: Any, sess: Any) -> None:
        log.info(_SEP)
        log.info(
            f'ZONE MAP  {datetime.now(timezone.utc).strftime("%H:%M UTC")}  '
            f'| HTF {htf.bias} ({htf.confidence:.0%}) [{htf.daily_trend}/{htf.h4_trend}]  '
            f'| {sess.current_session}  | VWAP {sess.vwap:.1f}'
        )
        log.info(f'  Vol: POC {vol.poc:.1f}  VAH {vol.vah:.1f}  VAL {vol.val:.1f}')
        if zones:
            log.info(f'  {"SCORE":>5}  {"DIR":5}  {"LEGS":>4}  {"GP":>2}  WINDOW             COMPOSITION')
            for z in zones[:8]:
                comp = ', '.join(getattr(z, 'composition', [])[:4])
                gp   = '◆' if z.in_gp else ' '
                log.info(f'  {z.score:5.1f}  {z.direction.upper():5}  {z.distinct_legs:>4}  {gp:>2}  '
                         f'{z.gp_low:.1f}–{z.gp_high:.1f}  {comp}')
        else:
            log.info('  No active zones')
        log.info(_SEP)


def _zone_dict(z: Any) -> dict:
    return {
        'zone_id': z.zone_id, 'tf': z.tf, 'direction': z.direction,
        'gp_low': z.gp_low, 'gp_high': z.gp_high, 'score': z.score,
        'in_gp': z.in_gp, 'distinct_legs': z.distinct_legs,
        'htf_aligned': z.htf_aligned, 'composition': getattr(z, 'composition', []),
    }
