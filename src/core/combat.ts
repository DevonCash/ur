// Combat (DESIGN §9.5, §7.10): strength, modifiers, damage, prisoners, settlement capture.
import {
  FLANK_BONUS, FLANK_MAX, FORTIFY_BONUS, RANKS, RIVER_ATTACK_PENALTY, SETTLEMENT_RANGE, SPEAR_VS_CHARIOT,
  UNIT, rankOf,
} from './data';
import { distance, neighbour } from './hex';
import { nextRange } from './rng';
import { hasBuilding, maxHp } from './settlement';
import type { GameState, Settlement, Unit } from './types';
import {
  atWar, grid, isMilitary, log, militaryAt, settlementAtTile, tileDefence,
} from './world';

export type Target = { kind: 'unit'; unit: Unit } | { kind: 'settlement'; st: Settlement; tile: number };

export function settlementStrength(st: Settlement): number {
  return 8 + 2 * st.pop + (hasBuilding(st, 'walls') ? 6 : 0);
}

function hpFactor(hp: number, max: number) {
  return 0.5 + (0.5 * hp) / max;
}

function riverBetween(s: GameState, a: number, b: number): boolean {
  const g = grid(s);
  for (let d = 0; d < 6; d++) if (neighbour(g, a, d) === b) return ((s.tiles[a].river >> d) & 1) === 1;
  return false;
}

function flanking(s: GameState, attacker: Unit, defenderTile: number): number {
  const g = grid(s);
  let n = 0;
  for (let d = 0; d < 6; d++) {
    const t = neighbour(g, defenderTile, d);
    if (t < 0 || t === attacker.tile) continue;
    const m = militaryAt(s, t);
    if (m && m.civId === attacker.civId) n++;
  }
  return Math.min(FLANK_MAX, n * FLANK_BONUS);
}

export interface Odds {
  attackerStrength: number;
  defenderStrength: number;
  damageToDefender: number;
  damageToAttacker: number;
  ranged: boolean;
}

export function isRanged(u: Unit): boolean {
  return UNIT[u.type].cls === 'ranged';
}

export function attackStrength(s: GameState, u: Unit, target: Target): number {
  const def = UNIT[u.type];
  const base = isRanged(u) ? def.ranged : def.strength;
  let mod = RANKS[rankOf(u.xp)].bonus;
  const tTile = target.kind === 'unit' ? target.unit.tile : target.tile;
  if (!isRanged(u)) {
    if (riverBetween(s, u.tile, tTile)) mod += RIVER_ATTACK_PENALTY;
    mod += flanking(s, u, tTile);
  }
  if (u.type === 'spearman' && target.kind === 'unit' && target.unit.type === 'chariot') mod += SPEAR_VS_CHARIOT;
  return base * (1 + mod) * hpFactor(u.hp, 100);
}

export function defenceStrength(s: GameState, target: Target, attacker: Unit | null): number {
  if (target.kind === 'settlement') return settlementStrength(target.st) * hpFactor(target.st.hp, maxHp(target.st));
  const u = target.unit;
  let mod = tileDefence(s.tiles[u.tile]) + RANKS[rankOf(u.xp)].bonus;
  if (u.fortify >= 2) mod += FORTIFY_BONUS;
  if (u.type === 'spearman' && attacker?.type === 'chariot') mod += SPEAR_VS_CHARIOT;
  const base = UNIT[u.type].strength || 1;
  return base * (1 + mod) * hpFactor(u.hp, 100);
}

export function odds(s: GameState, u: Unit, target: Target): Odds {
  const a = attackStrength(s, u, target);
  const d = defenceStrength(s, target, u);
  const r = a / d;
  const clamp = (x: number) => Math.max(1, Math.min(100, x));
  return {
    attackerStrength: a,
    defenderStrength: d,
    damageToDefender: clamp(30 * Math.pow(r, 1.2)),
    damageToAttacker: isRanged(u) ? 0 : clamp(30 * Math.pow(r, -1.2)),
    ranged: isRanged(u),
  };
}

/** Resolve what is attacked at a tile, if anything. */
export function targetAt(s: GameState, attacker: Unit, tile: number): Target | null {
  const m = militaryAt(s, tile);
  if (m && atWar(s, attacker.civId, m.civId)) return { kind: 'unit', unit: m };
  const st = settlementAtTile(s, tile);
  if (st && atWar(s, attacker.civId, st.civId) && !m) return { kind: 'settlement', st, tile };
  // lone civilians are captured by moving in, not attacked
  return null;
}

export function canAttack(s: GameState, u: Unit, tile: number): boolean {
  if (!isMilitary(u) || u.moves <= 0 || u.type === 'scout') return false;
  const target = targetAt(s, u, tile);
  if (!target) return false;
  const dist = distance(s.w, u.tile, tile);
  if (isRanged(u)) return dist <= UNIT[u.type].range && dist >= 1 && s.civs[u.civId].vis[tile] === 2;
  return dist === 1;
}

export interface CombatResult {
  defenderDamage: number;
  attackerDamage: number;
  killed: boolean;
  attackerKilled: boolean;
  captured?: number;
}

/** Callbacks implemented in game.ts to avoid circular imports. */
export interface CombatHooks {
  takePrisoner: (s: GameState, victim: Unit, captorCiv: number, at: number) => void;
  captureSettlement: (s: GameState, st: Settlement, captorCiv: number, unit: Unit) => void;
  removeUnit: (s: GameState, u: Unit, killerCiv: number | null) => void;
}

export function attack(s: GameState, u: Unit, tile: number, hooks: CombatHooks): CombatResult | null {
  if (!canAttack(s, u, tile)) return null;
  const target = targetAt(s, u, tile)!;
  const o = odds(s, u, target);
  const dd = Math.round(Math.max(1, Math.min(100, o.damageToDefender * nextRange(s.rng, 0.8, 1.2))));
  const da = o.ranged ? 0 : Math.round(Math.max(1, Math.min(100, o.damageToAttacker * nextRange(s.rng, 0.8, 1.2))));
  const res: CombatResult = { defenderDamage: dd, attackerDamage: da, killed: false, attackerKilled: false };
  u.moves = 0;
  u.acted = true;
  u.fortify = 0;
  const atkName = `${s.civs[u.civId].name} ${UNIT[u.type].name}`;
  if (target.kind === 'unit') {
    const v = target.unit;
    v.hp -= dd;
    u.hp -= da;
    v.acted = true;
    if (v.hp > 0) v.xp += 5;
    if (u.hp > 0) u.xp += 5;
    if (v.hp <= 0) {
      res.killed = true;
      if (u.hp > 0) u.xp += 5;
      log(s, -1, 'combat', `${atkName} destroyed ${s.civs[v.civId].name} ${UNIT[v.type].name}.`);
      if (o.ranged) hooks.removeUnit(s, v, u.civId);
      else hooks.takePrisoner(s, v, u.civId, tile);
      if (!o.ranged && u.hp > 0) {
        u.tile = tile;
        captureCiviliansAt(s, u, tile, hooks);
      }
    }
    if (u.hp <= 0) {
      res.attackerKilled = true;
      log(s, -1, 'combat', `${atkName} was destroyed attacking ${s.civs[v.civId].name} ${UNIT[v.type].name}.`);
      hooks.removeUnit(s, u, v.civId);
    }
  } else {
    const st = target.st;
    st.hp -= dd;
    if (o.ranged) st.hp = Math.max(1, st.hp);
    u.hp -= da;
    if (u.hp > 0) u.xp += 5;
    if (u.hp <= 0) {
      res.attackerKilled = true;
      log(s, -1, 'combat', `${atkName} was destroyed assaulting ${st.name}.`);
      hooks.removeUnit(s, u, st.civId);
    } else if (st.hp <= 0 && !o.ranged) {
      st.hp = 0;
      res.killed = true;
      hooks.captureSettlement(s, st, u.civId, u);
    }
  }
  return res;
}

export function captureCiviliansAt(s: GameState, u: Unit, tile: number, hooks: CombatHooks) {
  for (const c of s.units.filter((x) => x.tile === tile && !isMilitary(x) && x.civId !== u.civId)) {
    if (!atWar(s, u.civId, c.civId)) continue;
    log(s, -1, 'combat', `${s.civs[u.civId].name} captured ${s.civs[c.civId].name} Migrants (${c.people}).`);
    hooks.takePrisoner(s, c, u.civId, tile);
  }
}

/** Settlement ranged attack (Town+ with Walls). */
export function settlementCanShoot(s: GameState, st: Settlement, tile: number): boolean {
  if (st.tier < 2 || !hasBuilding(st, 'walls') || st.rangedUsed) return false;
  const m = militaryAt(s, tile);
  if (!m || !atWar(s, st.civId, m.civId)) return false;
  return Math.min(...st.footprint.map((f) => distance(s.w, f, tile))) <= SETTLEMENT_RANGE;
}

export function settlementShoot(s: GameState, st: Settlement, tile: number, hooks: CombatHooks): number {
  if (!settlementCanShoot(s, st, tile)) return 0;
  const v = militaryAt(s, tile)!;
  const a = settlementStrength(st) * hpFactor(st.hp, maxHp(st));
  const d = defenceStrength(s, { kind: 'unit', unit: v }, null);
  const dmg = Math.round(Math.max(1, Math.min(100, 30 * Math.pow(a / d, 1.2) * nextRange(s.rng, 0.8, 1.2))));
  v.hp -= dmg;
  st.rangedUsed = true;
  if (v.hp <= 0) {
    log(s, -1, 'combat', `${st.name} destroyed ${s.civs[v.civId].name} ${UNIT[v.type].name}.`);
    hooks.removeUnit(s, v, st.civId);
  }
  return dmg;
}
