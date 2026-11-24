#!/usr/bin/env python3
"""
Chokepoint build step: turn the raw Sayari pulls in data/sayari/<node>.json
into public summary files: data/sayari/<node>.json (one per node) and
data/sayari/index.json (all nodes, the file the website reads). The raw
files in research/sayari_raw/ are local only and are never published.

* No API keys, no live calls: the raw files were pulled at build time through
  the Sayari MCP connector and saved to disk. This script is offline.
* Public display is SUMMARY FIELDS ONLY (name, country, Sayari ID, match,
  state-owned, flags, top-3 counterparties, ultimate owner). Free-text notes
  stay in the raw files.
* Wording: a direct list match -> "flagged"; anything reached through
  ownership, trade or network links -> "linked". Never "guilty".

Run:  python3 scripts/build_sayari.py
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "research", "sayari_raw")   # raw pulls: local only, git-ignored
DST = os.path.join(ROOT, "data", "sayari")            # public summary files
OUT = os.path.join(DST, "index.json")

# Noise we never show: country-level scores, address patterns.
DROP = re.compile(r"basel_aml|cpi_score|mass_address|mass_business_registration", re.I)

# (pattern on raw label, human label). First match wins.
LABELS = [
    (r"subtier", "Forced-labour risk in sub-tier suppliers"),
    (r"(owned_by|owner_of)_regulatory_action", "Related company has a regulatory action"),
    (r"wro_entity", "US CBP Withhold Release Order"),
    (r"owner_of_forced_labor_xinjiang_uflpa", "Owns UFLPA Entity List companies"),
    (r"forced_labor_xinjiang_uflpa", "US UFLPA Entity List"),
    (r"sheffield_hallam.*adjacent", "Forced-labour research (network)"),
    (r"sheffield_hallam", "Named in Sheffield Hallam forced-labour research"),
    (r"owner_of_forced_labor|owned_by_xinjiang", "Xinjiang forced-labour risk (ownership)"),
    (r"ilab", "Product on US DOL forced/child-labour goods list"),
    (r"forced_labor|uflpa|xinjiang", "Forced-labour risk in sub-tier suppliers"),
    (r"^usa_bis$|usa_bis\b(?!_high)", "US BIS Entity List"),
    (r"owner_of_usa_bis", "Owns a BIS Entity List company"),
    (r"psa_exports_to_usa_bis", "Trade with a BIS Entity List company"),
    (r"meu_list", "US Military End-User list category"),
    (r"military_end_use", "Military end-use keywords (China)"),
    (r"bis_high_priority|critical_components", "Trades BIS high-priority item categories"),
    (r"export_controls_adjacent", "Export-controlled parties (network)"),
    (r"exports_to_sanctioned|buyers flagged sanctioned|imports_from_sanctioned", "Sanctioned trade counterparties"),
    (r"owner_of_sanctioned", "Owns a sanctioned entity"),
    (r"sanctioned_adjacent", "Sanctioned parties (network)"),
    (r"chinese_core_soe|state_owned|chinese_state_owned", "State-owned"),
    (r"owned_by_chinese_soe|owned_by_soe", "Owned by a state-owned enterprise"),
    (r"soe_adjacent|export_to_soe|export_to_chinese_soe", "State-owned parties (network)"),
    (r"exports_conflict_minerals", "Trades conflict-mineral goods"),
    (r"law_enforcement_action", "Law-enforcement action"),
    (r"regulatory_action", "Regulatory action"),
    (r"reputational_risk", "Adverse media"),
    (r"pep_adjacent", "Politically exposed persons (network)"),
]

LINK_WORDS = re.compile(r"not direct|indirect|linked|adjacent|network|sub-?tier|via|psa|possibly|"
                        r"minority|product|trade|shareholder|category|owns|subsidiary", re.I)


# Privacy default: individuals are not named on the public page.
PERSON_OWNERS = re.compile(r"Vaksman|Bondarenko|罗立国|Luo Liguo|MWANGACHUCHU", re.I)
# Counterparty rows that are low quality, person-type records, or need a qualifier.
DROP_CP_FOR = {"GG8YwuxZxcEm8MEU3csapw"}  # Samsung: person-type / poor trade records
CP_RENAME = {"OOO Enkor Grupp (Sayari-flagged OFAC SDN)": "OOO Enkor Grupp (possible match; Sayari flags it as sanctioned)"}

PUBLIC_NOTE = {
    "partial": "Partial data: Sayari has thin records or little trade data for some of these companies.",
    "no_good_result": "Sayari returned no reliable match for this role. A clearly labelled fictional example is shown instead.",
}


def human(raw):
    for pat, lab in LABELS:
        if re.search(pat, raw, re.I):
            return lab
    return raw.replace("_", " ")


def tier(flag):
    raw = (flag.get("label") or "")
    detail = (flag.get("detail") or "")
    if re.search(r"adjacent|subtier|psa_|owner_of|owned_by_regulatory|ilab|high_priority", raw, re.I):
        return "linked"
    if re.search(r"^direct", detail.strip(), re.I) and not re.search(r"minority|product", detail, re.I):
        return "flagged"
    if LINK_WORDS.search(detail):
        return "linked"
    return "flagged"


def summarize_flags(flags):
    best = {}
    for f in flags or []:
        raw = f.get("label") or ""
        if DROP.search(raw):
            continue
        lab = human(raw)
        t = tier(f)
        cur = best.get(lab)
        if cur is None or (cur["tier"] == "linked" and t == "flagged"):
            best[lab] = {"tier": t, "type": f.get("type", "other"), "label": lab}
    out = sorted(best.values(), key=lambda x: (x["tier"] != "flagged", x["label"]))
    return out


def company(c):
    owner = c.get("ultimate_owner")
    owner_name = owner.get("name") if isinstance(owner, dict) and owner.get("name") else None
    if owner_name and PERSON_OWNERS.search(owner_name):
        owner_name = "An individual (name withheld on public page)"
    cps = [] if c.get("sayari_entity_id") in DROP_CP_FOR else (c.get("top_counterparties") or [])
    return {
        "name": c.get("name"),
        "country": c.get("country"),
        "sayari_entity_id": c.get("sayari_entity_id"),
        "match": "possible match" if "possible" in (c.get("match") or "") else "confirmed",
        "state_owned": c.get("state_owned", "unknown"),
        "flags": summarize_flags(c.get("risk_flags")),
        "top_counterparties": [
            {"name": CP_RENAME.get(p.get("name"), p.get("name")),
             "country": None if p.get("country") in (None, "unknown") else p.get("country"),
             "direction": p.get("direction")}
            for p in cps[:3] if p.get("name")
        ],
        "ultimate_owner": owner_name,
    }


def main():
    nodes, problems = {}, []
    for path in sorted(glob.glob(os.path.join(SRC, "*.json"))):
        if path.endswith("index.json"):
            continue
        d = json.load(open(path, encoding="utf-8"))
        nid = d.get("node") or os.path.basename(path)[:-5]
        if d.get("source") != "Sayari":
            problems.append(f"{nid}: source is not 'Sayari'")
        if not d.get("retrieved_at"):
            problems.append(f"{nid}: missing retrieved_at")
        comps = [company(c) for c in d.get("companies", [])]
        fb = d.get("fallback")
        if not comps and not fb:
            problems.append(f"{nid}: no companies and no fallback")
        nodes[nid] = {
            "source": "Sayari",
            "retrieved_at": d.get("retrieved_at"),
            "sayari_status": d.get("sayari_status", "ok"),
            # Public note is generic; analyst notes stay in the raw file.
            "status_note": PUBLIC_NOTE.get(d.get("sayari_status")),
            "companies": comps,
            "fallback": ({"name": fb.get("name"), "fictional": True, "notes": fb.get("notes")} if fb else None),
        }
    os.makedirs(DST, exist_ok=True)
    for nid, n in nodes.items():
        json.dump(dict(node=nid, **n), open(os.path.join(DST, nid + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
    out = {"source": "Sayari", "display": "summary fields only", "nodes": nodes}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {OUT}: {len(nodes)} nodes, {sum(len(n['companies']) for n in nodes.values())} companies")
    for p in problems:
        print("WARN", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
