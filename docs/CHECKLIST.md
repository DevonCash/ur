# Ur — Prototype Checklist

Tracks progress against [DESIGN.md](DESIGN.md) §8. Check items off as they land.

## M0 Skeleton
- [ ] Resolve open questions 1–3 in DESIGN.md
- [ ] Vite + TypeScript project, strict mode
- [ ] PixiJS canvas mounted full-window
- [ ] Svelte UI layer over canvas
- [ ] Vitest configured; `src/core` has no DOM imports (lint rule or test)
- [ ] Seeded RNG in game state

## M1 Map
- [ ] Hex grid model (axial coords, neighbours, distance)
- [ ] Noise elevation/moisture → terrain + features
- [ ] Rivers on hex edges, traced downhill
- [ ] Render terrain, features, rivers
- [ ] Pan, zoom, hover tooltip with tile yields
- [ ] Same seed → same map (test)

## M2 Units & movement
- [ ] Unit model, stacking rules (1 military + 1 civilian)
- [ ] A* pathfinding with terrain costs, river crossing, ZOC
- [ ] Select/move UI with path preview
- [ ] Fog of war (unexplored / explored / visible)
- [ ] Turn loop + End Turn

## M3 Cities
- [ ] Found city (settler), min-distance rule
- [ ] Tile yields, worked-tile auto-assignment + manual override
- [ ] Food storage and growth
- [ ] Production queue (single item), units + buildings
- [ ] Culture-driven border growth
- [ ] City screen

## M4 Tech & improvements
- [ ] Tech DAG data + research
- [ ] Tech tree screen
- [ ] Worker build actions: farm, mine, pasture, lumber camp, road
- [ ] Resources + strategic gating (copper, horses)
- [ ] Gold, upkeep, rush-buy
- [ ] Stability

## M5 Combat
- [ ] Damage formula + modifiers
- [ ] Melee and ranged attacks
- [ ] Combat preview tooltip
- [ ] Healing
- [ ] City HP, walls, city ranged attack, capture

## M6 AI
- [ ] Settle-site scoring + expansion
- [ ] Production and research choices
- [ ] Defend/attack behaviour
- [ ] War/peace decisions
- [ ] Headless AI-vs-AI full game test

## M7 Water
- [ ] Fresh-water adjacency + farm bonus
- [ ] Floods (telegraphed), pillage, levees
- [ ] Canals extend fresh water
- [ ] Toggle for playtesting with/without floods

## M8 Victory & save
- [ ] Conquest + score victory, end screen
- [ ] Save/load (IndexedDB) + autosave

## M9 Playtest & tune
- [ ] Turn time < 1 s at turn 150
- [ ] Balance pass
- [ ] Evaluate success criteria (DESIGN.md §7)
