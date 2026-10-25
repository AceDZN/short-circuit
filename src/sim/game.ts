// Authoritative heist simulation. Deterministic fixed-step, no rendering.
// The circuit solver decides every device; the game only reads currents.

import { solve, type Element, type Solution } from './circuit';
import { Grid, angleDiff, distToSegment } from './grid';
import { ITEMS } from './items';
import type {
  CircuitDef,
  DeviceDef,
  FailReason,
  GameEvent,
  GuardState,
  GuardTask,
  ItemKind,
  LevelDef,
  PanelDef,
  PartDef,
  PartState,
  PlacedPart,
  Tile,
} from './types';

export const STEP = 1 / 60;
const THIEF_R = 0.28;
const WALK = 2.7;
const RUN = 4.3;
const GUARD_SPEED = 1.45;
const GUARD_FOV = (40 * Math.PI) / 180;
const GUARD_RANGE_LIT = 7;
const GUARD_RANGE_DARK = 3.2;
const CAM_FOV = (24 * Math.PI) / 180;
const NOISE_R = 4;
const OVERHEAT_A = 25;
const TOL = 0.98;

export interface ThiefState {
  x: number;
  y: number;
  heading: number;
  moving: boolean;
  running: boolean;
  path: Tile[];
  carrying: string[];
}

export interface Stats {
  spottedPeaks: number;
  fails: number;
  placements: number;
  cuts: number;
  hintsUsed: number;
  retries: number;
}

export interface GameState {
  levelId: string;
  time: number;
  status: 'playing' | 'won' | 'failed';
  fail: { reason: FailReason; device?: string } | null;
  thief: ThiefState;
  parts: Record<string, PartState>;
  placed: PlacedPart[];
  bag: ItemKind[];
  guards: GuardState[];
  stolen: Record<string, boolean>;
  windowsOpen: Record<string, boolean>;
  doorOpen: Record<string, number>;
  zoneLit: Record<string, boolean>;
  camMeter: Record<string, number>;
  overheat: number;
  panelOpen: string | null;
  checkpoint: number;
  nextId: number;
  stats: Stats;
  lastNoise: number;
  peakNotice: number;
}

export interface DeviceView {
  id: string;
  kind: DeviceDef['kind'];
  on: boolean;
  current: number;
  brightness: number;
  /** door: 0 closed .. 1 open; camera: current sweep angle */
  value: number;
  strain?: boolean;
}

export interface LogEntry {
  t: number;
  level: string;
  action: string;
  detail?: string;
  outcome?: string;
}

type Snapshot = string;

export class Game {
  readonly level: LevelDef;
  readonly grid: Grid;
  state!: GameState;
  solution!: Solution;
  devices = new Map<string, DeviceView>();
  events: GameEvent[] = [];
  log: LogEntry[] = [];
  paused = false;
  /** Movement intent in tile space (−1..1), set by input every frame. */
  moveIntent = { x: 0, y: 0, run: false };
  private litTiles = new Map<string, Set<number>>();
  private nominalI = new Map<string, number>();
  private circuitOf = new Map<string, CircuitDef>();
  private partDef = new Map<string, PartDef>();
  private snapStart!: Snapshot;
  private snapCheckpoint: Snapshot | null = null;
  private acc = 0;
  onLog?: (e: LogEntry) => void;

  constructor(level: LevelDef) {
    this.level = level;
    this.grid = new Grid(level.map);
    for (const c of level.circuits)
      for (const p of c.parts) {
        this.circuitOf.set(p.id, c);
        this.partDef.set(p.id, p);
      }
    this.precomputeLight();
    this.reset();
    for (const d of level.devices) {
      const v = this.devices.get(d.id);
      if (v && v.current > 0) this.nominalI.set(d.id, v.current);
    }
    this.refresh(true);
  }

  // ───────────────────────────── setup / snapshots

  reset() {
    const L = this.level;
    const parts: Record<string, PartState> = {};
    for (const c of L.circuits) for (const p of c.parts) parts[p.id] = { open: false, removed: false, blown: false };
    this.state = {
      levelId: L.id,
      time: 0,
      status: 'playing',
      fail: null,
      thief: { x: L.start[0] + 0.5, y: L.start[1] + 0.5, heading: L.startFacing ?? 0, moving: false, running: false, path: [], carrying: [] },
      parts,
      placed: [],
      bag: [...L.bag],
      guards: L.guards.map((g) => ({
        id: g.id,
        x: g.route[0].x + 0.5,
        y: g.route[0].y + 0.5,
        heading: g.route[0].face ?? 0,
        routeIdx: 0,
        wait: g.route[0].wait ?? 0,
        mode: 'patrol',
        timer: 0,
        path: [],
        task: null,
        bark: '',
        barkTimer: 0,
        notice: 0,
        moving: false,
      })),
      stolen: {},
      windowsOpen: {},
      doorOpen: {},
      zoneLit: {},
      camMeter: {},
      overheat: 0,
      panelOpen: null,
      checkpoint: -1,
      nextId: 1,
      stats: { spottedPeaks: 0, fails: 0, placements: 0, cuts: 0, hintsUsed: 0, retries: 0 },
      lastNoise: -10,
      peakNotice: 0,
    };
    this.refresh(true);
    for (const z of L.zones) this.state.zoneLit[z.id] = this.computeZoneLit(z.id);
    for (const d of L.devices) if (d.kind === 'door') this.state.doorOpen[d.id] = this.devices.get(d.id)?.on ? 1 : 0;
    this.syncOpenings();
    this.snapStart = JSON.stringify(this.state);
    this.snapCheckpoint = null;
    this.events = [];
  }

  /** Retry after a failure: back to the last checkpoint (or the level start) with the building as it was then. */
  retry(fromStart = false) {
    const stats = { ...this.state.stats, retries: this.state.stats.retries + 1 };
    const snap = !fromStart && this.snapCheckpoint ? this.snapCheckpoint : this.snapStart;
    this.state = JSON.parse(snap);
    this.state.stats = stats;
    this.state.panelOpen = null;
    this.moveIntent = { x: 0, y: 0, run: false };
    this.refresh(true);
    this.syncOpenings();
    this.addLog('retry', fromStart ? 'start' : 'checkpoint');
  }

  hasCheckpoint() {
    return this.snapCheckpoint !== null;
  }

  // ───────────────────────────── circuits

  private elementsFor(): Element[] {
    const s = this.state;
    const els: Element[] = [];
    for (const c of this.level.circuits) {
      for (const p of c.parts) {
        const ps = s.parts[p.id];
        if (ps.removed) continue;
        const ns = (n: string) => `${c.id}:${n}`;
        const open = ps.open || (p.kind === 'fuse' && ps.blown);
        if (p.kind === 'battery' || p.kind === 'mains') els.push({ id: p.id, kind: 'battery', a: ns(p.a), b: ns(p.b), v: p.v, r: p.r, open });
        else if (p.kind === 'fuse') els.push({ id: p.id, kind: 'fuse', a: ns(p.a), b: ns(p.b), r: p.r, rating: p.rating, open });
        else els.push({ id: p.id, kind: 'resistor', a: ns(p.a), b: ns(p.b), r: p.r, open });
      }
    }
    for (const pl of s.placed) {
      const spec = ITEMS[pl.item];
      const a = `${pl.circuit}:${pl.a}`;
      const b = `${pl.circuit}:${pl.b}`;
      if (spec.element === 'battery') els.push({ id: pl.id, kind: 'battery', a, b, v: spec.v, r: spec.r });
      else if (spec.element === 'fuse') els.push({ id: pl.id, kind: 'fuse', a, b, r: spec.r, rating: spec.rating ?? 5 });
      else els.push({ id: pl.id, kind: 'resistor', a, b, r: spec.r });
    }
    return els;
  }

  current(partId: string): number {
    return Math.abs(this.solution.results.get(partId)?.current ?? 0);
  }

  partResult(partId: string) {
    return this.solution.results.get(partId) ?? { current: 0, drop: 0, power: 0 };
  }

  nodeVoltage(circuitId: string, node: string) {
    return this.solution.nodeVoltage.get(`${circuitId}:${node}`) ?? 0;
  }

  /** Re-solve every circuit and derive all device states. */
  refresh(silent = false) {
    const s = this.state;
    this.solution = solve(this.elementsFor());
    for (const id of this.solution.blown) {
      if (s.parts[id]) {
        s.parts[id].blown = true;
        if (!silent) this.fuseBlown(id);
      }
    }
    const prev = new Map(this.devices);
    this.devices.clear();
    for (const d of this.level.devices) {
      const I = s.parts[d.part]?.removed ? 0 : this.current(d.part);
      const nominal = this.nominalI.get(d.id) ?? ('threshold' in d ? d.threshold * 2.5 : 1);
      const th = 'threshold' in d ? d.threshold : 0;
      let on = I >= th * TOL;
      let value = 0;
      let strain = false;
      if (d.kind === 'alarm') on = I >= d.threshold; // armed loop is healthy
      if (d.kind === 'door') {
        value = s.doorOpen[d.id] ?? 0;
        strain = !on && I > 0.05;
        const was = prev.get(d.id);
        if (!silent && was && was.on !== on) this.emit({ type: on ? 'doorOpen' : 'doorClose', id: d.id });
        if (!silent && strain && !was?.strain) this.emit({ type: 'doorStrain', id: d.id });
      }
      if (d.kind === 'window') on = !!s.windowsOpen[d.id];
      this.devices.set(d.id, { id: d.id, kind: d.kind, on, current: I, brightness: on ? Math.min(1.8, I / nominal) : 0, value, strain });
    }
    // An alarm loop reacts the instant its current stops, even mid-rewire.
    if (!silent && s.status === 'playing')
      for (const d of this.level.devices) if (d.kind === 'alarm' && !this.devices.get(d.id)!.on) this.failWith('alarm', d.id);
  }

  private fuseBlown(partId: string) {
    const panel = this.panelOfPart(partId);
    const p = panel ? this.panel(panel) : null;
    this.emit({ type: 'fuseBlown', id: partId, x: p ? p.tile[0] + 0.5 : undefined, y: p ? p.tile[1] + 0.5 : undefined });
    this.addLog('fuseBlown', partId);
    if (!p) return;
    // The pop is heard by the nearest guard who is not already busy.
    const g = this.nearestFreeGuard(p.front, true);
    if (g) {
      const prevAttempt = g.task?.kind === 'fuse' && g.task.fusePart === partId ? g.task.attempt : -1;
      this.assign(g, { kind: 'fuse', panel: panel!, fusePart: partId, point: p.front, attempt: prevAttempt + 1 }, 0.9);
    }
  }

  panel(id: string): PanelDef {
    return this.level.panels.find((p) => p.id === id)!;
  }

  panelOfPart(partId: string): string | undefined {
    const def = this.partDef.get(partId);
    return def?.panel ?? this.circuitOf.get(partId)?.panel;
  }

  circuit(id: string) {
    return this.level.circuits.find((c) => c.id === id)!;
  }

  // ───────────────────────────── panel actions (world is paused while a panel is open)

  openPanel(id: string) {
    if (this.state.status !== 'playing') return;
    this.state.panelOpen = id;
    this.addLog('openPanel', id);
  }

  closePanel() {
    if (this.state.panelOpen) this.addLog('closePanel', this.state.panelOpen);
    this.state.panelOpen = null;
  }

  canEditPart(partId: string, panelId = this.state.panelOpen): boolean {
    return !!panelId && this.panelOfPart(partId) === panelId;
  }

  /** Snip a wire, or re-join a snipped one. */
  toggleCut(partId: string): boolean {
    const def = this.partDef.get(partId);
    if (!def?.cuttable || !this.canEditPart(partId)) return false;
    const ps = this.state.parts[partId];
    ps.open = !ps.open;
    if (ps.open) this.state.stats.cuts++;
    this.emit({ type: ps.open ? 'snip' : 'join', id: partId });
    this.addLog(ps.open ? 'cut' : 'join', partId);
    this.refresh();
    return true;
  }

  /** Pull a removable component out into the bag. */
  removePart(partId: string): boolean {
    const def = this.partDef.get(partId);
    const ps = this.state.parts[partId];
    if (!def?.removable || !def.itemKind || ps.removed || !this.canEditPart(partId)) return false;
    ps.removed = true;
    this.state.bag.push(def.itemKind);
    this.emit({ type: 'remove', id: partId });
    this.addLog('remove', partId);
    this.refresh();
    return true;
  }

  terminalsOf(circuitId: string): string[] {
    const c = this.circuit(circuitId);
    return c.terminals ?? Object.keys(c.nodes);
  }

  /** Attach a bag item between two terminals of a circuit on the open panel. Batteries: a = −, b = +. */
  placeItem(item: ItemKind, circuitId: string, a: string, b: string): string | null {
    const s = this.state;
    const c = this.circuit(circuitId);
    if (!s.panelOpen || c.panel !== s.panelOpen || a === b) return null;
    const terms = this.terminalsOf(circuitId);
    if (!terms.includes(a) || !terms.includes(b)) return null;
    const bi = s.bag.indexOf(item);
    if (bi < 0) return null;
    if (item === 'fuse') return null; // spare fuses only replace blown ones
    s.bag.splice(bi, 1);
    const id = `placed${s.nextId++}`;
    s.placed.push({ id, item, circuit: circuitId, a, b });
    s.stats.placements++;
    this.emit({ type: 'place', id });
    this.addLog('place', `${item}@${circuitId}:${a}-${b}`);
    this.refresh();
    return id;
  }

  pickupPlaced(placedId: string): boolean {
    const s = this.state;
    const i = s.placed.findIndex((p) => p.id === placedId);
    if (i < 0) return false;
    const pl = s.placed[i];
    if (this.circuit(pl.circuit).panel !== s.panelOpen) return false;
    s.placed.splice(i, 1);
    s.bag.push(pl.item);
    this.emit({ type: 'pickup', id: placedId });
    this.addLog('pickup', `${pl.item}@${pl.circuit}:${pl.a}-${pl.b}`);
    this.refresh();
    return true;
  }

  /** Replace a blown fuse with a spare from the bag. */
  replaceFuse(partId: string): boolean {
    const s = this.state;
    const ps = s.parts[partId];
    if (!ps?.blown || !this.canEditPart(partId)) return false;
    const bi = s.bag.indexOf('fuse');
    if (bi < 0) return false;
    s.bag.splice(bi, 1);
    ps.blown = false;
    this.emit({ type: 'fuseReplaced', id: partId });
    this.addLog('replaceFuse', partId);
    this.refresh();
    return true;
  }

  // ───────────────────────────── world interactions

  interactTarget(): { kind: 'panel' | 'window' | 'exhibit'; id: string; label: string } | null {
    const s = this.state;
    const t = s.thief;
    let best: { kind: 'panel' | 'window' | 'exhibit'; id: string; label: string; d: number } | null = null;
    const consider = (kind: 'panel' | 'window' | 'exhibit', id: string, label: string, x: number, y: number, max: number) => {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= max && (!best || d < best.d)) best = { kind, id, label, d };
    };
    for (const p of this.level.panels) consider('panel', p.id, p.label, p.front[0] + 0.5, p.front[1] + 0.5, 0.95);
    for (const d of this.level.devices)
      if (d.kind === 'window') consider('window', d.id, s.windowsOpen[d.id] ? 'סגירת חלון' : 'פתיחת חלון', d.tile[0] + 0.5, d.tile[1] + 0.5, 1.35);
    for (const e of this.level.exhibits) if (!s.stolen[e.id]) consider('exhibit', e.id, e.name, e.tile[0] + 0.5, e.tile[1] + 0.5, 1.4);
    if (!best) return null;
    const { kind, id, label } = best;
    return { kind, id, label };
  }

  interact(): boolean {
    const s = this.state;
    if (s.status !== 'playing' || s.panelOpen) return false;
    const tgt = this.interactTarget();
    if (!tgt) return false;
    if (tgt.kind === 'panel') this.openPanel(tgt.id);
    else if (tgt.kind === 'window') this.toggleWindow(tgt.id);
    else this.steal(tgt.id);
    return true;
  }

  toggleWindow(id: string) {
    const s = this.state;
    const d = this.level.devices.find((x) => x.id === id && x.kind === 'window');
    if (!d || d.kind !== 'window') return;
    // Don't shut a window on yourself.
    if (s.windowsOpen[id] && Math.floor(s.thief.x) === d.tile[0] && Math.floor(s.thief.y) === d.tile[1]) return;
    s.windowsOpen[id] = !s.windowsOpen[id];
    // Opening the window separates the magnetic sensor contacts: that part of the loop opens.
    s.parts[d.part].open = s.windowsOpen[id];
    this.emit({ type: 'window', id });
    this.addLog(s.windowsOpen[id] ? 'openWindow' : 'closeWindow', id);
    this.refresh();
    this.syncOpenings();
  }

  steal(id: string) {
    const s = this.state;
    const e = this.level.exhibits.find((x) => x.id === id);
    if (!e || s.stolen[id]) return;
    s.stolen[id] = true;
    s.thief.carrying.push(id);
    if (e.part) s.parts[e.part].removed = true;
    this.emit({ type: 'steal', id, x: e.tile[0] + 0.5, y: e.tile[1] + 0.5 });
    this.addLog('steal', id);
    this.refresh();
  }

  /** Click / tap to move. */
  moveTo(tile: Tile) {
    const t = this.state.thief;
    const p = this.grid.path([Math.floor(t.x), Math.floor(t.y)], tile, (x, y) => this.grid.walkable(x, y));
    t.path = p ?? [];
  }

  // ───────────────────────────── time

  advance(seconds: number) {
    this.acc += seconds;
    let n = 0;
    while (this.acc >= STEP - 1e-9 && n < 600) {
      this.acc -= STEP;
      this.step(STEP);
      n++;
    }
  }

  get running() {
    return !this.paused && !this.state.panelOpen && this.state.status === 'playing';
  }

  step(dt: number) {
    if (!this.running) return;
    const s = this.state;
    s.time += dt;
    this.updateThief(dt);
    this.updateDoors(dt);
    this.updateZones();
    for (const g of s.guards) this.updateGuard(g, dt);
    this.updateCameras(dt);
    this.checkHazards(dt);
    this.checkCheckpoints();
    this.checkWin();
    for (const g of s.guards)
      if (g.barkTimer > 0) {
        g.barkTimer -= dt;
        if (g.barkTimer <= 0) g.bark = '';
      }
    const peak = Math.max(0, ...s.guards.map((g) => g.notice));
    if (peak > 0.5 && s.peakNotice <= 0.5) s.stats.spottedPeaks++;
    s.peakNotice = peak;
  }

  private updateThief(dt: number) {
    const t = this.state.thief;
    let ix = this.moveIntent.x;
    let iy = this.moveIntent.y;
    if (ix || iy) t.path = [];
    else if (t.path.length) {
      const [tx, ty] = t.path[0];
      const dx = tx + 0.5 - t.x;
      const dy = ty + 0.5 - t.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.12) t.path.shift();
      else {
        ix = dx / d;
        iy = dy / d;
      }
    }
    const len = Math.hypot(ix, iy);
    t.moving = len > 0.05;
    t.running = t.moving && this.moveIntent.run;
    if (!t.moving) return;
    ix /= Math.max(1, len);
    iy /= Math.max(1, len);
    const sp = (t.running ? RUN : WALK) * dt;
    const nx = t.x + ix * sp;
    if (!this.collides(nx, t.y)) t.x = nx;
    const ny = t.y + iy * sp;
    if (!this.collides(t.x, ny)) t.y = ny;
    t.heading = Math.atan2(iy, ix);
    if (t.running && this.state.time - this.state.lastNoise > 0.5) {
      this.state.lastNoise = this.state.time;
      this.makeNoise(t.x, t.y);
    }
  }

  private collides(x: number, y: number) {
    const r = THIEF_R;
    for (const [cx, cy] of [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r],
    ])
      if (!this.grid.walkable(Math.floor(cx), Math.floor(cy))) return true;
    return false;
  }

  private makeNoise(x: number, y: number) {
    for (const g of this.state.guards) {
      if (Math.hypot(g.x - x, g.y - y) > NOISE_R) continue;
      if (g.mode !== 'patrol' && g.mode !== 'return') continue;
      this.assign(g, { kind: 'noise', point: [Math.floor(x), Math.floor(y)], attempt: 0 }, 0.8);
      this.emit({ type: 'noise', x, y });
    }
  }

  private updateDoors(dt: number) {
    const s = this.state;
    let changed = false;
    for (const d of this.level.devices) {
      if (d.kind !== 'door') continue;
      const dev = this.devices.get(d.id)!;
      const cur = s.doorOpen[d.id] ?? 0;
      let target = dev.on ? 1 : 0;
      // A closing door never crushes the thief: it waits.
      if (!target && d.tiles.some(([x, y]) => Math.floor(s.thief.x) === x && Math.floor(s.thief.y) === y)) target = cur;
      const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 0.9);
      if ((cur >= 0.6) !== (next >= 0.6)) changed = true;
      s.doorOpen[d.id] = next;
      dev.value = next;
    }
    if (changed) this.syncOpenings();
  }

  private syncOpenings() {
    const s = this.state;
    this.grid.openings.clear();
    for (const d of this.level.devices) {
      if (d.kind === 'door' && (s.doorOpen[d.id] ?? 0) >= 0.6) for (const [x, y] of d.tiles) this.grid.openings.add(`${x},${y}`);
      if (d.kind === 'window' && s.windowsOpen[d.id]) this.grid.openings.add(`${d.tile[0]},${d.tile[1]}`);
    }
  }

  // ───────────────────────────── light

  private precomputeLight() {
    for (const d of this.level.devices) {
      if (d.kind !== 'lamp') continue;
      const set = new Set<number>();
      const [lx, ly] = d.tile;
      const r = Math.ceil(d.radius);
      for (let y = ly - r; y <= ly + r; y++)
        for (let x = lx - r; x <= lx + r; x++) {
          if (Math.hypot(x - lx, y - ly) > d.radius) continue;
          if (this.grid.at(x, y) === '#') continue;
          if (!this.grid.los(lx + 0.5, ly + 0.5, x + 0.5, y + 0.5)) continue;
          set.add(y * this.grid.w + x);
        }
      this.litTiles.set(d.id, set);
    }
  }

  isLit(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (const r of this.level.alwaysLit ?? []) if (tx >= r[0] && tx <= r[2] && ty >= r[1] && ty <= r[3]) return true;
    const k = ty * this.grid.w + tx;
    for (const d of this.level.devices) {
      if (d.kind !== 'lamp') continue;
      if (this.devices.get(d.id)?.on && this.litTiles.get(d.id)!.has(k)) return true;
    }
    return false;
  }

  lampTiles(id: string) {
    return this.litTiles.get(id);
  }

  private computeZoneLit(zoneId: string) {
    return this.level.devices.some((d) => d.kind === 'lamp' && d.zone === zoneId && this.devices.get(d.id)?.on);
  }

  private updateZones() {
    const s = this.state;
    for (const z of this.level.zones) {
      const lit = this.computeZoneLit(z.id);
      const was = s.zoneLit[z.id];
      s.zoneLit[z.id] = lit;
      if (was === lit) continue;
      this.emit({ type: lit ? 'zoneLit' : 'zoneDark', id: z.id });
      if (lit) continue;
      this.addLog('zoneDark', z.id);
      // Someone who watches this room notices it went completely dark.
      for (const gid of z.watchers) {
        const g = s.guards.find((x) => x.id === gid);
        if (!g || !this.isFree(g)) continue;
        const lamp = this.level.devices.find((d) => d.kind === 'lamp' && d.zone === z.id);
        const panel = lamp ? this.panelOfPart(lamp.part) : undefined;
        this.assign(g, { kind: 'zone', zone: z.id, panel, point: z.investigate, attempt: 0 }, 1.3);
        break;
      }
    }
  }

  // ───────────────────────────── guards

  private isFree(g: GuardState) {
    return g.mode === 'patrol' || g.mode === 'return' || (g.task?.kind === 'noise' && g.mode !== 'busted');
  }

  private nearestFreeGuard(p: Tile, includeBusyWithSameFuse = false): GuardState | null {
    let best: GuardState | null = null;
    let bd = Infinity;
    for (const g of this.state.guards) {
      const free = this.isFree(g) || (includeBusyWithSameFuse && g.task?.kind === 'fuse');
      if (!free) continue;
      const d = Math.hypot(g.x - p[0], g.y - p[1]);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  private assign(g: GuardState, task: GuardTask, delay: number) {
    g.task = task;
    g.mode = 'suspicious';
    g.timer = delay;
    g.path = [];
    this.bark(g, '?');
  }

  private bark(g: GuardState, b: GuardState['bark'], dur = 1.6) {
    if (g.bark !== b) this.emit({ type: 'bark', id: g.id, text: b });
    g.bark = b;
    g.barkTimer = dur;
  }

  private guardPathTo(g: GuardState, tile: Tile) {
    const p = this.grid.path([Math.floor(g.x), Math.floor(g.y)], tile, (x, y) => this.grid.guardWalkable(x, y));
    g.path = p ?? [];
  }

  /** Move along path; returns true when arrived. */
  private follow(g: GuardState, dt: number, speed: number) {
    if (!g.path.length) {
      g.moving = false;
      return true;
    }
    const [tx, ty] = g.path[0];
    if (!this.grid.guardWalkable(tx, ty)) {
      // A door closed in front of him: give up on this leg.
      g.path = [];
      g.moving = false;
      return true;
    }
    const dx = tx + 0.5 - g.x;
    const dy = ty + 0.5 - g.y;
    const d = Math.hypot(dx, dy);
    const sp = speed * dt;
    g.moving = true;
    const want = Math.atan2(dy, dx);
    g.heading += angleDiff(want, g.heading) * Math.min(1, dt * 8);
    if (d <= sp) {
      g.x = tx + 0.5;
      g.y = ty + 0.5;
      g.path.shift();
      return g.path.length === 0;
    }
    g.x += (dx / d) * sp;
    g.y += (dy / d) * sp;
    return false;
  }

  /** How strongly this guard sees the thief right now (0 = not at all). */
  sightRate(g: GuardState): number {
    const t = this.state.thief;
    const dx = t.x - g.x;
    const dy = t.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.9) return 4; // bumped right into him
    const lit = this.isLit(t.x, t.y);
    const range = lit ? GUARD_RANGE_LIT : GUARD_RANGE_DARK;
    if (d > range) return 0;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), g.heading)) > GUARD_FOV) return 0;
    if (!this.grid.los(g.x, g.y, t.x, t.y)) return 0;
    const near = 1 - d / range;
    return (lit ? 1.5 : 1.1) * (0.55 + near) * (t.running ? 1.4 : 1);
  }

  guardRange(g: GuardState) {
    void g;
    return { lit: GUARD_RANGE_LIT, dark: GUARD_RANGE_DARK, fov: GUARD_FOV };
  }

  private updateGuard(g: GuardState, dt: number) {
    if (g.mode === 'busted' || this.state.status !== 'playing') return;
    const t = this.state.thief;
    const rate = this.sightRate(g);
    if (rate > 0) g.notice = Math.min(1, g.notice + rate * dt);
    else g.notice = Math.max(0, g.notice - dt * 0.4);
    if (g.notice >= 1) {
      g.mode = 'busted';
      this.bark(g, '!!', 99);
      this.failWith('caught', g.id);
      return;
    }
    if (g.notice > 0.2) {
      // "Huh? Who's there?" — he stops and stares.
      g.moving = false;
      const want = Math.atan2(t.y - g.y, t.x - g.x);
      g.heading += angleDiff(want, g.heading) * Math.min(1, dt * 3);
      this.bark(g, '!', 0.6);
      return;
    }
    const L = this.level.guards.find((x) => x.id === g.id)!;
    const speed = L.speed ?? GUARD_SPEED;
    switch (g.mode) {
      case 'patrol': {
        const wp = L.route[g.routeIdx];
        if (g.wait > 0) {
          g.wait -= dt;
          g.moving = false;
          if (wp.face !== undefined) g.heading += angleDiff(wp.face, g.heading) * Math.min(1, dt * 4);
          if (g.wait <= 0 && L.route.length > 1) {
            g.routeIdx = (g.routeIdx + 1) % L.route.length;
            const n = L.route[g.routeIdx];
            this.guardPathTo(g, [n.x, n.y]);
          }
          return;
        }
        if (L.route.length === 1) {
          // Stationary post.
          g.wait = 1e9;
          return;
        }
        if (!g.path.length) this.guardPathTo(g, [wp.x, wp.y]);
        if (this.follow(g, dt, speed)) {
          g.wait = wp.wait ?? 0.01;
        }
        return;
      }
      case 'suspicious': {
        g.moving = false;
        const task = g.task!;
        const want = Math.atan2(task.point[1] + 0.5 - g.y, task.point[0] + 0.5 - g.x);
        g.heading += angleDiff(want, g.heading) * Math.min(1, dt * 3);
        g.timer -= dt;
        if (g.timer <= 0) {
          if (task.kind === 'fuse') {
            g.mode = 'toPanel';
            this.guardPathTo(g, this.panel(task.panel!).front);
          } else {
            g.mode = 'investigate';
            this.guardPathTo(g, task.point);
          }
        }
        return;
      }
      case 'investigate': {
        if (this.follow(g, dt, speed * 1.15)) {
          g.mode = 'look';
          g.timer = 2.4;
        }
        return;
      }
      case 'look': {
        g.moving = false;
        g.timer -= dt;
        g.heading += Math.sin(g.timer * 2.6) * dt * 1.6;
        if (g.timer > 0) return;
        const task = g.task!;
        if (task.kind === 'zone' && task.zone) {
          // An empty pedestal in the room he came to check gives the theft away.
          const missing = this.level.exhibits.find((e) => e.zone === task.zone && this.state.stolen[e.id]);
          if (missing) {
            this.bark(g, '!!', 99);
            this.failWith('pedestal', missing.id);
            return;
          }
        }
        if (task.panel) {
          g.mode = 'toPanel';
          this.guardPathTo(g, this.panel(task.panel).front);
        } else this.goBack(g);
        return;
      }
      case 'toPanel': {
        if (this.follow(g, dt, speed * 1.1)) {
          const p = this.panel(g.task!.panel!);
          g.heading = Math.atan2(p.tile[1] - p.front[1], p.tile[0] - p.front[0]);
          g.mode = 'repair';
          g.timer = 2.6;
          this.bark(g, 'fix', 2.6);
        }
        return;
      }
      case 'repair': {
        g.moving = false;
        g.timer -= dt;
        if (g.timer > 0) return;
        const task = g.task!;
        this.repairPanel(task.panel!);
        if (task.kind === 'fuse' && task.fusePart && this.state.parts[task.fusePart].blown) {
          // Still blown after his fix → the short is still there. He goes to look for it.
          const circuitPanel = this.circuitOf.get(task.fusePart)!.panel;
          if (circuitPanel !== task.panel) {
            g.task = { kind: 'fuse', panel: circuitPanel, fusePart: task.fusePart, point: this.panel(circuitPanel).front, attempt: task.attempt + 1 };
            g.mode = 'toPanel';
            this.bark(g, '?');
            this.guardPathTo(g, this.panel(circuitPanel).front);
            return;
          }
        }
        if (task.kind === 'fuse' && task.fusePart) {
          const fp = this.panelOfPart(task.fusePart)!;
          if (fp !== task.panel && this.state.parts[task.fusePart].blown) {
            g.task = { kind: 'fuse', panel: fp, fusePart: task.fusePart, point: this.panel(fp).front, attempt: task.attempt + 1 };
            g.mode = 'toPanel';
            this.guardPathTo(g, this.panel(fp).front);
            return;
          }
        }
        this.goBack(g);
        return;
      }
      case 'return': {
        if (this.follow(g, dt, speed)) {
          g.mode = 'patrol';
          g.task = null;
          const wp = L.route[g.routeIdx];
          g.wait = wp.wait ?? 0.01;
        }
        return;
      }
    }
  }

  private goBack(g: GuardState) {
    const L = this.level.guards.find((x) => x.id === g.id)!;
    const wp = L.route[g.routeIdx];
    g.mode = 'return';
    this.guardPathTo(g, [wp.x, wp.y]);
  }

  /** A guard fixes a panel: snipped wires re-joined, blown fuses replaced, foreign items pulled out. */
  private repairPanel(panelId: string) {
    const s = this.state;
    let fused = false;
    for (const c of this.level.circuits)
      for (const p of c.parts) {
        if ((p.panel ?? c.panel) !== panelId) continue;
        const ps = s.parts[p.id];
        if (p.cuttable) ps.open = false;
        if (p.kind === 'fuse' && ps.blown) {
          ps.blown = false;
          fused = true;
        }
      }
    const keep: PlacedPart[] = [];
    for (const pl of s.placed) {
      if (this.circuit(pl.circuit).panel === panelId) s.bag.push(pl.item);
      else keep.push(pl);
    }
    const removedItems = s.placed.length - keep.length;
    s.placed = keep;
    this.emit({ type: 'repair', id: panelId, text: fused ? 'fuse' : removedItems ? 'items' : 'wires' });
    this.addLog('guardRepair', panelId);
    this.refresh();
  }

  // ───────────────────────────── cameras, lasers, hazards

  cameraAngle(id: string): number {
    const d = this.level.devices.find((x) => x.id === id);
    if (!d || d.kind !== 'camera') return 0;
    return d.facing + d.sweep * Math.sin((this.state.time * Math.PI * 2) / d.period);
  }

  cameraSees(id: string): boolean {
    const d = this.level.devices.find((x) => x.id === id);
    if (!d || d.kind !== 'camera' || !this.devices.get(id)?.on) return false;
    const t = this.state.thief;
    const cx = d.tile[0] + 0.5;
    const cy = d.tile[1] + 0.5;
    const dist = Math.hypot(t.x - cx, t.y - cy);
    if (dist > d.range) return false;
    if (Math.abs(angleDiff(Math.atan2(t.y - cy, t.x - cx), this.cameraAngle(id))) > CAM_FOV) return false;
    return this.grid.los(cx, cy, t.x, t.y);
  }

  private updateCameras(dt: number) {
    const s = this.state;
    for (const d of this.level.devices) {
      if (d.kind !== 'camera') continue;
      const m = s.camMeter[d.id] ?? 0;
      s.camMeter[d.id] = this.cameraSees(d.id) ? m + dt / 0.5 : Math.max(0, m - dt);
      if (s.camMeter[d.id] >= 1) return this.failWith('camera', d.id);
    }
  }

  private checkHazards(dt: number) {
    const s = this.state;
    const t = s.thief;
    for (const d of this.level.devices) {
      if (d.kind === 'laser' && this.devices.get(d.id)?.on) {
        const dd = distToSegment(t.x, t.y, d.from[0] + 0.5, d.from[1] + 0.5, d.to[0] + 0.5, d.to[1] + 0.5);
        if (dd < 0.22) return this.failWith('laser', d.id);
      }
      if (d.kind === 'alarm' && !this.devices.get(d.id)?.on) return this.failWith('alarm', d.id);
      if (d.kind === 'hazard' && this.devices.get(d.id)?.on) {
        const tx = Math.floor(t.x);
        const ty = Math.floor(t.y);
        if (d.tiles.some(([x, y]) => x === tx && y === ty)) return this.failWith('shock', d.id);
      }
    }
    // A short with no fuse to stop it: the wires overheat.
    let hot = false;
    for (const [id, r] of this.solution.results) {
      const def = this.partDef.get(id);
      if (def?.kind === 'fuse') continue;
      if (Math.abs(r.current) > OVERHEAT_A) hot = true;
    }
    s.overheat = hot ? s.overheat + dt : 0;
    if (s.overheat > 1.2) this.failWith('fire');
  }

  private checkCheckpoints() {
    const s = this.state;
    const cps = this.level.checkpoints ?? [];
    for (let i = s.checkpoint + 1; i < cps.length; i++) {
      const r = cps[i].rect;
      const tx = Math.floor(s.thief.x);
      const ty = Math.floor(s.thief.y);
      if (tx >= r[0] && tx <= r[2] && ty >= r[1] && ty <= r[3]) {
        s.checkpoint = i;
        this.snapCheckpoint = JSON.stringify({ ...s, thief: { ...s.thief, path: [] } });
        this.emit({ type: 'checkpoint', id: String(i) });
      }
    }
  }

  private checkWin() {
    const s = this.state;
    const [ex, ey] = this.level.exit;
    if (Math.floor(s.thief.x) !== ex || Math.floor(s.thief.y) !== ey) return;
    const need = this.level.exhibits.filter((e) => e.required !== false);
    if (need.every((e) => s.stolen[e.id])) {
      s.status = 'won';
      this.emit({ type: 'win' });
      this.addLog('win', `${s.time.toFixed(1)}s`, 'win');
    }
  }

  failWith(reason: FailReason, device?: string) {
    const s = this.state;
    if (s.status !== 'playing') return;
    s.status = 'failed';
    s.fail = { reason, device };
    s.stats.fails++;
    this.emit({ type: 'fail', id: reason, text: device });
    this.addLog('fail', `${reason}${device ? ':' + device : ''}`, 'fail');
  }

  objectiveDone() {
    return this.level.exhibits.filter((e) => e.required !== false).every((e) => this.state.stolen[e.id]);
  }

  // ───────────────────────────── events & logs

  emit(e: GameEvent) {
    this.events.push(e);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  addLog(action: string, detail?: string, outcome?: string) {
    const e: LogEntry = { t: Math.round(this.state.time * 10) / 10, level: this.level.id, action, detail, outcome };
    this.log.push(e);
    this.onLog?.(e);
  }

  // ───────────────────────────── text view for tests & automation

  toText() {
    const s = this.state;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      level: this.level.id,
      title: this.level.title,
      status: s.status,
      fail: s.fail,
      time: r2(s.time),
      paused: this.paused,
      panelOpen: s.panelOpen,
      objective: this.objectiveDone() ? 'reach exit' : `steal ${this.level.exhibits.filter((e) => e.required !== false && !s.stolen[e.id]).map((e) => e.id).join(',')}`,
      thief: { x: r2(s.thief.x), y: r2(s.thief.y), lit: this.isLit(s.thief.x, s.thief.y), carrying: s.thief.carrying },
      interact: this.interactTarget(),
      bag: s.bag,
      guards: s.guards.map((g) => ({ id: g.id, x: r2(g.x), y: r2(g.y), mode: g.mode, notice: r2(g.notice), task: g.task?.kind ?? null })),
      devices: [...this.devices.values()].map((d) => ({ id: d.id, kind: d.kind, on: d.on, I: r2(d.current), ...(d.kind === 'door' ? { open: r2(d.value) } : {}) })),
      zones: s.zoneLit,
      parts: Object.fromEntries(
        Object.entries(s.parts)
          .filter(([, p]) => p.open || p.blown || p.removed)
          .map(([k, p]) => [k, p.blown ? 'blown' : p.removed ? 'removed' : 'cut']),
      ),
      placed: s.placed.map((p) => `${p.item}@${p.circuit}:${p.a}-${p.b} I=${r2(this.current(p.id))}`),
      stats: s.stats,
    };
  }
}

export function partLabelCurrent(game: Game, part: PartDef) {
  const r = game.partResult(part.id);
  return { I: Math.abs(r.current), V: Math.abs(r.drop), P: r.power };
}
