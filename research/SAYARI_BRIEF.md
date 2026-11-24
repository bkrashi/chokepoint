# Sayari pull brief (shared by all research agents)

Goal: for each supply-chain node assigned to you, find 2–3 REAL companies that play that role, using the Sayari MCP tools (mcp__sayari__*). Load all Sayari tool schemas via ToolSearch first ("select:mcp__sayari__search_entities,mcp__sayari__search_entity_facets,mcp__sayari__get_entity_summary,mcp__sayari__get_entity_profile,mcp__sayari__check_watchlist,mcp__sayari__find_beneficial_owners,mcp__sayari__search_trade_facets,mcp__sayari__search_suppliers,mcp__sayari__search_buyers,mcp__sayari__traverse_network,mcp__sayari__search_shipments").

WARNING: broad name searches return huge outputs (hundreds of KB). Use specific queries (full legal name + country), small `limit` (3–5), and `response_mode: "compact"` where possible. If output is saved to a file, extract with python/jq — do not read it whole.

For each company, collect:
- name (legal name as in Sayari), country (ISO-2 or name)
- sayari_entity_id
- match: "confirmed" if identifiers/country/role clearly match the real company; otherwise "possible match"
- state_owned: "y" / "n" / "unknown" (from Sayari risk factors like state_owned / soe flags, or ownership by a government entity)
- risk_flags: list from Sayari risk factors / watchlist — sanctions, export control (e.g. BIS Entity List, MEU list), forced-labour lists (UFLPA Entity List, WRO), plus other notable Sayari risk factors. Each: {"type": "sanctions|export_control|forced_labour|soe|other", "label": "<Sayari risk factor name>", "detail": "<short, e.g. 'direct' or 'linked via 2-hop ownership'>"}. Distinguish direct flags from flags only via network ("linked to"). Empty list if none.
- top_counterparties: up to 3 top trade counterparties from Sayari shipment data (search_trade_facets / search_suppliers / search_buyers / traverse_network ships_to/receives_from). Each: {"name","country","direction":"buys_from|sells_to","shipments": <count or null>}. Empty list + note if Sayari has no trade data.
- ultimate_owner: {"name","country"} from find_beneficial_owners if available, else null.
- notes: one short neutral sentence.

LANGUAGE RULES: never say "guilty", "violates", etc. Use "flagged" or "linked to". Possible matches must be marked "possible match".

If Sayari has no good result for a node (or a company), set "sayari_status": "no_good_result" with an explanation, and add a "fallback" object: a clearly FICTIONAL example company: {"name": "Example Co. (FICTIONAL)", "fictional": true, "country", "notes": "Fictional placeholder — Sayari returned no reliable match."}.

Write ONE file per node to /Users/belianakrashi/chokepoint/data/sayari/<node_id>.json with exactly this shape:

```json
{
  "node": "<node_id>",
  "source": "Sayari",
  "retrieved_at": "2026-11-23",
  "sayari_status": "ok | partial | no_good_result",
  "status_note": "short explanation",
  "companies": [
    {
      "name": "", "country": "", "role": "", "sayari_entity_id": "",
      "match": "confirmed | possible match",
      "state_owned": "y | n | unknown",
      "risk_flags": [],
      "top_counterparties": [],
      "ultimate_owner": null,
      "notes": ""
    }
  ],
  "fallback": null
}
```

Be efficient: ~6–10 tool calls per company max. Don't do deep investigations.

Final reply to caller: a compact markdown table per node: company | country | Sayari ID | match | SOE | flags | top counterparties | UBO. Plus any caveats.
