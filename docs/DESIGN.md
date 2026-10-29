# Ur — Design Document

Status: draft v0.1 · 2026-10-29

## 1. Pitch

Ur is a turn-based, hex-map civilization builder played in the browser. Found cities on river plains,
grow them into an empire, and outlast rivals through expansion, production and war. Genre lineage:
the 4X ("explore, expand, exploit, exterminate") strategy game, with Civ 5's one-unit-per-tile hex
combat as the main touchstone for feel.

Ur's first point of difference: **people are the resource.** There are no settler units and no
fixed cities. Settlements grow from camps into cities by sustaining population over time, and people
move — sent out as migrants, or drifting on their own toward better-run places, including across
civilization borders. Further differences from Civ are expected to accumulate as the design
develops; none of them is load-bearing alone.

## 2. Pillars

1. **Every turn has a meaningful decision, and the turn is short.** No busywork; automate what
   isn't a choice.
2. **The map is the story.** Rivers and terrain drive where settlements go and where wars happen.
3. **People over production.** Population is the scarce resource; growing tall and expanding wide
   draw from the same pool.
4. **Readable systems.** Every number on screen can be explained by a tooltip. No hidden modifiers.
5. **Original content.** Ur shares a genre, not content: its civilizations, leaders, tech names,
   art and rules text are its own.

## 3. Core loop

```
Turn start → yields collected (food, production, gold, science)
  → player: move units, set settlement production, pick research, choose settlement projects
  → end turn → AI turns → world events (floods, border growth) → next turn
```

Session goal for the prototype: a full game on a small map in **60–90 minutes**.

## 4. Systems

### 4.1 Scale

Ur's tiles cover **less ground than Civ's**. Working ratio: one Civ-sized hex ≈ one Ur hex plus
its ring (7 Ur hexes, ~2.6× finer linearly). A tile is a few fields, a hill, a stretch of river —
not a whole district. Consequences, all first guesses for tuning:

- **Settlements occupy space.** Footprint grows with tier (§4.5): a City sprawls across several
  urban tiles, visibly replacing farmland.
- **Distances scale up.** Work radii, settlement spacing, unit moves and ranged ranges are roughly
  2× Civ's.
- **The world is a region, not a continent.** Same map tile count budget buys a smaller area: a
  few river valleys and the land between them.
- **Terrain reads at human scale.** Single hills, fords, groves and marsh patches matter for
  movement and battle; armies span several tiles, so formations and frontage emerge.
- **Risk: busywork.** More tiles means more improvements. There are no worker units: worked
  tiles auto-develop and other improvements are settlement projects (§4.10).
- **Risk: performance.** ~4× the tiles of an equivalent Civ map. Rendering is chunked and culled;
  AI site scoring samples candidates instead of scanning every tile.

### 4.2 Map

- Hex grid, pointy-top, axial coordinates. Prototype size: **80×52** (~4,200 tiles), no wrap —
  roughly a 30×20 Civ-equivalent region.
- Terrain: grassland, plains, desert, tundra, coast, ocean, plus features: hills, forest, marsh,
  mountains (impassable).
- Rivers run along hex **edges** (affects crossing penalties and fresh-water adjacency).
- Procedural generation from a seed: noise-based elevation and moisture → terrain; rivers traced
  downhill from highlands to coast.
- Fog of war: unexplored (black), explored (last-seen state), visible.

### 4.3 Yields

| Yield      | Used for                                  |
|------------|-------------------------------------------|
| Food       | Settlement growth                         |
| Production | Units, buildings, wonders                 |
| Gold       | Upkeep, buying items, rush-buying         |
| Science    | Research                                  |
| Culture    | Border expansion (prototype: no policies) |

Each tile has a base yield from terrain + feature + improvement + resource. A settlement works its
footprint tiles plus **two tiles per population point** (finer tiles, so each person works more of
them); tile assignment is automatic by default with manual override.

### 4.4 Fresh water

Tiles adjacent to a river or lake have fresh water. Farms need it for their full bonus. (Floods and
canals are parked in §10.)

### 4.5 Settlements

Settlements replace fixed cities. They climb a tier ladder by **sustaining** population.

| Tier    | Pop to reach | Footprint (tiles) | Work radius | Building slots | Unlocks                      |
|---------|--------------|-------------------|-------------|----------------|------------------------------|
| Camp    | 1            | 1                 | 2           | 0              | Migrants, Scout              |
| Village | 3            | 1                 | 3           | 2              | Military units, borders grow |
| Town    | 6            | 3                 | 4           | 4              | Walls, ranged attack         |
| City    | 10           | 7                 | 5           | 6              | Wonders, advanced units      |

Footprint tiles are urban: they yield production and gold, not food, and expand automatically onto
the best adjacent tiles on tier-up. Buildings live in footprint tiles.

Numbers are first guesses for tuning.

- **Upgrade**: hold population ≥ the next tier's threshold for **N turns** (proposed 8). A progress
  bar shows the count.
- **Downgrade**: below the current tier's threshold for N turns, the settlement drops a tier.
  The gap between rules prevents flicker.
- Population grows when stored food reaches a threshold (`15 + 6·(pop-1) + (pop-1)^1.6`, tuned
  later). Each person eats 2 food.
- Minimum 6 tiles between settlements.
- Borders start at radius 2 (Village+); culture buys new tiles one at a time, preferring high-yield
  ones.
- One production item at a time.
- Settlements have HP; Town+ with walls has a ranged attack. Captured at 0 HP by a melee unit.

### 4.6 Migration

Population moves. Two channels:

1. **Migrants (directed).** A unit built by removing 1–2 population from a settlement. Founds a
   Camp on an empty site or joins an existing settlement of its civilization. Replaces the
   classic settler. Every migrant sent delays the home settlement's next tier: wide vs tall is one
   decision.
2. **Drift (automatic).** Each turn people may move from a settlement to a more **attractive** one
   nearby, **regardless of owner**.
   - Attractiveness = f(food surplus, stability, safety, crowding, amenities).
   - Dampers: pull decays with distance; capped flow per settlement per turn; crowding lowers
     attractiveness; a home-attachment bias resists leaving.
   - Player levers, not micromanagement: per-settlement *encourage / restrict* emigration, and
     per-neighbour *open / closed* borders (closing costs stability).
   - War displaces people: settlements under siege or recently captured shed refugees.
   - Every movement is logged with a reason ("2 people left Eridu for Kish: famine").

Cross-civilization drift is soft power: a well-run empire grows by absorbing its rivals' people;
a badly-run one bleeds them. Later layer (not prototype): migrants keep an origin identity until
integrated; a majority-foreign settlement can defect.

### 4.7 Units

One military unit and one civilian unit per tile; at Ur's scale a unit is a company, not an army,
so a real force spans several tiles. Movement points; terrain costs (hills/forest/marsh = 2, river
crossing ends movement except at fords). Zone of control: entering a tile adjacent to an enemy
costs all remaining moves.

Prototype roster:

| Unit      | Role     | Str | Ranged | Moves | Unlock      |
|-----------|----------|-----|--------|-------|-------------|
| Migrants  | Civilian | –   | –      | 4     | start       |
| Scout     | Recon    | 4   | –      | 6     | start       |
| Warrior   | Melee    | 8   | –      | 4     | start       |
| Slinger   | Ranged   | 5   | 7 (r3) | 4     | Hunting     |
| Spearman  | Melee    | 11  | –      | 4     | Bronze      |
| Chariot   | Mounted  | 12  | –      | 8     | Wheel       |
| Bowman    | Ranged   | 7   | 10 (r4)| 4     | Archery     |

### 4.8 Combat

- Units have 100 HP. Damage dealt scales with the strength ratio:
  `damage = 30 · exp(0.04 · (attackerStr − defenderStr)) · rand(0.8, 1.2)`, clamped to [1, 100].
- Modifiers: terrain defense (hills/forest +25%), river attack penalty (−20%), flanking (+10% per
  adjacent friendly unit), wounded penalty (strength scales down with HP).
- Melee: both sides take damage; attacker moves in if defender dies. Ranged: no retaliation.
- Healing: +10 HP/turn in field, +20 in friendly territory, +25 in a settlement, only if unit didn't act.
- Combat preview tooltip shows expected damage both ways before committing.

### 4.9 Technology

A small DAG (~13 techs) for the prototype. Names are Ur's own:

```
Foraging ─┬─ Hunting ── Archery
          ├─ Herding ── Wheel
          └─ Tilling ─┬─ Irrigation
                      └─ Pottery ── Writing ── Mathematics
Stoneworking ── Masonry ── Bronze ── Ironworking
```

Each tech unlocks units, buildings or improvements. Cost grows with tech count.

### 4.10 Buildings & improvements

Buildings (prototype): Granary, Shrine, Barracks, Walls, Workshop, Library, Market, Ziggurat
(national wonder, capital only). Each takes a building slot (§4.5).

Improvements: Farm, Mine, Pasture, Lumber Camp, Road. There is **no worker unit**: in Civ the
worker matters for a few early turns and is then automated or ignored, and at Ur's finer scale it
would be pure busywork. Improvements come from settlements instead:

- **Auto-development**: a worked flat tile becomes a Farm, and a worked pasture-resource tile a
  Pasture, after a few turns of being worked.
- **Projects**: Mine, Lumber Camp, Road and Repair are items in a settlement's production list,
  targeted at a tile within its borders. They cost production, and while one runs it takes
  **1 population off tile work** as labour — improving land competes with food, growth and
  migrants (pillar 3). A project can also rush an auto-development.
- **Auto-roads**: settlements in the same civilization slowly connect along the cheapest route.
  Road projects aim a road somewhere specific.
- **Pillage**: military units pillage enemy improvements; repair is a cheap project.

Resources (prototype): Wheat, Cattle, Stone, Copper, Horses. Copper and Horses gate Spearman and
Chariot respectively (strategic resources, simple yes/no gating in prototype).

### 4.11 Economy & stability

- Gold: from tiles, markets, and a flat per-settlement amount. Spent on unit/building upkeep and
  rush-buying.
- **Stability** (simplified happiness): empire-wide number. Each settlement and each population
  point costs stability; luxury resources and shrines add it. Negative stability slows growth and
  production and lowers attractiveness, so people emigrate. One number, one tooltip.

### 4.12 AI

- Prototype: 2–3 rule-based opponents.
- Priorities by weighted scoring: expand (send migrants to best scored site), defend (garrison
  threatened settlements), attack (target weakest adjacent rival when military ratio > 1.5),
  tier up (hold population when a settlement is close to its next tier).
- Migration levers and border policy set from simple rules (close borders when net outflow to a
  neighbour exceeds a threshold).
- Same rules and information as the player (respects fog of war). No cheating bonuses except an
  optional difficulty yield multiplier.

### 4.13 Victory

- **Conquest**: control every original capital.
- **Score**: highest score at turn 150 (population, techs, territory, wonders).

### 4.14 Diplomacy

Prototype: war/peace state and open/closed borders per neighbour. Declare war, propose peace
(AI accepts based on war score).

## 5. Interface

- Full-window map canvas with pan (drag), zoom (wheel/pinch), and keyboard shortcuts.
- Top bar: yields per turn, stability, current research, turn number, End Turn button.
- Right panel: selected unit or settlement detail.
- Settlement screen: tier progress, tile yield overlay, worked tiles, production picker,
  building slots, migration levers.
- Migration log and a map overlay showing net flows between settlements.
- Tech tree screen.
- Hover tooltips on everything that has a number.
- Unit action bar: move, attack, fortify, sleep, skip, pillage, found camp.
- Project targeting: pick a project, then a tile on the map (valid tiles highlighted).
- Flat colour only — no gradients. Hex art is flat-shaded vector shapes in the prototype.

## 6. Technical architecture

```
src/
  core/      pure, deterministic game simulation (no DOM). State + actions → new state.
  ai/        AI players; consume the same action API as the UI.
  mapgen/    seeded procedural map generation.
  render/    canvas/WebGL map renderer (reads state, never mutates).
  ui/        panels, screens, input handling.
```

Principles:

- **Simulation is a pure library.** `applyAction(state, action) → state`. Every player action
  (human or AI) goes through it. This makes save/load, replays, undo, testing, and later
  multiplayer straightforward.
- **Determinism.** Seeded RNG stored in game state; no `Math.random()` in `core/`.
- **Serializable state.** Plain JSON objects; save = `JSON.stringify(state)` into IndexedDB.
- **Headless tests.** Simulation tested with Vitest, including full AI-vs-AI games as smoke tests.

Proposed stack (prefer existing libraries):

| Concern        | Choice                                   |
|----------------|------------------------------------------|
| Language/build | TypeScript, Vite                         |
| Map rendering  | PixiJS (WebGL, sprite batching, culling) |
| Hex math       | honeycomb-grid                           |
| Noise          | simplex-noise                            |
| Seeded RNG     | pure-rand                                |
| UI panels      | Svelte 5 over the canvas                 |
| Pathfinding    | A* over hex graph (small; own code or `ngraph.path`) |
| Storage        | idb-keyval (IndexedDB)                   |
| Tests          | Vitest                                   |

Deploy target: static site (e.g. Cloudflare Pages/Workers static assets). No server in prototype.

## 7. Prototype scope

Goal: **prove the core loop is fun** on one small map against AI, with settlement tiers and
migration in play.

### In scope

- Single player vs 2 AI, one map size, one difficulty.
- Everything in §4 at the listed prototype size.
- Save/load (one slot + autosave each turn).
- Flat vector placeholder art.

### Out of scope (later)

- Multiplayer, hotseat
- Religion, policies/culture trees, great people, trade routes, espionage
- City-states, barbarians
- Naval units and embarkation
- Eras beyond Iron Age, unit upgrades/promotions
- Detailed diplomacy (deals, alliances, trading)
- Sound, music, animation polish
- Map wrap, multiple map sizes/types
- Migrant identity and integration, settlement defection
- Everything in §10

### Success criteria

1. A full game plays to a victory without crashes or soft-locks.
2. Average turn (player + AI) resolves in under 1 s on a mid-range laptop at turn 150.
3. Playtesters make a settle/production/war decision they can explain on most turns.
4. Players can name a turn where they chose between sending migrants and holding population for
   a tier-up.
5. Cross-civilization drift changes population noticeably in at least some games without one civ
   draining all others (or dampers are retuned).

## 8. Milestones

See [CHECKLIST.md](CHECKLIST.md) for the tracked task list.

| # | Milestone              | Outcome                                                        |
|---|------------------------|----------------------------------------------------------------|
| 0 | Skeleton               | Vite + TS + Pixi + Svelte app, Vitest, CI-free local scripts   |
| 1 | Map                    | Seeded map gen, render, pan/zoom, hover tile info              |
| 2 | Units & movement       | Select, pathfind, move, fog of war, end turn                   |
| 3 | Settlements            | Found camp, yields, growth, tiers, production, borders         |
| 4 | Tech & improvements    | Research, auto-development, projects, resources                |
| 5 | Combat                 | Melee/ranged, preview, healing, settlement capture             |
| 6 | AI                     | Rule-based AI that expands and fights                          |
| 7 | Migration              | Migrants, drift, cross-civ flows, border policy, log           |
| 8 | Victory & save         | Conquest/score victory, save/load, end screen                  |
| 9 | Playtest & tune        | Balance pass against success criteria                          |

## 9. Open questions

1. UI framework: Svelte 5 vs. plain DOM vs. React? (Proposed: Svelte.)
2. Art direction: flat vector placeholders now — eventual style (flat illustrated, low-poly, pixel)?
3. Theme: Bronze Age Mesopotamia-flavoured setting, or ahistorical/fantasy civilizations?
4. Scale ratio: is ~2.6× finer than Civ (one Civ hex ≈ 7 Ur hexes) the right grain? Finer
   adds tactical texture and cost (tiles, busywork, AI time).
5. Turn limit and map size — is 150 turns on 80×52 the right length for 60–90 minutes?
6. Should migration (M7) move earlier, since tiers depend on population pressure?
7. Do auto-development and projects leave enough agency over tile improvement?

## 10. Idea backlog

Candidate differentiators, not committed:

- **Floods**: river tiles flood on a telegraphed schedule (+food, pillage unprotected
  improvements, levees protect). Would push people out and threaten tiers.
- **Canals**: extend fresh water inland; make new land attractive to migrants.
- **Migrant identity**: origin identity, integration over time, defection of majority-foreign
  settlements.
