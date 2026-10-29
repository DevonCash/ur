import { describe, expect, it } from 'vitest';
import { runUntilHuman } from '../src/ai/ai';
import { newGame } from '../src/core/game';

describe('AI-vs-AI full game', () => {
  it('plays to a victory without crashing', () => {
    const s = newGame({ seed: 12345, aiCount: 2, allAi: true });
    const t0 = performance.now();
    runUntilHuman(s, 1000);
    const ms = performance.now() - t0;
    const pops = s.settlements.map((x) => `${x.civId}:${x.name}:${x.pop}:t${x.tier}`);
    console.log(`turn ${s.turn} winner ${s.winner} (${s.victory}) in ${Math.round(ms)}ms; settlements ${pops.length}`);
    console.log(pops.join(' '));
    console.log(s.civs.map((c) => `${c.name} techs=${c.techs.length} gold=${c.gold} alive=${c.alive}`).join('\n'));
    console.log(s.log.filter((l) => l.kind === 'diplomacy' || l.kind === 'settlement' && l.text.includes('captured')).slice(-15).map((l) => `${l.turn}: ${l.text}`).join('\n'));
    expect(s.winner).not.toBeNull();
  });
});
