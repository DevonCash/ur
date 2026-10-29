// Rule tables from DESIGN.md. All numbers are first-pass values for tuning.

export type TerrainId = 'grassland' | 'plains' | 'desert' | 'tundra' | 'coast' | 'ocean' | 'lake' | 'mountain';
export type FeatureId = 'hills' | 'forest' | 'marsh';
export type ResourceId = 'wheat' | 'cattle' | 'stone' | 'copper' | 'horses' | 'dates' | 'lapis';
export type ImprovementId = 'farm' | 'pasture' | 'mine' | 'lumber';
export type UnitType = 'migrants' | 'scout' | 'warrior' | 'slinger' | 'chariot' | 'spearman' | 'bowman' | 'swordsman';
export type BuildingId = 'shrine' | 'granary' | 'barracks' | 'walls' | 'workshop' | 'library' | 'market' | 'ziggurat';
export type TechId =
  | 'foraging' | 'hunting' | 'herding' | 'tilling' | 'stoneworking' | 'archery' | 'wheel'
  | 'irrigation' | 'pottery' | 'masonry' | 'bronze' | 'writing' | 'mathematics' | 'ironworking';

export interface Yields {
  food: number;
  prod: number;
  gold: number;
}

export interface TerrainDef {
  name: string;
  yields: Yields;
  cost: number; // Infinity = impassable
  defence: number;
  water: boolean;
  workable: boolean;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  grassland: { name: 'Grassland', yields: { food: 2, prod: 0, gold: 0 }, cost: 1, defence: 0, water: false, workable: true },
  plains: { name: 'Plains', yields: { food: 1, prod: 1, gold: 0 }, cost: 1, defence: 0, water: false, workable: true },
  desert: { name: 'Desert', yields: { food: 0, prod: 0, gold: 0 }, cost: 1, defence: 0, water: false, workable: true },
  tundra: { name: 'Tundra', yields: { food: 1, prod: 0, gold: 0 }, cost: 1, defence: 0, water: false, workable: true },
  coast: { name: 'Coast', yields: { food: 1, prod: 0, gold: 1 }, cost: Infinity, defence: 0, water: true, workable: true },
  ocean: { name: 'Ocean', yields: { food: 1, prod: 0, gold: 0 }, cost: Infinity, defence: 0, water: true, workable: false },
  lake: { name: 'Lake', yields: { food: 2, prod: 0, gold: 1 }, cost: Infinity, defence: 0, water: true, workable: true },
  mountain: { name: 'Mountain', yields: { food: 0, prod: 0, gold: 0 }, cost: Infinity, defence: 0, water: false, workable: false },
};

export const FEATURE: Record<FeatureId, { name: string; yields: Yields; cost: number; defence: number }> = {
  hills: { name: 'Hills', yields: { food: 0, prod: 2, gold: 0 }, cost: 2, defence: 0.25 },
  forest: { name: 'Forest', yields: { food: 1, prod: 1, gold: 0 }, cost: 2, defence: 0.25 },
  marsh: { name: 'Marsh', yields: { food: 1, prod: 0, gold: 0 }, cost: 3, defence: -0.15 },
};

export const ROAD_COST = 0.5;
export const RIVER_CROSSING_COST = 1;
export const RIVER_ATTACK_PENALTY = -0.2;

export interface ResourceDef {
  name: string;
  kind: 'bonus' | 'strategic' | 'luxury';
  /** bonus always applied when worked */
  base: Yields;
  /** extra bonus when the named improvement is present */
  improved?: { imp: ImprovementId; yields: Yields };
}

export const RESOURCE: Record<ResourceId, ResourceDef> = {
  wheat: { name: 'Wheat', kind: 'bonus', base: { food: 1, prod: 0, gold: 0 } },
  cattle: { name: 'Cattle', kind: 'bonus', base: { food: 1, prod: 0, gold: 0 }, improved: { imp: 'pasture', yields: { food: 0, prod: 1, gold: 0 } } },
  stone: { name: 'Stone', kind: 'bonus', base: { food: 0, prod: 1, gold: 0 } },
  copper: { name: 'Copper', kind: 'strategic', base: { food: 0, prod: 0, gold: 0 }, improved: { imp: 'mine', yields: { food: 0, prod: 1, gold: 0 } } },
  horses: { name: 'Horses', kind: 'strategic', base: { food: 0, prod: 0, gold: 0 }, improved: { imp: 'pasture', yields: { food: 0, prod: 1, gold: 0 } } },
  dates: { name: 'Dates', kind: 'luxury', base: { food: 1, prod: 0, gold: 1 } },
  lapis: { name: 'Lapis', kind: 'luxury', base: { food: 0, prod: 0, gold: 0 }, improved: { imp: 'mine', yields: { food: 0, prod: 0, gold: 2 } } },
};

export const IMPROVEMENT: Record<ImprovementId, { name: string; yields: Yields }> = {
  farm: { name: 'Farm', yields: { food: 1, prod: 0, gold: 0 } },
  pasture: { name: 'Pasture', yields: { food: 0, prod: 1, gold: 0 } },
  mine: { name: 'Mine', yields: { food: 0, prod: 1, gold: 0 } },
  lumber: { name: 'Lumber Camp', yields: { food: 0, prod: 1, gold: 0 } },
};

export const AUTO_DEV_TURNS = 5;

// Settlements -----------------------------------------------------------------

export const TIER_NAMES = ['Camp', 'Village', 'Town', 'City'] as const;
export const TIER_POP = [1, 3, 6, 10];
export const TIER_FOOTPRINT = [1, 1, 3, 7];
export const TIER_REACH = [2, 3, 4, 5];
export const TIER_SLOTS = [0, 2, 4, 6];
export const TIER_POOL_CAP = [1, 2, 3, 4];
export const TIER_POOL_REFILL = [10, 8, 6, 4];
export const TIER_TURNS = 8;
export const MIN_SETTLEMENT_DISTANCE = 6;
export const FOOD_PER_PERSON = 1;
export const TILES_PER_PERSON = 2;
export const UNIT_FOOD = 1;
export const PRISONER_FOOD = 1;
export const HINTERLAND_RANGE = 12;

export function growthThreshold(pop: number): number {
  return Math.floor(15 + 6 * (pop - 1) + Math.pow(pop - 1, 1.6));
}

export interface BuildingDef {
  name: string;
  cost: number;
  upkeep: number;
  tech: TechId[];
  effect: string;
}

export const BUILDING: Record<BuildingId, BuildingDef> = {
  shrine: { name: 'Shrine', cost: 40, upkeep: 1, tech: [], effect: '+1 culture, +2 stability' },
  granary: { name: 'Granary', cost: 50, upkeep: 1, tech: ['pottery'], effect: '+2 food; keeps 25% food on growth; slower siege starvation' },
  barracks: { name: 'Barracks', cost: 60, upkeep: 1, tech: ['bronze'], effect: 'Units start Seasoned; pool refills 2 turns faster; garrison drills +1 XP/turn' },
  walls: { name: 'Walls', cost: 60, upkeep: 1, tech: ['masonry'], effect: '+100 HP, +6 defence; Town+ ranged attack' },
  workshop: { name: 'Workshop', cost: 70, upkeep: 1, tech: ['stoneworking'], effect: '+2 production, +15% production' },
  library: { name: 'Library', cost: 70, upkeep: 1, tech: ['writing'], effect: '+2 science, +25% science' },
  market: { name: 'Market', cost: 70, upkeep: 0, tech: ['mathematics'], effect: '+2 gold, +25% gold' },
  ziggurat: { name: 'Ziggurat', cost: 150, upkeep: 2, tech: ['mathematics', 'masonry'], effect: 'Capital City only. +3 culture, +3 stability, +2 science' },
};

export const BUILDING_ORDER: BuildingId[] = ['shrine', 'granary', 'barracks', 'walls', 'workshop', 'library', 'market', 'ziggurat'];

export type ProjectKind = 'mine' | 'lumber' | 'road' | 'repair' | 'rushdev';

export const PROJECT: Record<ProjectKind, { name: string; cost: number; tech: TechId[] }> = {
  mine: { name: 'Mine', cost: 25, tech: ['stoneworking'] },
  lumber: { name: 'Lumber Camp', cost: 20, tech: ['stoneworking'] },
  road: { name: 'Road', cost: 10, tech: ['wheel'] }, // per tile
  repair: { name: 'Repair', cost: 10, tech: [] },
  rushdev: { name: 'Rush development', cost: 15, tech: [] },
};

export const RUSH_GOLD_PER_PROD = 3;

// Units -----------------------------------------------------------------------

export type UnitClass = 'civilian' | 'recon' | 'melee' | 'ranged' | 'mounted';

export interface UnitDef {
  name: string;
  cls: UnitClass;
  prod: number; // 0 = cannot be trained
  strength: number;
  ranged: number;
  range: number;
  moves: number;
  tech: TechId[];
  resource?: ResourceId;
  minTier: number;
  upgradeFrom?: UnitType;
  upgradeGold?: number;
  letter: string;
}

export const UNIT: Record<UnitType, UnitDef> = {
  migrants: { name: 'Migrants', cls: 'civilian', prod: 20, strength: 0, ranged: 0, range: 0, moves: 4, tech: [], minTier: 0, letter: 'M' },
  scout: { name: 'Scout', cls: 'recon', prod: 20, strength: 4, ranged: 0, range: 0, moves: 6, tech: [], minTier: 0, letter: 'Sc' },
  warrior: { name: 'Warrior', cls: 'melee', prod: 30, strength: 8, ranged: 0, range: 0, moves: 4, tech: [], minTier: 0, letter: 'W' },
  slinger: { name: 'Slinger', cls: 'ranged', prod: 35, strength: 5, ranged: 7, range: 3, moves: 4, tech: ['hunting'], minTier: 1, letter: 'Sl' },
  chariot: { name: 'Chariot', cls: 'mounted', prod: 55, strength: 12, ranged: 0, range: 0, moves: 8, tech: ['wheel'], resource: 'horses', minTier: 2, letter: 'C' },
  spearman: { name: 'Spearman', cls: 'melee', prod: 0, strength: 11, ranged: 0, range: 0, moves: 4, tech: ['bronze'], resource: 'copper', minTier: 0, upgradeFrom: 'warrior', upgradeGold: 40, letter: 'Sp' },
  bowman: { name: 'Bowman', cls: 'ranged', prod: 0, strength: 7, ranged: 10, range: 4, moves: 4, tech: ['archery'], minTier: 0, upgradeFrom: 'slinger', upgradeGold: 30, letter: 'B' },
  swordsman: { name: 'Swordsman', cls: 'melee', prod: 0, strength: 15, ranged: 0, range: 0, moves: 4, tech: ['ironworking'], minTier: 0, upgradeFrom: 'spearman', upgradeGold: 50, letter: 'Sw' },
};

export const TRAINABLE: UnitType[] = ['migrants', 'scout', 'warrior', 'slinger', 'chariot'];

export function upgradeTarget(t: UnitType): UnitType | null {
  for (const k of Object.keys(UNIT) as UnitType[]) if (UNIT[k].upgradeFrom === t) return k;
  return null;
}

export const RANKS = [
  { name: 'Recruit', xp: 0, bonus: 0 },
  { name: 'Seasoned', xp: 15, bonus: 0.1 },
  { name: 'Veteran', xp: 40, bonus: 0.2 },
  { name: 'Elite', xp: 80, bonus: 0.3 },
];

export function rankOf(xp: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
}

// Technology ------------------------------------------------------------------

export interface TechDef {
  name: string;
  cost: number;
  requires: TechId[];
  unlocks: string;
}

export const TECH: Record<TechId, TechDef> = {
  foraging: { name: 'Foraging', cost: 0, requires: [], unlocks: 'Start' },
  hunting: { name: 'Hunting', cost: 20, requires: ['foraging'], unlocks: 'Slinger' },
  herding: { name: 'Herding', cost: 20, requires: ['foraging'], unlocks: 'Pasture' },
  tilling: { name: 'Tilling', cost: 20, requires: ['foraging'], unlocks: 'Farm' },
  stoneworking: { name: 'Stoneworking', cost: 20, requires: [], unlocks: 'Mine, Lumber Camp, Workshop' },
  archery: { name: 'Archery', cost: 45, requires: ['hunting'], unlocks: 'Bowman (upgrade)' },
  wheel: { name: 'Wheel', cost: 45, requires: ['herding'], unlocks: 'Chariot, roads, auto-roads' },
  irrigation: { name: 'Irrigation', cost: 45, requires: ['tilling'], unlocks: '+1 food on Farms with fresh water' },
  pottery: { name: 'Pottery', cost: 45, requires: ['tilling'], unlocks: 'Granary' },
  masonry: { name: 'Masonry', cost: 45, requires: ['stoneworking'], unlocks: 'Walls' },
  bronze: { name: 'Bronze', cost: 80, requires: ['masonry'], unlocks: 'Spearman (upgrade), Barracks' },
  writing: { name: 'Writing', cost: 80, requires: ['pottery'], unlocks: 'Library' },
  mathematics: { name: 'Mathematics', cost: 130, requires: ['writing'], unlocks: 'Market; Ziggurat (with Masonry)' },
  ironworking: { name: 'Ironworking', cost: 130, requires: ['bronze'], unlocks: 'Swordsman (upgrade)' },
};

export const TECH_ORDER = Object.keys(TECH) as TechId[];

// Combat & misc ---------------------------------------------------------------

export const FORTIFY_BONUS = 0.25;
export const FLANK_BONUS = 0.1;
export const FLANK_MAX = 0.3;
export const SPEAR_VS_CHARIOT = 0.5;
export const SETTLEMENT_HP = 200;
export const WALLS_HP = 100;
export const SETTLEMENT_HEAL = 20;
export const SETTLEMENT_RANGE = 2;
export const TURN_LIMIT = 150;
export const DRIFT_RANGE = 12;
export const MIGRATION_ATTACHMENT = { normal: 3, restrict: 6, encourage: 0 };
export const CLOSED_BORDER_STABILITY = 2;
export const PRISONER_SETTLE_TURNS = 10;
