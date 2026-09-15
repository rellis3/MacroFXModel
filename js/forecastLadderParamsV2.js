/**
 * Forecast ladder parameters — GENERATED, do not hand-edit.
 *
 *   python -m forge.export_ladder_params --report forge/out_vol_harlog/vol_report.json
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
  "generated": "2026-09-15",
  "source": "forge/vol.py walk-forward -> forge/out_vol_harlog/vol_report.json",
  "pairs": {
    "AUDCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3849,
          1.7927,
          2.2996
        ],
        "oc": [
          0.5755,
          1.0277,
          1.5363
        ],
        "oh": [
          0.6142,
          1.0817,
          1.5862
        ],
        "ol": [
          0.5869,
          1.0495,
          1.5895
        ]
      },
      "event": {
        "FOMC": 1.074,
        "NFP": 1.113,
        "CPI": 1.063,
        "high": 1.041,
        "none": 0.971
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.479,
        "hl_p75": 0.224,
        "hl_p90": 0.099,
        "oc_p50": 0.468,
        "oc_p75": 0.236,
        "oc_p90": 0.099,
        "oh_p50": 0.498,
        "oh_p75": 0.262,
        "oh_p90": 0.099,
        "ol_p50": 0.468,
        "ol_p75": 0.251,
        "ol_p90": 0.068
      },
      "n_folds": 6
    },
    "AUDCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.395,
          1.8449,
          2.3195
        ],
        "oc": [
          0.6063,
          1.0978,
          1.6319
        ],
        "oh": [
          0.6101,
          1.0624,
          1.5701
        ],
        "ol": [
          0.5923,
          1.0783,
          1.7413
        ]
      },
      "event": {
        "FOMC": 1.048,
        "NFP": 1.014,
        "CPI": 0.981,
        "high": 1.041,
        "none": 0.981
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.418,
        "hl_p75": 0.175,
        "hl_p90": 0.08,
        "oc_p50": 0.43,
        "oc_p75": 0.19,
        "oc_p90": 0.072,
        "oh_p50": 0.487,
        "oh_p75": 0.236,
        "oh_p90": 0.08,
        "ol_p50": 0.494,
        "ol_p75": 0.202,
        "ol_p90": 0.061
      },
      "n_folds": 6
    },
    "AUDJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4206,
          1.8912,
          2.4733
        ],
        "oc": [
          0.6041,
          1.105,
          1.6748
        ],
        "oh": [
          0.6053,
          1.0598,
          1.5864
        ],
        "ol": [
          0.6201,
          1.1178,
          1.8075
        ]
      },
      "event": {
        "FOMC": 1.098,
        "NFP": 1.05,
        "CPI": 0.968,
        "high": 1.051,
        "none": 0.982
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.414,
        "hl_p75": 0.144,
        "hl_p90": 0.068,
        "oc_p50": 0.475,
        "oc_p75": 0.19,
        "oc_p90": 0.065,
        "oh_p50": 0.46,
        "oh_p75": 0.228,
        "oh_p90": 0.065,
        "ol_p50": 0.441,
        "ol_p75": 0.213,
        "ol_p90": 0.068
      },
      "n_folds": 6
    },
    "AUDNZD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3931,
          1.8227,
          2.3302
        ],
        "oc": [
          0.5765,
          1.0136,
          1.5451
        ],
        "oh": [
          0.5967,
          1.056,
          1.5963
        ],
        "ol": [
          0.6196,
          1.0982,
          1.6278
        ]
      },
      "event": {
        "FOMC": 1.108,
        "NFP": 1.055,
        "CPI": 1.031,
        "high": 1.039,
        "none": 0.977
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.506,
        "hl_p75": 0.262,
        "hl_p90": 0.133,
        "oc_p50": 0.548,
        "oc_p75": 0.3,
        "oc_p90": 0.125,
        "oh_p50": 0.548,
        "oh_p75": 0.297,
        "oh_p90": 0.129,
        "ol_p50": 0.452,
        "ol_p75": 0.228,
        "ol_p90": 0.103
      },
      "n_folds": 6
    },
    "AUDUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4001,
          1.8171,
          2.3547
        ],
        "oc": [
          0.6201,
          1.0692,
          1.6253
        ],
        "oh": [
          0.6234,
          1.0562,
          1.5642
        ],
        "ol": [
          0.6133,
          1.0722,
          1.6614
        ]
      },
      "event": {
        "FOMC": 1.074,
        "NFP": 1.06,
        "CPI": 1.074,
        "high": 1.032,
        "none": 0.971
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.483,
        "hl_p75": 0.205,
        "hl_p90": 0.076,
        "oc_p50": 0.483,
        "oc_p75": 0.236,
        "oc_p90": 0.076,
        "oh_p50": 0.468,
        "oh_p75": 0.243,
        "oh_p90": 0.091,
        "ol_p50": 0.464,
        "ol_p75": 0.232,
        "ol_p90": 0.076
      },
      "n_folds": 6
    },
    "CADJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4258,
          1.8977,
          2.4363
        ],
        "oc": [
          0.6289,
          1.0957,
          1.7084
        ],
        "oh": [
          0.5962,
          1.0542,
          1.6184
        ],
        "ol": [
          0.6253,
          1.1589,
          1.784
        ]
      },
      "event": {
        "FOMC": 1.103,
        "NFP": 1.124,
        "CPI": 0.994,
        "high": 1.026,
        "none": 0.987
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.365,
        "hl_p75": 0.167,
        "hl_p90": 0.068,
        "oc_p50": 0.449,
        "oc_p75": 0.198,
        "oc_p90": 0.065,
        "oh_p50": 0.464,
        "oh_p75": 0.205,
        "oh_p90": 0.068,
        "ol_p50": 0.426,
        "ol_p75": 0.205,
        "ol_p90": 0.08
      },
      "n_folds": 6
    },
    "CHFJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4434,
          1.8697,
          2.3797
        ],
        "oc": [
          0.607,
          1.0918,
          1.6269
        ],
        "oh": [
          0.6153,
          1.1041,
          1.6211
        ],
        "ol": [
          0.6288,
          1.112,
          1.6771
        ]
      },
      "event": {
        "FOMC": 1.059,
        "NFP": 1.052,
        "CPI": 0.998,
        "high": 1.034,
        "none": 0.984
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.411,
        "hl_p75": 0.221,
        "hl_p90": 0.095,
        "oc_p50": 0.498,
        "oc_p75": 0.251,
        "oc_p90": 0.099,
        "oh_p50": 0.475,
        "oh_p75": 0.228,
        "oh_p90": 0.099,
        "ol_p50": 0.426,
        "ol_p75": 0.228,
        "ol_p90": 0.099
      },
      "n_folds": 6
    },
    "DE30": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3312,
          1.7728,
          2.3523
        ],
        "oc": [
          0.5888,
          1.0346,
          1.5769
        ],
        "oh": [
          0.5893,
          1.0005,
          1.4466
        ],
        "ol": [
          0.5685,
          1.0813,
          1.7386
        ]
      },
      "event": {
        "FOMC": 1.117,
        "NFP": 0.973,
        "CPI": 1.03,
        "high": 1.023,
        "none": 0.986
      },
      "horizons": {},
      "trained_through": "2025-09-04",
      "oos_exceed": {
        "hl_p50": 0.478,
        "hl_p75": 0.233,
        "hl_p90": 0.083,
        "oc_p50": 0.478,
        "oc_p75": 0.257,
        "oc_p90": 0.111,
        "oh_p50": 0.451,
        "oh_p75": 0.261,
        "oh_p90": 0.126,
        "ol_p50": 0.498,
        "ol_p75": 0.233,
        "ol_p90": 0.095
      },
      "n_folds": 6
    },
    "EURAUD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3678,
          1.7821,
          2.2517
        ],
        "oc": [
          0.5887,
          1.0472,
          1.544
        ],
        "oh": [
          0.5906,
          1.0534,
          1.6005
        ],
        "ol": [
          0.5922,
          1.0347,
          1.5522
        ]
      },
      "event": {
        "FOMC": 1.08,
        "NFP": 1.047,
        "CPI": 1.056,
        "high": 1.049,
        "none": 0.965
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.452,
        "hl_p75": 0.232,
        "hl_p90": 0.103,
        "oc_p50": 0.452,
        "oc_p75": 0.221,
        "oc_p90": 0.087,
        "oh_p50": 0.51,
        "oh_p75": 0.232,
        "oh_p90": 0.095,
        "ol_p50": 0.51,
        "ol_p75": 0.217,
        "ol_p90": 0.103
      },
      "n_folds": 6
    },
    "EURCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3845,
          1.7953,
          2.2978
        ],
        "oc": [
          0.6004,
          1.0441,
          1.562
        ],
        "oh": [
          0.6053,
          1.055,
          1.6223
        ],
        "ol": [
          0.5875,
          1.0469,
          1.5381
        ]
      },
      "event": {
        "FOMC": 1.022,
        "NFP": 1.091,
        "CPI": 1.036,
        "high": 1.024,
        "none": 0.977
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.43,
        "hl_p75": 0.19,
        "hl_p90": 0.095,
        "oc_p50": 0.43,
        "oc_p75": 0.243,
        "oc_p90": 0.099,
        "oh_p50": 0.487,
        "oh_p75": 0.228,
        "oh_p90": 0.08,
        "ol_p50": 0.498,
        "ol_p75": 0.221,
        "ol_p90": 0.091
      },
      "n_folds": 6
    },
    "EURCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3673,
          1.8297,
          2.3314
        ],
        "oc": [
          0.572,
          1.0184,
          1.539
        ],
        "oh": [
          0.5817,
          1.0396,
          1.5949
        ],
        "ol": [
          0.6132,
          1.0352,
          1.6051
        ]
      },
      "event": {
        "FOMC": 1.076,
        "NFP": 0.966,
        "CPI": 1.03,
        "high": 1.043,
        "none": 0.979
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.437,
        "hl_p75": 0.163,
        "hl_p90": 0.068,
        "oc_p50": 0.483,
        "oc_p75": 0.217,
        "oc_p90": 0.072,
        "oh_p50": 0.437,
        "oh_p75": 0.19,
        "oh_p90": 0.065,
        "ol_p50": 0.502,
        "ol_p75": 0.232,
        "ol_p90": 0.08
      },
      "n_folds": 6
    },
    "EURGBP": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3683,
          1.7903,
          2.365
        ],
        "oc": [
          0.5684,
          1.0106,
          1.5555
        ],
        "oh": [
          0.58,
          1.0469,
          1.6348
        ],
        "ol": [
          0.6179,
          1.0486,
          1.5686
        ]
      },
      "event": {
        "FOMC": 1.007,
        "NFP": 1.023,
        "CPI": 1.005,
        "high": 1.02,
        "none": 0.991
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.418,
        "hl_p75": 0.202,
        "hl_p90": 0.087,
        "oc_p50": 0.426,
        "oc_p75": 0.217,
        "oc_p90": 0.099,
        "oh_p50": 0.487,
        "oh_p75": 0.194,
        "oh_p90": 0.084,
        "ol_p50": 0.441,
        "ol_p75": 0.209,
        "ol_p90": 0.091
      },
      "n_folds": 6
    },
    "EURJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4028,
          1.8444,
          2.3625
        ],
        "oc": [
          0.6086,
          1.0587,
          1.6257
        ],
        "oh": [
          0.6007,
          1.0531,
          1.6062
        ],
        "ol": [
          0.6216,
          1.1126,
          1.7056
        ]
      },
      "event": {
        "FOMC": 1.039,
        "NFP": 0.98,
        "CPI": 1.032,
        "high": 1.028,
        "none": 0.984
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.43,
        "hl_p75": 0.194,
        "hl_p90": 0.08,
        "oc_p50": 0.456,
        "oc_p75": 0.217,
        "oc_p90": 0.076,
        "oh_p50": 0.471,
        "oh_p75": 0.202,
        "oh_p90": 0.08,
        "ol_p50": 0.414,
        "ol_p75": 0.221,
        "ol_p90": 0.084
      },
      "n_folds": 6
    },
    "EURNZD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3454,
          1.7462,
          2.1868
        ],
        "oc": [
          0.5785,
          1.0166,
          1.4853
        ],
        "oh": [
          0.5698,
          1.0279,
          1.5726
        ],
        "ol": [
          0.5852,
          1.0415,
          1.5228
        ]
      },
      "event": {
        "FOMC": 1.048,
        "NFP": 1.031,
        "CPI": 1.048,
        "high": 1.019,
        "none": 0.982
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.475,
        "hl_p75": 0.232,
        "hl_p90": 0.091,
        "oc_p50": 0.475,
        "oc_p75": 0.243,
        "oc_p90": 0.087,
        "oh_p50": 0.498,
        "oh_p75": 0.262,
        "oh_p90": 0.099,
        "ol_p50": 0.471,
        "ol_p75": 0.186,
        "ol_p90": 0.08
      },
      "n_folds": 6
    },
    "EURUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4422,
          1.8796,
          2.3658
        ],
        "oc": [
          0.635,
          1.136,
          1.631
        ],
        "oh": [
          0.6021,
          1.1002,
          1.6375
        ],
        "ol": [
          0.6348,
          1.123,
          1.6252
        ]
      },
      "event": {
        "FOMC": 1.112,
        "NFP": 1.081,
        "CPI": 1.059,
        "high": 1.041,
        "none": 0.967
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.414,
        "hl_p75": 0.19,
        "hl_p90": 0.076,
        "oc_p50": 0.433,
        "oc_p75": 0.179,
        "oc_p90": 0.087,
        "oh_p50": 0.475,
        "oh_p75": 0.209,
        "oh_p90": 0.099,
        "ol_p50": 0.471,
        "ol_p75": 0.221,
        "ol_p90": 0.076
      },
      "n_folds": 6
    },
    "GBPAUD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.2955,
          1.6863,
          2.1695
        ],
        "oc": [
          0.5425,
          0.9679,
          1.4511
        ],
        "oh": [
          0.5448,
          0.9737,
          1.5238
        ],
        "ol": [
          0.565,
          0.9961,
          1.4447
        ]
      },
      "event": {
        "FOMC": 1.112,
        "NFP": 0.979,
        "CPI": 1.031,
        "high": 1.061,
        "none": 0.977
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.498,
        "hl_p75": 0.228,
        "hl_p90": 0.114,
        "oc_p50": 0.54,
        "oc_p75": 0.236,
        "oc_p90": 0.103,
        "oh_p50": 0.525,
        "oh_p75": 0.247,
        "oh_p90": 0.099,
        "ol_p50": 0.498,
        "ol_p75": 0.262,
        "ol_p90": 0.106
      },
      "n_folds": 6
    },
    "GBPCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.2871,
          1.6725,
          2.1818
        ],
        "oc": [
          0.5455,
          0.9734,
          1.4358
        ],
        "oh": [
          0.5477,
          0.9759,
          1.4911
        ],
        "ol": [
          0.565,
          0.9967,
          1.4947
        ]
      },
      "event": {
        "FOMC": 1.03,
        "NFP": 1.12,
        "CPI": 1.025,
        "high": 1.041,
        "none": 0.981
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.544,
        "hl_p75": 0.285,
        "hl_p90": 0.11,
        "oc_p50": 0.536,
        "oc_p75": 0.259,
        "oc_p90": 0.118,
        "oh_p50": 0.582,
        "oh_p75": 0.251,
        "oh_p90": 0.095,
        "ol_p50": 0.498,
        "ol_p75": 0.255,
        "ol_p90": 0.133
      },
      "n_folds": 6
    },
    "GBPCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.2904,
          1.6895,
          2.1894
        ],
        "oc": [
          0.5404,
          0.9634,
          1.4587
        ],
        "oh": [
          0.542,
          0.9765,
          1.4416
        ],
        "ol": [
          0.5557,
          0.9967,
          1.5385
        ]
      },
      "event": {
        "FOMC": 1.042,
        "NFP": 0.955,
        "CPI": 1.033,
        "high": 1.042,
        "none": 0.986
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.464,
        "hl_p75": 0.243,
        "hl_p90": 0.122,
        "oc_p50": 0.49,
        "oc_p75": 0.228,
        "oc_p90": 0.11,
        "oh_p50": 0.49,
        "oh_p75": 0.221,
        "oh_p90": 0.087,
        "ol_p50": 0.513,
        "ol_p75": 0.213,
        "ol_p90": 0.106
      },
      "n_folds": 6
    },
    "GBPJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3448,
          1.7896,
          2.316
        ],
        "oc": [
          0.565,
          1.0333,
          1.6305
        ],
        "oh": [
          0.5642,
          0.9859,
          1.5524
        ],
        "ol": [
          0.596,
          1.053,
          1.6661
        ]
      },
      "event": {
        "FOMC": 1.082,
        "NFP": 0.953,
        "CPI": 1.06,
        "high": 1.042,
        "none": 0.98
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.407,
        "hl_p75": 0.205,
        "hl_p90": 0.068,
        "oc_p50": 0.441,
        "oc_p75": 0.198,
        "oc_p90": 0.049,
        "oh_p50": 0.471,
        "oh_p75": 0.262,
        "oh_p90": 0.091,
        "ol_p50": 0.445,
        "ol_p75": 0.209,
        "ol_p90": 0.065
      },
      "n_folds": 6
    },
    "GBPNZD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.2896,
          1.6792,
          2.1105
        ],
        "oc": [
          0.5355,
          0.9388,
          1.4575
        ],
        "oh": [
          0.5511,
          0.9612,
          1.4607
        ],
        "ol": [
          0.5673,
          1.0134,
          1.4918
        ]
      },
      "event": {
        "FOMC": 1.102,
        "NFP": 0.966,
        "CPI": 1.052,
        "high": 1.039,
        "none": 0.979
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.49,
        "hl_p75": 0.24,
        "hl_p90": 0.103,
        "oc_p50": 0.525,
        "oc_p75": 0.247,
        "oc_p90": 0.099,
        "oh_p50": 0.517,
        "oh_p75": 0.281,
        "oh_p90": 0.129,
        "ol_p50": 0.483,
        "ol_p75": 0.243,
        "ol_p90": 0.095
      },
      "n_folds": 6
    },
    "GBPUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3873,
          1.8021,
          2.353
        ],
        "oc": [
          0.6031,
          1.0578,
          1.583
        ],
        "oh": [
          0.6011,
          1.0353,
          1.551
        ],
        "ol": [
          0.628,
          1.0636,
          1.6016
        ]
      },
      "event": {
        "FOMC": 1.017,
        "NFP": 1.056,
        "CPI": 1.099,
        "high": 1.026,
        "none": 0.979
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.452,
        "hl_p75": 0.232,
        "hl_p90": 0.091,
        "oc_p50": 0.475,
        "oc_p75": 0.247,
        "oc_p90": 0.118,
        "oh_p50": 0.498,
        "oh_p75": 0.247,
        "oh_p90": 0.114,
        "ol_p50": 0.445,
        "ol_p75": 0.224,
        "ol_p90": 0.095
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
        "FOMC": 1.127,
        "NFP": 1.039,
        "CPI": 1.079,
        "high": 1.031,
        "none": 0.977
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.531,
        "hl_p75": 0.302,
        "hl_p90": 0.109,
        "oc_p50": 0.527,
        "oc_p75": 0.279,
        "oc_p90": 0.116,
        "oh_p50": 0.554,
        "oh_p75": 0.26,
        "oh_p90": 0.116,
        "ol_p50": 0.477,
        "ol_p75": 0.252,
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
        "FOMC": 1.159,
        "NFP": 1.042,
        "CPI": 1.005,
        "high": 1.003,
        "none": 0.98
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.506,
        "hl_p75": 0.228,
        "hl_p90": 0.077,
        "oc_p50": 0.483,
        "oc_p75": 0.216,
        "oc_p90": 0.058,
        "oh_p50": 0.475,
        "oh_p75": 0.224,
        "oh_p90": 0.081,
        "ol_p50": 0.521,
        "ol_p75": 0.266,
        "ol_p90": 0.085
      },
      "n_folds": 6
    },
    "NZDJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3761,
          1.8049,
          2.3361
        ],
        "oc": [
          0.5872,
          1.0396,
          1.5823
        ],
        "oh": [
          0.5956,
          1.0467,
          1.5349
        ],
        "ol": [
          0.5926,
          1.0616,
          1.7056
        ]
      },
      "event": {
        "FOMC": 1.111,
        "NFP": 1.034,
        "CPI": 1.048,
        "high": 1.016,
        "none": 0.977
      },
      "horizons": {},
      "trained_through": "2025-05-20",
      "oos_exceed": {
        "hl_p50": 0.395,
        "hl_p75": 0.186,
        "hl_p90": 0.061,
        "oc_p50": 0.464,
        "oc_p75": 0.209,
        "oc_p90": 0.08,
        "oh_p50": 0.468,
        "oh_p75": 0.198,
        "oh_p90": 0.061,
        "ol_p50": 0.498,
        "ol_p75": 0.224,
        "ol_p90": 0.072
      },
      "n_folds": 6
    },
    "NZDUSD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4098,
          1.8083,
          2.3025
        ],
        "oc": [
          0.6134,
          1.0394,
          1.5534
        ],
        "oh": [
          0.6317,
          1.0938,
          1.5743
        ],
        "ol": [
          0.5822,
          1.057,
          1.6221
        ]
      },
      "event": {
        "FOMC": 1.146,
        "NFP": 1.076,
        "CPI": 1.091,
        "high": 1.031,
        "none": 0.966
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.464,
        "hl_p75": 0.236,
        "hl_p90": 0.099,
        "oc_p50": 0.502,
        "oc_p75": 0.262,
        "oc_p90": 0.11,
        "oh_p50": 0.456,
        "oh_p75": 0.217,
        "oh_p90": 0.106,
        "ol_p50": 0.471,
        "ol_p75": 0.247,
        "ol_p90": 0.095
      },
      "n_folds": 6
    },
    "SPX500": {
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
        "FOMC": 1.139,
        "NFP": 1.076,
        "CPI": 1.009,
        "high": 1.024,
        "none": 0.975
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.514,
        "hl_p75": 0.236,
        "hl_p90": 0.081,
        "oc_p50": 0.525,
        "oc_p75": 0.201,
        "oc_p90": 0.081,
        "oh_p50": 0.521,
        "oh_p75": 0.212,
        "oh_p90": 0.066,
        "ol_p50": 0.494,
        "ol_p75": 0.263,
        "ol_p90": 0.085
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
        "FOMC": 1.026,
        "NFP": 1.042,
        "CPI": 0.976,
        "high": 1.022,
        "none": 0.994
      },
      "horizons": {},
      "trained_through": "2025-08-18",
      "oos_exceed": {
        "hl_p50": 0.47,
        "hl_p75": 0.292,
        "hl_p90": 0.115,
        "oc_p50": 0.51,
        "oc_p75": 0.273,
        "oc_p90": 0.107,
        "oh_p50": 0.47,
        "oh_p75": 0.265,
        "oh_p90": 0.158,
        "ol_p50": 0.498,
        "ol_p75": 0.217,
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
        "FOMC": 1.08,
        "NFP": 1.023,
        "CPI": 1.053,
        "high": 1.004,
        "none": 0.99
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.452,
        "hl_p75": 0.232,
        "hl_p90": 0.081,
        "oc_p50": 0.448,
        "oc_p75": 0.228,
        "oc_p90": 0.1,
        "oh_p50": 0.537,
        "oh_p75": 0.243,
        "oh_p90": 0.12,
        "ol_p50": 0.459,
        "ol_p75": 0.224,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "US30": {
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
        "FOMC": 1.136,
        "NFP": 1.056,
        "CPI": 1.023,
        "high": 0.998,
        "none": 0.978
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.498,
        "hl_p75": 0.228,
        "hl_p90": 0.104,
        "oc_p50": 0.486,
        "oc_p75": 0.243,
        "oc_p90": 0.112,
        "oh_p50": 0.51,
        "oh_p75": 0.274,
        "oh_p90": 0.127,
        "ol_p50": 0.51,
        "ol_p75": 0.263,
        "ol_p90": 0.066
      },
      "n_folds": 6
    },
    "USDCAD": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3909,
          1.7945,
          2.3501
        ],
        "oc": [
          0.5902,
          1.0679,
          1.6341
        ],
        "oh": [
          0.6356,
          1.0716,
          1.6423
        ],
        "ol": [
          0.579,
          1.0193,
          1.5931
        ]
      },
      "event": {
        "FOMC": 1.124,
        "NFP": 1.087,
        "CPI": 1.075,
        "high": 1.066,
        "none": 0.965
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.449,
        "hl_p75": 0.194,
        "hl_p90": 0.091,
        "oc_p50": 0.502,
        "oc_p75": 0.209,
        "oc_p90": 0.068,
        "oh_p50": 0.49,
        "oh_p75": 0.255,
        "oh_p90": 0.046,
        "ol_p50": 0.479,
        "ol_p75": 0.247,
        "ol_p90": 0.099
      },
      "n_folds": 6
    },
    "USDCHF": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4342,
          1.8752,
          2.3908
        ],
        "oc": [
          0.6106,
          1.1088,
          1.648
        ],
        "oh": [
          0.6518,
          1.0975,
          1.6106
        ],
        "ol": [
          0.6008,
          1.1088,
          1.6965
        ]
      },
      "event": {
        "FOMC": 1.109,
        "NFP": 1.054,
        "CPI": 1.045,
        "high": 1.039,
        "none": 0.962
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.464,
        "hl_p75": 0.228,
        "hl_p90": 0.087,
        "oc_p50": 0.502,
        "oc_p75": 0.251,
        "oc_p90": 0.11,
        "oh_p50": 0.452,
        "oh_p75": 0.259,
        "oh_p90": 0.084,
        "ol_p50": 0.517,
        "ol_p75": 0.224,
        "ol_p90": 0.103
      },
      "n_folds": 6
    },
    "USDJPY": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.4052,
          1.8876,
          2.4517
        ],
        "oc": [
          0.603,
          1.1262,
          1.6972
        ],
        "oh": [
          0.586,
          1.0654,
          1.606
        ],
        "ol": [
          0.6015,
          1.12,
          1.7439
        ]
      },
      "event": {
        "FOMC": 1.121,
        "NFP": 1.142,
        "CPI": 1.065,
        "high": 1.044,
        "none": 0.966
      },
      "horizons": {},
      "trained_through": "2025-08-19",
      "oos_exceed": {
        "hl_p50": 0.414,
        "hl_p75": 0.198,
        "hl_p90": 0.091,
        "oc_p50": 0.452,
        "oc_p75": 0.217,
        "oc_p90": 0.087,
        "oh_p50": 0.475,
        "oh_p75": 0.19,
        "oh_p90": 0.084,
        "ol_p50": 0.452,
        "ol_p75": 0.236,
        "ol_p90": 0.103
      },
      "n_folds": 6
    }
  },
  "classDefaults": {
    "fx": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3873,
          1.8049,
          2.3314
        ],
        "oc": [
          0.5902,
          1.0441,
          1.5823
        ],
        "oh": [
          0.5967,
          1.0542,
          1.5864
        ],
        "ol": [
          0.596,
          1.057,
          1.6221
        ]
      },
      "event": {
        "FOMC": 1.08,
        "NFP": 1.052,
        "CPI": 1.045,
        "high": 1.039,
        "none": 0.979
      },
      "horizons": {},
      "n_members": 25
    },
    "index": {
      "estimator": "har_rv_log",
      "width": {
        "hl": [
          1.3564,
          1.7828,
          2.3529
        ],
        "oc": [
          0.5958,
          1.0495,
          1.5772
        ],
        "oh": [
          0.6103,
          1.0368,
          1.4708
        ],
        "ol": [
          0.5628,
          1.0635,
          1.7198
        ]
      },
      "event": {
        "FOMC": 1.127,
        "NFP": 1.042,
        "CPI": 1.016,
        "high": 1.013,
        "none": 0.983
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
        "FOMC": 1.127,
        "NFP": 1.039,
        "CPI": 1.079,
        "high": 1.031,
        "none": 0.977
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
      "CADJPY",
      "CHFJPY",
      "DE30",
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
      "NZDJPY",
      "NZDUSD",
      "SPX500",
      "UK100",
      "US2000",
      "US30",
      "USDCAD",
      "USDCHF",
      "USDJPY"
    ],
    "skipped": [],
    "mean_last_fold_oos_exceed_p50": 0.4762
  }
};
