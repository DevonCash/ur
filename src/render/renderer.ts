// PixiJS map renderer. Reads game state, never mutates it. Flat colours only.
import { Application, Container, Graphics, Text } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { canAttack } from '../core/combat';
import { UNIT } from '../core/data';
import { cornerOffset, neighbour, pixelToTile, tileCenter } from '../core/hex';
import { computeReach } from '../core/settlement';
import type { GameState } from '../core/types';
import { canPass, pathFor } from '../core/units';
import { dijkstra, grid, isMilitary, settlementById, unitById } from '../core/world';

export const HEX = 22;

const TERRAIN_COLOR: Record<string, number> = {
  grassland: 0x8fbf5c,
  plains: 0xcbbf72,
  desert: 0xe5d39c,
  tundra: 0xb9c3b2,
  coast: 0x82b8d8,
  ocean: 0x3f76a3,
  lake: 0x72b2d9,
  mountain: 0x857c73,
};
const RESOURCE_COLOR: Record<string, number> = {
  wheat: 0xf2d24b, cattle: 0xf4efe6, stone: 0xb9b9b9, copper: 0xd07a3a, horses: 0x7a4b2a, dates: 0x9b4f8f, lapis: 0x2f55c8,
};
const RIVER = 0x2f86d0;
const ROAD = 0x7d5b3a;

export interface Overlay {
  selectedUnit: number | null;
  selectedSettlement: number | null;
  hoverTile: number | null;
  projectMode: boolean;
  /** valid tiles for the project being placed */
  projectTargets: number[] | null;
}

export class MapRenderer {
  app = new Application();
  viewport!: Viewport;
  private terrain = new Graphics();
  private rivers = new Graphics();
  private resources = new Container();
  private land = new Graphics();
  private borders = new Graphics();
  private overlay = new Graphics();
  private settlements = new Container();
  private units = new Container();
  private fog = new Graphics();
  /** above fog: hex grid, then cursor/selection/path markers */
  private grid = new Graphics();
  private cursor = new Graphics();
  private labels: Text[] = [];
  private unitTexts: Text[] = [];
  private builtFor: string | null = null;

  async init(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      background: 0x101317,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    host.appendChild(this.app.canvas);
    this.viewport = new Viewport({
      screenWidth: host.clientWidth,
      screenHeight: host.clientHeight,
      events: this.app.renderer.events,
    });
    this.viewport.drag({ mouseButtons: 'left' }).pinch().wheel({ smooth: 4 }).decelerate().clampZoom({ minScale: 0.35, maxScale: 2.5 });
    this.app.stage.addChild(this.viewport);
    for (const layer of [this.terrain, this.rivers, this.land, this.resources, this.borders, this.overlay, this.settlements, this.units, this.fog, this.grid, this.cursor]) {
      this.viewport.addChild(layer);
    }
    window.addEventListener('resize', () => this.viewport.resize(host.clientWidth, host.clientHeight));
  }

  tileAt(s: GameState, screenX: number, screenY: number): number {
    const p = this.viewport.toWorld(screenX, screenY);
    return pixelToTile(s.w, s.h, p.x, p.y, HEX);
  }

  centerOn(s: GameState, tile: number) {
    const [x, y] = tileCenter(s.w, tile, HEX);
    this.viewport.moveCenter(x, y);
  }

  /**
   * Glide to a tile only if it is off-screen or near the edge of the visible area.
   * `inset` is screen space covered by UI (top bar, side panel) to treat as off-screen.
   */
  focus(s: GameState, tile: number, inset: { top: number; right: number; bottom: number; left: number }) {
    const [x, y] = tileCenter(s.w, tile, HEX);
    const p = this.viewport.toScreen(x, y);
    const margin = 60;
    const w = this.viewport.screenWidth;
    const h = this.viewport.screenHeight;
    const inside =
      p.x >= inset.left + margin && p.x <= w - inset.right - margin && p.y >= inset.top + margin && p.y <= h - inset.bottom - margin;
    if (inside) return;
    this.viewport.plugins.remove('animate');
    this.viewport.animate({ position: { x, y }, time: 350, ease: 'easeInOutSine', removeOnInterrupt: true });
  }

  private hexPoly(s: GameState, i: number, inset = 0): number[] {
    const [cx, cy] = tileCenter(s.w, i, HEX);
    const pts: number[] = [];
    for (let c = 0; c < 6; c++) {
      const [ox, oy] = cornerOffset(c, HEX - inset);
      pts.push(cx + ox, cy + oy);
    }
    return pts;
  }

  /** Static layers: terrain, features, rivers, resources. */
  private buildStatic(s: GameState) {
    const key = `${s.seed}:${s.w}x${s.h}`;
    if (this.builtFor === key) return;
    this.builtFor = key;
    const g = this.terrain;
    g.clear();
    this.resources.removeChildren().forEach((c) => c.destroy());
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      g.poly(this.hexPoly(s, i)).fill(TERRAIN_COLOR[t.terrain]);
      const [cx, cy] = tileCenter(s.w, i, HEX);
      if (t.terrain === 'mountain') {
        g.poly([cx - 11, cy + 7, cx - 2, cy - 9, cx + 7, cy + 7]).fill(0x625a52);
        g.poly([cx - 1, cy + 7, cx + 6, cy - 4, cx + 13, cy + 7]).fill(0x6e665e);
      }
      if (t.feature === 'hills') {
        g.poly([cx - 12, cy + 6, cx - 5, cy - 3, cx + 2, cy + 6]).fill(0xa08e5c);
        g.poly([cx - 2, cy + 8, cx + 5, cy - 1, cx + 12, cy + 8]).fill(0x93824f);
      } else if (t.feature === 'forest') {
        for (const [dx, dy] of [[-7, 2], [0, -5], [7, 3], [0, 7]]) g.circle(cx + dx, cy + dy, 4.5).fill(0x3e7a3b);
      } else if (t.feature === 'marsh') {
        for (const dy of [-5, 0, 5]) g.rect(cx - 9 + (dy === 0 ? 3 : 0), cy + dy, 13, 1.6).fill(0x4f8a7a);
      }
    }
    // rivers along edges (each edge drawn once), fords as gaps
    const r = this.rivers;
    r.clear();
    const gr = grid(s);
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!t.river) continue;
      const [cx, cy] = tileCenter(s.w, i, HEX);
      for (let d = 0; d < 6; d++) {
        if (!((t.river >> d) & 1)) continue;
        const n = neighbour(gr, i, d);
        if (n >= 0 && n < i) continue;
        const [ax, ay] = cornerOffset(d, HEX);
        const [bx, by] = cornerOffset((d + 1) % 6, HEX);
        if ((t.ford >> d) & 1) {
          r.moveTo(cx + ax, cy + ay).lineTo(cx + ax + (bx - ax) * 0.3, cy + ay + (by - ay) * 0.3).stroke({ width: 4, color: RIVER });
          r.moveTo(cx + ax + (bx - ax) * 0.7, cy + ay + (by - ay) * 0.7).lineTo(cx + bx, cy + by).stroke({ width: 4, color: RIVER });
        } else {
          r.moveTo(cx + ax, cy + ay).lineTo(cx + bx, cy + by).stroke({ width: 4, color: RIVER, cap: 'round' });
        }
      }
    }
    this.grid.clear();
    for (let i = 0; i < s.tiles.length; i++) this.grid.poly(this.hexPoly(s, i)).stroke({ width: 1, color: 0xffffff, alpha: 0.07 });
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!t.resource) continue;
      const [cx, cy] = tileCenter(s.w, i, HEX);
      const dot = new Graphics().circle(cx + 9, cy - 9, 5).fill(RESOURCE_COLOR[t.resource]).stroke({ width: 1, color: 0x222222 });
      this.resources.addChild(dot);
    }
  }

  render(s: GameState, o: Overlay) {
    this.buildStatic(s);
    const vis = s.civs[0].vis;
    this.drawLand(s);
    this.drawBorders(s);
    this.drawSettlements(s, vis);
    this.drawUnits(s, vis, o);
    this.drawFog(s, vis);
    this.drawOverlay(s, o);
  }

  private drawLand(s: GameState) {
    const g = this.land;
    g.clear();
    const gr = grid(s);
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      const [cx, cy] = tileCenter(s.w, i, HEX);
      if (t.urban >= 0) {
        g.poly(this.hexPoly(s, i, 1)).fill(0xa28c76);
        for (const [dx, dy, w, h] of [[-9, -6, 7, 6], [1, -8, 8, 7], [-5, 3, 8, 6], [5, 2, 6, 7]]) g.rect(cx + dx, cy + dy, w, h).fill(0xc9b9a3);
        continue;
      }
      if (t.road) {
        for (let d = 0; d < 3; d++) {
          const n = neighbour(gr, i, d);
          if (n < 0 || !s.tiles[n].road) continue;
          const [nx, ny] = tileCenter(s.w, n, HEX);
          g.moveTo(cx, cy).lineTo(nx, ny).stroke({ width: 2.5, color: ROAD });
        }
      }
      if (t.improvement) {
        const col = t.pillaged ? 0x8a3a2a : 0x5a4a32;
        if (t.improvement === 'farm') for (const dx of [-6, -1, 4]) g.rect(cx + dx, cy - 4, 2, 9).fill(t.pillaged ? col : 0xd9b84a);
        if (t.improvement === 'pasture') g.rect(cx - 6, cy - 3, 12, 7).stroke({ width: 1.5, color: col });
        if (t.improvement === 'mine') g.poly([cx - 5, cy + 5, cx, cy - 3, cx + 5, cy + 5]).fill(0x3a3430);
        if (t.improvement === 'lumber') g.rect(cx - 6, cy + 3, 12, 3).fill(0x6a4a2a);
        if (t.pillaged) {
          g.moveTo(cx - 6, cy - 6).lineTo(cx + 6, cy + 6).stroke({ width: 2, color: 0xc0392b });
          g.moveTo(cx + 6, cy - 6).lineTo(cx - 6, cy + 6).stroke({ width: 2, color: 0xc0392b });
        }
      }
    }
  }

  private drawBorders(s: GameState) {
    const g = this.borders;
    g.clear();
    const gr = grid(s);
    const civOf = new Map(s.settlements.map((x) => [x.id, x.civId]));
    const vis = s.civs[0].vis;
    for (let i = 0; i < s.tiles.length; i++) {
      const o = s.tiles[i].owner;
      if (o < 0 || vis[i] === 0) continue;
      const civ = civOf.get(o);
      if (civ === undefined) continue;
      const color = s.civs[civ].color;
      g.poly(this.hexPoly(s, i)).fill({ color, alpha: 0.13 });
      const [cx, cy] = tileCenter(s.w, i, HEX);
      for (let d = 0; d < 6; d++) {
        const n = neighbour(gr, i, d);
        const no = n >= 0 ? s.tiles[n].owner : -1;
        const nciv = no >= 0 ? civOf.get(no) : undefined;
        if (nciv === civ) {
          if (no !== o) {
            const [ax, ay] = cornerOffset(d, HEX - 1);
            const [bx, by] = cornerOffset((d + 1) % 6, HEX - 1);
            g.moveTo(cx + ax, cy + ay).lineTo(cx + bx, cy + by).stroke({ width: 1, color, alpha: 0.5 });
          }
          continue;
        }
        const [ax, ay] = cornerOffset(d, HEX - 2);
        const [bx, by] = cornerOffset((d + 1) % 6, HEX - 2);
        g.moveTo(cx + ax, cy + ay).lineTo(cx + bx, cy + by).stroke({ width: 3, color });
      }
    }
  }

  private text(pool: Text[], idx: number, parent: Container, size: number, color = 0xffffff, bold = false): Text {
    let t = pool[idx];
    if (!t) {
      t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: size, fill: color, fontWeight: bold ? '700' : '500' } });
      pool[idx] = t;
    }
    t.style.fontSize = size;
    t.style.fill = color;
    parent.addChild(t);
    return t;
  }

  private drawSettlements(s: GameState, vis: number[]) {
    this.settlements.removeChildren();
    const bg = new Graphics();
    this.settlements.addChild(bg);
    let k = 0;
    for (const st of s.settlements) {
      if (vis[st.center] === 0) continue;
      const civ = s.civs[st.civId];
      const [cx, cy] = tileCenter(s.w, st.center, HEX);
      const label = this.text(this.labels, k++, this.settlements, 12, 0xffffff, true);
      const besieged = st.besieged ? ' ⚔' : '';
      label.text = `${st.name} ${st.pop}${besieged}`;
      const w = label.width + 26;
      const x = cx - w / 2;
      const y = cy - HEX - 14;
      bg.rect(x, y, w, 18).fill(civ.color).stroke({ width: 1, color: 0x101317 });
      bg.rect(x, y, 18, 18).fill(0x101317);
      const tierTxt = this.text(this.labels, k++, this.settlements, 11, 0xffffff, true);
      tierTxt.text = ['I', 'II', 'III', 'IV'][st.tier];
      tierTxt.position.set(x + 9 - tierTxt.width / 2, y + 2);
      label.position.set(x + 22, y + 1);
      if (st.hp < 200 + (st.buildings.includes('walls') ? 100 : 0)) {
        const max = 200 + (st.buildings.includes('walls') ? 100 : 0);
        bg.rect(x, y + 18, w, 3).fill(0x101317);
        bg.rect(x, y + 18, (w * Math.max(0, st.hp)) / max, 3).fill(0x4caf50);
      }
    }
  }

  private drawUnits(s: GameState, vis: number[], o: Overlay) {
    this.units.removeChildren();
    const g = new Graphics();
    this.units.addChild(g);
    let k = 0;
    for (const u of s.units) {
      if (vis[u.tile] !== 2) continue;
      const civ = s.civs[u.civId];
      const [cx0, cy0] = tileCenter(s.w, u.tile, HEX);
      const mil = isMilitary(u);
      const both = s.units.some((x) => x.tile === u.tile && x.id !== u.id);
      const cx = cx0 + (both ? (mil ? -6 : 7) : 0);
      const cy = cy0 + 3;
      const sel = o.selectedUnit === u.id;
      if (mil) g.circle(cx, cy, 10).fill(civ.color).stroke({ width: sel ? 3 : 1.5, color: sel ? 0xffffff : 0x101317 });
      else g.roundRect(cx - 9, cy - 9, 18, 18, 3).fill(0xf2efe8).stroke({ width: sel ? 3 : 2, color: sel ? 0xffffff : civ.color });
      const t = this.text(this.unitTexts, k++, this.units, 10, mil ? 0xffffff : 0x101317, true);
      t.text = u.type === 'migrants' ? `M${u.people}` : UNIT[u.type].letter;
      t.position.set(cx - t.width / 2, cy - t.height / 2);
      if (u.hp < 100) {
        g.rect(cx - 10, cy + 12, 20, 3).fill(0x101317);
        g.rect(cx - 10, cy + 12, (20 * u.hp) / 100, 3).fill(u.hp > 50 ? 0x4caf50 : u.hp > 25 ? 0xe0a800 : 0xd8432e);
      }
      if (u.fortify >= 2) g.rect(cx - 11, cy - 13, 22, 2).fill(0xffffff);
      if (u.civId === 0 && u.moves > 0 && !u.sleeping && u.fortify === 0) g.circle(cx + 9, cy - 9, 3).fill(0xffffff);
    }
  }

  private drawFog(s: GameState, vis: number[]) {
    const g = this.fog;
    g.clear();
    for (let i = 0; i < s.tiles.length; i++) {
      if (vis[i] === 2) continue;
      if (vis[i] === 0) g.poly(this.hexPoly(s, i, -0.6)).fill(0x101317);
      else g.poly(this.hexPoly(s, i, -0.6)).fill({ color: 0x0b0d10, alpha: 0.38 });
    }
  }

  drawOverlay(s: GameState, o: Overlay) {
    const g = this.overlay;
    g.clear();
    const c = this.cursor;
    c.clear();
    if (o.selectedSettlement !== null) {
      const st = settlementById(s, o.selectedSettlement);
      if (st) {
        for (const [i] of computeReach(s, st)) {
          if (s.tiles[i].owner !== st.id) continue;
          g.poly(this.hexPoly(s, i, 3)).stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 });
        }
        for (const i of st.worked) {
          const [cx, cy] = tileCenter(s.w, i, HEX);
          g.circle(cx - 9, cy + 9, 4).fill(st.locked.includes(i) ? 0xffe066 : 0xffffff).stroke({ width: 1, color: 0x101317 });
        }
      }
    }
    if (o.selectedUnit !== null) {
      const u = unitById(s, o.selectedUnit);
      if (u && u.civId === 0) {
        c.poly(this.hexPoly(s, u.tile, 1)).stroke({ width: 2.5, color: 0xffffff });
        if (u.moves > 0) {
          const reach = dijkstra(s, [u.tile], { maxCost: u.moves, canEnter: (t) => canPass(s, u, t) });
          for (const [i] of reach) if (i !== u.tile) g.poly(this.hexPoly(s, i, 2)).fill({ color: 0xffffff, alpha: 0.12 });
          for (let i = 0; i < s.tiles.length; i++) {
            if (s.civs[0].vis[i] === 2 && canAttack(s, u, i)) g.poly(this.hexPoly(s, i, 2)).stroke({ width: 3, color: 0xd8432e });
          }
        }
        if (o.hoverTile !== null && o.hoverTile !== u.tile && !o.projectMode) {
          const p = pathFor(s, u, o.hoverTile);
          if (p) {
            let prev = tileCenter(s.w, p.path[0], HEX);
            for (let k = 1; k < p.path.length; k++) {
              const next = tileCenter(s.w, p.path[k], HEX);
              c.moveTo(prev[0], prev[1]).lineTo(next[0], next[1]).stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
              prev = next;
            }
            c.circle(prev[0], prev[1], 5).fill(0xffffff);
          }
        }
      }
    }
    if (o.projectTargets) {
      for (const i of o.projectTargets) c.poly(this.hexPoly(s, i, 2)).fill({ color: 0xffe066, alpha: 0.28 }).stroke({ width: 1.5, color: 0xffe066 });
    }
    if (o.hoverTile !== null && o.hoverTile >= 0) {
      const bad = o.projectTargets && !o.projectTargets.includes(o.hoverTile);
      c.poly(this.hexPoly(s, o.hoverTile, 1)).stroke({ width: 2, color: bad ? 0xd8432e : o.projectMode ? 0xffe066 : 0xffffff, alpha: 0.9 });
    }
  }
}

