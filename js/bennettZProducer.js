// Bennett-Z bot plan producer (server side).
//
// Once a day, compute the current yield-spread z-score per pair using the VALIDATED
// engine math (js/bennettZEngine.computeBennettZSignals) and write a frozen plan to the
// `bennett_z_plan` KV key. The Python bot reads that plan + its config and executes MT5
// orders — it never runs the z-math itself (single source of truth; PYTHON_LEGO.md's
// generate-don't-port rule, mirroring js/volatilityBotProducer.js).
//
// The plan carries the daily z per pair PLUS the strategy thresholds, so the signal and
// the thresholds it's judged against are always consistent. Operational config (paper,
// risk %, enabled pairs, MT5 creds) lives separately in `bennett_z_config` /
// `bennett_z_credentials`, which the bot reads directly.
//
// IO is injected (getConfig / computeSignals / kvPut / now) so this is offline-testable.

export const BENNETT_Z_DEFAULTS = {
  enabled: false,
  paper: true,                       // validated NOT proven — live only when the user opts in
  pairs: ['usdjpy', 'eurusd', 'gbpusd', 'audusd', 'usdcad', 'usdchf'],
  entryThreshold: 2.0,               // sweep's highest honest-Sharpe cell (2.0 / 90)
  zWindow: 90,
  zExit: 1.5,
  maxHoldDays: 20,
  riskPct: 0.5,                      // flat risk % per trade (z-tier sizing is backwards)
  orient: true,                      // orient sign by USD role (USD-quote pairs flip)
  pubLagUsDays: 2,
  pubLagForeignDays: 45,
  slAtrMult: 3.0,                    // WIDE protective SL (gap insurance; z-exit is primary)
  maxLot: 5,
};

export async function refreshBennettZPlan({ getConfig, computeSignals, kvPut, now = () => new Date().toISOString() }) {
  const stored = (await getConfig()) || {};
  const cfg = { ...BENNETT_Z_DEFAULTS, ...stored };
  const pairs = Array.isArray(cfg.pairs) && cfg.pairs.length ? cfg.pairs : BENNETT_Z_DEFAULTS.pairs;

  const signals = await computeSignals({
    zWindow: cfg.zWindow,
    pubLagUsDays: cfg.pubLagUsDays,
    pubLagForeignDays: cfg.pubLagForeignDays,
    autoOrient: cfg.orient !== false,
  }, pairs);

  const plan = {
    generatedAt: now(),
    strategy: 'bennett-z',
    entryThreshold: cfg.entryThreshold,
    zExit: cfg.zExit,
    zWindow: cfg.zWindow,
    maxHoldDays: cfg.maxHoldDays,
    orient: cfg.orient !== false,
    universe: pairs,
    signals,   // { pair: { z, spread, asOf, inverted, label, pip } }
  };

  await kvPut('bennett_z_plan', JSON.stringify({ data: plan, timestamp: now() }));
  return plan;
}
