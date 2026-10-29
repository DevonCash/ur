// Units: movement, zone of control, vision, unit creation (DESIGN §9.1–9.4, §5.6).
import { RANKS, TIER_POOL_CAP, UNIT, rankOf, type UnitType } from './data';
import { lineBetween, neighbour, tilesInRadius } from './hex';
import type { GameState, Unit } from './types';
import {
  atWar, civilianAt, civSettlements, findPath, grid, isMilitary, isPassable, militaryAt, newId,
  ownerCiv, relation, settlementById, stepCost,
} from './world';

export function createUnit(s: GameState, civId: number, type: UnitType, tile: number, home: number | null, people = 1): Unit {
  const u: Unit = {
    id: newId(s), civId, type, tile, hp: 100, moves: UNIT[type].moves, xp: 0, home, people,
    fortify: 0, acted: false, sleeping: false,
  };
  s.units.push(u);
  return u;
}

export function rank(u: Unit) {
  return RANKS[rankOf(u.xp)];
}

/** Whether unit u may stand on (end its move in) tile. */
export function canOccupy(s: GameState, u: Unit, tile: number): boolean {
  const t = s.tiles[tile];
  if (!isPassable(t)) return false;
  const mil = isMilitary(u);
  const other = mil ? militaryAt(s, tile) : civilianAt(s, tile);
  if (other && other.id !== u.id) return false;
  // never share a tile with foreign units
  if (s.units.some((o) => o.tile === tile && o.civId !== u.civId)) return false;
  // foreign settlement footprint: only by capture
  const urbanCiv = t.urban >= 0 ? settlementById(s, t.urban)?.civId : undefined;
  if (urbanCiv !== undefined && urbanCiv !== u.civId) return false;
  // at peace, military units cannot enter foreign territory
  const oc = ownerCiv(s, tile);
  if (mil && oc >= 0 && oc !== u.civId && !atWar(s, u.civId, oc)) return false;
  return true;
}

/** Whether u may pass through tile on the way somewhere (own units do not block). */
export function canPass(s: GameState, u: Unit, tile: number): boolean {
  const t = s.tiles[tile];
  if (!isPassable(t)) return false;
  if (s.units.some((o) => o.tile === tile && o.civId !== u.civId)) return false;
  const urbanCiv = t.urban >= 0 ? settlementById(s, t.urban)?.civId : undefined;
  if (urbanCiv !== undefined && urbanCiv !== u.civId) return false;
  const oc = ownerCiv(s, tile);
  if (isMilitary(u) && oc >= 0 && oc !== u.civId && !atWar(s, u.civId, oc)) return false;
  return true;
}

export function inEnemyZoc(s: GameState, civId: number, tile: number): boolean {
  const g = grid(s);
  for (let d = 0; d < 6; d++) {
    const n = neighbour(g, tile, d);
    if (n < 0) continue;
    const m = militaryAt(s, n);
    if (m && atWar(s, civId, m.civId)) return true;
  }
  return false;
}

export function pathFor(s: GameState, u: Unit, to: number) {
  if (!canOccupy(s, u, to)) return null;
  return findPath(s, u.tile, to, (t) => t === to || canPass(s, u, t));
}

/**
 * Move along the cheapest path as far as movement allows. A unit with any moves left may enter a
 * tile even if the cost exceeds what remains (ends its move). ZOC ends the move.
 * Returns tiles actually entered.
 */
export function moveUnit(s: GameState, u: Unit, to: number): number[] {
  const p = pathFor(s, u, to);
  if (!p) return [];
  const g = grid(s);
  const entered: number[] = [];
  for (let k = 1; k < p.path.length; k++) {
    if (u.moves <= 0) break;
    const next = p.path[k];
    const last = k === p.path.length - 1;
    // cannot stop on a tile another own unit of the same kind holds; only pass through if moves remain
    if (!canPass(s, u, next)) break;
    let d = 0;
    for (; d < 6; d++) if (neighbour(g, u.tile, d) === next) break;
    const c = stepCost(s, u.tile, next, d);
    if (!last && !canOccupy(s, u, next) && u.moves - c <= 0) break;
    u.tile = next;
    u.moves = Math.max(0, u.moves - c);
    u.acted = true;
    u.fortify = 0;
    u.sleeping = false;
    entered.push(next);
    meetCivs(s, u.civId, next);
    if (inEnemyZoc(s, u.civId, next)) {
      u.moves = 0;
    }
  }
  // if we ended on a tile we cannot occupy (blocked by own stack), step back
  while (entered.length && !canOccupy(s, u, u.tile)) {
    entered.pop();
    u.tile = entered.length ? entered[entered.length - 1] : p.path[0];
  }
  updateVision(s, u.civId);
  return entered;
}

// Vision --------------------------------------------------------------------------------

export function visionRadius(s: GameState, u: Unit): number {
  const base = u.type === 'scout' ? 3 : 2;
  return base + (s.tiles[u.tile].feature === 'hills' ? 1 : 0);
}

function markVisible(s: GameState, vis: number[], from: number, radius: number) {
  const g = grid(s);
  for (const i of tilesInRadius(g, from, radius)) {
    if (vis[i] === 2) continue;
    const blocked = lineBetween(g, from, i).some((j) => s.tiles[j].terrain === 'mountain');
    if (!blocked) vis[i] = 2;
  }
}

export function updateVision(s: GameState, civId: number): void {
  const civ = s.civs[civId];
  const vis = civ.vis;
  for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
  for (const u of s.units) if (u.civId === civId) markVisible(s, vis, u.tile, visionRadius(s, u));
  const g = grid(s);
  for (const st of civSettlements(s, civId)) {
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i].owner !== st.id) continue;
      vis[i] = 2;
      for (let d = 0; d < 6; d++) {
        const n = neighbour(g, i, d);
        if (n >= 0) vis[n] = 2;
      }
    }
  }
  // meeting: any visible foreign unit or settlement
  for (const u of s.units) if (u.civId !== civId && vis[u.tile] === 2) meet(s, civId, u.civId);
  for (const st of s.settlements) if (st.civId !== civId && vis[st.center] === 2) meet(s, civId, st.civId);
}

export function meet(s: GameState, a: number, b: number): void {
  if (a === b) return;
  const r = relation(s, a, b);
  if (r.state === 'unmet') {
    r.state = 'peace';
    r.since = s.turn;
  }
}

function meetCivs(s: GameState, civId: number, tile: number) {
  const g = grid(s);
  for (let d = 0; d < 6; d++) {
    const n = neighbour(g, tile, d);
    if (n < 0) continue;
    for (const o of s.units) if (o.tile === n && o.civId !== civId) meet(s, civId, o.civId);
  }
}

// Recruiting -------------------------------------------------------------------------------

export function poolCap(st: { tier: number }): number {
  return TIER_POOL_CAP[st.tier];
}
