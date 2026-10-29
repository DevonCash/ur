// Read-only view helpers for the UI.
import { odds, targetAt } from '../core/combat';
import { FEATURE, IMPROVEMENT, RESOURCE, TERRAIN, type Yields } from '../core/data';
import type { GameState } from '../core/types';
import { hasFreshWater, ownerCiv, settlementById, tileYields, unitById } from '../core/world';

export function yieldsText(y: Yields): string {
  const parts: string[] = [];
  if (y.food) parts.push(`${y.food} food`);
  if (y.prod) parts.push(`${y.prod} prod`);
  if (y.gold) parts.push(`${y.gold} gold`);
  return parts.join(' · ') || 'no yield';
}

export interface TileInfo {
  title: string;
  lines: string[];
}

export function tileInfo(s: GameState, i: number, selectedUnit: number | null): TileInfo | null {
  if (i < 0 || i >= s.tiles.length) return null;
  const vis = s.civs[0].vis[i];
  if (vis === 0) return { title: 'Unexplored', lines: [] };
  const t = s.tiles[i];
  const name = t.feature ? `${FEATURE[t.feature].name} (${TERRAIN[t.terrain].name})` : TERRAIN[t.terrain].name;
  const lines: string[] = [];
  if (t.urban >= 0) {
    const st = settlementById(s, t.urban);
    if (st) lines.push(`${st.name} (${s.civs[st.civId].name})`);
  }
  lines.push(yieldsText(tileYields(s, i, s.civs[0])));
  if (t.resource) {
    const r = RESOURCE[t.resource];
    lines.push(`${r.name} (${r.kind})`);
  }
  if (t.improvement) lines.push(`${IMPROVEMENT[t.improvement].name}${t.pillaged ? ' — pillaged' : ''}`);
  if (t.road) lines.push('Road');
  if (t.river) lines.push(`River${t.ford ? ' (ford)' : ''}`);
  if (hasFreshWater(s, i)) lines.push('Fresh water');
  const oc = ownerCiv(s, i);
  if (oc >= 0) {
    const st = settlementById(s, t.owner);
    lines.push(`Territory: ${st?.name ?? ''} (${s.civs[oc].name})`);
  }
  if (t.dev > 0) lines.push(`Developing: ${t.dev}/5 turns`);
  if (vis === 2) {
    for (const u of s.units.filter((x) => x.tile === i)) {
      lines.push(`${s.civs[u.civId].name} ${u.type}${u.type === 'migrants' ? ` (${u.people})` : ''} — ${u.hp} HP`);
    }
  }
  if (selectedUnit !== null) {
    const su = unitById(s, selectedUnit);
    if (su && su.civId === 0) {
      const target = targetAt(s, su, i);
      if (target) {
        const o = odds(s, su, target);
        lines.push(`Attack: ${o.attackerStrength.toFixed(1)} vs ${o.defenderStrength.toFixed(1)}`);
        lines.push(`Expected damage: deal ~${Math.round(o.damageToDefender)}, take ~${Math.round(o.damageToAttacker)}`);
      }
    }
  }
  return { title: name, lines };
}
