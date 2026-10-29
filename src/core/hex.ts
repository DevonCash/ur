// Pointy-top hexes, stored row-major in "odd-r" offset layout, maths in axial coordinates.
// Direction d is the edge between corners d and d+1 (corner i at 60·i − 30°, y pointing down).

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export const opposite = (d: number) => (d + 3) % 6;

export interface Grid {
  w: number;
  h: number;
  /** neighbours[i * 6 + d] = tile index or -1 */
  neighbours: Int32Array;
}

export function toAxial(w: number, i: number): [number, number] {
  const row = Math.floor(i / w);
  const col = i - row * w;
  return [col - (row - (row & 1)) / 2, row];
}

export function fromAxial(w: number, h: number, q: number, r: number): number {
  if (r < 0 || r >= h) return -1;
  const col = q + (r - (r & 1)) / 2;
  if (col < 0 || col >= w) return -1;
  return r * w + col;
}

export function makeGrid(w: number, h: number): Grid {
  const neighbours = new Int32Array(w * h * 6);
  for (let i = 0; i < w * h; i++) {
    const [q, r] = toAxial(w, i);
    for (let d = 0; d < 6; d++) neighbours[i * 6 + d] = fromAxial(w, h, q + DIRS[d][0], r + DIRS[d][1]);
  }
  return { w, h, neighbours };
}

export function neighbour(g: Grid, i: number, d: number): number {
  return g.neighbours[i * 6 + d];
}

export function dirTo(g: Grid, a: number, b: number): number {
  for (let d = 0; d < 6; d++) if (g.neighbours[a * 6 + d] === b) return d;
  return -1;
}

export function distance(w: number, a: number, b: number): number {
  const [q1, r1] = toAxial(w, a);
  const [q2, r2] = toAxial(w, b);
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All tiles within `radius` of `center` (including center). */
export function tilesInRadius(g: Grid, center: number, radius: number): number[] {
  const [q0, r0] = toAxial(g.w, center);
  const out: number[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      const i = fromAxial(g.w, g.h, q0 + dq, r0 + dr);
      if (i >= 0) out.push(i);
    }
  }
  return out;
}

/** Tiles on the straight line from a to b, excluding both ends. */
export function lineBetween(g: Grid, a: number, b: number): number[] {
  const [q1, r1] = toAxial(g.w, a);
  const [q2, r2] = toAxial(g.w, b);
  const n = distance(g.w, a, b);
  const out: number[] = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    // nudge avoids ties landing exactly on edges
    const q = q1 + (q2 - q1) * t + 1e-6;
    const r = r1 + (r2 - r1) * t + 1e-6;
    const [rq, rr] = cubeRound(q, r);
    const i = fromAxial(g.w, g.h, rq, rr);
    if (i >= 0) out.push(i);
  }
  return out;
}

export function cubeRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

// Pixel layout (used by renderer and map generation for corners).
export const SQRT3 = Math.sqrt(3);

export function tileCenter(w: number, i: number, size: number): [number, number] {
  const row = Math.floor(i / w);
  const col = i - row * w;
  return [size * SQRT3 * (col + 0.5 * (row & 1)), size * 1.5 * row];
}

export function cornerOffset(c: number, size: number): [number, number] {
  const a = ((60 * c - 30) * Math.PI) / 180;
  return [size * Math.cos(a), size * Math.sin(a)];
}

export function pixelToTile(w: number, h: number, x: number, y: number, size: number): number {
  const q = ((SQRT3 / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  const [rq, rr] = cubeRound(q, r);
  return fromAxial(w, h, rq, rr);
}
