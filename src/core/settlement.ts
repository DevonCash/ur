// Settlements: reach, territory, worked tiles, yields, footprint, tiers (DESIGN §7).
import {
  BUILDING, FOOD_PER_PERSON, PRISONER_FOOD, TERRAIN, TIER_FOOTPRINT, TIER_POOL_CAP, TIER_POP,
  TIER_REACH, TIER_SLOTS, TILES_PER_PERSON, UNIT_FOOD, SETTLEMENT_HP, WALLS_HP,
  type BuildingId, type Yields,
} from './data';
import { neighbour } from './hex';
import type { GameState, Settlement } from './types';
import {
  addYields, dijkstra, grid, isLand, isMilitary, isPassable, tileYields,
} from './world';

// Reach & territory --------------------------------------------------------------

/** Tile → travel cost for every tile in reach (land via Dijkstra, water adjacent to reached land). */
export function computeReach(s: GameState, st: Settlement): Map<number, number> {
  const land = dijkstra(s, st.footprint, { maxCost: TIER_REACH[st.tier] });
  const out = new Map(land);
  const g = grid(s);
  for (const [i, c] of land) {
    for (let d = 0; d < 6; d++) {
      const n = neighbour(g, i, d);
      if (n < 0 || out.has(n)) continue;
      const t = s.tiles[n];
      if (TERRAIN[t.terrain].water && TERRAIN[t.terrain].workable) out.set(n, c + 1);
    }
  }
  return out;
}

/**
 * Recompute tile ownership for all settlements. Rules (DESIGN §7.5, §7.7):
 * urban tiles belong to their settlement; within a civ the cheaper reach wins; between civs the
 * existing owner keeps a tile; unowned contested tiles go to the cheaper reach, ties to the older.
 */
export function recomputeTerritory(s: GameState): void {
  const reaches = new Map<number, Map<number, number>>();
  for (const st of s.settlements) reaches.set(st.id, computeReach(s, st));
  const byId = new Map(s.settlements.map((x) => [x.id, x]));
  const claimedBy = new Map<number, number>();
  for (const st of s.settlements) for (const t of st.claimed) claimedBy.set(t, st.id);

  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    if (t.urban >= 0 && byId.has(t.urban)) {
      t.owner = t.urban;
      continue;
    }
    t.urban = -1;
    let best = -1;
    let bestCost = Infinity;
    for (const st of s.settlements) {
      const c = reaches.get(st.id)!.get(i);
      if (c === undefined) continue;
      if (c < bestCost || (c === bestCost && best >= 0 && st.id < best)) {
        best = st.id;
        bestCost = c;
      }
    }
    const prev = byId.get(t.owner);
    const prevStillHas = prev && (reaches.get(prev.id)!.has(i) || prev.claimed.includes(i));
    if (prev && prevStillHas) {
      // existing owner keeps it against other civs; within a civ cheaper reach wins
      if (best >= 0) {
        const b = byId.get(best)!;
        if (b.civId === prev.civId && b.id !== prev.id && bestCost < (reaches.get(prev.id)!.get(i) ?? Infinity)) {
          t.owner = best;
        }
      }
      continue;
    }
    const claimer = claimedBy.get(i);
    if (claimer !== undefined && byId.has(claimer)) {
      t.owner = claimer;
      continue;
    }
    t.owner = best;
  }
}

export function territoryOf(s: GameState, st: Settlement): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].owner === st.id) out.push(i);
  return out;
}

// Population accounting -------------------------------------------------------------

export function unitsHomed(s: GameState, st: Settlement) {
  return s.units.filter((u) => u.home === st.id && u.civId === st.civId && isMilitary(u));
}

export function garrison(s: GameState, st: Settlement): number {
  return unitsHomed(s, st).filter((u) => st.footprint.includes(u.tile)).length;
}

export function prisonersHeld(s: GameState, st: Settlement): number {
  return s.prisoners.filter((p) => p.settlementId === st.id).length;
}

export function labour(st: Settlement): number {
  return st.production?.kind === 'project' ? 1 : 0;
}

export function activeBuildings(st: Settlement): BuildingId[] {
  return st.buildings.slice(0, TIER_SLOTS[st.tier]);
}

export function hasBuilding(st: Settlement, b: BuildingId): boolean {
  return activeBuildings(st).includes(b);
}

export function maxHp(st: Settlement): number {
  return SETTLEMENT_HP + (hasBuilding(st, 'walls') ? WALLS_HP : 0);
}

export function upkeepFood(s: GameState, st: Settlement): number {
  const fedUnits = unitsHomed(s, st).filter((u) => !st.besieged || st.footprint.includes(u.tile)).length;
  return st.pop * FOOD_PER_PERSON + fedUnits * UNIT_FOOD + prisonersHeld(s, st) * PRISONER_FOOD;
}

// Worked tiles ------------------------------------------------------------------------

export function workableTiles(s: GameState, st: Settlement): number[] {
  const out: number[] = [];
  const enemyOn = new Set(s.units.filter((u) => u.civId !== st.civId && isMilitary(u)).map((u) => u.tile));
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    if (t.owner !== st.id || t.urban >= 0) continue;
    if (!TERRAIN[t.terrain].workable) continue;
    if (enemyOn.has(i)) continue;
    if (st.besieged) continue;
    out.push(i);
  }
  return out;
}

export function workerSlots(st: Settlement): number {
  return Math.max(0, (st.pop - labour(st)) * TILES_PER_PERSON);
}

/** Lock-first, then food until surplus ≥ 2/person, then balanced (DESIGN §7.6). */
export function assignWorked(s: GameState, st: Settlement): void {
  const civ = s.civs[st.civId];
  const avail = workableTiles(s, st);
  const slots = workerSlots(st);
  const yields = new Map(avail.map((i) => [i, tileYields(s, i, civ)]));
  const chosen: number[] = [];
  for (const i of st.locked) if (yields.has(i) && chosen.length < slots) chosen.push(i);
  const rest = avail.filter((i) => !chosen.includes(i));
  let food = footprintYields(s, st).food + chosen.reduce((a, i) => a + yields.get(i)!.food, 0);
  const need = upkeepFood(s, st) + 2 * st.pop;
  const foodScore = (i: number) => {
    const y = yields.get(i)!;
    return y.food * 3 + y.prod * 1.2 + y.gold * 0.6;
  };
  const balScore = (i: number) => {
    const y = yields.get(i)!;
    return y.food * 1.6 + y.prod * 1.6 + y.gold * 0.8;
  };
  while (chosen.length < slots && rest.length) {
    const scorer = food < need ? foodScore : balScore;
    let bi = 0;
    for (let k = 1; k < rest.length; k++) if (scorer(rest[k]) > scorer(rest[bi])) bi = k;
    const pick = rest.splice(bi, 1)[0];
    chosen.push(pick);
    food += yields.get(pick)!.food;
  }
  st.worked = chosen;
}

export function footprintYields(s: GameState, st: Settlement): Yields {
  let y: Yields = { food: 0, prod: 0, gold: 0 };
  for (const i of st.footprint) y = addYields(y, tileYields(s, i, s.civs[st.civId]));
  return y;
}

export interface SettlementYields extends Yields {
  science: number;
  culture: number;
  foodNet: number;
}

export function settlementYields(s: GameState, st: Settlement): SettlementYields {
  const civ = s.civs[st.civId];
  let y = footprintYields(s, st);
  for (const i of st.worked) y = addYields(y, tileYields(s, i, civ));
  let science = st.pop;
  let culture = st.tier >= 1 ? 1 : 0;
  const act = activeBuildings(st);
  if (act.includes('granary')) y.food += 2;
  if (act.includes('workshop')) y.prod = (y.prod + 2) * 1.15;
  if (act.includes('market')) y.gold = (y.gold + 2) * 1.25;
  if (act.includes('library')) science = (science + 2) * 1.25;
  if (act.includes('shrine')) culture += 1;
  if (act.includes('ziggurat')) {
    culture += 3;
    science += 2;
  }
  return {
    food: y.food,
    prod: Math.floor(y.prod),
    gold: Math.floor(y.gold),
    science: Math.floor(science),
    culture,
    foodNet: y.food - upkeepFood(s, st),
  };
}

// Footprint growth -----------------------------------------------------------------------

export function growFootprint(s: GameState, st: Settlement): void {
  const g = grid(s);
  const target = TIER_FOOTPRINT[st.tier];
  while (st.footprint.length < target) {
    let best = -1;
    let bestScore = Infinity;
    for (const f of st.footprint) {
      for (let d = 0; d < 6; d++) {
        const n = neighbour(g, f, d);
        if (n < 0 || st.footprint.includes(n)) continue;
        const t = s.tiles[n];
        if (!isLand(t) || !isPassable(t) || t.urban >= 0) continue;
        if (t.owner >= 0 && t.owner !== st.id) continue;
        const y = tileYields(s, n, s.civs[st.civId]);
        const score = y.food * 2 + y.prod + (t.resource ? 3 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = n;
        }
      }
    }
    if (best < 0) break;
    st.footprint.push(best);
    const t = s.tiles[best];
    t.urban = st.id;
    t.owner = st.id;
    t.improvement = null;
    t.pillaged = false;
    t.dev = 0;
    t.road = true;
    st.locked = st.locked.filter((x) => x !== best);
  }
}

export function shrinkFootprint(s: GameState, st: Settlement): void {
  const target = TIER_FOOTPRINT[st.tier];
  while (st.footprint.length > target) {
    const i = st.footprint.pop()!;
    s.tiles[i].urban = -1;
  }
}

export function setTier(s: GameState, st: Settlement, tier: number): void {
  st.tier = tier;
  st.up = 0;
  st.down = 0;
  if (st.footprint.length < TIER_FOOTPRINT[tier]) growFootprint(s, st);
  else shrinkFootprint(s, st);
  st.recruits = Math.min(st.recruits, TIER_POOL_CAP[tier]);
  st.hp = Math.min(st.hp, maxHp(st));
}

export function tierPopulation(s: GameState, st: Settlement): number {
  return st.pop + garrison(s, st);
}

export function nextThreshold(st: Settlement): number | null {
  return st.tier < 3 ? TIER_POP[st.tier + 1] : null;
}

export function buildingAllowed(s: GameState, st: Settlement, b: BuildingId): boolean {
  const civ = s.civs[st.civId];
  if (st.buildings.includes(b)) return false;
  if (st.buildings.length >= TIER_SLOTS[st.tier]) return false;
  if (!BUILDING[b].tech.every((t) => civ.techs.includes(t))) return false;
  if (b === 'ziggurat') {
    if (st.tier < 3 || civ.capitalId !== st.id) return false;
    if (s.settlements.some((o) => o.civId === st.civId && o.buildings.includes('ziggurat'))) return false;
  }
  return true;
}
