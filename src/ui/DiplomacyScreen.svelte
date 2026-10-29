<script lang="ts">
  import { PRISONER_SETTLE_TURNS, RANKS } from '../core/data';
  import { ransomPrice, score, warScore } from '../core/game';
  import { relation, settlementById } from '../core/world';
  import Modal from './Modal.svelte';
  import { act, gs, ui } from './store.svelte';

  const view = $derived.by(() => {
    ui.tick;
    const s = gs();
    const me = s.civs[0];
    const others = s.civs
      .filter((c) => c.id !== 0)
      .map((c) => {
        const r = relation(s, 0, c.id);
        return {
          c,
          state: r.state,
          since: s.turn - r.since,
          ws: warScore(s, 0, c.id),
          closed: !!me.closed[c.id],
          theyClosed: !!c.closed[0],
          score: score(s, c.id),
        };
      });
    const held = s.prisoners
      .filter((p) => p.holderCivId === 0)
      .map((p) => ({ p, from: s.civs[p.civId].name, at: settlementById(s, p.settlementId)?.name ?? '?', price: ransomPrice(p) }));
    const ours = s.prisoners.filter((p) => p.civId === 0).length;
    const ransoms = s.ransoms.filter((o) => o.toCiv === 0).map((o) => ({ o, from: s.civs[o.fromCiv].name }));
    const peace = s.peaceOffers.filter((o) => o.toCiv === 0).map((o) => ({ o, from: s.civs[o.fromCiv].name }));
    return { others, held, ours, ransoms, peace, myScore: score(s, 0), gold: me.gold };
  });
</script>

<Modal title="Diplomacy">
  {#if view.peace.length || view.ransoms.length}
    <h3>Offers</h3>
    {#each view.peace as { o, from } (o.fromCiv)}
      <div class="row item">
        <span>{from} proposes peace (unsettled prisoners are exchanged).</span>
        <button class="primary" onclick={() => act({ type: 'acceptPeace', civ: o.fromCiv })}>Accept</button>
        <button onclick={() => act({ type: 'rejectPeace', civ: o.fromCiv })}>Reject</button>
      </div>
    {/each}
    {#each view.ransoms as { o, from } (o.id)}
      <div class="row item">
        <span>{from} offers to return one of our people for {o.price} gold.</span>
        <button class="primary" disabled={view.gold < o.price} onclick={() => act({ type: 'answerRansom', offer: o.id, accept: true })}>Pay</button>
        <button onclick={() => act({ type: 'answerRansom', offer: o.id, accept: false })}>Decline</button>
      </div>
    {/each}
  {/if}

  <h3>Civilizations</h3>
  <p class="muted small">Our score: {view.myScore}. Border policy only controls migration; at peace, military units cannot enter foreign territory.</p>
  <table>
    <thead><tr><th>Civilization</th><th>Status</th><th>War score</th><th>Borders</th><th>Score</th><th></th></tr></thead>
    <tbody>
      {#each view.others as x (x.c.id)}
        <tr>
          <td><span class="dot" style:background={`#${x.c.color.toString(16).padStart(6, '0')}`}></span>{x.c.name}{x.c.alive ? '' : ' (gone)'}</td>
          <td>{x.state === 'unmet' ? 'Not met' : `${x.state} (${x.since} turns)`}</td>
          <td>{x.state === 'war' ? x.ws : '—'}</td>
          <td>
            {#if x.state !== 'unmet'}
              <button onclick={() => act({ type: 'setBorder', civ: x.c.id, closed: !x.closed })}>{x.closed ? 'Closed' : 'Open'}</button>
              {#if x.theyClosed}<span class="muted small"> (theirs closed)</span>{/if}
            {/if}
          </td>
          <td>{x.score}</td>
          <td>
            {#if x.c.alive && x.state === 'peace'}
              <button class="danger" disabled={x.since < 10} title={x.since < 10 ? 'Peace must last 10 turns' : ''} onclick={() => act({ type: 'declareWar', civ: x.c.id })}>Declare war</button>
            {:else if x.c.alive && x.state === 'war'}
              <button disabled={x.since < 10} title={x.since < 10 ? 'War must last 10 turns' : ''} onclick={() => act({ type: 'proposePeace', civ: x.c.id })}>Propose peace</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h3>Prisoners we hold</h3>
  {#if view.ours}<p class="muted small">{view.ours} of our people are held by others.</p>{/if}
  {#each view.held as { p, from, at, price } (p.id)}
    <div class="row item">
      <span>{from} {RANKS[p.rank].name.toLowerCase()} held in {at} ({p.turns} turns)</span>
      <button onclick={() => act({ type: 'ransom', prisoner: p.id })}>Ransom {price}g</button>
      <button onclick={() => act({ type: 'release', prisoner: p.id })}>Release</button>
      <button disabled={p.turns < PRISONER_SETTLE_TURNS} title={`Settle after ${PRISONER_SETTLE_TURNS} turns`} onclick={() => act({ type: 'settlePrisoner', prisoner: p.id })}>Settle</button>
    </div>
  {:else}
    <p class="muted">None. Units killed in melee and captured migrants become prisoners; each eats 1 food.</p>
  {/each}
</Modal>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin-bottom: 12px;
  }
  th,
  td {
    text-align: left;
    padding: 5px 4px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 6px;
  }
  .item {
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .small {
    font-size: 12px;
  }
  @media (max-width: 640px) {
    table {
      display: block;
      overflow-x: auto;
    }
  }
</style>
