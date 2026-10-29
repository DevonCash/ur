// UI state and the bridge between Svelte, the renderer and the game core.
import { del, get, set } from 'idb-keyval';
import { runUntilHuman } from '../ai/ai';
import type { ProjectKind } from '../core/data';
import { applyAction, newGame, type Action } from '../core/game';
import type { GameState } from '../core/types';
import { isMilitary, unitById } from '../core/world';

const SAVE_KEY = 'ur-save-v1';

export type Screen = null | 'tech' | 'diplomacy' | 'log' | 'help';

class UiState {
  tick = $state(0);
  started = $state(false);
  hasSave = $state(false);
  selectedUnit = $state<number | null>(null);
  selectedSettlement = $state<number | null>(null);
  hoverTile = $state<number | null>(null);
  hoverX = $state(0);
  hoverY = $state(0);
  /** awaiting a tile pick for a settlement project */
  projectMode = $state<{ settlement: number; project: ProjectKind } | null>(null);
  screen = $state<Screen>(null);
  message = $state<string | null>(null);
  busy = $state(false);
}

export const ui = new UiState();
let game: GameState | null = null;
let onRender: (() => void) | null = null;
let msgTimer: ReturnType<typeof setTimeout> | null = null;

export function gs(): GameState {
  if (!game) throw new Error('No game');
  return game;
}

export function hasGame(): boolean {
  return game !== null;
}

export function setRenderHook(fn: () => void) {
  onRender = fn;
}

export function refresh() {
  ui.tick++;
  onRender?.();
}

export function flash(msg: string) {
  ui.message = msg;
  if (msgTimer) clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (ui.message = null), 2500);
}

export async function checkSave() {
  try {
    ui.hasSave = !!(await get(SAVE_KEY));
  } catch {
    ui.hasSave = false;
  }
}

export function startNew(seed: number) {
  game = newGame({ seed, aiCount: 2 });
  ui.started = true;
  ui.selectedUnit = game.units.find((u) => u.civId === 0 && u.type === 'migrants')?.id ?? null;
  ui.selectedSettlement = null;
  ui.screen = null;
  refresh();
  void save();
}

export async function loadSaved(): Promise<boolean> {
  const raw = await get(SAVE_KEY);
  if (!raw) return false;
  game = JSON.parse(raw as string) as GameState;
  ui.started = true;
  ui.selectedUnit = null;
  ui.selectedSettlement = null;
  refresh();
  return true;
}

export async function save() {
  if (!game) return;
  try {
    await set(SAVE_KEY, JSON.stringify(game));
    ui.hasSave = true;
  } catch (e) {
    console.warn('Save failed', e);
  }
}

export async function clearSave() {
  await del(SAVE_KEY);
  ui.hasSave = false;
}

export function act(a: Action): boolean {
  if (!game || ui.busy) return false;
  const r = applyAction(game, a, 0);
  if (!r.ok) {
    if (r.msg) flash(r.msg);
    refresh();
    return false;
  }
  if (r.msg) flash(r.msg);
  if (ui.selectedUnit !== null && !unitById(game, ui.selectedUnit)) ui.selectedUnit = null;
  refresh();
  return true;
}

export function endTurn() {
  if (!game || ui.busy || game.winner !== null) return;
  ui.busy = true;
  ui.projectMode = null;
  // let the UI paint the busy state before running AI turns
  setTimeout(() => {
    const g = game!;
    applyAction(g, { type: 'endTurn' }, 0);
    runUntilHuman(g);
    ui.busy = false;
    if (ui.selectedUnit !== null && !unitById(g, ui.selectedUnit)) ui.selectedUnit = null;
    if (ui.selectedSettlement !== null && !g.settlements.some((x) => x.id === ui.selectedSettlement && x.civId === 0)) ui.selectedSettlement = null;
    selectNextUnit(false);
    refresh();
    void save();
  }, 10);
}

/** Units that still need orders this turn. */
export function idleUnits(): number[] {
  if (!game) return [];
  return game.units.filter((u) => u.civId === 0 && u.moves > 0 && !u.sleeping && u.fortify === 0).map((u) => u.id);
}

export function selectNextUnit(cycle = true) {
  const ids = idleUnits();
  if (!ids.length) {
    if (cycle) flash('All units have orders');
    return;
  }
  const i = ui.selectedUnit === null ? -1 : ids.indexOf(ui.selectedUnit);
  ui.selectedUnit = ids[(i + 1) % ids.length];
  ui.selectedSettlement = null;
  refresh();
  focusOn?.(game!.units.find((u) => u.id === ui.selectedUnit)!.tile);
}

/** Bring a tile into view (glides only when it is off-screen); set by the map view. */
export let focusOn: ((tile: number) => void) | null = null;
export function setFocusHook(fn: (tile: number) => void) {
  focusOn = fn;
}

export function militaryFirst(unitIds: number[]): number[] {
  const g = gs();
  return [...unitIds].sort((a, b) => Number(isMilitary(unitById(g, b)!)) - Number(isMilitary(unitById(g, a)!)));
}
