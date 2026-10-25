import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { L2 } from '../src/levels/l2-gallery';

/** Sneak into the gallery the intended way: kill only the parallel branch over the door. */
function enterGallery() {
  const b = new Bot(L2);
  b.panel('pc', (x) => x.cut('cc_w2'));
  b.route([11, 3], [11, 4]);
  return b;
}

describe('heist 2 — gallery (parallel vs series)', () => {
  it('parallel: cutting one branch darkens only that lamp', () => {
    const b = new Bot(L2);
    b.panel('pc', (x) => x.cut('cc_w2'));
    expect(b.g.devices.get('c1')!.on).toBe(true);
    expect(b.g.devices.get('c2')!.on).toBe(false);
    expect(b.g.devices.get('c3')!.on).toBe(true);
  });

  it('series: taking out one display bulb kills the whole string', () => {
    const b = enterGallery();
    b.until((x) => x.guard('g2').x > 15 && x.guard('g2').y < 7);
    b.route([10, 7]).use();
    for (const id of ['d1', 'd3', 'd4']) expect(b.g.devices.get(id)!.on).toBe(false);
  });

  it('intended solution: branch cut, bypass the gem in parallel, steal, slip out', () => {
    const b = enterGallery();
    b.until((x) => x.guard('g2').x > 15 && x.guard('g2').y < 7);
    b.route([5, 7]);
    b.panel('pg', (x) => x.place('wire', 'cg', 's1', 's2'));
    b.route([10, 7]).use();
    for (const id of ['d1', 'd3', 'd4']) expect(b.g.devices.get(id)!.on).toBe(true);
    b.route([11, 4]);
    b.until((x) => x.guard('g2').x < 6 && x.guard('g2').y < 10.5 && x.guard('g2').y > 7);
    b.route([18, 11], [23, 11]);
    expect(b.s.status).toBe('won');
  });

  it('walking past the lit gallery door without rewiring gets you seen', () => {
    const b = new Bot(L2);
    b.route([11, 3], [11, 5]);
    expect(b.s.fail?.reason).toBe('caught');
  });

  it('killing the whole corridor (main wire) sends the guard to investigate', () => {
    const b = new Bot(L2);
    b.panel('pc', (x) => x.cut('cc_main'));
    expect(b.s.zoneLit.corridor).toBe(true); // world paused while in panel
    b.wait(0.2);
    expect(b.guard('g1').task?.kind).toBe('zone');
  });

  it('stealing without a bypass: the dark gallery brings the guard, who finds the empty case', () => {
    const b = enterGallery();
    b.until((x) => x.guard('g2').x > 15 && x.guard('g2').y < 7);
    b.route([10, 7]).use().route([11, 4]);
    b.wait(30);
    expect(b.s.fail?.reason).toBe('pedestal');
  });

  it('regression: cutting the string first and stealing while the guard walks to fix it still gets caught', () => {
    const b = enterGallery();
    b.until((x) => x.guard('g2').x > 15 && x.guard('g2').y < 7);
    b.route([5, 7]);
    b.panel('pg', (x) => x.cut('cg_w0'));
    b.route([10, 7]);
    b.until((x) => x.guard('g2').mode === 'toPanel', 30);
    if (b.ok) b.use().route([11, 4]);
    b.wait(40);
    expect(b.s.status).toBe('failed');
  });
});
