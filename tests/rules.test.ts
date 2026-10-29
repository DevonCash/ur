import { describe, expect, it } from 'vitest';
import { attack } from '../src/core/combat';
import { TIER_TURNS } from '../src/core/data';
import { hooks, newGame, projectTargets, startTurn } from '../src/core/game';
import { neighbour } from '../src/core/hex';
import { resolveDrift } from '../src/core/migration';
import { computeReach } from '../src/core/settlement';
import { createUnit } from '../src/core/units';
import { grid, relation } from '../src/core/world';
import { cr, flatState, foundAt } from './helpers';

describe('map generation', () => {
  it('is deterministic per seed', () => {
    const a = newGame({ seed: 7, allAi: true });
    const b = newGame({ seed: 7, allAi: true });
    expect(JSON.stringify(a.tiles)).toBe(JSON.stringify(b.tiles));
    const c = newGame({ seed: 8, allAi: true });
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(c.tiles));
  });

  it('stores rivers on both sides of each edge', () => {
    const s = newGame({ seed: 11, allAi: true });
    const g = grid(s);
    let rivers = 0;
    for (let i = 0; i < s.tiles.length; i++) {
      for (let d = 0; d < 6; d++) {
        if (!((s.tiles[i].river >> d) & 1)) continue;
        rivers++;
        const n = neighbour(g, i, d);
        expect((s.tiles[n].river >> ((d + 3) % 6)) & 1).toBe(1);
      }
    }
    expect(rivers).toBeGreaterThan(20);
  });
});

describe('reach', () => {
  it('follows travel cost: hills shorten reach', () => {
    const s = flatState();
    const st = foundAt(s, 0, cr(s, 10, 10));
    const flat = computeReach(s, st).size;
    for (let i = 0; i < s.tiles.length; i++) if (i !== st.center) s.tiles[i].feature = 'hills';
    const hilly = computeReach(s, st).size;
    expect(hilly).toBeLessThan(flat);
  });
});

describe('people', () => {
  it('training a unit costs a person and a recruit', () => {
    const s = flatState();
    const st = foundAt(s, 0, cr(s, 10, 10), 3);
    st.production = { kind: 'unit', unit: 'warrior' };
    st.prodStored = 100;
    const pop = st.pop;
    const rec = st.recruits;
    startTurn(s, 0);
    expect(s.units.filter((u) => u.type === 'warrior')).toHaveLength(1);
    expect(st.pop).toBe(pop - 1);
    expect(st.recruits).toBe(rec - 1);
  });

  it('sustained population upgrades the tier after 8 turns', () => {
    const s = flatState();
    const st = foundAt(s, 0, cr(s, 10, 10), 3);
    for (let k = 0; k < TIER_TURNS - 1; k++) {
      startTurn(s, 0);
      st.pop = 3;
    }
    expect(st.tier).toBe(0);
    startTurn(s, 0);
    expect(st.tier).toBe(1);
  });
});

describe('combat', () => {
  function war() {
    const s = flatState();
    relation(s, 0, 1).state = 'war';
    foundAt(s, 0, cr(s, 5, 10), 3);
    foundAt(s, 1, cr(s, 20, 10), 3);
    return s;
  }

  it('a melee kill takes a prisoner; a ranged kill does not', () => {
    const s = war();
    const a = createUnit(s, 0, 'swordsman', cr(s, 12, 10), null);
    const v = createUnit(s, 1, 'warrior', cr(s, 13, 10), null);
    v.hp = 1;
    s.current = 0;
    attack(s, a, v.tile, hooks);
    expect(s.prisoners).toHaveLength(1);
    expect(s.prisoners[0].civId).toBe(1);

    const b = createUnit(s, 0, 'bowman', cr(s, 12, 12), null);
    const v2 = createUnit(s, 1, 'warrior', cr(s, 14, 12), null);
    v2.hp = 1;
    s.civs[0].vis[v2.tile] = 2;
    attack(s, b, v2.tile, hooks);
    expect(s.units.find((u) => u.id === v2.id)).toBeUndefined();
    expect(s.prisoners).toHaveLength(1);
  });

  it('an encircled settlement is besieged and works only its footprint', () => {
    const s = war();
    const target = s.settlements.find((x) => x.civId === 1)!;
    const g = grid(s);
    for (let d = 0; d < 6; d += 2) createUnit(s, 0, 'warrior', neighbour(g, target.center, d), null);
    startTurn(s, 1);
    expect(target.besieged).toBe(true);
    expect(target.worked).toHaveLength(0);
  });
});

describe('migration', () => {
  it('people drift toward a more attractive settlement across open borders, not closed ones', () => {
    const run = (closed: boolean) => {
      const s = flatState();
      const poor = foundAt(s, 0, cr(s, 8, 10), 6);
      const rich = foundAt(s, 1, cr(s, 15, 10), 2);
      if (closed) s.civs[1].closed[0] = true;
      poor.lastFoodNet = -6;
      rich.lastFoodNet = 12;
      let moved = 0;
      for (let k = 0; k < 20; k++) {
        const before = rich.pop;
        resolveDrift(s);
        moved += rich.pop - before;
        poor.lastFoodNet = -6;
        rich.lastFoodNet = 12;
      }
      return moved;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });

  it('villages send half their surplus to a nearby town', () => {
    const s = flatState();
    const town = foundAt(s, 0, cr(s, 8, 10), 6);
    town.tier = 2;
    const village = foundAt(s, 0, cr(s, 16, 10), 2);
    startTurn(s, 0);
    expect(village.lastFoodNet).toBeGreaterThan(1);
    expect(town.food).toBeGreaterThan(0);
  });
});

describe('architecture', () => {
  it('src/core has no DOM or UI imports', () => {
    const files = import.meta.glob<string>('../src/core/*.ts', { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(files).length).toBeGreaterThan(5);
    for (const src of Object.values(files)) {
      expect(src).not.toMatch(/\b(document|window)\./);
      expect(src).not.toMatch(/from ['"](pixi\.js|svelte|\.\.\/ui|\.\.\/render)/);
    }
  });
});

describe('project targets (#9)', () => {
  it('lists only tiles where the project is allowed', () => {
    const s = flatState();
    const st = foundAt(s, 0, cr(s, 10, 10), 3);
    // nothing pillaged and no improvement techs yet: no valid targets
    expect(projectTargets(s, st, 'repair')).toEqual([]);
    expect(projectTargets(s, st, 'rushdev')).toEqual([]);
    // a hill in territory is a valid mine target once Stoneworking is known
    const hill = st.worked[0] ?? cr(s, 11, 10);
    s.tiles[hill].feature = 'hills';
    s.civs[0].techs.push('stoneworking');
    expect(projectTargets(s, st, 'mine')).toEqual([hill]);
    s.civs[0].techs.push('tilling');
    expect(projectTargets(s, st, 'rushdev').length).toBeGreaterThan(0);
  });
});
