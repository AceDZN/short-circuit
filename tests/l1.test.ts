import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { L1 } from '../src/levels/l1-lobby';

const cutBoth = (b: Bot) => b.panel('p1', (x) => { x.cut('c1_w'); x.cut('c2_w'); });

describe('heist 1 — lobby (open/closed circuit, conductor/insulator)', () => {
  it('intended solution: open both circuits, cross in the dark, close the door gap with a coin', () => {
    const b = new Bot(L1);
    cutBoth(b);
    expect(b.g.devices.get('lamp_lobby')!.on).toBe(false);
    expect(b.g.devices.get('cam1')!.on).toBe(false);
    b.route([15, 8], [18, 6]);
    b.panel('p2', (x) => x.place('coin', 'c3', 'g1', 'g2'));
    expect(b.g.devices.get('door1')!.on).toBe(true);
    b.wait(1).route([20, 4], [21, 4]).use().walk([23, 3]);
    expect(b.s.status).toBe('won');
  });

  it('the lit lobby gets you caught', () => {
    const b = new Bot(L1);
    b.route([15, 8]);
    expect(b.s.fail?.reason).toBe('caught');
  });

  it('darkening the lobby makes the guard come to fix the panel, which relights it', () => {
    const b = new Bot(L1);
    b.panel('p1', (x) => x.cut('c1_w'));
    b.walk([3, 9]); // hide in the vestibule corner
    expect(b.s.guards[0].task?.kind).toBe('zone');
    b.waitGuard('g1', 'return', 40);
    expect(b.g.devices.get('lamp_lobby')!.on).toBe(true);
  });

  it('cutting only the lamp leaves the corridor camera watching', () => {
    const b = new Bot(L1);
    b.panel('p1', (x) => x.cut('c1_w'));
    b.route([15, 8], [18, 6]);
    expect(b.s.fail?.reason).toBe('camera');
  });

  it('an insulator does not close the door gap; a conductor does', () => {
    const b = new Bot(L1);
    cutBoth(b);
    b.route([15, 8], [18, 6]);
    b.panel('p2', (x) => {
      const glove = x.place('glove', 'c3', 'g1', 'g2');
      expect(b.g.devices.get('door1')!.on).toBe(false);
      expect(b.g.current(glove)).toBeLessThan(1e-6);
      b.g.pickupPlaced(glove);
      x.place('coin', 'c3', 'g1', 'g2');
      expect(b.g.devices.get('door1')!.on).toBe(true);
    });
  });

  it('a coin across the battery side is a short: the fuse melts and the door stays shut', () => {
    const b = new Bot(L1);
    cutBoth(b);
    b.route([15, 8], [18, 6]);
    b.panel('p2', (x) => x.place('coin', 'c3', 'g1', 'n'));
    expect(b.s.parts.c3_fuse.blown).toBe(true);
    expect(b.g.devices.get('door1')!.on).toBe(false);
  });

  it('a guard who half-noticed you and lost sight walks over to search where he saw you', () => {
    const b = new Bot(L1);
    b.g.moveTo([7, 7]);
    b.until((x) => x.guard('g1').notice > 0.25, 10);
    expect(b.guard('g1').notice).toBeGreaterThan(0.25);
    b.walk([4, 9]);
    expect(b.s.status).toBe('playing');
    b.wait(0.5);
    expect(b.guard('g1').task?.kind).toBe('noise');
    expect(b.guard('g1').task?.point).toEqual(b.guard('g1').lastSeen);
  });
});
