<script lang="ts">
  import { TECH, TECH_ORDER } from '../core/data';
  import Modal from './Modal.svelte';
  import { act, gs, ui } from './store.svelte';

  const view = $derived.by(() => {
    ui.tick;
    const civ = gs().civs[0];
    return TECH_ORDER.map((t) => ({
      t,
      def: TECH[t],
      known: civ.techs.includes(t),
      current: civ.researching === t,
      available: !civ.techs.includes(t) && TECH[t].requires.every((r) => civ.techs.includes(r)),
    }));
  });
</script>

<Modal title="Technology">
  <div class="grid">
    {#each view as x (x.t)}
      <button
        class="tech"
        class:known={x.known}
        class:current={x.current}
        disabled={!x.available}
        onclick={() => {
          act({ type: 'research', tech: x.t });
          ui.screen = null;
        }}
      >
        <strong>{x.def.name}</strong>
        <span class="muted">{x.known ? 'Known' : `${x.def.cost} science`}{x.def.requires.length ? ` · needs ${x.def.requires.map((r) => TECH[r].name).join(', ')}` : ''}</span>
        <span>{x.def.unlocks}</span>
      </button>
    {/each}
  </div>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  .tech {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    font-size: 12px;
  }
  .tech strong {
    font-size: 14px;
  }
  .tech.known {
    border-color: var(--good);
    opacity: 0.7;
  }
  .tech.current {
    border-color: var(--science);
    background: #1f3346;
  }
  .tech:disabled.known {
    opacity: 0.7;
  }
</style>
