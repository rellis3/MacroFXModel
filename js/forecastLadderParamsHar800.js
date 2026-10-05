/**
 * HAR-800 SHADOW ladder params — GENERATED, do not hand-edit.  python -m forge.export_har800_params
 * Side-by-side candidate only: read by js/harShadowCore.js for har-shadow.html. The live ladder
 * (js/forecastLadderParams.js) is untouched. Widths are quantiles of realised ÷ σ for the σ the live
 * `f.harLog` shadow computes (HAR-log on the last 800 NY-close daily bars); no event multipliers.
 */
export const HAR800_PARAMS = {
 "generated": "2026-10-05",
 "source": "forge/export_har800_params.py",
 "evidence": "forge/LADDER_CALIBRATION_PREREG.md (variant 2, Amendment 2 rerun)",
 "rungs": [
  "p50",
  "p75",
  "p90"
 ],
 "pairs": {
  "AUDCAD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3314,
     1.718,
     2.1672
    ],
    "oc": [
     0.554,
     0.98,
     1.4547
    ],
    "oh": [
     0.5902,
     1.0283,
     1.5092
    ],
    "ol": [
     0.5621,
     1.0152,
     1.4858
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.2504,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "AUDCHF": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2979,
     1.6899,
     2.1833
    ],
    "oc": [
     0.5582,
     1.02,
     1.5074
    ],
    "oh": [
     0.5752,
     0.9838,
     1.4728
    ],
    "ol": [
     0.561,
     1.0041,
     1.6039
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "AUDJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2717,
     1.6602,
     2.1304
    ],
    "oc": [
     0.5419,
     0.9766,
     1.4694
    ],
    "oh": [
     0.5413,
     0.9484,
     1.3995
    ],
    "ol": [
     0.5369,
     0.9946,
     1.5914
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1003,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1003,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1003,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1003
   },
   "n": 2632,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "AUDNZD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2571,
     1.6433,
     2.0923
    ],
    "oc": [
     0.5295,
     0.9235,
     1.3962
    ],
    "oh": [
     0.5529,
     0.9783,
     1.4881
    ],
    "ol": [
     0.5528,
     0.9738,
     1.4769
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.4996,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "AUDUSD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3476,
     1.7455,
     2.2454
    ],
    "oc": [
     0.591,
     1.0203,
     1.5429
    ],
    "oh": [
     0.5979,
     1.016,
     1.4902
    ],
    "ol": [
     0.5819,
     1.0378,
     1.5867
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.2504,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "CADCHF": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3271,
     1.7543,
     2.2648
    ],
    "oc": [
     0.5781,
     1.039,
     1.538
    ],
    "oh": [
     0.5801,
     1.0023,
     1.5246
    ],
    "ol": [
     0.5882,
     1.04,
     1.6133
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5002,
    "hl_p75": 0.2501,
    "hl_p90": 0.1001,
    "oc_p50": 0.4998,
    "oc_p75": 0.2501,
    "oc_p90": 0.1001,
    "oh_p50": 0.4998,
    "oh_p75": 0.2501,
    "oh_p90": 0.1001,
    "ol_p50": 0.4998,
    "ol_p75": 0.2501,
    "ol_p90": 0.1001
   },
   "n": 2627,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "CADJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2916,
     1.7063,
     2.2067
    ],
    "oc": [
     0.5643,
     1.0003,
     1.5487
    ],
    "oh": [
     0.5384,
     0.9524,
     1.4671
    ],
    "ol": [
     0.5609,
     1.0429,
     1.6
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.2504,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "CHFJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.28,
     1.6689,
     2.1227
    ],
    "oc": [
     0.5431,
     0.9809,
     1.4777
    ],
    "oh": [
     0.5521,
     0.9812,
     1.4743
    ],
    "ol": [
     0.5523,
     0.98,
     1.5065
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURAUD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3327,
     1.7465,
     2.1919
    ],
    "oc": [
     0.5744,
     1.0276,
     1.502
    ],
    "oh": [
     0.5786,
     1.0292,
     1.5654
    ],
    "ol": [
     0.586,
     1.0014,
     1.5111
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURCAD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3693,
     1.7696,
     2.2697
    ],
    "oc": [
     0.5936,
     1.0435,
     1.5375
    ],
    "oh": [
     0.6044,
     1.0545,
     1.6023
    ],
    "ol": [
     0.5813,
     1.035,
     1.522
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.2496,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURCHF": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.301,
     1.7157,
     2.2265
    ],
    "oc": [
     0.5459,
     0.9767,
     1.4673
    ],
    "oh": [
     0.561,
     0.9922,
     1.5006
    ],
    "ol": [
     0.5824,
     0.9803,
     1.51
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURGBP": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2914,
     1.6969,
     2.2272
    ],
    "oc": [
     0.524,
     0.9539,
     1.4695
    ],
    "oh": [
     0.5502,
     0.9709,
     1.5447
    ],
    "ol": [
     0.5706,
     0.9782,
     1.4521
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2635,
     1.6823,
     2.1612
    ],
    "oc": [
     0.5508,
     0.9672,
     1.4706
    ],
    "oh": [
     0.5377,
     0.9399,
     1.4459
    ],
    "ol": [
     0.555,
     0.9971,
     1.5643
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURNZD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3021,
     1.6938,
     2.1089
    ],
    "oc": [
     0.5589,
     0.9899,
     1.4249
    ],
    "oh": [
     0.5567,
     1.0082,
     1.5291
    ],
    "ol": [
     0.576,
     1.0015,
     1.4504
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "EURUSD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.357,
     1.7861,
     2.2557
    ],
    "oc": [
     0.5936,
     1.0572,
     1.5504
    ],
    "oh": [
     0.5648,
     1.0383,
     1.5622
    ],
    "ol": [
     0.6046,
     1.0683,
     1.5482
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GBPAUD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2432,
     1.6013,
     2.0625
    ],
    "oc": [
     0.5271,
     0.9308,
     1.3772
    ],
    "oh": [
     0.5296,
     0.9224,
     1.456
    ],
    "ol": [
     0.5439,
     0.9536,
     1.3777
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GBPCAD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2794,
     1.6776,
     2.1734
    ],
    "oc": [
     0.5518,
     0.9665,
     1.4304
    ],
    "oh": [
     0.5666,
     0.9784,
     1.4944
    ],
    "ol": [
     0.5565,
     0.9905,
     1.4725
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GBPCHF": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2464,
     1.6427,
     2.1333
    ],
    "oc": [
     0.5265,
     0.9282,
     1.4203
    ],
    "oh": [
     0.5261,
     0.9386,
     1.4343
    ],
    "ol": [
     0.5451,
     0.9542,
     1.506
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GBPJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2259,
     1.6693,
     2.1654
    ],
    "oc": [
     0.5157,
     0.95,
     1.5027
    ],
    "oh": [
     0.527,
     0.9159,
     1.4568
    ],
    "ol": [
     0.5336,
     0.9689,
     1.525
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.2496,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5004,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GBPNZD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2644,
     1.6316,
     2.0871
    ],
    "oc": [
     0.5344,
     0.9116,
     1.428
    ],
    "oh": [
     0.5434,
     0.9559,
     1.4461
    ],
    "ol": [
     0.5559,
     0.9825,
     1.4566
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.2496,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GBPUSD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2965,
     1.6964,
     2.2103
    ],
    "oc": [
     0.5494,
     0.9976,
     1.4869
    ],
    "oh": [
     0.5587,
     0.9573,
     1.4986
    ],
    "ol": [
     0.5626,
     0.9969,
     1.4846
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5004,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.4996,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "NZDCAD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3102,
     1.7115,
     2.152
    ],
    "oc": [
     0.5689,
     0.9611,
     1.4363
    ],
    "oh": [
     0.5895,
     1.035,
     1.5023
    ],
    "ol": [
     0.5631,
     1.0148,
     1.51
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5002,
    "hl_p75": 0.2499,
    "hl_p90": 0.1,
    "oc_p50": 0.4998,
    "oc_p75": 0.2499,
    "oc_p90": 0.1,
    "oh_p50": 0.4998,
    "oh_p75": 0.2499,
    "oh_p90": 0.1,
    "ol_p50": 0.5002,
    "ol_p75": 0.2503,
    "ol_p90": 0.1
   },
   "n": 2629,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "NZDJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2534,
     1.6538,
     2.1579
    ],
    "oc": [
     0.5377,
     0.9492,
     1.466
    ],
    "oh": [
     0.542,
     0.9489,
     1.3936
    ],
    "ol": [
     0.5447,
     0.9781,
     1.5839
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1005,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "NZDUSD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.343,
     1.7268,
     2.2325
    ],
    "oc": [
     0.5849,
     1.0074,
     1.5057
    ],
    "oh": [
     0.6059,
     1.0418,
     1.5036
    ],
    "ol": [
     0.5565,
     1.0196,
     1.5619
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5004,
    "hl_p75": 0.25,
    "hl_p90": 0.1003,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1003,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1003,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.0999
   },
   "n": 2632,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "USDCAD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3632,
     1.7756,
     2.2902
    ],
    "oc": [
     0.5731,
     1.0586,
     1.6
    ],
    "oh": [
     0.6277,
     1.0624,
     1.5847
    ],
    "ol": [
     0.5688,
     1.0057,
     1.5448
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "USDCHF": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3515,
     1.7688,
     2.2788
    ],
    "oc": [
     0.5736,
     1.0488,
     1.5416
    ],
    "oh": [
     0.6039,
     1.0496,
     1.5259
    ],
    "ol": [
     0.575,
     1.0382,
     1.6006
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5004,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.4996,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "USDJPY": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.2491,
     1.6892,
     2.1941
    ],
    "oc": [
     0.539,
     0.9884,
     1.5106
    ],
    "oh": [
     0.5272,
     0.9519,
     1.4476
    ],
    "ol": [
     0.5376,
     0.9918,
     1.575
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1001,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1001,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1001,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1001
   },
   "n": 2628,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "GOLD": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.347,
     1.7858,
     2.356
    ],
    "oc": [
     0.5676,
     1.0387,
     1.6068
    ],
    "oh": [
     0.5981,
     1.0491,
     1.6112
    ],
    "ol": [
     0.5536,
     1.0243,
     1.5915
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5002,
    "hl_p75": 0.2503,
    "hl_p90": 0.1003,
    "oc_p50": 0.5006,
    "oc_p75": 0.2503,
    "oc_p90": 0.1003,
    "oh_p50": 0.5002,
    "oh_p75": 0.2499,
    "oh_p90": 0.1003,
    "ol_p50": 0.5002,
    "ol_p75": 0.2503,
    "ol_p90": 0.1003
   },
   "n": 2581,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21"
  },
  "NQ": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3673,
     1.8119,
     2.3528
    ],
    "oc": [
     0.6187,
     1.0986,
     1.6306
    ],
    "oh": [
     0.6076,
     1.0399,
     1.4793
    ],
    "ol": [
     0.5526,
     1.0566,
     1.7593
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1002,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1002
   },
   "n": 2584,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "SPX500": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3199,
     1.7441,
     2.3344
    ],
    "oc": [
     0.5938,
     1.0345,
     1.541
    ],
    "oh": [
     0.5972,
     1.0188,
     1.4366
    ],
    "ol": [
     0.5399,
     1.0368,
     1.6919
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.2504,
    "oc_p90": 0.1002,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1002
   },
   "n": 2584,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "US30": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3379,
     1.7471,
     2.3023
    ],
    "oc": [
     0.5717,
     1.0115,
     1.553
    ],
    "oh": [
     0.596,
     1.0088,
     1.4624
    ],
    "ol": [
     0.5531,
     1.0468,
     1.6345
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1002,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1002
   },
   "n": 2584,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "US2000": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3509,
     1.7471,
     2.2507
    ],
    "oc": [
     0.5985,
     1.0433,
     1.4979
    ],
    "oh": [
     0.6032,
     1.0055,
     1.4461
    ],
    "ol": [
     0.5862,
     1.0751,
     1.6057
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1002,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1002
   },
   "n": 2584,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "DE30": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3468,
     1.7833,
     2.3787
    ],
    "oc": [
     0.5887,
     1.0475,
     1.6252
    ],
    "oh": [
     0.5913,
     1.0143,
     1.4816
    ],
    "ol": [
     0.5737,
     1.0814,
     1.7495
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1,
    "ol_p50": 0.5,
    "ol_p75": 0.2504,
    "ol_p90": 0.1
   },
   "n": 2540,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-20",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "UK100": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3486,
     1.74,
     2.2588
    ],
    "oc": [
     0.5772,
     1.0117,
     1.521
    ],
    "oh": [
     0.5987,
     1.0204,
     1.4511
    ],
    "ol": [
     0.5843,
     1.0523,
     1.6679
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.2502,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.2502,
    "oc_p90": 0.1002,
    "oh_p50": 0.5004,
    "oh_p75": 0.2502,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.2502,
    "ol_p90": 0.1002
   },
   "n": 2526,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-20",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "SPX": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3199,
     1.7441,
     2.3344
    ],
    "oc": [
     0.5938,
     1.0345,
     1.541
    ],
    "oh": [
     0.5972,
     1.0188,
     1.4366
    ],
    "ol": [
     0.5399,
     1.0368,
     1.6919
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.2504,
    "oc_p90": 0.1002,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1002
   },
   "n": 2584,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  },
  "DOW": {
   "estimator": "har_rv_log",
   "sigma_source": "forecastSigma(last 800 NY-close D1 bars)",
   "width": {
    "hl": [
     1.3379,
     1.7471,
     2.3023
    ],
    "oc": [
     0.5717,
     1.0115,
     1.553
    ],
    "oh": [
     0.596,
     1.0088,
     1.4624
    ],
    "ol": [
     0.5531,
     1.0468,
     1.6345
    ]
   },
   "in_sample_exceed": {
    "hl_p50": 0.5,
    "hl_p75": 0.25,
    "hl_p90": 0.1002,
    "oc_p50": 0.5,
    "oc_p75": 0.25,
    "oc_p90": 0.1002,
    "oh_p50": 0.5,
    "oh_p75": 0.25,
    "oh_p90": 0.1002,
    "ol_p50": 0.5,
    "ol_p75": 0.25,
    "ol_p90": 0.1002
   },
   "n": 2584,
   "fit_from": "2016-08-22",
   "fit_to": "2026-08-21",
   "provisional": "live sigma for indices comes from Yahoo bars; widths fitted on OANDA M1"
  }
 }
};
