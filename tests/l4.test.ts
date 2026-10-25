import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { L4 } from '../src/levels/l4-motor';
import { Game } from '../src/sim/game';
import type { ItemKind } from '../src/sim/types';

function rig(bat: ItemKind, slot: ItemKind[]) {
  const g = new Game(L4);
  g.state.panelOpen = 'pd';
  g.placeItem(bat, 'cd', 'bp', 'bq');
  for (const r of slot) g.placeItem(r, 'cd', 'r1', 'r2');
  return g;
}

describe('heist 4 — motor door (Ohm law)', () => {
  it.each([
    ['bat12', ['res3'], 12 / 5, true],
    ['bat12', ['res6'], 12 / 8, false],
    ['bat12', ['res12'], 12 / 14, false],
    ['bat6', ['res3'], 6 / 5, false],
    ['bat6', ['coin'], 6 / 2, true],
    ['bat12', ['res6', 'res12'], 12 / 6, true],
    ['bat12', ['res3', 'res6'], 12 / 4, true],
  ] as [ItemKind, ItemKind[], number, boolean][])('%s + %j gives I = V/R ≈ %f A, door opens: %s', (bat, slot, expected, opens) => {
    const g = rig(bat, slot);
    // within a few % (battery and wires add a few hundredths of an ohm)
    expect(Math.abs(g.current('cd_motor') - expected) / expected).toBeLessThan(0.05);
    expect(g.devices.get('vault')!.on).toBe(opens);
  });

  it('too much current (12 V, conductor instead of a resistor) melts the fuse and the door stays jammed', () => {
    const g = rig('bat12', ['coin']);
    expect(g.state.parts.cd_fuse.blown).toBe(true);
    expect(g.devices.get('vault')!.on).toBe(false);
  });

  it('more resistance means less current', () => {
    expect(rig('bat12', ['res12']).current('cd_motor')).toBeLessThan(rig('bat12', ['res3']).current('cd_motor'));
  });

  it('a spare fuse replaces a melted one', () => {
    const g = rig('bat12', ['coin']);
    const coin = g.state.placed.find((p) => p.item === 'coin')!.id;
    g.pickupPlaced(coin);
    g.placeItem('res3', 'cd', 'r1', 'r2');
    expect(g.replaceFuse('cd_fuse')).toBe(true);
    expect(g.devices.get('vault')!.on).toBe(true);
  });

  it('a weak motor groans and draws the patrolling guard', () => {
    const b = new Bot(L4);
    b.until((x) => x.guard('g1').x > 16 && x.guard('g1').y > 9);
    b.panel('pd', (x) => {
      x.place('bat12', 'cd', 'bp', 'bq');
      x.place('res12', 'cd', 'r1', 'r2');
    });
    expect(b.guard('g1').task?.kind).toBe('noise');
  });

  it('a blown fuse brings the guard, who fixes the panel and takes your parts back out', () => {
    const b = new Bot(L4);
    b.until((x) => x.guard('g1').x > 16 && x.guard('g1').y > 9);
    b.panel('pd', (x) => {
      x.place('bat12', 'cd', 'bp', 'bq');
      x.place('coin', 'cd', 'r1', 'r2');
    });
    expect(b.guard('g1').task?.kind).toBe('fuse');
    b.walk([1, 11]);
    b.waitGuard('g1', 'return', 40);
    expect(b.s.parts.cd_fuse.blown).toBe(false);
    expect(b.s.placed.length).toBe(0);
    expect(b.s.bag).toContain('bat12');
  });

  it('intended solution: 12 V + 3 Ω, slip in while the guard is away', () => {
    const b = new Bot(L4);
    b.until((x) => x.guard('g1').x > 16 && x.guard('g1').y > 9);
    b.panel('pd', (x) => {
      x.place('bat12', 'cd', 'bp', 'bq');
      x.place('res3', 'cd', 'r1', 'r2');
    });
    b.wait(1.2).route([10, 4], [10, 2]).use();
    b.until((x) => x.guard('g1').x < 5 && x.guard('g1').y > 9);
    b.route([10, 6], [20, 8], [21, 8]);
    expect(b.s.status).toBe('won');
  });
});
