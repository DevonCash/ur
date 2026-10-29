# Ur — Prototype Checklist

Tracks progress against [DESIGN.md](DESIGN.md) §19. Section references (§) point into DESIGN.md.
Check items off as they land.

## M0 Skeleton
- [ ] Resolve open questions 1–3 (§20)
- [ ] Vite + TypeScript project, strict mode
- [ ] PixiJS canvas mounted full-window
- [ ] Svelte UI layer over canvas
- [ ] Vitest configured; `src/core` has no DOM imports (lint rule or test)
- [ ] Seeded RNG in game state

## M1 Map (§5)
- [ ] Hex grid model (axial coords, neighbours, distance)
- [ ] Terrain/feature data table: yields, travel cost, defence (§5.2)
- [ ] Noise elevation/moisture → terrain + features
- [ ] Rivers on hex edges, traced downhill; fords (§5.3)
- [ ] Resource placement (§5.4); start positions (§5.5)
- [ ] Render terrain, features, rivers, resources
- [ ] Pan, zoom, hover tooltip with tile yields
- [ ] Chunked/culled rendering: 80×52 map at 60 fps
- [ ] Same seed → same map (test)

## M2 Units & movement (§9.1, §5.6)
- [ ] Unit model, stacking rules (1 military + 1 civilian)
- [ ] Pathfinding with travel costs, river crossings, fords, ZOC
- [ ] Select/move UI with path preview
- [ ] Vision rules + fog of war (unexplored / explored / visible)
- [ ] Turn loop in §4 order + End Turn

## M3 Settlements (§7)
- [ ] Migrants unit: carries 1–2 people, found camp, join settlement; founding rules (§7.1, §10.1)
- [ ] Food, growth threshold, starvation, abandonment (§7.2)
- [ ] Tier ladder: upgrade/downgrade counters with progress bars (§7.3)
- [ ] Footprint: urban tile yields, growth/shrink on tier change (§7.4)
- [ ] Reach: Dijkstra over travel costs, overlap resolution, recompute on change (§7.5)
- [ ] Worked tiles: 2 per person, auto-assignment, tile locks (§7.6)
- [ ] Territory from reach + culture claims (§7.7)
- [ ] Production, overflow, rush-buy (§7.8)
- [ ] Buildings, slots, dormancy on downgrade (§7.9)
- [ ] Settlement screen

## M4 Tech & improvements (§8, §11, §13)
- [ ] Tech data + research
- [ ] Tech tree screen
- [ ] Fresh water + Farm/Irrigation bonus
- [ ] Auto-development of worked tiles (farm, pasture)
- [ ] Projects: mine, lumber camp, road, repair, rush development; tile targeting UI
- [ ] Project labour: running project removes 1 person from tile work
- [ ] Roads + auto-roads
- [ ] Strategic gating (Copper, Horses) and luxuries (Dates, Lapis)
- [ ] Gold income, unit/building upkeep, bankruptcy penalty
- [ ] Stability formula + bands, top-bar tooltip

## M5 Combat & diplomacy (§9.5–9.6, §7.10, §12)
- [ ] Effective strength, modifiers, damage formula
- [ ] Melee and ranged attacks; civilian capture
- [ ] Combat preview tooltip
- [ ] Fortify, healing
- [ ] Pillage
- [ ] Settlement HP, walls, ranged attack, capture consequences
- [ ] War/peace states, territory entry rule, war score, diplomacy panel

## M6 AI (§14)
- [ ] Settle-site scoring (sampled) + expansion
- [ ] Hold-for-tier rule; production and research choices
- [ ] Defend/attack behaviour
- [ ] War/peace and border-policy decisions
- [ ] Headless AI-vs-AI full game test

## M7 Migration (§10)
- [ ] Attractiveness score (§10.2)
- [ ] Drift: pull formula, probability, one-per-round cap (§10.3)
- [ ] Cross-civ drift + open/closed borders
- [ ] Encourage/restrict emigration levers
- [ ] Refugees from sieges/capture (§10.4)
- [ ] Migration log + flow overlay

## M8 Victory & save (§15)
- [ ] Conquest, elimination, score victory, end screen
- [ ] Save/load (IndexedDB) + autosave

## M9 Playtest & tune
- [ ] Turn time < 1 s at turn 150
- [ ] Balance pass
- [ ] Evaluate success criteria (§18)
