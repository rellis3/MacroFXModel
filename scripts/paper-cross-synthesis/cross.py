"""paper-cross-synthesis stage A: every paper against every other (deterministic).

Inputs: cards.json, papers.json (crossRefs), batches/t*.jsonl (role tags).
Outputs: tags.json (merged), pairs.json (top complementary pairs), stage_a.json (matrices, clusters, contradictions).
"""
import json, itertools, collections, os, math
D = os.path.dirname(os.path.abspath(__file__))
cards = json.load(open(f"{D}/cards.json", encoding="utf-8"))
P = json.load(open(f"{D}/papers.json", encoding="utf-8"))
while isinstance(P, str):
    P = json.loads(P)
tags = {}
for b in range(6):
    for l in open(f"{D}/batches/t{b}.jsonl", encoding="utf-8"):
        x = json.loads(l)
        tags[x["k"]] = x
assert len(tags) == len(cards), (len(tags), len(cards))
lst = lambda v: v if isinstance(v, list) else [v]
idk = {c["id"]: c["k"] for c in cards}
W = {"A": 3.0, "B": 2.0, "C": 1.0, "D": 0.3}
SLOTS = ["regime", "timing", "sizing", "exit", "forecast", "cost"]
HOR = ["intraday", "daily", "weekly", "monthly", "quarterly_plus"]

rows = []
for c in cards:
    t = tags[c["k"]]
    rows.append(dict(k=c["k"], id=c["id"], title=c["title"], year=c["year"], full=c["full"],
                     roles=lst(t["roles"]), primary=t["primary"], asset=lst(t["asset"]), horizon=lst(t["horizon"]),
                     family=t["family"], inputs=lst(t.get("inputs") or []), produces=t.get("produces", ""),
                     strength=t["strength"], one=t.get("one", ""), oos=c["oos"], market=c["market"]))
R = {r["k"]: r for r in rows}

# crossRefs graph (directed as written by the reader; treat as undirected for pairs)
edges = {}
for x in P:
    a = idk.get(x["id"])
    for e in x["notes"].get("crossRefs") or []:
        b = idk.get(e.get("paperId"))
        if a and b and a != b:
            edges[tuple(sorted((a, b)))] = (e.get("relation"), e.get("note", ""))


def asset_fit(a, b):
    sa, sb = set(a["asset"]), set(b["asset"])
    if sa & sb - {"multi"}:
        return 1.0
    if "multi" in sa or "multi" in sb:
        return 0.6
    if {"vol"} & (sa | sb) and {"equity_index", "fx", "gold"} & (sa | sb):
        return 0.5   # a vol paper can feed a price system
    return 0.0


def hor_fit(a, b):
    ia = {HOR.index(h) for h in a["horizon"] if h in HOR}
    ib = {HOR.index(h) for h in b["horizon"] if h in HOR}
    if not ia or not ib:
        return 0.5
    d = min(abs(i - j) for i in ia for j in ib)
    return {0: 1.0, 1: 0.6}.get(d, 0.0)


def slot_of(anchor, part):
    """What does `part` add to a system anchored on `anchor`'s direction/forecast? None if it adds no new slot."""
    if anchor["primary"] not in ("direction", "forecast"):
        return None
    for s in SLOTS:
        if s in part["roles"] and s not in anchor["roles"]:
            return s
    if anchor["primary"] == "forecast" and "direction" in part["roles"] and "direction" not in anchor["roles"]:
        return "direction"
    return None


usable = [r for r in rows if r["primary"] != "theory" and r["strength"] != "D"]
pairs, fam_mat, slot_mat = [], collections.Counter(), collections.Counter()
n_checked = 0
for a, b in itertools.combinations(rows, 2):
    n_checked += 1
    for anc, part in ((a, b), (b, a)):
        s = slot_of(anc, part)
        if not s:
            continue
        af, hf = asset_fit(anc, part), hor_fit(anc, part)
        if af == 0 or hf == 0:
            continue
        rel = edges.get(tuple(sorted((a["k"], b["k"]))))
        bonus = 1.25 if rel and rel[0] in ("extends", "confirms", "uses-same-data", "replicates") else (0.6 if rel and rel[0] == "contradicts" else 1.0)
        sc = W[anc["strength"]] * W[part["strength"]] * af * hf * bonus
        if sc <= 0.3:
            continue
        pairs.append(dict(anchor=anc["k"], part=part["k"], slot=s, score=round(sc, 3), rel=rel[0] if rel else None))
        fam_mat[(anc["family"], part["family"])] += sc
        slot_mat[(anc["family"], s)] += 1
pairs.sort(key=lambda p: -p["score"])

# corroboration clusters: same family, overlapping asset+horizon, same primary role, >= 3 papers
clus = collections.defaultdict(list)
for r in rows:
    if r["primary"] in ("theory",):
        continue
    for a_ in r["asset"]:
        for h in r["horizon"]:
            clus[(r["family"], r["primary"], a_, h)].append(r["k"])
clusters = []
for key, ks in clus.items():
    if len(ks) >= 3:
        st = [R[k]["strength"] for k in ks]
        clusters.append(dict(family=key[0], role=key[1], asset=key[2], horizon=key[3], n=len(ks),
                             nAB=sum(s in "AB" for s in st), weight=round(sum(W[s] for s in st), 1), papers=ks))
clusters.sort(key=lambda c: -c["weight"])

contra = [dict(a=a, b=b, note=v[1]) for (a, b), v in edges.items() if v[0] == "contradicts"]

json.dump(rows, open(f"{D}/tags.json", "w", encoding="utf-8"), ensure_ascii=False)
json.dump(pairs, open(f"{D}/pairs.json", "w", encoding="utf-8"))
json.dump(dict(n_papers=len(rows), n_pairs_checked=n_checked, n_complementary=len(pairs),
               edges=collections.Counter(v[0] for v in edges.values()),
               fam_mat=[[a, b, round(v, 1)] for (a, b), v in fam_mat.most_common()],
               slot_mat=[[a, s, v] for (a, s), v in slot_mat.most_common()],
               clusters=clusters, contradictions=contra,
               roles=collections.Counter(r["primary"] for r in rows), strength=collections.Counter(r["strength"] for r in rows),
               families=collections.Counter(r["family"] for r in rows)),
          open(f"{D}/stage_a.json", "w", encoding="utf-8"), ensure_ascii=False)
print("papers", len(rows), "pairs checked", n_checked, "complementary", len(pairs), "clusters", len(clusters), "contradictions", len(contra))
print("top family pairs", fam_mat.most_common(12))
