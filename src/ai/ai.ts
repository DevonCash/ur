// Rule-based AI (DESIGN §14). Uses only applyAction and the civ's own visibility.
import { canAttack, odds, targetAt } from '../core/combat';
import {
  BUILDING, TECH, TIER_POP, UNIT, type BuildingId, type TechId, type UnitType,
} from '../core/data';
import {
  aiAcceptsPeace, applyAction, canFound, canUpgrade, projectAllowed, unitAllowed, warScore, type Action,
} from '../core/game';
import { distance, neighbour, tilesInRadius } from '../core/hex';
import { stability } from '../core/migration';
import { nextFloat } from '../core/rng';
import { buildingAllowed, garrison, tierPopulation } from '../core/settlement';
import type { GameState, Settlement, Unit } from '../core/types';
import { canOccupy, pathFor } from '../core/units';
import {
  atWar, civSettlements, civUnits, grid, hasFreshWater, isLand, isMilitary, isPassable, militaryAt,
  ownerCiv, relation, settlementById, tileYields, unitById,
} from '../core/world';

const RESEARCH_ORDER: TechId[] = [
  'tilling', 'stoneworking', 'herding', 'hunting', 'pottery', 'masonry', 'irrigation', 'bronze', 'wheel',
  'writing', 'archery', 'mathematics', 'ironworking',
];
const BUILD_ORDER: BuildingId[] = ['granary', 'shrine', 'workshop', 'library', 'walls', 'market', 'barracks', 'ziggurat'];
const MAX_SETTLEMENTS = 9;

function act(s: GameState, civId: number, a: Action) {
  return applyAction(s, a, civId);
}

export function runAI(s: GameState, civId: number): void {
  const civ = s.civs[civId];
  if (!civ.alive || s.winner !== null) return;
  research(s, civId);
  diplomacy(s, civId);
  prisoners(s, civId);
  for (const id of civUnits(s, civId).map((u) => u.id)) {
    const u = unitById(s, id);
    if (!u || s.winner !== null) continue;
    try {
      actUnit(s, u);
    } catch (e) {
      console.error('AI unit error', e);
    }
  }
  for (const st of civSettlements(s, civId)) {
    if (st.civId !== civId) continue;
    if (!st.production) chooseProduction(s, st);
  }
  rushBuy(s, civId);
}

// Research & diplomacy -----------------------------------------------------------------

function research(s: GameState, civId: number) {
  const civ = s.civs[civId];
  if (civ.researching) return;
  for (const t of RESEARCH_ORDER) {
    if (civ.techs.includes(t)) continue;
    if (!TECH[t].requires.every((r) => civ.techs.includes(r))) continue;
    act(s, civId, { type: 'research', tech: t });
    return;
  }
}

function militaryPower(s: GameState, civId: number): number {
  return civUnits(s, civId)
    .filter(isMilitary)
    .reduce((a, u) => a + (UNIT[u.type].strength + UNIT[u.type].ranged * 0.5) * (u.hp / 100), 0);
}

function nearestDistanceBetween(s: GameState, a: number, b: number): number {
  let best = Infinity;
  for (const x of civSettlements(s, a)) for (const y of civSettlements(s, b)) best = Math.min(best, distance(s.w, x.center, y.center));
  return best;
}

function diplomacy(s: GameState, civId: number) {
  const mine = militaryPower(s, civId);
  for (const other of s.civs) {
    if (other.id === civId || !other.alive) continue;
    const r = relation(s, civId, other.id);
    if (r.state === 'peace' && s.turn - r.since >= 10 && s.turn > 25) {
      const theirs = militaryPower(s, other.id);
      if (mine > 1.5 * Math.max(4, theirs) && nearestDistanceBetween(s, civId, other.id) <= 22 && nextFloat(s.rng) < 0.25) {
        act(s, civId, { type: 'declareWar', civ: other.id });
      }
    } else if (r.state === 'war' && s.turn - r.since >= 10) {
      if (aiAcceptsPeace(s, civId, other.id) || warScore(s, civId, other.id) < -3) {
        act(s, civId, { type: 'proposePeace', civ: other.id });
      }
    }
    // border policy from recent outflow
    const out = (s.civs[civId].outflow[other.id] ?? []).length;
    const closed = !!s.civs[civId].closed[other.id];
    if (!closed && out > 4) act(s, civId, { type: 'setBorder', civ: other.id, closed: true });
    else if (closed && out <= 1) act(s, civId, { type: 'setBorder', civ: other.id, closed: false });
  }
  for (const o of s.peaceOffers.filter((x) => x.toCiv === civId)) {
    if (aiAcceptsPeace(s, civId, o.fromCiv)) act(s, civId, { type: 'acceptPeace', civ: o.fromCiv });
    else act(s, civId, { type: 'rejectPeace', civ: o.fromCiv });
  }
}

function prisoners(s: GameState, civId: number) {
  for (const p of s.prisoners.filter((x) => x.holderCivId === civId)) {
    if (p.turns >= 10) {
      act(s, civId, { type: 'settlePrisoner', prisoner: p.id });
      continue;
    }
    const holder = settlementById(s, p.settlementId);
    if (holder && holder.lastFoodNet < 2 && !s.ransoms.some((o) => o.prisonerId === p.id)) {
      act(s, civId, { type: 'ransom', prisoner: p.id });
    }
  }
}

// Production -------------------------------------------------------------------------------

function enemiesNear(s: GameState, civId: number, tile: number, r: number): number {
  return s.units.filter((u) => isMilitary(u) && atWar(s, civId, u.civId) && distance(s.w, u.tile, tile) <= r).length;
}

function atWarWithAnyone(s: GameState, civId: number): boolean {
  return s.civs.some((c) => c.id !== civId && c.alive && atWar(s, civId, c.id));
}

function bestMilitary(s: GameState, st: Settlement): UnitType | null {
  const units = civUnits(s, st.civId).filter(isMilitary);
  const ranged = units.filter((u) => UNIT[u.type].cls === 'ranged').length;
  const melee = units.length - ranged;
  const prefs: UnitType[] = ranged < melee / 2 ? ['slinger', 'chariot', 'warrior'] : ['chariot', 'warrior', 'slinger'];
  for (const t of prefs) if (!unitAllowed(s, st, t)) return t;
  return null;
}

function chooseProduction(s: GameState, st: Settlement) {
  const civId = st.civId;
  const set = (item: Action) => act(s, civId, item).ok;
  const people = civSettlements(s, civId).reduce((a, x) => a + x.pop, 0);
  const soldiers = civUnits(s, civId).filter((u) => isMilitary(u) && u.type !== 'scout').length;
  const war = atWarWithAnyone(s, civId);
  const threatened = enemiesNear(s, civId, st.center, 6) > 0;
  const canRecruit = st.recruits > 0 && st.pop >= 2;
  const mil = bestMilitary(s, st);

  if (threatened && garrison(s, st) < 2) {
    if (canRecruit && mil) return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'unit', unit: mil } });
    if (buildingAllowed(s, st, 'walls')) return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'building', building: 'walls' } });
  }
  const share = soldiers / Math.max(1, people + soldiers);
  const target = war ? 0.25 : 0.1;
  if (share < target && canRecruit && mil && st.pop >= TIER_POP[st.tier] + 1) {
    return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'unit', unit: mil } });
  }
  // expansion, holding people back when close to the next tier
  const nextT = st.tier < 3 ? TIER_POP[st.tier + 1] : Infinity;
  const holding = tierPopulation(s, st) >= nextT - 1;
  const migrants = civUnits(s, civId).filter((u) => u.type === 'migrants').length;
  const stab = stability(s, civId);
  if (civSettlements(s, civId).length < MAX_SETTLEMENTS && st.pop >= 3 && !holding && migrants < 2 && !threatened && stab >= 2) {
    return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'unit', unit: 'migrants', people: st.pop >= 6 ? 2 : 1 } });
  }
  const scouts = civUnits(s, civId).filter((u) => u.type === 'scout').length;
  if (scouts === 0 && s.turn < 40 && canRecruit && st.pop >= 3) {
    return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'unit', unit: 'scout' } });
  }
  const order = stab < 3 ? (['shrine', ...BUILD_ORDER.filter((b) => b !== 'shrine')] as BuildingId[]) : BUILD_ORDER;
  for (const b of order) {
    if (b === 'walls' && !war && enemiesNear(s, civId, st.center, 12) === 0) continue;
    if (buildingAllowed(s, st, b)) return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'building', building: b } });
  }
  // projects on owned tiles
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    if (t.owner !== st.id) continue;
    if (t.pillaged && !projectAllowed(s, st, { kind: 'project', project: 'repair', tile: i })) {
      return void set({ type: 'setProduction', settlement: st.id, item: { kind: 'project', project: 'repair', tile: i } });
    }
  }
  if (st.pop >= 3) {
    for (const pref of ['copper', 'lapis', null] as const) {
      for (let i = 0; i < s.tiles.length; i++) {
        const t = s.tiles[i];
        if (t.owner !== st.id || !st.worked.includes(i)) continue;
        if (pref && t.resource !== pref) continue;
        const item = { kind: 'project' as const, project: 'mine' as const, tile: i };
        if (!projectAllowed(s, st, item)) return void set({ type: 'setProduction', settlement: st.id, item });
        const lum = { kind: 'project' as const, project: 'lumber' as const, tile: i };
        if (!pref && !projectAllowed(s, st, lum)) return void set({ type: 'setProduction', settlement: st.id, item: lum });
      }
    }
  }
  if (canRecruit && mil && st.pop > TIER_POP[st.tier] + 1) {
    set({ type: 'setProduction', settlement: st.id, item: { kind: 'unit', unit: mil } });
  }
}

function rushBuy(s: GameState, civId: number) {
  const civ = s.civs[civId];
  if (civ.gold < 120) return;
  for (const st of civSettlements(s, civId)) {
    const item = st.production;
    if (!item || item.kind !== 'building') continue;
    const remaining = BUILDING[item.building].cost - st.prodStored;
    if (remaining * 3 <= civ.gold - 60) {
      act(s, civId, { type: 'rushBuy', settlement: st.id });
      return;
    }
  }
}

// Units ----------------------------------------------------------------------------------------

function actUnit(s: GameState, u: Unit) {
  if (u.type === 'migrants') return actMigrants(s, u);
  if (u.type === 'scout') return actScout(s, u);
  if (!canUpgrade(s, u)) act(s, u.civId, { type: 'upgrade', unit: u.id });
  actMilitary(s, u);
}

function siteScore(s: GameState, civId: number, tile: number): number {
  const g = grid(s);
  let score = 0;
  const civ = s.civs[civId];
  for (const i of tilesInRadius(g, tile, 3)) {
    const t = s.tiles[i];
    if (t.owner >= 0 || t.urban >= 0) continue;
    const y = tileYields(s, i, civ);
    const w = distance(s.w, tile, i) <= 2 ? 1 : 0.5;
    score += w * (y.food * 1.2 + y.prod + y.gold * 0.5 + (t.resource ? 1.5 : 0));
  }
  if (hasFreshWater(s, tile)) score += 5;
  if (s.tiles[tile].feature === 'hills') score += 1;
  for (const st of s.settlements) if (st.civId !== civId && distance(s.w, st.center, tile) < 9) score -= 6;
  return score;
}

function actMigrants(s: GameState, u: Unit) {
  const civId = u.civId;
  const hasHome = civSettlements(s, civId).length > 0;
  if (!hasHome && !canFound(s, u)) {
    act(s, civId, { type: 'found', unit: u.id });
    return;
  }
  const vis = s.civs[civId].vis;
  let best = -1;
  let bestScore = -Infinity;
  for (const i of tilesInRadius(grid(s), u.tile, 14)) {
    if (vis[i] === 0) continue;
    const t = s.tiles[i];
    if (!isLand(t) || !isPassable(t)) continue;
    if (!canFound(s, { ...u, tile: i })) {
      const sc = siteScore(s, civId, i) - 0.5 * distance(s.w, u.tile, i);
      if (sc > bestScore) {
        bestScore = sc;
        best = i;
      }
    }
  }
  if (best < 0) {
    // nowhere to settle: join the nearest settlement
    const near = civSettlements(s, civId).sort((a, b) => distance(s.w, a.center, u.tile) - distance(s.w, b.center, u.tile))[0];
    if (near && near.footprint.includes(u.tile)) act(s, civId, { type: 'join', unit: u.id });
    else if (near) act(s, civId, { type: 'move', unit: u.id, to: near.center });
    return;
  }
  if (best === u.tile) {
    act(s, civId, { type: 'found', unit: u.id });
    return;
  }
  const r = act(s, civId, { type: 'move', unit: u.id, to: best });
  const after = unitById(s, u.id);
  if (after && after.tile === best && after.moves > 0) act(s, civId, { type: 'found', unit: u.id });
  if (!r.ok && after && !canFound(s, after)) act(s, civId, { type: 'found', unit: u.id });
}

function actScout(s: GameState, u: Unit) {
  if (u.explore) return;
  if (!act(s, u.civId, { type: 'explore', unit: u.id }).ok) act(s, u.civId, { type: 'fortify', unit: u.id });
}

function actMilitary(s: GameState, u: Unit) {
  const civId = u.civId;
  const g = grid(s);
  // attack anything in reach with acceptable odds
  const reach = UNIT[u.type].cls === 'ranged' ? UNIT[u.type].range : 1;
  let bestT = -1;
  let bestV = 0;
  for (const i of tilesInRadius(g, u.tile, reach)) {
    if (!canAttack(s, u, i)) continue;
    const target = targetAt(s, u, i)!;
    const o = odds(s, u, target);
    const hp = target.kind === 'unit' ? target.unit.hp : target.st.hp;
    const kills = o.damageToDefender >= hp;
    const v = o.damageToDefender - o.damageToAttacker * 1.2 + (kills ? 40 : 0);
    if (u.hp - o.damageToAttacker < 25 && !kills) continue;
    if (v > bestV) {
      bestV = v;
      bestT = i;
    }
  }
  if (bestT >= 0) {
    act(s, civId, { type: 'attack', unit: u.id, tile: bestT });
    return;
  }
  const home = u.home !== null ? settlementById(s, u.home) : undefined;
  // wounded: rest at home
  if (u.hp < 45) {
    const dest = home ?? civSettlements(s, civId)[0];
    if (dest && !dest.footprint.includes(u.tile)) moveToward(s, u, dest.footprint);
    else act(s, civId, { type: 'fortify', unit: u.id });
    return;
  }
  // defend threatened settlements
  const threatened = civSettlements(s, civId)
    .filter((st) => enemiesNear(s, civId, st.center, 5) > 0)
    .sort((a, b) => distance(s.w, a.center, u.tile) - distance(s.w, b.center, u.tile))[0];
  if (threatened && distance(s.w, threatened.center, u.tile) <= 10) {
    if (!threatened.footprint.includes(u.tile)) moveToward(s, u, threatened.footprint);
    else act(s, civId, { type: 'fortify', unit: u.id });
    return;
  }
  // offence: march on the nearest known enemy settlement and encircle it
  if (atWarWithAnyone(s, civId) && u.type !== 'scout') {
    const vis = s.civs[civId].vis;
    const target = s.settlements
      .filter((st) => atWar(s, civId, st.civId) && vis[st.center] > 0)
      .sort((a, b) => distance(s.w, a.center, u.tile) - distance(s.w, b.center, u.tile))[0];
    if (target && distance(s.w, target.center, u.tile) <= 30) {
      const ring: number[] = [];
      for (const f of target.footprint) {
        for (let d = 0; d < 6; d++) {
          const n = neighbour(g, f, d);
          if (n >= 0 && !target.footprint.includes(n) && isPassable(s.tiles[n])) ring.push(n);
        }
      }
      if (ring.includes(u.tile)) {
        act(s, civId, { type: 'fortify', unit: u.id });
        return;
      }
      const free = ring.filter((i) => !militaryAt(s, i) && canOccupy(s, u, i));
      if (free.length) {
        moveToward(s, u, free);
        return;
      }
    }
  }
  // peace-time garrison: settlements without a defender first
  const sts = civSettlements(s, civId);
  const needy = sts
    .filter((st) => garrison(s, st) === 0 && !st.footprint.some((i) => militaryAt(s, i)?.civId === civId))
    .sort((a, b) => distance(s.w, a.center, u.tile) - distance(s.w, b.center, u.tile))[0];
  const inOwnFootprint = sts.some((st) => st.footprint.includes(u.tile));
  if (needy && !inOwnFootprint) {
    moveToward(s, u, needy.footprint);
    const after = unitById(s, u.id);
    if (after && needy.footprint.includes(after.tile) && after.home !== needy.id) act(s, civId, { type: 'rehome', unit: u.id });
    return;
  }
  if (!inOwnFootprint && ownerCiv(s, u.tile) !== civId && home) {
    moveToward(s, u, home.footprint);
    return;
  }
  act(s, civId, { type: 'fortify', unit: u.id });
}

function moveToward(s: GameState, u: Unit, tiles: number[]) {
  const sorted = [...tiles].sort((a, b) => distance(s.w, a, u.tile) - distance(s.w, b, u.tile));
  for (const t of sorted.slice(0, 4)) {
    if (t === u.tile) return;
    if (!canOccupy(s, u, t)) continue;
    const r = act(s, u.civId, { type: 'move', unit: u.id, to: t });
    if (r.ok) return;
  }
}

/** Run AI civs until it is a human's turn or the game ends. */
export function runUntilHuman(s: GameState, maxSteps = 10_000): void {
  let steps = 0;
  while (s.winner === null && !s.civs[s.current].human && steps++ < maxSteps) {
    runAI(s, s.current);
    applyAction(s, { type: 'endTurn' }, s.current);
  }
}
