"""
Gold Bot — Max-style confluence trading for XAU/USD only.

Top-down process:
  HTF bias (Daily/4H) → Multi-TF Fib zones → Confluence scoring →
  Zone proximity watch → VuManChu Cipher B confirmation → Paper entry

Paper mode (default): journals all signals and outcomes, zero real orders.
Live mode (--live):   sends orders to MT5 via magic number 20260003.

Two-speed loop:
  State refresh (--state-interval, default 120s):
    Fetch all TF bars, recompute HTF bias, volume profile, session levels,
    fib zones, confluence scores, gold macro KV gate.
  Price tick (--price-interval, default 3s):
    Get live price, check zone proximity, fire VuManChu when armed,
    monitor open paper trades for TP/SL.

Usage:
  python main.py                            # paper mode
  python main.py --live                     # real MT5 orders
  python main.py --state-interval 60        # faster refresh
  python main.py --once                     # single cycle then exit
  python main.py --log-dir ./logs           # write journal to ./logs/

Environment (.env or shell):
  MT5_ACCOUNT    MT5 account number
  MT5_PASSWORD   MT5 password
  MT5_SERVER     broker server
  MT5_PATH       optional full path to terminal64.exe
  DASHBOARD_URL  override base URL (default: Railway deployment)
"""

from __future__ import annotations
import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

# Gold/modules must take priority over bot/modules (both packages use 'modules.*').
# Insert Gold's own directory first, then bot/ for utils/.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(1, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bot'))

import requests
from dotenv import load_dotenv

from utils.sl_tp_engine import SLTPEngine
from utils.state_reader import fetch_quote, DASHBOARD_URL

from modules.htf_bias import compute_htf_bias, HTFBias
from modules.fib_engine import detect_fib_zones, update_zone_activity, FibZone
from modules.volume_profile import compute_volume_profile
from modules.session_engine import compute_session_levels
from modules.confluence_scorer import score_zones
from modules.vumanchu import compute_vumanchu
from modules.trade_state import BotState, State, ActiveTrade
from modules.trendline_engine import detect_trendlines, Trendline

from journal import GoldJournal

load_dotenv()

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    HAS_MT5 = False

# ── Constants ─────────────────────────────────────────────────────────────────

SYMBOL  = 'XAUUSD'
MAGIC   = 20260003
PIP     = 1.0       # XAU/USD: 1 pip = $1

# ── Default config (can be overridden via KV key gold_bot_config) ─────────────

DEFAULT_CFG: dict = {
    'enabled':              True,
    'paper_mode':           True,
    'min_zone_score':       3.0,    # minimum confluence score to arm
    'proximity_pips':       5.0,    # price must be within this many pips of GP
    'vu_min_components':    2,      # VuManChu components required (2 or 3)
    'risk_pct':             0.5,    # % of balance per trade
    'tp1_r':                1.0,    # TP1 as multiple of SL distance
    'tp2_r':                2.0,    # TP2 as multiple of SL distance
    'sl_atr_mult':          1.5,    # SL = ATR(14) × this if no structural SL
    'max_sl_pips':          40,
    'max_trades_per_day':   2,
    'trade_window_start':   '07:00',
    'trade_window_end':     '20:00',
    'cooldown_minutes':     30,
    'gold_macro_gate':      True,   # block if gold macro KV signal opposes direction
    'log_dir':              '.',
}

# ── Logging ───────────────────────────────────────────────────────────────────

def _setup_logging(log_dir: str) -> None:
    os.makedirs(log_dir, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(message)s',
        datefmt='%H:%M:%S',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(os.path.join(log_dir, 'gold_bot.log'), encoding='utf-8'),
        ],
    )

log = logging.getLogger(__name__)

# ── MT5 helpers ───────────────────────────────────────────────────────────────

_TF_MAP: dict = {}

def _init_mt5() -> bool:
    if not HAS_MT5:
        return False
    global _TF_MAP
    _TF_MAP = {
        'D1': mt5.TIMEFRAME_D1, 'H4': mt5.TIMEFRAME_H4, 'H1': mt5.TIMEFRAME_H1,
        'M30': mt5.TIMEFRAME_M30, 'M15': mt5.TIMEFRAME_M15,
        'M5': mt5.TIMEFRAME_M5,   'M1': mt5.TIMEFRAME_M1,
    }
    kw: dict = {}
    if os.getenv('MT5_PATH'):
        kw['path'] = os.getenv('MT5_PATH')
    acct = os.getenv('MT5_ACCOUNT')
    pwd  = os.getenv('MT5_PASSWORD')
    srv  = os.getenv('MT5_SERVER')
    if acct and pwd and srv:
        kw.update({'login': int(acct), 'password': pwd, 'server': srv})
    ok = mt5.initialize(**kw)
    if not ok:
        log.warning(f'MT5 init failed: {mt5.last_error()}')
    return ok


def _bars(symbol: str, tf: str, count: int) -> list[dict]:
    """Fetch bars from MT5 and return chronological list of dicts."""
    if not HAS_MT5 or tf not in _TF_MAP:
        return []
    rates = mt5.copy_rates_from_pos(symbol, _TF_MAP[tf], 0, count)
    if rates is None or len(rates) == 0:
        return []
    return [
        {'time': int(r['time']), 'open': float(r['open']), 'high': float(r['high']),
         'low': float(r['low']), 'close': float(r['close']),
         'tick_volume': float(r['tick_volume'])}
        for r in reversed(rates)   # MT5 returns newest-first; reverse to chronological
    ]


def _live_price(base_url: str) -> float | None:
    """MT5 tick first, dashboard quote fallback."""
    if HAS_MT5:
        tick = mt5.symbol_info_tick(SYMBOL)
        if tick:
            return round((tick.bid + tick.ask) / 2, 2)
    return fetch_quote('XAU/USD', base_url)


def _mt5_balance() -> float:
    if HAS_MT5:
        info = mt5.account_info()
        if info:
            return info.balance
    return 10000.0   # paper fallback


# ── KV helpers ────────────────────────────────────────────────────────────────

def _kv_get(key: str, base_url: str) -> dict | None:
    try:
        r = requests.get(f'{base_url}/api/kv/get?key={key}', timeout=10)
        if r.status_code == 200:
            j = r.json()
            if not j.get('miss') and j.get('data'):
                return j['data']
    except Exception:
        pass
    return None


def _load_config(base_url: str) -> dict:
    remote = _kv_get('gold_bot_config', base_url) or {}
    cfg = {**DEFAULT_CFG, **remote}
    return cfg


def _kv_put_status(key: str, data: dict, base_url: str) -> None:
    """Write bot heartbeat to its own KV key (non-critical — swallows all errors)."""
    try:
        import time as _time
        requests.post(
            f'{base_url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(_time.time() * 1000)},
            timeout=5,
        )
    except Exception:
        pass


def _ml_allows(zone_id: str, base_url: str) -> tuple[bool, str]:
    """
    Reads gold_ml_signal from KV (pushed by Gold/ml_model.py --predict).
    Returns (allowed, reason). Soft gate: only blocks when signal is PASS
    and gold_macro_gate is enabled in config.
    """
    signal = _kv_get('gold_ml_signal', base_url)
    if not signal:
        return True, 'ML signal not in KV — skipping ML gate'

    for z in signal.get('zones', []):
        if z.get('zone_id') == zone_id:
            sig  = z.get('signal', 'LOW')
            prob = z.get('prob', 0.5)
            if sig == 'PASS':
                return False, f'ML gate BLOCK: zone {zone_id} prob={prob:.2f} [{sig}]'
            return True, f'ML gate OK: prob={prob:.2f} [{sig}]'

    return True, 'Zone not in ML signal — skipping gate'


# ── Gold macro gate ───────────────────────────────────────────────────────────

def _macro_allows(direction: str, base_url: str) -> tuple[bool, str]:
    """
    Reads ai_goldmodel from KV (pushed by browser on FRED refresh).
    Returns (allowed, reason). Soft gate only — warns but does not hard-block
    unless signal is STRONG and directly opposed.
    """
    model = _kv_get('ai_goldmodel', base_url)
    if not model:
        return True, 'Gold macro model not in KV — skipping gate'

    signal   = model.get('signal', 'NEUTRAL')
    strength = model.get('strength', 'WEAK')
    regime   = model.get('regimeLabel', model.get('regime', ''))

    long_ok  = signal in ('BULLISH', 'NEUTRAL')
    short_ok = signal in ('BEARISH', 'NEUTRAL')

    if direction == 'LONG' and not long_ok and strength == 'STRONG':
        return False, f'Gold macro BLOCK: {signal} {strength} ({regime}) vs LONG'
    if direction == 'SHORT' and not short_ok and strength == 'STRONG':
        return False, f'Gold macro BLOCK: {signal} {strength} ({regime}) vs SHORT'

    return True, f'Macro OK: {signal} {strength} ({regime})'


# ── Trade window ──────────────────────────────────────────────────────────────

def _in_trade_window(cfg: dict) -> bool:
    now = datetime.now(timezone.utc)
    try:
        start_h, start_m = map(int, cfg['trade_window_start'].split(':'))
        end_h,   end_m   = map(int, cfg['trade_window_end'].split(':'))
    except Exception:
        return True
    start = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    end   = now.replace(hour=end_h,   minute=end_m,   second=0, microsecond=0)
    return start <= now <= end


# ── SL / TP calculation ───────────────────────────────────────────────────────

def _calc_sl_tp(zone: FibZone, direction: str, price: float,
                atr: float, cfg: dict) -> tuple[float, float, float]:
    """
    SL: just beyond the zone's far edge (swing origin + small buffer).
    TP1 / TP2: R-multiples from SL distance.
    Returns (sl, tp1, tp2).
    """
    max_sl = cfg.get('max_sl_pips', 40) * PIP
    atr_sl = atr * cfg.get('sl_atr_mult', 1.5)

    if direction == 'LONG':
        structural_sl = zone.level_886 - atr * 0.3
        sl = max(structural_sl, price - max_sl)
    else:
        structural_sl = zone.level_886 + atr * 0.3
        sl = min(structural_sl, price + max_sl)

    sl_dist = abs(price - sl)
    if sl_dist < atr_sl:
        sl = (price - atr_sl) if direction == 'LONG' else (price + atr_sl)
        sl_dist = atr_sl

    sign = 1 if direction == 'LONG' else -1
    tp1  = round(price + sign * sl_dist * cfg.get('tp1_r', 1.0), 2)
    tp2  = round(price + sign * sl_dist * cfg.get('tp2_r', 2.0), 2)
    return round(sl, 2), tp1, tp2


# ── Main bot class ────────────────────────────────────────────────────────────

class GoldBot:
    def __init__(self, args: argparse.Namespace):
        self.args      = args
        self.base_url  = os.getenv('DASHBOARD_URL', DASHBOARD_URL)
        self.cfg       = DEFAULT_CFG.copy()
        self.journal   = GoldJournal(args.log_dir)
        self.bot_state = BotState()
        self.zones: list[FibZone] = []
        self.trendlines: list[Trendline] = []
        self.htf_bias  = None
        self.vol_prof  = None
        self.sess_lvls = None
        self.atr_15m   = 5.0
        self.squeeze_ratio = 1.0   # ATR(14)/ATR(100) — <0.65 = compression
        self.trades_today = 0
        self.last_state_refresh = 0.0
        self._mt5_ok   = False

    def start(self) -> None:
        log.info('=' * 70)
        log.info('GOLD BOT starting  (XAU/USD only — Max strategy)')
        log.info(f'Mode: {"PAPER" if self.cfg.get("paper_mode", True) else "LIVE"}')
        log.info('=' * 70)

        if HAS_MT5:
            self._mt5_ok = _init_mt5()
            if self._mt5_ok:
                info = mt5.account_info()
                if info:
                    log.info(
                        f'MT5 connected  account={info.login}  balance={info.balance:.2f} {info.currency}'
                        f'  server={info.server}  leverage=1:{info.leverage}'
                    )
                else:
                    log.info('MT5 connected  (account_info unavailable)')
            else:
                log.warning('MT5 unavailable — price from dashboard, no execution')
        else:
            log.info('MT5 not installed — paper mode only')

        try:
            self._main_loop()
        except KeyboardInterrupt:
            log.info('Interrupted — printing session summary')
        finally:
            self.journal.print_summary()
            if HAS_MT5 and self._mt5_ok:
                mt5.shutdown()

    def _main_loop(self) -> None:
        price_interval = self.args.price_interval
        state_interval = self.args.state_interval

        while True:
            now = time.time()

            if now - self.last_state_refresh >= state_interval:
                self._state_refresh()
                self.last_state_refresh = now

            self._price_tick()

            if self.args.once:
                break

            time.sleep(price_interval)

    # ── State refresh (slow path) ─────────────────────────────────────────────

    def _state_refresh(self) -> None:
        self.cfg = _load_config(self.base_url)
        if not self.cfg.get('enabled', True):
            log.info('[REFRESH] Bot disabled via config — skipping')
            return

        log.info('[REFRESH] Fetching bars and recomputing zones...')

        # ── Bars ──────────────────────────────────────────────────────────────
        daily_bars = _bars(SYMBOL, 'D1',  60)
        h4_bars    = _bars(SYMBOL, 'H4',  200)
        h1_bars    = _bars(SYMBOL, 'H1',  96)
        m30_bars   = _bars(SYMBOL, 'M30', 150)
        m15_bars   = _bars(SYMBOL, 'M15', 150)
        # 13 days of M1 bars: today's volume profile + 12-day nPOC stack
        # + VWAP anchor detection (~13 × 23h × 60 = ~18000 bars)
        m1_multiday = _bars(SYMBOL, 'M1', 18_500)

        if not m15_bars and not m30_bars:
            log.warning('[REFRESH] No bar data — MT5 not connected and no fallback')
            return

        # Split M1 bars into today / previous day for volume profile
        now_utc  = datetime.now(timezone.utc)
        today_m1 = [b for b in m1_multiday
                    if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() == now_utc.date()]
        prev_m1  = [b for b in m1_multiday
                    if datetime.fromtimestamp(b['time'], tz=timezone.utc).date() <
                       now_utc.date()][-1440:]   # cap to one day for prev profile

        # ── ATR (15m) + squeeze detection ────────────────────────────────────
        if m15_bars:
            from utils.indicators import compute_atr
            self.atr_15m = compute_atr(
                type('Bars', (), {'__iter__': lambda s: iter(m15_bars),
                                  '__len__':  lambda s: len(m15_bars),
                                  '__getitem__': lambda s, i: m15_bars[i]})()
            ) or 5.0
        if m15_bars and len(m15_bars) >= 100:
            self.squeeze_ratio = _atr_squeeze(m15_bars)
            if self.squeeze_ratio < 0.65:
                log.info(f'[ATR]    Squeeze: {self.squeeze_ratio:.2f} — min score raised by +1.5')

        # ── HTF bias ──────────────────────────────────────────────────────────
        if daily_bars and h4_bars:
            self.htf_bias = compute_htf_bias(daily_bars, h4_bars)
            log.info(f'[HTF]    {self.htf_bias.bias} ({self.htf_bias.confidence:.0%}) '
                     f'— {self.htf_bias.reason}')

        # ── Volume profile + nPOC stack (12-day) ─────────────────────────────
        price_now = self._get_price()
        if price_now and today_m1:
            self.vol_prof = compute_volume_profile(
                today_m1, prev_m1, price_now,
                all_m1_bars=m1_multiday, max_npoc_days=12,
            )
            if self.vol_prof.npoc_stack:
                ages = ', '.join(f'{n.price:.1f}({n.age_days}d)'
                                 for n in self.vol_prof.npoc_stack[:4])
                log.info(f'[nPOC]   {len(self.vol_prof.npoc_stack)} naked POCs: {ages}')

        # ── Session levels + VWAP anchor levels ──────────────────────────────
        if h1_bars and price_now:
            prev_d1 = daily_bars[-2] if len(daily_bars) >= 2 else None
            self.sess_lvls = compute_session_levels(
                h1_bars, prev_d1, price_now,
                m1_bars_multiday=m1_multiday,
            )
            if self.sess_lvls.vwap_anchors:
                anc = ', '.join(
                    f'{a.price:.1f}({a.session[:1]}{a.age_days}d{a.direction[0]})'
                    for a in self.sess_lvls.vwap_anchors[:4]
                )
                log.info(f'[VWAP]   {len(self.sess_lvls.vwap_anchors)} anchors: {anc}')

        # ── Trendlines (H4 + H1) ─────────────────────────────────────────────
        self.trendlines = []
        for tf, bars in [('H4', h4_bars), ('H1', h1_bars)]:
            if bars:
                tls = detect_trendlines(bars, tf)
                self.trendlines.extend(tls)
        if self.trendlines:
            desc = sum(1 for t in self.trendlines if t.kind == 'descending')
            asc  = sum(1 for t in self.trendlines if t.kind == 'ascending')
            log.info(f'[TL]     {len(self.trendlines)} trendlines: '
                     f'{desc} descending, {asc} ascending')

        # ── Fib zones (all TFs) ───────────────────────────────────────────────
        all_zones: list[FibZone] = []
        for tf, bars in [('D1', daily_bars), ('H4', h4_bars), ('H1', h1_bars),
                          ('M30', m30_bars), ('M15', m15_bars)]:
            if bars and price_now:
                zs = detect_fib_zones(bars, tf, price_now)
                all_zones.extend(zs)

        # Update activity on previously detected zones
        if m15_bars and price_now:
            recent_closes = [b['close'] for b in m15_bars[-3:]]
            update_zone_activity(all_zones, price_now, recent_closes)

        self.zones = [z for z in all_zones if z.active]

        # ── Confluence scoring ────────────────────────────────────────────────
        if self.zones and self.vol_prof and self.sess_lvls and self.htf_bias:
            self.zones = score_zones(self.zones, self.vol_prof,
                                     self.sess_lvls, self.htf_bias,
                                     trendlines=self.trendlines)
            self.journal.log_zone_map(self.zones, self.htf_bias,
                                       self.vol_prof, self.sess_lvls)

        # ── Push status + full zone map to KV ────────────────────────────────
        self._push_status()
        self._push_zones_kv()

    # ── Price tick (fast path) ────────────────────────────────────────────────

    def _price_tick(self) -> None:
        price = self._get_price()
        if not price:
            return

        bot = self.bot_state

        # ── Cooldown check ────────────────────────────────────────────────────
        if bot.is_in_cooldown():
            return

        # ── Managing open trade ───────────────────────────────────────────────
        if bot.state == State.MANAGING and bot.active_trade:
            self._check_trade_outcome(price)
            return

        # ── Not in trade window ───────────────────────────────────────────────
        if not _in_trade_window(self.cfg):
            return

        # ── Daily trade limit ─────────────────────────────────────────────────
        if self.trades_today >= self.cfg.get('max_trades_per_day', 2):
            return

        # ── Armed: check VuManChu ─────────────────────────────────────────────
        if bot.state == State.ARMED and bot.armed_zone_id:
            zone = next((z for z in self.zones
                         if z.zone_id == bot.armed_zone_id and z.active), None)
            if not zone:
                bot.transition(State.WAITING); bot.armed_zone_id = None
                return
            self._check_vumanchu(zone, price)
            return

        # ── Waiting: scan for zone proximity ──────────────────────────────────
        if bot.state == State.WAITING:
            self._scan_zones(price)

    def _scan_zones(self, price: float) -> None:
        """Check if price is approaching any high-score zone."""
        base_score = self.cfg.get('min_zone_score', 3.0)
        squeeze    = getattr(self, 'squeeze_ratio', 1.0)
        if squeeze < 0.65:
            min_score = base_score + 1.5   # strong ATR compression — only take the best
        elif squeeze < 0.75:
            min_score = base_score + 0.75  # mild compression
        else:
            min_score = base_score
        prox = self.cfg.get('proximity_pips', 5.0) * PIP

        for zone in self.zones:
            if not zone.active or zone.score < min_score:
                continue
            # Price must be within proximity of the GP zone
            dist = max(0.0, max(zone.gp_low - price, price - zone.gp_high))
            if dist <= prox:
                self.bot_state.transition(State.ARMED)
                self.bot_state.armed_zone_id = zone.zone_id
                self.journal.log_zone_approached(zone, price, dist / PIP)
                return

    def _check_vumanchu(self, zone: FibZone, price: float) -> None:
        """Fetch 5m bars and evaluate VuManChu. Fire entry if confirmed."""
        # Still in proximity?
        prox = self.cfg.get('proximity_pips', 5.0) * PIP * 2
        dist = max(0.0, max(zone.gp_low - price, price - zone.gp_high))
        if dist > prox:
            log.info(f'[ARMED]  Zone {zone.zone_id} — price {price:.2f} left proximity, disarming')
            self.bot_state.transition(State.WAITING)
            self.bot_state.armed_zone_id = None
            return

        m5_bars = _bars(SYMBOL, 'M5', 60)
        if not m5_bars:
            return

        min_comp = self.cfg.get('vu_min_components', 2)
        vu = compute_vumanchu(m5_bars, zone.direction, min_components=min_comp)

        if vu.direction == 'NEUTRAL':
            return   # not confirmed yet, keep watching

        # Gold macro gate
        direction = vu.direction
        if self.cfg.get('gold_macro_gate', True):
            allowed, reason = _macro_allows(direction, self.base_url)
            if not allowed:
                log.info(f'[MACRO]  {reason} — skipping entry')
                self.bot_state.transition(State.COOLDOWN)
                self.bot_state.cooldown_until = (
                    datetime.now(timezone.utc) + timedelta(minutes=15)
                )
                return
            log.info(f'[MACRO]  {reason}')

        # ML signal gate (soft — only blocks PASS-rated zones)
        if self.cfg.get('gold_macro_gate', True):
            ml_ok, ml_reason = _ml_allows(zone.zone_id, self.base_url)
            if not ml_ok:
                log.info(f'[ML]     {ml_reason} — skipping entry')
                self.bot_state.transition(State.WAITING)
                self.bot_state.armed_zone_id = None
                return
            log.info(f'[ML]     {ml_reason}')

        # Calculate SL / TP
        sl, tp1, tp2 = _calc_sl_tp(zone, direction, price, self.atr_15m, self.cfg)

        # Log the paper entry
        self.journal.log_entry(zone, direction, price, sl, tp1, tp2, vu)

        # Open paper trade
        trade = ActiveTrade(
            zone_id=zone.zone_id, direction=direction,
            entry_price=price, sl=sl, tp1=tp1, tp2=tp2,
            lot_size=0.01,  # paper placeholder
            entry_time=datetime.now(timezone.utc),
        )
        self.bot_state.active_trade = trade
        self.bot_state.transition(State.MANAGING)
        self.trades_today += 1

    def _check_trade_outcome(self, price: float) -> None:
        trade = self.bot_state.active_trade
        if not trade:
            return

        event = trade.check_outcome(price)
        if event == 'TP1_HIT':
            self.journal.log_tp1_hit(trade.zone_id, price)
            return  # continue managing for TP2

        if event in ('TP2_HIT', 'SL_HIT'):
            self.journal.log_trade_closed(trade.zone_id, price, event)
            self._enter_cooldown()

    def _enter_cooldown(self) -> None:
        mins = self.cfg.get('cooldown_minutes', 30)
        self.bot_state.active_trade = None
        self.bot_state.armed_zone_id = None
        self.bot_state.cooldown_until = (
            datetime.now(timezone.utc) + timedelta(minutes=mins)
        )
        self.bot_state.transition(State.COOLDOWN)
        log.info(f'[COOL]   {mins}min cooldown started')

    # ── Utilities ─────────────────────────────────────────────────────────────

    def _get_price(self) -> float | None:
        return _live_price(self.base_url)

    def _push_status(self) -> None:
        zones_summary = [
            {'zone_id': z.zone_id, 'score': z.score,
             'gp': f'{z.gp_low:.1f}–{z.gp_high:.1f}',
             'tf': z.tf, 'dir': z.direction}
            for z in self.zones[:5]
        ]
        status = {
            'bot': 'gold_bot',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'state': self.bot_state.state.value,
            'htf_bias': self.htf_bias.bias if self.htf_bias else 'UNKNOWN',
            'zones_active': len([z for z in self.zones if z.active]),
            'top_zones': zones_summary,
            'trades_today': self.trades_today,
            'paper_mode': self.cfg.get('paper_mode', True),
            'squeeze_ratio': self.squeeze_ratio,
        }
        _kv_put_status('gold_bot_status', status, self.base_url)

    def _push_zones_kv(self) -> None:
        """Push the full zone map, nPOC stack, VWAP anchors, and trendlines to KV.

        Dashboard reads 'gold_bot_zones' to overlay zones, anchors, and naked
        POCs directly on the chart — no manual configuration needed.
        """
        try:
            payload = {
                'timestamp':      datetime.now(timezone.utc).isoformat(),
                'htf_bias':       self.htf_bias.bias if self.htf_bias else 'UNKNOWN',
                'htf_confidence': round(self.htf_bias.confidence, 2) if self.htf_bias else 0.0,
                'session':        self.sess_lvls.current_session if self.sess_lvls else 'UNKNOWN',
                'vwap':           self.sess_lvls.vwap if self.sess_lvls else 0.0,
                'bot_state':      self.bot_state.state.value,
                'armed_zone':     self.bot_state.armed_zone_id,
                'squeeze_ratio':  self.squeeze_ratio,
                'zones': [
                    {
                        'zone_id':      z.zone_id,
                        'tf':           z.tf,
                        'direction':    z.direction,
                        'zone_variant': z.zone_variant,
                        'gp_low':       z.gp_low,
                        'gp_high':      z.gp_high,
                        'zone_low':     z.zone_low,
                        'zone_high':    z.zone_high,
                        'level_382':    z.level_382,
                        'level_618':    z.level_618,
                        'level_650':    z.level_650,
                        'level_786':    z.level_786,
                        'level_886':    z.level_886,
                        'score':        z.score,
                        'htf_aligned':  z.htf_aligned,
                        'composition':  z.composition,
                    }
                    for z in self.zones if z.active
                ],
                'npoc_stack': [
                    {'price': n.price, 'age_days': n.age_days, 'date': n.date}
                    for n in (self.vol_prof.npoc_stack if self.vol_prof else [])
                ],
                'vwap_anchors': [
                    {
                        'price':      a.price,
                        'session':    a.session,
                        'age_days':   a.age_days,
                        'direction':  a.direction,
                        'drive_size': a.drive_size,
                        'date':       a.date,
                    }
                    for a in (self.sess_lvls.vwap_anchors if self.sess_lvls else [])
                ],
                'trendlines': [
                    {
                        'tf':        tl.tf,
                        'kind':      tl.kind,
                        'touches':   tl.touches,
                        'projected': tl.projected,
                        'slope':     tl.slope,
                    }
                    for tl in self.trendlines
                ],
            }
            url = f'{self.base_url}/api/kv/set'
            requests.post(url, json={'key': 'gold_bot_zones', 'data': payload}, timeout=5)
        except Exception:
            pass


# ── ATR helpers ──────────────────────────────────────────────────────────────

def _atr_from_list(bars: list[dict], period: int = 14) -> float:
    """EMA-smoothed ATR from plain list[dict]. Adapter for bot/utils compute_atr."""
    if len(bars) < 2:
        return 5.0
    alpha = 0.15
    tr = abs(bars[1]['high'] - bars[1]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * tr
    return round(tr, 4)


def _atr_squeeze(bars: list[dict]) -> float:
    """
    Returns ATR(14) / ATR(100) ratio. Values well below 1.0 indicate
    the market is in an ATR compression — less volatile than its recent
    baseline, often preceding a sharp expansion. In compression, only the
    highest-scoring zones are worth arming (adaptive min score applies).
    """
    if len(bars) < 100:
        return 1.0
    short  = _atr_from_list(bars[-14:])
    medium = _atr_from_list(bars[-100:])
    return round(short / medium, 3) if medium > 0 else 1.0


# Monkey-patch the bot to use the plain-list ATR
GoldBot._atr_from_list = staticmethod(_atr_from_list)


# ── Entry point ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Gold Bot — XAU/USD Max strategy')
    p.add_argument('--live',            action='store_true',
                   help='Send real orders to MT5 (default: paper)')
    p.add_argument('--price-interval',  type=float, default=3.0,
                   metavar='SECS',      help='Price tick interval (default 3s)')
    p.add_argument('--state-interval',  type=float, default=120.0,
                   metavar='SECS',      help='State refresh interval (default 120s)')
    p.add_argument('--once',            action='store_true',
                   help='Run a single state refresh + price tick then exit')
    p.add_argument('--log-dir',         default='.',
                   metavar='DIR',       help='Directory for gold_journal.jsonl and gold_trades.csv')
    p.add_argument('--dashboard-url',   default=None,
                   metavar='URL',       help='Override dashboard base URL')
    return p.parse_args()


if __name__ == '__main__':
    args = _parse_args()
    _setup_logging(args.log_dir)

    if args.dashboard_url:
        os.environ['DASHBOARD_URL'] = args.dashboard_url

    bot = GoldBot(args)
    bot.cfg['paper_mode'] = not args.live

    # Override ATR calculation to use plain-list version in state refresh
    import types
    orig_refresh = GoldBot._state_refresh
    def _patched_refresh(self):
        orig_refresh(self)
        # Re-compute ATR using our list-compatible version
        m15 = _bars(SYMBOL, 'M15', 100)
        if m15:
            self.atr_15m = _atr_from_list(m15)
    bot._state_refresh = types.MethodType(_patched_refresh, bot)

    bot.start()
