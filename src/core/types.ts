import type { BuildingId, FeatureId, ImprovementId, ProjectKind, ResourceId, TechId, TerrainId, UnitType } from './data';
import type { RngState } from './rng';

export interface Tile {
  terrain: TerrainId;
  feature: FeatureId | null;
  resource: ResourceId | null;
  /** bitmask over the 6 edge directions */
  river: number;
  ford: number;
  improvement: ImprovementId | null;
  pillaged: boolean;
  road: boolean;
  /** owning settlement id, -1 if none */
  owner: number;
  /** settlement whose footprint covers this tile, -1 if none */
  urban: number;
  /** consecutive turns worked, for auto-development */
  dev: number;
  elevation: number;
}

export type ProductionItem =
  | { kind: 'unit'; unit: UnitType; people?: number }
  | { kind: 'building'; building: BuildingId }
  | { kind: 'project'; project: ProjectKind; tile: number };

export type Emigration = 'normal' | 'restrict' | 'encourage';

export interface Settlement {
  id: number;
  civId: number;
  name: string;
  center: number;
  /** in order added; footprint[0] is the centre */
  footprint: number[];
  pop: number;
  food: number;
  culture: number;
  claimed: number[];
  tier: number;
  up: number;
  down: number;
  production: ProductionItem | null;
  prodStored: number;
  buildings: BuildingId[];
  recruits: number;
  recruitTimer: number;
  locked: number[];
  worked: number[];
  hp: number;
  emigration: Emigration;
  besieged: boolean;
  starveTimer: number;
  founded: number;
  /** last-turn figures, for UI and attractiveness */
  lastFoodNet: number;
  lastProd: number;
  rangedUsed: boolean;
}

export interface Unit {
  id: number;
  civId: number;
  type: UnitType;
  tile: number;
  hp: number;
  moves: number;
  xp: number;
  home: number | null;
  people: number;
  fortify: number;
  acted: boolean;
  sleeping: boolean;
  /** multi-turn move order (DESIGN §9.4); null when none */
  destination: number | null;
  /** auto-explore stance */
  explore: boolean;
}

export interface Prisoner {
  id: number;
  civId: number;
  holderCivId: number;
  settlementId: number;
  turns: number;
  rank: number;
}

export interface RansomOffer {
  id: number;
  prisonerId: number;
  fromCiv: number;
  toCiv: number;
  price: number;
}

export interface PeaceOffer {
  fromCiv: number;
  toCiv: number;
}

/** score: war score from the lower-id civ's point of view; captures: settlements changed hands this war */
export type Relation = { state: 'unmet' | 'peace' | 'war'; since: number; score: number; captures: number };

export interface Civ {
  id: number;
  name: string;
  color: number;
  human: boolean;
  alive: boolean;
  gold: number;
  science: number;
  researching: TechId | null;
  techs: TechId[];
  capitalId: number | null;
  originalCapitalId: number | null;
  /** per tile: 0 unexplored, 1 explored, 2 visible */
  vis: number[];
  /** border policy toward other civs: true = closed */
  closed: Record<number, boolean>;
  bankrupt: boolean;
  /** people lost to each civ via drift, recent window (for AI) */
  outflow: Record<number, number[]>;
  settlementNames: number;
}

export interface LogEntry {
  turn: number;
  civ: number; // -1 = everyone
  kind: 'migration' | 'combat' | 'settlement' | 'diplomacy' | 'research' | 'prisoner' | 'info';
  text: string;
}

export interface GameState {
  version: 1;
  seed: number;
  turn: number;
  /** index into civs of the civ currently acting */
  current: number;
  w: number;
  h: number;
  tiles: Tile[];
  civs: Civ[];
  settlements: Settlement[];
  units: Unit[];
  prisoners: Prisoner[];
  ransoms: RansomOffer[];
  peaceOffers: PeaceOffer[];
  relations: Record<string, Relation>;
  nextId: number;
  rng: RngState;
  log: LogEntry[];
  winner: number | null;
  victory: 'conquest' | 'score' | null;
  options: { aiCount: number };
}
