<script lang="ts">
  import { RANKS, UNIT, rankOf, upgradeTarget } from '../core/data';
  import { canFound, canUpgrade } from '../core/game';
  import { atWar, isMilitary, ownerCiv, settlementAtTile, settlementById, unitById } from '../core/world';
  import { act, gs, refresh, selectNextUnit, ui } from './store.svelte';

  const view = $derived.by(() => {
    ui.tick;
    const s = gs();
    const u = ui.selectedUnit !== null ? unitById(s, ui.selectedUnit) : undefined;
    if (!u) return null;
    const def = UNIT[u.type];
    const mine = u.civId === 0;
    const home = u.home !== null ? settlementById(s, u.home) : undefined;
    const here = settlementAtTile(s, u.tile);
    const t = s.tiles[u.tile];
    const oc = ownerCiv(s, u.tile);
    const r = rankOf(u.xp);
    const next = RANKS[r + 1];
    const up = upgradeTarget(u.type);
    return {
      u,
      def,
      mine,
      civ: s.civs[u.civId],
      mil: isMilitary(u),
      home: home?.name ?? '—',
      rank: RANKS[r].name,
      xp: next ? `${u.xp}/${next.xp} XP` : `${u.xp} XP`,
      found: u.type === 'migrants' ? canFound(s, u) : 'n/a',
      join: u.type === 'migrants' && here?.civId === u.civId,
      pillage: isMilitary(u) && !!t.improvement && !t.pillaged && oc >= 0 && atWar(s, u.civId, oc),
      upgrade: up ? { name: UNIT[up].name, gold: UNIT[up].upgradeGold, why: canUpgrade(s, u) } : null,
      rehome: isMilitary(u) && here?.civId === u.civId && here.id !== u.home,
    };
  });
</script>

{#if view}
  {@const u = view.u}
  <section class="panel unit">
    <header class="head">
      <h2>{view.def.name}{#if u.type === 'migrants'}{' '}({u.people} {u.people > 1 ? 'people' : 'person'}){/if}</h2>
      <button aria-label="Close" onclick={() => { ui.selectedUnit = null; refresh(); }}>✕</button>
    </header>
    <p class="muted">{view.civ.name} · {view.def.cls}</p>
    <dl>
      <dt>HP</dt><dd>{u.hp}/100</dd>
      <dt>Moves</dt><dd>{+u.moves.toFixed(1)}/{view.def.moves}</dd>
      {#if view.mil}
        <dt>Strength</dt><dd>{view.def.strength}{#if view.def.ranged} · ranged {view.def.ranged} (range {view.def.range}){/if}</dd>
        <dt>Rank</dt><dd>{view.rank} · {view.xp}</dd>
        <dt>Home</dt><dd>{view.home} <span class="muted">(feeds it 1 food)</span></dd>
      {/if}
      {#if u.fortify >= 2}<dt>Status</dt><dd>Fortified (+25%)</dd>{:else if u.fortify === 1}<dt>Status</dt><dd>Fortifying</dd>{/if}
      {#if u.sleeping}<dt>Status</dt><dd>Sleeping</dd>{/if}
    </dl>
    {#if view.mine}
      <div class="row">
        {#if u.type === 'migrants'}
          <button class="primary" disabled={!!view.found} title={view.found ?? 'Found a camp here (B)'} onclick={() => act({ type: 'found', unit: u.id })}>Found camp</button>
          {#if view.join}<button onclick={() => act({ type: 'join', unit: u.id })}>Join settlement</button>{/if}
        {/if}
        {#if view.mil}
          <button onclick={() => act({ type: 'fortify', unit: u.id })} title="F">Fortify</button>
          {#if view.pillage}<button onclick={() => act({ type: 'pillage', unit: u.id })}>Pillage</button>{/if}
          {#if view.rehome}<button onclick={() => act({ type: 'rehome', unit: u.id })}>Make this home</button>{/if}
        {/if}
        <button onclick={() => act({ type: 'sleep', unit: u.id })} title="S">Sleep</button>
        <button
          onclick={() => {
            act({ type: 'skip', unit: u.id });
            selectNextUnit(false);
          }}
          title="Space">Skip</button>
      </div>
      {#if view.upgrade}
        <div class="row up">
          <button disabled={!!view.upgrade.why} onclick={() => act({ type: 'upgrade', unit: u.id })}>Upgrade to {view.upgrade.name} ({view.upgrade.gold} gold)</button>
          {#if view.upgrade.why}<span class="muted small">{view.upgrade.why}</span>{/if}
        </div>
      {/if}
      <div class="row up">
        <button class="danger" onclick={() => act({ type: 'disband', unit: u.id })} title="In own territory the person returns to a nearby settlement">Disband</button>
      </div>
      <p class="muted small">Left-click a tile to move or attack. Drag to pan.</p>
    {/if}
  </section>
{/if}

<style>
  .unit {
    padding: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: start;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    margin: 8px 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .up {
    margin-top: 8px;
  }
  .small {
    font-size: 12px;
  }
</style>
