// js/terminal/jarvisFilmCore.js: the FILM panel's pure half. Turns a run of daily chain graphs into frames and plain captions.
// What it replays: the snapshot history (/api/desk-snapshots) holds strength, stress, risk, yields and the like, NOT the chain's node values, so the film replays the
// chain's own daily scrub (window.deskChainData(win, date), no lookahead) over the last few sessions. DESCRIPTION ONLY: captions say what moved, never what will.
import { watchSnapshot, watchDiff } from './jarvisCore.js';

export const FILM_SESSIONS = 5, FRAME_MS = 1500, SPEEDS = [1, 2, 4];
/** The last n session dates, oldest first. */
export const pickDates = (dates, n = FILM_SESSIONS) => (Array.isArray(dates) ? dates.slice(-Math.max(1, n)) : []);
/** Frame delay in ms at a speed (1, 2 or 4; anything else counts as 1). */
export const frameDelay = speed => Math.round(FRAME_MS / (SPEEDS.includes(speed) ? speed : 1));

/**
 * graphs = [{ date, graph }] oldest first. Returns frames [{ date, index, snap, events }]: events are what changed since the frame before (none for the first).
 */
export function buildFrames(graphs, names = {}) {
  const frames = []; let prev = null;
  for (const [i, x] of (graphs ?? []).entries()) {
    if (!x?.graph) continue;
    const snap = watchSnapshot(x.graph, names);
    frames.push({ date: x.date, index: i, snap, events: prev ? watchDiff(prev, snap) : [] });
    prev = snap;
  }
  return frames;
}

/** The caption lines for one frame: [{ level, kind, text }], each opening with its date. */
export const captionsFor = frame => (frame?.events ?? []).map(e => ({ level: e.level, kind: e.kind, text: `${frame.date}: ${e.text}` }));

/** The biggest mover across the run: the node with the highest move-to-noise ratio on a day it moved. */
export function biggestMover(frames) {
  let best = null;
  for (const f of frames ?? []) for (const [k, n] of Object.entries(f.snap?.nodes ?? {})) if (n.moved && (!best || n.ratio > best.ratio)) best = { key: k, label: n.label, text: n.text, ratio: n.ratio, date: f.date };
  return best;
}

/** The closing caption: how many links broke and healed over the run, and the biggest mover. */
export function closingCaption(frames) {
  const fs = frames ?? [];
  if (fs.length < 2) return 'Not enough sessions to replay.';
  let broke = 0, healed = 0;
  for (const f of fs) for (const e of f.events) { if (e.kind === 'broke') broke++; else if (e.kind === 'healed') healed++; }
  const m = biggestMover(fs), s = n => `${n} link${n === 1 ? '' : 's'}`;
  return `Over ${fs.length} sessions, ${s(broke)} broke and ${s(healed)} healed.${m ? ` The biggest mover was ${m.label} (${m.text}, ${m.ratio.toFixed(1)} times its normal noise, ${m.date}).` : ' Nothing moved beyond its normal noise.'}`;
}
