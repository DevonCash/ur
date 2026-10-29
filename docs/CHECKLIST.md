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
- [ ] Chunked/culled rendering: 80×52 map at 60 fps
- [ ] Same seed → same map (test)

## M2 Units & movement
- [ ] Unit model, stacking rules (1 military + 1 civilian)
- [ ] A* pathfinding with terrain costs, river crossing, ZOC
- [ ] Select/move UI with path preview
- [ ] Fog of war (unexplored / explored / visible)
- [ ] Turn loop + End Turn

## M3 Settlements
- [ ] Migrants unit: leave (costs pop), found camp, join settlement; min-distance rule
- [ ] Tier ladder: sustained-population upgrade/downgrade with progress bar
- [ ] Multi-tile footprint: urban tiles expand on tier-up
- [ ] Tile yields, worked-tile auto-assignment + manual override
- [ ] Food storage and growth
- [ ] Production queue (single item), units + buildings
- [ ] Culture-driven border growth
- [ ] Settlement screen

## M4 Tech & improvements
- [ ] Tech DAG data + research
- [ ] Tech tree screen
- [ ] Auto-development of worked tiles (farm, pasture)
- [ ] Settlement projects: mine, lumber camp, road, repair, rush; tile targeting UI
- [ ] Project labour: running project removes 1 pop from tile work
- [ ] Auto-roads between same-civ settlements
- [ ] Pillage action for military units
- [ ] Resources + strategic gating (copper, horses)
- [ ] Gold, upkeep, rush-buy
- [ ] Stability

## M5 Combat
- [ ] Damage formula + modifiers
- [ ] Melee and ranged attacks
- [ ] Combat preview tooltip
- [ ] Healing
- [ ] Settlement HP, walls, ranged attack, capture

## M6 AI
- [ ] Settle-site scoring + expansion
- [ ] Production and research choices
- [ ] Defend/attack behaviour
- [ ] War/peace decisions
- [ ] Headless AI-vs-AI full game test

## M7 Migration
- [ ] Fresh-water adjacency + farm bonus
- [ ] Attractiveness score + drift with dampers (distance, cap, crowding, attachment)
- [ ] Cross-civ drift + open/closed borders
- [ ] Encourage/restrict emigration levers
- [ ] Refugees from sieges/capture
- [ ] Migration log + flow overlay

## M8 Victory & save
- [ ] Conquest + score victory, end screen
- [ ] Save/load (IndexedDB) + autosave

## M9 Playtest & tune
- [ ] Turn time < 1 s at turn 150
- [ ] Balance pass
- [ ] Evaluate success criteria (DESIGN.md §7)
