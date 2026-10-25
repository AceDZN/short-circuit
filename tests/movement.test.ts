import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { Game } from '../src/sim/game';

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const R = 0.28;
/** The body circle overlaps no blocked tile (a hair of tolerance for float error). */
function bodyClear(g: Game) {
  const t = g.state.thief;
  for (let ty = Math.floor(t.y) - 1; ty <= Math.floor(t.y) + 1; ty++)
    for (let tx = Math.floor(t.x) - 1; tx <= Math.floor(t.x) + 1; tx++) {
      if (g.grid.walkable(tx, ty)) continue;
      const cx = Math.min(Math.max(t.x, tx), tx + 1);
      const cy = Math.min(Math.max(t.y, ty), ty + 1);
      if (Math.hypot(t.x - cx, t.y - cy) < R - 0.01) return false;
    }
  return true;
}

describe('thief movement never enters walls and never gets stuck', () => {
  for (const L of LEVELS)
    for (const seed of [1, 7, 42]) {
      it(`${L.id} seed ${seed}: random walking stays out of walls`, () => {
        const g = new Game(L);
        const r = rng(seed * 101 + L.index);
        // nobody can catch or alarm us: we're testing movement only
        g.failWith = () => {};
        let intent = { x: 0, y: 0, run: false };
        for (let i = 0; i < 6000; i++) {
          if (i % 30 === 0) {
            const a = r() * Math.PI * 2;
            intent = { x: Math.cos(a), y: Math.sin(a), run: r() < 0.3 };
            if (r() < 0.15) intent = { x: Math.sign(Math.cos(a)), y: 0, run: false };
          }
          g.moveIntent = intent;
          g.step(1 / 60);
          expect(bodyClear(g), `inside a wall at ${g.state.thief.x.toFixed(2)},${g.state.thief.y.toFixed(2)} step ${i}`).toBe(true);
        }
      });
    }

  it('a motor door shutting on the thief pushes him out instead of trapping him', () => {
    const L = LEVELS[0];
    const g = new Game(L);
    g.failWith = () => {};
    g.state.panelOpen = 'p2';
    const coin = g.placeItem('coin', 'c3', 'g1', 'g2')!;
    g.closePanel();
    for (let i = 0; i < 120; i++) g.step(1 / 60);
    g.state.thief.x = 18.85; // body overlapping the open door tile
    g.state.thief.y = 4.5;
    g.state.panelOpen = 'p2';
    g.pickupPlaced(coin);
    g.closePanel();
    for (let i = 0; i < 120; i++) g.step(1 / 60);
    expect(bodyClear(g)).toBe(true);
    // and he can still walk along the wall (no sticky collision)
    const y0 = g.state.thief.y;
    g.moveIntent = { x: 0, y: 1, run: false };
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    expect(g.state.thief.y).toBeGreaterThan(y0 + 0.5);
  });

  it('pushing diagonally into a wall slides along it', () => {
    const g = new Game(LEVELS[0]);
    g.failWith = () => {};
    g.state.thief.x = 3;
    g.state.thief.y = 6.5;
    g.moveIntent = { x: 1, y: -1, run: false }; // north-east into the vestibule's north wall
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    expect(g.state.thief.x).toBeGreaterThan(3.5);
  });
});
