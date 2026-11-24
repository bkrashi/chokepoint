#!/usr/bin/env python3
"""
Merge research/facts.json (the fact-checked sources) into data/game.json
under "facts", and regenerate SOURCES.md.

Run:  python3 scripts/merge_facts.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACTS = os.path.join(ROOT, "research", "facts.json")
GAME = os.path.join(ROOT, "data", "game.json")
SOURCES = os.path.join(ROOT, "SOURCES.md")

facts = json.load(open(FACTS, encoding="utf-8"))["facts"]
game = json.load(open(GAME, encoding="utf-8"))

keep = ["id", "topic", "text", "source_name", "source_url", "published", "recheck_by", "verified"]
# Only verified facts are published; unverified ones stay in research/facts.json.
unverified = [f["id"] for f in facts if not f.get("verified")]
game["facts"] = [{k: f.get(k) for k in keep} for f in facts if f.get("verified")]

# Every node/card should point at a fact that exists.
ids = {f["id"] for f in game["facts"]}
missing = []
for kind in ("nodes", "cards"):
    for item in game[kind]:
        for fid in item.get("fact_ids", []):
            if fid not in ids:
                missing.append(f"{kind}:{item['id']} -> {fid}")

json.dump(game, open(GAME, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

lines = ["# Chokepoint: sources and re-check dates", "",
         "Every real-world claim shown in the game, the source it comes from, and the date to re-check it by.",
         "The TTS / TTR week numbers are an illustrative teaching model and are not sourced claims.", "",
         "| Topic | Claim | Source | Published | Re-check by | Verified |",
         "|---|---|---|---|---|---|"]
for f in game["facts"]:
    txt = (f.get("text") or "").replace("|", "/")
    src = f"[{f.get('source_name') or 'link'}]({f.get('source_url')})" if f.get("source_url") else "-"
    lines.append(f"| {f.get('topic')} | {txt} | {src} | {f.get('published') or '-'} | {f.get('recheck_by')} | {'yes' if f.get('verified') else '**no**'} |")
lines += ["", "Company data: Sayari (see `data/sayari/`, field `retrieved_at`). Summary fields only.", ""]
open(SOURCES, "w", encoding="utf-8").write("\n".join(lines))

print(f"merged {len(game['facts'])} verified facts; wrote SOURCES.md; left out unverified: {unverified}")
for m in missing:
    print("MISSING", m)
