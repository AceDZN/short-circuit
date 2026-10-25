import type { Tile } from './types';

// Tile legend:
//  '#' wall          blocks movement and sight
//  '.' floor          ',' outdoor ground     '~' puddle (walkable)
//  'g' glass case     blocks movement, not sight
//  'b' desk / bench   blocks movement, not sight
//  'D' motor door     blocks both while closed
//  'W' window         blocks movement while closed, not sight
//  ' ' void           blocks movement, not sight

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly rows: string[];
  /** Tiles that are currently passable doors/windows, keyed "x,y". */
  openings = new Set<string>();

  constructor(map: string[]) {
    this.rows = map;
    this.h = map.length;
    this.w = Math.max(...map.map((r) => r.length));
  }

  at(x: number, y: number): string {
    if (y < 0 || y >= this.h || x < 0 || x >= this.w) return '#';
    return this.rows[y][x] ?? ' ';
  }

  isOpen(x: number, y: number) {
    return this.openings.has(`${x},${y}`);
  }

  walkable(x: number, y: number): boolean {
    const c = this.at(x, y);
    if (c === '.' || c === ',' || c === '~') return true;
    if (c === 'D' || c === 'W') return this.isOpen(x, y);
    return false;
  }

  /** Guards never climb through windows. */
  guardWalkable(x: number, y: number): boolean {
    const c = this.at(x, y);
    if (c === 'W') return false;
    return this.walkable(x, y);
  }

  blocksSight(x: number, y: number): boolean {
    const c = this.at(x, y);
    if (c === '#') return true;
    if (c === 'D') return !this.isOpen(x, y);
    return false;
  }

  /** Line of sight between two points in tile space (centres are x+0.5). */
  los(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 0.15));
    const sx = Math.floor(ax);
    const sy = Math.floor(ay);
    const ex = Math.floor(bx);
    const ey = Math.floor(by);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(ax + dx * t);
      const y = Math.floor(ay + dy * t);
      if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
      if (this.blocksSight(x, y)) return false;
    }
    return true;
  }

  /** A* over tiles (8-connected, no corner cutting). Returns tile path excluding start. */
  path(from: Tile, to: Tile, ok: (x: number, y: number) => boolean): Tile[] | null {
    const key = (x: number, y: number) => y * this.w + x;
    if (!ok(to[0], to[1])) return null;
    const open: { k: number; x: number; y: number; f: number }[] = [];
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const startK = key(from[0], from[1]);
    g.set(startK, 0);
    open.push({ k: startK, x: from[0], y: from[1], f: 0 });
    const goalK = key(to[0], to[1]);
    const closed = new Set<number>();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.k === goalK) {
        const out: Tile[] = [];
        let k = cur.k;
        while (k !== startK) {
          out.push([k % this.w, Math.floor(k / this.w)]);
          k = came.get(k)!;
        }
        return out.reverse();
      }
      if (closed.has(cur.k)) continue;
      closed.add(cur.k);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (!ok(nx, ny)) continue;
          if (dx && dy && (!ok(cur.x + dx, cur.y) || !ok(cur.x, cur.y + dy))) continue;
          const nk = key(nx, ny);
          const ng = g.get(cur.k)! + (dx && dy ? 1.4142 : 1);
          if (ng < (g.get(nk) ?? Infinity)) {
            g.set(nk, ng);
            came.set(nk, cur.k);
            open.push({ k: nk, x: nx, y: ny, f: ng + Math.hypot(to[0] - nx, to[1] - ny) });
          }
        }
    }
    return null;
  }
}

export function angleDiff(a: number, b: number) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
