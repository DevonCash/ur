import { applyAction, CIV_COLORS, CIV_NAMES } from '../src/core/game';
import { fromAxial, toAxial } from '../src/core/hex';
import { recomputeTerritory } from '../src/core/settlement';
import type { Civ, GameState, Settlement, Tile } from '../src/core/types';
import { createUnit, updateVision } from '../src/core/units';
import { relation } from '../src/core/world';

/** A flat all-grassland map with two civs at peace, no units. */
export function flatState(w = 30, h = 20): GameState {
  const tiles: Tile[] = [];
  for (let i = 0; i < w * h; i++) {
    tiles.push({
      terrain: 'grassland', feature: null, resource: null, river: 0, ford: 0, improvement: null, pillaged: false,
      road: false, owner: -1, urban: -1, dev: 0, elevation: 0.5,
    });
  }
  const civs: Civ[] = [0, 1].map((id) => ({
    id, name: CIV_NAMES[id], color: CIV_COLORS[id], human: false, alive: true, gold: 0, science: 0, researching: null,
    techs: ['foraging'], capitalId: null, originalCapitalId: null, vis: new Array(w * h).fill(0), closed: {},
    bankrupt: false, outflow: {}, settlementNames: 0,
  }));
  const s: GameState = {
    version: 1, seed: 1, turn: 20, current: 0, w, h, tiles, civs, settlements: [], units: [], prisoners: [], ransoms: [],
    peaceOffers: [], relations: {}, nextId: 1, rng: { s: 99 }, log: [], winner: null, victory: null, options: { aiCount: 1 },
  };
  relation(s, 0, 1).state = 'peace';
  relation(s, 0, 1).since = 0;
  return s;
}

export function at(s: GameState, q: number, r: number): number {
  return fromAxial(s.w, s.h, q, r);
}

/** Tile index for offset column/row. */
export function cr(s: GameState, col: number, row: number): number {
  return row * s.w + col;
}

export function offset(s: GameState, i: number, dq: number, dr: number): number {
  const [q, r] = toAxial(s.w, i);
  return fromAxial(s.w, s.h, q + dq, r + dr);
}

export function foundAt(s: GameState, civId: number, tile: number, people = 2): Settlement {
  const prev = s.current;
  s.current = civId;
  const u = createUnit(s, civId, 'migrants', tile, null, people);
  const r = applyAction(s, { type: 'found', unit: u.id });
  if (!r.ok) throw new Error(`found failed: ${r.msg}`);
  s.current = prev;
  recomputeTerritory(s);
  updateVision(s, civId);
  return s.settlements[s.settlements.length - 1];
}
