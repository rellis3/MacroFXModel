/* Admin-only additions to the learning paths: a "From analysis to action" stage on each
   path, inserted before its human-side stage. Generated — edit the definition, not this file.
   Served only to the education admin (server.js 404s it for everyone else) and included
   inside DESK markers, so shared readers' paths never name these lessons.
   Checked by js/lessonPaths.test.mjs. */
(function (D) {
  if (!D) return;
  var ADD = {
 "stages": {
  "volatility": [
   "action-trade-plan",
   "action-expected-value",
   "action-vol-to-size",
   "action-edge-after-costs"
  ],
  "macro": [
   "action-base-rates",
   "action-expected-value",
   "action-combining-signals",
   "action-trade-plan",
   "action-calibration-scoring"
  ],
  "systems": [
   "action-trade-plan",
   "action-expected-value",
   "action-combining-signals",
   "action-edge-after-costs",
   "action-vol-to-size",
   "action-calibration-scoring",
   "action-base-rates",
   "action-edge-decay"
  ],
  "risk": [
   "action-vol-to-size",
   "action-edge-after-costs",
   "action-calibration-scoring",
   "action-edge-decay"
  ]
 },
 "lessons": {
  "action-trade-plan": {
   "t": "From a View to a Trade Plan",
   "min": 20,
   "micro": true
  },
  "action-expected-value": {
   "t": "Thinking in Expected Value",
   "min": 20,
   "micro": true
  },
  "action-vol-to-size": {
   "t": "From a Volatility Forecast to a Position Size",
   "min": 22,
   "micro": true
  },
  "action-edge-after-costs": {
   "t": "Does the Edge Survive Costs?",
   "min": 20,
   "micro": true
  },
  "action-base-rates": {
   "t": "Base Rates First",
   "min": 20,
   "micro": true
  },
  "action-combining-signals": {
   "t": "Combining Signals That Disagree",
   "min": 22,
   "micro": true
  },
  "action-calibration-scoring": {
   "t": "Scoring Your Own Calls",
   "min": 22,
   "micro": true
  },
  "action-edge-decay": {
   "t": "When an Edge Has Stopped Working",
   "min": 22,
   "micro": true
  }
 }
};
  Object.keys(ADD.lessons).forEach(function (s) { D.lessons[s] = ADD.lessons[s]; });
  D.paths.forEach(function (p) {
    var l = ADD.stages[p.id]; if (!l) return;
    var at = p.stages.length;
    p.stages.forEach(function (s, i) { if (/human side/i.test(s.name) && at === p.stages.length) at = i; });
    p.stages.splice(at, 0, { name: 'From analysis to action', lessons: l, admin: true });
  });
})(window.TL_PATHS);
