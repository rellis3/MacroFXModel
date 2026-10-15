/**
 * One place that knows how to talk to a model, so the other sixteen do not.
 *
 * WHY. Every AI call in server.js was its own copy-pasted fetch: the URL, the headers,
 * the model name and the token budget written out sixteen times, with `claude-opus-5`
 * hardcoded in fourteen of them. Changing model meant fourteen edits, and running a
 * cheaper provider for the cheap jobs meant forking every call site. The REPLY side was
 * already behind one helper (`_antText`, which exists because reading `content[0].text`
 * broke silently when Opus started returning a thinking block first) — this is the same
 * treatment for the request side.
 *
 * WHAT IS AND IS NOT HARD ABOUT MULTI-PROVIDER. The wire format is the easy part, and
 * it is nearly all of what people expect to be difficult. DeepSeek and Moonshot (Kimi)
 * both speak the OpenAI chat-completions shape, so there are TWO adapters here, not one
 * per vendor. No call in this codebase uses tools, vision or streaming, so the whole
 * surface is text in, text out.
 *
 * The hard part is obedience. These prompts carry the desk's evidence ledger — 155
 * pre-registered findings, ~34k tokens — whose entire job is to stop the model claiming
 * things this desk has tested and falsified. Following that under long context is
 * exactly where cheaper models degrade, and the failure is SILENT: you get fluent,
 * confident analysis that contradicts a banked null. That is why js/modelAudit.js exists
 * and why nothing here decides on its own to route a ledger-carrying task to a cheap
 * model.
 *
 * MODEL IDS AND LIMITS ARE CONFIG, NOT CODE. Vendors rename models and change caps far
 * faster than this file gets edited, so every id, output cap and context size below is a
 * DEFAULT that an environment variable overrides. A wrong guess is then a Railway
 * setting, not a deploy.
 *
 * PRICES ARE NOT HARDCODED. This module reports TOKENS, which it knows, and converts to
 * money only when a price is configured. A made-up price in a cost report is worse than
 * no cost report.
 *
 * Pure: no fetch, no DOM, no process.env reads. The caller supplies config and performs
 * the request. Tested in js/modelRouter.test.mjs.
 */

/** The two wire formats, and which vendors speak them. */
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANT_KEY',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    wire: 'anthropic',
    // Explicit cache breakpoints, billed at a large discount on a hit.
    explicitCache: true,
  },
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_KEY',
    modelsUrl: 'https://api.deepseek.com/models',
    wire: 'openai',
    // DeepSeek caches context automatically; there is no breakpoint to send.
    explicitCache: false,
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    url: 'https://api.moonshot.ai/v1/chat/completions',
    keyEnv: 'MOONSHOT_KEY',
    modelsUrl: 'https://api.moonshot.ai/v1/models',
    wire: 'openai',
    explicitCache: false,
  },
};

/**
 * Default model per provider, and the output ceiling to clamp to.
 *
 * `maxOutput` is the one that bites in practice: ten call sites in server.js ask for
 * 16,000 output tokens, and a provider that caps lower does not error — it truncates,
 * and truncated JSON fails to parse somewhere far from the cause. Clamping here turns a
 * confusing parse error into a known limit.
 *
 * Override any of these with MODEL_<PROVIDER>_ID / MODEL_<PROVIDER>_MAXOUT.
 */
export const DEFAULT_MODELS = {
  anthropic: { id: 'claude-opus-5',  maxOutput: 32000, context: 200000 },
  deepseek:  { id: 'deepseek-chat',  maxOutput: 8192,  context: 65536  },
  moonshot:  { id: 'kimi-k2-0905-preview', maxOutput: 16384, context: 262144 },
};

/**
 * The jobs that call a model, grouped by what they actually need.
 *
 * This is the grouping that makes a cheap model safe to use at all. A task that carries
 * the evidence ledger is asking the model to respect 155 findings; a task that summarises
 * one news article is not. Routing them identically wastes money on one and risks the
 * other, which is why the toggle is PER TASK and not one global switch.
 */
export const TASK_CLASS = {
  // carries the full ledger: the model is being asked to obey tested nulls
  'brief':        { ledger: 'full',  label: 'Morning brief' },
  'chain':        { ledger: 'full',  label: 'Macro chain read' },
  'eod-review':   { ledger: 'brief', label: 'End-of-day review' },
  // reasoning over desk data, no ledger
  'pair':         { ledger: null,    label: 'Pair analysis' },
  'cot':          { ledger: null,    label: 'COT positioning analysis' },
  'currency':     { ledger: null,    label: 'Currency analysis' },
  'explain':      { ledger: null,    label: 'Explain a reading' },
  // summarising supplied text — the cheap jobs
  'headlines':    { ledger: null,    label: 'Headline summary',  cheapSafe: true },
  'doc-summary':  { ledger: null,    label: 'Document summary',  cheapSafe: true },
  'misc':         { ledger: null,    label: 'Other',             cheapSafe: true },
};

/** Rough token count. Only ever used for budgeting and reporting, never for billing. */
export const estimateTokens = s => Math.ceil(String(s ?? '').length / 4);

/**
 * Which provider and model should run this task?
 *
 * `cfg.tasks[task]` wins, then `cfg.provider` (the global default), then anthropic. A
 * task whose provider has no key configured falls back to the default provider rather
 * than failing — a missing DeepSeek key should make the page slower and dearer, not
 * broken.
 */
export function resolveTask(task, cfg = {}) {
  const haveKey = p => !!(cfg.keys ?? {})[p];
  const wanted = (cfg.tasks ?? {})[task] ?? cfg.provider ?? 'anthropic';
  const provider = (PROVIDERS[wanted] && haveKey(wanted)) ? wanted
    : (PROVIDERS[cfg.provider] && haveKey(cfg.provider)) ? cfg.provider
    : 'anthropic';
  const fellBack = provider !== wanted;
  const d = DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic;
  const o = (cfg.models ?? {})[provider] ?? {};
  return {
    provider,
    model: o.id ?? d.id,
    maxOutput: o.maxOutput ?? d.maxOutput,
    context: o.context ?? d.context,
    fellBack,
    why: fellBack ? `${wanted} has no key configured; used ${provider}` : null,
  };
}

/**
 * Build the HTTP request for one call.
 *
 * `standing` is content that is the SAME on every call of this task — the evidence
 * ledger. It is passed separately rather than glued into `prompt` for one reason: a
 * cache only hits on a stable PREFIX, and the ledger used to sit in the middle of a
 * prompt whose opening paragraphs are today's snapshot. Stable-first is what makes the
 * ~34k ledger cacheable at all. On Anthropic it becomes a system block with an explicit
 * cache breakpoint; on OpenAI-shaped providers it is simply the front of the system
 * message, which is where their automatic caching wants it anyway.
 */
export function buildRequest({
  provider = 'anthropic', model, system = '', standing = '', prompt = '',
  maxTokens = 4000, maxOutput = null, cache = true, temperature = null,
} = {}) {
  const P = PROVIDERS[provider];
  if (!P) throw new Error(`unknown provider: ${provider}`);
  const cap = maxOutput ?? DEFAULT_MODELS[provider]?.maxOutput ?? maxTokens;
  const max_tokens = Math.min(maxTokens, cap);
  const clamped = max_tokens < maxTokens;

  if (P.wire === 'anthropic') {
    // An array system is only used when there is standing content worth caching;
    // otherwise keep the plain string the existing calls send, so a request with no
    // ledger is byte-identical to what this codebase sent before the router existed.
    const sys = standing
      ? [
          { type: 'text', text: standing, ...(cache && P.explicitCache ? { cache_control: { type: 'ephemeral' } } : {}) },
          ...(system ? [{ type: 'text', text: system }] : []),
        ]
      : system;
    return {
      url: P.url, clamped,
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      authHeader: 'x-api-key',
      body: {
        model, max_tokens, system: sys,
        ...(temperature == null ? {} : { temperature }),
        messages: [{ role: 'user', content: prompt }],
      },
    };
  }

  // OpenAI-shaped: system is a message, and `standing` leads it so the stable half is
  // the prefix for whatever automatic caching the vendor does.
  const sysText = [standing, system].filter(Boolean).join('\n\n');
  return {
    url: P.url, clamped,
    headers: { 'Content-Type': 'application/json' },
    authHeader: 'Authorization', authPrefix: 'Bearer ',
    body: {
      model, max_tokens,
      ...(temperature == null ? {} : { temperature }),
      messages: [
        ...(sysText ? [{ role: 'system', content: sysText }] : []),
        { role: 'user', content: prompt },
      ],
    },
  };
}

/** The finished headers, with the key put where this provider wants it. */
export function authHeaders(req, key) {
  if (!key) throw new Error('no API key for this provider');
  return { ...req.headers, [req.authHeader]: (req.authPrefix ?? '') + key };
}

/**
 * Pull the reply out, whichever shape it arrived in.
 *
 * `truncated` is reported rather than thrown so the caller keeps its existing retry: the
 * Anthropic path signals it with stop_reason 'max_tokens', the OpenAI path with
 * finish_reason 'length', and a caller that only knew one of them would retry on one
 * provider and return mangled JSON on the other.
 *
 * Finding the text by TYPE and not by index is deliberate and was learned the hard way:
 * adaptive thinking puts a thinking block at content[0], and content[0].text is then
 * undefined with no error raised anywhere.
 */
export function readResponse(provider, data) {
  const P = PROVIDERS[provider];
  if (!P) throw new Error(`unknown provider: ${provider}`);

  if (P.wire === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    let text = '';
    for (const b of blocks) if (b?.type === 'text' && typeof b.text === 'string') { text = b.text; break; }
    const u = data?.usage ?? {};
    return {
      text,
      truncated: data?.stop_reason === 'max_tokens',
      stopReason: data?.stop_reason ?? null,
      usage: {
        in: u.input_tokens ?? null,
        out: u.output_tokens ?? null,
        cacheWrite: u.cache_creation_input_tokens ?? null,
        cacheRead: u.cache_read_input_tokens ?? null,
      },
    };
  }

  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const u = data?.usage ?? {};
  // DeepSeek reports its automatic cache hit under prompt_cache_hit_tokens.
  const cacheRead = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? null;
  return {
    text: typeof choice?.message?.content === 'string' ? choice.message.content : '',
    truncated: choice?.finish_reason === 'length',
    stopReason: choice?.finish_reason ?? null,
    usage: {
      in: u.prompt_tokens ?? null,
      out: u.completion_tokens ?? null,
      cacheWrite: null,
      cacheRead,
    },
  };
}

/**
 * What that call cost — in tokens always, in money only if someone configured a price.
 *
 * Prices move and vary by tier, and a fabricated number in a cost report is worse than
 * no cost report: it gets quoted later as though it were measured. `prices` is
 * {provider: {in, out, cacheRead, cacheWrite}} in currency units per MILLION tokens, and
 * with none supplied this returns tokens and `usd: null`.
 */
export function costOf(provider, usage = {}, prices = {}) {
  const p = prices[provider] ?? null;
  const tok = {
    in: usage.in ?? 0, out: usage.out ?? 0,
    cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0,
  };
  if (!p) return { ...tok, usd: null, priced: false };
  const per = (n, rate) => (rate == null ? 0 : (n / 1e6) * rate);
  return {
    ...tok, priced: true,
    usd: +(per(tok.in, p.in) + per(tok.out, p.out)
         + per(tok.cacheRead, p.cacheRead ?? p.in) + per(tok.cacheWrite, p.cacheWrite ?? p.in)).toFixed(5),
  };
}

/**
 * Read the whole configuration out of the environment.
 *
 * Keys are read but NEVER returned — `keys` holds booleans, so a config object can be
 * logged, cached, or served to the browser without leaking anything. The one rule that
 * matters in a file like this.
 */
export function configFromEnv(env = {}) {
  const keys = {}, models = {}, prices = {};
  for (const [name, P] of Object.entries(PROVIDERS)) {
    keys[name] = !!env[P.keyEnv];
    const U = name.toUpperCase();
    const id = env[`MODEL_${U}_ID`], mo = env[`MODEL_${U}_MAXOUT`], ctx = env[`MODEL_${U}_CONTEXT`];
    if (id || mo || ctx) models[name] = {
      ...(id ? { id } : {}), ...(mo ? { maxOutput: +mo } : {}), ...(ctx ? { context: +ctx } : {}),
    };
    const pin = env[`PRICE_${U}_IN`], pout = env[`PRICE_${U}_OUT`], pcr = env[`PRICE_${U}_CACHE_READ`];
    if (pin || pout) prices[name] = {
      in: pin ? +pin : null, out: pout ? +pout : null, cacheRead: pcr ? +pcr : null,
    };
  }
  const tasks = {};
  for (const t of Object.keys(TASK_CLASS)) {
    const v = env[`AI_TASK_${t.replace(/-/g, '_').toUpperCase()}`];
    if (v && PROVIDERS[v]) tasks[t] = v;
  }
  return {
    provider: PROVIDERS[env.AI_PROVIDER] ? env.AI_PROVIDER : 'anthropic',
    cache: env.AI_CACHE !== '0',
    keys, models, prices, tasks,
  };
}

/** True when this task hands the model the ledger and therefore needs it obeyed. */
export const carriesLedger = task => !!TASK_CLASS[task]?.ledger;
