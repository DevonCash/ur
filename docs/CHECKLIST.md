# Ur — Prototype Checklist

Tracks progress against [DESIGN.md](DESIGN.md) §19. Section references (§) point into DESIGN.md.
Check items off as they land.

## M0 Skeleton
- [x] Open question 1 decided (Svelte 5); 2–3 left to playtesting (§20)
- [x] Vite + TypeScript project, strict mode
- [x] PixiJS canvas mounted full-window
- [x] Svelte UI layer over canvas
- [x] Vitest configured; `src/core` has no DOM imports (lint rule or test)
- [x] Seeded RNG in game state

## M1 Map (§5)
- [x] Hex grid model (axial coords, neighbours, distance)
- [x] Terrain/feature data table: yields, travel cost, defence (§5.2)
- [x] Noise elevation/moisture → terrain + features
- [x] Rivers on hex edges, traced downhill; fords (§5.3)
- [x] Resource placement (§5.4); start positions (§5.5)
- [x] Render terrain, features, rivers, resources
- [x] Pan, zoom, hover tooltip with tile yields
- [ ] Chunked/culled rendering: 80×52 map at 60 fps (single-layer Graphics now; not yet measured)
- [x] Same seed → same map (test)

## M2 Units & movement (§9.1, §5.6)
- [x] Unit model, stacking rules (1 military + 1 civilian)
- [x] Units cost a person; home settlement, food upkeep, disband/rehome (§9.3)
- [x] Recruit pools: cap, refill by tier (§9.3)
- [x] Garrison counts toward tier thresholds (§7.3)
- [x] Pathfinding with travel costs, river crossings, fords, ZOC
- [x] Select/move UI with path preview
- [x] Vision rules + fog of war (unexplored / explored / visible)
- [x] Turn loop in §4 order + End Turn

## M3 Settlements (§7)
- [x] Migrants unit: carries 1–2 people, found camp, join settlement; founding rules (§7.1, §10.1)
- [x] Food, growth threshold, starvation, abandonment (§7.2)
- [x] Tier ladder: upgrade/downgrade counters with progress bars (§7.3)
- [x] Footprint: urban tile yields, growth/shrink on tier change (§7.4)
- [x] Reach: Dijkstra over travel costs, overlap resolution, recompute on change (§7.5)
- [x] Worked tiles: 2 per person, auto-assignment, tile locks (§7.6)
- [x] Territory from reach + culture claims (§7.7)
- [x] Production, overflow, rush-buy (§7.8)
- [x] Buildings, slots, dormancy on downgrade (§7.9)
- [x] Hinterland: hub attachment, food deliveries, cut by enemy units (§7.11)
- [x] Settlement screen

## M4 Tech & improvements (§8, §11, §13)
- [x] Tech data + research
- [x] Tech tree screen
- [x] Fresh water + Farm/Irrigation bonus
- [x] Auto-development of worked tiles (farm, pasture)
- [x] Projects: mine, lumber camp, road, repair, rush development; tile targeting UI
- [x] Project labour: running project removes 1 person from tile work
- [x] Roads + auto-roads
- [x] Strategic gating (Copper, Horses) and luxuries (Dates, Lapis)
- [x] Gold income, building upkeep, bankruptcy penalty
- [x] Stability formula + bands, top-bar tooltip

## M5 Combat & diplomacy (§9.5–9.8, §7.10, §12)
- [x] Effective strength, modifiers, damage formula
- [x] Melee and ranged attacks; civilian capture
- [x] Combat preview tooltip
- [x] Fortify, healing
- [x] Pillage
- [x] Settlement HP, walls, ranged attack, capture consequences
- [x] Siege: encirclement check, starvation, surrender (§7.10)
- [x] XP, ranks, upgrade lines (§9.7)
- [x] Prisoners: capture, holding, ransom/release/settle, peace exchange (§9.8)
- [x] War/peace states, territory entry rule, war score, diplomacy panel

## M6 AI (§14)
- [x] Settle-site scoring (sampled) + expansion
- [x] Hold-for-tier rule; army-share target; production and research choices
- [x] Defend/attack behaviour
- [x] War/peace and border-policy decisions
- [x] Upgrades, siege behaviour, prisoner handling
- [x] Headless AI-vs-AI full game test

## M7 Migration (§10)
- [x] Attractiveness score (§10.2)
- [x] Drift: pull formula, probability, one-per-round cap (§10.3)
- [x] Cross-civ drift + open/closed borders
- [x] Encourage/restrict emigration levers
- [x] Refugees from sieges/capture (§10.4)
- [x] Migration log + flow overlay

## M8 Victory & save (§15)
- [x] Conquest, elimination, score victory, end screen
- [x] Save/load (IndexedDB) + autosave

## M9 Playtest & tune
- [x] Turn time < 1 s at turn 150 (headless: ~20 ms per round for 3 AI civs)
- [ ] Balance pass
- [ ] Evaluate success criteria (§18)
