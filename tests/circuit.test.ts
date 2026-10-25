import { describe, expect, it } from 'vitest';
import { solve, type Element, INSULATOR_R } from '../src/sim/circuit';

const bat = (id: string, minus: string, plus: string, v: number): Element => ({ id, kind: 'battery', a: minus, b: plus, v });
const res = (id: string, a: string, b: string, r: number): Element => ({ id, kind: 'resistor', a, b, r });
const wire = (id: string, a: string, b: string): Element => ({ id, kind: 'resistor', a, b, r: 0.01 });

function cur(els: Element[], id: string) {
  return Math.abs(solve(els).results.get(id)!.current);
}

describe('circuit solver', () => {
  it('Ohm law: 12 V across 6 Ω gives ~2 A', () => {
    const els = [bat('B', 'n', 'p', 12), res('R', 'p', 'n', 6)];
    expect(cur(els, 'R')).toBeCloseTo(12 / 6.02, 3);
  });

  it('open circuit carries no current', () => {
    const els = [bat('B', 'n', 'p', 12), res('R', 'p', 'x', 6)];
    expect(cur(els, 'R')).toBeLessThan(1e-6);
  });

  it('series: same current everywhere, resistances add, voltage splits', () => {
    const els = [bat('B', 'n', 'p', 6), res('L1', 'p', 'a', 3), res('L2', 'a', 'n', 3)];
    const s = solve(els);
    const i1 = s.results.get('L1')!.current;
    const i2 = s.results.get('L2')!.current;
    expect(i1).toBeCloseTo(i2, 6);
    expect(i1).toBeCloseTo(1, 1);
    expect(s.results.get('L1')!.drop).toBeCloseTo(3, 1);
  });

  it('series: one break stops everything', () => {
    const els = [bat('B', 'n', 'p', 6), res('L1', 'p', 'a', 3), { ...res('L2', 'a', 'b', 3), open: true }, res('L3', 'b', 'n', 3)];
    expect(cur(els, 'L1')).toBeLessThan(1e-6);
    expect(cur(els, 'L3')).toBeLessThan(1e-6);
  });

  it('parallel: each branch gets full voltage, total current is the sum, branches independent', () => {
    const els = [bat('B', 'n', 'p', 12), res('L1', 'p', 'n', 12), res('L2', 'p', 'n', 6), { ...res('L3', 'p', 'n', 4), open: true }];
    const s = solve(els);
    // Each branch sees the battery terminal voltage (12 V minus a tiny internal drop).
    expect(Math.abs(s.results.get('L1')!.drop)).toBeGreaterThan(11.9);
    expect(Math.abs(s.results.get('L1')!.drop)).toBeCloseTo(Math.abs(s.results.get('L2')!.drop), 9);
    expect(Math.abs(s.results.get('B')!.current)).toBeCloseTo(
      Math.abs(s.results.get('L1')!.current) + Math.abs(s.results.get('L2')!.current),
      6,
    );
  });

  it('current is not used up: identical before and after a lamp', () => {
    const els = [bat('B', 'n', 'p', 12), wire('w1', 'p', 'a'), res('L', 'a', 'b', 4), wire('w2', 'b', 'n')];
    expect(cur(els, 'w1')).toBeCloseTo(cur(els, 'w2'), 6);
  });

  it('short circuit: wire across the battery gives a huge but finite current', () => {
    const els = [bat('B', 'n', 'p', 12), res('L', 'p', 'n', 6), wire('short', 'p', 'n')];
    const i = cur(els, 'short');
    expect(i).toBeGreaterThan(100);
    expect(Number.isFinite(i)).toBe(true);
    // The short steals almost all current; the lamp drops far below its normal 2 A.
    expect(cur(els, 'L')).toBeLessThan(0.7);
  });

  it('a series fuse melts on a short and opens the whole circuit', () => {
    const els: Element[] = [
      bat('B', 'n', 'p', 12),
      { id: 'F', kind: 'fuse', a: 'p', b: 'q', rating: 5 },
      res('L', 'q', 'n', 6),
      wire('short', 'q', 'n'),
    ];
    const s = solve(els);
    expect(s.blown).toEqual(['F']);
    expect(Math.abs(s.results.get('L')!.current)).toBeLessThan(1e-6);
  });

  it('a fuse under its rating stays intact', () => {
    const els: Element[] = [bat('B', 'n', 'p', 12), { id: 'F', kind: 'fuse', a: 'p', b: 'q', rating: 5 }, res('L', 'q', 'n', 6)];
    expect(solve(els).blown).toEqual([]);
  });

  it('a bypass wire in parallel with a lamp keeps the rest of a series string running', () => {
    const els: Element[] = [
      bat('B', 'n', 'p', 12),
      res('L1', 'p', 'a', 4),
      { ...res('L2', 'a', 'b', 4), open: true },
      wire('bridge', 'a', 'b'),
      res('L3', 'b', 'n', 4),
    ];
    expect(cur(els, 'L1')).toBeCloseTo(12 / 8, 1);
  });

  it('insulators carry practically nothing', () => {
    const els = [bat('B', 'n', 'p', 12), res('R', 'p', 'n', INSULATOR_R)];
    expect(cur(els, 'R')).toBeLessThan(1e-7);
  });

  it('more resistance means less current', () => {
    const lo = cur([bat('B', 'n', 'p', 12), res('R', 'p', 'n', 3)], 'R');
    const hi = cur([bat('B', 'n', 'p', 12), res('R', 'p', 'n', 12)], 'R');
    expect(hi).toBeLessThan(lo);
  });

  it('Kirchhoff current law holds at every node of a mixed network', () => {
    const els = [
      bat('B', 'n', 'p', 9),
      res('R1', 'p', 'a', 2),
      res('R2', 'a', 'n', 3),
      res('R3', 'a', 'b', 4),
      res('R4', 'b', 'n', 5),
      res('R5', 'p', 'b', 6),
    ];
    const s = solve(els);
    const net = new Map<string, number>();
    for (const e of els) {
      const i = s.results.get(e.id)!.current;
      net.set(e.a, (net.get(e.a) ?? 0) - i);
      net.set(e.b, (net.get(e.b) ?? 0) + i);
    }
    for (const v of net.values()) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('independent circuits do not interfere', () => {
    const els = [bat('B1', 'n1', 'p1', 12), res('R1', 'p1', 'n1', 6), bat('B2', 'n2', 'p2', 6), res('R2', 'p2', 'n2', 3)];
    expect(cur(els, 'R1')).toBeCloseTo(2, 1);
    expect(cur(els, 'R2')).toBeCloseTo(2, 1);
  });
});
