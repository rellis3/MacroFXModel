"""Build the page data for paper-cross-synthesis from the stage-A outputs and the five theme outputs."""
import json, os, collections, sys
D = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rows = json.load(open(f"{D}/tags.json", encoding="utf-8"))
A = json.load(open(f"{D}/stage_a.json", encoding="utf-8"))
pairs = json.load(open(f"{D}/pairs.json"))
P = json.load(open(f"{D}/papers.json", encoding="utf-8"))
while isinstance(P, str):
    P = json.loads(P)
url = {x["id"]: (x.get("url") or "") for x in P}
idk = {r["id"]: r["k"] for r in rows}
ev_ids = set()
import re
for m in re.finditer(r"id:\s*'([^']+)'", open(f"{D}/themes/deskEvidence.js", encoding="utf-8").read()):
    ev_ids.add(m.group(1))
ev_verdict = {}
src = open(f"{D}/themes/deskEvidence.js", encoding="utf-8").read()
for m in re.finditer(r"id:\s*'([^']+)'[^\n]*?verdict:\s*'([a-z]+)'", src):
    ev_verdict[m.group(1)] = m.group(2)

# per-paper partners (top 10 each way) and reader cross-refs
part_of = collections.defaultdict(list)
anch_of = collections.defaultdict(list)
for p in pairs:
    if len(anch_of[p["anchor"]]) < 10:
        anch_of[p["anchor"]].append([p["part"], p["slot"], p["score"]])
    if len(part_of[p["part"]]) < 10:
        part_of[p["part"]].append([p["anchor"], p["slot"], p["score"]])
xref = collections.defaultdict(list)
for x in P:
    a = idk.get(x["id"])
    for e in x["notes"].get("crossRefs") or []:
        b = idk.get(e.get("paperId"))
        if a and b and a != b:
            xref[a].append([b, e.get("relation")])
papers = []
for r in rows:
    papers.append(dict(k=r["k"], t=r["title"], y=r["year"], u=url.get(r["id"], ""), full=r["full"], role=r["primary"], roles=r["roles"],
                       fam=r["family"], asset=r["asset"], hor=r["horizon"], s=r["strength"], oos=r["oos"], pr=r["produces"], one=r["one"],
                       adds=anch_of.get(r["k"], []), feeds=part_of.get(r["k"], []), x=xref.get(r["k"], [])[:8]))

themes, bad = [], []
names = {"T1_fx_rates_macro": "FX, rates & macro", "T2_equity_intraday_options": "Equity intraday & options",
         "T3_volatility_regime": "Volatility & regime", "T4_trend_factor_portfolio": "Trend, factors & portfolio",
         "T5_gold_commod_sentiment_crossasset": "Gold, commodities, sentiment & cross-asset"}
K = {r["k"] for r in rows}
for key, label in names.items():
    f = f"{D}/themes/{key}_out.json"
    if not os.path.exists(f):
        bad.append(f"missing {key}")
        continue
    t = json.load(open(f, encoding="utf-8"))
    for b in t.get("blueprints", []):
        for p in b.get("parts", []):
            if p.get("k") not in K:
                bad.append(f"{key}: unknown paper {p.get('k')} in {b['name']}")
        keep = []
        for e in b.get("evidence", []):
            if e.get("id") in ev_ids:
                e["verdict"] = ev_verdict.get(e["id"], e.get("verdict"))
                keep.append(e)
            else:
                bad.append(f"{key}: unknown evidence id {e.get('id')} in {b['name']}")
        b["evidence"] = keep
    themes.append(dict(key=key, label=label, summary=t.get("summary", ""), blueprints=t.get("blueprints", []),
                       corroborations=t.get("corroborations", []), contradictions=t.get("contradictions", [])))

# same system reached by more than one theme reader: parts overlap (Jaccard) >= 0.5 -> one group; 0.25-0.5 -> related
allb = [(t, b) for t in themes for b in t["blueprints"]]
par = list(range(len(allb)))
def fnd(i):
    while par[i] != i:
        par[i] = par[par[i]]; i = par[i]
    return i
ks = [{p["k"] for p in b["parts"]} for _, b in allb]
rel = collections.defaultdict(list)
for i in range(len(allb)):
    for j in range(i + 1, len(allb)):
        if allb[i][0]["key"] == allb[j][0]["key"]:
            continue
        jac = len(ks[i] & ks[j]) / len(ks[i] | ks[j])
        if jac >= 0.5:
            par[fnd(i)] = fnd(j)
        elif jac >= 0.25 and len(ks[i] & ks[j]) >= 2:
            rel[i].append(j); rel[j].append(i)
grp = collections.defaultdict(list)
for i in range(len(allb)):
    grp[fnd(i)].append(i)
for g, idx in grp.items():
    lead = max(idx, key=lambda i: (float(allb[i][1]["grade"]), len(allb[i][1]["parts"])))
    for i in idx:
        b = allb[i][1]
        b["id"] = f"b{i}"
        b["lead"] = i == lead
        b["also"] = [dict(theme=allb[j][0]["label"], name=allb[j][1]["name"], grade=allb[j][1]["grade"]) for j in idx if j != i]
for i, js in rel.items():
    allb[i][1]["related"] = sorted({allb[j][1]["name"] for j in js})
n_merged = sum(1 for idx in grp.values() if len(idx) > 1)
meta = dict(n_systems=len(grp), n_multi_theme=n_merged, built="2026-11-17", n_papers=A["n_papers"], n_full=sum(r["full"] for r in rows), n_pairs_checked=A["n_pairs_checked"],
            n_complementary=A["n_complementary"], n_clusters=len(A["clusters"]), n_contradictions=len(A["contradictions"]),
            edges=A["edges"], roles=A["roles"], strength=A["strength"], families=A["families"])
fam_role = collections.Counter((r["family"], r["primary"]) for r in rows)
syn = dict(meta=meta, fam_role=[[a, b, v] for (a, b), v in fam_role.items()], slot_mat=A["slot_mat"], fam_mat=A["fam_mat"],
           clusters=A["clusters"], contradictions=A["contradictions"], themes=themes)
json.dump(syn, open(f"{OUT}/synthesis.json", "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
json.dump(papers, open(f"{OUT}/papers.json", "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
print("themes", len(themes), "blueprints", sum(len(t["blueprints"]) for t in themes), "problems", len(bad))
for b in bad[:40]:
    print("  ", b)
print({f: os.path.getsize(f"{OUT}/{f}") // 1000 for f in ("synthesis.json", "papers.json")}, "KB")
