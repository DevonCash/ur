<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ui } from './store.svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="backdrop" role="presentation" onclick={() => (ui.screen = null)}>
  <div class="panel modal" role="dialog" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
    <header>
      <h2>{title}</h2>
      <button onclick={() => (ui.screen = null)} aria-label="Close">✕</button>
    </header>
    <div class="body">{@render children()}</div>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(8, 10, 12, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(760px, 100%);
    max-height: calc(100% - 32px);
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  header h2 {
    margin: 0;
  }
  .body {
    padding: 12px 14px;
    overflow-y: auto;
  }
</style>
