import * as THREE from 'three';
import type { Game } from '../sim/game';
import type { DeviceDef, GameEvent, LevelDef } from '../sim/types';
import { createActor, loadModel, type Actor } from './actors';
import { Labels, Particles } from './fx';
import {
  M,
  emissive,
  floorPool,
  glowSprite,
  makeDesk,
  makePlanter,
  makeDoor,
  makeExhibit,
  makeExitSign,
  makeLampFixture,
  makeLaserEmitter,
  makePanel,
  makePedestal,
  makeSecurityCamera,
  makeSiren,
  makeStanchions,
} from './props';
import { marbleFloor, wallTex } from './textures';
import { buildDecor, type WallDecor } from './decor';

const WALL_H = 2.6;
const LOW_H = 0.7;

export interface ViewOptions {
  scanner: number; // 0..1 blend
  reducedMotion: boolean;
}

interface LampView {
  def: Extract<DeviceDef, { kind: 'lamp' }>;
  light: THREE.PointLight;
  bulb: THREE.MeshStandardMaterial;
  pool: THREE.Mesh;
  halo: THREE.Sprite;
  flicker: number;
}

interface WireRoute {
  device: string;
  part: string;
  circuit: string;
  curve: THREE.CurvePath<THREE.Vector3>;
  length: number;
  dots: THREE.InstancedMesh;
  phase: number;
  tube: THREE.Mesh;
  tubeMat: THREE.MeshBasicMaterial;
}

export const tileCenter = (x: number, y: number, h = 0) => new THREE.Vector3(x + 0.5, h, y + 0.5);

export class WorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  readonly level: LevelDef;
  readonly game: Game;
  readonly labels: Labels;
  readonly fx = new Particles();
  yawIndex = 0;
  private yaw = Math.PI / 4;
  private zoom = 1;
  private endZoom = 1;
  private camTarget = new THREE.Vector3();
  private shake = 0;
  private walls!: THREE.InstancedMesh;
  private wallCaps!: THREE.InstancedMesh;
  private wallTiles: [number, number][] = [];
  private decor: WallDecor[] = [];
  private wallMat!: THREE.MeshStandardMaterial;
  private lamps: LampView[] = [];
  private cams = new Map<string, { group: THREE.Group; head: THREE.Object3D; fan: THREE.Mesh; led: THREE.Mesh }>();
  private lasers = new Map<string, { beam: THREE.Group; glow: THREE.Mesh; emitters: THREE.Group[] }>();
  private doors = new Map<string, { group: THREE.Group; slab: THREE.Object3D; led: THREE.Mesh }[]>();
  private windows = new Map<string, { pane: THREE.Mesh; led: THREE.Mesh }>();
  private sirens: { dome: THREE.Mesh; light: THREE.PointLight }[] = [];
  private hazards = new Map<string, { water: THREE.Mesh[]; cable: THREE.Mesh; tip: THREE.Vector3 }>();
  private exhibits = new Map<string, THREE.Group>();
  private panels = new Map<string, THREE.Group>();
  private thief: Actor;
  private thiefLamp: THREE.SpotLight;
  private guards = new Map<string, { actor: Actor; spot: THREE.SpotLight; fanFar: THREE.Mesh; fanNear: THREE.Mesh }>();
  private wires: WireRoute[] = [];
  private scannerGroup = new THREE.Group();
  private alarmT = 0;
  private time = 0;
  private moon!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private disposeList: (() => void)[] = [];

  constructor(game: Game, labelLayer: HTMLElement) {
    this.game = game;
    this.level = game.level;
    this.labels = new Labels(labelLayer);
    const s = this.scene;
    const theme = this.level.theme;
    s.background = new THREE.Color(theme === 'vault' ? 0x05080f : 0x07060f);
    s.fog = new THREE.Fog(s.background as THREE.Color, 30, 70);
    this.hemi = new THREE.HemisphereLight(0x4a4f9a, 0x120c1c, this.baseHemi());
    s.add(this.hemi);
    s.add(new THREE.AmbientLight(0x2c2650, 0.45));
    const moon = new THREE.DirectionalLight(0x9db0ff, this.baseMoon());
    const g = game.grid;
    moon.position.set(g.w * 0.3, 18, -4);
    moon.target.position.set(g.w / 2, 0, g.h / 2);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const ext = Math.max(g.w, g.h) * 0.75;
    Object.assign(moon.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 });
    moon.shadow.bias = -0.0008;
    s.add(moon, moon.target);
    this.moon = moon;
    this.buildTiles();
    this.decor = buildDecor(s, this.level, game.grid, this.wallTiles);
    this.buildDevices();
    this.buildPanels();
    this.buildExhibits();
    this.buildProps();
    this.buildExit();
    this.thief = createActor('thief');
    s.add(this.thief.root);
    this.thiefLamp = new THREE.SpotLight(0xdff4ff, 6, 6, 0.42, 0.6, 1.5);
    this.thief.lampAnchor.add(this.thiefLamp);
    this.thiefLamp.target.position.set(0, -1.2, 2.2);
    this.thief.lampAnchor.add(this.thiefLamp.target);
    for (const gd of this.level.guards) {
      const actor = createActor('guard');
      s.add(actor.root);
      const spot = new THREE.SpotLight(0xffe2a0, 3, 7, 0.55, 1, 1.6);
      actor.lampAnchor.add(spot);
      spot.position.set(0.25, -0.35, 0.1);
      spot.target.position.set(0.25, -1.5, 4);
      actor.lampAnchor.add(spot.target);
      const fanFar = this.makeFan(0xffb300, 0.2);
      const fanNear = this.makeFan(0xffa000, 0.42);
      s.add(fanFar, fanNear);
      this.guards.set(gd.id, { actor, spot, fanFar, fanNear });
    }
    this.buildScanner();
    s.add(this.scannerGroup);
    s.add(this.fx.points);
    this.applyWallHeights();
    const t = game.state.thief;
    this.camTarget.set(t.x, 0, t.y);
    this.updateCamera(0, true);
    // Swap in generated models for static props when available.
    this.upgradeProps();
  }

  private baseHemi() {
    return this.level.theme === 'courtyard' ? 0.75 : 0.55;
  }
  private baseMoon() {
    return this.level.theme === 'courtyard' ? 0.8 : 0.35;
  }

  // ───────────────────────── build

  private buildTiles() {
    const g = this.game.grid;
    const theme = this.level.theme;
    const floorMat = new THREE.MeshStandardMaterial({ map: marbleFloor(theme), roughness: theme === 'courtyard' ? 0.85 : 0.22, metalness: theme === 'courtyard' ? 0 : 0.25 });
    const floorTiles: [number, number][] = [];
    const water: [number, number][] = [];
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const c = g.at(x, y);
        if (c === '#') {
          // Only walls that border open space are drawn; solid rock stays empty.
          let edge = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.at(x + dx, y + dy) !== '#' && g.at(x + dx, y + dy) !== ' ') edge = true;
          if (edge) this.wallTiles.push([x, y]);
        }
        else if (c !== ' ') floorTiles.push([x, y]);
        if (c === '~') water.push([x, y]);
      }
    const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), floorMat, floorTiles.length);
    const m4 = new THREE.Matrix4();
    floorTiles.forEach(([x, y], i) => {
      m4.makeTranslation(x + 0.5, -0.05, y + 0.5);
      floor.setMatrixAt(i, m4);
    });
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.wallMat = new THREE.MeshStandardMaterial({ map: wallTex(theme), roughness: 0.8, metalness: 0.05, transparent: true, opacity: 1 });
    this.walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.wallMat, this.wallTiles.length);
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;
    this.scene.add(this.walls);
    const capMat = new THREE.MeshBasicMaterial({ color: theme === 'vault' ? 0x1a2230 : theme === 'courtyard' ? 0x1d1a22 : 0x17121f, transparent: true });
    this.wallCaps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.06, 1.02), capMat, this.wallTiles.length);
    this.scene.add(this.wallCaps);

    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const c = g.at(x, y);
        if (c === 'b') {
          const d = theme === 'courtyard' ? makePlanter() : makeDesk();
          d.position.copy(tileCenter(x, y));
          this.scene.add(d);
        } else if (c === 'g') {
          const p = makePedestal();
          p.position.copy(tileCenter(x, y));
          makeStanchions(p);
          this.scene.add(p);
        } else if (c === 'W') {
          // low sill + frame; the pane is added with the window device
          const sill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1), this.wallMat);
          sill.position.copy(tileCenter(x, y, 0.45));
          sill.castShadow = true;
          this.scene.add(sill);
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 1), this.wallMat);
          lintel.position.copy(tileCenter(x, y, WALL_H - 0.175));
          lintel.name = 'lintel';
          this.scene.add(lintel);
        }
      }
    for (const [x, y] of water) {
      const w = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 20),
        new THREE.MeshPhysicalMaterial({ color: 0x2a4f8a, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.75, clearcoat: 1 }),
      );
      w.rotation.x = -Math.PI / 2;
      w.position.copy(tileCenter(x, y, 0.012));
      w.scale.set(1, 0.8 + ((x * 7 + y * 3) % 5) * 0.06, 1);
      this.scene.add(w);
    }
  }

  private wallFront(x: number, y: number) {
    // Lower a wall when the floor right behind it (seen from the camera) would be hidden.
    const g = this.game.grid;
    const sx = -Math.sign(Math.sin(this.yawFor(this.yawIndex)));
    const sz = -Math.sign(Math.cos(this.yawFor(this.yawIndex)));
    const open = (c: string) => c !== '#' && c !== ' ';
    return open(g.at(x + sx, y)) || open(g.at(x, y + sz)) || open(g.at(x + sx, y + sz));
  }

  private applyWallHeights() {
    const m4 = new THREE.Matrix4();
    const low = new Set<string>();
    this.wallTiles.forEach(([x, y], i) => {
      const front = this.wallFront(x, y);
      if (front) low.add(`${x},${y}`);
      const h = front ? LOW_H : WALL_H;
      m4.compose(new THREE.Vector3(x + 0.5, h / 2, y + 0.5), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
      this.walls.setMatrixAt(i, m4);
      m4.makeTranslation(x + 0.5, h + 0.03, y + 0.5);
      this.wallCaps.setMatrixAt(i, m4);
    });
    this.walls.instanceMatrix.needsUpdate = true;
    this.wallCaps.instanceMatrix.needsUpdate = true;
    for (const d of this.decor) d.obj.visible = !low.has(d.key);
  }

  private wallNormal(tile: [number, number], toward?: [number, number]) {
    // Direction from a wall tile toward the open floor next to it.
    if (toward) return new THREE.Vector3(toward[0] - tile[0], 0, toward[1] - tile[1]).normalize();
    const g = this.game.grid;
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const c = g.at(tile[0] + dx, tile[1] + dy);
      if (c !== '#' && c !== ' ') return new THREE.Vector3(dx, 0, dy);
    }
    return new THREE.Vector3(0, 0, 1);
  }

  private buildDevices() {
    const s = this.scene;
    const g = this.game.grid;
    for (const d of this.level.devices) {
      if (d.kind === 'lamp') {
        const style = d.style ?? 'ceiling';
        const { group, bulbMat } = makeLampFixture(style);
        const h = style === 'chandelier' ? 3.2 : style === 'display' ? 1.25 : style === 'wall' ? 2.0 : 2.9;
        const pos = tileCenter(d.tile[0], d.tile[1], h);
        if (style === 'wall') {
          const n = this.wallNormal(d.tile);
          pos.addScaledVector(n, 0.5);
          group.rotation.y = Math.atan2(n.x, n.z);
        }
        group.position.copy(pos);
        s.add(group);
        const light = new THREE.PointLight(style === 'display' ? 0xffc070 : 0xffd9a0, 0, d.radius * 1.7, 1.6);
        light.position.copy(pos).setY(Math.min(h, 2.4));
        s.add(light);
        const pool = floorPool(0xffc888, d.radius * 0.95);
        pool.position.set(pos.x, 0.03, pos.z);
        s.add(pool);
        const halo = glowSprite(0xffcf8a, style === 'chandelier' ? 2.4 : 1.1, 0.6);
        halo.position.copy(pos);
        s.add(halo);
        this.lamps.push({ def: d, light, bulb: bulbMat, pool, halo, flicker: 0 });
      } else if (d.kind === 'camera') {
        const group = makeSecurityCamera();
        const n = this.wallNormal(d.tile);
        group.position.copy(tileCenter(d.tile[0], d.tile[1], 2.35)).addScaledVector(n, 0.55);
        s.add(group);
        const fan = this.makeFan(0xff2a3a, 0.16);
        s.add(fan);
        this.cams.set(d.id, { group, head: group.getObjectByName('head')!, fan, led: group.getObjectByName('led') as THREE.Mesh });
      } else if (d.kind === 'laser') {
        const a = tileCenter(d.from[0], d.from[1], 0.62);
        const b = tileCenter(d.to[0], d.to[1], 0.62);
        const emitters: THREE.Group[] = [];
        for (const [p, q] of [
          [a, b],
          [b, a],
        ]) {
          const e = makeLaserEmitter();
          const dir = q.clone().sub(p).normalize();
          e.position.set(p.x - dir.x * 0.42, 0, p.z - dir.z * 0.42);
          s.add(e);
          emitters.push(e);
        }
        const len = a.distanceTo(b) + 0.84;
        const beam = new THREE.Group();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        const mid = a.clone().add(b).multiplyScalar(0.5);
        for (const hgt of [0.3, 0.6, 0.9]) {
          const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), emissive(0xff1a1a, 2.2));
          ray.position.copy(mid).setY(hgt);
          ray.quaternion.copy(q);
          beam.add(ray);
        }
        const glow = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, len, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
        glow.position.copy(mid).setY(0.6);
        glow.quaternion.copy(q);
        s.add(beam, glow);
        this.lasers.set(d.id, { beam, glow, emitters });
      } else if (d.kind === 'door') {
        for (const [x, y] of d.tiles) {
          const group = makeDoor();
          group.position.copy(tileCenter(x, y));
          const alongX = g.at(x - 1, y) === '#' || g.at(x + 1, y) === '#';
          if (!alongX) group.rotation.y = Math.PI / 2;
          s.add(group);
          const list = this.doors.get(d.id) ?? [];
          list.push({ group, slab: group.getObjectByName('slab')!, led: group.getObjectByName('led') as THREE.Mesh });
          this.doors.set(d.id, list);
        }
      } else if (d.kind === 'window') {
        const [x, y] = d.tile;
        const alongX = g.at(x - 1, y) === '#' || g.at(x + 1, y) === '#' || g.at(x - 1, y) === 'W' || g.at(x + 1, y) === 'W';
        const pane = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.92 : 0.06, 1.3, alongX ? 0.06 : 0.92), new THREE.MeshPhysicalMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2 }));
        pane.position.copy(tileCenter(x, y, 0.9 + 0.65));
        s.add(pane);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), emissive(0x40ff70, 3));
        led.position.copy(tileCenter(x, y, 2.15));
        s.add(led);
        this.windows.set(d.id, { pane, led });
      } else if (d.kind === 'alarm') {
        const siren = makeSiren();
        const n = this.wallNormal(d.tile);
        siren.position.copy(tileCenter(d.tile[0], d.tile[1], 2.2)).addScaledVector(n, 0.56);
        siren.rotation.y = Math.atan2(n.x, n.z);
        s.add(siren);
        const light = new THREE.PointLight(0xff2020, 0, 14, 1.5);
        light.position.copy(siren.position);
        s.add(light);
        this.sirens.push({ dome: siren.getObjectByName('dome') as THREE.Mesh, light });
      } else if (d.kind === 'hazard') {
        const [tx, ty] = d.tiles[0];
        const tip = tileCenter(tx, ty, 0.15);
        const top = tileCenter(tx, ty, WALL_H);
        const curve = new THREE.CatmullRomCurve3([top, top.clone().lerp(tip, 0.5).add(new THREE.Vector3(0.2, 0, 0.1)), tip]);
        const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 6), M.black);
        s.add(cable);
        const copper = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.copper);
        copper.position.copy(tip);
        s.add(copper);
        this.hazards.set(d.id, { water: [], cable, tip });
      }
    }
  }

  private buildPanels() {
    for (const p of this.level.panels) {
      const grp = makePanel(p.style === 'fusebox');
      const n = this.wallNormal(p.tile, p.front);
      grp.position.copy(tileCenter(p.tile[0], p.tile[1], 1.35)).addScaledVector(n, 0.58);
      grp.rotation.y = Math.atan2(n.x, n.z);
      this.scene.add(grp);
      this.panels.set(p.id, grp);
    }
  }

  private buildExhibits() {
    for (const e of this.level.exhibits) {
      const grp = makeExhibit(e.model);
      const onCase = this.game.grid.at(e.tile[0], e.tile[1]) === 'g';
      grp.position.copy(tileCenter(e.tile[0], e.tile[1], onCase ? 0.9 : 0));
      this.scene.add(grp);
      if (onCase) {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.1, 0.78), M.glass);
        glass.position.copy(tileCenter(e.tile[0], e.tile[1], 0.9 + 0.55));
        glass.name = 'case';
        this.scene.add(glass);
      }
      const spot = glowSprite(0x8fe8ff, 0.9, 0.35);
      spot.position.set(0, 1.0, 0);
      grp.add(spot);
      this.exhibits.set(e.id, grp);
    }
  }

  private buildProps() {
    for (const p of this.level.props ?? []) {
      const grp = makeExhibit(p.model);
      grp.position.copy(tileCenter(p.tile[0], p.tile[1], this.game.grid.at(p.tile[0], p.tile[1]) === 'g' ? 0.9 : 0));
      this.scene.add(grp);
      if (p.model === 'bulb') {
        loadModel('exhibit-bulb').then((g) => {
          if (!g) return;
          const m = g.scene.clone();
          fitTo(m, 1.0);
          grp.children.forEach((c) => {
            if (!(c as THREE.Sprite).isSprite) c.visible = false;
          });
          grp.add(m);
        });
      }
    }
  }

  private buildExit() {
    const [x, y] = this.level.exit;
    const sign = makeExitSign();
    sign.position.copy(tileCenter(x, y));
    this.scene.add(sign);
  }

  /** Replace procedural props with Tripo models where they exist. */
  private async upgradeProps() {
    if (this.level.theme === 'vault') {
      const vd = await loadModel('vault-door');
      if (vd)
        for (const [, list] of this.doors) {
          if (list.length < 2) continue;
          const m = vd.scene.clone();
          fitTo(m, 2.0);
          // the round vault door spans both tiles; it rides the first slab up and down
          m.position.x += 0.5;
          m.position.y -= 1.25;
          m.position.z += 0.08;
          list[0].slab.add(m);
          for (const d of list) (d.slab as THREE.Mesh).material = new THREE.MeshBasicMaterial({ visible: false });
        }
    }
    const panel = await loadModel('panel');
    if (panel) {
      for (const [, grp] of this.panels) {
        const m = panel.scene.clone();
        fitTo(m, 0.95);
        m.position.z = 0.0;
        grp.children.forEach((c) => {
          if (c.name !== 'led') c.visible = false;
        });
        grp.add(m);
      }
    }
    for (const e of this.level.exhibits) {
      const name = e.model === 'bulb' ? 'exhibit-bulb' : e.model === 'coil' ? 'tesla-coil' : null;
      if (!name) continue;
      const g = await loadModel(name);
      const grp = this.exhibits.get(e.id);
      if (!g || !grp) continue;
      const m = g.scene.clone();
      fitTo(m, 1.0);
      grp.children.forEach((c) => {
        if (!(c as THREE.Sprite).isSprite) c.visible = false;
      });
      grp.add(m);
    }
  }

  private makeFan(color: number, opacity: number) {
    const geo = new THREE.BufferGeometry();
    const n = 28;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 2) * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((n + 2) * 3), 3));
    const idx: number[] = [];
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.n = n;
    return mesh;
  }

  private updateFan(fan: THREE.Mesh, x: number, y: number, heading: number, half: number, range: number, height = 0.05) {
    const g = this.game.grid;
    const n = fan.userData.n as number;
    const pos = fan.geometry.attributes.position as THREE.BufferAttribute;
    const col = fan.geometry.attributes.color as THREE.BufferAttribute;
    pos.setXYZ(0, x, height, y);
    col.setXYZ(0, 1, 1, 1);
    // vertex colour fades the wedge toward its tip
    for (let i = 0; i <= n; i++) {
      const a = heading - half + (2 * half * i) / n;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let r = 0.2;
      while (r < range) {
        const tx = Math.floor(x + dx * r);
        const ty = Math.floor(y + dy * r);
        if ((tx !== Math.floor(x) || ty !== Math.floor(y)) && g.blocksSight(tx, ty)) break;
        r += 0.1;
      }
      pos.setXYZ(i + 1, x + dx * r, height, y + dy * r);
      col.setXYZ(i + 1, 0.55, 0.55, 0.55);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private buildScanner() {
    const dotGeo = new THREE.SphereGeometry(0.075, 8, 6);
    for (const d of this.level.devices) {
      const circuit = this.level.circuits.find((c) => c.parts.some((p) => p.id === d.part));
      if (!circuit) continue;
      const panel = this.level.panels.find((p) => p.id === circuit.panel);
      if (!panel) continue;
      const pn = this.wallNormal(panel.tile, panel.front);
      const p0 = tileCenter(panel.tile[0], panel.tile[1], 1.35).addScaledVector(pn, 0.5);
      let end: THREE.Vector3;
      if (d.kind === 'lamp') end = tileCenter(d.tile[0], d.tile[1], d.style === 'display' ? 1.1 : 2.6);
      else if (d.kind === 'camera' || d.kind === 'alarm') end = tileCenter(d.tile[0], d.tile[1], 2.3).addScaledVector(this.wallNormal(d.tile), 0.5);
      else if (d.kind === 'laser') end = tileCenter(d.from[0], d.from[1], 0.6);
      else if (d.kind === 'door') end = tileCenter(d.tiles[0][0], d.tiles[0][1], 2.3);
      else if (d.kind === 'window') end = tileCenter(d.tile[0], d.tile[1], 2.1);
      else end = tileCenter(d.tiles[0][0], d.tiles[0][1], 0.2);
      const H = 2.45;
      const pts = [p0, p0.clone().setY(H), new THREE.Vector3(end.x, H, p0.z), new THREE.Vector3(end.x, H, end.z), end];
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceTo(pts[i + 1]) > 0.01) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      const length = path.getLength();
      const tubeMat = new THREE.MeshBasicMaterial({ color: circuit.color, transparent: true, opacity: 0.85 });
      const segs: THREE.Mesh[] = [];
      for (const c of path.curves) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(c as THREE.LineCurve3, 1, 0.045, 6), tubeMat);
        segs.push(tube);
        this.scannerGroup.add(tube);
      }
      const n = Math.max(3, Math.floor(length / 0.9));
      const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(circuit.color).lerp(new THREE.Color(0xffffff), 0.55) }), n);
      dots.frustumCulled = false;
      this.scannerGroup.add(dots);
      this.wires.push({ device: d.id, part: d.part, circuit: circuit.id, curve: path, length, dots, phase: 0, tube: segs[0], tubeMat });
    }
    this.scannerGroup.visible = false;
  }

  // ───────────────────────── camera

  private yawFor(i: number) {
    return Math.PI / 4 + (i * Math.PI) / 2;
  }

  rotate(dir: number) {
    this.yawIndex = (this.yawIndex + dir + 4) % 4;
    this.applyWallHeights();
  }

  /** Camera-relative movement → tile-space direction. */
  screenToWorldDir(ix: number, iy: number) {
    // iy: up on screen (−1) = away from camera.
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    return { x: rx * ix + fx * -iy, y: rz * ix + fz * -iy };
  }

  setZoom(z: number) {
    this.zoom = Math.max(0.6, Math.min(1.9, z));
  }

  private updateCamera(dt: number, snap = false) {
    const t = this.game.state.thief;
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.camTarget.lerp(new THREE.Vector3(t.x, 0, t.y), k);
    const want = this.yawFor(this.yawIndex);
    this.yaw += angleLerp(this.yaw, want, snap ? 1 : 1 - Math.exp(-dt * 8));
    const aspect = this.camera.aspect || 1.6;
    // push in on the thief when the heist ends (busted or escaped)
    const ended = this.game.state.status !== 'playing';
    this.endZoom += ((ended ? 0.55 : 1) - this.endZoom) * Math.min(1, dt * 2.5);
    const dist = 23 * this.zoom * this.endZoom * Math.max(1, 1.45 / aspect);
    const el = 0.92;
    const shake = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * Math.cos(el) * dist + shake,
      Math.sin(el) * dist,
      this.camTarget.z + Math.cos(this.yaw) * Math.cos(el) * dist + shake,
    );
    this.camera.lookAt(this.camTarget.x, 0.6, this.camTarget.z);
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  bump(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  // ───────────────────────── per frame

  update(dt: number, opts: ViewOptions, w: number, h: number) {
    this.time += dt;
    const game = this.game;
    const st = game.state;
    const scan = opts.scanner;
    // walls fade to dark glass in scanner mode
    this.wallMat.opacity = 1 - scan * 0.7;
    this.wallMat.color.setRGB(1 - scan * 0.75, 1 - scan * 0.6, 1 - scan * 0.45);
    this.wallMat.depthWrite = scan < 0.5;
    (this.wallCaps.material as THREE.MeshBasicMaterial).opacity = 1 - scan * 0.6;
    this.wallMat.emissive.setRGB(0, scan * 0.05, scan * 0.09);
    this.hemi.intensity = this.baseHemi() * (1 - scan * 0.4);
    this.moon.intensity = this.baseMoon() * (1 - scan * 0.5);

    // lamps
    for (const L of this.lamps) {
      const dv = game.devices.get(L.def.id)!;
      const target = dv.on ? Math.min(1.4, dv.brightness) : 0;
      L.flicker += (target - L.flicker) * Math.min(1, dt * (target > L.flicker ? 6 : 14));
      const f = L.flicker * (opts.reducedMotion ? 1 : 0.97 + Math.sin(this.time * 31 + L.def.tile[0]) * 0.03);
      L.light.intensity = f * L.def.radius * 1.2;
      L.bulb.emissiveIntensity = 0.15 + f * 1.6;
      (L.pool.material as THREE.MeshBasicMaterial).opacity = 0.16 * f;
      L.halo.material.opacity = 0.35 * f;
    }

    // cameras
    for (const [id, c] of this.cams) {
      const on = game.devices.get(id)!.on;
      const def = this.level.devices.find((d) => d.id === id) as Extract<DeviceDef, { kind: 'camera' }>;
      const a = game.cameraAngle(id);
      c.group.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      (c.led.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2 + Math.sin(this.time * 8) * 2 : 0;
      c.fan.visible = on;
      if (on) {
        this.updateFan(c.fan, def.tile[0] + 0.5, def.tile[1] + 0.5, a, (24 * Math.PI) / 180, def.range, 0.07);
        const m = st.camMeter[id] ?? 0;
        (c.fan.material as THREE.MeshBasicMaterial).opacity = 0.14 + m * 0.4;
      }
    }

    // lasers
    for (const [id, l] of this.lasers) {
      const on = game.devices.get(id)!.on;
      l.beam.visible = l.glow.visible = on;
      if (on && !opts.reducedMotion) (l.glow.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(this.time * 20) * 0.02;
      for (const e of l.emitters) e.traverse((o) => o.name === 'led' && (((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 4 : 0.1));
    }

    // doors
    for (const [id, list] of this.doors) {
      const dv = game.devices.get(id)!;
      const open = st.doorOpen[id] ?? 0;
      for (const d of list) {
        d.slab.position.y = 1.25 + open * 2.3;
        d.slab.position.x = dv.strain && !opts.reducedMotion ? Math.sin(this.time * 60) * 0.02 : 0;
        (d.led.material as THREE.MeshStandardMaterial).emissive.setHex(dv.on ? 0x30ff70 : dv.strain ? 0xffb020 : 0xff3030);
      }
    }

    // windows
    for (const [id, wv] of this.windows) {
      const open = !!st.windowsOpen[id];
      wv.pane.position.y += ((open ? 2.3 : 1.55) - wv.pane.position.y) * Math.min(1, dt * 6);
      const part = (this.level.devices.find((d) => d.id === id) as Extract<DeviceDef, { kind: 'window' }>).part;
      const I = game.current(part);
      (wv.led.material as THREE.MeshStandardMaterial).emissive.setHex(I > 0.01 ? 0x40ff70 : 0xff3030);
    }

    // alarm strobe on failure
    const alarm = st.status === 'failed' && st.fail && ['alarm', 'camera', 'laser', 'pedestal'].includes(st.fail.reason);
    if (alarm) this.alarmT += dt;
    for (const sr of this.sirens) {
      const on = alarm && Math.sin(this.alarmT * 14) > 0;
      sr.light.intensity = on ? 40 : 0;
      (sr.dome.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 6 : 0.4;
    }
    if (alarm) {
      const red = Math.sin(this.alarmT * 14) > 0 ? 1 : 0.3;
      this.hemi.color.setRGB(0.3 + red * 0.7, 0.1, 0.15);
    } else this.hemi.color.setHex(0x4a4f9a);

    // live hazards spark
    for (const [id, hz] of this.hazards) {
      const live = game.devices.get(id)!.on;
      if (live && Math.random() < dt * 3 && !opts.reducedMotion) this.fx.sparks(hz.tip, 6, 0x9fdcff);
    }

    // exhibits
    for (const e of this.level.exhibits) {
      const grp = this.exhibits.get(e.id)!;
      const stolen = !!st.stolen[e.id];
      if (stolen) {
        // carried above the thief's backpack
        grp.position.lerp(new THREE.Vector3(st.thief.x, 1.75, st.thief.y), Math.min(1, dt * 10));
        grp.scale.setScalar(0.55);
        grp.rotation.y += dt * 2;
      } else if (!opts.reducedMotion) grp.rotation.y += dt * 0.4;
      if (e.part) {
        const fil = grp.getObjectByName('filament') as THREE.Mesh | undefined;
        const lit = !stolen && game.current(e.part) > 0.2;
        if (fil) (fil.material as THREE.MeshStandardMaterial).emissiveIntensity = lit ? 5 : 0.2;
        const halo = grp.getObjectByName('halo') as THREE.Sprite | undefined;
        if (halo) halo.material.opacity = lit ? 0.7 : 0.05;
      }
    }

    // panel LEDs pulse when the thief can use them
    const tgt = game.interactTarget();
    for (const [id, grp] of this.panels) {
      const led = grp.getObjectByName('led') as THREE.Mesh;
      const near = tgt?.kind === 'panel' && tgt.id === id;
      (led.material as THREE.MeshStandardMaterial).emissiveIntensity = near ? 3 + Math.sin(this.time * 8) * 2 : 1.5;
    }

    // thief
    const t = st.thief;
    this.thief.root.position.set(t.x, 0, t.y);
    this.thief.root.rotation.y = Math.PI / 2 - t.heading;
    let pose: Parameters<Actor['setPose']>[0] = t.moving ? (t.running ? 'run' : 'walk') : 'idle';
    if (st.panelOpen) pose = 'interact';
    if (st.status === 'failed') pose = 'busted';
    if (st.status === 'won') pose = 'cheer';
    this.thief.setPose(pose);
    this.thief.update(game.running || st.status !== 'playing' ? dt : 0, 0);
    this.thiefLamp.intensity = game.isLit(t.x, t.y) ? 2 : 6;

    // guards
    for (const gs of st.guards) {
      const gv = this.guards.get(gs.id)!;
      gv.actor.root.position.set(gs.x, 0, gs.y);
      gv.actor.root.rotation.y = Math.PI / 2 - gs.heading;
      let gp: Parameters<Actor['setPose']>[0] = gs.moving ? 'walk' : gs.mode === 'look' ? 'look' : 'idle';
      if (gs.mode === 'repair') gp = 'interact';
      if (gs.notice > 0.2 || gs.mode === 'busted') gp = 'alert';
      gv.actor.setPose(gp);
      gv.actor.update(game.running || st.status !== 'playing' ? dt : 0, 0);
      const r = game.guardRange(gs);
      this.updateFan(gv.fanFar, gs.x, gs.y, gs.heading, r.fov, r.lit, 0.04);
      this.updateFan(gv.fanNear, gs.x, gs.y, gs.heading, r.fov, r.dark, 0.05);
      (gv.fanNear.material as THREE.MeshBasicMaterial).opacity = 0.42 + gs.notice * 0.35;
      (gv.fanNear.material as THREE.MeshBasicMaterial).color.setHex(gs.notice > 0.2 ? 0xff4020 : 0xffa000);
      // barks
      const bark = gs.bark === 'fix' ? '🔧' : gs.bark === 'zzz' ? 'Zzz' : gs.bark;
      this.labels.set(`bark-${gs.id}`, new THREE.Vector3(gs.x, 2.35, gs.y), `<span>${bark}</span>`, `bark ${gs.bark === '!' || gs.bark === '!!' ? 'alert' : ''}`, !!gs.bark);
    }

    // scanner wires
    this.scannerGroup.visible = scan > 0.02;
    if (this.scannerGroup.visible) {
      const m4 = new THREE.Matrix4();
      for (const w of this.wires) {
        const I = game.current(w.part);
        const live = I > 0.005;
        w.tubeMat.opacity = (live ? 0.9 : 0.25) * scan;
        const speed = Math.min(7, 0.6 + Math.sqrt(I) * 2.2);
        if (live && !opts.reducedMotion) w.phase = (w.phase + (speed * dt) / w.length) % 1;
        const n = w.dots.count;
        for (let i = 0; i < n; i++) {
          const u = (i / n + w.phase) % 1;
          const p = w.curve.getPointAt(u);
          m4.makeScale(live ? 1 : 0.0001, live ? 1 : 0.0001, live ? 1 : 0.0001);
          m4.setPosition(p);
          w.dots.setMatrixAt(i, m4);
        }
        w.dots.instanceMatrix.needsUpdate = true;
        const dev = this.level.devices.find((d) => d.id === w.device)!;
        const tagPos = w.curve.getPointAt(1).clone().add(new THREE.Vector3(0, 0.35, 0));
        void dev;
        this.labels.set(`amp-${w.device}`, tagPos, `<bdi dir="ltr">${I < 0.005 ? '0 A' : I >= 100 ? '>99 A' : I.toFixed(I < 1 ? 2 : 1) + ' A'}</bdi>`, `amp ${live ? '' : 'dead'}`, scan > 0.5);
      }
    } else for (const w of this.wires) this.labels.hide(`amp-${w.device}`);

    this.fx.update(dt);
    this.updateCamera(dt);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.labels.update(this.camera, w, h);
  }

  /** React to sim events with effects. */
  onEvents(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'fuseBlown' && e.x !== undefined) {
        const p = tileCenter(Math.floor(e.x), Math.floor(e.y!), 1.4);
        const panel = this.level.panels.find((pp) => pp.tile[0] === Math.floor(e.x!) && pp.tile[1] === Math.floor(e.y!));
        if (panel) p.addScaledVector(this.wallNormal(panel.tile, panel.front), 0.7);
        this.fx.sparks(p, 60);
        this.fx.smoke(p, 18);
        this.bump(0.25);
      }
      if (e.type === 'steal') {
        this.fx.sparks(new THREE.Vector3(e.x!, 1.2, e.y!), 30, 0x8fe8ff);
        const ex = this.level.exhibits.find((x) => x.id === e.id);
        if (ex) {
          const cs = this.scene.children.find((c) => c.name === 'case' && c.position.x === ex.tile[0] + 0.5 && c.position.z === ex.tile[1] + 0.5);
          if (cs) cs.visible = false;
        }
      }
      if (e.type === 'win') this.fx.confetti(new THREE.Vector3(this.game.state.thief.x, 1.5, this.game.state.thief.y));
      if (e.type === 'fail') this.bump(0.35);
      if (e.type === 'doorOpen') this.bump(0.08);
    }
  }

  dispose() {
    this.labels.clear();
    for (const d of this.disposeList) d();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  /** Raycast the floor plane for click-to-move. */
  pickTile(ndcX: number, ndcY: number): [number, number] | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    return [Math.floor(p.x), Math.floor(p.z)];
  }
}

function angleLerp(a: number, b: number, k: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d * k;
}

function fitTo(obj: THREE.Object3D, height: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(size.x, size.y, size.z, 0.001);
  obj.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
}
