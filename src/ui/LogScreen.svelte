<script lang="ts">
  import Modal from './Modal.svelte';
  import { gs, ui } from './store.svelte';

  let filter = $state<'all' | 'migration' | 'combat' | 'settlement'>('all');
  const entries = $derived.by(() => {
    ui.tick;
    const s = gs();
    return s.log
      .filter((l) => (l.civ === 0 || l.civ === -1) && (filter === 'all' || l.kind === filter))
      .slice(-200)
      .reverse();
  });
</script>

<Modal title="Chronicle">
  <div class="row filters">
    {#each ['all', 'migration', 'combat', 'settlement'] as const as f (f)}
      <button class:primary={filter === f} onclick={() => (filter = f)}>{f}</button>
    {/each}
  </div>
  <ul>
    {#each entries as l, i (i)}
      <li><span class="muted">T{l.turn}</span> {l.text}</li>
    {:else}
      <li class="muted">Nothing yet.</li>
    {/each}
  </ul>
</Modal>

<style>
  .filters {
    margin-bottom: 8px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 13px;
  }
  li {
    padding: 3px 0;
    border-bottom: 1px solid var(--border);
  }
</style>
