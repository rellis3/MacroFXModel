/**
 * IV-adjusted daily ladder params. GENERATED — do not hand-edit.
 * Regenerate: python -m forge.export_iv_adjusted_params
 * Calibrated on LIVE-type inputs (OANDA D1 sigma; VIX/VXN, CME ATM 30d, GVZ, leg-built cross IV).
 */
export const IVADJ_PARAMS = {
 "generated": "2026-10-05",
 "source": "forge/export_iv_adjusted_params.py",
 "evidence": [
  "forge/COMBINED_RANGE_PREREG.md",
  "forge/CROSS_IV_PREREG.md",
  "analysis/output/iv_adjusted/CALIBRATION.md"
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
   "k": 0.6341,
   "mu": 0.17609,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.353,
     1.7764,
     2.3745
    ],
    "oc": [
     0.5893,
     1.0325,
     1.6362
    ],
    "oh": [
     0.5772,
     1.02,
     1.4892
    ],
    "ol": [
     0.5799,
     1.079,
     1.7598
    ]
   },
   "n": 2540
  },
  "DOW": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6341,
   "mu": 0.45165,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.5415,
     2.0274,
     2.646
    ],
    "oc": [
     0.6677,
     1.1853,
     1.7977
    ],
    "oh": [
     0.6999,
     1.1853,
     1.7095
    ],
    "ol": [
     0.6456,
     1.1884,
     1.8999
    ]
   },
   "n": 2584
  },
  "NQ": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6341,
   "mu": 0.34205,
   "iv_source": "VXN",
   "width": {
    "hl": [
     1.5687,
     2.0749,
     2.6848
    ],
    "oc": [
     0.7074,
     1.2679,
     1.8819
    ],
    "oh": [
     0.7025,
     1.1906,
     1.7218
    ],
    "ol": [
     0.638,
     1.2121,
     1.9857
    ]
   },
   "n": 2584
  },
  "SPX": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6341,
   "mu": 0.42737,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.5288,
     2.0473,
     2.6714
    ],
    "oc": [
     0.6792,
     1.2377,
     1.7913
    ],
    "oh": [
     0.6906,
     1.1761,
     1.6973
    ],
    "ol": [
     0.6271,
     1.1899,
     1.9548
    ]
   },
   "n": 2584
  },
  "UK100": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6341,
   "mu": 0.35026,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.3807,
     1.7773,
     2.2742
    ],
    "oc": [
     0.5859,
     1.0429,
     1.5538
    ],
    "oh": [
     0.6182,
     1.0389,
     1.4854
    ],
    "ol": [
     0.5926,
     1.0903,
     1.6823
    ]
   },
   "n": 2526
  },
  "US2000": {
   "class": "indices",
   "estimator": "yz_10",
   "k": 0.6341,
   "mu": 0.01601,
   "iv_source": "VIX",
   "width": {
    "hl": [
     1.5762,
     2.0184,
     2.5895
    ],
    "oc": [
     0.7041,
     1.2208,
     1.7568
    ],
    "oh": [
     0.6939,
     1.1794,
     1.7004
    ],
    "ol": [
     0.6787,
     1.2497,
     1.88
    ]
   },
   "n": 2584
  },
  "AUDUSD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7624,
   "mu": 0.13992,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.5674,
     2.0376,
     2.5501
    ],
    "oc": [
     0.683,
     1.1894,
     1.7905
    ],
    "oh": [
     0.6906,
     1.1718,
     1.7329
    ],
    "ol": [
     0.6594,
     1.2095,
     1.8412
    ]
   },
   "n": 1565
  },
  "EURUSD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7624,
   "mu": 0.14796,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.5708,
     2.0387,
     2.5712
    ],
    "oc": [
     0.6819,
     1.2143,
     1.7836
    ],
    "oh": [
     0.6398,
     1.1807,
     1.8109
    ],
    "ol": [
     0.6866,
     1.2214,
     1.7693
    ]
   },
   "n": 1565
  },
  "GBPUSD": {
   "class": "fx_major",
   "estimator": "ewma_094",
   "k": 0.7624,
   "mu": 0.1505,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.5701,
     2.0252,
     2.5884
    ],
    "oc": [
     0.684,
     1.2134,
     1.7648
    ],
    "oh": [
     0.6696,
     1.1913,
     1.7801
    ],
    "ol": [
     0.6895,
     1.2171,
     1.8004
    ]
   },
   "n": 1565
  },
  "GOLD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7624,
   "mu": 0.27419,
   "iv_source": "GVZ",
   "width": {
    "hl": [
     1.5291,
     2.0364,
     2.6151
    ],
    "oc": [
     0.6477,
     1.2011,
     1.8134
    ],
    "oh": [
     0.685,
     1.1904,
     1.828
    ],
    "ol": [
     0.6398,
     1.1636,
     1.8345
    ]
   },
   "n": 2581
  },
  "USDCAD": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7624,
   "mu": 0.15644,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.5714,
     2.0145,
     2.6272
    ],
    "oc": [
     0.674,
     1.2127,
     1.8019
    ],
    "oh": [
     0.7208,
     1.2234,
     1.8441
    ],
    "ol": [
     0.6621,
     1.1515,
     1.7467
    ]
   },
   "n": 1565
  },
  "USDCHF": {
   "class": "fx_major",
   "estimator": "yz_10",
   "k": 0.7624,
   "mu": 0.12674,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.5652,
     2.004,
     2.6207
    ],
    "oc": [
     0.669,
     1.2216,
     1.7823
    ],
    "oh": [
     0.6881,
     1.2057,
     1.7176
    ],
    "ol": [
     0.6715,
     1.2108,
     1.8194
    ]
   },
   "n": 1565
  },
  "USDJPY": {
   "class": "fx_major",
   "estimator": "ewma_094",
   "k": 0.7624,
   "mu": 0.19542,
   "iv_source": "CME_ATM30",
   "width": {
    "hl": [
     1.4684,
     1.9705,
     2.5758
    ],
    "oc": [
     0.6309,
     1.1767,
     1.7968
    ],
    "oh": [
     0.6288,
     1.0843,
     1.7182
    ],
    "ol": [
     0.6071,
     1.1685,
     1.8217
    ]
   },
   "n": 1565
  },
  "AUDCAD": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6447,
   "mu": 0.0991,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5587,
     2.0101,
     2.5311
    ],
    "oc": [
     0.6386,
     1.1382,
     1.745
    ],
    "oh": [
     0.6873,
     1.1843,
     1.7525
    ],
    "ol": [
     0.6629,
     1.1958,
     1.7444
    ]
   },
   "n": 1565
  },
  "AUDCHF": {
   "class": "crosses",
   "estimator": "ewma_090",
   "k": 0.6447,
   "mu": 0.15964,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.6192,
     2.0807,
     2.6517
    ],
    "oc": [
     0.6939,
     1.2193,
     1.8104
    ],
    "oh": [
     0.6995,
     1.1977,
     1.7459
    ],
    "ol": [
     0.7118,
     1.2866,
     1.9951
    ]
   },
   "n": 1565
  },
  "AUDJPY": {
   "class": "crosses",
   "estimator": "ewma_090",
   "k": 0.6447,
   "mu": 0.17608,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5566,
     2.0406,
     2.7081
    ],
    "oc": [
     0.6772,
     1.201,
     1.7547
    ],
    "oh": [
     0.6693,
     1.1706,
     1.6991
    ],
    "ol": [
     0.6629,
     1.2511,
     1.9522
    ]
   },
   "n": 1569
  },
  "CADCHF": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6447,
   "mu": 0.10236,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5322,
     2.0053,
     2.6023
    ],
    "oc": [
     0.6375,
     1.1529,
     1.759
    ],
    "oh": [
     0.6672,
     1.139,
     1.699
    ],
    "ol": [
     0.6932,
     1.1966,
     1.8363
    ]
   },
   "n": 1564
  },
  "CADJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.17036,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.503,
     1.971,
     2.5901
    ],
    "oc": [
     0.6438,
     1.1896,
     1.8006
    ],
    "oh": [
     0.6266,
     1.1157,
     1.7367
    ],
    "ol": [
     0.6162,
     1.1972,
     1.8589
    ]
   },
   "n": 1565
  },
  "CHFJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.15028,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5259,
     2.0034,
     2.5667
    ],
    "oc": [
     0.6442,
     1.2011,
     1.7894
    ],
    "oh": [
     0.6515,
     1.2266,
     1.8008
    ],
    "ol": [
     0.6315,
     1.174,
     1.761
    ]
   },
   "n": 1565
  },
  "EURAUD": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.13119,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5875,
     2.07,
     2.6502
    ],
    "oc": [
     0.6705,
     1.2067,
     1.7792
    ],
    "oh": [
     0.6905,
     1.2295,
     1.9077
    ],
    "ol": [
     0.6927,
     1.1859,
     1.768
    ]
   },
   "n": 1565
  },
  "EURCAD": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6447,
   "mu": 0.12527,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5655,
     2.0311,
     2.5728
    ],
    "oc": [
     0.68,
     1.1914,
     1.7431
    ],
    "oh": [
     0.7017,
     1.1993,
     1.781
    ],
    "ol": [
     0.6714,
     1.1729,
     1.7669
    ]
   },
   "n": 1565
  },
  "EURCHF": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.10081,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5756,
     2.0809,
     2.7073
    ],
    "oc": [
     0.6767,
     1.2043,
     1.7555
    ],
    "oh": [
     0.655,
     1.1912,
     1.7587
    ],
    "ol": [
     0.7063,
     1.2421,
     1.8992
    ]
   },
   "n": 1565
  },
  "EURGBP": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.13277,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.556,
     2.0591,
     2.6931
    ],
    "oc": [
     0.6468,
     1.1229,
     1.8048
    ],
    "oh": [
     0.6527,
     1.1916,
     1.8936
    ],
    "ol": [
     0.7117,
     1.2086,
     1.7574
    ]
   },
   "n": 1565
  },
  "EURJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.16742,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5028,
     2.0152,
     2.6268
    ],
    "oc": [
     0.6707,
     1.1809,
     1.7661
    ],
    "oh": [
     0.6601,
     1.1305,
     1.7255
    ],
    "ol": [
     0.6386,
     1.179,
     1.8727
    ]
   },
   "n": 1565
  },
  "GBPAUD": {
   "class": "crosses",
   "estimator": "yz_10",
   "k": 0.6447,
   "mu": 0.10234,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5554,
     2.0037,
     2.5758
    ],
    "oc": [
     0.6566,
     1.1587,
     1.7581
    ],
    "oh": [
     0.6751,
     1.2104,
     1.7855
    ],
    "ol": [
     0.6616,
     1.1708,
     1.7596
    ]
   },
   "n": 1565
  },
  "GBPCAD": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.14437,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5983,
     2.0659,
     2.63
    ],
    "oc": [
     0.6651,
     1.2028,
     1.7386
    ],
    "oh": [
     0.6934,
     1.2033,
     1.7931
    ],
    "ol": [
     0.6817,
     1.232,
     1.8225
    ]
   },
   "n": 1565
  },
  "GBPCHF": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.12785,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.5555,
     2.0611,
     2.6862
    ],
    "oc": [
     0.6563,
     1.1636,
     1.8373
    ],
    "oh": [
     0.6625,
     1.1946,
     1.7837
    ],
    "ol": [
     0.7007,
     1.1865,
     1.9385
    ]
   },
   "n": 1565
  },
  "GBPJPY": {
   "class": "crosses",
   "estimator": "ewma_094",
   "k": 0.6447,
   "mu": 0.16571,
   "iv_source": "LEGS",
   "width": {
    "hl": [
     1.4968,
     2.0138,
     2.6117
    ],
    "oc": [
     0.6156,
     1.1795,
     1.7963
    ],
    "oh": [
     0.6577,
     1.1472,
     1.7299
    ],
    "ol": [
     0.6334,
     1.1836,
     1.8773
    ]
   },
   "n": 1565
  }
 }
};
