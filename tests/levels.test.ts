import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { Game } from '../src/sim/game';

describe('every level is well-formed', () => {
  for (const L of LEVELS) {
    it(`${L.id}: rows equal width, start/exit walkable, panels front walkable, parts unique`, () => {
      const w = L.map[0].length;
      for (const r of L.map) expect(r.length).toBe(w);
      const g = new Game(L);
      expect(g.grid.walkable(...L.start)).toBe(true);
      expect(g.grid.walkable(...L.exit)).toBe(true);
      for (const p of L.panels) expect(g.grid.walkable(...p.front)).toBe(true);
      const ids = L.circuits.flatMap((c) => c.parts.map((p) => p.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of L.devices) expect(ids).toContain(d.part);
      for (const c of L.circuits) for (const p of c.parts) {
        expect(c.nodes[p.a]).toBeDefined();
        expect(c.nodes[p.b]).toBeDefined();
      }
      // the building starts quiet: no alarm, no blown fuse
      expect(g.state.status).toBe('playing');
      expect(Object.values(g.state.parts).some((p) => p.blown)).toBe(false);
    });
  }
});
