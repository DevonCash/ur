// Shared queries over GameState: grid, tiles, travel cost, relations, lookups, yields.
import FlatQueue from 'flatqueue';
import {
  FEATURE, IMPROVEMENT, RESOURCE, ROAD_COST, RIVER_CROSSING_COST, TERRAIN, UNIT,
  type ResourceId, type TechId, type Yields,
} from './data';
import { type Grid, makeGrid, neighbour } from './hex';
import type { Civ, GameState, LogEntry, Settlement, Tile, Unit } from './types';

let gridCache: Grid | null = null;

export function grid(s: { w: number; h: number }): Grid {
  if (!gridCache || gridCache.w !== s.w || gridCache.h !== s.h) gridCache = makeGrid(s.w, s.h);
  return gridCache;
}

// Tiles -----------------------------------------------------------------------

export function isLand(t: Tile): boolean {
  return !TERRAIN[t.terrain].water;
}

export function isPassable(t: Tile): boolean {
  return TERRAIN[t.terrain].cost !== Infinity;
}

export function tileBaseCost(t: Tile): number {
  if (!isPassable(t)) return Infinity;
  return t.feature ? FEATURE[t.feature].cost : TERRAIN[t.terrain].cost;
}

/** Cost of stepping from tile a into neighbour b in direction d. */
export function stepCost(s: GameState, a: number, b: number, d: number): number {
  const tb = s.tiles[b];
  const base = tileBaseCost(tb);
  if (base === Infinity) return Infinity;
  const ta = s.tiles[a];
  if (ta.road && tb.road) return ROAD_COST;
  const crossing = (ta.river >> d) & 1 && !((ta.ford >> d) & 1) ? RIVER_CROSSING_COST : 0;
  return base + crossing;
}

export function tileDefence(t: Tile): number {
  return t.feature ? FEATURE[t.feature].defence : TERRAIN[t.terrain].defence;
}

export function hasFreshWater(s: GameState, i: number): boolean {
  const t = s.tiles[i];
  if (t.river) return true;
  const g = grid(s);
  for (let d = 0; d < 6; d++) {
    const n = neighbour(g, i, d);
    if (n >= 0 && s.tiles[n].terrain === 'lake') return true;
  }
  return false;
}

export function isFlat(t: Tile): boolean {
  return isLand(t) && t.terrain !== 'mountain' && t.feature === null;
}

// Yields ----------------------------------------------------------------------

export function addYields(a: Yields, b: Yields): Yields {
  return { food: a.food + b.food, prod: a.prod + b.prod, gold: a.gold + b.gold };
}

export function tileYields(s: GameState, i: number, civ: Civ | null): Yields {
  const t = s.tiles[i];
  if (t.urban >= 0) {
    const st = settlementById(s, t.urban);
    const isCenter = st && st.center === i;
    let y: Yields = isCenter ? { food: 3, prod: 1, gold: 1 } : { food: 0, prod: 2, gold: 1 };
    if (isCenter && t.resource) y = addYields(y, RESOURCE[t.resource].base);
    return y;
  }
  let y: Yields = t.feature ? { ...FEATURE[t.feature].yields } : { ...TERRAIN[t.terrain].yields };
  const imp = t.pillaged ? null : t.improvement;
  if (imp) {
    y = addYields(y, IMPROVEMENT[imp].yields);
    if (imp === 'farm' && civ && hasTech(civ, 'irrigation') && hasFreshWater(s, i)) y.food += 1;
  }
  if (t.resource) {
    const r = RESOURCE[t.resource];
    y = addYields(y, r.base);
    if (r.improved && imp === r.improved.imp) y = addYields(y, r.improved.yields);
  }
  return y;
}

// Civs, relations ---------------------------------------------------------------

export function hasTech(civ: Civ, t: TechId): boolean {
  return civ.techs.includes(t);
}

export function relKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function relation(s: GameState, a: number, b: number) {
  const k = relKey(a, b);
  if (!s.relations[k]) s.relations[k] = { state: 'unmet', since: s.turn, score: 0, captures: 0 };
  return s.relations[k];
}

export function atWar(s: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return relation(s, a, b).state === 'war';
}

export function bordersOpen(s: GameState, a: number, b: number): boolean {
  if (a === b) return true;
  return !s.civs[a].closed[b] && !s.civs[b].closed[a];
}

export function log(s: GameState, civ: number, kind: LogEntry['kind'], text: string): void {
  s.log.push({ turn: s.turn, civ, kind, text });
  if (s.log.length > 600) s.log.splice(0, s.log.length - 600);
}

// Lookups -----------------------------------------------------------------------

export function settlementById(s: GameState, id: number): Settlement | undefined {
  return s.settlements.find((x) => x.id === id);
}

export function unitById(s: GameState, id: number): Unit | undefined {
  return s.units.find((x) => x.id === id);
}

export function civSettlements(s: GameState, civId: number): Settlement[] {
  return s.settlements.filter((x) => x.civId === civId);
}

export function civUnits(s: GameState, civId: number): Unit[] {
  return s.units.filter((x) => x.civId === civId);
}

export function isMilitary(u: Unit): boolean {
  return UNIT[u.type].cls !== 'civilian';
}

export function militaryAt(s: GameState, tile: number): Unit | undefined {
  return s.units.find((u) => u.tile === tile && isMilitary(u));
}

export function civilianAt(s: GameState, tile: number): Unit | undefined {
  return s.units.find((u) => u.tile === tile && !isMilitary(u));
}

export function settlementAtTile(s: GameState, tile: number): Settlement | undefined {
  const id = s.tiles[tile].urban;
  return id >= 0 ? settlementById(s, id) : undefined;
}

export function ownerCiv(s: GameState, tile: number): number {
  const o = s.tiles[tile].owner;
  if (o < 0) return -1;
  const st = settlementById(s, o);
  return st ? st.civId : -1;
}

export function newId(s: GameState): number {
  return s.nextId++;
}

/** Civilization has at least one worked, improved tile of a strategic resource. */
export function hasResource(s: GameState, civId: number, r: ResourceId): boolean {
  const need = RESOURCE[r].improved?.imp;
  for (const st of civSettlements(s, civId)) {
    for (const i of st.worked) {
      const t = s.tiles[i];
      if (t.resource !== r) continue;
      if (RESOURCE[r].kind === 'luxury' && !need) return true;
      if (!need || (t.improvement === need && !t.pillaged)) return true;
    }
  }
  return false;
}

export function distinctLuxuries(s: GameState, civId: number): number {
  let n = 0;
  for (const r of ['dates', 'lapis'] as ResourceId[]) if (hasResource(s, civId, r)) n++;
  return n;
}

// Pathfinding -------------------------------------------------------------------

export interface DijkstraOpts {
  maxCost: number;
  /** extra rule for whether a tile may be entered (beyond passability) */
  canEnter?: (tile: number) => boolean;
}

/** Cheapest travel cost from sources to every tile within maxCost. */
export function dijkstra(s: GameState, sources: number[], opts: DijkstraOpts): Map<number, number> {
  const g = grid(s);
  const dist = new Map<number, number>();
  const q = new FlatQueue<number>();
  for (const src of sources) {
    dist.set(src, 0);
    q.push(src, 0);
  }
  while (q.length) {
    const cost = q.peekValue()!;
    const i = q.pop()!;
    if (cost > (dist.get(i) ?? Infinity)) continue;
    for (let d = 0; d < 6; d++) {
      const n = neighbour(g, i, d);
      if (n < 0) continue;
      const c = stepCost(s, i, n, d);
      if (c === Infinity) continue;
      const nc = cost + c;
      if (nc > opts.maxCost) continue;
      if (opts.canEnter && !opts.canEnter(n)) continue;
      if (nc < (dist.get(n) ?? Infinity)) {
        dist.set(n, nc);
        q.push(n, nc);
      }
    }
  }
  return dist;
}

/** Cheapest path from a to b (inclusive), or null. */
export function findPath(
  s: GameState,
  from: number,
  to: number,
  canEnter?: (tile: number) => boolean,
  maxCost = 200,
): { path: number[]; cost: number } | null {
  if (from === to) return { path: [from], cost: 0 };
  const g = grid(s);
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const q = new FlatQueue<number>();
  const w = s.w;
  const h = (i: number) => hexDist(w, i, to) * 0.5;
  q.push(from, h(from));
  while (q.length) {
    const i = q.pop()!;
    if (i === to) break;
    const cost = dist.get(i)!;
    for (let d = 0; d < 6; d++) {
      const n = neighbour(g, i, d);
      if (n < 0) continue;
      const c = stepCost(s, i, n, d);
      if (c === Infinity) continue;
      if (n !== to && canEnter && !canEnter(n)) continue;
      if (n === to && canEnter && !canEnter(n)) continue;
      const nc = cost + c;
      if (nc > maxCost) continue;
      if (nc < (dist.get(n) ?? Infinity)) {
        dist.set(n, nc);
        prev.set(n, i);
        q.push(n, nc + h(n));
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  let c = to;
  while (c !== from) {
    c = prev.get(c)!;
    path.push(c);
  }
  path.reverse();
  return { path, cost: dist.get(to)! };
}

function hexDist(w: number, a: number, b: number): number {
  const ra = Math.floor(a / w);
  const rb = Math.floor(b / w);
  const qa = a - ra * w - (ra - (ra & 1)) / 2;
  const qb = b - rb * w - (rb - (rb & 1)) / 2;
  const dq = qa - qb;
  const dr = ra - rb;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
