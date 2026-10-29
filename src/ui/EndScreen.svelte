<script lang="ts">
  import { score } from '../core/game';
  import { clearSave, gs, ui } from './store.svelte';

  const view = $derived.by(() => {
    ui.tick;
    const s = gs();
    if (s.winner === null) return null;
    return {
      winner: s.civs[s.winner],
      how: s.victory,
      scores: s.civs.map((c) => ({ name: c.name, score: score(s, c.id), alive: c.alive })).sort((a, b) => b.score - a.score),
      won: s.winner === 0,
    };
  });
</script>

{#if view}
  <div class="backdrop">
    <div class="panel end">
      <h2>{view.won ? 'Victory' : 'Defeat'}</h2>
      <p>{view.winner.name} wins by {view.how}.</p>
      <table>
        <tbody>
          {#each view.scores as sc (sc.name)}
            <tr><td>{sc.name}{sc.alive ? '' : ' (eliminated)'}</td><td>{sc.score}</td></tr>
          {/each}
        </tbody>
      </table>
      <button
        class="primary"
        onclick={async () => {
          await clearSave();
          location.reload();
        }}>New game</button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(8, 10, 12, 0.7);
    padding: 16px;
  }
  .end {
    padding: 20px;
    width: min(360px, 100%);
  }
  table {
    width: 100%;
    margin: 12px 0;
    border-collapse: collapse;
  }
  td {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  td:last-child {
    text-align: right;
  }
</style>
