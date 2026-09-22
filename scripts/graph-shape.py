#!/usr/bin/env python3
"""Graph protocol G7–G13. Exit 1 iff G9, G10, G11, G12 (contracts), or G13 fail."""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    ".turbo",
    "isolated",
    ".claude",
    "graphify-out",
}


def walk_src(exts: tuple[str, ...] = (".ts", ".tsx")) -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel = Path(dirpath).relative_to(ROOT).as_posix()
        parts = set(rel.split("/"))
        if "isolated" in parts or "tests" in parts or "test" in parts:
            continue
        for name in filenames:
            if name.endswith(exts) and not name.endswith(".d.ts"):
                out.append(Path(dirpath) / name)
    return out


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def g7_g8_from_graph() -> None:
    graph_path = ROOT / "graphify-out" / "graph.json"
    if not graph_path.exists():
        print("G7 skipped (no graph.json)")
        g8_from_source()
        return
    g = json.loads(graph_path.read_text(encoding="utf-8"))
    nodes = {x["id"]: x for x in g["nodes"]}
    edges = g.get("edges") or g.get("links") or []

    def sf(i: str) -> str:
        return (nodes.get(i, {}).get("source_file") or "").replace("\\", "/")

    fan_out: Counter[str] = Counter()
    imports: Counter[str] = Counter()
    for e in edges:
        src, tgt = sf(e["source"]), sf(e["target"])
        if not src or not tgt or src == tgt:
            continue
        fan_out[src] += 1
        imports[src] += 1
    top = [f for f, _ in fan_out.most_common(12)]
    app_hits = [f for f in top if f.startswith("apps/mobile/src/app/")]
    print("G7 top-12 fan-out intersect apps/mobile/src/app/:", app_hits)
    over = sorted(((n, f) for f, n in imports.items() if n > 35), reverse=True)
    print("G8 files >35 imports (graph):", [(f, n) for n, f in over[:20]])


def g8_from_source() -> None:
    over: list[tuple[int, str]] = []
    for p in walk_src():
        n = sum(1 for line in p.read_text(encoding="utf-8", errors="replace").splitlines() if line.startswith("import "))
        if n > 35:
            over.append((n, rel(p)))
    over.sort(reverse=True)
    print("G8 files >35 imports (source):", over[:20])


def catalogue_flags() -> dict[str, dict[str, bool]]:
    src = (ROOT / "packages/shared/src/events/index.ts").read_text(encoding="utf-8")
    flags: dict[str, dict[str, bool]] = {}
    for m in re.finditer(
        r'"([a-z]+\.[a-z_]+)"\s*:\s*\{([^}]*)\}',
        src,
        re.S,
    ):
        body = m.group(2)
        flags[m.group(1)] = {
            "noConsumer": "noConsumer:" in body or "noConsumer :" in body,
            "deprecated": "deprecated:" in body or "deprecated :" in body,
            "consumerOwedBy": "consumerOwedBy:" in body or "consumerOwedBy :" in body,
        }
    return flags


def collect_event_uses() -> tuple[set[str], set[str]]:
    published: set[str] = set()
    consumed: set[str] = set()
    event_re = re.compile(r'\bevent\(\s*"([a-z]+\.[a-z_]+)"')
    type_re = re.compile(r'\btype:\s*"([a-z]+\.[a-z_]+)"')
    for p in walk_src():
        r = rel(p)
        if "/tests/" in f"/{r}/" or r.endswith(".test.ts"):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        published.update(event_re.findall(text))
        if r.endswith("/src/module.ts") and "packages/modules/" in r:
            # consumers live in module.ts arrays
            idx = text.find("consumers:")
            chunk = text[idx:] if idx >= 0 else ""
            consumed.update(type_re.findall(chunk))
    return published, consumed


def g9_g10() -> list[str]:
    flags = catalogue_flags()
    published, consumed = collect_event_uses()
    fails: list[str] = []
    leftover9 = []
    for t in sorted(published):
        if t in consumed:
            continue
        f = flags.get(t, {})
        if f.get("noConsumer") or f.get("deprecated") or f.get("consumerOwedBy"):
            continue
        leftover9.append(t)
    print("G9 published without consumer:", leftover9)
    if leftover9:
        fails.append("G9")
    leftover10 = []
    for t in sorted(consumed):
        if t in published:
            continue
        leftover10.append(t)
    print("G10 consumed without publisher:", leftover10)
    if leftover10:
        fails.append("G10")
    return fails


def g11() -> list[str]:
    tables: set[str] = set()
    schema_dir = ROOT / "packages/db/src/schema"
    for p in schema_dir.glob("*.ts"):
        current = None
        for line in p.read_text(encoding="utf-8").splitlines():
            tm = re.search(r'\.table\(\s*"([^"]+)"', line)
            if tm:
                current = tm.group(1)
            if current and re.search(r'text\(\s*"member_id"\s*\)', line):
                tables.add(current)
    delete_src = (ROOT / "apps/api/test/delete.test.ts").read_text(encoding="utf-8")
    missing = sorted(t for t in tables if t not in delete_src)
    print("G11 member_id tables missing from delete.test.ts:", missing)
    return ["G11"] if missing else []


def g12() -> list[str]:
    """Count type-`any` only — permission suffixes like `read-any` are not hits.
    Fail if any file under packages/shared/src/api/ still matches."""
    counts: Counter[str] = Counter()
    # Not \bany\b: that matches inside read-any / update-any (permission names).
    any_re = re.compile(r"""(?<![\w"'-])any(?![\w"'-])""")
    for p in walk_src((".ts",)):
        r = rel(p)
        if not (r.startswith("packages/") or r.startswith("apps/")):
            continue
        if r.startswith("apps/mobile/"):
            continue
        n = len(any_re.findall(p.read_text(encoding="utf-8", errors="replace")))
        if n:
            counts[r] = n
    top = counts.most_common(12)
    print("G12 any-count top files:", top, "total", sum(counts.values()))

    contract_hits = {r: n for r, n in counts.items() if r.startswith("packages/shared/src/api/")}
    print("G12 any in contracts (shared/src/api):", contract_hits if contract_hits else "{}")
    return ["G12"] if contract_hits else []


def pascal(name: str) -> str:
    return name[:1].upper() + name[1:] if name else name


def g13() -> list[str]:
    """A consumer that declares needs: ["x"] must import XFacade from @bbc/x in the same file.
    Inspects module.ts and the BFF only — a ports/ alias does not count."""
    fails: list[str] = []
    files: list[Path] = []
    mod_root = ROOT / "packages" / "modules"
    if mod_root.is_dir():
        for layer in mod_root.iterdir():
            if not layer.is_dir():
                continue
            for mod in layer.iterdir():
                mt = mod / "src" / "module.ts"
                if mt.is_file():
                    files.append(mt)
    bff = ROOT / "apps" / "api" / "src" / "presentation" / "mobile" / "index.ts"
    if bff.is_file():
        files.append(bff)

    for f in files:
        s = f.read_text(encoding="utf-8", errors="replace")
        for need_block in re.findall(r"needs:\s*\[([^\]]*)\]", s):
            for port in re.findall(r'"(\w+)"', need_block):
                want = f"{pascal(port)}Facade"
                if not re.search(
                    rf'import type \{{[^}}]*\b{want}\b[^}}]*\}} from "@bbc/{port}"',
                    s,
                ):
                    fails.append(f"G13: {rel(f)} needs {port} but does not import {want} — is it a hand-written copy?")
    print("G13 hand-written port types:", fails, "(want [])")
    return ["G13"] if fails else []


def main() -> int:
    os.chdir(ROOT)
    g7_g8_from_graph()
    fails = []
    fails.extend(g9_g10())
    fails.extend(g11())
    fails.extend(g12())
    fails.extend(g13())
    if fails:
        print("graph-shape FAILED:", ", ".join(fails))
        return 1
    print("graph-shape OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
