<script lang="ts">
  import { onMount } from 'svelte';
  import GameView from './ui/GameView.svelte';
  import { checkSave, loadSaved, startNew, ui } from './ui/store.svelte';

  let seed = $state(Math.floor(Math.random() * 1_000_000));

  onMount(() => {
    void checkSave();
  });
</script>

{#if ui.started}
  <GameView />
{:else}
  <main class="menu">
    <div class="panel card">
      <h1>Ur</h1>
      <p class="muted">A turn-based civilization prototype. Your people are your only true resource.</p>
      <div class="row">
        <label for="seed">Map seed</label>
        <input id="seed" type="number" bind:value={seed} />
        <button onclick={() => (seed = Math.floor(Math.random() * 1_000_000))}>Random</button>
      </div>
      <div class="row actions">
        <button class="primary" onclick={() => startNew(seed)}>New game</button>
        {#if ui.hasSave}
          <button onclick={() => loadSaved()}>Continue saved game</button>
        {/if}
      </div>
      <p class="muted small">You play the Ashkari against two rivals on an 80×52 map. 150 turns, or conquer every capital.</p>
    </div>
  </main>
{/if}

<style>
  .menu {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .card {
    width: min(440px, 100%);
    padding: 24px;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 40px;
    letter-spacing: 0.08em;
  }
  input {
    font: inherit;
    width: 120px;
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 8px;
  }
  .actions {
    margin-top: 16px;
  }
  .small {
    font-size: 12px;
    margin-top: 16px;
  }
</style>
