// Migration (DESIGN §10): attractiveness, drift, refugees; stability (§11.2–11.3).
import { BUILDING, CLOSED_BORDER_STABILITY, DRIFT_RANGE, MIGRATION_ATTACHMENT, TIER_POP } from './data';
import { distance } from './hex';
import { chance } from './rng';
import { activeBuildings, nextThreshold } from './settlement';
import type { GameState, Settlement } from './types';
import { atWar, bordersOpen, civSettlements, dijkstra, distinctLuxuries, isMilitary, log } from './world';

// Stability ---------------------------------------------------------------------------

export interface StabilityTerm {
  label: string;
  value: number;
}

export function stabilityTerms(s: GameState, civId: number): StabilityTerm[] {
  const sts = civSettlements(s, civId);
  const people =
    sts.reduce((a, st) => a + st.pop, 0) +
    s.units.filter((u) => u.civId === civId && isMilitary(u)).length;
  let shrines = 0;
  let zig = 0;
  for (const st of sts) {
    const b = activeBuildings(st);
    if (b.includes('shrine')) shrines++;
    if (b.includes('ziggurat')) zig++;
  }
  const closed = Object.values(s.civs[civId].closed).filter(Boolean).length;
  return [
    { label: 'Base', value: 5 },
    { label: 'Luxuries', value: 3 * distinctLuxuries(s, civId) },
    { label: BUILDING.shrine.name + 's', value: 2 * shrines },
    { label: BUILDING.ziggurat.name, value: 3 * zig },
    { label: 'Settlements beyond the first', value: -Math.max(0, sts.length - 1) },
    { label: 'People (incl. soldiers)', value: -Math.floor(people / 4) },
    { label: 'Closed borders', value: -CLOSED_BORDER_STABILITY * closed },
  ];
}

export function stability(s: GameState, civId: number): number {
  return stabilityTerms(s, civId).reduce((a, t) => a + t.value, 0);
}

export function stabilityBand(v: number): 0 | 1 | 2 {
  return v >= 0 ? 0 : v > -10 ? 1 : 2;
}

// Attractiveness -------------------------------------------------------------------------

export interface AttractTerms {
  food: number;
  stability: number;
  amenities: number;
  crowding: number;
  safety: number;
}

export function attractTerms(s: GameState, st: Settlement): AttractTerms {
  const band = stabilityBand(stability(s, st.civId));
  const next = nextThreshold(st) ?? TIER_POP[3] + 5;
  let safety = 0;
  if (st.besieged) safety -= 10;
  if (s.units.some((u) => isMilitary(u) && atWar(s, u.civId, st.civId) && distance(s.w, u.tile, st.center) <= 3)) safety -= 5;
  return {
    food: (2 * st.lastFoodNet) / Math.max(1, st.pop),
    stability: band === 0 ? 0 : band === 1 ? -2 : -4,
    amenities: activeBuildings(st).length,
    crowding: -2 * Math.max(0, st.pop - next),
    safety,
  };
}

export function attractiveness(s: GameState, st: Settlement): number {
  const t = attractTerms(s, st);
  return t.food + t.stability + t.amenities + t.crowding + t.safety;
}

function canMigrateBetween(s: GameState, a: number, b: number): boolean {
  return a === b || (bordersOpen(s, a, b) && !atWar(s, a, b));
}

const REASON: Record<keyof AttractTerms, string> = {
  food: 'food',
  stability: 'unrest',
  amenities: 'amenities',
  crowding: 'crowding',
  safety: 'danger',
};

/** End-of-round drift: at most one person leaves each settlement (DESIGN §10.3). */
export function resolveDrift(s: GameState): void {
  const snapshot = s.settlements.filter((st) => st.pop >= 2);
  const attract = new Map(s.settlements.map((st) => [st.id, attractiveness(s, st)]));
  const terms = new Map(s.settlements.map((st) => [st.id, attractTerms(s, st)]));
  for (const home of snapshot) {
    if (home.pop < 2) continue;
    const reach = dijkstra(s, [home.center], { maxCost: DRIFT_RANGE });
    let best: Settlement | null = null;
    let bestPull = 0;
    for (const t of s.settlements) {
      if (t.id === home.id) continue;
      const c = reach.get(t.center);
      if (c === undefined) continue;
      if (!canMigrateBetween(s, home.civId, t.civId)) continue;
      const pull = attract.get(t.id)! - attract.get(home.id)! - 0.5 * c - MIGRATION_ATTACHMENT[home.emigration];
      if (pull > bestPull) {
        bestPull = pull;
        best = t;
      }
    }
    if (!best || !chance(s.rng, Math.min(0.5, bestPull / 10))) continue;
    home.pop -= 1;
    best.pop += 1;
    const th = terms.get(home.id)!;
    const tt = terms.get(best.id)!;
    let reason: keyof AttractTerms = 'food';
    let gap = -Infinity;
    for (const k of Object.keys(th) as (keyof AttractTerms)[]) {
      if (tt[k] - th[k] > gap) {
        gap = tt[k] - th[k];
        reason = k;
      }
    }
    const text = `1 person left ${home.name} for ${best.name}: ${REASON[reason]}.`;
    log(s, home.civId, 'migration', text);
    if (best.civId !== home.civId) {
      log(s, best.civId, 'migration', text);
      const o = (s.civs[home.civId].outflow[best.civId] ??= []);
      o.push(s.turn);
    }
  }
}

/**
 * Displaced people go to the nearest own settlement within range, else the most attractive
 * open-border settlement within range, else are lost (DESIGN §10.4).
 */
export function sendRefugees(s: GameState, civId: number, count: number, fromTile: number, exclude: number | null): void {
  if (count <= 0) return;
  const reach = dijkstra(s, [fromTile], { maxCost: DRIFT_RANGE });
  for (let k = 0; k < count; k++) {
    let dest: Settlement | null = null;
    let bestCost = Infinity;
    for (const st of s.settlements) {
      if (st.civId !== civId || st.id === exclude || st.besieged) continue;
      const c = reach.get(st.center);
      if (c !== undefined && c < bestCost) {
        bestCost = c;
        dest = st;
      }
    }
    if (!dest) {
      let bestA = -Infinity;
      for (const st of s.settlements) {
        if (st.civId === civId || st.id === exclude || st.besieged) continue;
        if (!reach.has(st.center) || !canMigrateBetween(s, civId, st.civId)) continue;
        const a = attractiveness(s, st);
        if (a > bestA) {
          bestA = a;
          dest = st;
        }
      }
    }
    if (dest) {
      dest.pop += 1;
      log(s, civId, 'migration', `A refugee reached ${dest.name}.`);
      if (dest.civId !== civId) log(s, dest.civId, 'migration', `A refugee from ${s.civs[civId].name} reached ${dest.name}.`);
    } else {
      log(s, civId, 'migration', 'A refugee was lost.');
    }
  }
}
