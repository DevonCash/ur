<script lang="ts">
  import {
    BUILDING, BUILDING_ORDER, PROJECT, RUSH_GOLD_PER_PROD, TIER_NAMES, TIER_POOL_CAP, TIER_POP, TIER_SLOTS, TIER_TURNS,
    TRAINABLE, UNIT, growthThreshold, type ProjectKind,
  } from '../core/data';
  import { itemCost, unitAllowed } from '../core/game';
  import { attractTerms } from '../core/migration';
  import {
    activeBuildings, buildingAllowed, garrison, maxHp, prisonersHeld, settlementYields, tierPopulation, unitsHomed,
  } from '../core/settlement';
  import type { Emigration, ProductionItem } from '../core/types';
  import { hasTech, settlementById } from '../core/world';
  import { act, gs, refresh, ui } from './store.svelte';

  const view = $derived.by(() => {
    ui.tick;
    const s = gs();
    const st = ui.selectedSettlement !== null ? settlementById(s, ui.selectedSettlement) : undefined;
    if (!st) return null;
    const civ = s.civs[st.civId];
    const y = settlementYields(s, st);
    const prodCost = st.production ? itemCost(s, st, st.production) : 0;
    const remaining = Math.max(0, prodCost - st.prodStored);
    const tp = tierPopulation(s, st);
    const units = TRAINABLE.map((t) => ({ t, why: unitAllowed(s, st, t) }));
    const buildings = BUILDING_ORDER.filter((b) => !st.buildings.includes(b)).map((b) => ({
      b,
      ok: buildingAllowed(s, st, b),
      tech: BUILDING[b].tech.every((t) => hasTech(civ, t)),
    }));
    const projects = (Object.keys(PROJECT) as ProjectKind[]).map((p) => ({ p, ok: PROJECT[p].tech.every((t) => hasTech(civ, t)) }));
    const a = attractTerms(s, st);
    return {
      st, civ, y, prodCost, remaining, tp,
      next: st.tier < 3 ? TIER_POP[st.tier + 1] : null,
      growth: growthThreshold(st.pop),
      units, buildings, projects,
      active: activeBuildings(st),
      homed: unitsHomed(s, st).length,
      garrison: garrison(s, st),
      prisoners: prisonersHeld(s, st),
      attract: a,
      attractTotal: Math.round((a.food + a.stability + a.amenities + a.crowding + a.safety) * 10) / 10,
      maxHp: maxHp(st),
      mine: st.civId === 0,
    };
  });

  function itemName(i: ProductionItem): string {
    if (i.kind === 'unit') return i.unit === 'migrants' ? `Migrants (${i.people ?? 1})` : UNIT[i.unit].name;
    if (i.kind === 'building') return BUILDING[i.building].name;
    return PROJECT[i.project].name;
  }

  function setItem(item: ProductionItem) {
    act({ type: 'setProduction', settlement: view!.st.id, item });
  }

  function emig(v: Emigration) {
    act({ type: 'setEmigration', settlement: view!.st.id, value: v });
  }
</script>

{#if view}
  {@const st = view.st}
  <section class="panel sp">
    <header class="head">
      <h2>{st.name} <span class="muted">· {TIER_NAMES[st.tier]}</span></h2>
      <button aria-label="Close" onclick={() => { ui.selectedSettlement = null; refresh(); }}>✕</button>
    </header>
    {#if st.besieged}<p class="bad">Besieged — only urban tiles are worked; stores are running down.</p>{/if}

    <h3>People</h3>
    <dl>
      <dt>Population</dt><dd>{st.pop}{#if view.garrison}{' '}+ {view.garrison} garrison{/if}</dd>
      <dt>Food</dt><dd>{st.food}/{view.growth} ({view.y.foodNet >= 0 ? '+' : ''}{view.y.foodNet}/turn)</dd>
      <dt>Feeds</dt><dd>{st.pop} people · {view.homed} soldiers · {view.prisoners} prisoners</dd>
      <dt>Recruits</dt><dd>{st.recruits}/{TIER_POOL_CAP[st.tier]}</dd>
    </dl>
    {#if view.next !== null}
      <div class="tier">
        <span>To {TIER_NAMES[st.tier + 1]}: hold {view.next} people ({view.tp} now) for {TIER_TURNS} turns</span>
        <div class="bar"><div style:width={`${(100 * st.up) / TIER_TURNS}%`}></div></div>
      </div>
    {/if}
    {#if st.down > 0}
      <div class="tier">
        <span class="bad">Declining: below {TIER_POP[st.tier]} for {st.down}/{TIER_TURNS} turns</span>
        <div class="bar"><div class="badbar" style:width={`${(100 * st.down) / TIER_TURNS}%`}></div></div>
      </div>
    {/if}

    <h3>Yields</h3>
    <p>{view.y.food} food · {view.y.prod} prod · {view.y.gold} gold · {view.y.science} science · {view.y.culture} culture</p>
    <p class="muted small">Works {st.worked.length} tiles (2 per person). Click a territory tile to lock/unlock it.</p>
    <p class="muted small">HP {st.hp}/{view.maxHp}</p>

    {#if view.mine}
      <h3>Production</h3>
      {#if st.production}
        <p>{itemName(st.production)} — {st.prodStored}/{view.prodCost} (+{view.y.prod}/turn)</p>
        <div class="row">
          {#if st.production.kind !== 'project'}
            <button disabled={view.civ.gold < view.remaining * RUSH_GOLD_PER_PROD} onclick={() => act({ type: 'rushBuy', settlement: st.id })}>
              Buy for {view.remaining * RUSH_GOLD_PER_PROD} gold
            </button>
          {/if}
          <button onclick={() => act({ type: 'setProduction', settlement: st.id, item: null })}>Clear</button>
        </div>
        {#if st.production.kind === 'project'}<p class="muted small">A project takes 1 person off tile work as labour.</p>{/if}
      {:else}
        <p class="warn">Nothing in production.</p>
      {/if}

      <div class="choices">
        <span class="label">Units (cost 1 person + 1 recruit)</span>
        {#each view.units as { t, why } (t)}
          {#if t === 'migrants'}
            <button disabled={!!why || st.pop < 2} onclick={() => setItem({ kind: 'unit', unit: 'migrants', people: 1 })}>Migrants ×1 · {UNIT.migrants.prod}</button>
            <button disabled={!!why || st.pop < 3} onclick={() => setItem({ kind: 'unit', unit: 'migrants', people: 2 })}>Migrants ×2 · {UNIT.migrants.prod}</button>
          {:else}
            <button disabled={!!why} title={why ?? ''} onclick={() => setItem({ kind: 'unit', unit: t })}>{UNIT[t].name} · {UNIT[t].prod}</button>
          {/if}
        {/each}
        <span class="label">Buildings ({st.buildings.length}/{TIER_SLOTS[st.tier]} slots)</span>
        {#each view.buildings as { b, ok, tech } (b)}
          {#if tech}
            <button disabled={!ok} title={BUILDING[b].effect} onclick={() => setItem({ kind: 'building', building: b })}>{BUILDING[b].name} · {BUILDING[b].cost}</button>
          {/if}
        {/each}
        <span class="label">Projects (then pick a tile)</span>
        {#each view.projects as { p, ok } (p)}
          <button disabled={!ok} onclick={() => (ui.projectMode = { settlement: st.id, project: p })}>{PROJECT[p].name} · {PROJECT[p].cost}{p === 'road' ? '/tile' : ''}</button>
        {/each}
      </div>

      <h3>Built</h3>
      <p>
        {#each st.buildings as b (b)}
          <span class="chip" class:dormant={!view.active.includes(b)} title={BUILDING[b].effect}>{BUILDING[b].name}</span>
        {:else}
          <span class="muted">None</span>
        {/each}
      </p>

      <h3>Migration</h3>
      <p class="small">Attractiveness {view.attractTotal} (food {view.attract.food.toFixed(1)}, unrest {view.attract.stability}, amenities {view.attract.amenities}, crowding {view.attract.crowding}, danger {view.attract.safety})</p>
      <div class="row">
        {#each ['restrict', 'normal', 'encourage'] as const as v (v)}
          <button class:primary={st.emigration === v} onclick={() => emig(v)}>{v === 'restrict' ? 'Restrict' : v === 'normal' ? 'Normal' : 'Encourage'}</button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .sp {
    padding: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: start;
  }
  h3 {
    margin-top: 12px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  p {
    margin: 2px 0;
  }
  .tier {
    margin-top: 6px;
    font-size: 12px;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .choices button {
    font-size: 12px;
    padding: 3px 7px;
  }
  .label {
    width: 100%;
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
  }
  .chip {
    display: inline-block;
    padding: 1px 6px;
    margin: 2px;
    border-radius: 3px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    font-size: 12px;
  }
  .chip.dormant {
    opacity: 0.5;
    text-decoration: line-through;
  }
  .small {
    font-size: 12px;
  }
  .bad {
    color: var(--bad);
  }
  .warn {
    color: var(--warn);
  }
  .badbar {
    background: var(--bad) !important;
  }
</style>
