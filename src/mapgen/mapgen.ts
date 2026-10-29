// Seeded map generation (DESIGN §5.5): elevation/moisture noise → terrain and features;
// rivers traced downhill along hex edges (corner graph); fords; resources; start positions.
import { createNoise2D } from 'simplex-noise';
import type { FeatureId, ResourceId, TerrainId } from '../core/data';
import { DIRS, cornerOffset, distance, makeGrid, neighbour, opposite, tileCenter, tilesInRadius, type Grid } from '../core/hex';
import { chance, nextFloat, nextInt, type RngState } from '../core/rng';
import type { Tile } from '../core/types';

export interface GeneratedMap {
  w: number;
  h: number;
  tiles: Tile[];
  starts: number[];
}

const SEA = 0.42;

export function generateMap(w: number, h: number, rng: RngState, players: number): GeneratedMap {
  const g = makeGrid(w, h);
  const rand = () => nextFloat(rng);
  const elevNoise = createNoise2D(rand);
  const moistNoise = createNoise2D(rand);
  const detail = createNoise2D(rand);

  const n = w * h;
  const elev = new Float64Array(n);
  const moist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y] = tileCenter(w, i, 1);
    const nx = x / (w * 1.732);
    const ny = y / (h * 1.5);
    let e = 0;
    let amp = 1;
    let freq = 2.2;
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      e += amp * elevNoise(nx * freq, ny * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    e = (e / norm + 1) / 2;
    // falloff toward edges keeps the region surrounded by sea
    const dx = Math.abs(nx - 0.5) * 2;
    const dy = Math.abs(ny - 0.5) * 2;
    const edge = Math.max(dx, dy);
    e = e * 0.75 + 0.35 - Math.pow(edge, 3) * 0.55;
    elev[i] = e;
    moist[i] = ((moistNoise(nx * 3, ny * 3) + 0.5 * detail(nx * 9, ny * 9)) / 1.5 + 1) / 2;
  }

  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const e = elev[i];
    const m = moist[i];
    const row = Math.floor(i / w);
    const lat = Math.abs(row / (h - 1) - 0.5) * 2; // 0 equator → 1 poles
    let terrain: TerrainId;
    let feature: FeatureId | null = null;
    if (e < SEA) terrain = 'ocean';
    else if (e > 0.8) terrain = 'mountain';
    else {
      if (lat > 0.82) terrain = 'tundra';
      else if (m < 0.36) terrain = 'desert';
      else if (m < 0.5) terrain = 'plains';
      else terrain = 'grassland';
      if (e > 0.68) feature = 'hills';
      else if (m > 0.62 && terrain !== 'desert' && nextFloat(rng) < 0.55) feature = 'forest';
      else if (m > 0.6 && e < SEA + 0.05 && terrain !== 'desert') feature = 'marsh';
    }
    tiles.push({
      terrain, feature, resource: null, river: 0, ford: 0, improvement: null, pillaged: false,
      road: false, owner: -1, urban: -1, dev: 0, elevation: e,
    });
  }

  // Coast: ocean next to land.
  for (let i = 0; i < n; i++) {
    if (tiles[i].terrain !== 'ocean') continue;
    for (let d = 0; d < 6; d++) {
      const nb = neighbour(g, i, d);
      if (nb >= 0 && tiles[nb].terrain !== 'ocean' && tiles[nb].terrain !== 'coast') {
        tiles[i].terrain = 'coast';
        break;
      }
    }
  }

  // Lakes: a few low, wet inland flat tiles.
  let lakes = 0;
  for (let tries = 0; tries < 400 && lakes < Math.round((w * h) / 900); tries++) {
    const i = nextInt(rng, n);
    const t = tiles[i];
    if (t.terrain === 'ocean' || t.terrain === 'coast' || t.terrain === 'mountain' || t.feature === 'hills') continue;
    if (moist[i] < 0.55) continue;
    let inland = true;
    for (const j of tilesInRadius(g, i, 2)) if (tiles[j].terrain === 'coast' || tiles[j].terrain === 'ocean' || tiles[j].terrain === 'lake') inland = false;
    if (!inland) continue;
    t.terrain = 'lake';
    t.feature = null;
    elev[i] = SEA - 0.01;
    t.elevation = elev[i];
    lakes++;
  }

  traceRivers(g, tiles, elev, rng);

  // Fords: about one river edge in eight.
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 3; d++) {
      if (!((tiles[i].river >> d) & 1)) continue;
      const nb = neighbour(g, i, d);
      if (nb < 0) continue;
      if (chance(rng, 1 / 8)) {
        tiles[i].ford |= 1 << d;
        tiles[nb].ford |= 1 << opposite(d);
      }
    }
  }

  placeResources(g, tiles, rng);
  const starts = chooseStarts(g, tiles, players, rng);
  return { w, h, tiles, starts };
}

// Rivers along edges -----------------------------------------------------------

interface Corner {
  hexes: number[];
  /** adjacent corner key → [hexA, dirFromA] for the edge between them */
  adj: Map<string, [number, number]>;
}

function cornerKey(x: number, y: number): string {
  return `${Math.round(x * 100)},${Math.round(y * 100)}`;
}

function buildCorners(g: Grid): Map<string, Corner> {
  const corners = new Map<string, Corner>();
  const get = (k: string) => {
    let c = corners.get(k);
    if (!c) corners.set(k, (c = { hexes: [], adj: new Map() }));
    return c;
  };
  for (let i = 0; i < g.w * g.h; i++) {
    const [cx, cy] = tileCenter(g.w, i, 1);
    const keys: string[] = [];
    for (let c = 0; c < 6; c++) {
      const [ox, oy] = cornerOffset(c, 1);
      keys.push(cornerKey(cx + ox, cy + oy));
    }
    for (let c = 0; c < 6; c++) {
      const k = keys[c];
      const corner = get(k);
      if (!corner.hexes.includes(i)) corner.hexes.push(i);
      // edge d lies between corners d and d+1
      const k2 = keys[(c + 1) % 6];
      if (!corner.adj.has(k2)) corner.adj.set(k2, [i, c]);
      const corner2 = get(k2);
      if (!corner2.adj.has(k)) corner2.adj.set(k, [i, c]);
    }
  }
  return corners;
}

function traceRivers(g: Grid, tiles: Tile[], elev: Float64Array, rng: RngState): void {
  const corners = buildCorners(g);
  const isWater = (i: number) => tiles[i].terrain === 'ocean' || tiles[i].terrain === 'coast' || tiles[i].terrain === 'lake';
  const cElev = (c: Corner) => c.hexes.reduce((a, i) => a + (isWater(i) ? 0 : elev[i]), 0) / c.hexes.length;
  const keys = [...corners.keys()];
  const target = Math.round((g.w * g.h) / 260);
  const used = new Set<string>();
  let made = 0;
  for (let tries = 0; tries < 3000 && made < target; tries++) {
    const start = keys[nextInt(rng, keys.length)];
    const c0 = corners.get(start)!;
    if (c0.hexes.length < 3 || c0.hexes.some(isWater)) continue;
    if (cElev(c0) < 0.62) continue;
    if (used.has(start)) continue;
    const path: string[] = [start];
    const seen = new Set(path);
    let cur = start;
    let reached = false;
    for (let step = 0; step < 120; step++) {
      const c = corners.get(cur)!;
      if (c.hexes.some(isWater)) {
        reached = true;
        break;
      }
      let best: string | null = null;
      let bestE = Infinity;
      for (const k of c.adj.keys()) {
        if (seen.has(k)) continue;
        const e = cElev(corners.get(k)!) + nextFloat(rng) * 0.01;
        if (e < bestE) {
          bestE = e;
          best = k;
        }
      }
      if (!best) break;
      if (bestE > cElev(c) + 0.02) break; // no way downhill
      path.push(best);
      seen.add(best);
      if (used.has(best)) {
        reached = true; // joined another river
        break;
      }
      cur = best;
    }
    if (!reached || path.length < 5) continue;
    for (let k = 0; k + 1 < path.length; k++) {
      const [hexA, d] = corners.get(path[k])!.adj.get(path[k + 1])!;
      const hexB = neighbour(g, hexA, d);
      if (hexB < 0) continue;
      if (isWater(hexA) && isWater(hexB)) continue;
      tiles[hexA].river |= 1 << d;
      tiles[hexB].river |= 1 << opposite(d);
    }
    for (const k of path) used.add(k);
    made++;
  }
}

// Resources ------------------------------------------------------------------------

const RESOURCE_RULES: { r: ResourceId; ok: (t: Tile) => boolean; p: number }[] = [
  { r: 'wheat', ok: (t) => !t.feature && (t.terrain === 'grassland' || t.terrain === 'plains'), p: 0.05 },
  { r: 'cattle', ok: (t) => !t.feature && t.terrain === 'grassland', p: 0.04 },
  { r: 'stone', ok: (t) => t.feature === 'hills' || (!t.feature && t.terrain === 'desert'), p: 0.05 },
  { r: 'copper', ok: (t) => t.feature === 'hills', p: 0.08 },
  { r: 'horses', ok: (t) => !t.feature && (t.terrain === 'plains' || t.terrain === 'grassland'), p: 0.03 },
  { r: 'dates', ok: (t) => !t.feature && t.terrain === 'desert' && t.river !== 0, p: 0.25 },
  { r: 'lapis', ok: (t) => t.feature === 'hills', p: 0.04 },
];

function placeResources(g: Grid, tiles: Tile[], rng: RngState): void {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.terrain === 'ocean' || t.terrain === 'coast' || t.terrain === 'lake' || t.terrain === 'mountain') continue;
    let near = false;
    for (const j of tilesInRadius(g, i, 2)) if (j !== i && tiles[j].resource) near = true;
    if (near) continue;
    for (const rule of RESOURCE_RULES) {
      if (rule.ok(t) && chance(rng, rule.p)) {
        t.resource = rule.r;
        break;
      }
    }
  }
}

// Starts ------------------------------------------------------------------------------

function chooseStarts(g: Grid, tiles: Tile[], players: number, rng: RngState): number[] {
  const fresh = (i: number) => {
    if (tiles[i].river) return true;
    for (let d = 0; d < DIRS.length; d++) {
      const nb = neighbour(g, i, d);
      if (nb >= 0 && tiles[nb].terrain === 'lake') return true;
    }
    return false;
  };
  const candidates: { i: number; score: number }[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.feature || (t.terrain !== 'grassland' && t.terrain !== 'plains') || !fresh(i)) continue;
    let score = 0;
    for (const j of tilesInRadius(g, i, 3)) {
      const tj = tiles[j];
      if (tj.terrain === 'grassland') score += 2;
      else if (tj.terrain === 'plains') score += 1.5;
      else if (tj.terrain === 'mountain' || tj.terrain === 'ocean') score -= 1;
      if (tj.feature === 'hills') score += 1;
      if (tj.resource) score += 2;
    }
    candidates.push({ i, score: score + nextFloat(rng) });
  }
  candidates.sort((a, b) => b.score - a.score);
  for (let minDist = 20; minDist >= 8; minDist -= 3) {
    const chosen: number[] = [];
    for (const c of candidates) {
      if (chosen.every((o) => distance(g.w, o, c.i) >= minDist)) chosen.push(c.i);
      if (chosen.length === players) return chosen;
    }
  }
  throw new Error('Could not place start positions');
}
