// Seeded RNG (mulberry32). State lives in GameState so runs are reproducible.

export interface RngState {
  s: number;
}

export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextRange(rng: RngState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(rng);
}

export function nextInt(rng: RngState, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}

export function chance(rng: RngState, p: number): boolean {
  return nextFloat(rng) < p;
}
