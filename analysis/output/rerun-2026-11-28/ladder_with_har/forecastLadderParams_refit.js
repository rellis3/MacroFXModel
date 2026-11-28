/**
 * Forecast ladder parameters — GENERATED, do not hand-edit.
 *
 *   python -m forge.export_ladder_params --report analysis/output/rerun-2026-11-28/ladder/vol_report.json
 *
 * Each instrument carries a frozen (estimator, widths, event multipliers) spec from
 * the LAST walk-forward fold of `forge/vol.py`, i.e. trained on the most history and
 * scored on data it never saw. `width` is [p50, p75, p90] multipliers on the daily
 * sigma, per quantity: hl = High-Low range, oc = |Close-Open|, oh = High-Open,
 * ol = Open-Low. `event` scales sigma by the day's scheduled-release bucket and is
 * TWO-SIDED — `none` (no US Major release) sits below 1.0 and is roughly half the
 * calendar.
 *
 * `oos_exceed` is that spec's out-of-sample exceedance per rung; targets are
 * p50 -> 0.50, p75 -> 0.25, p90 -> 0.10. Pooled over all instruments and folds the
 * whole ladder lands within 0.9pp of target.
 *
 * The estimator name is part of the spec, not decoration: a width multiplier is the
 * quantile of (realized / sigma) for ONE sigma series. Feed the widths a different
 * sigma and the calibration is gone with no visible symptom. `js/forecastSigma.js`
 * implements exactly these estimators and is cross-checked against the Python.
 */
export const LADDER_PARAMS = {
  "generated": "2026-11-28",
  "source": "forge/vol.py walk-forward -> analysis/output/rerun-2026-11-28/ladder/vol_report.json",
  "pairs": {
    "AUDCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3975,
          1.8008,
          2.2864
        ],
        "oc": [
          0.5853,
          1.0365,
          1.5269
        ],
        "oh": [
          0.6249,
          1.0815,
          1.57
        ],
        "ol": [
          0.6022,
          1.0691,
          1.6037
        ]
      },
      "event": {
        "FOMC": 1.171,
        "NFP": 1.086,
        "CPI": 1.049,
        "high": 1.041,
        "holiday": 0.835,
        "none": 0.913
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.486,
        "hl_p75": 0.236,
        "hl_p90": 0.097,
        "oc_p50": 0.475,
        "oc_p75": 0.251,
        "oc_p90": 0.093,
        "oh_p50": 0.502,
        "oh_p75": 0.259,
        "oh_p90": 0.097,
        "ol_p50": 0.475,
        "ol_p75": 0.243,
        "ol_p90": 0.077
      },
      "n_folds": 6
    },
    "AUDCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.41,
          1.8447,
          2.3504
        ],
        "oc": [
          0.6225,
          1.1121,
          1.6361
        ],
        "oh": [
          0.6215,
          1.074,
          1.5883
        ],
        "ol": [
          0.6056,
          1.1044,
          1.7678
        ]
      },
      "event": {
        "FOMC": 1.056,
        "NFP": 1.002,
        "CPI": 1.04,
        "high": 1.064,
        "holiday": 0.811,
        "none": 0.932
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.417,
        "hl_p75": 0.185,
        "hl_p90": 0.073,
        "oc_p50": 0.432,
        "oc_p75": 0.189,
        "oc_p90": 0.066,
        "oh_p50": 0.498,
        "oh_p75": 0.236,
        "oh_p90": 0.085,
        "ol_p50": 0.494,
        "ol_p75": 0.197,
        "ol_p90": 0.05
      },
      "n_folds": 6
    },
    "AUDJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4301,
          1.8781,
          2.4191
        ],
        "oc": [
          0.6164,
          1.1049,
          1.6754
        ],
        "oh": [
          0.6137,
          1.0566,
          1.5685
        ],
        "ol": [
          0.6225,
          1.1245,
          1.7995
        ]
      },
      "event": {
        "FOMC": 1.056,
        "NFP": 1.06,
        "CPI": 0.998,
        "high": 1.045,
        "holiday": 0.87,
        "none": 0.968
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.425,
        "hl_p75": 0.154,
        "hl_p90": 0.066,
        "oc_p50": 0.483,
        "oc_p75": 0.193,
        "oc_p90": 0.073,
        "oh_p50": 0.475,
        "oh_p75": 0.228,
        "oh_p90": 0.066,
        "ol_p50": 0.448,
        "ol_p75": 0.201,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "AUDNZD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3954,
          1.8144,
          2.2959
        ],
        "oc": [
          0.5807,
          1.0111,
          1.5243
        ],
        "oh": [
          0.5993,
          1.0665,
          1.6029
        ],
        "ol": [
          0.6235,
          1.0963,
          1.6168
        ]
      },
      "event": {
        "FOMC": 1.036,
        "NFP": 1.055,
        "CPI": 1.032,
        "high": 1.037,
        "holiday": 0.875,
        "none": 0.933
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.51,
        "hl_p75": 0.266,
        "hl_p90": 0.131,
        "oc_p50": 0.556,
        "oc_p75": 0.301,
        "oc_p90": 0.124,
        "oh_p50": 0.548,
        "oh_p75": 0.293,
        "oh_p90": 0.131,
        "ol_p50": 0.463,
        "ol_p75": 0.239,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "AUDUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4242,
          1.8502,
          2.3384
        ],
        "oc": [
          0.6293,
          1.0775,
          1.6394
        ],
        "oh": [
          0.6403,
          1.0799,
          1.5711
        ],
        "ol": [
          0.6279,
          1.102,
          1.6882
        ]
      },
      "event": {
        "FOMC": 1.236,
        "NFP": 1.112,
        "CPI": 1.048,
        "high": 1.043,
        "holiday": 0.769,
        "none": 0.938
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.479,
        "hl_p75": 0.212,
        "hl_p90": 0.081,
        "oc_p50": 0.486,
        "oc_p75": 0.236,
        "oc_p90": 0.085,
        "oh_p50": 0.483,
        "oh_p75": 0.243,
        "oh_p90": 0.097,
        "ol_p50": 0.463,
        "ol_p75": 0.236,
        "ol_p90": 0.077
      },
      "n_folds": 6
    },
    "CADCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4176,
          1.8422,
          2.3741
        ],
        "oc": [
          0.627,
          1.1026,
          1.6126
        ],
        "oh": [
          0.6086,
          1.0596,
          1.6229
        ],
        "ol": [
          0.6378,
          1.1054,
          1.6958
        ]
      },
      "event": {
        "FOMC": 1.081,
        "NFP": 1.044,
        "CPI": 1.006,
        "high": 1.045,
        "holiday": 0.804,
        "none": 0.96
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.421,
        "hl_p75": 0.208,
        "hl_p90": 0.085,
        "oc_p50": 0.398,
        "oc_p75": 0.208,
        "oc_p90": 0.1,
        "oh_p50": 0.498,
        "oh_p75": 0.205,
        "oh_p90": 0.062,
        "ol_p50": 0.471,
        "ol_p75": 0.212,
        "ol_p90": 0.097
      },
      "n_folds": 6
    },
    "CADJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4306,
          1.8975,
          2.4588
        ],
        "oc": [
          0.6398,
          1.1101,
          1.7148
        ],
        "oh": [
          0.6061,
          1.0571,
          1.5999
        ],
        "ol": [
          0.6354,
          1.1648,
          1.7918
        ]
      },
      "event": {
        "FOMC": 1.015,
        "NFP": 1.071,
        "CPI": 0.981,
        "high": 1.037,
        "holiday": 0.824,
        "none": 0.966
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.409,
        "hl_p75": 0.174,
        "hl_p90": 0.066,
        "oc_p50": 0.456,
        "oc_p75": 0.216,
        "oc_p90": 0.066,
        "oh_p50": 0.467,
        "oh_p75": 0.236,
        "oh_p90": 0.081,
        "ol_p50": 0.429,
        "ol_p75": 0.208,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "CHFJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4486,
          1.8875,
          2.3767
        ],
        "oc": [
          0.6196,
          1.0954,
          1.6356
        ],
        "oh": [
          0.6189,
          1.1131,
          1.6461
        ],
        "ol": [
          0.6423,
          1.1164,
          1.6833
        ]
      },
      "event": {
        "FOMC": 1.009,
        "NFP": 1.01,
        "CPI": 1.068,
        "high": 1.033,
        "holiday": 0.868,
        "none": 0.984
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.421,
        "hl_p75": 0.22,
        "hl_p90": 0.1,
        "oc_p50": 0.51,
        "oc_p75": 0.255,
        "oc_p90": 0.089,
        "oh_p50": 0.486,
        "oh_p75": 0.22,
        "oh_p90": 0.1,
        "ol_p50": 0.429,
        "ol_p75": 0.216,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "DE30": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3431,
          1.7827,
          2.3739
        ],
        "oc": [
          0.5922,
          1.0392,
          1.5819
        ],
        "oh": [
          0.6012,
          1.0067,
          1.4603
        ],
        "ol": [
          0.5694,
          1.0889,
          1.7792
        ]
      },
      "event": {
        "FOMC": 1.007,
        "NFP": 1.058,
        "CPI": 1.035,
        "high": 1.015,
        "holiday": 0.877,
        "none": 0.985
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.474,
        "hl_p75": 0.221,
        "hl_p90": 0.091,
        "oc_p50": 0.478,
        "oc_p75": 0.249,
        "oc_p90": 0.115,
        "oh_p50": 0.431,
        "oh_p75": 0.249,
        "oh_p90": 0.115,
        "ol_p50": 0.514,
        "ol_p75": 0.241,
        "ol_p90": 0.091
      },
      "n_folds": 6
    },
    "EURAUD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4278,
          1.8419,
          2.3216
        ],
        "oc": [
          0.63,
          1.0891,
          1.6018
        ],
        "oh": [
          0.6228,
          1.1007,
          1.6942
        ],
        "ol": [
          0.6216,
          1.0646,
          1.6076
        ]
      },
      "event": {
        "FOMC": 1.066,
        "NFP": 1.036,
        "CPI": 1.035,
        "high": 1.046,
        "holiday": 0.833,
        "none": 0.925
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.436,
        "hl_p75": 0.243,
        "hl_p90": 0.073,
        "oc_p50": 0.456,
        "oc_p75": 0.228,
        "oc_p90": 0.069,
        "oh_p50": 0.514,
        "oh_p75": 0.216,
        "oh_p90": 0.073,
        "ol_p50": 0.494,
        "ol_p75": 0.232,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "EURCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4377,
          1.8769,
          2.367
        ],
        "oc": [
          0.6198,
          1.1089,
          1.6274
        ],
        "oh": [
          0.636,
          1.1056,
          1.6906
        ],
        "ol": [
          0.6113,
          1.0988,
          1.6022
        ]
      },
      "event": {
        "FOMC": 1.016,
        "NFP": 1.049,
        "CPI": 1.009,
        "high": 1.055,
        "holiday": 0.828,
        "none": 0.951
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.413,
        "hl_p75": 0.158,
        "hl_p90": 0.081,
        "oc_p50": 0.452,
        "oc_p75": 0.181,
        "oc_p90": 0.077,
        "oh_p50": 0.494,
        "oh_p75": 0.201,
        "oh_p90": 0.05,
        "ol_p50": 0.49,
        "ol_p75": 0.212,
        "ol_p90": 0.073
      },
      "n_folds": 6
    },
    "EURCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3803,
          1.832,
          2.356
        ],
        "oc": [
          0.5863,
          1.0329,
          1.5365
        ],
        "oh": [
          0.5954,
          1.0625,
          1.6011
        ],
        "ol": [
          0.6301,
          1.0489,
          1.6158
        ]
      },
      "event": {
        "FOMC": 1.014,
        "NFP": 1.008,
        "CPI": 1.089,
        "high": 1.033,
        "holiday": 0.883,
        "none": 0.986
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.463,
        "hl_p75": 0.189,
        "hl_p90": 0.058,
        "oc_p50": 0.517,
        "oc_p75": 0.236,
        "oc_p90": 0.089,
        "oh_p50": 0.471,
        "oh_p75": 0.208,
        "oh_p90": 0.073,
        "ol_p50": 0.459,
        "ol_p75": 0.243,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "EURGBP": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3871,
          1.8065,
          2.341
        ],
        "oc": [
          0.5773,
          1.0263,
          1.5692
        ],
        "oh": [
          0.586,
          1.0534,
          1.6546
        ],
        "ol": [
          0.6227,
          1.0517,
          1.5712
        ]
      },
      "event": {
        "FOMC": 0.988,
        "NFP": 0.978,
        "CPI": 1.042,
        "high": 1.048,
        "holiday": 0.823,
        "none": 0.957
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.444,
        "hl_p75": 0.212,
        "hl_p90": 0.1,
        "oc_p50": 0.429,
        "oc_p75": 0.205,
        "oc_p90": 0.104,
        "oh_p50": 0.486,
        "oh_p75": 0.201,
        "oh_p90": 0.085,
        "ol_p50": 0.444,
        "ol_p75": 0.22,
        "ol_p90": 0.093
      },
      "n_folds": 6
    },
    "EURJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4266,
          1.881,
          2.3973
        ],
        "oc": [
          0.6294,
          1.0818,
          1.6383
        ],
        "oh": [
          0.6154,
          1.0569,
          1.6256
        ],
        "ol": [
          0.6429,
          1.1451,
          1.7302
        ]
      },
      "event": {
        "FOMC": 0.966,
        "NFP": 1.01,
        "CPI": 1.01,
        "high": 1.05,
        "holiday": 0.835,
        "none": 0.979
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.398,
        "hl_p75": 0.193,
        "hl_p90": 0.089,
        "oc_p50": 0.432,
        "oc_p75": 0.232,
        "oc_p90": 0.097,
        "oh_p50": 0.463,
        "oh_p75": 0.216,
        "oh_p90": 0.069,
        "ol_p50": 0.394,
        "ol_p75": 0.208,
        "ol_p90": 0.097
      },
      "n_folds": 6
    },
    "EURNZD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4122,
          1.829,
          2.3014
        ],
        "oc": [
          0.6132,
          1.0862,
          1.5579
        ],
        "oh": [
          0.6246,
          1.0813,
          1.6629
        ],
        "ol": [
          0.6235,
          1.0813,
          1.5577
        ]
      },
      "event": {
        "FOMC": 1.052,
        "NFP": 1.019,
        "CPI": 1.034,
        "high": 1.051,
        "holiday": 0.853,
        "none": 0.94
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.448,
        "hl_p75": 0.22,
        "hl_p90": 0.089,
        "oc_p50": 0.486,
        "oc_p75": 0.247,
        "oc_p90": 0.097,
        "oh_p50": 0.475,
        "oh_p75": 0.236,
        "oh_p90": 0.093,
        "ol_p50": 0.459,
        "ol_p75": 0.22,
        "ol_p90": 0.093
      },
      "n_folds": 6
    },
    "EURUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4324,
          1.8799,
          2.3778
        ],
        "oc": [
          0.6377,
          1.1303,
          1.6337
        ],
        "oh": [
          0.6099,
          1.0997,
          1.6472
        ],
        "ol": [
          0.6396,
          1.1188,
          1.6525
        ]
      },
      "event": {
        "FOMC": 1.183,
        "NFP": 1.114,
        "CPI": 1.089,
        "high": 1.037,
        "holiday": 0.772,
        "none": 0.938
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.452,
        "hl_p75": 0.205,
        "hl_p90": 0.077,
        "oc_p50": 0.444,
        "oc_p75": 0.197,
        "oc_p90": 0.089,
        "oh_p50": 0.471,
        "oh_p75": 0.216,
        "oh_p90": 0.093,
        "ol_p50": 0.463,
        "ol_p75": 0.239,
        "ol_p90": 0.073
      },
      "n_folds": 6
    },
    "GBPAUD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3931,
          1.8089,
          2.3019
        ],
        "oc": [
          0.596,
          1.0569,
          1.5678
        ],
        "oh": [
          0.6034,
          1.0575,
          1.6491
        ],
        "ol": [
          0.6065,
          1.0743,
          1.5361
        ]
      },
      "event": {
        "FOMC": 1.07,
        "NFP": 0.995,
        "CPI": 1.025,
        "high": 1.051,
        "holiday": 0.877,
        "none": 0.931
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.479,
        "hl_p75": 0.228,
        "hl_p90": 0.097,
        "oc_p50": 0.544,
        "oc_p75": 0.251,
        "oc_p90": 0.085,
        "oh_p50": 0.51,
        "oh_p75": 0.232,
        "oh_p90": 0.081,
        "ol_p50": 0.521,
        "ol_p75": 0.247,
        "ol_p90": 0.116
      },
      "n_folds": 6
    },
    "GBPCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4016,
          1.7967,
          2.3419
        ],
        "oc": [
          0.6062,
          1.0566,
          1.5593
        ],
        "oh": [
          0.6108,
          1.0757,
          1.609
        ],
        "ol": [
          0.6295,
          1.079,
          1.5798
        ]
      },
      "event": {
        "FOMC": 1.019,
        "NFP": 1.049,
        "CPI": 1.031,
        "high": 1.031,
        "holiday": 0.83,
        "none": 0.95
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.483,
        "hl_p75": 0.278,
        "hl_p90": 0.108,
        "oc_p50": 0.494,
        "oc_p75": 0.232,
        "oc_p90": 0.093,
        "oh_p50": 0.537,
        "oh_p75": 0.232,
        "oh_p90": 0.104,
        "ol_p50": 0.456,
        "ol_p75": 0.243,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "GBPCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4066,
          1.8302,
          2.3714
        ],
        "oc": [
          0.5979,
          1.0591,
          1.5888
        ],
        "oh": [
          0.6038,
          1.058,
          1.5634
        ],
        "ol": [
          0.6118,
          1.1047,
          1.6518
        ]
      },
      "event": {
        "FOMC": 0.96,
        "NFP": 0.981,
        "CPI": 1.023,
        "high": 1.036,
        "holiday": 0.847,
        "none": 0.977
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.409,
        "hl_p75": 0.216,
        "hl_p90": 0.104,
        "oc_p50": 0.456,
        "oc_p75": 0.201,
        "oc_p90": 0.093,
        "oh_p50": 0.452,
        "oh_p75": 0.208,
        "oh_p90": 0.093,
        "ol_p50": 0.452,
        "ol_p75": 0.193,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "GBPJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.412,
          1.8728,
          2.4223
        ],
        "oc": [
          0.5997,
          1.0779,
          1.6825
        ],
        "oh": [
          0.595,
          1.0357,
          1.6339
        ],
        "ol": [
          0.6357,
          1.113,
          1.7114
        ]
      },
      "event": {
        "FOMC": 0.944,
        "NFP": 1.023,
        "CPI": 1.034,
        "high": 1.027,
        "holiday": 0.856,
        "none": 0.961
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.386,
        "hl_p75": 0.17,
        "hl_p90": 0.073,
        "oc_p50": 0.456,
        "oc_p75": 0.205,
        "oc_p90": 0.069,
        "oh_p50": 0.483,
        "oh_p75": 0.236,
        "oh_p90": 0.081,
        "ol_p50": 0.413,
        "ol_p75": 0.193,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "GBPNZD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3998,
          1.8129,
          2.247
        ],
        "oc": [
          0.5936,
          1.0195,
          1.5648
        ],
        "oh": [
          0.6077,
          1.0464,
          1.5923
        ],
        "ol": [
          0.6168,
          1.1003,
          1.6011
        ]
      },
      "event": {
        "FOMC": 1.085,
        "NFP": 1.007,
        "CPI": 1.026,
        "high": 1.048,
        "holiday": 0.877,
        "none": 0.929
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.471,
        "hl_p75": 0.236,
        "hl_p90": 0.116,
        "oc_p50": 0.517,
        "oc_p75": 0.236,
        "oc_p90": 0.093,
        "oh_p50": 0.498,
        "oh_p75": 0.274,
        "oh_p90": 0.1,
        "ol_p50": 0.467,
        "ol_p75": 0.228,
        "ol_p90": 0.104
      },
      "n_folds": 6
    },
    "GBPUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4003,
          1.8034,
          2.3391
        ],
        "oc": [
          0.6121,
          1.067,
          1.5761
        ],
        "oh": [
          0.6136,
          1.0477,
          1.5633
        ],
        "ol": [
          0.6424,
          1.0738,
          1.5918
        ]
      },
      "event": {
        "FOMC": 1.051,
        "NFP": 1.024,
        "CPI": 1.078,
        "high": 1.027,
        "holiday": 0.797,
        "none": 0.956
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.479,
        "hl_p75": 0.239,
        "hl_p90": 0.108,
        "oc_p50": 0.483,
        "oc_p75": 0.251,
        "oc_p90": 0.108,
        "oh_p50": 0.494,
        "oh_p75": 0.251,
        "oh_p90": 0.116,
        "ol_p50": 0.456,
        "ol_p75": 0.224,
        "ol_p90": 0.097
      },
      "n_folds": 6
    },
    "GOLD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4104,
          1.8455,
          2.462
        ],
        "oc": [
          0.5976,
          1.0817,
          1.6828
        ],
        "oh": [
          0.6204,
          1.1003,
          1.6611
        ],
        "ol": [
          0.5812,
          1.0676,
          1.666
        ]
      },
      "event": {
        "FOMC": 1.231,
        "NFP": 1.028,
        "CPI": 1.05,
        "high": 1.02,
        "holiday": 0.746,
        "none": 0.95
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.55,
        "hl_p75": 0.291,
        "hl_p90": 0.112,
        "oc_p50": 0.523,
        "oc_p75": 0.283,
        "oc_p90": 0.109,
        "oh_p50": 0.562,
        "oh_p75": 0.26,
        "oh_p90": 0.105,
        "ol_p50": 0.473,
        "ol_p75": 0.256,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "NQ": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3675,
          1.8145,
          2.3536
        ],
        "oc": [
          0.6324,
          1.1023,
          1.6462
        ],
        "oh": [
          0.6125,
          1.0475,
          1.4772
        ],
        "ol": [
          0.5443,
          1.0559,
          1.7473
        ]
      },
      "event": {
        "FOMC": 1.14,
        "NFP": 1.05,
        "CPI": 1.101,
        "high": 1.006,
        "holiday": 0.694,
        "none": 0.974
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.51,
        "hl_p75": 0.224,
        "hl_p90": 0.077,
        "oc_p50": 0.498,
        "oc_p75": 0.216,
        "oc_p90": 0.054,
        "oh_p50": 0.483,
        "oh_p75": 0.216,
        "oh_p90": 0.073,
        "ol_p50": 0.517,
        "ol_p75": 0.266,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "NZDCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4013,
          1.8149,
          2.2739
        ],
        "oc": [
          0.6155,
          1.0268,
          1.5373
        ],
        "oh": [
          0.6336,
          1.1122,
          1.6145
        ],
        "ol": [
          0.6088,
          1.0868,
          1.6007
        ]
      },
      "event": {
        "FOMC": 1.151,
        "NFP": 1.081,
        "CPI": 1.06,
        "high": 1.048,
        "holiday": 0.86,
        "none": 0.941
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.49,
        "hl_p75": 0.266,
        "hl_p90": 0.131,
        "oc_p50": 0.517,
        "oc_p75": 0.266,
        "oc_p90": 0.116,
        "oh_p50": 0.467,
        "oh_p75": 0.243,
        "oh_p90": 0.097,
        "ol_p50": 0.49,
        "ol_p75": 0.266,
        "ol_p90": 0.104
      },
      "n_folds": 6
    },
    "NZDJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4271,
          1.8812,
          2.3914
        ],
        "oc": [
          0.6211,
          1.0845,
          1.6516
        ],
        "oh": [
          0.6201,
          1.0633,
          1.5823
        ],
        "ol": [
          0.6246,
          1.1148,
          1.7677
        ]
      },
      "event": {
        "FOMC": 1.051,
        "NFP": 1.025,
        "CPI": 1.027,
        "high": 1.026,
        "holiday": 0.854,
        "none": 0.99
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.375,
        "hl_p75": 0.189,
        "hl_p90": 0.066,
        "oc_p50": 0.463,
        "oc_p75": 0.208,
        "oc_p90": 0.108,
        "oh_p50": 0.463,
        "oh_p75": 0.212,
        "oh_p90": 0.085,
        "ol_p50": 0.486,
        "ol_p75": 0.224,
        "ol_p90": 0.073
      },
      "n_folds": 6
    },
    "NZDUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4249,
          1.8305,
          2.3345
        ],
        "oc": [
          0.6249,
          1.0637,
          1.5717
        ],
        "oh": [
          0.6447,
          1.1031,
          1.5913
        ],
        "ol": [
          0.5986,
          1.0865,
          1.6399
        ]
      },
      "event": {
        "FOMC": 1.259,
        "NFP": 1.082,
        "CPI": 1.107,
        "high": 1.03,
        "holiday": 0.807,
        "none": 0.953
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.467,
        "hl_p75": 0.239,
        "hl_p90": 0.12,
        "oc_p50": 0.498,
        "oc_p75": 0.259,
        "oc_p90": 0.127,
        "oh_p50": 0.471,
        "oh_p75": 0.239,
        "oh_p90": 0.112,
        "ol_p50": 0.471,
        "ol_p75": 0.243,
        "ol_p90": 0.093
      },
      "n_folds": 6
    },
    "SPX": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3476,
          1.7846,
          2.3545
        ],
        "oc": [
          0.6028,
          1.0645,
          1.5775
        ],
        "oh": [
          0.6082,
          1.0442,
          1.4773
        ],
        "ol": [
          0.5447,
          1.0497,
          1.714
        ]
      },
      "event": {
        "FOMC": 1.16,
        "NFP": 1.081,
        "CPI": 1.108,
        "high": 1.004,
        "holiday": 0.72,
        "none": 0.966
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.486,
        "hl_p75": 0.22,
        "hl_p90": 0.085,
        "oc_p50": 0.533,
        "oc_p75": 0.189,
        "oc_p90": 0.077,
        "oh_p50": 0.517,
        "oh_p75": 0.212,
        "oh_p90": 0.069,
        "ol_p50": 0.498,
        "ol_p75": 0.27,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "UK100": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3595,
          1.7407,
          2.2901
        ],
        "oc": [
          0.5836,
          1.0202,
          1.5223
        ],
        "oh": [
          0.6176,
          1.0294,
          1.4428
        ],
        "ol": [
          0.5899,
          1.065,
          1.6871
        ]
      },
      "event": {
        "FOMC": 0.966,
        "NFP": 1.036,
        "CPI": 0.999,
        "high": 1.02,
        "holiday": 0.915,
        "none": 0.999
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.486,
        "hl_p75": 0.296,
        "hl_p90": 0.107,
        "oc_p50": 0.522,
        "oc_p75": 0.277,
        "oc_p90": 0.13,
        "oh_p50": 0.466,
        "oh_p75": 0.261,
        "oh_p90": 0.158,
        "ol_p50": 0.494,
        "ol_p75": 0.213,
        "ol_p90": 0.071
      },
      "n_folds": 6
    },
    "US2000": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4226,
          1.8262,
          2.3743
        ],
        "oc": [
          0.6307,
          1.0942,
          1.5819
        ],
        "oh": [
          0.6264,
          1.0453,
          1.521
        ],
        "ol": [
          0.6152,
          1.1386,
          1.7256
        ]
      },
      "event": {
        "FOMC": 1.191,
        "NFP": 1.047,
        "CPI": 1.082,
        "high": 1.029,
        "holiday": 0.725,
        "none": 0.974
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.452,
        "hl_p75": 0.232,
        "hl_p90": 0.081,
        "oc_p50": 0.444,
        "oc_p75": 0.22,
        "oc_p90": 0.1,
        "oh_p50": 0.529,
        "oh_p75": 0.251,
        "oh_p90": 0.12,
        "ol_p50": 0.463,
        "ol_p75": 0.228,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "DOW": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3534,
          1.7809,
          2.3106
        ],
        "oc": [
          0.5815,
          1.0227,
          1.5468
        ],
        "oh": [
          0.6045,
          1.0105,
          1.4643
        ],
        "ol": [
          0.557,
          1.0621,
          1.6807
        ]
      },
      "event": {
        "FOMC": 1.14,
        "NFP": 1.028,
        "CPI": 1.079,
        "high": 1.009,
        "holiday": 0.723,
        "none": 0.979
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.486,
        "hl_p75": 0.22,
        "hl_p90": 0.1,
        "oc_p50": 0.483,
        "oc_p75": 0.239,
        "oc_p90": 0.12,
        "oh_p50": 0.51,
        "oh_p75": 0.274,
        "oh_p90": 0.12,
        "ol_p50": 0.506,
        "ol_p75": 0.247,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "USDCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3953,
          1.8183,
          2.3372
        ],
        "oc": [
          0.5889,
          1.0768,
          1.6386
        ],
        "oh": [
          0.6392,
          1.0736,
          1.6623
        ],
        "ol": [
          0.5865,
          1.0186,
          1.5734
        ]
      },
      "event": {
        "FOMC": 1.142,
        "NFP": 1.069,
        "CPI": 1.06,
        "high": 1.028,
        "holiday": 0.785,
        "none": 0.946
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.448,
        "hl_p75": 0.208,
        "hl_p90": 0.097,
        "oc_p50": 0.49,
        "oc_p75": 0.216,
        "oc_p90": 0.081,
        "oh_p50": 0.502,
        "oh_p75": 0.251,
        "oh_p90": 0.046,
        "ol_p50": 0.486,
        "ol_p75": 0.251,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "USDCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.432,
          1.8798,
          2.3884
        ],
        "oc": [
          0.6151,
          1.1032,
          1.6241
        ],
        "oh": [
          0.6543,
          1.1037,
          1.6116
        ],
        "ol": [
          0.6038,
          1.1049,
          1.6913
        ]
      },
      "event": {
        "FOMC": 1.169,
        "NFP": 1.054,
        "CPI": 1.052,
        "high": 1.032,
        "holiday": 0.809,
        "none": 0.949
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.463,
        "hl_p75": 0.212,
        "hl_p90": 0.089,
        "oc_p50": 0.506,
        "oc_p75": 0.247,
        "oc_p90": 0.104,
        "oh_p50": 0.456,
        "oh_p75": 0.251,
        "oh_p90": 0.085,
        "ol_p50": 0.521,
        "ol_p75": 0.22,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "USDJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3944,
          1.8833,
          2.422
        ],
        "oc": [
          0.6136,
          1.1201,
          1.6957
        ],
        "oh": [
          0.5914,
          1.0655,
          1.5914
        ],
        "ol": [
          0.6088,
          1.1178,
          1.7516
        ]
      },
      "event": {
        "FOMC": 1.18,
        "NFP": 1.127,
        "CPI": 1.048,
        "high": 1.023,
        "holiday": 0.799,
        "none": 0.979
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.432,
        "hl_p75": 0.216,
        "hl_p90": 0.097,
        "oc_p50": 0.471,
        "oc_p75": 0.22,
        "oc_p90": 0.093,
        "oh_p50": 0.479,
        "oh_p75": 0.181,
        "oh_p90": 0.089,
        "ol_p50": 0.463,
        "ol_p75": 0.236,
        "ol_p90": 0.104
      },
      "n_folds": 6
    }
  },
  "classDefaults": {
    "fx": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.412,
          1.8419,
          2.3504
        ],
        "oc": [
          0.6151,
          1.0779,
          1.6126
        ],
        "oh": [
          0.6137,
          1.0665,
          1.609
        ],
        "ol": [
          0.6227,
          1.1003,
          1.6399
        ]
      },
      "event": {
        "FOMC": 1.056,
        "NFP": 1.044,
        "CPI": 1.035,
        "high": 1.037,
        "holiday": 0.833,
        "none": 0.951
      },
      "horizons": {},
      "n_members": 27
    },
    "index": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3564,
          1.7836,
          2.354
        ],
        "oc": [
          0.5975,
          1.0518,
          1.5797
        ],
        "oh": [
          0.6103,
          1.0368,
          1.4708
        ],
        "ol": [
          0.5632,
          1.0635,
          1.7198
        ]
      },
      "event": {
        "FOMC": 1.14,
        "NFP": 1.048,
        "CPI": 1.081,
        "high": 1.012,
        "holiday": 0.724,
        "none": 0.976
      },
      "horizons": {},
      "n_members": 6
    },
    "commodity": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4104,
          1.8455,
          2.462
        ],
        "oc": [
          0.5976,
          1.0817,
          1.6828
        ],
        "oh": [
          0.6204,
          1.1003,
          1.6611
        ],
        "ol": [
          0.5812,
          1.0676,
          1.666
        ]
      },
      "event": {
        "FOMC": 1.231,
        "NFP": 1.028,
        "CPI": 1.05,
        "high": 1.02,
        "holiday": 0.746,
        "none": 0.95
      },
      "horizons": {},
      "n_members": 1
    }
  },
  "coverage": {
    "fitted": [
      "AUDCAD",
      "AUDCHF",
      "AUDJPY",
      "AUDNZD",
      "AUDUSD",
      "CADCHF",
      "CADJPY",
      "CHFJPY",
      "DE30",
      "DOW",
      "EURAUD",
      "EURCAD",
      "EURCHF",
      "EURGBP",
      "EURJPY",
      "EURNZD",
      "EURUSD",
      "GBPAUD",
      "GBPCAD",
      "GBPCHF",
      "GBPJPY",
      "GBPNZD",
      "GBPUSD",
      "GOLD",
      "NQ",
      "NZDCAD",
      "NZDJPY",
      "NZDUSD",
      "SPX",
      "UK100",
      "US2000",
      "USDCAD",
      "USDCHF",
      "USDJPY"
    ],
    "skipped": [
      "nas100_usd (duplicate of nq)",
      "xauusd (duplicate of gold)"
    ],
    "mean_last_fold_oos_exceed_p50": 0.4743
  }
};
