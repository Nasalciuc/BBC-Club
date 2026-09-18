#!/usr/bin/env python3
"""Graphify protocol G1–G6. Run before and after writing; paste output into the PR."""
import json
import sys

g = json.load(open("graphify-out/graph.json", encoding="utf-8"))
E = g.get("edges") or g.get("links")
N = {x["id"]: x for x in g["nodes"]}
sf = lambda i: (N.get(i, {}).get("source_file") or "")
files = {sf(x["id"]) for x in g["nodes"] if sf(x["id"])}
imported = {sf(x["target"]) for x in E if sf(x["source"]) != sf(x["target"])}
BACK = ("apps/api/", "packages/db/", "packages/modules/")

for f in sys.argv[1:]:
    # Normalize Windows paths to forward slashes for graph matching
    f = f.replace("\\", "/")
    ins = sorted({sf(x["source"]) for x in E if sf(x["target"]) == f and sf(x["source"]) != f})
    print(f"G1 {f} <- imported by {len(ins)}")
    for i in ins:
        print("      ", i)
    outs = sorted({sf(x["target"]) for x in E if sf(x["source"]) == f and sf(x["target"]) != f})
    print(f"G2 {f} -> imports {len(outs)}")
    for o in outs:
        print("      ", o)

print(
    "G3 mobile -> backend     :",
    sum(
        1
        for x in E
        if sf(x["source"]).startswith("apps/mobile/")
        and any(sf(x["target"]).startswith(p) for p in BACK)
    ),
    "(must be 0)",
)
print(
    "G4 anything -> isolated/ :",
    sum(
        1
        for x in E
        if not sf(x["source"]).startswith("isolated/") and sf(x["target"]).startswith("isolated/")
    ),
    "(must be 0)",
)
print(
    "G5 unused in apps/mobile :",
    [
        f
        for f in files
        if f.startswith("apps/mobile/src/")
        and f not in imported
        and "/app/" not in f
        and not f.endswith(".d.ts")
        and not f.endswith(".test.ts")
    ],
    "(must be [])",
)
print(
    "G6 modules -> apps/api   :",
    sorted(
        {
            "/".join(sf(x["source"]).split("/")[:4])
            for x in E
            if sf(x["source"]).startswith("packages/modules/")
            and sf(x["target"]).startswith("apps/api/")
        }
    ),
    "(must be [])",
)
