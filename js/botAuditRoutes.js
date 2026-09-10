/**
 * botAuditRoutes — the backtest reference behind `bot-audit.html`'s overlay.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A FETCH FROM THE PAGE.
 * The overlay is only worth anything if the backtest behind it ran the SAME
 * config production runs. `/api/asia-fib-atlas/vote-portfolio` takes ~14 query
 * parameters, every one of which defaults to something *other* than the frozen
 * production value (minMargin defaults to 2 but stopTightenFrac, minCostRatio
 * and maxGapMin all default to null — i.e. filters OFF). A page assembling that
 * query by hand is one forgotten parameter away from overlaying a looser
 * backtest, which would look authoritative and be wrong — exactly the failure
 * `MD files/LIVE_BACKTEST_ALIGNMENT.md` T2 warns about, and the reason
 * `FA_DAILY_TRADE_REFERENCE` in js/bot-config.js labours the point that its
 * numbers came from "EXACTLY what production runs, not a looser/older config".
 *
 * So the parameters are resolved HERE, from the same exported constants the
 * live zone path uses (`FIB_ATLAS_MIN_MARGIN` et al). If production's frozen
 * values change, this moves with them; there is no second copy to forget.
 *
 * WHAT IS DELIBERATELY NOT WIRED. Only Fib Atlas. Level Atlas and MacroEquity
 * have fetchable curves too, but nobody has verified that those backtests
 * correspond to what their live bots actually run — and an unverified overlay
 * is worse than none, because the page makes it look checked. Each one gets
 * wired when its config has been confirmed, not before. Every other bot returns
 * `available:false` with the reason, so the UI can say "not wired" rather than
 * draw a blank chart that reads as agreement.
 */

import {
  FIB_ATLAS_MIN_MARGIN, FIB_ATLAS_MIN_COST_RATIO,
  FIB_ATLAS_STOP_TIGHTEN_FRAC, FIB_ATLAS_MAX_GAP_MIN,
} from './asiaFibAtlasRoutes.js';

// Bots with no verified backtest counterpart, and the honest reason. Shown to
// the user as-is — "not wired" is a fact about our plumbing, not about the bot.
const NOT_WIRED = {
  bot_status:                'MacroFX trades the live confluence path, which the Asia-range backtest does not reproduce (LEGO_MODULES.md drift #8).',
  volatility_bot_v2_status:  'Level Atlas has a vote-portfolio backtest, but it has not been confirmed to run the same config as the live Vote Atlas bot.',
  macro_equity_bot_status:   'A backtest exists (/api/macro-equity-backtest/results) but its config has not been checked against the live bot.',
};

export function mountBotAuditRoutes(app, express, { fibAtlasPairs = [], buildFibAtlasCurve = null } = {}) {

  // GET /api/bot-audit/backtest-curve?bot=<status key>
  //
  // Returns the bot's reference backtest as a DAILY RETURN SERIES (percent of
  // NAV per day) plus the config it was produced under. Daily returns rather
  // than a finished curve because the page derives several things from them —
  // the cumulative curve, the growth cone, and the clipped same-dates view —
  // and re-fetching per view would pay the R2 cost three times.
  app.get('/api/bot-audit/backtest-curve', async (req, res) => {
    const bot = String(req.query.bot || '');
    try {
      if (bot !== 'fib_atlas_bot_status') {
        return res.json({
          ok: true, bot, available: false,
          reason: NOT_WIRED[bot] || 'No backtest is wired to this bot yet.',
        });
      }
      if (!buildFibAtlasCurve) {
        return res.json({ ok: true, bot, available: false, wired: true, reason: 'Fib Atlas portfolio builder not mounted.' });
      }

      // Production config, resolved from the live path's own frozen constants.
      // `throttleOn`/`maxHeatPct` mirror the hedge-only concurrency the
      // reference in js/bot-config.js was computed under.
      const config = {
        pairs: fibAtlasPairs,
        ladders: ['asia', 'monday'],
        minMargin: FIB_ATLAS_MIN_MARGIN,
        minCostRatio: FIB_ATLAS_MIN_COST_RATIO,
        stopTightenFrac: FIB_ATLAS_STOP_TIGHTEN_FRAC,
        maxGapMin: FIB_ATLAS_MAX_GAP_MIN,
        continuationExit: 'chandelier',
        maxConcurrent: 1,
        riskPct: 1,
        targetVol: 10,
      };

      // `wired: true` from here on. The distinction matters to the reader:
      // "no backtest corresponds to this bot" is a permanent fact about our
      // plumbing, while "the build failed" is a transient fault they might fix
      // (missing R2 credentials locally, a stale blob, a cold cache). Collapsing
      // both into "not wired" sends someone looking for the wrong problem.
      const built = await buildFibAtlasCurve(config);
      if (!built || built.error) {
        return res.json({ ok: true, bot, available: false, wired: true, reason: built?.error || 'Backtest build returned nothing.' });
      }

      // equityCurve is [{date, dailyReturn}] — hand it over unchanged rather
      // than pre-compounding, so the page can compound it once for whichever
      // view it is drawing.
      const daily = (built.equityCurve || [])
        .filter(d => d && d.date != null && Number.isFinite(d.dailyReturn))
        .map(d => ({ date: d.date, ret: d.dailyReturn }));

      if (daily.length < 30) {
        return res.json({ ok: true, bot, available: false, wired: true, reason: `Backtest returned only ${daily.length} days — too few to overlay.` });
      }

      res.json({
        ok: true, bot, available: true,
        source: 'asia+monday fib-atlas vote portfolio',
        configLabel: `${config.pairs.length} pairs · both ladders · margin≥${config.minMargin} · gap≤${config.maxGapMin}m · cost≥${config.minCostRatio}× · chandelier`,
        config,
        from: daily[0].date, to: daily[daily.length - 1].date, days: daily.length,
        daily,
        stats: built.stats || null,
        trades: built.trades ? built.trades.length : null,
      });
    } catch (e) {
      res.status(500).json({ ok: false, bot, available: false, wired: bot === 'fib_atlas_bot_status', error: e.message });
    }
  });
}
