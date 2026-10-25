import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { L3 } from '../src/levels/l3-alarm';
import type { ItemKind } from '../src/sim/types';

function atBox() {
  const b = new Bot(L3);
  b.until((x) => x.guard('g1').x > 15);
  return b;
}

function bridgeThenOpen(item: ItemKind, a: string, bNode: string) {
  const b = atBox();
  b.panel('pa', (x) => x.place(item, 'ca', a, bNode));
  b.walk([11, 7]).use();
  return b;
}

describe('heist 3 — alarm loop (series loop, parallel bridge, graphite conducts)', () => {
  it('intended solution: pencil across window 2 sensor, open, kill the laser, steal, leave', () => {
    const b = bridgeThenOpen('pencil', 's2a', 's2b');
    expect(b.ok).toBe(true);
    expect(b.g.devices.get('siren')!.on).toBe(true);
    b.route([11, 5], [6, 4]);
    b.panel('pl', (x) => x.cut('cl_w'));
    b.route([11, 2]).use().route([11, 5]);
    b.until((x) => x.guard('g1').x < 6);
    b.route([11, 7], [22, 10], [23, 10]);
    expect(b.s.status).toBe('won');
  });

  it('opening the window first trips the alarm instantly', () => {
    const b = atBox();
    b.walk([11, 7]).use();
    expect(b.s.fail?.reason).toBe('alarm');
  });

  it('cutting any wire of the loop trips the alarm even mid-rewire ("always cut" fails)', () => {
    for (const w of ['ca_w0', 'ca_w1', 'ca_w2', 'ca_w3']) {
      const b = atBox();
      b.panel('pa', (x) => x.cut(w));
      expect(b.s.fail?.reason).toBe('alarm');
    }
  });

  it('an insulator bridge (rubber band, wooden ruler) does not save the loop', () => {
    expect(bridgeThenOpen('rubberBand', 's2a', 's2b').s.fail?.reason).toBe('alarm');
    expect(bridgeThenOpen('ruler', 's2a', 's2b').s.fail?.reason).toBe('alarm');
  });

  it('bridging the wrong window does not help', () => {
    expect(bridgeThenOpen('pencil', 's1a', 's1b').s.fail?.reason).toBe('alarm');
  });

  it('bridging around all three sensors at once also works (same physics)', () => {
    const b = bridgeThenOpen('pencil', 's1a', 's3b');
    expect(b.ok).toBe(true);
  });

  it('a pencil across the battery side is a short: the fuse melts and the loop dies', () => {
    const b = atBox();
    b.panel('pa', (x) => x.place('pencil', 'ca', 'f', 'n'));
    expect(b.s.parts.ca_fuse.blown).toBe(true);
    expect(b.s.fail?.reason).toBe('alarm');
  });

  it('the loop carries the same current through every sensor (series)', () => {
    const b = new Bot(L3);
    const I = ['ca_s1', 'ca_s2', 'ca_s3', 'ca_relay'].map((p) => b.g.current(p));
    for (const i of I) expect(i).toBeCloseTo(I[0], 6);
  });
});
