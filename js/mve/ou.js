// mve/ou.js — the OU math was PROMOTED to the Tier-1 brick `js/ouCore.js`
// (2026-07-25, analytics-engine Phase 3): it was already pure and re-pointable,
// but living here made every new consumer look like it depended on the retired
// MVE engine. This shim keeps MVE working off the single implementation —
// one source, zero drift (`mve.test.mjs` unchanged). Import `../ouCore.js`
// directly in new code; do not add math here.

export { ouFit, ouConvergence, empiricalSnapback, normCdf } from '../ouCore.js';
