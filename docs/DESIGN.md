# Ur — Design Document

Status: draft v0.3 · 2026-10-29 · prototype built (see README)

All numbers in this document are first-pass values, set to be tuned in playtesting (milestone 9).
The rules they belong to are the design; the numbers are not.

## 1. Overview

Ur is a turn-based strategy game about growing a civilization, played in the browser on a hex map.
Each player starts with a band of people, a warrior and a scout. They found settlements, grow them
from camps into cities, research technologies, build up the land around them, and compete with
rival civilizations through expansion, the pull of a well-run society, and war. A game ends when
one civilization holds every rival capital or when the turn limit is reached.

The central resource is **people**, and the game is about how you allocate them. Population works
the land, fills the ranks of every military unit, founds new settlements, and moves between settlements, including between civilizations, toward
whichever places offer the better life. A settlement's size and status depend on keeping people.

## 2. Pillars

1. **Every turn has a meaningful decision, and the turn is short.** No busywork; automate what
   isn't a choice.
2. **People are the scarce resource.** Growing a settlement, expanding to new land and fielding
   an army all draw on the same population.

## 3. Scale

- A **tile** is about 1.5 km across: a few fields, a single hill, a stretch of river, a grove.
- A **person** (one population point) is a group of a few hundred people.
- A **military unit** is a company. A real army is several units occupying several tiles, so
  frontage and formation matter.
- A **map** covers a region: a few river valleys and the land between them.

## 4. Turn structure

Turns are sequential: the human player, then each AI in a fixed order. A turn resolves in this order:

1. **Start of turn (per civilization)**
   1. Siege status is checked for each settlement (§7.10).
   2. Each settlement collects yields from its worked tiles and buildings.
   3. Food: unit upkeep and prisoners are fed; hinterland deliveries are made (§7.11); surplus is
      added to the settlement's food store; growth or starvation is applied.
   4. Production: added to the current item; completed items appear; overflow carries over.
   5. Science, gold and culture are added to the civilization's totals. Completed research applies.
      Culture claims border tiles (§7.7).
   6. Tier counters advance; tier changes apply (§7.3).
   7. Units heal (§9.6). Recruit pools refill (§9.3). Auto-development counters advance (§8.2).
      Auto-roads extend (§8.4).
2. **Player phase**: move units, attack, set production and projects, assign tiles, choose
   research, set migration and border policy, make diplomatic moves.
3. **End of round** (after every civilization has played): migration drift resolves (§10.3),
   refugees move, the turn counter advances.

## 5. Map

### 5.1 Grid

Pointy-top hexes in axial coordinates. Prototype map: **80×52** (~4,200 tiles), no wrap.

### 5.2 Terrain

Each tile has one base terrain and at most one feature. A feature replaces the base terrain's
yields, travel cost and defence.

| Terrain / feature | Food | Prod | Gold | Travel cost | Defence | Notes                        |
|-------------------|------|------|------|-------------|---------|------------------------------|
| Grassland         | 2    | 0    | 0    | 1           | 0%      |                              |
| Plains            | 1    | 1    | 0    | 1           | 0%      |                              |
| Desert            | 0    | 0    | 0    | 1           | 0%      |                              |
| Tundra            | 1    | 0    | 0    | 1           | 0%      |                              |
| Coast             | 1    | 0    | 1    | impassable  | –       | Workable (§7.5)              |
| Ocean             | 1    | 0    | 0    | impassable  | –       | Not workable in prototype    |
| Lake              | 2    | 0    | 1    | impassable  | –       | Workable; gives fresh water  |
| Hills (feature)   | 0    | 2    | 0    | 2           | +25%    | +1 vision when standing here |
| Forest (feature)  | 1    | 1    | 0    | 2           | +25%    |                              |
| Marsh (feature)   | 1    | 0    | 0    | 3           | −15%    |                              |
| Mountain          | –    | –    | –    | impassable  | –       | Blocks vision; not workable  |

### 5.3 Rivers and fresh water

- Rivers run along tile **edges**, from highlands to the coast or a lake.
- Crossing a river edge costs **+1 travel** unless the edge is a **ford** or the move follows a
  road (roads bridge rivers). Map generation marks about one river edge in eight as a ford.
- A melee attack across a river edge (ford or not) suffers −20% strength.
- A tile touching a river edge or adjacent to a lake has **fresh water** (used by farms, §8.1).

### 5.4 Resources

All resources are visible from the start.

| Resource | Found on               | Bonus when worked                  | Kind      | Effect                              |
|----------|------------------------|------------------------------------|-----------|-------------------------------------|
| Wheat    | Grassland, plains      | +1 food                            | Bonus     |                                     |
| Cattle   | Grassland              | +1 food, +1 prod with Pasture      | Bonus     |                                     |
| Stone    | Hills, desert          | +1 prod                            | Bonus     |                                     |
| Copper   | Hills                  | +1 prod with Mine                  | Strategic | Required to train Spearmen          |
| Horses   | Plains, grassland      | +1 prod with Pasture               | Strategic | Required to train Chariots          |
| Dates    | Desert with fresh water| +1 food, +1 gold                   | Luxury    | +3 stability per distinct luxury    |
| Lapis    | Hills                  | +2 gold with Mine                  | Luxury    | +3 stability per distinct luxury    |

A strategic resource counts for its civilization when at least one worked tile has it improved
(Copper needs a Mine, Horses a Pasture). A luxury counts when at least one tile of it is worked.

### 5.5 Generation

From a seed: noise-based elevation and moisture produce terrain and features; rivers are traced
downhill from high ground to coast or lake; fords are placed; resources are scattered by terrain
with minimum spacing; start positions are chosen on fresh-water grassland or plains at least 20
tiles apart. The same seed always produces the same map.

### 5.6 Visibility

Each civilization sees each tile in one of three states: **unexplored** (black), **explored**
(terrain and last-seen settlements shown, units hidden), **visible** (everything current).

- Units see 2 tiles; Scouts 3; +1 when standing on hills. Mountains block sight beyond them.
- Settlements see every tile in their territory plus 1.

## 6. Yields

| Yield      | Scope        | Used for                                                     |
|------------|--------------|--------------------------------------------------------------|
| Food       | Settlement   | Feeding people; surplus fills the food store for growth      |
| Production | Settlement   | Units, buildings, projects                                   |
| Gold       | Civilization | Upkeep, rush-buying                                          |
| Science    | Civilization | Research                                                     |
| Culture    | Settlement   | Claiming border tiles beyond reach                           |

- **Science** = 1 per person across the civilization, plus buildings.
- **Culture** = 1 per Village-or-larger settlement, plus buildings.
- **Gold** = urban tiles, worked coast/lake/luxury tiles, plus buildings.

## 7. Settlements

### 7.1 Founding

A Migrants unit (§10.1) founds a **Camp** on its tile, with population equal to the people it
carries. The tile must be land (not mountain), at least **6 tiles** from any other settlement's
centre, and not inside another civilization's territory. A civilization's first settlement is its
**capital**.

### 7.2 Population and food

- Each person **eats 1 food** per turn and **works 2 tiles**. Soldiers and prisoners eat 1 each
  at the settlement that feeds them. The settlement panel shows the full breakdown: food
  produced, minus people, soldiers and prisoners, minus losses to unrest and the hub's share.
- Surplus food fills the food store. When the store reaches the growth threshold, population
  grows by 1 and the store empties (Granary keeps 25%).
  Growth threshold: `15 + 6·(pop − 1) + (pop − 1)^1.6`, rounded down.
- A new settlement starts with 10 food in store.
- A food deficit drains the store. If the store is empty and the deficit continues, the settlement
  loses 1 person every 2 turns (every turn under siege). A settlement that reaches 0 people is abandoned and leaves ruins.

### 7.3 Tiers

Settlements climb a ladder of four tiers by **sustaining** population.

| Tier    | Population | Footprint | Reach budget | Building slots | Unlocks                                  |
|---------|------------|-----------|--------------|----------------|------------------------------------------|
| Camp    | 1          | 1 tile    | 2            | 0              | Migrants, Scout, Warrior, projects       |
| Village | 3          | 1 tile    | 3            | 2              | Slinger; produces culture                |
| Town    | 6          | 3 tiles   | 4            | 4              | Chariot; Walls give a ranged attack      |
| City    | 10         | 7 tiles   | 5            | 6              | National wonder                          |

- **Upgrade**: when population has been at or above the next tier's threshold for **8
  consecutive turns**, the settlement moves up. Any turn below the threshold resets the counter.
- **Downgrade**: when population has been below the current tier's threshold for **8 consecutive
  turns**, the settlement drops a tier. Camps never downgrade.
- **Stagnation**: while civilization stability is negative, upgrade counters do not advance.
- **Garrison**: military units inside their home settlement's footprint count toward its
  population for tier thresholds (not for tile work or food). An army in the field does not.
- The settlement panel shows both counters as progress bars.

### 7.4 Footprint

The footprint is the settlement's built-up area. Footprint tiles are **urban**:

- The **centre tile** yields 3 food, 1 production, 1 gold, plus any resource on it.
- Other urban tiles yield 0 food, 2 production, 1 gold, and lose any improvement.
- Footprint tiles are always worked and do not use people.

On upgrade the footprint grows onto adjacent land tiles, choosing those with the lowest food yield
(the town spreads onto poor land first). On downgrade the most recently added urban tiles revert
to their terrain.

### 7.5 Reach

A settlement can work tiles within its **reach**: every tile whose cheapest travel cost from any
footprint tile is within the tier's reach budget (§7.3). Travel cost is the same table units use
to move (§5.2, §5.3; roads 0.5, §8.4), so reach is an irregular shape that follows the land:
wide across plains, short into hills and marsh, stretched along roads, stopped by mountains.

- Water tiles (coast, lake) are in reach if adjacent to a land tile in reach.
- Where two settlements of the same civilization reach a tile, it belongs to the one that reaches
  it more cheaply. Between civilizations, the existing owner keeps it; unowned contested tiles go
  to the cheaper reach, ties to the older settlement.
- Reach is recomputed only when roads, footprint or tier change.

### 7.6 Working tiles

A settlement works its footprint plus **2 tiles per person**, chosen from tiles in its territory.
Assignment is automatic (maximise food until growth surplus ≥ 2 per person, then balance food and
production). The player can lock individual tiles. People assigned to a project (§8.3) work no
tiles.

### 7.7 Territory

A settlement's territory is every tile in its reach plus tiles claimed with culture. Villages and
larger produce culture; when a settlement's stored culture reaches `10 + 5·(tiles claimed so far)`
it claims one tile adjacent to its territory, preferring low travel cost and high yield. Claimed
tiles are workable. Territory blocks other civilizations from founding settlements and, in peace,
from entering with military units (§12).

### 7.8 Production

Each settlement builds one item at a time: a unit, a building, or a project. Overflow carries to
the next item. Any item except a project can be finished by **rush-buying** at
`3 gold × remaining production`.

### 7.9 Buildings

Each building takes one slot (§7.3). If a downgrade leaves more buildings than slots, the most
recent ones go dormant (no effect, no upkeep) until slots return.

| Building  | Cost | Upkeep | Tech         | Effect                                              |
|-----------|------|--------|--------------|-----------------------------------------------------|
| Shrine    | 40   | 1      | –            | +1 culture, +2 stability                            |
| Granary   | 50   | 1      | Pottery      | +2 food; 25% of food store kept on growth           |
| Barracks  | 60   | 1      | Bronze       | Units trained here start Seasoned; recruit pool refills 2 turns faster; units fortified here gain 1 XP per turn |
| Walls     | 60   | 1      | Masonry      | +100 settlement HP, +6 defence; Town+ ranged attack |
| Workshop  | 70   | 1      | Stoneworking | +2 production, +15% production                      |
| Library   | 70   | 1      | Writing      | +2 science, +25% science from this settlement       |
| Market    | 70   | 0      | Mathematics  | +2 gold, +25% gold from this settlement             |
| Ziggurat  | 150  | 2      | Mathematics, Masonry | National wonder; City in capital only. +3 culture, +3 stability, +2 science |

### 7.10 Defence and capture

- Settlement HP: 200 (+100 with Walls). Defence strength: `8 + 2·population` (+6 with Walls).
- Towns and Cities with Walls make one ranged attack per turn: strength equal to their defence,
  range 2.
- A settlement heals 20 HP per turn unless besieged.
- A settlement at 0 HP is captured when an enemy melee unit moves in. Ranged attacks cannot reduce
  a settlement below 1 HP.
- On capture: military units inside become prisoners of the captor (§9.8), 25% of its people
  (rounded down) flee as refugees (§10.4), it drops one tier (Camps are destroyed instead), and
  each building has a 50% chance to be destroyed.

**Siege.** A settlement is **besieged** when, at the start of its owner's turn, every land tile
adjacent to its footprint holds an enemy military unit or is adjacent to one (encircled by zone of
control). While besieged:

- It works only its footprint tiles. Its food deficit drains the food store; once the store is
  empty it loses 1 person per turn to starvation (every 2 turns with a Granary).
- It does not heal, its recruit pool does not refill, and hinterland deliveries to and from it
  stop. Its units outside the siege go unfed (§9.3).
- Each round it loses 1 person to refugees with 50% chance (§10.4).
- When its food store is empty and it has 2 or fewer people, it **surrenders** to the besieging
  civilization with the most adjacent units, and is captured as if assaulted.

Besiegers choose between assaulting (paying in casualties) and waiting (paying in time while the
defenders' people starve or flee).

### 7.11 Hinterland

Each Camp and Village is attached to the nearest own Town or City within 12 travel, its **hub**.
Each turn it sends half its food surplus (rounded down) to its hub's food store, provided a path
of 12 travel or less exists with no enemy military unit on it. Camps and Villages without a hub
keep everything. Cities grow on their hinterland, and raiding or cutting off the villages around a
city starves it. The settlement screen shows a hub's attached settlements and what each delivers.

## 8. Land improvement

There is no builder unit. Land is improved by settlements.

### 8.1 Improvements

| Improvement | Valid on                     | Effect                                   | Source              |
|-------------|------------------------------|------------------------------------------|---------------------|
| Farm        | Flat land                    | +1 food; +1 more with fresh water after Irrigation | Auto-development (Tilling) |
| Pasture     | Cattle, Horses               | +1 production; enables resource          | Auto-development (Herding) |
| Mine        | Hills                        | +1 production; enables Copper, Lapis     | Project (Stoneworking) |
| Lumber Camp | Forest                       | +1 production                            | Project (Stoneworking) |
| Road        | Any land                     | Travel cost 0.5; bridges rivers          | Project or auto-road (Wheel) |

### 8.2 Auto-development

A tile worked for **5 consecutive turns** gains its auto-development improvement (Farm or Pasture)
once the civilization knows the required tech. A project can complete one immediately.

### 8.3 Projects

Projects are production items aimed at one tile in the settlement's territory, chosen on the map.

| Project          | Cost             |
|------------------|------------------|
| Mine             | 25               |
| Lumber Camp      | 20               |
| Road             | 10 per tile      |
| Repair           | 10               |
| Rush development | 15               |

Projects cost production only, like buildings; every worked tile keeps its output during
construction, and the improvement's bonus is added to the tile when it completes.

### 8.4 Roads

- Roads cost 0.5 travel for both units and reach, and bridge rivers.
- **Auto-roads** (after Wheel): every 3 turns, each settlement extends one road tile toward its
  nearest same-civilization settlement within 15 travel, along the cheapest path, until connected.
- Road projects lay roads anywhere in territory, e.g. to extend reach to a distant valley.

### 8.5 Pillage

A military unit on an enemy improvement can spend its turn to pillage it: the improvement stops
working and the unit gains 10 gold. Repair is a project.

## 9. Units

### 9.1 Stacking and movement

- At most **one military and one civilian unit per tile**.
- Units spend movement points to enter tiles at the tile's travel cost. A unit with any movement
  left may enter a tile even if the cost exceeds what remains; this ends its move.
- **Zone of control**: entering a tile adjacent to an enemy military unit ends the unit's move.
- Land units cannot enter water.

### 9.2 Roster

| Unit      | Class    | People   | Obtained                    | Strength | Ranged (range) | Moves | Requires        |
|-----------|----------|----------|-----------------------------|----------|----------------|-------|-----------------|
| Migrants  | Civilian | 1–2      | Trained, 20 prod            | –        | –              | 4     | –               |
| Scout     | Recon    | 1        | Trained, 20 prod            | 4        | –              | 6     | –               |
| Warrior   | Melee    | 1        | Trained, 30 prod            | 8        | –              | 4     | –               |
| Slinger   | Ranged   | 1        | Trained, 35 prod            | 5        | 7 (3)          | 4     | Hunting         |
| Chariot   | Mounted  | 1        | Trained, 55 prod (Town+)    | 12       | –              | 8     | Wheel, Horses   |
| Spearman  | Melee    | 1 (kept) | Upgrade from Warrior, 40 g  | 11       | –              | 4     | Bronze, Copper  |
| Bowman    | Ranged   | 1 (kept) | Upgrade from Slinger, 30 g  | 7        | 10 (4)         | 4     | Archery         |
| Swordsman | Melee    | 1 (kept) | Upgrade from Spearman, 50 g | 15       | –              | 4     | Ironworking     |

Spearmen get +50% strength against Chariots.

Two upgrade lines, read left to right; each step needs a Seasoned-or-better unit (§9.7):

```
Warrior ──▶ Spearman ──▶ Swordsman
Slinger ──▶ Bowman
```

Only the first unit of each line is trained. A Spearman is the middle step: it is made by
upgrading a Warrior and can itself be upgraded to a Swordsman. An upgraded unit keeps its person.

### 9.3 Recruitment and upkeep

Every unit is made of people.

- Training a military unit or Scout takes **1 person** from the settlement when the unit is
  complete, in addition to its production cost. A settlement needs at least 2 people to train a
  unit; it cannot empty itself.
- It also takes **1 recruit** from the settlement's **recruit pool**: the people willing to take
  up arms. Pools cap and refill by tier, and do not refill while stability is negative or the
  settlement is besieged:

  | Tier    | Pool cap | Refills 1 every |
  |---------|----------|-----------------|
  | Camp    | 1        | 10 turns        |
  | Village | 2        | 8 turns         |
  | Town    | 3        | 6 turns         |
  | City    | 4        | 4 turns         |

  Pools start full. A Barracks refills 2 turns faster. Migrants do not use the pool.
- The settlement becomes the unit's **home**. Each unit costs its home **1 food per turn**
  (soldiers partly forage). If the home's food store is empty and it cannot pay, the unit loses
  10 HP per turn.
- A unit that dies loses its person. A unit destroyed by melee becomes a prisoner instead (§9.8).
- **Disbanding** a unit inside own territory returns its person to the nearest own settlement
  within 6 travel; elsewhere the person is lost.
- A unit can **rehome** to another own settlement it stands in.

### 9.4 Actions

Move, attack, fortify (+25% defence from the next turn until it moves), sleep, skip, pillage,
disband, rehome, upgrade.
Migrants: found camp, join settlement.

### 9.5 Combat

- Units have **100 HP**.
- Effective strength = base × (1 + sum of modifiers) × `(0.5 + 0.5·HP/100)`.
- Modifiers: terrain defence (§5.2), fortified +25%, attacking across a river −20%, flanking +10%
  per other friendly military unit adjacent to the defender (max +30%), rank (§9.7), Spearman
  vs Chariot +50%.
- With ratio `r = attacker / defender`:
  - Damage to defender: `30 · r^1.2 · rand(0.8, 1.2)`
  - Damage to attacker (melee only): `30 · r^−1.2 · rand(0.8, 1.2)`
  - Each clamped to [1, 100].
- **Melee**: both sides take damage; if the defender dies it is taken prisoner (§9.8) and the
  attacker moves into its tile. Attacking uses all remaining moves.
- **Ranged**: only the defender takes damage; needs the target within range and in sight. A unit
  killed by ranged attack is dead.
- A military unit entering a tile holding only enemy Migrants takes their people prisoner.
- The UI shows a combat preview (expected damage both ways) before the attack is confirmed.

### 9.6 Healing

A unit that neither moved nor attacked heals: +10 HP in neutral or enemy land, +15 in own
territory, +25 in an own settlement.

### 9.7 Experience and upgrades

- A unit gains **5 XP** for each combat it survives (attacking or defending) and 5 more for
  destroying the enemy unit.
- Ranks give a strength bonus:

  | Rank     | XP  | Strength |
  |----------|-----|----------|
  | Recruit  | 0   | +0%      |
  | Seasoned | 15  | +10%     |
  | Veteran  | 40  | +20%     |
  | Elite    | 80  | +30%     |

- A Seasoned-or-better unit in own territory can **upgrade** to the next unit in its line
  (Warrior → Spearman → Swordsman; Slinger → Bowman) by paying the gold cost in §9.2, if the
  civilization has the tech and resource. Upgrading uses the unit's turn and keeps its XP.
- Advanced units exist only through upgrades, so a veteran company is irreplaceable in the short
  term and losing one costs more than a person.

### 9.8 Prisoners

- A military unit destroyed by melee, a garrison in a captured settlement, and captured Migrants
  become **prisoners** of the captor: one per person. Each is held in the captor's settlement
  nearest to where it was taken.
- Prisoners work no tiles and eat 1 food per turn from their holding settlement. They do not count
  toward score or stability.
- For each prisoner the captor can:
  - **Ransom**: offer it to its civilization for 30 gold (+10 per rank above Recruit). If accepted,
    the person returns to its civilization's settlement nearest the holding settlement.
  - **Release**: return the person home for nothing.
  - **Settle**: after 10 turns in captivity, the prisoner joins the holding settlement's
    population.
- If the holding settlement is captured by, or surrenders to, the prisoner's own civilization, its
  prisoners go free and rejoin that civilization.
- When peace is made, all prisoners not yet settled are exchanged.

## 10. Migration

### 10.1 Migrants

- Built in any settlement with at least 2 people. Costs 20 production and **1 or 2 people**
  (player's choice), who leave the settlement when the unit is complete.
- Founds a Camp (§7.1) or joins an existing settlement of its civilization, adding its people.

### 10.2 Attractiveness

Each settlement has an attractiveness score:

```
attractiveness = 2 × (food surplus per person)
               + stability band modifier   (§11.3)
               + 1 per active building
               − 2 × max(0, population − next tier threshold)   (crowding)
               − 5 if an enemy military unit is within 3 tiles
               − 10 if besieged (§7.10)
```

### 10.3 Drift

At the end of each round, each settlement with at least 2 people compares itself with every
settlement within **12 travel**, of any civilization. For the best target:

```
pull = attractiveness(target) − attractiveness(home) − 0.5 × travel − attachment
```

If pull > 0, one person moves with probability `min(0.5, pull / 10)`. At most one person leaves a
settlement per round. `attachment` is 3 by default.

Player levers:

- Per settlement: **restrict emigration** (attachment 6) or **encourage emigration**
  (attachment 0).
- Per neighbouring civilization: **open or closed borders**. Closed borders block migration
  both ways and cost 2 stability per closed border.

Every move is logged with its cause, e.g. "1 person left Redbank for Two Fords: food".

### 10.4 Refugees

People displaced by capture or siege go to the nearest settlement of their civilization; if there
is none within 12 travel, to the most attractive settlement within 12 travel of any civilization
with open borders; otherwise they are lost. A besieged settlement loses 1 person to refugees with
50% chance each round.

## 11. Economy

### 11.1 Gold

Income from urban tiles, worked coast, lake and luxury tiles, Markets, pillaging and ransoms. Expenses are
building upkeep (§7.9). Units are paid for in people and food, not gold (§9.3). If the treasury
is empty and income is negative, every settlement's production is reduced by 25% until it
recovers.

### 11.2 Stability

One civilization-wide number:

```
stability = 5
          + 3 per distinct luxury
          + buildings (Shrine +2, Ziggurat +3)
          − 1 per settlement beyond the first
          − 1 per 4 people across the civilization, soldiers included (rounded down)
          − 2 per closed border
```

### 11.3 Stability bands

| Stability  | Effect                                                            |
|------------|-------------------------------------------------------------------|
| 0 or more  | No penalty; attractiveness +0                                     |
| −1 to −9   | Food surplus −50%; tier upgrades stall; attractiveness −2         |
| −10 or less| No growth; production −25%; tier upgrades stall; attractiveness −4|

The top bar shows stability with a tooltip listing every term.

## 12. Diplomacy

- Two states between civilizations: **peace** and **war**. Civilizations start at peace when they
  meet.
- At peace, military units cannot enter the other's territory; civilians can.
- A civilization can declare war after 10 turns of peace. Peace can be proposed after 10 turns of
  war; the AI accepts if its war score is negative or the war has lasted 20 turns with no
  settlement changing hands. War score = units destroyed + 5 × settlements captured, minus the
  same for the opponent.
- Border policy (open/closed) is set separately and governs migration only (§10.3).
- Making peace exchanges all unsettled prisoners (§9.8). Ransom offers can be made at any time.

## 13. Technology

Research produces one tech at a time from civilization-wide science. Every civilization starts
knowing Foraging.

| Tech         | Cost | Requires              | Unlocks                                         |
|--------------|------|-----------------------|-------------------------------------------------|
| Foraging     | –    | –                     | Start                                           |
| Hunting      | 20   | Foraging              | Slinger                                         |
| Herding      | 20   | Foraging              | Pasture                                         |
| Tilling      | 20   | Foraging              | Farm                                            |
| Stoneworking | 20   | –                     | Mine, Lumber Camp, Workshop                     |
| Archery      | 45   | Hunting               | Bowman (upgrade)                                |
| Wheel        | 45   | Herding               | Chariot, roads, auto-roads                      |
| Irrigation   | 45   | Tilling               | +1 food on Farms with fresh water               |
| Pottery      | 45   | Tilling               | Granary                                         |
| Masonry      | 45   | Stoneworking          | Walls                                           |
| Bronze       | 80   | Masonry               | Spearman (upgrade), Barracks                    |
| Writing      | 80   | Pottery               | Library                                         |
| Mathematics  | 130  | Writing               | Market; Ziggurat (with Masonry)                 |
| Ironworking  | 130  | Bronze                | Swordsman (upgrade)                             |

## 14. Players and AI

- Prototype: one human against 2 AI civilizations.
- Each civilization starts with 4 people: Migrants carrying 2, a Warrior and a Scout (homed to
  the first settlement once founded), 0 gold, and Foraging.
- AI chooses by weighted scoring each turn:
  - **Expand**: send Migrants to the best-scored site (food and production in prospective reach,
    fresh water, distance from rivals), sampled from candidates instead of every tile.
  - **Hold**: stop building Migrants or units in a settlement close to its next tier.
  - **Army size**: keep military people at a target share of population (10% at peace, 25% at
    war), recruiting from settlements furthest above their tier threshold.
  - **Defend**: garrison settlements with enemy units within 5 tiles.
  - **Attack**: declare war on the weakest neighbour when its military strength ratio is above 1.5.
  - **Policy**: close borders to a neighbour when net outflow to it exceeds 1 person per 5 turns.
  - **Upgrade**: upgrade the highest-XP eligible unit whenever gold allows.
  - **Siege**: encircle an enemy settlement when it has enough units nearby; assault when the
    settlement is at 0 HP or the expected losses are under 2 units, otherwise wait.
  - **Prisoners**: settle prisoners when the holding settlement can feed them; otherwise ransom.
    Accept ransom offers when affordable.
- The AI uses the same rules and sees only what its units and settlements see. Difficulty may
  apply a yield multiplier; no other bonuses.

## 15. Victory

- **Conquest**: a civilization controls every capital (§7.1). A civilization with no settlements
  and no Migrants is eliminated.
- **Score**: at the end of turn 150, highest score wins.

```
score = 4 × people (settlements and units)
      + tier points (Camp 1, Village 2, Town 4, City 8)
      + 5 × techs known
      + 0.5 × territory tiles
      + 20 for the Ziggurat
```

## 16. Interface

- Full-window map canvas with pan (drag), zoom (wheel/pinch), and keyboard shortcuts.
- Top bar: yields per turn, stability, current research, turn number, End Turn button.
- Right panel: selected unit or settlement.
- Settlement screen: tier progress bars, reach overlay, tile yields, worked and locked tiles,
  production list, building slots, migration lever.
- Project targeting: pick a project, then a tile on the map (valid tiles highlighted).
- Migration log and a map overlay of net flows between settlements.
- Diplomacy panel: war/peace and border policy per known civilization.
- Prisoner panel: held prisoners, turns until they can settle, ransom/release/settle actions;
  incoming ransom offers.
- Unit panel shows rank and XP; settlement panel shows recruit pool and siege status.
- Map shows hinterland links and encirclement around besieged settlements.
- Tech tree screen.
- Hover tooltips on everything that has a number.
- Unit action bar: the actions in §9.4.
- Flat colour only, no gradients. Prototype art is flat vector shapes.

## 17. Technical architecture

```
src/
  core/      pure, deterministic game simulation (no DOM). State + actions → new state.
  ai/        AI players; consume the same action API as the UI.
  mapgen/    seeded procedural map generation.
  render/    canvas/WebGL map renderer (reads state, never mutates).
  ui/        panels, screens, input handling.
```

Principles:

- **Simulation is a pure library.** `applyAction(state, action)` validates and applies every
  player action (human or AI), mutating the state in place for speed. With the seeded RNG in
  state, a seed plus the action log reproduces a game, which keeps save/load, replays, testing and
  later multiplayer straightforward.
- **Determinism.** Seeded RNG stored in game state; no `Math.random()` in `core/`.
- **Serializable state.** Plain JSON objects; save = `JSON.stringify(state)` into IndexedDB.
- **Headless tests.** Simulation tested with Vitest, including full AI-vs-AI games as smoke tests.
- **Performance.** Rendering is chunked and culled; reach is recomputed only on change; AI site
  scoring samples candidates.

Proposed stack (prefer existing libraries):

| Concern        | Choice                                   |
|----------------|------------------------------------------|
| Language/build | TypeScript, Vite                         |
| Map rendering  | PixiJS (WebGL, sprite batching, culling) |
| Hex math       | Own ~150-line module (axial + odd-r; neighbour table) |
| Noise          | simplex-noise                            |
| Seeded RNG     | Own mulberry32 (state is one number in game state) |
| UI panels      | Svelte 5 over the canvas                 |
| Pathfinding    | A*/Dijkstra, own code over `flatqueue`   |
| Pan/zoom       | pixi-viewport                            |
| Storage        | idb-keyval (IndexedDB)                   |
| Tests          | Vitest                                   |

Deploy target: static site (e.g. Cloudflare Workers static assets). No server in prototype.

## 18. Prototype scope

Goal: **prove the core loop is fun** on one map against AI, with settlement tiers, reach and
migration in play.

### In scope

- Everything in §§3–16 at the listed sizes.
- One human vs 2 AI, one map size, one difficulty.
- Save/load (one slot + autosave each turn).
- Flat vector placeholder art.

### Out of scope

See Appendix A for the full list of genre features Ur leaves out. Also out of the prototype:
sound and music, animation polish, multiple map sizes, migrant identity (§20).

### Success criteria

1. A full game plays to a victory without crashes or soft-locks.
2. Average turn (player + AI) resolves in under 1 s on a mid-range laptop at turn 150.
3. Playtesters make a settle/production/war decision they can explain on most turns.
4. Players can name a turn where they chose between sending Migrants and holding population for
   a tier-up.
5. Cross-civilization drift changes population noticeably in some games without one
   civilization draining all others.

## 19. Milestones

See [CHECKLIST.md](CHECKLIST.md) for the tracked task list.

| # | Milestone              | Outcome                                                        |
|---|------------------------|----------------------------------------------------------------|
| 0 | Skeleton               | Vite + TS + Pixi + Svelte app, Vitest, local scripts           |
| 1 | Map                    | Seeded map gen, render, pan/zoom, hover tile info              |
| 2 | Units & movement       | Select, pathfind, move, fog of war, end turn                   |
| 3 | Settlements            | Found camp, yields, growth, tiers, reach, production, borders  |
| 4 | Tech & improvements    | Research, auto-development, projects, resources                |
| 5 | Combat                 | Melee/ranged, preview, healing, settlement capture             |
| 6 | AI                     | Rule-based AI that expands and fights                          |
| 7 | Migration              | Drift, cross-civ flows, border policy, refugees, log           |
| 8 | Victory & save         | Conquest/score victory, save/load, end screen                  |
| 9 | Playtest & tune        | Balance pass against success criteria                          |

## 20. Open questions

These are answered by playtesting the prototype (milestone 9), except where noted.

1. ~~UI framework~~ — decided: Svelte 5 (prototype built with it).
2. Art direction: flat vector placeholders now; eventual style (flat illustrated, low-poly, pixel)?
3. Theme: Bronze Age Mesopotamia-flavoured setting, or invented civilizations?
4. Tile grain: is ~1.5 km per tile right, given the cost in tiles, AI time and screen density?
5. Turn limit and map size: is 150 turns on 80×52 the right length for 60–90 minutes?
6. Should migration drift (M7) move earlier, since tiers depend on population pressure?
7. Do auto-development and projects leave enough agency over land improvement?
8. Is the reach shape readable on screen, or does it need a simplified display?

## 21. Idea backlog

Not committed:

- **Floods**: river tiles flood on a telegraphed schedule (+food, pillage unprotected
  improvements, levees protect). Would push people out and threaten tiers.
- **Canals**: extend fresh water inland; make new land attractive to migrants.
- **Migrant identity**: people keep an origin identity until integrated; a majority-foreign
  settlement can defect.
- **Draft**: an action to train a unit when the recruit pool is empty by conscripting a working
  person. Candidate penalties: stability loss per drafted unit, attractiveness drop in that
  settlement (people emigrate), drafted units start below Recruit strength, and the pool's
  refill pauses.
- **Leader abilities**: each civilization's leader has one ability that bends a rule. First
  candidate: prisoners can be enlisted straight into the recruit pool of their holding
  settlement, instead of waiting 10 turns to settle.

## Appendix A. Lineage

Ur belongs to the 4X strategy genre. Its two references are Civilization V (map, settlements,
technology, tactical combat) and Mount & Blade II: Bannerlord (soldiers as recruited people,
prisoners, sieges, village economies). This appendix records exactly what Ur takes from each, what
it takes in changed form, and what it leaves out.

### Civilization V

#### Taken

- Turn-based play on a hex map; human player then AI players each turn.
- Tile yields from terrain, feature, improvement and resource; the five yields food, production,
  gold, science and culture.
- Rivers on tile edges; fresh water; attack penalty across rivers.
- Three-state fog of war.
- One military unit per tile, plus one civilian; movement points with terrain costs; roads;
  zone of control.
- Unit classes: recon, melee, ranged, mounted, civilian.
- Combat: 100 HP units; melee with retaliation, ranged without; damage from strength ratio with
  randomness; terrain defence, fortify, flanking and wounded penalties; location-based healing;
  combat preview.
- Settlements with HP and a ranged attack, captured by melee units.
- Population growth from a food store with rising thresholds; people working tiles with automatic
  assignment and manual override.
- Culture claiming border tiles one at a time.
- One production item at a time; rush-buying with gold.
- Buildings with yield effects; one national wonder.
- Strategic resources gating units; luxury resources feeding empire-wide contentment.
- A tech tree as a dependency graph; science from population.
- Gold economy with building upkeep.
- War and peace between civilizations; military units barred from foreign territory in peace.
- Conquest victory by capitals; score victory at a turn limit.
- AI bound by the same rules.

#### Taken in changed form

| Civilization V                      | Ur                                                                        |
|-------------------------------------|---------------------------------------------------------------------------|
| Cities of any size, fixed 1-tile    | Settlements in four tiers held by sustained population; multi-tile footprint |
| Fixed 3-tile working radius         | Reach measured in travel cost, growing with tier                          |
| Settler unit, built with production | Migrants, which cost people and can also join a settlement                |
| Military units cost production and gold upkeep | Every unit costs a person; upkeep is food from its home settlement |
| Worker unit builds improvements     | Auto-development of worked tiles; settlement projects paid in production |
| One citizen works one tile          | One person works two tiles at finer scale                                 |
| Happiness                           | Stability, which also drives migration and stalls tier upgrades           |
| Open borders allow unit passage     | Border policy controls migration; unit passage follows war/peace          |
| River crossing ends movement        | River crossing costs +1 travel; fords and roads cross freely              |
| Tiles at continental scale          | ~1.5 km tiles; units are companies; regional maps                         |
| Tech tree across all eras           | 14 techs, Bronze to Iron Age, original names                              |
| Experience, chosen promotions, upgrades for gold | Fixed rank bonuses; upgrades for gold; advanced units exist only by upgrade |

#### Left out

- Social policies, ideologies, and culture/tourism victory
- Religion, faith and pantheons
- Great people, great works, and great generals
- World wonders and natural wonders
- City-states
- Barbarians and ancient ruins
- Naval units, embarkation, harbours, and air units
- Trade routes, caravans, and city connections
- Espionage
- World Congress and diplomatic victory
- Science victory
- Promotion choices (perks)
- Golden ages
- Specialists and tile purchase with gold
- Puppet, annex and raze choices on capture
- Diplomatic deals, denunciation, friendship and research agreements
- Unique civilization units and buildings (leader abilities are in the backlog, §21)
- Eras beyond the Iron Age
- Multiple map types and sizes; map wrap
- Hotseat and multiplayer

### Mount & Blade II: Bannerlord

#### Taken

- Soldiers are recruited people drawn from settlements, from limited pools that refill over time.
- Troop upgrade lines: advanced soldiers come only from upgrading experienced ones.
- Prisoners taken in battle, then ransomed, released or absorbed.
- Sieges in which an encircled settlement's food runs down until it falls or surrenders.
- Villages supplying their town, so raiding the countryside weakens the city.

#### Taken in changed form

| Bannerlord                                         | Ur                                                                   |
|----------------------------------------------------|----------------------------------------------------------------------|
| Recruits offered by village and town notables, gated by relations | One pool per settlement, sized by tier, stalled by negative stability |
| Hundreds of individual troops in a party           | Each map unit is one company and one person; no rosters              |
| Prisoners recruited through a party's prison roster | Prisoners held in a settlement, settled as population after 10 turns |
| Sieges with siege engines and a real-time assault  | Encirclement by zone of control; assault through normal combat       |
| Villages produce goods sold in towns               | Camps and Villages send half their food surplus to a hub             |

#### Left out

- Parties as variable-size troop rosters
- Lords, clans, fiefs and kingdom politics
- Playing as a character; companions, renown and influence
- Real-time battles and siege engines
- Trade goods, caravans and workshops
- Equipment and smithing
- Marriage, tournaments and quests
- Bandits
