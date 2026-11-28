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
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4205,
          1.8502,
          2.3449
        ],
        "oc": [
          0.5923,
          1.0527,
          1.5676
        ],
        "oh": [
          0.6459,
          1.0998,
          1.6036
        ],
        "ol": [
          0.6059,
          1.085,
          1.6527
        ]
      },
      "event": {
        "FOMC": 1.136,
        "NFP": 1.101,
        "CPI": 1.019,
        "high": 1.044,
        "holiday": 0.825,
        "none": 0.918
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.475,
        "hl_p75": 0.259,
        "hl_p90": 0.131,
        "oc_p50": 0.479,
        "oc_p75": 0.263,
        "oc_p90": 0.108,
        "oh_p50": 0.506,
        "oh_p75": 0.263,
        "oh_p90": 0.124,
        "ol_p50": 0.483,
        "ol_p75": 0.239,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "AUDCHF": {
      "estimator": "ewma_090",
      "width": {
        "hl": [
          1.4924,
          1.9484,
          2.5336
        ],
        "oc": [
          0.6561,
          1.1649,
          1.7127
        ],
        "oh": [
          0.6569,
          1.1217,
          1.6858
        ],
        "ol": [
          0.6374,
          1.1557,
          1.8179
        ]
      },
      "event": {
        "FOMC": 1.112,
        "NFP": 1.051,
        "CPI": 1.008,
        "high": 1.057,
        "holiday": 0.808,
        "none": 0.927
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.517,
        "hl_p75": 0.243,
        "hl_p90": 0.081,
        "oc_p50": 0.467,
        "oc_p75": 0.22,
        "oc_p90": 0.089,
        "oh_p50": 0.514,
        "oh_p75": 0.263,
        "oh_p90": 0.097,
        "ol_p50": 0.525,
        "ol_p75": 0.228,
        "ol_p90": 0.058
      },
      "n_folds": 6
    },
    "AUDJPY": {
      "estimator": "ewma_090",
      "width": {
        "hl": [
          1.4516,
          1.9464,
          2.5632
        ],
        "oc": [
          0.6138,
          1.1311,
          1.6868
        ],
        "oh": [
          0.6169,
          1.0888,
          1.6415
        ],
        "ol": [
          0.6291,
          1.1448,
          1.8407
        ]
      },
      "event": {
        "FOMC": 1.121,
        "NFP": 1.066,
        "CPI": 0.989,
        "high": 1.043,
        "holiday": 0.826,
        "none": 0.955
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.463,
        "hl_p75": 0.216,
        "hl_p90": 0.077,
        "oc_p50": 0.494,
        "oc_p75": 0.22,
        "oc_p90": 0.089,
        "oh_p50": 0.502,
        "oh_p75": 0.255,
        "oh_p90": 0.089,
        "ol_p50": 0.448,
        "ol_p75": 0.224,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "AUDNZD": {
      "estimator": "yz_20",
      "width": {
        "hl": [
          1.3552,
          1.7564,
          2.258
        ],
        "oc": [
          0.5616,
          0.9759,
          1.4645
        ],
        "oh": [
          0.5898,
          1.0412,
          1.5546
        ],
        "ol": [
          0.6058,
          1.0612,
          1.5686
        ]
      },
      "event": {
        "FOMC": 1.061,
        "NFP": 1.062,
        "CPI": 1.02,
        "high": 1.034,
        "holiday": 0.875,
        "none": 0.944
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.517,
        "hl_p75": 0.251,
        "hl_p90": 0.124,
        "oc_p50": 0.552,
        "oc_p75": 0.297,
        "oc_p90": 0.131,
        "oh_p50": 0.544,
        "oh_p75": 0.278,
        "oh_p90": 0.127,
        "ol_p50": 0.459,
        "ol_p75": 0.236,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "AUDUSD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4306,
          1.8651,
          2.3961
        ],
        "oc": [
          0.6249,
          1.0818,
          1.6757
        ],
        "oh": [
          0.6425,
          1.0919,
          1.5837
        ],
        "ol": [
          0.6225,
          1.1127,
          1.7095
        ]
      },
      "event": {
        "FOMC": 1.262,
        "NFP": 1.118,
        "CPI": 1.024,
        "high": 1.046,
        "holiday": 0.788,
        "none": 0.925
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.494,
        "hl_p75": 0.232,
        "hl_p90": 0.093,
        "oc_p50": 0.486,
        "oc_p75": 0.236,
        "oc_p90": 0.073,
        "oh_p50": 0.494,
        "oh_p75": 0.263,
        "oh_p90": 0.116,
        "ol_p50": 0.483,
        "ol_p75": 0.236,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "CADCHF": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4366,
          1.874,
          2.4337
        ],
        "oc": [
          0.6223,
          1.0996,
          1.6057
        ],
        "oh": [
          0.6037,
          1.0785,
          1.5884
        ],
        "ol": [
          0.632,
          1.1102,
          1.7185
        ]
      },
      "event": {
        "FOMC": 1.009,
        "NFP": 1.044,
        "CPI": 0.995,
        "high": 1.044,
        "holiday": 0.793,
        "none": 0.958
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.459,
        "hl_p75": 0.236,
        "hl_p90": 0.097,
        "oc_p50": 0.432,
        "oc_p75": 0.236,
        "oc_p90": 0.112,
        "oh_p50": 0.514,
        "oh_p75": 0.22,
        "oh_p90": 0.077,
        "ol_p50": 0.502,
        "ol_p75": 0.239,
        "ol_p90": 0.12
      },
      "n_folds": 6
    },
    "CADJPY": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.382,
          1.8582,
          2.4231
        ],
        "oc": [
          0.6085,
          1.0784,
          1.6641
        ],
        "oh": [
          0.5797,
          1.0444,
          1.6039
        ],
        "ol": [
          0.5939,
          1.1111,
          1.7264
        ]
      },
      "event": {
        "FOMC": 1.022,
        "NFP": 1.086,
        "CPI": 0.988,
        "high": 1.035,
        "holiday": 0.826,
        "none": 0.964
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.452,
        "hl_p75": 0.181,
        "hl_p90": 0.077,
        "oc_p50": 0.471,
        "oc_p75": 0.232,
        "oc_p90": 0.085,
        "oh_p50": 0.459,
        "oh_p75": 0.224,
        "oh_p90": 0.073,
        "ol_p50": 0.456,
        "ol_p75": 0.212,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "CHFJPY": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4607,
          1.8727,
          2.3936
        ],
        "oc": [
          0.5973,
          1.0811,
          1.6474
        ],
        "oh": [
          0.6217,
          1.1018,
          1.6854
        ],
        "ol": [
          0.6288,
          1.1137,
          1.6661
        ]
      },
      "event": {
        "FOMC": 0.969,
        "NFP": 1.03,
        "CPI": 1.065,
        "high": 1.027,
        "holiday": 0.807,
        "none": 0.998
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.367,
        "hl_p75": 0.208,
        "hl_p90": 0.089,
        "oc_p50": 0.498,
        "oc_p75": 0.243,
        "oc_p90": 0.089,
        "oh_p50": 0.459,
        "oh_p75": 0.224,
        "oh_p90": 0.073,
        "ol_p50": 0.413,
        "ol_p75": 0.216,
        "ol_p90": 0.093
      },
      "n_folds": 6
    },
    "DE30": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.3698,
          1.8286,
          2.3816
        ],
        "oc": [
          0.585,
          1.0474,
          1.6482
        ],
        "oh": [
          0.5782,
          1.0176,
          1.4948
        ],
        "ol": [
          0.5765,
          1.0679,
          1.7845
        ]
      },
      "event": {
        "FOMC": 1.021,
        "NFP": 1.031,
        "CPI": 1.021,
        "high": 1.028,
        "holiday": 0.876,
        "none": 0.98
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.47,
        "hl_p75": 0.233,
        "hl_p90": 0.103,
        "oc_p50": 0.486,
        "oc_p75": 0.281,
        "oc_p90": 0.079,
        "oh_p50": 0.447,
        "oh_p75": 0.253,
        "oh_p90": 0.099,
        "ol_p50": 0.542,
        "ol_p75": 0.265,
        "ol_p90": 0.075
      },
      "n_folds": 6
    },
    "EURAUD": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4568,
          1.8936,
          2.4425
        ],
        "oc": [
          0.6379,
          1.1183,
          1.6704
        ],
        "oh": [
          0.6335,
          1.1459,
          1.7502
        ],
        "ol": [
          0.6375,
          1.105,
          1.6317
        ]
      },
      "event": {
        "FOMC": 1.073,
        "NFP": 1.046,
        "CPI": 1.024,
        "high": 1.068,
        "holiday": 0.848,
        "none": 0.918
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.479,
        "hl_p75": 0.263,
        "hl_p90": 0.085,
        "oc_p50": 0.459,
        "oc_p75": 0.232,
        "oc_p90": 0.081,
        "oh_p50": 0.506,
        "oh_p75": 0.239,
        "oh_p90": 0.081,
        "ol_p50": 0.514,
        "ol_p75": 0.232,
        "ol_p90": 0.108
      },
      "n_folds": 6
    },
    "EURCAD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.436,
          1.8923,
          2.4143
        ],
        "oc": [
          0.6259,
          1.1022,
          1.6564
        ],
        "oh": [
          0.6282,
          1.1179,
          1.7072
        ],
        "ol": [
          0.6181,
          1.0912,
          1.6231
        ]
      },
      "event": {
        "FOMC": 1.015,
        "NFP": 1.06,
        "CPI": 0.951,
        "high": 1.044,
        "holiday": 0.839,
        "none": 0.967
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.456,
        "hl_p75": 0.197,
        "hl_p90": 0.081,
        "oc_p50": 0.463,
        "oc_p75": 0.212,
        "oc_p90": 0.085,
        "oh_p50": 0.506,
        "oh_p75": 0.224,
        "oh_p90": 0.066,
        "ol_p50": 0.498,
        "ol_p75": 0.22,
        "ol_p90": 0.073
      },
      "n_folds": 6
    },
    "EURCHF": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4742,
          1.9601,
          2.5325
        ],
        "oc": [
          0.6279,
          1.1007,
          1.6534
        ],
        "oh": [
          0.63,
          1.1453,
          1.6872
        ],
        "ol": [
          0.6554,
          1.1439,
          1.7473
        ]
      },
      "event": {
        "FOMC": 1.004,
        "NFP": 1.031,
        "CPI": 1.037,
        "high": 1.027,
        "holiday": 0.904,
        "none": 0.982
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.494,
        "hl_p75": 0.236,
        "hl_p90": 0.104,
        "oc_p50": 0.51,
        "oc_p75": 0.255,
        "oc_p90": 0.104,
        "oh_p50": 0.51,
        "oh_p75": 0.205,
        "oh_p90": 0.093,
        "ol_p50": 0.448,
        "ol_p75": 0.255,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "EURGBP": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4416,
          1.8777,
          2.4554
        ],
        "oc": [
          0.5969,
          1.0465,
          1.6388
        ],
        "oh": [
          0.6159,
          1.1153,
          1.7145
        ],
        "ol": [
          0.6523,
          1.095,
          1.6218
        ]
      },
      "event": {
        "FOMC": 0.978,
        "NFP": 0.988,
        "CPI": 1.09,
        "high": 1.04,
        "holiday": 0.824,
        "none": 0.971
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.429,
        "hl_p75": 0.232,
        "hl_p90": 0.1,
        "oc_p50": 0.436,
        "oc_p75": 0.212,
        "oc_p90": 0.104,
        "oh_p50": 0.479,
        "oh_p75": 0.197,
        "oh_p90": 0.089,
        "ol_p50": 0.448,
        "ol_p75": 0.236,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "EURJPY": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4159,
          1.8904,
          2.3999
        ],
        "oc": [
          0.6163,
          1.0869,
          1.6427
        ],
        "oh": [
          0.6097,
          1.061,
          1.6439
        ],
        "ol": [
          0.6274,
          1.128,
          1.7105
        ]
      },
      "event": {
        "FOMC": 0.971,
        "NFP": 1.061,
        "CPI": 1.01,
        "high": 1.039,
        "holiday": 0.823,
        "none": 0.968
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.386,
        "hl_p75": 0.185,
        "hl_p90": 0.093,
        "oc_p50": 0.452,
        "oc_p75": 0.236,
        "oc_p90": 0.089,
        "oh_p50": 0.479,
        "oh_p75": 0.232,
        "oh_p90": 0.066,
        "ol_p50": 0.409,
        "ol_p75": 0.208,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "EURNZD": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4569,
          1.9034,
          2.3938
        ],
        "oc": [
          0.6278,
          1.104,
          1.6245
        ],
        "oh": [
          0.6283,
          1.1323,
          1.7334
        ],
        "ol": [
          0.641,
          1.1335,
          1.6505
        ]
      },
      "event": {
        "FOMC": 1.057,
        "NFP": 1.039,
        "CPI": 1.079,
        "high": 1.049,
        "holiday": 0.853,
        "none": 0.951
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.409,
        "hl_p75": 0.216,
        "hl_p90": 0.069,
        "oc_p50": 0.475,
        "oc_p75": 0.243,
        "oc_p90": 0.081,
        "oh_p50": 0.467,
        "oh_p75": 0.239,
        "oh_p90": 0.073,
        "ol_p50": 0.452,
        "ol_p75": 0.208,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "EURUSD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4388,
          1.8881,
          2.3759
        ],
        "oc": [
          0.6336,
          1.1226,
          1.643
        ],
        "oh": [
          0.6079,
          1.1047,
          1.6589
        ],
        "ol": [
          0.634,
          1.1089,
          1.653
        ]
      },
      "event": {
        "FOMC": 1.209,
        "NFP": 1.103,
        "CPI": 1.07,
        "high": 1.035,
        "holiday": 0.77,
        "none": 0.948
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.421,
        "hl_p75": 0.201,
        "hl_p90": 0.1,
        "oc_p50": 0.444,
        "oc_p75": 0.212,
        "oc_p90": 0.077,
        "oh_p50": 0.463,
        "oh_p75": 0.216,
        "oh_p90": 0.085,
        "ol_p50": 0.463,
        "ol_p75": 0.251,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "GBPAUD": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4625,
          1.9058,
          2.4549
        ],
        "oc": [
          0.6137,
          1.1108,
          1.6443
        ],
        "oh": [
          0.634,
          1.1208,
          1.7048
        ],
        "ol": [
          0.6364,
          1.136,
          1.6533
        ]
      },
      "event": {
        "FOMC": 1.002,
        "NFP": 1.031,
        "CPI": 1.05,
        "high": 1.053,
        "holiday": 0.87,
        "none": 0.938
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.506,
        "hl_p75": 0.251,
        "hl_p90": 0.104,
        "oc_p50": 0.548,
        "oc_p75": 0.259,
        "oc_p90": 0.104,
        "oh_p50": 0.502,
        "oh_p75": 0.247,
        "oh_p90": 0.1,
        "ol_p50": 0.521,
        "ol_p75": 0.274,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "GBPCAD": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4409,
          1.8781,
          2.4083
        ],
        "oc": [
          0.6269,
          1.0925,
          1.6086
        ],
        "oh": [
          0.6272,
          1.0849,
          1.6441
        ],
        "ol": [
          0.6297,
          1.1288,
          1.6735
        ]
      },
      "event": {
        "FOMC": 1.005,
        "NFP": 1.034,
        "CPI": 1.046,
        "high": 1.029,
        "holiday": 0.82,
        "none": 0.984
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.486,
        "hl_p75": 0.259,
        "hl_p90": 0.097,
        "oc_p50": 0.463,
        "oc_p75": 0.236,
        "oc_p90": 0.1,
        "oh_p50": 0.49,
        "oh_p75": 0.243,
        "oh_p90": 0.097,
        "ol_p50": 0.483,
        "ol_p75": 0.239,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "GBPCHF": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4397,
          1.8812,
          2.4778
        ],
        "oc": [
          0.6179,
          1.0771,
          1.6745
        ],
        "oh": [
          0.6116,
          1.0918,
          1.6491
        ],
        "ol": [
          0.6284,
          1.1192,
          1.7041
        ]
      },
      "event": {
        "FOMC": 0.959,
        "NFP": 1.003,
        "CPI": 1.032,
        "high": 1.048,
        "holiday": 0.861,
        "none": 0.984
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.459,
        "hl_p75": 0.259,
        "hl_p90": 0.124,
        "oc_p50": 0.483,
        "oc_p75": 0.232,
        "oc_p90": 0.108,
        "oh_p50": 0.49,
        "oh_p75": 0.232,
        "oh_p90": 0.12,
        "ol_p50": 0.494,
        "ol_p75": 0.201,
        "ol_p90": 0.112
      },
      "n_folds": 6
    },
    "GBPJPY": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.387,
          1.854,
          2.4409
        ],
        "oc": [
          0.5698,
          1.0765,
          1.6277
        ],
        "oh": [
          0.6009,
          1.0389,
          1.61
        ],
        "ol": [
          0.6137,
          1.0898,
          1.6938
        ]
      },
      "event": {
        "FOMC": 0.964,
        "NFP": 1.028,
        "CPI": 1.075,
        "high": 1.038,
        "holiday": 0.84,
        "none": 0.978
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.436,
        "hl_p75": 0.239,
        "hl_p90": 0.073,
        "oc_p50": 0.486,
        "oc_p75": 0.243,
        "oc_p90": 0.081,
        "oh_p50": 0.494,
        "oh_p75": 0.259,
        "oh_p90": 0.089,
        "ol_p50": 0.429,
        "ol_p75": 0.232,
        "ol_p90": 0.093
      },
      "n_folds": 6
    },
    "GBPNZD": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4603,
          1.8942,
          2.4683
        ],
        "oc": [
          0.6199,
          1.0612,
          1.6524
        ],
        "oh": [
          0.6364,
          1.0963,
          1.6845
        ],
        "ol": [
          0.6565,
          1.1415,
          1.672
        ]
      },
      "event": {
        "FOMC": 1.068,
        "NFP": 1.028,
        "CPI": 1.034,
        "high": 1.033,
        "holiday": 0.873,
        "none": 0.952
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.471,
        "hl_p75": 0.228,
        "hl_p90": 0.085,
        "oc_p50": 0.502,
        "oc_p75": 0.232,
        "oc_p90": 0.097,
        "oh_p50": 0.475,
        "oh_p75": 0.266,
        "oh_p90": 0.1,
        "ol_p50": 0.483,
        "ol_p75": 0.228,
        "ol_p90": 0.116
      },
      "n_folds": 6
    },
    "GBPUSD": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4331,
          1.8588,
          2.4276
        ],
        "oc": [
          0.6214,
          1.0913,
          1.6184
        ],
        "oh": [
          0.6103,
          1.0696,
          1.6133
        ],
        "ol": [
          0.6426,
          1.0988,
          1.6616
        ]
      },
      "event": {
        "FOMC": 1.062,
        "NFP": 1.026,
        "CPI": 1.113,
        "high": 1.022,
        "holiday": 0.798,
        "none": 0.978
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.463,
        "hl_p75": 0.247,
        "hl_p90": 0.12,
        "oc_p50": 0.486,
        "oc_p75": 0.243,
        "oc_p90": 0.124,
        "oh_p50": 0.521,
        "oh_p75": 0.255,
        "oh_p90": 0.131,
        "ol_p50": 0.471,
        "ol_p75": 0.216,
        "ol_p90": 0.104
      },
      "n_folds": 6
    },
    "GOLD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4135,
          1.8669,
          2.4632
        ],
        "oc": [
          0.592,
          1.097,
          1.6586
        ],
        "oh": [
          0.6183,
          1.1003,
          1.6892
        ],
        "ol": [
          0.5768,
          1.0708,
          1.6768
        ]
      },
      "event": {
        "FOMC": 1.243,
        "NFP": 1.041,
        "CPI": 1.039,
        "high": 1.028,
        "holiday": 0.757,
        "none": 0.95
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.481,
        "hl_p75": 0.264,
        "hl_p90": 0.112,
        "oc_p50": 0.496,
        "oc_p75": 0.233,
        "oc_p90": 0.097,
        "oh_p50": 0.539,
        "oh_p75": 0.221,
        "oh_p90": 0.109,
        "ol_p50": 0.477,
        "ol_p75": 0.248,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "NQ": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4067,
          1.8869,
          2.4836
        ],
        "oc": [
          0.6274,
          1.1362,
          1.7093
        ],
        "oh": [
          0.6262,
          1.0844,
          1.5552
        ],
        "ol": [
          0.5632,
          1.087,
          1.7954
        ]
      },
      "event": {
        "FOMC": 1.111,
        "NFP": 1.07,
        "CPI": 1.059,
        "high": 1.037,
        "holiday": 0.687,
        "none": 0.975
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.498,
        "hl_p75": 0.247,
        "hl_p90": 0.077,
        "oc_p50": 0.483,
        "oc_p75": 0.224,
        "oc_p90": 0.069,
        "oh_p50": 0.479,
        "oh_p75": 0.224,
        "oh_p90": 0.081,
        "ol_p50": 0.514,
        "ol_p75": 0.263,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "NZDCAD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4093,
          1.8198,
          2.3245
        ],
        "oc": [
          0.6101,
          1.0334,
          1.5218
        ],
        "oh": [
          0.6251,
          1.1011,
          1.6047
        ],
        "ol": [
          0.6072,
          1.0972,
          1.6016
        ]
      },
      "event": {
        "FOMC": 1.127,
        "NFP": 1.097,
        "CPI": 1.027,
        "high": 1.026,
        "holiday": 0.872,
        "none": 0.941
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.51,
        "hl_p75": 0.278,
        "hl_p90": 0.12,
        "oc_p50": 0.514,
        "oc_p75": 0.278,
        "oc_p90": 0.112,
        "oh_p50": 0.483,
        "oh_p75": 0.259,
        "oh_p90": 0.1,
        "ol_p50": 0.498,
        "ol_p75": 0.255,
        "ol_p90": 0.108
      },
      "n_folds": 6
    },
    "NZDJPY": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.4302,
          1.8755,
          2.4486
        ],
        "oc": [
          0.6087,
          1.0739,
          1.6846
        ],
        "oh": [
          0.6242,
          1.097,
          1.6106
        ],
        "ol": [
          0.618,
          1.0997,
          1.7506
        ]
      },
      "event": {
        "FOMC": 1.068,
        "NFP": 1.041,
        "CPI": 1.039,
        "high": 1.046,
        "holiday": 0.866,
        "none": 0.962
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.386,
        "hl_p75": 0.181,
        "hl_p90": 0.069,
        "oc_p50": 0.471,
        "oc_p75": 0.224,
        "oc_p90": 0.108,
        "oh_p50": 0.475,
        "oh_p75": 0.205,
        "oh_p90": 0.085,
        "ol_p50": 0.486,
        "ol_p75": 0.232,
        "ol_p90": 0.081
      },
      "n_folds": 6
    },
    "NZDUSD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4244,
          1.8389,
          2.3587
        ],
        "oc": [
          0.6286,
          1.0754,
          1.6013
        ],
        "oh": [
          0.6468,
          1.1061,
          1.6112
        ],
        "ol": [
          0.6017,
          1.0893,
          1.6563
        ]
      },
      "event": {
        "FOMC": 1.208,
        "NFP": 1.096,
        "CPI": 1.086,
        "high": 1.022,
        "holiday": 0.812,
        "none": 0.955
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.49,
        "hl_p75": 0.297,
        "hl_p90": 0.12,
        "oc_p50": 0.475,
        "oc_p75": 0.259,
        "oc_p90": 0.135,
        "oh_p50": 0.471,
        "oh_p75": 0.247,
        "oh_p90": 0.127,
        "ol_p50": 0.502,
        "ol_p75": 0.27,
        "ol_p90": 0.085
      },
      "n_folds": 6
    },
    "SPX": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.3858,
          1.8815,
          2.4806
        ],
        "oc": [
          0.6028,
          1.1027,
          1.6622
        ],
        "oh": [
          0.6144,
          1.0573,
          1.5595
        ],
        "ol": [
          0.559,
          1.0725,
          1.7748
        ]
      },
      "event": {
        "FOMC": 1.182,
        "NFP": 1.094,
        "CPI": 1.069,
        "high": 1.011,
        "holiday": 0.704,
        "none": 0.958
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.502,
        "hl_p75": 0.255,
        "hl_p90": 0.089,
        "oc_p50": 0.494,
        "oc_p75": 0.216,
        "oc_p90": 0.073,
        "oh_p50": 0.494,
        "oh_p75": 0.228,
        "oh_p90": 0.093,
        "ol_p50": 0.486,
        "ol_p75": 0.274,
        "ol_p90": 0.1
      },
      "n_folds": 6
    },
    "UK100": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.3803,
          1.8207,
          2.3332
        ],
        "oc": [
          0.5772,
          1.0302,
          1.5619
        ],
        "oh": [
          0.6204,
          1.0461,
          1.4859
        ],
        "ol": [
          0.5858,
          1.0989,
          1.739
        ]
      },
      "event": {
        "FOMC": 0.965,
        "NFP": 1.031,
        "CPI": 0.982,
        "high": 1.02,
        "holiday": 0.925,
        "none": 0.99
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.538,
        "hl_p75": 0.261,
        "hl_p90": 0.111,
        "oc_p50": 0.518,
        "oc_p75": 0.281,
        "oc_p90": 0.126,
        "oh_p50": 0.47,
        "oh_p75": 0.269,
        "oh_p90": 0.154,
        "ol_p50": 0.502,
        "ol_p75": 0.209,
        "ol_p90": 0.087
      },
      "n_folds": 6
    },
    "US2000": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4243,
          1.8598,
          2.4493
        ],
        "oc": [
          0.6287,
          1.1038,
          1.6082
        ],
        "oh": [
          0.6163,
          1.0583,
          1.5502
        ],
        "ol": [
          0.6098,
          1.137,
          1.715
        ]
      },
      "event": {
        "FOMC": 1.167,
        "NFP": 1.047,
        "CPI": 1.052,
        "high": 1.021,
        "holiday": 0.72,
        "none": 0.985
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.494,
        "hl_p75": 0.247,
        "hl_p90": 0.097,
        "oc_p50": 0.44,
        "oc_p75": 0.224,
        "oc_p90": 0.108,
        "oh_p50": 0.517,
        "oh_p75": 0.27,
        "oh_p90": 0.124,
        "ol_p50": 0.452,
        "ol_p75": 0.216,
        "ol_p90": 0.077
      },
      "n_folds": 6
    },
    "DOW": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4073,
          1.8845,
          2.4878
        ],
        "oc": [
          0.6058,
          1.0606,
          1.6631
        ],
        "oh": [
          0.6128,
          1.0498,
          1.5559
        ],
        "ol": [
          0.5722,
          1.0842,
          1.7485
        ]
      },
      "event": {
        "FOMC": 1.101,
        "NFP": 1.068,
        "CPI": 1.064,
        "high": 1.011,
        "holiday": 0.696,
        "none": 0.967
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.483,
        "hl_p75": 0.228,
        "hl_p90": 0.097,
        "oc_p50": 0.494,
        "oc_p75": 0.239,
        "oc_p90": 0.104,
        "oh_p50": 0.517,
        "oh_p75": 0.243,
        "oh_p90": 0.116,
        "ol_p50": 0.514,
        "ol_p75": 0.259,
        "ol_p90": 0.077
      },
      "n_folds": 6
    },
    "USDCAD": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4251,
          1.8638,
          2.3932
        ],
        "oc": [
          0.6043,
          1.1055,
          1.6742
        ],
        "oh": [
          0.6461,
          1.1165,
          1.7028
        ],
        "ol": [
          0.5894,
          1.0408,
          1.6091
        ]
      },
      "event": {
        "FOMC": 1.175,
        "NFP": 1.078,
        "CPI": 1.04,
        "high": 1.036,
        "holiday": 0.784,
        "none": 0.951
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.51,
        "hl_p75": 0.243,
        "hl_p90": 0.085,
        "oc_p50": 0.517,
        "oc_p75": 0.216,
        "oc_p90": 0.097,
        "oh_p50": 0.544,
        "oh_p75": 0.274,
        "oh_p90": 0.066,
        "ol_p50": 0.51,
        "ol_p75": 0.278,
        "ol_p90": 0.127
      },
      "n_folds": 6
    },
    "USDCHF": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4303,
          1.879,
          2.4495
        ],
        "oc": [
          0.6166,
          1.1106,
          1.653
        ],
        "oh": [
          0.6535,
          1.0969,
          1.5715
        ],
        "ol": [
          0.6102,
          1.1056,
          1.6914
        ]
      },
      "event": {
        "FOMC": 1.197,
        "NFP": 1.087,
        "CPI": 1.042,
        "high": 1.02,
        "holiday": 0.809,
        "none": 0.956
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.467,
        "hl_p75": 0.232,
        "hl_p90": 0.093,
        "oc_p50": 0.521,
        "oc_p75": 0.251,
        "oc_p90": 0.1,
        "oh_p50": 0.471,
        "oh_p75": 0.239,
        "oh_p90": 0.089,
        "ol_p50": 0.514,
        "ol_p75": 0.224,
        "ol_p90": 0.116
      },
      "n_folds": 6
    },
    "USDJPY": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.3677,
          1.822,
          2.3966
        ],
        "oc": [
          0.5913,
          1.0751,
          1.6301
        ],
        "oh": [
          0.5709,
          1.0394,
          1.588
        ],
        "ol": [
          0.5818,
          1.0722,
          1.6804
        ]
      },
      "event": {
        "FOMC": 1.16,
        "NFP": 1.138,
        "CPI": 1.025,
        "high": 1.026,
        "holiday": 0.815,
        "none": 0.976
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.375,
        "hl_p75": 0.181,
        "hl_p90": 0.058,
        "oc_p50": 0.402,
        "oc_p75": 0.212,
        "oc_p90": 0.077,
        "oh_p50": 0.417,
        "oh_p75": 0.162,
        "oh_p90": 0.081,
        "ol_p50": 0.425,
        "ol_p75": 0.212,
        "ol_p90": 0.089
      },
      "n_folds": 6
    }
  },
  "classDefaults": {
    "fx": {
      "estimator": "ewma_094",
      "width": {
        "hl": [
          1.436,
          1.8777,
          2.4231
        ],
        "oc": [
          0.6166,
          1.0869,
          1.6443
        ],
        "oh": [
          0.6251,
          1.097,
          1.6439
        ],
        "ol": [
          0.6284,
          1.1089,
          1.672
        ]
      },
      "event": {
        "FOMC": 1.062,
        "NFP": 1.051,
        "CPI": 1.034,
        "high": 1.038,
        "holiday": 0.825,
        "none": 0.956
      },
      "horizons": {},
      "n_members": 27
    },
    "index": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.3962,
          1.8706,
          2.4649
        ],
        "oc": [
          0.6043,
          1.0817,
          1.6552
        ],
        "oh": [
          0.6153,
          1.0535,
          1.5527
        ],
        "ol": [
          0.5744,
          1.0856,
          1.7616
        ]
      },
      "event": {
        "FOMC": 1.106,
        "NFP": 1.058,
        "CPI": 1.055,
        "high": 1.02,
        "holiday": 0.712,
        "none": 0.978
      },
      "horizons": {},
      "n_members": 6
    },
    "commodity": {
      "estimator": "yz_10",
      "width": {
        "hl": [
          1.4135,
          1.8669,
          2.4632
        ],
        "oc": [
          0.592,
          1.097,
          1.6586
        ],
        "oh": [
          0.6183,
          1.1003,
          1.6892
        ],
        "ol": [
          0.5768,
          1.0708,
          1.6768
        ]
      },
      "event": {
        "FOMC": 1.243,
        "NFP": 1.041,
        "CPI": 1.039,
        "high": 1.028,
        "holiday": 0.757,
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
    "mean_last_fold_oos_exceed_p50": 0.4797
  }
};
