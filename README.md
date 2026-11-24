# Chokepoint

**A reverse stress test of an AI chip.** A classroom game for *Ethical Sourcing in Emerging Tech*.

Live: https://bkrashi.github.io/chokepoint/

Normal stress tests ask *"what if X happens?"* A **reverse** stress test starts from the failure (*no AI chip ships*) and works backwards to the smallest set of events that causes it.

Each supply-chain node has two numbers, following Simchi-Levi et al.:

- **TTS, time-to-survive:** weeks the chain can keep going on inventory.
- **TTR, time-to-recover:** weeks to restore supply after a disruption.

If **TTR > TTS** on a critical node, the chip is **CHOKED**.

> The TTS / TTR week numbers are an **illustrative teaching model**. They are not forecasts. Every real-world fact has a source and a re-check date (see [SOURCES.md](SOURCES.md)).

---

## The three steps

| Step | What the class does | What they learn |
|---|---|---|
| **1 Break it** | Play customs-form event cards to choke the chip with the **fewest** cards. A big red CHOKED stamp lands when it happens. | Where the single points of failure are. |
| **2 Fix it** | Spend a **$10M** budget on fixes, then **replay** the same cards. | Some risks can be bought down. Taiwan can't, on $10M. |
| **3 Judge it** | Compare **Resilience** and **Ethics**. Read the "who pays" receipts. | Cheap resilience often moves the cost onto someone else. |

**Controls:** keys `1` `2` `3` switch steps · `R` or the **Reset** button starts over · click any shipping container to see the real companies in that role (Sayari data).

---

## How to edit the numbers (no coding)

Everything the game uses is in **[`data/game.json`](data/game.json)**. Edit it on GitHub (pencil icon), save, and the site updates in about a minute.

| What you want to change | Where in `game.json` |
|---|---|
| A node's weeks of inventory | `nodes[] → tts_weeks` |
| Whether a node can choke the chip | `nodes[] → critical` (`true` / `false`) |
| How hard a card hits | `cards[] → hits[] → ttr_weeks` |
| Card text / form number | `cards[] → title`, `blurb`, `form_no` |
| A fix's price | `fixes[] → cost_musd` |
| A fix's effect | `fixes[] → effects[]`, using `tts_add` (more weeks of stock), `ttr_cut` (faster recovery) or `make_noncritical: true` (redesigned out) |
| A fix's ethics score and "who pays" line | `fixes[] → ethics`, `ethics_note`, `who_pays` |
| Budget / starting ethics | `meta → budget_musd`, `ethics_start` |
| Presenter script lines | `scripts → break / fix / judge` |

**Rules the game applies:**

- Two cards on the same node **add** their TTR.
- `ttr_cut` is subtracted from the total.
- The line stops at the earliest TTS among choked nodes.
- **Par** is the smallest card set that chokes the chip. It is worked out automatically.
- **Resilience** is the share of all 55 one- and two-card attacks the chain survives.
- **Ethics** starts at `ethics_start` and adds each fix's `ethics` score, capped at 0–100.

After editing, check that the JSON is still valid (for example at jsonlint.com). One missing comma breaks the page.

---

## Where each fact comes from

- **Real-world events and supply-chain facts:** [SOURCES.md](SOURCES.md) lists every claim with its source link, publication date and a **re-check by** date. The same table is in the game under **"Sources & re-check dates"**, and each event card shows its source underneath.
- **Real companies (container flip):** pulled from **Sayari** at build time. Each `data/sayari/<node>.json` has `"source": "Sayari"` and `"retrieved_at"`.
  - **Wording:** a direct list match is shown as **"Flagged:"**. Anything reached through ownership, trade or network links is shown as **"Linked to:"**. Neither is a finding of wrongdoing. Uncertain entity matches say **"possible match"**.
  - **Summary fields only:** the page shows name, country, Sayari ID, state-owned, flags, top-3 counterparties and ultimate owner. Individual people are **not named**.
  - **Raw pulls stay private:** the full pulls, with analyst notes, live in `research/sayari_raw/`. That folder is git-ignored and never published.
  - **No Sayari access from the page:** no API keys and no live calls. The website only reads static JSON.
- **Method:** Simchi-Levi, Schmidt & Wei (2014), *From Superstorms to Factory Fires*, Harvard Business Review (TTR); Simchi-Levi et al. (2015), *Interfaces* (defines TTS).
- **Facts left out:** three claims could not be opened and checked (Strait Thunder-2025A drills, "EUV never shipped to China", DRC cobalt quota figures). They are kept in `research/facts.json` but are **not** shown in the game.

### Re-check soon

- **27 Nov 2026:** China's one-year suspension of its gallium/germanium export ban to the US expires. Check whether it was extended, and update `research/facts.json` → `gallium_ban_suspension`.
- Policy and conflict facts (export controls, DRC, Rubaya, Taiwan drills) have re-check dates about 6 months out; structural facts about 12 months out. All dates are listed in [SOURCES.md](SOURCES.md).

### Rebuilding the data

```
python3 scripts/build_sayari.py   # research/sayari_raw/*.json → data/sayari/*.json (summary only)
python3 scripts/merge_facts.py    # research/facts.json → data/game.json "facts" + SOURCES.md
```

### Before sharing widely

Check **Sayari's terms of use** for public display of its data. The site shows summary fields only by default. If the terms don't allow public display, delete `data/sayari/` and the containers will say "No Sayari data loaded".

---

## 10-minute presenter script

| Time | Screen | Say / do |
|---|---|---|
| **0:00–1:00** | Step 1 | "Normal stress tests ask *what if*. We start from the failure: **no AI chip ships**. Your job: break this chain with the **fewest** cards." Point at TTS on the containers ("weeks of inventory"). |
| **1:00–4:00** | Step 1 | Let the class call out cards. Read the countdown ("weeks until the line stops"). Most single cards *don't* choke it. That's the lesson: inventory buys time. When the **CHOKED** stamp lands, ask: "Was that the smallest set?" Reveal **par = 1** (Taiwan, or China's licences). Click a container (e.g. Solar) to show the real flagged companies. |
| **4:00–7:00** | Step 2 (press `2`) | "You have **$10M**." Let them buy fixes. Point out the cheap ones: the Myanmar stockpile is $1M, the conflict-free audit $2M. Press **Replay**. Green = absorbed, red = still chokes. "No affordable fix stops the Taiwan card. Some chokepoints can't be bought away." |
| **7:00–9:30** | Step 3 (press `3`) | Read both meters aloud. Read the red receipts' "who pays" lines. Ask: "Who here would sign off on the Myanmar stockpile? What would you tell the board?" |
| **9:30–10:00** | Step 3 | Point at the closing line: **"Who pays for your resilience?"** Let it sit for 10 seconds. Press `R` to reset for the next group. |

The same script is in the collapsible **Presenter script** box on each screen.

---

## Running it locally

Browsers block reading JSON from `file://`, so serve the folder:

```
cd chokepoint
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

```
index.html          page shell
css/style.css       "Port Authority / shipping manifest" design
js/model.js         game logic (TTS/TTR, par, resilience, ethics), no DOM
js/app.js           rendering and interaction
data/game.json      ALL game numbers, text and facts. Edit this.
data/sayari/        Sayari summary data per node + index.json
scripts/            offline build scripts (Python 3, no dependencies)
SOURCES.md          every fact, source and re-check date
```

Fonts: Big Shoulders Stencil Display, Archivo, Space Mono, Libre Barcode 128 Text (Google Fonts). No frameworks, no build step, no tracking.
