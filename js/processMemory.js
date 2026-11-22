// js/processMemory.js: what is running in the container, what each thing is for, and how much memory it holds. Railway bills the WHOLE container, but process.memoryUsage() only sees the node server;
// the supervised bots in start.sh are separate OS processes. This reads /proc (Linux only; returns null elsewhere), joins each process to its entry in js/serviceFlags.js (label, what it feeds, cost,
// the env flag that turns it off), and adds up the container. Read-only: nothing here starts, stops or changes a process.
import fs from 'node:fs';
import { getService, envNameFor } from './serviceFlags.js';

/** The start.sh bots, matched on their command line. First match wins. */
export const BOT_PATTERNS = [
  ['botRegimeV2', /RegimeV2\/regime_bot_v2\.py/], ['botLevel', /(^|[\s/])bot\/main\.py/], ['botGold', /Gold\/main\.py/], ['botPatternLive', /pattern_live_bot\.mjs/],
  ['botLevelTouch', /levelEngine\/live_watch\.py/], ['botAnalogPaper', /paper_track(_loop\.sh|\.py)/], ['botAnalogMotif', /motif_track(_loop\.sh|\.py)/], ['botAnalogNearing', /motif_nearing_watch\.py/],
];
export const botOf = cmd => { for (const [id, re] of BOT_PATTERNS) if (re.test(cmd ?? '')) return id; return null; };

/** [{ pid, ppid, rssKB, cmd }] from a /proc directory; null when it is not there (Windows, macOS). `fsApi` is injectable for tests. */
export function readProcs(procDir = '/proc', fsApi = fs) {
  let names; try { names = fsApi.readdirSync(procDir).filter(n => /^\d+$/.test(n)); } catch (e) { return null; }
  const out = [];
  for (const n of names) {
    try {
      const st = String(fsApi.readFileSync(`${procDir}/${n}/status`)), rss = /VmRSS:\s+(\d+)\s+kB/.exec(st), pp = /PPid:\s+(\d+)/.exec(st);
      if (!rss) continue;                                                 // kernel threads have no VmRSS
      const cmd = String(fsApi.readFileSync(`${procDir}/${n}/cmdline`)).replace(/\0/g, ' ').trim() || /Name:\s+(\S+)/.exec(st)?.[1] || '?';
      out.push({ pid: +n, ppid: pp ? +pp[1] : 0, rssKB: +rss[1], cmd });
    } catch (e) { /* the process ended while we read it */ }
  }
  return out;
}

const short = c => String(c ?? '').replace(/\s+/g, ' ').slice(0, 90);

/**
 * Group the processes: each bot (with everything it started), the node server, things the server started (python helpers and the like), and the small rest (the supervisor shell, sleep).
 * Returns { containerMB, rows: [{ id, kind, label, feeds, cadence, cost, live, rssMB, processes, turnOff }] } sorted by memory. RSS counts pages shared between processes in each, so the sum can read a little high.
 */
export function summarise(procs, { nodePid = process.pid, lookup = getService, envName = envNameFor } = {}) {
  if (!Array.isArray(procs)) return null;
  const by = new Map(procs.map(p => [p.pid, p])), groups = new Map();
  const ownerOf = p => {
    if (/^(\/bin\/)?(ba)?sh\s+(\.\/)?start\.sh/.test(p.cmd) || /^sleep/.test(p.cmd)) return { key: 'system', kind: 'system' };     // the supervisor shells and their sleeps
    for (let q = p, hops = 0; q && hops < 12; q = by.get(q.ppid), hops++) {
      const bot = botOf(q.cmd); if (bot) return { key: bot, kind: 'bot' };
      if (q.pid === nodePid) return { key: 'server', kind: q === p ? 'server' : 'server-child' };
    }
    return { key: 'system', kind: 'system' };
  };
  for (const p of procs) {
    const o = ownerOf(p); let key = o.key, kind = o.kind;
    if (kind === 'server-child') { key = `child:${short(p.cmd).split(' ').slice(0, 4).join(' ')}`; }      // a helper the server started: one row per command
    const g = groups.get(key) ?? { id: key, kind, rssKB: 0, n: 0, cmd: p.cmd }; g.rssKB += p.rssKB; g.n++; groups.set(key, g);
  }
  const rows = [...groups.values()].map(g => {
    const svc = g.kind === 'bot' ? lookup(g.id) : null;
    const base = { id: g.id, kind: g.kind, rssMB: Math.round(g.rssKB / 1024), processes: g.n };
    if (g.kind === 'bot') return { ...base, label: svc?.label ?? g.id, feeds: svc?.feeds ?? '', cadence: svc?.cadence ?? '', cost: svc?.cost ?? '', live: /^LIVE bot/i.test(svc?.feeds ?? ''), turnOff: `${envName(g.id)}=0` };
    if (g.kind === 'server') return { ...base, label: 'Web server (node server.js): every dashboard route and the in-process jobs listed in /api/services', feeds: 'the site, the APIs, Telegram, the KV store', cadence: 'continuous', cost: '', live: true, turnOff: null };
    if (g.kind === 'server-child') return { ...base, label: g.id.replace(/^child:/, 'Started by the server: '), feeds: 'a helper job the server runs on demand (a research or build script)', cadence: 'on demand', cost: '', live: false, turnOff: null };
    return { ...base, label: 'Supervisor shell, sleep and other small system processes', feeds: 'keeps the bots restarted', cadence: 'continuous', cost: '', live: false, turnOff: null };
  }).sort((a, b) => b.rssMB - a.rssMB);
  return { containerMB: rows.reduce((s, r) => s + r.rssMB, 0), rows };
}

const PEAKS = new Map(), SINCE = { at: new Date().toISOString() };
/** Highest memory each group has held since boot, updated on every sample (the server samples once a minute), so a bot that spikes during its hourly scan shows its spike, not just its idle size. */
export function withPeaks(sum) {
  if (!sum) return sum;
  let all = 0; for (const r of sum.rows) { const p = Math.max(PEAKS.get(r.id) ?? 0, r.rssMB); PEAKS.set(r.id, p); r.peakMB = p; all += r.rssMB; }
  const pc = Math.max(PEAKS.get('_container') ?? 0, sum.containerMB); PEAKS.set('_container', pc);
  return { ...sum, peakContainerMB: pc, since: SINCE.at };
}
/** The live container, or null off Linux. */
export const containerProcesses = () => withPeaks(summarise(readProcs()));
