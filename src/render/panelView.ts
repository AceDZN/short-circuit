import * as THREE from 'three';
import type { Game } from '../sim/game';
import { ITEMS } from '../sim/items';
import type { CircuitDef, ItemKind, PartDef, PlacedPart } from '../sim/types';
import { Labels, Particles } from './fx';
import { M, emissive, glowSprite } from './props';
import { boardTex, hazardTex, labelTex } from './textures';

const S = 0.1; // metres per board unit

export type PanelPick =
  | { type: 'slot'; circuit: string; a: string; b: string }
  | { type: 'part'; id: string; circuit: string }
  | { type: 'placed'; id: string; circuit: string }
  | { type: 'terminal'; circuit: string; node: string };

interface Flow {
  id: string;
  curve: THREE.Curve<THREE.Vector3>;
  length: number;
  dots: THREE.InstancedMesh;
  phase: number;
  mat: THREE.MeshStandardMaterial;
  color: number;
}

const bp = (c: CircuitDef, n: string, z = 0) => {
  const [x, y] = c.nodes[n];
  return new THREE.Vector3((x - 6) * S, (3.6 - y) * S, z);
};

export class PanelView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.05, 20);
  readonly labels: Labels;
  private game: Game;
  private panelId: string;
  private dyn = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private flows: Flow[] = [];
  private time = 0;
  private dotGeo = new THREE.SphereGeometry(0.0075, 8, 6);
  private doorPivot: THREE.Group;
  private doorOpen = 0;
  selection: PanelPick | null = null;
  pendingTerminal: { circuit: string; node: string } | null = null;
  placingItem: ItemKind | null = null;
  /** Ammeter mode: show the current on every wire too. */
  meter = false;
  hover: PanelPick | null = null;
  readonly fx = new Particles();
  private dragLine: THREE.Line;
  private dragFrom: THREE.Vector3 | null = null;

  constructor(game: Game, panelId: string, labelLayer: HTMLElement) {
    this.game = game;
    this.panelId = panelId;
    this.labels = new Labels(labelLayer);
    const s = this.scene;
    s.background = new THREE.Color(0x090b14);
    s.environmentIntensity = 0.35;
    s.add(new THREE.HemisphereLight(0x8090c0, 0x101018, 1.2));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.6);
    key.position.set(-0.6, 0.8, 1.6);
    s.add(key);
    const rim = new THREE.PointLight(0x38e8ff, 1.5, 3);
    rim.position.set(0.8, 0.5, 0.6);
    s.add(rim);
    // cabinet
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.86, 0.04), new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.7, metalness: 0.4 }));
    board.position.z = -0.025;
    s.add(board);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x55615e, metalness: 0.7, roughness: 0.45 });
    for (const [w, h, x, y] of [
      [1.48, 0.06, 0, 0.46],
      [1.48, 0.06, 0, -0.46],
      [0.06, 0.98, 0.71, 0],
      [0.06, 0.98, -0.71, 0],
    ]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
      f.position.set(x, y, 0.02);
      s.add(f);
    }
    // the open door on the right hinge (panel faces the viewer; RTL readers expect the door on the right)
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(0.74, 0, 0.08);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.94, 0.03), new THREE.MeshStandardMaterial({ map: hazardTex(), color: 0x7a8783, metalness: 0.6, roughness: 0.5 }));
    door.position.x = 0.7;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: labelTex('⚡', { bg: '#f2c230', fg: '#111', w: 128, h: 128 }), transparent: true }));
    sign.position.set(0.7, 0.15, -0.02);
    sign.rotation.y = Math.PI;
    this.doorPivot.add(door, sign);
    s.add(this.doorPivot);
    s.add(this.dyn);
    this.fx.floor = -Infinity;
    s.add(this.fx.points);
    this.dragLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0xffd04a, dashSize: 0.02, gapSize: 0.012 }));
    this.dragLine.visible = false;
    s.add(this.dragLine);
    this.rebuild();
  }

  /** Board-space position of a circuit node (for effects and the drag preview). */
  nodePos(circuitId: string, node: string, z = 0.03) {
    const c = this.game.circuit(circuitId);
    return bp(c, node, z);
  }

  /** Sparks where a part sits on the board. */
  sparkAt(partId: string) {
    const c = this.game.level.circuits.find((cc) => cc.parts.some((p) => p.id === partId)) ?? this.game.circuit(this.game.state.placed.find((p) => p.id === partId)?.circuit ?? '');
    const p = c?.parts.find((pp) => pp.id === partId) ?? this.game.state.placed.find((pp) => pp.id === partId);
    if (!c || !p) return;
    const at = bp(c, p.a, 0.03).lerp(bp(c, p.b, 0.03), 0.5);
    this.fx.sparks(at, 26, 0xffe08a, 0.08);
  }

  /** Rubber-band wire from a terminal to the pointer while dragging. */
  setDrag(from: { circuit: string; node: string } | null, ndcX = 0, ndcY = 0) {
    if (!from) {
      this.dragLine.visible = false;
      this.dragFrom = null;
      return;
    }
    this.dragFrom = this.nodePos(from.circuit, from.node);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const to = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.03), to);
    this.dragLine.geometry.setFromPoints([this.dragFrom, to]);
    this.dragLine.computeLineDistances();
    this.dragLine.visible = true;
  }

  get panel() {
    return this.game.panel(this.panelId);
  }

  private circuits() {
    return this.panel.circuits.map((id) => this.game.circuit(id));
  }

  /** Rebuild every mesh from the current circuit state. */
  rebuild() {
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.pickables = [];
    this.flows = [];
    this.labels.clear();
    const st = this.game.state;
    for (const c of this.circuits()) {
      const editable = c.panel === this.panelId;
      // circuit name tag
      const xs = Object.values(c.nodes).map((n) => n[0]);
      const ys = Object.values(c.nodes).map((n) => n[1]);
      this.labels.set(`cname-${c.id}`, new THREE.Vector3((Math.max(...xs) + Math.min(...xs)) / 2 - 6, 3.6 - Math.max(...ys) - 0.7, 0).multiplyScalar(S), c.name + (c.showPower ? this.powerTag(c) : ''), 'pv-circuit');
      for (const p of c.parts) {
        const ps = st.parts[p.id];
        if (ps.removed) {
          this.addGap(c, p);
          continue;
        }
        this.addPart(c, p, editable);
      }
      // labelled empty sockets
      for (const sl of c.slots ?? []) {
        const a = bp(c, sl.a, 0.004);
        const b = bp(c, sl.b, 0.004);
        const mid = a.clone().lerp(b, 0.5);
        const len = a.distanceTo(b);
        const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
        const occupied = st.placed.some((pl) => pl.circuit === c.id && ((pl.a === sl.a && pl.b === sl.b) || (pl.a === sl.b && pl.b === sl.a)));
        const box = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(vertical ? 0.12 : len * 0.7, vertical ? len * 0.7 : 0.12)),
          new THREE.LineDashedMaterial({ color: occupied ? 0x40ff90 : 0xffd04a, dashSize: 0.015, gapSize: 0.01 }),
        );
        box.computeLineDistances();
        box.position.copy(mid);
        this.dyn.add(box);
        const slotHit = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 0.16 : len * 0.7, vertical ? len * 0.7 : 0.16), new THREE.MeshBasicMaterial({ visible: false }));
        slotHit.position.copy(mid).setZ(0.05);
        slotHit.userData = { pick: { type: 'slot', circuit: c.id, a: sl.a, b: sl.b } satisfies PanelPick };
        this.dyn.add(slotHit);
        if (!occupied) this.pickables.push(slotHit);
        this.labels.set(`slot-${c.id}-${sl.a}`, mid.clone().add(new THREE.Vector3(vertical ? 0.13 : 0, vertical ? 0 : -0.07, 0.02)), sl.label, `pv-slot ${occupied ? 'full' : ''}`);
      }
      // terminals
      const terms = new Set(editable ? this.game.terminalsOf(c.id) : []);
      for (const n of Object.keys(c.nodes)) {
        const isT = terms.has(n);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(isT ? 0.016 : 0.009, isT ? 0.02 : 0.009, isT ? 0.035 : 0.01, 14), isT ? M.brass : M.darkSteel);
        post.rotation.x = Math.PI / 2;
        post.position.copy(bp(c, n, 0.012));
        this.dyn.add(post);
        if (isT) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 24), emissive(0x38e8ff, 0));
          ring.position.copy(bp(c, n, 0.032));
          ring.userData = { pick: { type: 'terminal', circuit: c.id, node: n } satisfies PanelPick, ring: true };
          this.dyn.add(ring);
          const hit = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
          hit.position.copy(bp(c, n, 0.02));
          hit.userData = { pick: { type: 'terminal', circuit: c.id, node: n } satisfies PanelPick };
          this.dyn.add(hit);
          this.pickables.push(hit);
        }
      }
    }
    // placed items arc over the board
    const counts = new Map<string, number>();
    for (const pl of st.placed) {
      const c = this.game.circuit(pl.circuit);
      if (!this.panel.circuits.includes(c.id)) continue;
      const key = [pl.circuit, pl.a, pl.b].sort().join('|');
      const k = counts.get(key) ?? 0;
      counts.set(key, k + 1);
      this.addPlaced(c, pl, k);
    }
  }

  private powerTag(c: CircuitDef) {
    const src = c.parts.find((p) => p.kind === 'battery' || p.kind === 'mains');
    if (!src) return '';
    const I = this.game.current(src.id);
    const P = (src.v ?? 0) * I;
    const fuse = c.parts.find((p) => p.kind === 'fuse');
    const budget = fuse?.rating ? (src.v ?? 0) * fuse.rating : 0;
    return ` · <bdi dir="ltr">P = V·I = ${(src.v ?? 0).toFixed(0)}V × ${I.toFixed(2)}A = ${P.toFixed(1)} W${budget ? ` / ${budget.toFixed(0)} W` : ''}</bdi>`;
  }

  private wireMat(color: number, live: boolean) {
    return new THREE.MeshStandardMaterial({ color: live ? color : 0x3a3a3a, emissive: live ? color : 0x000000, emissiveIntensity: live ? 0.45 : 0, roughness: 0.4, metalness: 0.3 });
  }

  private addFlow(id: string, curve: THREE.Curve<THREE.Vector3>, color: number, mat: THREE.MeshStandardMaterial) {
    const length = curve.getLength();
    const n = Math.max(2, Math.floor(length / 0.05));
    const dots = new THREE.InstancedMesh(this.dotGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    dots.frustumCulled = false;
    this.dyn.add(dots);
    this.flows.push({ id, curve, length, dots, phase: Math.random(), mat, color });
  }

  private addGap(c: CircuitDef, p: PartDef) {
    const a = bp(c, p.a, 0.005);
    const b = bp(c, p.b, 0.005);
    const mid = a.clone().lerp(b, 0.5);
    const tag = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 20), new THREE.MeshBasicMaterial({ color: 0xff6060 }));
    tag.position.copy(mid);
    this.dyn.add(tag);
    this.labels.set(`gap-${p.id}`, mid.clone().add(new THREE.Vector3(0, 0.05, 0)), `<span>${p.label}</span><b>הוצא</b>`, 'pv-tag dead');
  }

  private addPart(c: CircuitDef, p: PartDef, editable: boolean) {
    const st = this.game.state;
    const ps = st.parts[p.id];
    const a = bp(c, p.a, 0.005);
    const b = bp(c, p.b, 0.005);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const mid = a.clone().lerp(b, 0.5);
    const I = this.game.current(p.id);
    const live = I > 0.005;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
    const group = new THREE.Group();
    group.position.copy(mid);
    group.quaternion.copy(q);
    this.dyn.add(group);
    const pick: PanelPick = { type: 'part', id: p.id, circuit: c.id };
    const mat = this.wireMat(c.color, live);
    const isWire = p.kind === 'wire';
    const open = ps.open || (p.kind === 'fuse' && ps.blown);
    // the conductor running along the segment (split around the component body)
    const body = isWire ? 0 : Math.min(0.16, len * 0.5);
    if (isWire && ps.open) {
      for (const sgn of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, len * 0.35, 8), mat);
        half.rotation.z = Math.PI / 2;
        half.position.x = sgn * len * 0.325;
        group.add(half);
        const end = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc8703a, emissive: 0xff4020, emissiveIntensity: 0.6, metalness: 0.9 }));
        end.position.x = sgn * len * 0.15;
        group.add(end);
      }
    } else {
      const segLen = (len - body) / 2;
      for (const sgn of [-1, 1]) {
        if (segLen <= 0.001) continue;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, segLen, 8), mat);
        seg.rotation.z = Math.PI / 2;
        seg.position.x = sgn * (body / 2 + segLen / 2);
        group.add(seg);
      }
    }
    // component body
    const comp = this.componentMesh(p, live, open);
    if (comp) group.add(comp);
    // device card: which thing in the building this load is
    const icon = DEVICE_ICON[p.kind];
    if (icon) {
      const center = new THREE.Vector3(0, -0.05, 0);
      const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
      if (perp.dot(mid.clone().sub(center)) < 0) perp.negate();
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: iconTex(icon), transparent: true, opacity: live ? 1 : 0.35 }));
      card.position.copy(mid).addScaledVector(perp, 0.115).setZ(0.03);
      this.dyn.add(card);
      if (live) {
        const halo = glowSprite(0x38e8ff, 0.22, 0.35);
        halo.position.copy(card.position).setZ(0.025);
        this.dyn.add(halo);
      }
    }
    // pick volume
    const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, len * 0.8), isWire ? 0.045 : 0.09, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { pick };
    group.add(hit);
    this.pickables.push(hit);
    // selection halo
    const sel = this.selection?.type === 'part' && this.selection.id === p.id;
    const hov = this.hover?.type === 'part' && this.hover.id === p.id;
    if (sel || hov) {
      const halo = new THREE.Mesh(new THREE.BoxGeometry(len * 0.85, isWire ? 0.04 : 0.11, 0.005), new THREE.MeshBasicMaterial({ color: sel ? 0xffd04a : 0x8fe8ff, transparent: true, opacity: sel ? 0.35 : 0.18 }));
      halo.position.z = -0.004;
      group.add(halo);
    }
    // current flow
    if (live && !(isWire && ps.open)) {
      const cur = this.game.partResult(p.id).current;
      const from = cur >= 0 ? a : b;
      const to = cur >= 0 ? b : a;
      this.addFlow(p.id, new THREE.LineCurve3(from.clone().setZ(0.016), to.clone().setZ(0.016)), c.color, mat);
    }
    // labels: loads and sources always; wires only when cut or selected
    // generic sensors carry their branch's current; their label would only crowd a dense board
    const quiet = isWire || (p.kind === 'sensor' && p.label === 'חיישן');
    if (!quiet || ps.open || sel || this.meter) {
      const r = this.game.partResult(p.id);
      const amps = Math.abs(r.current);
      const ampTxt = amps < 0.005 ? '0 A' : amps >= 100 ? '>99 A' : `${amps.toFixed(amps < 1 ? 2 : 1)} A`;
      let html = `<span>${p.label}</span>`;
      if (p.kind === 'fuse' && ps.blown) html += '<b class="bad">נשרף!</b>';
      else if (isWire && ps.open) html += '<b class="bad">חתוך</b>';
      else html += `<bdi dir="ltr">${ampTxt}</bdi>`;
      if (!editable && p.kind !== 'battery') html += '';
      const pos = mid.clone().add(new THREE.Vector3(0, isWire ? 0.04 : 0.085, 0.02));
      this.labels.set(`part-${p.id}`, pos, html, `pv-tag ${live ? 'live' : 'dead'} ${sel ? 'sel' : ''}`);
    }
  }

  private componentMesh(p: PartDef, live: boolean, open: boolean): THREE.Object3D | null {
    const g = new THREE.Group();
    const I = this.game.current(p.id);
    switch (p.kind) {
      case 'battery':
      case 'mains': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.085, 0.06), new THREE.MeshStandardMaterial({ color: p.kind === 'mains' ? 0x4a2f2f : 0x1b1d22, metalness: 0.5, roughness: 0.4 }));
        box.position.z = 0.03;
        g.add(box);
        const capP = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), M.copper);
        capP.rotation.z = Math.PI / 2;
        capP.position.set(0.085, 0, 0.03);
        g.add(capP);
        const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), new THREE.MeshBasicMaterial({ map: labelTex(`${p.v}V`, { bg: '#c89b4a', fg: '#111', w: 192, h: 80 }), transparent: true }));
        lbl.position.set(0, 0, 0.061);
        g.add(lbl);
        return g;
      }
      case 'fuse': {
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 14), new THREE.MeshPhysicalMaterial({ color: open ? 0x333333 : 0xdff4ff, transparent: true, opacity: open ? 0.85 : 0.35, roughness: 0.05 }));
        glass.rotation.z = Math.PI / 2;
        glass.position.z = 0.02;
        g.add(glass);
        for (const s of [-1, 1]) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.022, 14), M.steel);
          cap.rotation.z = Math.PI / 2;
          cap.position.set(s * 0.06, 0, 0.02);
          g.add(cap);
        }
        if (!open) {
          const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.1, 4), emissive(0xffb050, live ? 1 + Math.min(4, I) : 0.1));
          fil.rotation.z = Math.PI / 2;
          fil.position.z = 0.02;
          g.add(fil);
        }
        return g;
      }
      case 'lamp': {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc860, emissiveIntensity: live ? 0.5 + Math.min(4, I * 3) : 0.02, transparent: true, opacity: 0.9 }));
        bulb.position.z = 0.04;
        g.add(bulb);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 12), M.brass);
        base.rotation.z = Math.PI / 2;
        base.position.set(-0.045, 0, 0.04);
        g.add(base);
        if (live) {
          const sp = glowSprite(0xffc860, 0.22, Math.min(0.9, 0.3 + I));
          sp.position.z = 0.05;
          g.add(sp);
        }
        return g;
      }
      case 'camera': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.4, roughness: 0.4 }));
        body.position.z = 0.03;
        g.add(body);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), M.black);
        lens.rotation.z = Math.PI / 2;
        lens.position.set(0.055, 0, 0.03);
        g.add(lens);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), emissive(0xff2020, live ? 4 : 0));
        led.position.set(0.03, 0.02, 0.058);
        g.add(led);
        return g;
      }
      case 'laser': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.04), M.darkSteel);
        body.position.z = 0.025;
        g.add(body);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), emissive(0xff2020, live ? 5 : 0));
        beam.rotation.z = Math.PI / 2;
        beam.position.set(0.075, 0, 0.025);
        g.add(beam);
        return g;
      }
      case 'motor': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 18), M.copper);
        body.rotation.z = Math.PI / 2;
        body.position.z = 0.035;
        g.add(body);
        const gear = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), M.steel);
        gear.rotation.y = Math.PI / 2;
        gear.position.set(0.06, 0, 0.035);
        gear.name = live ? 'spin' : '';
        g.add(gear);
        return g;
      }
      case 'sensor': {
        for (const s of [-1, 1]) {
          const blk = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.03), s < 0 ? new THREE.MeshStandardMaterial({ color: 0xeeeeee }) : new THREE.MeshStandardMaterial({ color: 0xd04040 }));
          blk.position.set(s * (open ? 0.045 : 0.02), 0, 0.02);
          g.add(blk);
        }
        return g;
      }
      case 'relay':
      case 'buzzer': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.05), new THREE.MeshStandardMaterial({ color: p.kind === 'relay' ? 0x8a1f24 : 0x4a5a3a, metalness: 0.4, roughness: 0.5 }));
        box.position.z = 0.025;
        g.add(box);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), emissive(live ? 0x40ff70 : 0xff2020, 4));
        led.position.set(0.035, 0.02, 0.052);
        g.add(led);
        return g;
      }
      case 'resistor': {
        g.add(resistorMesh(p.r ?? 1));
        return g;
      }
      case 'cable': {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xc8703a, emissive: live ? 0x60a0ff : 0, emissiveIntensity: live ? 0.8 : 0, metalness: 0.9 }));
        c.rotation.z = Math.PI / 2;
        c.position.z = 0.012;
        g.add(c);
        return g;
      }
      default:
        return null;
    }
  }

  private addPlaced(c: CircuitDef, pl: PlacedPart, k: number) {
    const a = bp(c, pl.a, 0.02);
    const b = bp(c, pl.b, 0.02);
    const mid = a.clone().lerp(b, 0.5);
    const dir = b.clone().sub(a);
    const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    const bow = 0.07 + k * 0.05;
    const ctrl = mid.clone().addScaledVector(perp, bow).setZ(0.11 + k * 0.03);
    const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
    const I = this.game.current(pl.id);
    const live = I > 0.005;
    const spec = ITEMS[pl.item];
    const color = spec.material === 'insulator' ? 0x888888 : 0xff4a4a;
    const mat = new THREE.MeshStandardMaterial({ color: live ? 0xff7050 : 0x7a2a2a, emissive: live ? color : 0, emissiveIntensity: live ? 0.8 : 0, roughness: 0.5 });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.006, 6), mat);
    this.dyn.add(tube);
    // clips at both ends
    for (const p of [a, b]) {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.03), new THREE.MeshStandardMaterial({ color: 0xd03030, metalness: 0.4 }));
      clip.position.copy(p).setZ(0.03);
      this.dyn.add(clip);
    }
    const at = curve.getPoint(0.5);
    const item = itemMesh(pl.item);
    item.position.copy(at);
    this.dyn.add(item);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(at);
    hit.userData = { pick: { type: 'placed', id: pl.id, circuit: c.id } satisfies PanelPick };
    this.dyn.add(hit);
    this.pickables.push(hit);
    if (live) {
      const cur = this.game.partResult(pl.id).current;
      this.addFlow(pl.id, cur >= 0 ? curve : new THREE.QuadraticBezierCurve3(b, ctrl, a), 0xff7050, mat);
    }
    const sel = this.selection?.type === 'placed' && this.selection.id === pl.id;
    const amps = I;
    const ampTxt = amps < 0.005 ? '0 A' : amps >= 100 ? '>99 A' : `${amps.toFixed(amps < 1 ? 2 : 1)} A`;
    this.labels.set(`pl-${pl.id}`, at.clone().add(new THREE.Vector3(0, 0.07, 0)), `<span>${spec.name}</span><bdi dir="ltr">${ampTxt}</bdi>`, `pv-tag placed ${live ? 'live' : 'dead'} ${sel ? 'sel' : ''}`);
  }

  pick(ndcX: number, ndcY: number): PanelPick | null {
    const ray = new THREE.Raycaster();
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = ray.intersectObjects(this.pickables, false);
    // Terminals win over the wires they sit on.
    const t = hits.find((h) => h.object.userData.pick?.type === 'terminal') ?? (this.placingItem ? hits.find((h) => h.object.userData.pick?.type === 'slot') : undefined);
    const h = t ?? hits[0];
    return h ? (h.object.userData.pick as PanelPick) : null;
  }

  update(dt: number, w: number, h: number, reducedMotion: boolean) {
    this.time += dt;
    this.fx.update(dt);
    this.doorOpen = reducedMotion ? 1 : Math.min(1, this.doorOpen + dt * 2.5);
    // The door starts shut over the board (π) and swings open to rest beside it.
    const k = 1 - Math.pow(1 - this.doorOpen, 3);
    this.doorPivot.rotation.y = Math.PI * (1 - k) - 0.55 * k;
    const m4 = new THREE.Matrix4();
    for (const f of this.flows) {
      const I = this.game.current(f.id);
      const speed = Math.min(1.2, 0.08 + Math.sqrt(I) * 0.28);
      if (!reducedMotion) f.phase = (f.phase + (speed * dt) / f.length) % 1;
      const n = f.dots.count;
      for (let i = 0; i < n; i++) {
        const u = (i / n + f.phase) % 1;
        m4.makeTranslation(f.curve.getPointAt(u));
        f.dots.setMatrixAt(i, m4);
      }
      f.dots.instanceMatrix.needsUpdate = true;
    }
    this.dyn.traverse((o) => {
      if (o.name === 'spin' && !reducedMotion) o.rotation.x += dt * 8;
      if (o.userData.ring) {
        const pk = o.userData.pick as PanelPick & { type: 'terminal' };
        const pending = this.pendingTerminal && this.pendingTerminal.circuit === pk.circuit && this.pendingTerminal.node === pk.node;
        const hov = this.hover?.type === 'terminal' && this.hover.circuit === pk.circuit && this.hover.node === pk.node;
        const glow = pending ? 4 : this.placingItem ? 1.2 + Math.sin(this.time * 6) * 0.8 : hov ? 1.5 : 0.25;
        ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
        (o as THREE.Mesh).material = (o as THREE.Mesh).material;
        o.scale.setScalar(pending ? 1.5 : 1);
      }
    });
    const aspect = w / h;
    this.camera.aspect = aspect;
    // fit the 1.5 m wide board, leave room for the side inspector and the bag tray
    const wide = aspect > 1.2;
    const fitW = (wide ? 2.25 : 1.6) / aspect;
    const fitH = wide ? 1.5 : 1.9;
    const vh = Math.max(fitW, fitH);
    const dist = vh / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const cx = wide ? 0.28 : 0;
    const cy = wide ? -0.06 : -0.25;
    this.camera.position.set(cx, cy, dist);
    this.camera.lookAt(cx, cy, 0);
    this.camera.updateProjectionMatrix();
    this.labels.update(this.camera, w, h);
  }

  dispose() {
    this.labels.clear();
  }
}

const DEVICE_ICON: Partial<Record<PartDef['kind'], string>> = {
  lamp: '💡',
  camera: '📷',
  laser: '🔴',
  motor: '🚪',
  relay: '🚨',
  buzzer: '🔔',
  sensor: '🪟',
  cable: '⚠️',
};
const iconCache = new Map<string, THREE.Texture>();
function iconTex(icon: string) {
  let t = iconCache.get(icon);
  if (!t) {
    t = labelTex(icon, { bg: '#0c2230', fg: '#ffffff', w: 128, h: 128, font: '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' });
    iconCache.set(icon, t);
  }
  return t;
}

function resistorMesh(r: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.6 }));
  body.rotation.z = Math.PI / 2;
  body.position.z = 0.025;
  g.add(body);
  const bands = r >= 12 ? [0x8b4513, 0xff0000, 0x000000] : r >= 6 ? [0x0000ff, 0x000000, 0xffd700] : r >= 3 ? [0xff8c00, 0x000000, 0xffd700] : [0x8b4513, 0x000000, 0xffd700];
  bands.forEach((col, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.008, 14), new THREE.MeshStandardMaterial({ color: col }));
    b.rotation.z = Math.PI / 2;
    b.position.set(-0.028 + i * 0.018, 0, 0.025);
    g.add(b);
  });
  return g;
}

export function itemMesh(kind: ItemKind): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'coin': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 24), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: 0.25 }));
      c.rotation.x = Math.PI / 2;
      g.add(c);
      break;
    }
    case 'pencil': {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0xf2c230 }));
      p.rotation.z = Math.PI / 2;
      g.add(p);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.025, 6), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 }));
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 0.082;
      g.add(tip);
      break;
    }
    case 'glove': {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf0d040, roughness: 0.6 }));
      p.scale.set(1, 1.3, 0.5);
      g.add(p);
      break;
    }
    case 'rubberBand': {
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 20), new THREE.MeshStandardMaterial({ color: 0xc04060 })));
      break;
    }
    case 'ruler': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.006), new THREE.MeshStandardMaterial({ color: 0xc89a5a })));
      break;
    }
    case 'sponge': {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8d040, roughness: 1 })));
      break;
    }
    case 'res3':
    case 'res6':
    case 'res12':
      g.add(resistorMesh(kind === 'res3' ? 3 : kind === 'res6' ? 6 : 12));
      break;
    case 'bat6':
    case 'bat12': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0x1b1d22 }));
      g.add(b);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.035), new THREE.MeshBasicMaterial({ map: labelTex(kind === 'bat6' ? '6V' : '12V', { bg: '#c89b4a', fg: '#111', w: 160, h: 70 }), transparent: true }));
      lbl.position.z = 0.021;
      g.add(lbl);
      break;
    }
    default:
      break;
  }
  return g;
}
