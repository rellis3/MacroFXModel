/**
 * IV-adjusted daily ladder params. GENERATED — do not hand-edit.
 * Regenerate: python -m forge.export_iv_adjusted_params
 * Calibrated on LIVE-type inputs (OANDA D1 sigma; VIX/VXN, CME ATM 30d, GVZ, leg-built cross IV).
 */
export const IVADJ_PARAMS = {
 "generated": "2026-10-06",
 "source": "forge/export_iv_adjusted_params.py",
 "evidence": [
  "forge/COMBINED_RANGE_PREREG.md",
  "forge/CROSS_IV_PREREG.md",
  "analysis/output/iv_adjusted/CALIBRATION_NY.md"
 ],
 "formula": "sigma_adj = sigma_t * exp(k * (log(IV_ann / sigma_t_ann) - mu)); rung = width * sigma_adj",
 "corr_window": 60,
 "legs": {
  "EUR": [
   "EURUSD",
   1
  ],
  "GBP": [
   "GBPUSD",
   1
  ],
  "AUD": [
   "AUDUSD",
   1
  ],
  "JPY": [
   "USDJPY",
   -1
  ],
  "CAD": [
   "USDCAD",
   -1
  ],
  "CHF": [
   "USDCHF",
   -1
  ]
 },
 "rungs": [
  "p50",
  "p75",
  "p90"
 ],
 "pairs": {
  "DE30": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6758,
   "mu": 0.17609,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.3497,
     1.781,
     2.3824
    ],
    "oc": [
     0.5892,
     1.0344,
     1.6344
    ],
    "oh": [
     0.5787,
     1.0221,
     1.4846
    ],
    "ol": [
     0.5802,
     1.0775,
     1.7539
    ]
   },
   "n": 2540
  },
  "DOW": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6758,
   "mu": 0.34094,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.3799,
     1.8138,
     2.4067
    ],
    "oc": [
     0.5948,
     1.0635,
     1.6178
    ],
    "oh": [
     0.6202,
     1.0657,
     1.5381
    ],
    "ol": [
     0.5739,
     1.0719,
     1.7181
    ]
   },
   "n": 2584,
   "extras": {
    "coef": {
     "x": 0.7919,
     "vix_inv": 0.11302,
     "front_dear": 0.10628,
     "front_calm": -0.14163,
     "all_down": 0.0191,
     "nq_dw": 0.10264
    },
    "mean": {
     "x": 0.34094,
     "vix_inv": 0.07469,
     "front_dear": 0.33088,
     "front_calm": 0.34133,
     "all_down": 0.19582,
     "nq_dw": 0.25735
    },
    "width": {
     "hl": [
      1.3742,
      1.8132,
      2.3212
     ],
     "oc": [
      0.5936,
      1.0569,
      1.6004
     ],
     "oh": [
      0.6214,
      1.036,
      1.5261
     ],
     "ol": [
      0.5781,
      1.078,
      1.6701
     ]
    },
    "evidence": "forge/US_EXTRAS_CONFIRM_PREREG.md",
    "n": 2584
   }
  },
  "NQ": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6758,
   "mu": 0.23145,
   "iv_source": "VXN",
   "width": {
    "hl": [
     1.4019,
     1.8674,
     2.4109
    ],
    "oc": [
     0.6256,
     1.1426,
     1.6993
    ],
    "oh": [
     0.6299,
     1.0684,
     1.5411
    ],
    "ol": [
     0.572,
     1.0935,
     1.7714
    ]
   },
   "n": 2584,
   "extras": {
    "coef": {
     "x": 0.7919,
     "vix_inv": 0.11302,
     "front_dear": 0.10628,
     "front_calm": -0.14163,
     "all_down": 0.0191,
     "nq_dw": 0.10264
    },
    "mean": {
     "x": 0.23145,
     "vix_inv": 0.07469,
     "front_dear": 0.33088,
     "front_calm": 0.34133,
     "all_down": 0.19582,
     "nq_dw": 0.25735
    },
    "width": {
     "hl": [
      1.4007,
      1.8409,
      2.3097
     ],
     "oc": [
      0.6274,
      1.1207,
      1.6682
     ],
     "oh": [
      0.6279,
      1.0512,
      1.5148
     ],
     "ol": [
      0.5758,
      1.0877,
      1.7286
     ]
    },
    "evidence": "forge/US_EXTRAS_CONFIRM_PREREG.md",
    "n": 2584
   }
  },
  "SPX": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6758,
   "mu": 0.31554,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.3661,
     1.8401,
     2.4194
    ],
    "oc": [
     0.6038,
     1.102,
     1.6091
    ],
    "oh": [
     0.6152,
     1.0467,
     1.5363
    ],
    "ol": [
     0.5584,
     1.0694,
     1.7364
    ]
   },
   "n": 2584,
   "extras": {
    "coef": {
     "x": 0.7919,
     "vix_inv": 0.11302,
     "front_dear": 0.10628,
     "front_calm": -0.14163,
     "all_down": 0.0191,
     "nq_dw": 0.10264
    },
    "mean": {
     "x": 0.31554,
     "vix_inv": 0.07469,
     "front_dear": 0.33088,
     "front_calm": 0.34133,
     "all_down": 0.19582,
     "nq_dw": 0.25735
    },
    "width": {
     "hl": [
      1.3655,
      1.7919,
      2.3195
     ],
     "oc": [
      0.6031,
      1.0684,
      1.5713
     ],
     "oh": [
      0.6205,
      1.0348,
      1.4826
     ],
     "ol": [
      0.5765,
      1.059,
      1.7043
     ]
    },
    "evidence": "forge/US_EXTRAS_CONFIRM_PREREG.md",
    "n": 2584
   }
  },
  "UK100": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6758,
   "mu": 0.35043,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.3797,
     1.7807,
     2.2731
    ],
    "oc": [
     0.5837,
     1.0413,
     1.555
    ],
    "oh": [
     0.6174,
     1.0368,
     1.4823
    ],
    "ol": [
     0.5921,
     1.0836,
     1.6825
    ]
   },
   "n": 2526
  },
  "US2000": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6758,
   "mu": -0.09239,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.4146,
     1.8235,
     2.335
    ],
    "oc": [
     0.6242,
     1.0928,
     1.5859
    ],
    "oh": [
     0.6254,
     1.0656,
     1.5336
    ],
    "ol": [
     0.6073,
     1.1222,
     1.6791
    ]
   },
   "n": 2584,
   "extras": {
    "coef": {
     "x": 0.7919,
     "vix_inv": 0.11302,
     "front_dear": 0.10628,
     "front_calm": -0.14163,
     "all_down": 0.0191,
     "nq_dw": 0.10264
    },
    "mean": {
     "x": -0.09239,
     "vix_inv": 0.07469,
     "front_dear": 0.33088,
     "front_calm": 0.34133,
     "all_down": 0.19582,
     "nq_dw": 0.25735
    },
    "width": {
     "hl": [
      1.4197,
      1.8257,
      2.3263
     ],
     "oc": [
      0.6303,
      1.0756,
      1.562
     ],
     "oh": [
      0.6134,
      1.0479,
      1.5442
     ],
     "ol": [
      0.6156,
      1.111,
      1.6871
     ]
    },
    "evidence": "forge/US_EXTRAS_CONFIRM_PREREG.md",
    "n": 2584
   }
  },
  "AUDUSD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7602,
   "mu": 0.03421,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.4037,
     1.8289,
     2.3045
    ],
    "oc": [
     0.6144,
     1.0697,
     1.6009
    ],
    "oh": [
     0.624,
     1.0553,
     1.5613
    ],
    "ol": [
     0.595,
     1.0914,
     1.6553
    ]
   },
   "n": 1565
  },
  "EURUSD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7602,
   "mu": 0.04464,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.4135,
     1.8457,
     2.3229
    ],
    "oc": [
     0.6212,
     1.0924,
     1.6134
    ],
    "oh": [
     0.5756,
     1.0659,
     1.6264
    ],
    "ol": [
     0.625,
     1.1019,
     1.5862
    ]
   },
   "n": 1565
  },
  "GBPUSD": {
   "class": "fx_major",
   "estimator": "ewma_094",
   "k": 0.7602,
   "mu": 0.05703,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.4322,
     1.8405,
     2.3459
    ],
    "oc": [
     0.621,
     1.108,
     1.6097
    ],
    "oh": [
     0.6074,
     1.0793,
     1.616
    ],
    "ol": [
     0.6293,
     1.0981,
     1.6446
    ]
   },
   "n": 1565
  },
  "GOLD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7602,
   "mu": 0.17078,
   "iv_source": "GVZ",
   "width": {
    "hl": [
     1.3789,
     1.8398,
     2.3673
    ],
    "oc": [
     0.5817,
     1.0744,
     1.6379
    ],
    "oh": [
     0.6186,
     1.0777,
     1.648
    ],
    "ol": [
     0.5733,
     1.0524,
     1.6449
    ]
   },
   "n": 2581
  },
  "USDCAD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7602,
   "mu": 0.05001,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.4142,
     1.8091,
     2.365
    ],
    "oc": [
     0.6072,
     1.0931,
     1.6232
    ],
    "oh": [
     0.6428,
     1.1049,
     1.6608
    ],
    "ol": [
     0.5981,
     1.036,
     1.5712
    ]
   },
   "n": 1565
  },
  "USDCHF": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7602,
   "mu": 0.01389,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.395,
     1.7883,
     2.317
    ],
    "oc": [
     0.5951,
     1.0972,
     1.5876
    ],
    "oh": [
     0.6123,
     1.0802,
     1.5222
    ],
    "ol": [
     0.6004,
     1.0727,
     1.6286
    ]
   },
   "n": 1565
  },
  "USDJPY": {
   "class": "fx_major",
   "estimator": "ewma_094",
   "k": 0.7602,
   "mu": 0.08155,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.315,
     1.7573,
     2.307
    ],
    "oc": [
     0.5627,
     1.0495,
     1.6071
    ],
    "oh": [
     0.5549,
     0.9722,
     1.5254
    ],
    "ol": [
     0.5398,
     1.0427,
     1.6346
    ]
   },
   "n": 1565
  },
  "AUDCAD": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6479,
   "mu": -0.01652,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.3959,
     1.7941,
     2.2479
    ],
    "oc": [
     0.5685,
     1.0103,
     1.5395
    ],
    "oh": [
     0.6203,
     1.0559,
     1.5761
    ],
    "ol": [
     0.5894,
     1.0612,
     1.5493
    ]
   },
   "n": 1565
  },
  "AUDCHF": {
   "class": "crosses",
   "estimator": "ewma_090",
   "k": 0.6479,
   "mu": 0.07213,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4743,
     1.9013,
     2.4478
    ],
    "oc": [
     0.6247,
     1.1196,
     1.6462
    ],
    "oh": [
     0.6318,
     1.0755,
     1.602
    ],
    "ol": [
     0.6452,
     1.1647,
     1.8096
    ]
   },
   "n": 1565
  },
  "AUDJPY": {
   "class": "crosses",
   "estimator": "ewma_090",
   "k": 0.6479,
   "mu": 0.07925,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4301,
     1.8495,
     2.4603
    ],
    "oc": [
     0.6173,
     1.0812,
     1.62
    ],
    "oh": [
     0.6069,
     1.0538,
     1.5533
    ],
    "ol": [
     0.603,
     1.1226,
     1.7493
    ]
   },
   "n": 1569
  },
  "CADCHF": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6479,
   "mu": -0.01019,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.3566,
     1.7721,
     2.3052
    ],
    "oc": [
     0.5709,
     1.0179,
     1.571
    ],
    "oh": [
     0.5966,
     1.0031,
     1.5103
    ],
    "ol": [
     0.6185,
     1.0595,
     1.6383
    ]
   },
   "n": 1564
  },
  "CADJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.06512,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.342,
     1.7819,
     2.3381
    ],
    "oc": [
     0.5757,
     1.0659,
     1.6413
    ],
    "oh": [
     0.5627,
     1.0059,
     1.5512
    ],
    "ol": [
     0.5555,
     1.0839,
     1.694
    ]
   },
   "n": 1565
  },
  "CHFJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.04486,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.3587,
     1.8035,
     2.2952
    ],
    "oc": [
     0.5779,
     1.0624,
     1.5982
    ],
    "oh": [
     0.5854,
     1.0981,
     1.5876
    ],
    "ol": [
     0.5623,
     1.0453,
     1.5892
    ]
   },
   "n": 1565
  },
  "EURAUD": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.04743,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4458,
     1.8898,
     2.4322
    ],
    "oc": [
     0.6107,
     1.0999,
     1.6434
    ],
    "oh": [
     0.6323,
     1.1144,
     1.7063
    ],
    "ol": [
     0.629,
     1.0762,
     1.5943
    ]
   },
   "n": 1565
  },
  "EURCAD": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6479,
   "mu": 0.02203,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4005,
     1.8273,
     2.3077
    ],
    "oc": [
     0.604,
     1.0636,
     1.5667
    ],
    "oh": [
     0.6294,
     1.0656,
     1.6015
    ],
    "ol": [
     0.5997,
     1.0556,
     1.5686
    ]
   },
   "n": 1565
  },
  "EURCHF": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.00716,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4328,
     1.887,
     2.443
    ],
    "oc": [
     0.6155,
     1.0879,
     1.6069
    ],
    "oh": [
     0.5887,
     1.0732,
     1.6214
    ],
    "ol": [
     0.6419,
     1.1301,
     1.7363
    ]
   },
   "n": 1565
  },
  "EURGBP": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.04458,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4207,
     1.8689,
     2.4708
    ],
    "oc": [
     0.5897,
     1.0281,
     1.617
    ],
    "oh": [
     0.5951,
     1.0808,
     1.7202
    ],
    "ol": [
     0.64,
     1.0985,
     1.5835
    ]
   },
   "n": 1565
  },
  "EURJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.06011,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.3663,
     1.8313,
     2.3352
    ],
    "oc": [
     0.6004,
     1.0601,
     1.5919
    ],
    "oh": [
     0.5951,
     1.0276,
     1.5669
    ],
    "ol": [
     0.5794,
     1.0599,
     1.6849
    ]
   },
   "n": 1565
  },
  "GBPAUD": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6479,
   "mu": -0.00655,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.3854,
     1.7857,
     2.2882
    ],
    "oc": [
     0.5899,
     1.0226,
     1.5766
    ],
    "oh": [
     0.6021,
     1.0751,
     1.599
    ],
    "ol": [
     0.5955,
     1.031,
     1.5628
    ]
   },
   "n": 1565
  },
  "GBPCAD": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.05535,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4462,
     1.8827,
     2.4219
    ],
    "oc": [
     0.605,
     1.0961,
     1.5875
    ],
    "oh": [
     0.6237,
     1.098,
     1.639
    ],
    "ol": [
     0.6223,
     1.1189,
     1.6508
    ]
   },
   "n": 1565
  },
  "GBPCHF": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.03388,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4119,
     1.8569,
     2.4172
    ],
    "oc": [
     0.6041,
     1.0445,
     1.6325
    ],
    "oh": [
     0.6025,
     1.0704,
     1.5828
    ],
    "ol": [
     0.6363,
     1.0875,
     1.7239
    ]
   },
   "n": 1565
  },
  "GBPJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6479,
   "mu": 0.06478,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.3572,
     1.804,
     2.3763
    ],
    "oc": [
     0.5619,
     1.0529,
     1.5967
    ],
    "oh": [
     0.5911,
     1.0296,
     1.5545
    ],
    "ol": [
     0.5769,
     1.0541,
     1.7068
    ]
   },
   "n": 1565
  }
 }
};
