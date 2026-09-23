/**
 * Forecast ladder parameters — GENERATED, do not hand-edit.
 *
 *   python -m forge.export_ladder_params --report forge/out_vol_iv/vol_report.json
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
  "generated": "2026-09-23",
  "source": "forge/vol.py walk-forward -> forge/out_vol_iv/vol_report.json",
  "pairs": {
    "AUDUSD": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.3611,
          1.7706,
          2.2101
        ],
        "oc": [
          0.5881,
          1.0259,
          1.5402
        ],
        "oh": [
          0.5957,
          1.0078,
          1.4854
        ],
        "ol": [
          0.5868,
          1.0563,
          1.6058
        ]
      },
      "event": {
        "FOMC": 1.203,
        "NFP": 1.073,
        "CPI": 1.123,
        "high": 1.045,
        "holiday": 0.9,
        "none": 0.93
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.3925,
              1.7537,
              2.1575
            ],
            "oc": [
              0.634,
              1.0637,
              1.5123
            ],
            "oh": [
              0.5892,
              1.0924,
              1.5246
            ],
            "ol": [
              0.6777,
              1.0804,
              1.6073
            ]
          },
          "n_train": 282,
          "n_effective": 282,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.484,
            "hl_p75": 0.323,
            "hl_p90": 0.065,
            "oc_p50": 0.387,
            "oc_p75": 0.226,
            "oc_p90": 0.097,
            "oh_p50": 0.516,
            "oh_p75": 0.161,
            "oh_p90": 0.129,
            "ol_p50": 0.516,
            "ol_p75": 0.258,
            "ol_p90": 0.097
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.393,
              1.7604,
              2.0625
            ],
            "oc": [
              0.5817,
              0.9913,
              1.4052
            ],
            "oh": [
              0.6186,
              1.0253,
              1.4333
            ],
            "ol": [
              0.6607,
              1.0788,
              1.5897
            ]
          },
          "n_train": 1406,
          "n_effective": 70,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.364,
            "hl_p75": 0.1,
            "hl_p90": 0.043,
            "oc_p50": 0.543,
            "oc_p75": 0.221,
            "oc_p90": 0.114,
            "oh_p50": 0.514,
            "oh_p75": 0.164,
            "oh_p90": 0.093,
            "ol_p50": 0.464,
            "ol_p75": 0.171,
            "ol_p90": 0.064
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.5,
        "hl_p75": 0.272,
        "hl_p90": 0.12,
        "oc_p50": 0.525,
        "oc_p75": 0.285,
        "oc_p90": 0.114,
        "oh_p50": 0.494,
        "oh_p75": 0.304,
        "oh_p90": 0.12,
        "ol_p50": 0.456,
        "ol_p75": 0.259,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "EURUSD": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.3646,
          1.7588,
          2.2188
        ],
        "oc": [
          0.5964,
          1.0554,
          1.5431
        ],
        "oh": [
          0.5503,
          1.0183,
          1.5531
        ],
        "ol": [
          0.6006,
          1.0524,
          1.5467
        ]
      },
      "event": {
        "FOMC": 1.217,
        "NFP": 1.098,
        "CPI": 1.062,
        "high": 1.018,
        "holiday": 0.937,
        "none": 0.948
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.3562,
              1.7779,
              2.252
            ],
            "oc": [
              0.6626,
              0.9919,
              1.5387
            ],
            "oh": [
              0.6201,
              1.049,
              1.4834
            ],
            "ol": [
              0.6165,
              1.0838,
              1.5411
            ]
          },
          "n_train": 282,
          "n_effective": 282,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.516,
            "hl_p75": 0.29,
            "hl_p90": 0.097,
            "oc_p50": 0.484,
            "oc_p75": 0.29,
            "oc_p90": 0.194,
            "oh_p50": 0.419,
            "oh_p75": 0.226,
            "oh_p90": 0.161,
            "ol_p50": 0.355,
            "ol_p75": 0.258,
            "ol_p90": 0.194
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.4426,
              1.7787,
              2.1888
            ],
            "oc": [
              0.6748,
              1.0763,
              1.5072
            ],
            "oh": [
              0.6252,
              1.0363,
              1.5939
            ],
            "ol": [
              0.6827,
              1.1349,
              1.5852
            ]
          },
          "n_train": 1406,
          "n_effective": 70,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.421,
            "hl_p75": 0.229,
            "hl_p90": 0.036,
            "oc_p50": 0.493,
            "oc_p75": 0.221,
            "oc_p90": 0.086,
            "oh_p50": 0.357,
            "oh_p75": 0.186,
            "oh_p90": 0.064,
            "ol_p50": 0.471,
            "ol_p75": 0.271,
            "ol_p90": 0.179
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.43,
        "hl_p75": 0.241,
        "hl_p90": 0.101,
        "oc_p50": 0.449,
        "oc_p75": 0.228,
        "oc_p90": 0.108,
        "oh_p50": 0.513,
        "oh_p75": 0.234,
        "oh_p90": 0.114,
        "ol_p50": 0.443,
        "ol_p75": 0.234,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "GBPUSD": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.355,
          1.7357,
          2.215
        ],
        "oc": [
          0.5896,
          1.0455,
          1.4884
        ],
        "oh": [
          0.5663,
          1.0123,
          1.4926
        ],
        "ol": [
          0.5965,
          1.0392,
          1.553
        ]
      },
      "event": {
        "FOMC": 1.105,
        "NFP": 1.108,
        "CPI": 1.075,
        "high": 1.009,
        "holiday": 0.893,
        "none": 0.955
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.3622,
              1.7557,
              2.1532
            ],
            "oc": [
              0.5753,
              1.0188,
              1.4375
            ],
            "oh": [
              0.6234,
              1.0455,
              1.4683
            ],
            "ol": [
              0.5976,
              1.0341,
              1.5324
            ]
          },
          "n_train": 282,
          "n_effective": 282,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.548,
            "hl_p75": 0.226,
            "hl_p90": 0.129,
            "oc_p50": 0.548,
            "oc_p75": 0.29,
            "oc_p90": 0.129,
            "oh_p50": 0.516,
            "oh_p75": 0.29,
            "oh_p90": 0.161,
            "ol_p50": 0.387,
            "ol_p75": 0.194,
            "ol_p90": 0.097
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.423,
              1.7178,
              2.1249
            ],
            "oc": [
              0.643,
              1.0227,
              1.3988
            ],
            "oh": [
              0.6463,
              1.0552,
              1.4507
            ],
            "ol": [
              0.6257,
              1.1171,
              1.575
            ]
          },
          "n_train": 1406,
          "n_effective": 70,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.271,
            "hl_p75": 0.064,
            "hl_p90": 0.029,
            "oc_p50": 0.4,
            "oc_p75": 0.157,
            "oc_p90": 0.007,
            "oh_p50": 0.386,
            "oh_p75": 0.193,
            "oh_p90": 0.079,
            "ol_p50": 0.564,
            "ol_p75": 0.25,
            "ol_p90": 0.007
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.494,
        "hl_p75": 0.253,
        "hl_p90": 0.108,
        "oc_p50": 0.487,
        "oc_p75": 0.241,
        "oc_p90": 0.12,
        "oh_p50": 0.563,
        "oh_p75": 0.266,
        "oh_p90": 0.133,
        "ol_p50": 0.456,
        "ol_p75": 0.222,
        "ol_p90": 0.089
      },
      "n_folds": 6
    },
    "NQ": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.2476,
          1.6398,
          2.0976
        ],
        "oc": [
          0.5508,
          0.9928,
          1.5065
        ],
        "oh": [
          0.5304,
          0.9182,
          1.3659
        ],
        "ol": [
          0.5166,
          0.9919,
          1.5403
        ]
      },
      "event": {
        "FOMC": 1.193,
        "NFP": 1.032,
        "CPI": 1.083,
        "high": 1.051,
        "holiday": 0.917,
        "none": 0.949
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.34,
              1.7199,
              2.1112
            ],
            "oc": [
              0.6226,
              1.026,
              1.4439
            ],
            "oh": [
              0.649,
              0.9926,
              1.3957
            ],
            "ol": [
              0.5353,
              0.9515,
              1.5617
            ]
          },
          "n_train": 277,
          "n_effective": 277,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.6,
            "hl_p75": 0.333,
            "hl_p90": 0.133,
            "oc_p50": 0.5,
            "oc_p75": 0.233,
            "oc_p90": 0.133,
            "oh_p50": 0.533,
            "oh_p75": 0.2,
            "oh_p90": 0.133,
            "ol_p50": 0.633,
            "ol_p75": 0.367,
            "ol_p90": 0.1
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.3803,
              1.6886,
              2.0881
            ],
            "oc": [
              0.6742,
              1.0413,
              1.4224
            ],
            "oh": [
              0.7212,
              1.0718,
              1.4352
            ],
            "ol": [
              0.4996,
              0.9918,
              1.5205
            ]
          },
          "n_train": 1383,
          "n_effective": 69,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.657,
            "hl_p75": 0.256,
            "hl_p90": 0.168,
            "oc_p50": 0.409,
            "oc_p75": 0.299,
            "oc_p90": 0.234,
            "oh_p50": 0.394,
            "oh_p75": 0.277,
            "oh_p90": 0.241,
            "ol_p50": 0.693,
            "ol_p75": 0.292,
            "ol_p90": 0.007
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.555,
        "hl_p75": 0.258,
        "hl_p90": 0.129,
        "oc_p50": 0.568,
        "oc_p75": 0.316,
        "oc_p90": 0.084,
        "oh_p50": 0.503,
        "oh_p75": 0.303,
        "oh_p90": 0.09,
        "ol_p50": 0.516,
        "ol_p75": 0.29,
        "ol_p90": 0.097
      },
      "n_folds": 6
    },
    "USDCAD": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.3622,
          1.7323,
          2.2498
        ],
        "oc": [
          0.5835,
          1.0587,
          1.5522
        ],
        "oh": [
          0.6184,
          1.044,
          1.6053
        ],
        "ol": [
          0.5775,
          0.9857,
          1.4802
        ]
      },
      "event": {
        "FOMC": 1.129,
        "NFP": 1.041,
        "CPI": 1.087,
        "high": 1.042,
        "holiday": 0.923,
        "none": 0.948
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.4307,
              1.7891,
              2.1578
            ],
            "oc": [
              0.6149,
              1.0358,
              1.4777
            ],
            "oh": [
              0.659,
              1.1026,
              1.6309
            ],
            "ol": [
              0.5886,
              1.0305,
              1.524
            ]
          },
          "n_train": 282,
          "n_effective": 282,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.581,
            "hl_p75": 0.419,
            "hl_p90": 0.129,
            "oc_p50": 0.677,
            "oc_p75": 0.355,
            "oc_p90": 0.194,
            "oh_p50": 0.516,
            "oh_p75": 0.226,
            "oh_p90": 0.097,
            "ol_p50": 0.452,
            "ol_p75": 0.323,
            "ol_p90": 0.129
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.4265,
              1.7629,
              2.1167
            ],
            "oc": [
              0.5906,
              1.0077,
              1.5322
            ],
            "oh": [
              0.7164,
              1.1541,
              1.6416
            ],
            "ol": [
              0.5606,
              0.9595,
              1.4459
            ]
          },
          "n_train": 1406,
          "n_effective": 70,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.557,
            "hl_p75": 0.343,
            "hl_p90": 0.129,
            "oc_p50": 0.636,
            "oc_p75": 0.443,
            "oc_p90": 0.2,
            "oh_p50": 0.471,
            "oh_p75": 0.336,
            "oh_p90": 0.236,
            "ol_p50": 0.557,
            "ol_p75": 0.321,
            "ol_p90": 0.136
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.43,
        "hl_p75": 0.209,
        "hl_p90": 0.101,
        "oc_p50": 0.494,
        "oc_p75": 0.184,
        "oc_p90": 0.089,
        "oh_p50": 0.494,
        "oh_p75": 0.241,
        "oh_p90": 0.044,
        "ol_p50": 0.481,
        "ol_p75": 0.259,
        "ol_p90": 0.127
      },
      "n_folds": 6
    },
    "USDCHF": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.392,
          1.7598,
          2.2901
        ],
        "oc": [
          0.5925,
          1.075,
          1.5508
        ],
        "oh": [
          0.6147,
          1.0722,
          1.4989
        ],
        "ol": [
          0.5899,
          1.0649,
          1.5814
        ]
      },
      "event": {
        "FOMC": 1.124,
        "NFP": 1.11,
        "CPI": 1.028,
        "high": 1.018,
        "holiday": 0.955,
        "none": 0.944
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.4342,
              1.8267,
              2.2594
            ],
            "oc": [
              0.6207,
              1.0544,
              1.5016
            ],
            "oh": [
              0.6249,
              1.0955,
              1.4947
            ],
            "ol": [
              0.6219,
              1.1209,
              1.7035
            ]
          },
          "n_train": 282,
          "n_effective": 282,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.548,
            "hl_p75": 0.258,
            "hl_p90": 0.161,
            "oc_p50": 0.516,
            "oc_p75": 0.355,
            "oc_p90": 0.129,
            "oh_p50": 0.516,
            "oh_p75": 0.258,
            "oh_p90": 0.161,
            "ol_p50": 0.355,
            "ol_p75": 0.226,
            "ol_p90": 0.097
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.4534,
              1.8206,
              2.3371
            ],
            "oc": [
              0.6544,
              1.111,
              1.6453
            ],
            "oh": [
              0.6298,
              1.0828,
              1.5042
            ],
            "ol": [
              0.6778,
              1.1623,
              1.8338
            ]
          },
          "n_train": 1406,
          "n_effective": 70,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.336,
            "hl_p75": 0.107,
            "hl_p90": 0.05,
            "oc_p50": 0.436,
            "oc_p75": 0.193,
            "oc_p90": 0.064,
            "oh_p50": 0.657,
            "oh_p75": 0.3,
            "oh_p90": 0.086,
            "ol_p50": 0.236,
            "ol_p75": 0.071,
            "ol_p90": 0.036
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.443,
        "hl_p75": 0.266,
        "hl_p90": 0.127,
        "oc_p50": 0.506,
        "oc_p75": 0.247,
        "oc_p90": 0.127,
        "oh_p50": 0.462,
        "oh_p75": 0.247,
        "oh_p90": 0.114,
        "ol_p50": 0.519,
        "ol_p75": 0.222,
        "ol_p90": 0.133
      },
      "n_folds": 6
    },
    "USDJPY": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.2415,
          1.6522,
          2.1508
        ],
        "oc": [
          0.5361,
          0.9787,
          1.5049
        ],
        "oh": [
          0.5269,
          0.9272,
          1.463
        ],
        "ol": [
          0.5195,
          0.9802,
          1.4965
        ]
      },
      "event": {
        "FOMC": 1.191,
        "NFP": 1.121,
        "CPI": 1.129,
        "high": 0.988,
        "holiday": 0.875,
        "none": 0.969
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.3401,
              1.7292,
              2.1619
            ],
            "oc": [
              0.5749,
              1.0364,
              1.4225
            ],
            "oh": [
              0.6601,
              1.1072,
              1.4924
            ],
            "ol": [
              0.5098,
              0.9856,
              1.5629
            ]
          },
          "n_train": 282,
          "n_effective": 282,
          "overlapping": false,
          "oos_exceed": {
            "hl_p50": 0.29,
            "hl_p75": 0.161,
            "hl_p90": 0.129,
            "oc_p50": 0.419,
            "oc_p75": 0.194,
            "oc_p90": 0.161,
            "oh_p50": 0.419,
            "oh_p75": 0.097,
            "oh_p90": 0.032,
            "ol_p50": 0.387,
            "ol_p75": 0.194,
            "ol_p90": 0.129
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.3934,
              1.7837,
              2.2561
            ],
            "oc": [
              0.6534,
              1.1247,
              1.6452
            ],
            "oh": [
              0.7317,
              1.1982,
              1.6205
            ],
            "ol": [
              0.4815,
              0.8971,
              1.4627
            ]
          },
          "n_train": 1406,
          "n_effective": 70,
          "overlapping": true,
          "oos_exceed": {
            "hl_p50": 0.357,
            "hl_p75": 0.157,
            "hl_p90": 0.107,
            "oc_p50": 0.429,
            "oc_p75": 0.136,
            "oc_p90": 0.007,
            "oh_p50": 0.336,
            "oh_p75": 0.057,
            "oh_p90": 0.0,
            "ol_p50": 0.436,
            "ol_p75": 0.329,
            "ol_p90": 0.157
          }
        }
      },
      "trained_through": "2026-01-15",
      "oos_exceed": {
        "hl_p50": 0.31,
        "hl_p75": 0.165,
        "hl_p90": 0.095,
        "oc_p50": 0.373,
        "oc_p75": 0.165,
        "oc_p90": 0.082,
        "oh_p50": 0.386,
        "oh_p75": 0.139,
        "oh_p90": 0.032,
        "ol_p50": 0.38,
        "ol_p75": 0.171,
        "ol_p90": 0.108
      },
      "n_folds": 6
    }
  },
  "classDefaults": {
    "fx": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.3617,
          1.7472,
          2.2169
        ],
        "oc": [
          0.5888,
          1.0505,
          1.5416
        ],
        "oh": [
          0.581,
          1.0153,
          1.4957
        ],
        "ol": [
          0.5883,
          1.0458,
          1.5498
        ]
      },
      "event": {
        "FOMC": 1.16,
        "NFP": 1.103,
        "CPI": 1.081,
        "high": 1.018,
        "holiday": 0.911,
        "none": 0.948
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.3774,
              1.7668,
              2.1599
            ],
            "oc": [
              0.6178,
              1.0361,
              1.4897
            ],
            "oh": [
              0.6241,
              1.0939,
              1.4935
            ],
            "ol": [
              0.6071,
              1.0573,
              1.552
            ]
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.4247,
              1.7708,
              2.1568
            ],
            "oc": [
              0.6482,
              1.0495,
              1.5197
            ],
            "oh": [
              0.6381,
              1.069,
              1.5491
            ],
            "ol": [
              0.6432,
              1.0979,
              1.5801
            ]
          }
        }
      },
      "n_members": 6
    },
    "index": {
      "estimator": "iv30",
      "width": {
        "hl": [
          1.2476,
          1.6398,
          2.0976
        ],
        "oc": [
          0.5508,
          0.9928,
          1.5065
        ],
        "oh": [
          0.5304,
          0.9182,
          1.3659
        ],
        "ol": [
          0.5166,
          0.9919,
          1.5403
        ]
      },
      "event": {
        "FOMC": 1.193,
        "NFP": 1.032,
        "CPI": 1.083,
        "high": 1.051,
        "holiday": 0.917,
        "none": 0.949
      },
      "horizons": {
        "weekly": {
          "width": {
            "hl": [
              1.34,
              1.7199,
              2.1112
            ],
            "oc": [
              0.6226,
              1.026,
              1.4439
            ],
            "oh": [
              0.649,
              0.9926,
              1.3957
            ],
            "ol": [
              0.5353,
              0.9515,
              1.5617
            ]
          }
        },
        "monthly": {
          "width": {
            "hl": [
              1.3803,
              1.6886,
              2.0881
            ],
            "oc": [
              0.6742,
              1.0413,
              1.4224
            ],
            "oh": [
              0.7212,
              1.0718,
              1.4352
            ],
            "ol": [
              0.4996,
              0.9918,
              1.5205
            ]
          }
        }
      },
      "n_members": 1
    }
  },
  "coverage": {
    "fitted": [
      "AUDUSD",
      "EURUSD",
      "GBPUSD",
      "NQ",
      "USDCAD",
      "USDCHF",
      "USDJPY"
    ],
    "skipped": [],
    "mean_last_fold_oos_exceed_p50": 0.4725
  }
};
