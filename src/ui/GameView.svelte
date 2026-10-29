<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { canAttack, settlementCanShoot } from '../core/combat';
  import { PROJECT } from '../core/data';
  import { canFound, projectAllowed, projectTargets } from '../core/game';
  import { settlementAtTile, settlementById, unitById } from '../core/world';
  import { MapRenderer } from '../render/renderer';
  import DiplomacyScreen from './DiplomacyScreen.svelte';
  import EndScreen from './EndScreen.svelte';
  import HelpScreen from './HelpScreen.svelte';
  import LogScreen from './LogScreen.svelte';
  import SettlementPanel from './SettlementPanel.svelte';
  import { act, endTurn, flash, gs, refresh, selectNextUnit, setCenterHook, setRenderHook, ui } from './store.svelte';
  import TechScreen from './TechScreen.svelte';
  import TileTooltip from './TileTooltip.svelte';
  import TopBar from './TopBar.svelte';
  import UnitPanel from './UnitPanel.svelte';

  let host: HTMLDivElement;
  const renderer = new MapRenderer();
  let ready = false;
  let down: { x: number; y: number; button: number } | null = null;

  function currentTargets(): number[] | null {
    if (!ui.projectMode) return null;
    const st = settlementById(gs(), ui.projectMode.settlement);
    return st ? projectTargets(gs(), st, ui.projectMode.project) : [];
  }

  function cancelProject() {
    ui.projectMode = null;
    refresh();
  }

  function overlay() {
    return {
      selectedUnit: ui.selectedUnit,
      selectedSettlement: ui.selectedSettlement,
      hoverTile: ui.hoverTile,
      projectMode: !!ui.projectMode,
      projectTargets: currentTargets(),
    };
  }

  onMount(async () => {
    await renderer.init(host);
    ready = true;
    setRenderHook(() => ready && renderer.render(gs(), overlay()));
    setCenterHook((t) => renderer.centerOn(gs(), t));
    const s = gs();
    const start = s.units.find((u) => u.civId === 0)?.tile ?? s.settlements.find((x) => x.civId === 0)?.center ?? 0;
    renderer.centerOn(s, start);
    refresh();
    window.addEventListener('keydown', onKey);
  });

  onDestroy(() => window.removeEventListener('keydown', onKey));

  function local(e: PointerEvent | MouseEvent) {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent) {
    const p = local(e);
    down = { ...p, button: e.button };
  }

  function onPointerMove(e: PointerEvent) {
    if (!ready) return;
    const p = local(e);
    const t = renderer.tileAt(gs(), p.x, p.y);
    ui.hoverX = e.clientX;
    ui.hoverY = e.clientY;
    if (t !== ui.hoverTile) {
      ui.hoverTile = t >= 0 ? t : null;
      renderer.drawOverlay(gs(), overlay());
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!down || !ready) return;
    const p = local(e);
    const moved = Math.hypot(p.x - down.x, p.y - down.y) > 6;
    const button = down.button;
    down = null;
    if (moved) return;
    const tile = renderer.tileAt(gs(), p.x, p.y);
    if (tile < 0) return;
    if (button === 2) {
      ui.projectMode = null;
      const su = ui.selectedUnit !== null ? unitById(gs(), ui.selectedUnit) : undefined;
      if (su && su.civId === 0 && tile !== su.tile) command(tile);
      return;
    }
    click(tile);
  }

  function command(tile: number) {
    const s = gs();
    const su = unitById(s, ui.selectedUnit!)!;
    if (canAttack(s, su, tile)) act({ type: 'attack', unit: su.id, tile });
    else act({ type: 'move', unit: su.id, to: tile });
  }

  function click(tile: number) {
    const s = gs();
    if (ui.projectMode) {
      const pm = ui.projectMode;
      const st = settlementById(s, pm.settlement);
      const item = { kind: 'project' as const, project: pm.project, tile };
      const why = st ? projectAllowed(s, st, item) : 'No settlement';
      // invalid tiles keep the mode active and explain why
      if (why) {
        flash(why);
        return;
      }
      ui.projectMode = null;
      act({ type: 'setProduction', settlement: pm.settlement, item });
      return;
    }
    const own = s.units.filter((u) => u.tile === tile && u.civId === 0);
    const su = ui.selectedUnit !== null ? unitById(s, ui.selectedUnit) : undefined;
    if (su && su.civId === 0 && tile !== su.tile && !own.length) {
      command(tile);
      return;
    }
    if (own.length) {
      const idx = su ? own.findIndex((u) => u.id === su.id) : -1;
      const next = own[(idx + 1) % own.length];
      // clicking a selected unit's settlement tile again selects the settlement
      if (idx >= 0 && own.length === 1 && settlementAtTile(s, tile)?.civId === 0) {
        ui.selectedUnit = null;
        ui.selectedSettlement = settlementAtTile(s, tile)!.id;
      } else {
        ui.selectedUnit = next.id;
        ui.selectedSettlement = null;
      }
      refresh();
      return;
    }
    const selSt = ui.selectedSettlement !== null ? settlementById(s, ui.selectedSettlement) : undefined;
    if (selSt && settlementCanShoot(s, selSt, tile)) {
      act({ type: 'shoot', settlement: selSt.id, tile });
      return;
    }
    const st = settlementAtTile(s, tile);
    if (st && st.civId === 0) {
      ui.selectedSettlement = st.id;
      ui.selectedUnit = null;
      refresh();
      return;
    }
    if (selSt && s.tiles[tile].owner === selSt.id) {
      act({ type: 'lockTile', settlement: selSt.id, tile });
      return;
    }
    ui.selectedUnit = null;
    ui.selectedSettlement = null;
    refresh();
  }

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const s = gs();
    const su = ui.selectedUnit !== null ? unitById(s, ui.selectedUnit) : undefined;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (ui.screen) ui.screen = null;
      else {
        ui.projectMode = null;
        ui.selectedUnit = null;
        ui.selectedSettlement = null;
      }
      refresh();
    } else if (k === 'enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) endTurn();
    else if (k === 'e' && !ui.screen) endTurn();
    else if (k === 'n' || k === 'tab') {
      e.preventDefault();
      selectNextUnit();
    } else if (su && su.civId === 0) {
      if (k === 'f') act({ type: 'fortify', unit: su.id });
      else if (k === 's') act({ type: 'sleep', unit: su.id });
      else if (k === ' ') {
        e.preventDefault();
        act({ type: 'skip', unit: su.id });
        selectNextUnit(false);
      } else if (k === 'b' && !canFound(s, su)) act({ type: 'found', unit: su.id });
    }
  }
</script>

<div class="game">
  <div
    class="map"
    bind:this={host}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointerleave={() => {
      ui.hoverTile = null;
      if (ready) renderer.drawOverlay(gs(), overlay());
    }}
    oncontextmenu={(e) => e.preventDefault()}
    role="application"
    aria-label="Game map"
  ></div>
  <TopBar />
  <aside class="side">
    {#if ui.selectedUnit !== null}
      <UnitPanel />
    {:else if ui.selectedSettlement !== null}
      <SettlementPanel />
    {/if}
  </aside>
  <TileTooltip />
  {#if ui.projectMode}
    {@const pm = ui.projectMode}
    <div class="banner panel row">
      <span>{PROJECT[pm.project].name} ({PROJECT[pm.project].cost}{pm.project === 'road' ? '/tile' : ''}): pick a highlighted tile in {settlementById(gs(), pm.settlement)?.name}'s territory</span>
      <button onclick={cancelProject}>Cancel</button>
    </div>
  {/if}
  {#if ui.message}
    <div class="toast panel">{ui.message}</div>
  {/if}
  {#if ui.busy}
    <div class="toast panel">Other civilizations are moving…</div>
  {/if}
  {#if ui.screen === 'tech'}<TechScreen />{/if}
  {#if ui.screen === 'diplomacy'}<DiplomacyScreen />{/if}
  {#if ui.screen === 'log'}<LogScreen />{/if}
  {#if ui.screen === 'help'}<HelpScreen />{/if}
  <EndScreen />
</div>

<style>
  .game {
    position: relative;
    height: 100%;
  }
  .map {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .side {
    position: absolute;
    top: 56px;
    right: 12px;
    width: 340px;
    max-width: calc(100% - 32px);
    max-height: calc(100% - 70px);
    overflow-y: auto;
    pointer-events: none;
  }
  .side :global(> *) {
    pointer-events: auto;
  }
  .banner,
  .toast {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 14px;
  }
  .banner {
    top: 60px;
    border-color: #ffe066;
  }
  .toast {
    bottom: 20px;
  }
  @media (max-width: 640px) {
    .side {
      top: auto;
      bottom: 8px;
      right: 16px;
      left: 16px;
      width: auto;
      max-height: 45%;
    }
  }
</style>
