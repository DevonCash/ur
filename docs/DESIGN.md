# Ur — Design Document

Status: draft v0.1 · 2026-10-29

## 1. Pitch

Ur is a turn-based, hex-map civilization builder played in the browser. Found cities on river plains,
grow them into an empire, and outlast rivals through expansion, production and war. Genre lineage:
the 4X ("explore, expand, exploit, exterminate") strategy game, with Civ 5's one-unit-per-tile hex
combat as the main touchstone for feel.

Ur's own identity: **water is the central resource.** Civilization begins on rivers. Floods feed
cities and wreck what isn't protected; canals carry fresh water inland and turn dry land fertile.
Where you settle and how you move water shapes your whole empire.

## 2. Pillars

1. **Every turn has a meaningful decision, and the turn is short.** No busywork; automate what
   isn't a choice.
2. **The map is the story.** Rivers, floods and terrain drive where cities go and where wars happen.
3. **Readable systems.** Every number on screen can be explained by a tooltip. No hidden modifiers.
4. **Original content.** Ur shares a genre, not content: its civilizations, leaders, tech names,
   art and rules text are its own.

## 3. Core loop

```
Turn start → yields collected (food, production, gold, science)
  → player: move units, set city production, pick research, build improvements
  → end turn → AI turns → world events (floods, border growth) → next turn
```

Session goal for the prototype: a full game on a small map in **60–90 minutes**.

## 4. Systems

### 4.1 Map

- Hex grid, pointy-top, axial coordinates. Prototype size: **40×26** (~1,000 tiles), no wrap.
- Terrain: grassland, plains, desert, tundra, coast, ocean, plus features: hills, forest, marsh,
  mountains (impassable).
- Rivers run along hex **edges** (affects crossing penalties and fresh-water adjacency).
- Procedural generation from a seed: noise-based elevation and moisture → terrain; rivers traced
  downhill from highlands to coast.
- Fog of war: unexplored (black), explored (last-seen state), visible.

### 4.2 Yields

| Yield      | Used for                                  |
|------------|-------------------------------------------|
| Food       | City growth                               |
| Production | Units, buildings, wonders                 |
| Gold       | Upkeep, buying items, rush-buying         |
| Science    | Research                                  |
| Culture    | Border expansion (prototype: no policies) |

Each tile has a base yield from terrain + feature + improvement + resource. A city works its center
tile plus one tile per population point; tile assignment is automatic by default with manual
override.

### 4.3 Water (signature mechanic)

- **Fresh water**: tiles adjacent to a river, lake or canal. Farms need fresh water for their full
  bonus; cities on fresh water grow faster.
- **Floods**: every N turns (seeded, telegraphed 3 turns ahead), river tiles flood. Flooded tiles
  get +1 food until the next flood but unprotected improvements on them are pillaged.
  A **levee** improvement protects a tile.
- **Canals**: a worker-built improvement that extends fresh water one tile from an existing water
  source; chains of canals reach inland. Canals cost gold upkeep.

Open question: is flooding fun or just a tax? Prototype it behind a toggle and playtest.

### 4.4 Cities

- Founded by Settlers. Minimum 3 tiles between cities.
- Population grows when stored food reaches a threshold (`15 + 6·(pop-1) + (pop-1)^1.6`, tuned later).
- Each citizen eats 2 food.
- Borders start at radius 1; culture buys new tiles one at a time, preferring high-yield ones.
- One production queue item at a time (queue UI in a later phase).
- City has HP and a ranged attack once it has walls; captured at 0 HP by a melee unit.

### 4.5 Units

One military unit and one civilian unit per tile. Movement points; terrain costs (hills/forest/marsh
= 2, river crossing ends movement). Zone of control: entering a tile adjacent to an enemy costs all
remaining moves.

Prototype roster:

| Unit      | Role     | Str | Ranged | Moves | Unlock      |
|-----------|----------|-----|--------|-------|-------------|
| Settler   | Civilian | –   | –      | 2     | start       |
| Worker    | Civilian | –   | –      | 2     | start       |
| Scout     | Recon    | 4   | –      | 3     | start       |
| Warrior   | Melee    | 8   | –      | 2     | start       |
| Slinger   | Ranged   | 5   | 7 (r2) | 2     | Hunting     |
| Spearman  | Melee    | 11  | –      | 2     | Bronze      |
| Chariot   | Mounted  | 12  | –      | 4     | Wheel       |
| Bowman    | Ranged   | 7   | 10 (r2)| 2     | Archery     |

### 4.6 Combat

- Units have 100 HP. Damage dealt scales with the strength ratio:
  `damage = 30 · exp(0.04 · (attackerStr − defenderStr)) · rand(0.8, 1.2)`, clamped to [1, 100].
- Modifiers: terrain defense (hills/forest +25%), river attack penalty (−20%), flanking (+10% per
  adjacent friendly unit), wounded penalty (strength scales down with HP).
- Melee: both sides take damage; attacker moves in if defender dies. Ranged: no retaliation.
- Healing: +10 HP/turn in field, +20 in friendly territory, +25 in a city, only if unit didn't act.
- Combat preview tooltip shows expected damage both ways before committing.

### 4.7 Technology

A small DAG (~14 techs) for the prototype. Names are Ur's own:

```
Foraging ─┬─ Hunting ── Archery
          ├─ Herding ── Wheel
          └─ Tilling ─┬─ Irrigation ── Canals
                      └─ Pottery ── Writing ── Mathematics
Stoneworking ── Masonry ── Bronze ── Ironworking
```

Each tech unlocks units, buildings or improvements. Cost grows with tech count.

### 4.8 Buildings & improvements

Buildings (prototype): Granary, Shrine, Barracks, Walls, Workshop, Library, Market, Ziggurat
(national wonder, capital only).

Improvements: Farm, Mine, Pasture, Lumber Camp, Road, Levee, Canal.

Resources (prototype): Wheat, Cattle, Stone, Copper, Horses. Copper and Horses gate Spearman and
Chariot respectively (strategic resources, simple yes/no gating in prototype).

### 4.9 Economy & stability

- Gold: from tiles, markets, and a flat per-city amount. Spent on unit/building upkeep and
  rush-buying.
- **Stability** (simplified happiness): empire-wide number. Each city and each population point
  costs stability; luxury resources and shrines add it. Negative stability slows growth and
  production. One number, one tooltip.

### 4.10 AI

- Prototype: 2–3 rule-based opponents.
- Priorities by weighted scoring: expand (settle best scored site), defend (garrison threatened
  cities), attack (target weakest adjacent rival when military ratio > 1.5).
- Same rules and information as the player (respects fog of war). No cheating bonuses except an
  optional difficulty yield multiplier.

### 4.11 Victory

- **Conquest**: control every original capital.
- **Score**: highest score at turn 150 (population, techs, territory, wonders).

### 4.12 Diplomacy

Prototype: war/peace state only. Declare war, propose peace (AI accepts based on war score).

## 5. Interface

- Full-window map canvas with pan (drag), zoom (wheel/pinch), and keyboard shortcuts.
- Top bar: yields per turn, stability, current research, turn number, End Turn button.
- Right panel: selected unit or city detail.
- City screen: tile yield overlay, worked tiles, production picker, building list.
- Tech tree screen.
- Hover tooltips on everything that has a number.
- Unit action bar: move, attack, fortify, sleep, skip, build improvement, found city.
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

Goal: **prove the core loop is fun** on one small map against AI, with the water mechanic in play.

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

### Success criteria

1. A full game plays to a victory without crashes or soft-locks.
2. Average turn (player + AI) resolves in under 1 s on a mid-range laptop at turn 150.
3. Playtesters make a settle/production/war decision they can explain on most turns.
4. Floods/canals change at least one settling decision per game (or the mechanic is cut/reworked).

## 8. Milestones

See [CHECKLIST.md](CHECKLIST.md) for the tracked task list.

| # | Milestone              | Outcome                                                        |
|---|------------------------|----------------------------------------------------------------|
| 0 | Skeleton               | Vite + TS + Pixi + Svelte app, Vitest, CI-free local scripts   |
| 1 | Map                    | Seeded map gen, render, pan/zoom, hover tile info              |
| 2 | Units & movement       | Select, pathfind, move, fog of war, end turn                   |
| 3 | Cities                 | Found city, yields, growth, production, borders                |
| 4 | Tech & improvements    | Research, workers, improvements, resources                     |
| 5 | Combat                 | Melee/ranged, preview, healing, city capture                   |
| 6 | AI                     | Rule-based AI that expands and fights                          |
| 7 | Water                  | Fresh water, floods, levees, canals                            |
| 8 | Victory & save         | Conquest/score victory, save/load, end screen                  |
| 9 | Playtest & tune        | Balance pass against success criteria                          |

## 9. Open questions

1. UI framework: Svelte 5 vs. plain DOM vs. React? (Proposed: Svelte.)
2. Art direction: flat vector placeholders now — eventual style (flat illustrated, low-poly, pixel)?
3. Theme: Bronze Age Mesopotamia-flavoured setting, or ahistorical/fantasy civilizations?
4. Should flooding ship in milestone 3 (part of the core) or stay at milestone 7 as an experiment?
5. Turn limit and map size — is 150 turns on 40×26 the right length for 60–90 minutes?
