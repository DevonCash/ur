<script lang="ts">
  import { tileInfo } from './format';
  import { gs, ui } from './store.svelte';

  const info = $derived.by(() => {
    ui.tick;
    if (ui.hoverTile === null) return null;
    return tileInfo(gs(), ui.hoverTile, ui.selectedUnit);
  });
</script>

{#if info}
  <div class="tip panel">
    <strong>{info.title}</strong>
    {#each info.lines as l, i (i)}<div>{l}</div>{/each}
  </div>
{/if}

<style>
  .tip {
    position: absolute;
    left: 12px;
    bottom: 12px;
    padding: 8px 10px;
    font-size: 12px;
    min-width: 180px;
    max-width: 280px;
    pointer-events: none;
  }
  @media (max-width: 640px) {
    .tip {
      display: none;
    }
  }
</style>
