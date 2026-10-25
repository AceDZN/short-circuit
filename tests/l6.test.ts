import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { L6 } from '../src/levels/l6-vault';
import { Game } from '../src/sim/game';

function board(cuts: string[], connect = true) {
  const g = new Game(L6);
  g.state.panelOpen = 'pv';
  for (const c of cuts) g.toggleCut(c);
  if (connect) g.placeItem('wire', 'cv', 'm1', 'm2');
  return g;
}

describe('heist 6 — the vault (transfer: parallel bus, power budget, decoy loop, no hints)', () => {
  it('has no hints at all', () => {
    expect(L6.noHints).toBe(true);
    expect(L6.hints.length).toBe(0);
  });

  it('parallel branches: total current is the sum of the branch currents', () => {
    const g = new Game(L6);
    const sum = ['cv_las', 'cv_relay', 'cv_buzz', 'cv_cam'].reduce((a, p) => a + g.current(p), 0);
    expect(g.current('cv_bat')).toBeCloseTo(sum, 4);
  });

  it('connecting the motor with everything on exceeds the 60 W budget: fuse melts, real loop dies, alarm', () => {
    const g = board([]);
    expect(g.state.parts.cv_fuse.blown).toBe(true);
    expect(g.state.fail?.reason).toBe('alarm');
  });

  it('cutting only the obvious loads (lasers + camera) is still over budget', () => {
    expect(board(['cv_wl', 'cv_wc']).state.fail?.reason).toBe('alarm');
  });

  it('"always cut everything" trips the alarm', () => {
    expect(board(['cv_main'], false).state.fail?.reason).toBe('alarm');
    expect(board(['cv_wa'], false).state.fail?.reason).toBe('alarm');
  });

  it('"always short" trips the alarm', () => {
    const g = new Game(L6);
    g.state.panelOpen = 'pv';
    g.placeItem('wire', 'cv', 'm1', 'u5');
    expect(g.state.fail?.reason).toBe('alarm');
  });

  it('a resistor in the motor gap keeps the budget but starves the motor (12 V ÷ 9 Ω ≈ 1.3 A < 3 A)', () => {
    const g = board(['cv_wl'], false);
    g.placeItem('res6', 'cv', 'm1', 'm2');
    expect(g.state.status).toBe('playing');
    expect(g.current('cv_motor')).toBeCloseTo(12 / 9, 1);
    expect(g.devices.get('vaultdoor')!.on).toBe(false);
  });

  it('within budget: cut the lasers and the decoy loop B, keep loop A, connect the motor', () => {
    const g = board(['cv_wl', 'cv_wb']);
    expect(g.state.status).toBe('playing');
    expect(g.current('cv_bat') * 12).toBeLessThan(60);
    expect(g.devices.get('vaultdoor')!.on).toBe(true);
  });

  it('full heist without hints', () => {
    const b = new Bot(L6);
    b.until((x) => x.guard('g1').x > 15);
    b.panel('pv', (x) => {
      x.cut('cv_wl');
      x.cut('cv_wb');
      x.cut('cv_wc');
      x.place('wire', 'cv', 'm1', 'm2');
    });
    b.route([11, 7], [11, 3], [11, 2]).use().route([11, 5]);
    b.until((x) => x.guard('g1').x < 6);
    b.route([12, 9], [22, 10], [23, 10]);
    expect(b.s.status).toBe('won');
  });
});
