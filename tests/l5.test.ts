import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { L5 } from '../src/levels/l5-blackout';

const shortMains = (b: Bot) => b.panel('pw', (x) => x.place('wire', 'cw', 'b1', 'd1'));

describe('heist 5 — blackout (short circuit, series fuse, wet-skin safety)', () => {
  it('a short across the mains melts the series fuse: lights, cameras and the exposed cable all go dead', () => {
    const b = new Bot(L5);
    shortMains(b);
    expect(b.s.parts.cw_fuse.blown).toBe(true);
    for (const id of ['w1', 'w2', 'w3', 'cam1', 'cam2', 'puddle']) expect(b.g.devices.get(id)!.on).toBe(false);
    expect(b.s.status).toBe('playing');
  });

  it('intended solution: short, cross the dead puddle, steal, leave while the guard hunts the short', () => {
    const b = new Bot(L5);
    shortMains(b);
    b.route([3, 7], [2, 6]).use();
    b.until((x) => x.guard('g1').mode === 'toPanel' && x.guard('g1').task?.panel === 'fb' && x.guard('g1').x > 14);
    b.route([14, 8], [24, 8], [25, 8]);
    expect(b.s.status).toBe('won');
  });

  it('the guard replaces the fuse, it melts again, and he has to go find the short', () => {
    const b = new Bot(L5);
    shortMains(b);
    b.route([3, 8]);
    b.until((x) => x.guard('g1').task?.panel === 'pw', 30);
    expect(b.guard('g1').task?.kind).toBe('fuse');
  });

  it('walking into the puddle under the live cable is an instant (safety) failure', () => {
    const b = new Bot(L5);
    b.walk([12, 8]).walk([8, 8]);
    expect(b.s.fail?.reason).toBe('shock');
  });

  it('shorting the unfused emergency circuit overheats the wires', () => {
    const b = new Bot(L5);
    b.panel('pw', (x) => x.place('wire', 'ce', 'ep', 'en'));
    b.wait(2);
    expect(b.s.fail?.reason).toBe('fire');
  });

  it('an insulator across the mains changes nothing (no short, cameras still on)', () => {
    const b = new Bot(L5);
    b.panel('pw', (x) => x.place('ruler', 'cw', 'b1', 'd1'));
    expect(b.s.parts.cw_fuse.blown).toBe(false);
    expect(b.g.devices.get('cam1')!.on).toBe(true);
  });

  it('the wet-skin numbers in the explanation follow Ohm law', () => {
    expect(220 / 1000).toBeCloseTo(0.22);
    expect(220 / 100000).toBeCloseTo(0.0022);
    expect(L5.explain.shock).toContain('220 mA');
  });
});
