import { S } from './state.js';
import { CAP_DEFAULTS, KALMAN5M_DEFAULTS } from './config.js';

export async function loadCaps() {
  try {
    const res = await fetch('/api/config/caps');
    if (!res.ok) throw new Error('caps ' + res.status);
    S._caps = await res.json();
  } catch(e) {
    console.warn('Caps load failed, using defaults:', e.message);
    S._caps = CAP_DEFAULTS;
  }
}

const _EQUITY_CAP = { 'NAS100_USD': 'nas100', 'SPX500_USD': 'spx500', 'DE30_USD': 'de30', 'UK100_GBP': 'uk100', 'US30_USD': 'us30', 'US2000_USD': 'us2000' };

export function getCaps(sym) {
  const cfg = S._caps || CAP_DEFAULTS;
  if (sym && sym.includes('XAU')) return cfg.gold;
  const eqKey = _EQUITY_CAP[sym];
  if (eqKey) return cfg[eqKey] || CAP_DEFAULTS[eqKey] || cfg.nas100;
  return cfg.fx;
}

export async function openCfgModal() {
  document.getElementById('cfgOverlay').classList.add('open');
  try {
    const res = await fetch('/api/config/caps');
    if (res.ok) {
      S._caps = await res.json();
      populateCfgForm(S._caps);
      const kvStatus = document.getElementById('cfgKVStatus');
      if (S._caps.updatedAt) {
        kvStatus.innerHTML = `<div class="cfg-kv-ok">✓ KV connected — last saved ${new Date(S._caps.updatedAt).toLocaleString()}</div>`;
        document.getElementById('cfgUpdatedAt').textContent = '';
      } else {
        const cfgRes = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
        if (cfgRes.hasKV) {
          kvStatus.innerHTML = `<div class="cfg-kv-ok">✓ KV bound — using defaults (not yet saved)</div>`;
        } else {
          kvStatus.innerHTML = `<div class="cfg-kv-warn">⚠ FX_SCORES KV namespace not bound. Values will not persist across deploys.<br>
            Go to Cloudflare Pages → Settings → Functions → KV namespace bindings → Add: Variable <strong>FX_SCORES</strong>. Create a new KV namespace if needed.</div>`;
        }
      }
    }
  } catch(e) {
    document.getElementById('cfgKVStatus').innerHTML = `<div class="cfg-kv-warn">⚠ Could not reach /api/config/caps — worker may not be deployed</div>`;
    populateCfgForm(CAP_DEFAULTS);
  }
}

export function closeCfgModal() {
  document.getElementById('cfgOverlay').classList.remove('open');
  document.getElementById('cfgSaveStatus').textContent = '';
}

function populateCfgForm(caps) {
  const fill = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  const fx   = caps.fx   || CAP_DEFAULTS.fx;
  const gold = caps.gold || CAP_DEFAULTS.gold;
  fill('fx_confluencePips',  fx.confluencePips);
  fill('fx_mergeFactor',     fx.mergeFactor);
  fill('fx_asiaMinPips',              fx.asiaMinPips);
  fill('fx_structuralLookbackDays',   fx.structuralLookbackDays);
  fill('fx_structuralPivotN',         fx.structuralPivotN);
  fill('fx_oiAtrFrac',     fx.oiAtrFrac);
  fill('fx_oiPipCap',      fx.oiPipCap);
  fill('fx_pivAtrFrac',    fx.pivAtrFrac);
  fill('fx_pivPipCap',     fx.pivPipCap);
  fill('fx_rngAtrFrac',    fx.rngAtrFrac);
  fill('fx_rngPipCap',     fx.rngPipCap);
  fill('fx_gexAtrFrac',    fx.gexAtrFrac);
  fill('fx_gexPipCap',     fx.gexPipCap);
  fill('fx_enhPivAtrFrac', fx.enhPivAtrFrac);
  fill('fx_enhPivPipCap',  fx.enhPivPipCap);
  fill('gold_confluencePips',  gold.confluencePips);
  fill('gold_mergeFactor',     gold.mergeFactor);
  fill('gold_asiaMinPips',              gold.asiaMinPips);
  fill('gold_structuralLookbackDays',   gold.structuralLookbackDays);
  fill('gold_structuralPivotN',         gold.structuralPivotN);
  fill('gold_oiAtrFrac',     gold.oiAtrFrac);
  fill('gold_oiPipCap',      gold.oiPipCap);
  fill('gold_pivAtrFrac',    gold.pivAtrFrac);
  fill('gold_pivPipCap',     gold.pivPipCap);
  fill('gold_rngAtrFrac',    gold.rngAtrFrac);
  fill('gold_rngPipCap',     gold.rngPipCap);
  fill('gold_gexAtrFrac',    gold.gexAtrFrac);
  fill('gold_gexPipCap',     gold.gexPipCap);
  fill('gold_enhPivAtrFrac', gold.enhPivAtrFrac);
  fill('gold_enhPivPipCap',  gold.enhPivPipCap);
  const nas100 = caps.nas100 || CAP_DEFAULTS.nas100;
  fill('nas100_confluencePips',  nas100.confluencePips);
  fill('nas100_mergeFactor',     nas100.mergeFactor);
  fill('nas100_asiaMinPips',     nas100.asiaMinPips);
  fill('nas100_structuralLookbackDays', nas100.structuralLookbackDays);
  fill('nas100_structuralPivotN',       nas100.structuralPivotN);
  fill('nas100_oiAtrFrac',     nas100.oiAtrFrac);
  fill('nas100_oiPipCap',      nas100.oiPipCap);
  fill('nas100_pivAtrFrac',    nas100.pivAtrFrac);
  fill('nas100_pivPipCap',     nas100.pivPipCap);
  fill('nas100_rngAtrFrac',    nas100.rngAtrFrac);
  fill('nas100_rngPipCap',     nas100.rngPipCap);
  fill('nas100_gexAtrFrac',    nas100.gexAtrFrac);
  fill('nas100_gexPipCap',     nas100.gexPipCap);
  fill('nas100_enhPivAtrFrac', nas100.enhPivAtrFrac);
  fill('nas100_enhPivPipCap',  nas100.enhPivPipCap);
  const spx500 = caps.spx500 || CAP_DEFAULTS.spx500;
  fill('spx500_confluencePips',  spx500.confluencePips);
  fill('spx500_mergeFactor',     spx500.mergeFactor);
  fill('spx500_asiaMinPips',     spx500.asiaMinPips);
  fill('spx500_structuralLookbackDays', spx500.structuralLookbackDays);
  fill('spx500_structuralPivotN',       spx500.structuralPivotN);
  fill('spx500_oiAtrFrac',     spx500.oiAtrFrac);
  fill('spx500_oiPipCap',      spx500.oiPipCap);
  fill('spx500_pivAtrFrac',    spx500.pivAtrFrac);
  fill('spx500_pivPipCap',     spx500.pivPipCap);
  fill('spx500_rngAtrFrac',    spx500.rngAtrFrac);
  fill('spx500_rngPipCap',     spx500.rngPipCap);
  fill('spx500_gexAtrFrac',    spx500.gexAtrFrac);
  fill('spx500_gexPipCap',     spx500.gexPipCap);
  fill('spx500_enhPivAtrFrac', spx500.enhPivAtrFrac);
  fill('spx500_enhPivPipCap',  spx500.enhPivPipCap);
  const de30 = caps.de30 || CAP_DEFAULTS.de30;
  fill('de30_confluencePips',  de30.confluencePips);
  fill('de30_mergeFactor',     de30.mergeFactor);
  fill('de30_asiaMinPips',     de30.asiaMinPips);
  fill('de30_structuralLookbackDays', de30.structuralLookbackDays);
  fill('de30_structuralPivotN',       de30.structuralPivotN);
  fill('de30_oiAtrFrac',     de30.oiAtrFrac);
  fill('de30_oiPipCap',      de30.oiPipCap);
  fill('de30_pivAtrFrac',    de30.pivAtrFrac);
  fill('de30_pivPipCap',     de30.pivPipCap);
  fill('de30_rngAtrFrac',    de30.rngAtrFrac);
  fill('de30_rngPipCap',     de30.rngPipCap);
  fill('de30_gexAtrFrac',    de30.gexAtrFrac);
  fill('de30_gexPipCap',     de30.gexPipCap);
  fill('de30_enhPivAtrFrac', de30.enhPivAtrFrac);
  fill('de30_enhPivPipCap',  de30.enhPivPipCap);
  const uk100 = caps.uk100 || CAP_DEFAULTS.uk100;
  fill('uk100_confluencePips',  uk100.confluencePips);
  fill('uk100_mergeFactor',     uk100.mergeFactor);
  fill('uk100_asiaMinPips',     uk100.asiaMinPips);
  fill('uk100_structuralLookbackDays', uk100.structuralLookbackDays);
  fill('uk100_structuralPivotN',       uk100.structuralPivotN);
  fill('uk100_oiAtrFrac',     uk100.oiAtrFrac);
  fill('uk100_oiPipCap',      uk100.oiPipCap);
  fill('uk100_pivAtrFrac',    uk100.pivAtrFrac);
  fill('uk100_pivPipCap',     uk100.pivPipCap);
  fill('uk100_rngAtrFrac',    uk100.rngAtrFrac);
  fill('uk100_rngPipCap',     uk100.rngPipCap);
  fill('uk100_gexAtrFrac',    uk100.gexAtrFrac);
  fill('uk100_gexPipCap',     uk100.gexPipCap);
  fill('uk100_enhPivAtrFrac', uk100.enhPivAtrFrac);
  fill('uk100_enhPivPipCap',  uk100.enhPivPipCap);
  const us30 = caps.us30 || CAP_DEFAULTS.us30;
  fill('us30_confluencePips',  us30.confluencePips);
  fill('us30_mergeFactor',     us30.mergeFactor);
  fill('us30_asiaMinPips',     us30.asiaMinPips);
  fill('us30_structuralLookbackDays', us30.structuralLookbackDays);
  fill('us30_structuralPivotN',       us30.structuralPivotN);
  fill('us30_oiAtrFrac',     us30.oiAtrFrac);
  fill('us30_oiPipCap',      us30.oiPipCap);
  fill('us30_pivAtrFrac',    us30.pivAtrFrac);
  fill('us30_pivPipCap',     us30.pivPipCap);
  fill('us30_rngAtrFrac',    us30.rngAtrFrac);
  fill('us30_rngPipCap',     us30.rngPipCap);
  fill('us30_gexAtrFrac',    us30.gexAtrFrac);
  fill('us30_gexPipCap',     us30.gexPipCap);
  fill('us30_enhPivAtrFrac', us30.enhPivAtrFrac);
  fill('us30_enhPivPipCap',  us30.enhPivPipCap);
  const us2000 = caps.us2000 || CAP_DEFAULTS.us2000;
  fill('us2000_confluencePips',  us2000.confluencePips);
  fill('us2000_mergeFactor',     us2000.mergeFactor);
  fill('us2000_asiaMinPips',     us2000.asiaMinPips);
  fill('us2000_structuralLookbackDays', us2000.structuralLookbackDays);
  fill('us2000_structuralPivotN',       us2000.structuralPivotN);
  fill('us2000_oiAtrFrac',     us2000.oiAtrFrac);
  fill('us2000_oiPipCap',      us2000.oiPipCap);
  fill('us2000_pivAtrFrac',    us2000.pivAtrFrac);
  fill('us2000_pivPipCap',     us2000.pivPipCap);
  fill('us2000_rngAtrFrac',    us2000.rngAtrFrac);
  fill('us2000_rngPipCap',     us2000.rngPipCap);
  fill('us2000_gexAtrFrac',    us2000.gexAtrFrac);
  fill('us2000_gexPipCap',     us2000.gexPipCap);
  fill('us2000_enhPivAtrFrac', us2000.enhPivAtrFrac);
  fill('us2000_enhPivPipCap',  us2000.enhPivPipCap);
  const k5 = caps.kalman5m || KALMAN5M_DEFAULTS;
  fill('kalman5m_lookback',      k5.lookback);
  fill('kalman5m_processNoise',  k5.processNoise);
  fill('kalman5m_observNoise',   k5.observNoise);
  fill('kalman5m_threshold',     k5.threshold);
  fill('kalman5m_longScore',     k5.longScore);
  fill('kalman5m_shortScore',    k5.shortScore);

  // Global confluence mode
  const modeEl = document.getElementById('conf_priceMode');
  if (modeEl) modeEl.value = caps.confluencePriceMode ?? 'midpoint';
  const mergeEl = document.getElementById('conf_clusterMerge');
  if (mergeEl) mergeEl.value = String(caps.clusterMerge ?? true);
  fill('conf_slMaxAtrMult', caps.slMaxAtrMult ?? 0.5);
}

function readCfgForm() {
  const num = id => parseFloat(document.getElementById(id)?.value) || null;
  const str = id => document.getElementById(id)?.value ?? null;
  return {
    confluencePriceMode: str('conf_priceMode')    ?? 'midpoint',
    clusterMerge:        str('conf_clusterMerge') !== 'false',
    slMaxAtrMult:        parseFloat(document.getElementById('conf_slMaxAtrMult')?.value) || 0.5,
    fx: {
      confluencePips: num('fx_confluencePips'),
      mergeFactor:    num('fx_mergeFactor'),
      asiaMinPips:            num('fx_asiaMinPips'),
      structuralLookbackDays: num('fx_structuralLookbackDays'),
      structuralPivotN:       num('fx_structuralPivotN'),
      oiAtrFrac:     num('fx_oiAtrFrac'),
      oiPipCap:      num('fx_oiPipCap'),
      pivAtrFrac:    num('fx_pivAtrFrac'),
      pivPipCap:     num('fx_pivPipCap'),
      rngAtrFrac:    num('fx_rngAtrFrac'),
      rngPipCap:     num('fx_rngPipCap'),
      gexAtrFrac:    num('fx_gexAtrFrac'),
      gexPipCap:     num('fx_gexPipCap'),
      enhPivAtrFrac: num('fx_enhPivAtrFrac'),
      enhPivPipCap:  num('fx_enhPivPipCap'),
    },
    gold: {
      confluencePips: num('gold_confluencePips'),
      mergeFactor:    num('gold_mergeFactor'),
      asiaMinPips:            num('gold_asiaMinPips'),
      structuralLookbackDays: num('gold_structuralLookbackDays'),
      structuralPivotN:       num('gold_structuralPivotN'),
      oiAtrFrac:     num('gold_oiAtrFrac'),
      oiPipCap:      num('gold_oiPipCap'),
      pivAtrFrac:    num('gold_pivAtrFrac'),
      pivPipCap:     num('gold_pivPipCap'),
      rngAtrFrac:    num('gold_rngAtrFrac'),
      rngPipCap:     num('gold_rngPipCap'),
      gexAtrFrac:    num('gold_gexAtrFrac'),
      gexPipCap:     num('gold_gexPipCap'),
      enhPivAtrFrac: num('gold_enhPivAtrFrac'),
      enhPivPipCap:  num('gold_enhPivPipCap'),
    },
    nas100: {
      confluencePips: num('nas100_confluencePips'),
      mergeFactor:    num('nas100_mergeFactor'),
      asiaMinPips:            num('nas100_asiaMinPips'),
      structuralLookbackDays: num('nas100_structuralLookbackDays'),
      structuralPivotN:       num('nas100_structuralPivotN'),
      oiAtrFrac:     num('nas100_oiAtrFrac'),
      oiPipCap:      num('nas100_oiPipCap'),
      pivAtrFrac:    num('nas100_pivAtrFrac'),
      pivPipCap:     num('nas100_pivPipCap'),
      rngAtrFrac:    num('nas100_rngAtrFrac'),
      rngPipCap:     num('nas100_rngPipCap'),
      gexAtrFrac:    num('nas100_gexAtrFrac'),
      gexPipCap:     num('nas100_gexPipCap'),
      enhPivAtrFrac: num('nas100_enhPivAtrFrac'),
      enhPivPipCap:  num('nas100_enhPivPipCap'),
    },
    spx500: {
      confluencePips: num('spx500_confluencePips'),
      mergeFactor:    num('spx500_mergeFactor'),
      asiaMinPips:            num('spx500_asiaMinPips'),
      structuralLookbackDays: num('spx500_structuralLookbackDays'),
      structuralPivotN:       num('spx500_structuralPivotN'),
      oiAtrFrac:     num('spx500_oiAtrFrac'),
      oiPipCap:      num('spx500_oiPipCap'),
      pivAtrFrac:    num('spx500_pivAtrFrac'),
      pivPipCap:     num('spx500_pivPipCap'),
      rngAtrFrac:    num('spx500_rngAtrFrac'),
      rngPipCap:     num('spx500_rngPipCap'),
      gexAtrFrac:    num('spx500_gexAtrFrac'),
      gexPipCap:     num('spx500_gexPipCap'),
      enhPivAtrFrac: num('spx500_enhPivAtrFrac'),
      enhPivPipCap:  num('spx500_enhPivPipCap'),
    },
    de30: {
      confluencePips: num('de30_confluencePips'),
      mergeFactor:    num('de30_mergeFactor'),
      asiaMinPips:            num('de30_asiaMinPips'),
      structuralLookbackDays: num('de30_structuralLookbackDays'),
      structuralPivotN:       num('de30_structuralPivotN'),
      oiAtrFrac:     num('de30_oiAtrFrac'),
      oiPipCap:      num('de30_oiPipCap'),
      pivAtrFrac:    num('de30_pivAtrFrac'),
      pivPipCap:     num('de30_pivPipCap'),
      rngAtrFrac:    num('de30_rngAtrFrac'),
      rngPipCap:     num('de30_rngPipCap'),
      gexAtrFrac:    num('de30_gexAtrFrac'),
      gexPipCap:     num('de30_gexPipCap'),
      enhPivAtrFrac: num('de30_enhPivAtrFrac'),
      enhPivPipCap:  num('de30_enhPivPipCap'),
    },
    uk100: {
      confluencePips: num('uk100_confluencePips'),
      mergeFactor:    num('uk100_mergeFactor'),
      asiaMinPips:            num('uk100_asiaMinPips'),
      structuralLookbackDays: num('uk100_structuralLookbackDays'),
      structuralPivotN:       num('uk100_structuralPivotN'),
      oiAtrFrac:     num('uk100_oiAtrFrac'),
      oiPipCap:      num('uk100_oiPipCap'),
      pivAtrFrac:    num('uk100_pivAtrFrac'),
      pivPipCap:     num('uk100_pivPipCap'),
      rngAtrFrac:    num('uk100_rngAtrFrac'),
      rngPipCap:     num('uk100_rngPipCap'),
      gexAtrFrac:    num('uk100_gexAtrFrac'),
      gexPipCap:     num('uk100_gexPipCap'),
      enhPivAtrFrac: num('uk100_enhPivAtrFrac'),
      enhPivPipCap:  num('uk100_enhPivPipCap'),
    },
    us30: {
      confluencePips: num('us30_confluencePips'),
      mergeFactor:    num('us30_mergeFactor'),
      asiaMinPips:            num('us30_asiaMinPips'),
      structuralLookbackDays: num('us30_structuralLookbackDays'),
      structuralPivotN:       num('us30_structuralPivotN'),
      oiAtrFrac:     num('us30_oiAtrFrac'),
      oiPipCap:      num('us30_oiPipCap'),
      pivAtrFrac:    num('us30_pivAtrFrac'),
      pivPipCap:     num('us30_pivPipCap'),
      rngAtrFrac:    num('us30_rngAtrFrac'),
      rngPipCap:     num('us30_rngPipCap'),
      gexAtrFrac:    num('us30_gexAtrFrac'),
      gexPipCap:     num('us30_gexPipCap'),
      enhPivAtrFrac: num('us30_enhPivAtrFrac'),
      enhPivPipCap:  num('us30_enhPivPipCap'),
    },
    us2000: {
      confluencePips: num('us2000_confluencePips'),
      mergeFactor:    num('us2000_mergeFactor'),
      asiaMinPips:            num('us2000_asiaMinPips'),
      structuralLookbackDays: num('us2000_structuralLookbackDays'),
      structuralPivotN:       num('us2000_structuralPivotN'),
      oiAtrFrac:     num('us2000_oiAtrFrac'),
      oiPipCap:      num('us2000_oiPipCap'),
      pivAtrFrac:    num('us2000_pivAtrFrac'),
      pivPipCap:     num('us2000_pivPipCap'),
      rngAtrFrac:    num('us2000_rngAtrFrac'),
      rngPipCap:     num('us2000_rngPipCap'),
      gexAtrFrac:    num('us2000_gexAtrFrac'),
      gexPipCap:     num('us2000_gexPipCap'),
      enhPivAtrFrac: num('us2000_enhPivAtrFrac'),
      enhPivPipCap:  num('us2000_enhPivPipCap'),
    },
    kalman5m: {
      lookback:     num('kalman5m_lookback'),
      processNoise: num('kalman5m_processNoise'),
      observNoise:  num('kalman5m_observNoise'),
      threshold:    num('kalman5m_threshold'),
      longScore:    num('kalman5m_longScore'),
      shortScore:   num('kalman5m_shortScore'),
    },
  };
}

export async function saveCaps() {
  const btn    = document.getElementById('cfgSaveBtn');
  const status = document.getElementById('cfgSaveStatus');
  btn.disabled = true;
  status.textContent = 'Saving…';
  status.className = 'cfg-status';

  const payload = readCfgForm();

  const allVals = [
    ...Object.values(payload.fx),
    ...Object.values(payload.gold),
    ...Object.values(payload.nas100),
    ...Object.values(payload.spx500),
    ...Object.values(payload.de30),
    ...Object.values(payload.uk100),
    ...Object.values(payload.us30),
    ...Object.values(payload.us2000),
    ...Object.values(payload.kalman5m),
  ];
  if (allVals.some(v => v == null || (typeof v === 'number' && v <= 0))) {
    status.textContent = '⚠ All values must be positive numbers';
    status.className = 'cfg-status err';
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/api/config/caps', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      S._caps = { ...payload, updatedAt: data.saved.updatedAt };
      status.textContent = '✓ Saved to KV';
      status.className = 'cfg-status ok';
      document.getElementById('cfgUpdatedAt').textContent = 'Saved ' + new Date(data.saved.updatedAt).toLocaleTimeString();
      document.getElementById('cfgKVStatus').innerHTML = `<div class="cfg-kv-ok">✓ Saved to KV at ${new Date(data.saved.updatedAt).toLocaleString()}</div>`;
      if (window._latestQuote && S.fredData) window.renderAll();
    } else {
      status.textContent = '⚠ ' + (data.error || 'Save failed');
      status.className = 'cfg-status err';
    }
  } catch(e) {
    status.textContent = '⚠ ' + e.message;
    status.className = 'cfg-status err';
  }
  btn.disabled = false;
}

export function resetCaps() {
  populateCfgForm(CAP_DEFAULTS);
  document.getElementById('cfgSaveStatus').textContent = 'Defaults loaded — click Save to apply';
  document.getElementById('cfgSaveStatus').className = 'cfg-status';
}
