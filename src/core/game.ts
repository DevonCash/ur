// Game rules entry point: new game, turn processing (DESIGN §4), and applyAction.
// Every change to game state, human or AI, goes through applyAction (mutates state in place).
import { generateMap } from '../mapgen/mapgen';
import { attack, captureCiviliansAt, settlementShoot, type CombatHooks } from './combat';
import {
  AUTO_DEV_TURNS, BUILDING, FOOD_PER_PERSON, HINTERLAND_RANGE, PRISONER_FOOD, UNIT_FOOD, MIN_SETTLEMENT_DISTANCE, PRISONER_SETTLE_TURNS, PROJECT,
  RANKS, RUSH_GOLD_PER_PROD, TECH, TECH_ORDER, TIER_POOL_CAP, TIER_POOL_REFILL, TIER_POP, TIER_TURNS, TURN_LIMIT,
  UNIT, growthThreshold, rankOf, upgradeTarget,
  type ImprovementId, type ProjectKind, type TechId, type UnitType,
} from './data';
import { distance, neighbour } from './hex';
import { resolveDrift, sendRefugees, stability, stabilityBand } from './migration';
import { chance, nextInt, type RngState } from './rng';
import {
  activeBuildings, assignWorked, buildingAllowed, fedSoldiers, hasBuilding, maxHp, recomputeTerritory, setTier,
  settlementYields, tierPopulation, unitsHomed,
} from './settlement';
import type { Civ, GameState, Emigration, ProductionItem, Settlement, Unit } from './types';
import { canOccupy, createUnit, enemyInView, exploreTarget, inEnemyZoc, moveUnit, pathFor, updateVision } from './units';
import {
  atWar, civSettlements, civUnits, civilianAt, dijkstra, economicStepCost, findPath, grid, hasResource, hasTech, isFlat,
  isLand, isMilitary, isPassable, log, militaryAt, newId, ownerCiv, relKey, relation, settlementAtTile,
  settlementById, tileYields, unitById,
} from './world';

export const CIV_NAMES = ['Ashkari', 'Belunar', 'Tesheva', 'Orukai'];
export const CIV_COLORS = [0x2f6fdf, 0xd8432e, 0xd9a21b, 0x2f9e5c];
const SYLLABLES = ['ka', 'ru', 'mel', 'ash', 'ten', 'bo', 'li', 'sar', 'un', 'eri', 'dah', 'zi', 'nam', 'tor', 'ul', 'ga', 'pes', 'hir'];

export interface NewGameOptions {
  seed: number;
  aiCount?: number;
  w?: number;
  h?: number;
  allAi?: boolean;
}

export function newGame(opts: NewGameOptions): GameState {
  const aiCount = opts.aiCount ?? 2;
  const w = opts.w ?? 80;
  const h = opts.h ?? 52;
  const rng: RngState = { s: opts.seed | 0 };
  const map = generateMap(w, h, rng, aiCount + 1);
  const s: GameState = {
    version: 1, seed: opts.seed, turn: 1, current: 0, w, h, tiles: map.tiles, civs: [], settlements: [],
    units: [], prisoners: [], ransoms: [], peaceOffers: [], relations: {}, nextId: 1, rng, log: [],
    winner: null, victory: null, options: { aiCount },
  };
  for (let c = 0; c <= aiCount; c++) {
    const civ: Civ = {
      id: c, name: CIV_NAMES[c], color: CIV_COLORS[c], human: c === 0 && !opts.allAi, alive: true, gold: 0,
      science: 0, researching: null, techs: ['foraging'], capitalId: null, originalCapitalId: null,
      vis: new Array(w * h).fill(0), closed: {}, bankrupt: false, outflow: {}, settlementNames: 0,
    };
    s.civs.push(civ);
    const start = map.starts[c];
    createUnit(s, c, 'migrants', start, null, 2);
    const g = grid(s);
    const free: number[] = [];
    for (let d = 0; d < 6 && free.length < 2; d++) {
      const n = neighbour(g, start, d);
      if (n >= 0 && isPassable(s.tiles[n])) free.push(n);
    }
    createUnit(s, c, 'warrior', start, null);
    createUnit(s, c, 'scout', free[0] ?? start, null);
  }
  for (const c of s.civs) updateVision(s, c.id);
  startTurn(s, 0);
  return s;
}

// Hooks for combat --------------------------------------------------------------------

function addWarScore(s: GameState, civ: number, other: number, pts: number) {
  const r = relation(s, civ, other);
  r.score += civ < other ? pts : -pts;
}

export function warScore(s: GameState, civ: number, other: number): number {
  const r = relation(s, civ, other);
  return civ < other ? r.score : -r.score;
}

export function removeUnit(s: GameState, u: Unit, killerCiv: number | null = null) {
  s.units = s.units.filter((x) => x.id !== u.id);
  if (killerCiv !== null && killerCiv !== u.civId) addWarScore(s, killerCiv, u.civId, 1);
}

function nearestSettlementOf(s: GameState, civId: number, tile: number): Settlement | null {
  let best: Settlement | null = null;
  let bd = Infinity;
  for (const st of civSettlements(s, civId)) {
    const d = distance(s.w, st.center, tile);
    if (d < bd) {
      bd = d;
      best = st;
    }
  }
  return best;
}

export function takePrisoner(s: GameState, victim: Unit, captorCiv: number, at: number) {
  removeUnit(s, victim, isMilitary(victim) ? captorCiv : null);
  const holder = nearestSettlementOf(s, captorCiv, at);
  if (!holder) return;
  const n = isMilitary(victim) ? 1 : victim.people;
  for (let k = 0; k < n; k++) {
    s.prisoners.push({
      id: newId(s), civId: victim.civId, holderCivId: captorCiv, settlementId: holder.id, turns: 0,
      rank: isMilitary(victim) ? rankOf(victim.xp) : 0,
    });
  }
  log(s, captorCiv, 'prisoner', `${n} prisoner${n > 1 ? 's' : ''} taken to ${holder.name}.`);
  log(s, victim.civId, 'prisoner', `${n} of our people taken prisoner by ${s.civs[captorCiv].name}.`);
}

export function captureSettlement(s: GameState, st: Settlement, captor: number, unit: Unit | null) {
  const old = st.civId;
  const r = relation(s, captor, old);
  r.captures += 1;
  addWarScore(s, captor, old, 5);
  // garrison and civilians in the footprint become prisoners
  for (const u of s.units.filter((x) => x.civId === old && st.footprint.includes(x.tile))) {
    takePrisoner(s, u, captor, st.center);
  }
  // prisoners of the captor held here go free
  for (const p of s.prisoners.filter((x) => x.settlementId === st.id)) {
    if (p.civId === captor) {
      st.pop += 1;
      s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
    } else p.holderCivId = captor;
  }
  const fleeing = Math.floor(st.pop * 0.25);
  st.pop -= fleeing;
  sendRefugees(s, old, fleeing, st.center, st.id);
  log(s, -1, 'settlement', `${s.civs[captor].name} captured ${st.name} from ${s.civs[old].name}.`);
  if (st.tier === 0) {
    const rest = st.pop;
    st.pop = 0;
    sendRefugees(s, old, rest, st.center, st.id);
    destroySettlement(s, st);
  } else {
    st.civId = captor;
    setTier(s, st, st.tier - 1);
    st.buildings = st.buildings.filter(() => !chance(s.rng, 0.5));
    st.production = null;
    st.prodStored = 0;
    st.recruits = 0;
    st.recruitTimer = 0;
    st.food = 0;
    st.locked = [];
    st.besieged = false;
    st.emigration = 'normal';
    st.hp = Math.floor(maxHp(st) / 4);
    for (const u of s.units.filter((x) => x.home === st.id && x.civId === old)) {
      u.home = nearestSettlementOf(s, old, u.tile)?.id ?? null;
    }
    if (unit && unit.hp > 0) {
      unit.tile = st.center;
      unit.home ??= st.id;
    }
  }
  fixCapital(s, old);
  if (s.civs[captor].capitalId === null) fixCapital(s, captor);
  recomputeTerritory(s);
  updateVision(s, captor);
  updateVision(s, old);
  checkElimination(s);
}

function destroySettlement(s: GameState, st: Settlement) {
  for (const i of st.footprint) s.tiles[i].urban = -1;
  for (const t of s.tiles) if (t.owner === st.id) t.owner = -1;
  s.settlements = s.settlements.filter((x) => x.id !== st.id);
  for (const u of s.units.filter((x) => x.home === st.id)) u.home = nearestSettlementOf(s, u.civId, u.tile)?.id ?? null;
  for (const p of s.prisoners.filter((x) => x.settlementId === st.id)) {
    s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
    sendRefugees(s, p.civId, 1, st.center, st.id);
  }
  fixCapital(s, st.civId);
  recomputeTerritory(s);
}

function fixCapital(s: GameState, civId: number) {
  const civ = s.civs[civId];
  const sts = civSettlements(s, civId).filter((x) => x.civId === civId);
  if (civ.capitalId !== null && sts.some((x) => x.id === civ.capitalId)) return;
  const best = sts.sort((a, b) => b.pop - a.pop)[0];
  civ.capitalId = best ? best.id : null;
}

export const hooks: CombatHooks = { takePrisoner, captureSettlement, removeUnit };

// Elimination & victory ------------------------------------------------------------------

export function checkElimination(s: GameState) {
  for (const civ of s.civs) {
    if (!civ.alive) continue;
    const hasSettlement = s.settlements.some((x) => x.civId === civ.id);
    const hasMigrants = s.units.some((u) => u.civId === civ.id && u.type === 'migrants');
    if (!hasSettlement && !hasMigrants) {
      civ.alive = false;
      s.units = s.units.filter((u) => u.civId !== civ.id);
      log(s, -1, 'info', `${civ.name} has been eliminated.`);
    }
  }
  checkConquest(s);
}

function checkConquest(s: GameState) {
  if (s.winner !== null) return;
  const alive = s.civs.filter((c) => c.alive);
  if (alive.length === 1) {
    s.winner = alive[0].id;
    s.victory = 'conquest';
    return;
  }
  if (s.civs.some((c) => c.originalCapitalId === null)) return;
  const caps = s.civs.map((c) => settlementById(s, c.originalCapitalId!)).filter((x): x is Settlement => !!x);
  if (caps.length < s.civs.length) return; // a capital was destroyed: conquest needs elimination
  const owner = caps[0].civId;
  if (caps.every((c) => c.civId === owner)) {
    s.winner = owner;
    s.victory = 'conquest';
  }
}

export function score(s: GameState, civId: number): number {
  const sts = civSettlements(s, civId);
  const people = sts.reduce((a, x) => a + x.pop, 0) + civUnits(s, civId).reduce((a, u) => a + (isMilitary(u) ? 1 : u.people), 0);
  const tierPts = sts.reduce((a, x) => a + [1, 2, 4, 8][x.tier], 0);
  let territory = 0;
  const ids = new Set(sts.map((x) => x.id));
  for (const t of s.tiles) if (ids.has(t.owner)) territory++;
  const zig = sts.some((x) => x.buildings.includes('ziggurat')) ? 20 : 0;
  return 4 * people + tierPts + 5 * s.civs[civId].techs.length + Math.floor(0.5 * territory) + zig;
}

// Production -----------------------------------------------------------------------------

export function itemCost(s: GameState, st: Settlement, item: ProductionItem): number {
  if (item.kind === 'unit') return UNIT[item.unit].prod;
  if (item.kind === 'building') return BUILDING[item.building].cost;
  if (item.project === 'road') return PROJECT.road.cost * Math.max(1, roadPath(s, st, item.tile).filter((i) => !s.tiles[i].road).length);
  return PROJECT[item.project].cost;
}

function roadPath(s: GameState, st: Settlement, tile: number): number[] {
  const p = findPath(s, st.center, tile, (t) => {
    const oc = ownerCiv(s, t);
    return oc === -1 || oc === st.civId;
  });
  return p ? p.path : [];
}

export function autoDevImprovement(s: GameState, civ: Civ, i: number): ImprovementId | null {
  const t = s.tiles[i];
  if (t.urban >= 0 || !isLand(t)) return null;
  if ((t.resource === 'cattle' || t.resource === 'horses') && hasTech(civ, 'herding')) return 'pasture';
  if (isFlat(t) && t.resource !== 'cattle' && t.resource !== 'horses' && hasTech(civ, 'tilling')) return 'farm';
  return null;
}

export function unitAllowed(s: GameState, st: Settlement, type: UnitType): string | null {
  const def = UNIT[type];
  const civ = s.civs[st.civId];
  if (!def.prod) return 'Only by upgrade';
  if (!def.tech.every((t) => hasTech(civ, t))) return 'Needs tech';
  if (def.resource && !hasResource(s, st.civId, def.resource)) return `Needs ${def.resource}`;
  if (st.tier < def.minTier) return `Needs ${['Camp', 'Village', 'Town', 'City'][def.minTier]}`;
  return null;
}

export function projectAllowed(s: GameState, st: Settlement, item: Extract<ProductionItem, { kind: 'project' }>): string | null {
  const civ = s.civs[st.civId];
  if (!PROJECT[item.project].tech.every((t) => hasTech(civ, t))) return 'Needs tech';
  const t = s.tiles[item.tile];
  if (t.owner !== st.id && !(item.project === 'road' && ownerCiv(s, item.tile) === st.civId)) return 'Not in territory';
  if (t.urban >= 0) return 'Urban tile';
  switch (item.project) {
    case 'mine':
      return t.feature === 'hills' && t.improvement !== 'mine' ? null : 'Needs hills';
    case 'lumber':
      return t.feature === 'forest' && t.improvement !== 'lumber' ? null : 'Needs forest';
    case 'road':
      return t.road ? 'Already a road' : null;
    case 'repair':
      return t.pillaged ? null : 'Nothing to repair';
    case 'rushdev':
      return !t.improvement && autoDevImprovement(s, civ, item.tile) ? null : 'Nothing to develop';
  }
}

/** Every tile where the project could be placed now (DESIGN §8.3). */
export function projectTargets(s: GameState, st: Settlement, project: ProjectKind): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.tiles.length; i++) {
    if (ownerCiv(s, i) !== st.civId) continue;
    if (!projectAllowed(s, st, { kind: 'project', project, tile: i })) out.push(i);
  }
  return out;
}

/** Why a project button is unavailable, or null if it has at least one target. */
export function projectUnavailable(s: GameState, st: Settlement, project: ProjectKind): string | null {
  const civ = s.civs[st.civId];
  const missing = PROJECT[project].tech.filter((t) => !hasTech(civ, t));
  if (missing.length) return `Needs ${missing.map((t) => TECH[t].name).join(', ')}`;
  if (projectTargets(s, st, project).length) return null;
  switch (project) {
    case 'mine':
      return 'No unmined hills in territory';
    case 'lumber':
      return 'No forest without a lumber camp in territory';
    case 'road':
      return 'No road-less tiles in territory';
    case 'repair':
      return 'No pillaged tiles';
    case 'rushdev':
      return hasTech(civ, 'tilling') || hasTech(civ, 'herding') ? 'No tiles to develop' : 'Needs Tilling or Herding';
  }
}

function placementTile(s: GameState, st: Settlement, military: boolean): number {
  for (const i of st.footprint) {
    const busy = military ? militaryAt(s, i) : civilianAt(s, i);
    if (!busy && !s.units.some((u) => u.tile === i && u.civId !== st.civId)) return i;
  }
  return -1;
}

function completeItem(s: GameState, st: Settlement): boolean {
  const item = st.production!;
  const civ = s.civs[st.civId];
  if (item.kind === 'unit') {
    const def = UNIT[item.unit];
    const people = item.unit === 'migrants' ? Math.max(1, Math.min(2, item.people ?? 1)) : 1;
    if (st.pop < people + 1) return false;
    if (item.unit !== 'migrants' && st.recruits < 1) return false;
    if (unitAllowed(s, st, item.unit)) return false;
    const tile = placementTile(s, st, def.cls !== 'civilian');
    if (tile < 0) return false;
    st.pop -= people;
    if (item.unit !== 'migrants') st.recruits -= 1;
    const u = createUnit(s, st.civId, item.unit, tile, item.unit === 'migrants' ? null : st.id, people);
    if (hasBuilding(st, 'barracks') && isMilitary(u)) u.xp = RANKS[1].xp;
    u.moves = 0;
    log(s, st.civId, 'settlement', `${st.name} trained ${def.name}.`);
  } else if (item.kind === 'building') {
    if (!buildingAllowed(s, st, item.building)) {
      st.production = null;
      return true;
    }
    st.buildings.push(item.building);
    st.hp = Math.min(maxHp(st), st.hp + (item.building === 'walls' ? 100 : 0));
    log(s, st.civId, 'settlement', `${st.name} built ${BUILDING[item.building].name}.`);
  } else {
    if (projectAllowed(s, st, item)) {
      st.production = null;
      return true;
    }
    const t = s.tiles[item.tile];
    if (item.project === 'mine') t.improvement = 'mine';
    if (item.project === 'lumber') t.improvement = 'lumber';
    if (item.project === 'repair') t.pillaged = false;
    if (item.project === 'rushdev') t.improvement = autoDevImprovement(s, civ, item.tile);
    if (item.project === 'road') for (const i of roadPath(s, st, item.tile)) s.tiles[i].road = true;
    if (item.project !== 'repair' && item.project !== 'road') t.pillaged = false;
    log(s, st.civId, 'settlement', `${st.name} completed ${PROJECT[item.project].name}.`);
    recomputeTerritory(s);
  }
  return true;
}

// Turn processing ------------------------------------------------------------------------------

function siegeCheck(s: GameState, st: Settlement): boolean {
  const g = grid(s);
  const ring = new Set<number>();
  for (const f of st.footprint) {
    for (let d = 0; d < 6; d++) {
      const n = neighbour(g, f, d);
      if (n >= 0 && !st.footprint.includes(n) && isPassable(s.tiles[n])) ring.add(n);
    }
  }
  if (!ring.size) return false;
  let anyEnemy = false;
  for (const t of ring) {
    const m = militaryAt(s, t);
    const enemyHere = !!m && atWar(s, m.civId, st.civId);
    if (enemyHere) anyEnemy = true;
    if (!enemyHere && !inEnemyZoc(s, st.civId, t)) return false;
  }
  return anyEnemy;
}

function besiegerOf(s: GameState, st: Settlement): { civ: number; unit: Unit } | null {
  const g = grid(s);
  const counts = new Map<number, Unit[]>();
  for (const f of st.footprint) {
    for (let d = 0; d < 6; d++) {
      const n = neighbour(g, f, d);
      const m = n >= 0 ? militaryAt(s, n) : undefined;
      if (m && atWar(s, m.civId, st.civId)) counts.set(m.civId, [...(counts.get(m.civId) ?? []), m]);
    }
  }
  let best: { civ: number; unit: Unit } | null = null;
  let n = 0;
  for (const [civ, us] of counts) if (us.length > n) {
    n = us.length;
    best = { civ, unit: us.find((u) => UNIT[u.type].cls === 'melee' || UNIT[u.type].cls === 'mounted') ?? us[0] };
  }
  return best;
}

function hubFor(s: GameState, st: Settlement): Settlement | null {
  if (st.tier >= 2) return null;
  const enemyTiles = new Set(s.units.filter((u) => isMilitary(u) && atWar(s, u.civId, st.civId)).map((u) => u.tile));
  const reach = dijkstra(s, [st.center], {
    maxCost: HINTERLAND_RANGE,
    canEnter: (t) => !enemyTiles.has(t),
    cost: (a, b, d) => economicStepCost(s, st.civId, a, b, d),
  });
  let best: Settlement | null = null;
  let bc = Infinity;
  for (const o of civSettlements(s, st.civId)) {
    if (o.tier < 2 || o.besieged) continue;
    const c = reach.get(o.center);
    if (c !== undefined && c < bc) {
      bc = c;
      best = o;
    }
  }
  return best;
}

export interface FoodBreakdown {
  gross: number;
  people: number;
  soldiers: number;
  prisoners: number;
  /** gross minus everyone fed */
  net: number;
  /** surplus lost to unrest (§11.3) */
  unrest: number;
  /** surplus sent to the hub (§7.11) */
  toHub: number;
  hub: Settlement | null;
  /** what reaches this settlement's store */
  toStore: number;
  threshold: number;
  /** turns until the next person, null if not growing */
  turnsToGrow: number | null;
}

/** Where a settlement's food goes this turn (DESIGN §7.2, §7.11, §11.3). */
export function foodBreakdown(s: GameState, st: Settlement, band = stabilityBand(stability(s, st.civId))): FoodBreakdown {
  const y = settlementYields(s, st);
  const people = st.pop * FOOD_PER_PERSON;
  const soldiers = fedSoldiers(s, st) * UNIT_FOOD;
  const prisoners = s.prisoners.filter((p) => p.settlementId === st.id).length * PRISONER_FOOD;
  const net = y.food - people - soldiers - prisoners;
  let surplus = net;
  let unrest = 0;
  if (surplus > 0 && band > 0) {
    const kept = band === 1 ? Math.floor(surplus / 2) : 0;
    unrest = surplus - kept;
    surplus = kept;
  }
  const hub = surplus > 0 && !st.besieged ? hubFor(s, st) : null;
  const toHub = hub ? Math.floor(surplus / 2) : 0;
  const toStore = net > 0 ? surplus - toHub : net;
  const threshold = growthThreshold(st.pop);
  const turnsToGrow = toStore > 0 ? Math.max(1, Math.ceil((threshold - st.food) / toStore)) : null;
  return { gross: y.food, people, soldiers, prisoners, net, unrest, toHub, hub, toStore, threshold, turnsToGrow };
}

function abandon(s: GameState, st: Settlement) {
  log(s, st.civId, 'settlement', `${st.name} was abandoned.`);
  destroySettlement(s, st);
  checkElimination(s);
}

export function startTurn(s: GameState, civId: number): void {
  const civ = s.civs[civId];
  if (!civ.alive) return;
  const band = stabilityBand(stability(s, civId));
  const sts = civSettlements(s, civId);

  // 1. siege status
  for (const st of sts) {
    const was = st.besieged;
    st.besieged = siegeCheck(s, st);
    if (st.besieged && !was) log(s, civId, 'settlement', `${st.name} is besieged!`);
  }

  recomputeTerritory(s);
  let gold = 0;
  let science = 0;
  for (const st of sts) {
    st.rangedUsed = false;
    // 2. yields
    assignWorked(s, st);
    const y = settlementYields(s, st);
    st.lastFoodNet = y.foodNet;
    // 3. food
    const fb = foodBreakdown(s, st, band);
    if (fb.hub && fb.toHub > 0) fb.hub.food += fb.toHub;
    st.food += fb.toStore;
    if (st.food < 0) {
      st.food = 0;
      st.starveTimer += 1;
      // starvation: every turn under siege (every 2 with a Granary), otherwise every 2 turns
      const every = st.besieged ? (hasBuilding(st, 'granary') ? 2 : 1) : 2;
      if (st.starveTimer >= every) {
        st.starveTimer = 0;
        st.pop -= 1;
        log(s, civId, 'settlement', `A person starved in ${st.name}.`);
        for (const u of unitsHomed(s, st)) u.hp -= 10;
      }
    } else {
      st.starveTimer = 0;
      const thr = growthThreshold(st.pop);
      if (st.food >= thr) {
        st.pop += 1;
        st.food = hasBuilding(st, 'granary') ? Math.floor(thr * 0.25) : 0;
      }
    }
    // 4. production
    let prod = y.prod;
    if (civ.bankrupt) prod = Math.floor(prod * 0.75);
    if (band === 2) prod = Math.floor(prod * 0.75);
    st.lastProd = prod;
    if (st.production) {
      st.prodStored += prod;
      const cost = itemCost(s, st, st.production);
      if (st.prodStored >= cost && completeItem(s, st)) {
        st.prodStored = Math.max(0, st.prodStored - cost);
        st.production = null;
      }
    }
    gold += y.gold;
    science += y.science;
    // culture claims
    st.culture += y.culture;
    const claimCost = 10 + 5 * st.claimed.length;
    if (st.culture >= claimCost) {
      const t = pickClaim(s, st);
      if (t >= 0) {
        st.culture -= claimCost;
        st.claimed.push(t);
        s.tiles[t].owner = st.id;
      }
    }
  }
  for (const st of [...sts]) if (st.pop <= 0 && s.settlements.includes(st)) abandon(s, st);

  // 5. treasury, research
  for (const st of civSettlements(s, civId)) for (const b of activeBuildings(st)) gold -= BUILDING[b].upkeep;
  civ.gold += gold;
  civ.bankrupt = civ.gold < 0;
  if (civ.gold < 0) civ.gold = 0;
  civ.science += science;
  if (civ.researching) {
    const cost = TECH[civ.researching].cost;
    if (civ.science >= cost) {
      civ.science -= cost;
      civ.techs.push(civ.researching);
      log(s, civId, 'research', `Learned ${TECH[civ.researching].name}.`);
      civ.researching = null;
    }
  }

  // 6. tiers
  const stab = stability(s, civId);
  for (const st of civSettlements(s, civId)) {
    const tp = tierPopulation(s, st);
    if (st.tier < 3 && tp >= TIER_POP[st.tier + 1]) {
      if (stab >= 0) st.up += 1;
    } else st.up = 0;
    if (st.tier > 0 && tp < TIER_POP[st.tier]) st.down += 1;
    else st.down = 0;
    if (st.up >= TIER_TURNS) {
      setTier(s, st, st.tier + 1);
      log(s, civId, 'settlement', `${st.name} grew into a ${['Camp', 'Village', 'Town', 'City'][st.tier]}.`);
    } else if (st.down >= TIER_TURNS) {
      setTier(s, st, st.tier - 1);
      log(s, civId, 'settlement', `${st.name} declined to a ${['Camp', 'Village', 'Town', 'City'][st.tier]}.`);
    }
  }

  // 7. units, pools, development, roads, prisoners, settlement healing
  for (const u of civUnits(s, civId)) {
    const homeSt = u.home !== null ? settlementById(s, u.home) : undefined;
    if (homeSt && homeSt.besieged && !homeSt.footprint.includes(u.tile) && isMilitary(u)) {
      u.hp -= 10;
      u.explore = false;
    }
    if (!u.acted) {
      const own = ownerCiv(s, u.tile) === civId;
      const inSt = s.tiles[u.tile].urban >= 0 && settlementAtTile(s, u.tile)?.civId === civId;
      u.hp = Math.min(100, u.hp + (inSt ? 25 : own ? 15 : 10));
    }
    if (u.fortify >= 1) u.fortify = Math.min(2, u.fortify + 1);
    if (u.fortify >= 2 && isMilitary(u)) {
      const here = settlementAtTile(s, u.tile);
      if (here && here.civId === civId && hasBuilding(here, 'barracks')) u.xp += 1;
    }
    u.acted = false;
    u.moves = UNIT[u.type].moves;
  }
  s.units = s.units.filter((u) => u.hp > 0);
  for (const st of civSettlements(s, civId)) {
    if (!st.besieged) st.hp = Math.min(maxHp(st), st.hp + 20);
    const cap = TIER_POOL_CAP[st.tier];
    if (st.recruits >= cap) st.recruitTimer = 0;
    else if (stab >= 0 && !st.besieged) {
      st.recruitTimer += 1;
      const every = TIER_POOL_REFILL[st.tier] - (hasBuilding(st, 'barracks') ? 2 : 0);
      if (st.recruitTimer >= every) {
        st.recruits += 1;
        st.recruitTimer = 0;
      }
    }
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (t.owner !== st.id) continue;
      if (st.worked.includes(i) && !t.improvement) {
        const imp = autoDevImprovement(s, civ, i);
        if (imp) {
          t.dev += 1;
          if (t.dev >= AUTO_DEV_TURNS) {
            t.improvement = imp;
            t.dev = 0;
          }
        } else t.dev = 0;
      } else if (!st.worked.includes(i)) t.dev = 0;
    }
  }
  if (hasTech(civ, 'wheel') && s.turn % 3 === 0) autoRoads(s, civId);
  for (const p of s.prisoners) if (p.holderCivId === civId) p.turns += 1;

  // surrender of starving besieged settlements
  for (const st of civSettlements(s, civId)) {
    if (st.besieged && st.food === 0 && st.pop <= 2) {
      const b = besiegerOf(s, st);
      if (b) {
        log(s, -1, 'settlement', `${st.name} surrendered to ${s.civs[b.civ].name}.`);
        captureSettlement(s, st, b.civ, b.unit);
      }
    }
  }
  recomputeTerritory(s);
  for (const st of civSettlements(s, civId)) assignWorked(s, st);
  updateVision(s, civId);
  runStandingOrders(s, civId);
}

function pickClaim(s: GameState, st: Settlement): number {
  const g = grid(s);
  let best = -1;
  let bs = -Infinity;
  const civ = s.civs[st.civId];
  for (let i = 0; i < s.tiles.length; i++) {
    if (s.tiles[i].owner !== st.id) continue;
    for (let d = 0; d < 6; d++) {
      const n = neighbour(g, i, d);
      if (n < 0 || s.tiles[n].owner >= 0) continue;
      const t = s.tiles[n];
      if (t.terrain === 'ocean') continue;
      if (t.terrain === 'mountain') continue;
      const ty = tileYields(s, n, civ);
      const sc = ty.food + ty.prod + ty.gold - 0.5 * distance(s.w, st.center, n) + (t.resource ? 2 : 0);
      if (sc > bs) {
        bs = sc;
        best = n;
      }
    }
  }
  return best;
}

function autoRoads(s: GameState, civId: number) {
  const sts = civSettlements(s, civId);
  for (const st of sts) {
    let best: { path: number[]; cost: number } | null = null;
    for (const o of sts) {
      if (o.id === st.id) continue;
      const p = findPath(
        s, st.center, o.center,
        (t) => {
          const oc = ownerCiv(s, t);
          return oc === -1 || oc === civId;
        },
        15,
        (a, b, d) => economicStepCost(s, civId, a, b, d),
      );
      if (p && (!best || p.cost < best.cost)) best = p;
    }
    if (!best) continue;
    const next = best.path.find((i) => !s.tiles[i].road);
    if (next !== undefined) s.tiles[next].road = true;
  }
}

/** End of round: drift, ransoms expire, turn advances, score victory. */
function endRound(s: GameState) {
  resolveDrift(s);
  // trim outflow windows to the last 20 turns
  for (const c of s.civs) for (const k of Object.keys(c.outflow)) c.outflow[+k] = c.outflow[+k].filter((t) => t > s.turn - 20);
  // besieged settlements lose people to refugees
  for (const st of s.settlements) {
    if (st.besieged && st.pop > 1 && chance(s.rng, 0.5)) {
      st.pop -= 1;
      sendRefugees(s, st.civId, 1, st.center, st.id);
    }
  }
  s.turn += 1;
  if (s.turn > TURN_LIMIT && s.winner === null) {
    let best = -1;
    let bs = -Infinity;
    for (const c of s.civs) {
      if (!c.alive) continue;
      const sc = score(s, c.id);
      if (sc > bs) {
        bs = sc;
        best = c.id;
      }
    }
    s.winner = best;
    s.victory = 'score';
  }
}

/** Finish the current civ's turn and start the next living civ's. */
export function endTurn(s: GameState): void {
  if (s.winner !== null) return;
  const n = s.civs.length;
  let next = s.current;
  for (let k = 0; k < n; k++) {
    next = (next + 1) % n;
    if (next === 0) endRound(s);
    if (s.winner !== null) return;
    if (s.civs[next].alive) break;
  }
  s.current = next;
  startTurn(s, next);
  checkElimination(s);
}

// Turn blockers --------------------------------------------------------------------------------

export type TurnBlocker = { kind: 'unit'; id: number } | { kind: 'research' } | { kind: 'production'; id: number };

/** A unit needs orders while it has moves left and no standing order (sleep, fortify). */
export function needsOrders(u: Unit): boolean {
  return u.moves > 0 && !u.sleeping && u.fortify === 0 && u.destination == null && !u.explore;
}

function clearOrders(u: Unit) {
  u.destination = null;
  u.explore = false;
}

/** Continue multi-turn moves and auto-explore at the start of a civ's turn (DESIGN §9.4). */
function runStandingOrders(s: GameState, civId: number) {
  for (const u of civUnits(s, civId)) {
    if (u.destination == null && !u.explore) continue;
    const name = UNIT[u.type].name;
    const stop = (why: string) => {
      clearOrders(u);
      log(s, civId, 'info', `${name} stopped: ${why}.`);
    };
    if (u.explore && u.hp < 50) {
      stop('wounded');
      continue;
    }
    if (enemyInView(s, u)) {
      stop('enemy in view');
      continue;
    }
    if (u.destination != null) {
      if (!pathFor(s, u, u.destination)) {
        stop('no route to destination');
        continue;
      }
      moveUnit(s, u, u.destination);
      if (u.tile === u.destination) u.destination = null;
    } else {
      const target = exploreTarget(s, u);
      if (target < 0) {
        stop('nothing left to explore');
        continue;
      }
      moveUnit(s, u, target);
    }
    if (isMilitary(u)) captureCiviliansAt(s, u, u.tile, hooks);
    if ((u.destination != null || u.explore) && enemyInView(s, u)) stop('enemy in view');
  }
}

/** What must be decided before a civ may end its turn: idle units, research, empty production. */
export function turnBlockers(s: GameState, civId: number): TurnBlocker[] {
  const out: TurnBlocker[] = [];
  for (const u of civUnits(s, civId)) if (needsOrders(u)) out.push({ kind: 'unit', id: u.id });
  const civ = s.civs[civId];
  const canResearch = TECH_ORDER.some((t) => !civ.techs.includes(t) && TECH[t].requires.every((r) => civ.techs.includes(r)));
  if (!civ.researching && canResearch) out.push({ kind: 'research' });
  for (const st of civSettlements(s, civId)) if (!st.production) out.push({ kind: 'production', id: st.id });
  return out;
}

// Actions -----------------------------------------------------------------------------------

export type Action =
  | { type: 'move'; unit: number; to: number }
  | { type: 'attack'; unit: number; tile: number }
  | { type: 'fortify' | 'sleep' | 'skip' | 'disband' | 'rehome' | 'upgrade' | 'pillage' | 'found' | 'join' | 'explore' | 'cancelOrders'; unit: number }
  | { type: 'setProduction'; settlement: number; item: ProductionItem | null }
  | { type: 'rushBuy'; settlement: number }
  | { type: 'lockTile'; settlement: number; tile: number }
  | { type: 'setEmigration'; settlement: number; value: Emigration }
  | { type: 'shoot'; settlement: number; tile: number }
  | { type: 'research'; tech: TechId }
  | { type: 'declareWar' | 'proposePeace' | 'acceptPeace' | 'rejectPeace'; civ: number }
  | { type: 'setBorder'; civ: number; closed: boolean }
  | { type: 'ransom' | 'release' | 'settlePrisoner'; prisoner: number }
  | { type: 'answerRansom'; offer: number; accept: boolean }
  | { type: 'endTurn' };

export interface ActionResult {
  ok: boolean;
  msg?: string;
}

const fail = (msg: string): ActionResult => ({ ok: false, msg });
const OK: ActionResult = { ok: true };

export function canFound(s: GameState, u: Unit): string | null {
  if (u.type !== 'migrants') return 'Not migrants';
  const t = s.tiles[u.tile];
  if (!isLand(t) || !isPassable(t)) return 'Invalid tile';
  if (t.urban >= 0) return 'Already a settlement';
  const oc = ownerCiv(s, u.tile);
  if (oc >= 0 && oc !== u.civId) return 'Foreign territory';
  for (const st of s.settlements) if (distance(s.w, st.center, u.tile) < MIN_SETTLEMENT_DISTANCE) return `Too close to ${st.name}`;
  return null;
}

function settlementName(s: GameState, civ: Civ): string {
  const n = 2 + nextInt(s.rng, 2);
  let name = '';
  for (let k = 0; k < n; k++) name += SYLLABLES[nextInt(s.rng, SYLLABLES.length)];
  civ.settlementNames += 1;
  return name[0].toUpperCase() + name.slice(1);
}

function found(s: GameState, u: Unit): Settlement {
  const civ = s.civs[u.civId];
  const st: Settlement = {
    id: newId(s), civId: u.civId, name: settlementName(s, civ), center: u.tile, footprint: [u.tile], pop: u.people,
    food: 10, culture: 0, claimed: [], tier: 0, up: 0, down: 0, production: null, prodStored: 0, buildings: [],
    recruits: TIER_POOL_CAP[0], recruitTimer: 0, locked: [], worked: [], hp: 200, emigration: 'normal',
    besieged: false, starveTimer: 0, founded: s.turn, lastFoodNet: 0, lastProd: 0, rangedUsed: false,
  };
  s.settlements.push(st);
  const t = s.tiles[u.tile];
  t.urban = st.id;
  t.owner = st.id;
  t.road = true;
  t.improvement = null;
  if (civ.capitalId === null) civ.capitalId = st.id;
  if (civ.originalCapitalId === null) civ.originalCapitalId = st.id;
  for (const x of civUnits(s, u.civId)) if (x.home === null && isMilitary(x)) x.home = st.id;
  removeUnit(s, u);
  recomputeTerritory(s);
  assignWorked(s, st);
  updateVision(s, u.civId);
  log(s, u.civId, 'settlement', `Founded ${st.name}.`);
  return st;
}

export function canUpgrade(s: GameState, u: Unit): string | null {
  const to = upgradeTarget(u.type);
  if (!to) return 'No upgrade';
  const def = UNIT[to];
  const civ = s.civs[u.civId];
  if (rankOf(u.xp) < 1) return 'Needs Seasoned';
  if (ownerCiv(s, u.tile) !== u.civId) return 'Must be in own territory';
  if (!def.tech.every((t) => hasTech(civ, t))) return `Needs ${def.tech.map((t) => TECH[t].name).join(', ')}`;
  if (def.resource && !hasResource(s, u.civId, def.resource)) return `Needs ${def.resource}`;
  if (civ.gold < (def.upgradeGold ?? 0)) return `Needs ${def.upgradeGold} gold`;
  if (u.moves <= 0) return 'No moves left';
  return null;
}

export function ransomPrice(p: { rank: number }): number {
  return 30 + 10 * p.rank;
}

function returnPerson(s: GameState, civId: number, nearTile: number) {
  const st = nearestSettlementOf(s, civId, nearTile);
  if (st) st.pop += 1;
}

export function makePeace(s: GameState, a: number, b: number) {
  const r = relation(s, a, b);
  r.state = 'peace';
  r.since = s.turn;
  r.score = 0;
  r.captures = 0;
  s.peaceOffers = s.peaceOffers.filter((o) => !((o.fromCiv === a && o.toCiv === b) || (o.fromCiv === b && o.toCiv === a)));
  for (const p of s.prisoners.filter((x) => (x.civId === a && x.holderCivId === b) || (x.civId === b && x.holderCivId === a))) {
    const holder = settlementById(s, p.settlementId);
    returnPerson(s, p.civId, holder ? holder.center : 0);
    s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
  }
  // military units left inside the other's territory go home
  for (const u of s.units) {
    if (!isMilitary(u)) continue;
    const oc = ownerCiv(s, u.tile);
    if ((u.civId === a && oc === b) || (u.civId === b && oc === a)) {
      const home = nearestSettlementOf(s, u.civId, u.tile);
      const spot = home ? home.footprint.find((i) => canOccupy(s, { ...u, tile: i }, i) && !militaryAt(s, i)) : undefined;
      if (spot !== undefined) u.tile = spot;
      else removeUnit(s, u);
    }
  }
  log(s, a, 'diplomacy', `Peace with ${s.civs[b].name}.`);
  log(s, b, 'diplomacy', `Peace with ${s.civs[a].name}.`);
}

/** AI rule for accepting peace (DESIGN §12). */
export function aiAcceptsPeace(s: GameState, civ: number, other: number): boolean {
  const r = relation(s, civ, other);
  return warScore(s, civ, other) < 0 || (s.turn - r.since >= 20 && r.captures === 0);
}

export function applyAction(s: GameState, a: Action, actor = s.current): ActionResult {
  if (s.winner !== null) return fail('Game over');
  if (actor !== s.current) return fail('Not your turn');
  const civ = s.civs[actor];
  const unitOf = (id: number) => {
    const u = unitById(s, id);
    return u && u.civId === actor ? u : null;
  };
  const stOf = (id: number) => {
    const st = settlementById(s, id);
    return st && st.civId === actor ? st : null;
  };
  switch (a.type) {
    case 'move': {
      const u = unitOf(a.unit);
      if (!u) return fail('No unit');
      if (a.to === u.tile) return fail('Already there');
      if (!pathFor(s, u, a.to)) return fail('Cannot move there');
      clearOrders(u);
      u.destination = a.to;
      u.sleeping = false;
      u.fortify = 0;
      if (u.moves > 0) moveUnit(s, u, a.to);
      if (u.tile === a.to) u.destination = null;
      if (isMilitary(u)) captureCiviliansAt(s, u, u.tile, hooks);
      checkElimination(s);
      return OK;
    }
    case 'explore': {
      const u = unitOf(a.unit);
      if (!u || !isMilitary(u)) return fail('Only military units explore');
      clearOrders(u);
      u.sleeping = false;
      u.fortify = 0;
      u.explore = true;
      if (u.moves > 0) {
        const t = exploreTarget(s, u);
        if (t < 0) {
          u.explore = false;
          return fail('Nothing left to explore');
        }
        moveUnit(s, u, t);
      }
      return OK;
    }
    case 'cancelOrders': {
      const u = unitOf(a.unit);
      if (!u) return fail('No unit');
      clearOrders(u);
      u.sleeping = false;
      u.fortify = 0;
      return OK;
    }
    case 'attack': {
      const u = unitOf(a.unit);
      if (!u) return fail('No unit');
      clearOrders(u);
      const r = attack(s, u, a.tile, hooks);
      if (!r) return fail('Cannot attack');
      updateVision(s, actor);
      checkElimination(s);
      return OK;
    }
    case 'fortify': {
      const u = unitOf(a.unit);
      if (u) clearOrders(u);
      if (!u || !isMilitary(u)) return fail('Cannot fortify');
      u.fortify = Math.max(1, u.fortify);
      u.moves = 0;
      return OK;
    }
    case 'sleep': {
      const u = unitOf(a.unit);
      if (u) clearOrders(u);
      if (!u) return fail('No unit');
      u.sleeping = true;
      return OK;
    }
    case 'skip': {
      const u = unitOf(a.unit);
      if (u) clearOrders(u);
      if (!u) return fail('No unit');
      u.moves = 0;
      return OK;
    }
    case 'disband': {
      const u = unitOf(a.unit);
      if (!u) return fail('No unit');
      const people = isMilitary(u) ? 1 : u.people;
      removeUnit(s, u);
      if (ownerCiv(s, u.tile) === actor) {
        const near = dijkstra(s, [u.tile], { maxCost: 6 });
        const dest = civSettlements(s, actor)
          .filter((st) => near.has(st.center))
          .sort((x, y) => near.get(x.center)! - near.get(y.center)!)[0];
        if (dest) dest.pop += people;
      }
      checkElimination(s);
      return OK;
    }
    case 'rehome': {
      const u = unitOf(a.unit);
      const st = u ? settlementAtTile(s, u.tile) : undefined;
      if (!u || !st || st.civId !== actor || st.id === u.home || !isMilitary(u)) return fail('Cannot rehome here');
      u.home = st.id;
      return OK;
    }
    case 'upgrade': {
      const u = unitOf(a.unit);
      if (!u) return fail('No unit');
      const why = canUpgrade(s, u);
      if (why) return fail(why);
      const to = upgradeTarget(u.type)!;
      civ.gold -= UNIT[to].upgradeGold ?? 0;
      u.type = to;
      u.moves = 0;
      log(s, actor, 'info', `Upgraded to ${UNIT[to].name}.`);
      return OK;
    }
    case 'pillage': {
      const u = unitOf(a.unit);
      if (!u || !isMilitary(u) || u.moves <= 0) return fail('Cannot pillage');
      const t = s.tiles[u.tile];
      const oc = ownerCiv(s, u.tile);
      if (!t.improvement || t.pillaged || oc < 0 || !atWar(s, actor, oc)) return fail('Nothing to pillage');
      t.pillaged = true;
      civ.gold += 10;
      u.moves = 0;
      u.acted = true;
      log(s, oc, 'combat', `${civ.name} pillaged our land.`);
      return OK;
    }
    case 'found': {
      const u = unitOf(a.unit);
      if (!u) return fail('No unit');
      const why = canFound(s, u);
      if (why) return fail(why);
      found(s, u);
      return OK;
    }
    case 'join': {
      const u = unitOf(a.unit);
      const st = u ? settlementAtTile(s, u.tile) : undefined;
      if (!u || u.type !== 'migrants' || !st || st.civId !== actor) return fail('Must be in own settlement');
      st.pop += u.people;
      removeUnit(s, u);
      return OK;
    }
    case 'setProduction': {
      const st = stOf(a.settlement);
      if (!st) return fail('No settlement');
      const item = a.item;
      if (item?.kind === 'unit') {
        const why = unitAllowed(s, st, item.unit);
        if (why) return fail(why);
      } else if (item?.kind === 'building') {
        if (!buildingAllowed(s, st, item.building)) return fail('Not available');
      } else if (item?.kind === 'project') {
        const why = projectAllowed(s, st, item);
        if (why) return fail(why);
      }
      const sameKind = st.production && item && JSON.stringify(st.production) === JSON.stringify(item);
      if (!sameKind) st.prodStored = Math.floor(st.prodStored / 2);
      st.production = item;
      assignWorked(s, st);
      return OK;
    }
    case 'rushBuy': {
      const st = stOf(a.settlement);
      if (!st || !st.production) return fail('Nothing to buy');
      if (st.production.kind === 'project') return fail('Projects cannot be bought');
      const remaining = Math.max(0, itemCost(s, st, st.production) - st.prodStored);
      const price = remaining * RUSH_GOLD_PER_PROD;
      if (civ.gold < price) return fail(`Needs ${price} gold`);
      if (!completeItem(s, st)) return fail('Cannot complete now');
      civ.gold -= price;
      st.prodStored = 0;
      st.production = null;
      updateVision(s, actor);
      return OK;
    }
    case 'lockTile': {
      const st = stOf(a.settlement);
      if (!st || s.tiles[a.tile].owner !== st.id) return fail('Not in territory');
      st.locked = st.locked.includes(a.tile) ? st.locked.filter((x) => x !== a.tile) : [...st.locked, a.tile];
      assignWorked(s, st);
      return OK;
    }
    case 'setEmigration': {
      const st = stOf(a.settlement);
      if (!st) return fail('No settlement');
      st.emigration = a.value;
      return OK;
    }
    case 'shoot': {
      const st = stOf(a.settlement);
      if (!st) return fail('No settlement');
      if (!settlementShoot(s, st, a.tile, hooks)) return fail('Cannot shoot');
      checkElimination(s);
      return OK;
    }
    case 'research': {
      const t = TECH[a.tech];
      if (civ.techs.includes(a.tech) || !t.requires.every((r) => civ.techs.includes(r))) return fail('Not available');
      civ.researching = a.tech;
      return OK;
    }
    case 'declareWar': {
      const r = relation(s, actor, a.civ);
      if (r.state !== 'peace') return fail('Not at peace');
      if (s.turn - r.since < 10) return fail('Peace must last 10 turns');
      r.state = 'war';
      r.since = s.turn;
      r.score = 0;
      r.captures = 0;
      log(s, -1, 'diplomacy', `${civ.name} declared war on ${s.civs[a.civ].name}.`);
      return OK;
    }
    case 'proposePeace': {
      const r = relation(s, actor, a.civ);
      if (r.state !== 'war') return fail('Not at war');
      if (s.turn - r.since < 10) return fail('War must last 10 turns');
      if (s.civs[a.civ].human) {
        if (!s.peaceOffers.some((o) => o.fromCiv === actor && o.toCiv === a.civ)) s.peaceOffers.push({ fromCiv: actor, toCiv: a.civ });
        return { ok: true, msg: 'Offer sent' };
      }
      if (aiAcceptsPeace(s, a.civ, actor)) {
        makePeace(s, actor, a.civ);
        return { ok: true, msg: 'Peace accepted' };
      }
      return fail('Peace refused');
    }
    case 'acceptPeace': {
      if (!s.peaceOffers.some((o) => o.fromCiv === a.civ && o.toCiv === actor)) return fail('No offer');
      makePeace(s, actor, a.civ);
      return OK;
    }
    case 'rejectPeace': {
      s.peaceOffers = s.peaceOffers.filter((o) => !(o.fromCiv === a.civ && o.toCiv === actor));
      return OK;
    }
    case 'setBorder': {
      if (a.civ === actor) return fail('Invalid');
      civ.closed[a.civ] = a.closed;
      return OK;
    }
    case 'ransom': {
      const p = s.prisoners.find((x) => x.id === a.prisoner && x.holderCivId === actor);
      if (!p) return fail('No prisoner');
      const price = ransomPrice(p);
      const owner = s.civs[p.civId];
      if (!owner.alive) return fail('Their civilization is gone');
      if (owner.human) {
        if (!s.ransoms.some((o) => o.prisonerId === p.id)) s.ransoms.push({ id: newId(s), prisonerId: p.id, fromCiv: actor, toCiv: p.civId, price });
        return { ok: true, msg: 'Offer sent' };
      }
      if (owner.gold < price) return fail('They cannot pay');
      owner.gold -= price;
      civ.gold += price;
      const holder = settlementById(s, p.settlementId);
      s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
      returnPerson(s, p.civId, holder ? holder.center : 0);
      log(s, actor, 'prisoner', `Ransomed a prisoner for ${price} gold.`);
      log(s, p.civId, 'prisoner', `Paid ${price} gold to ransom one of our people.`);
      return OK;
    }
    case 'answerRansom': {
      const o = s.ransoms.find((x) => x.id === a.offer && x.toCiv === actor);
      if (!o) return fail('No offer');
      s.ransoms = s.ransoms.filter((x) => x.id !== o.id);
      const p = s.prisoners.find((x) => x.id === o.prisonerId);
      if (!a.accept || !p) return OK;
      if (civ.gold < o.price) return fail('Not enough gold');
      civ.gold -= o.price;
      s.civs[o.fromCiv].gold += o.price;
      const holder = settlementById(s, p.settlementId);
      s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
      returnPerson(s, actor, holder ? holder.center : 0);
      return OK;
    }
    case 'release': {
      const p = s.prisoners.find((x) => x.id === a.prisoner && x.holderCivId === actor);
      if (!p) return fail('No prisoner');
      const holder = settlementById(s, p.settlementId);
      s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
      returnPerson(s, p.civId, holder ? holder.center : 0);
      return OK;
    }
    case 'settlePrisoner': {
      const p = s.prisoners.find((x) => x.id === a.prisoner && x.holderCivId === actor);
      if (!p) return fail('No prisoner');
      if (p.turns < PRISONER_SETTLE_TURNS) return fail(`${PRISONER_SETTLE_TURNS - p.turns} turns until they can settle`);
      const holder = settlementById(s, p.settlementId);
      if (!holder) return fail('No holding settlement');
      holder.pop += 1;
      s.prisoners = s.prisoners.filter((x) => x.id !== p.id);
      log(s, actor, 'prisoner', `A prisoner settled in ${holder.name}.`);
      return OK;
    }
    case 'endTurn':
      endTurn(s);
      return OK;
  }
}
