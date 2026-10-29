<script lang="ts">
  import { BUILDING, TECH, TURN_LIMIT } from '../core/data';
  import { stability, stabilityTerms } from '../core/migration';
  import { activeBuildings, settlementYields } from '../core/settlement';
  import { civSettlements } from '../core/world';
  import { idleSettlements } from '../core/game';
  import { endTurn, endTurnLabel, gs, idleUnits, selectNextIdleSettlement, selectNextUnit, ui } from './store.svelte';

  const view = $derived.by(() => {
    ui.tick;
    const s = gs();
    const civ = s.civs[0];
    let gold = 0;
    let science = 0;
    for (const st of civSettlements(s, 0)) {
      const y = settlementYields(s, st);
      gold += y.gold;
      science += y.science;
      for (const b of activeBuildings(st)) gold -= BUILDING[b].upkeep;
    }
    const terms = stabilityTerms(s, 0);
    const offers = s.peaceOffers.filter((o) => o.toCiv === 0).length + s.ransoms.filter((o) => o.toCiv === 0).length;
    return {
      civ,
      turn: s.turn,
      gold,
      science,
      stab: stability(s, 0),
      stabTip: terms.filter((t) => t.value !== 0).map((t) => `${t.label}: ${t.value > 0 ? '+' : ''}${t.value}`).join('\n'),
      research: civ.researching ? `${TECH[civ.researching].name} ${civ.science}/${TECH[civ.researching].cost}` : 'Choose research',
      researchPct: civ.researching ? Math.min(100, (100 * civ.science) / TECH[civ.researching].cost) : 0,
      idle: idleUnits().length,
      idleSt: idleSettlements(s, 0).length,
      endLabel: endTurnLabel(),
      offers,
    };
  });
</script>

<header class="top panel">
  <span class="civ" style:background={`#${view.civ.color.toString(16).padStart(6, '0')}`}>{view.civ.name}</span>
  <span title="Turn">Turn {view.turn}/{TURN_LIMIT}</span>
  <span class="gold" title="Gold (net per turn)">● {view.civ.gold} ({view.gold >= 0 ? '+' : ''}{view.gold})</span>
  <button class="research" class:need={!view.civ.researching} onclick={() => (ui.screen = 'tech')} title="Research">
    <span class="sci">◆ +{view.science}</span>
    {view.research}
    <span class="bar"><span style:width={`${view.researchPct}%`}></span></span>
  </button>
  <span class="stab" class:neg={view.stab < 0} title={`Stability\n${view.stabTip}`}>Stability {view.stab}</span>
  <span class="spacer"></span>
  <button onclick={() => (ui.screen = 'diplomacy')}>Diplomacy{#if view.offers}<b class="badge">{view.offers}</b>{/if}</button>
  <button onclick={() => (ui.screen = 'log')}>Log</button>
  <button onclick={() => (ui.screen = 'help')}>?</button>
  {#if view.idleSt > 0}
    <button class="warn" onclick={() => selectNextIdleSettlement()} title="Settlements with nothing in production (does not block End turn)">
      {view.idleSt} not producing
    </button>
  {/if}
  {#if view.idle > 0}
    <button onclick={() => selectNextUnit()} title="Next unit needing orders (N)">{view.idle} idle</button>
  {/if}
  <button class="primary" class:blocked={view.endLabel !== 'End turn'} disabled={ui.busy} onclick={endTurn} title="End turn (E)">{view.endLabel}</button>
</header>

<style>
  .top {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    flex-wrap: wrap;
  }
  .civ {
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: 700;
    color: #fff;
  }
  .gold {
    color: var(--gold);
  }
  .sci {
    color: var(--science);
    margin-right: 4px;
  }
  .research {
    position: relative;
    padding-bottom: 7px;
  }
  .research.need {
    border-color: var(--warn);
  }
  .research .bar {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 2px;
    height: 3px;
    display: block;
  }
  .research .bar span {
    display: block;
    height: 100%;
    background: var(--science);
  }
  .stab.neg {
    color: var(--bad);
  }
  .spacer {
    flex: 1;
  }
  .warn {
    border-color: var(--warn);
    color: var(--warn);
  }
  .primary.blocked {
    background: var(--panel-2);
    border-color: var(--warn);
    color: var(--warn);
  }
  .badge {
    margin-left: 6px;
    background: var(--bad);
    color: #fff;
    border-radius: 8px;
    padding: 0 6px;
    font-size: 12px;
  }
</style>
