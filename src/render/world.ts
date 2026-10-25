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
  makeChair,
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
  /** Title-screen attract mode: slow orbit around the level. */
  attract?: boolean;
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
  segs: THREE.Mesh[];
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
  private attract = false;
  overview = false;
  private routes = new THREE.Group();
  private reduced = false;
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
  private waveRing!: THREE.Mesh;
  private noiseRings: { mesh: THREE.Mesh; t: number }[] = [];
  private noiseTimer = 0;
  private intro: { pts: { pos: THREE.Vector3; hold: number; caption: string }[]; i: number; t: number } | null = null;
  private waveT = -1;
  private prevScan = 0;
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
      if (gd.route.length === 1) {
        // post guards get a chair; they sit until something happens
        const chair = makeChair();
        const face = gd.route[0].face ?? 0;
        chair.position.copy(tileCenter(gd.route[0].x, gd.route[0].y)).add(new THREE.Vector3(-Math.cos(face) * 0.12, 0, -Math.sin(face) * 0.12));
        chair.rotation.y = Math.PI / 2 - face;
        s.add(chair);
      }
    }
    this.buildScanner();
    s.add(this.scannerGroup);
    this.buildRoutes();
    s.add(this.routes);
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
          const d = theme === 'courtyard' ? makePlanter() : makeDesk(x, y);
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

  /** Shortest 4-connected route through wall tiles (wires live inside the walls). */
  private wallRoute(from: [number, number], to: [number, number]): [number, number][] {
    const g = this.game.grid;
    const inWall = (x: number, y: number) => {
      const c = g.at(x, y);
      return c === '#' || c === 'W' || c === 'D';
    };
    const key = (x: number, y: number) => y * g.w + x;
    const prev = new Map<number, number>();
    const q: [number, number][] = [from];
    prev.set(key(from[0], from[1]), -1);
    while (q.length) {
      const [x, y] = q.shift()!;
      if (x === to[0] && y === to[1]) break;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || !inWall(nx, ny) || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), key(x, y));
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(to[0], to[1]))) return [from, to];
    const out: [number, number][] = [];
    let k = key(to[0], to[1]);
    while (k !== -1) {
      out.push([k % g.w, Math.floor(k / g.w)]);
      k = prev.get(k)!;
    }
    return out.reverse();
  }

  /** The wall tile closest to a floor tile (where a ceiling lamp's feed leaves the wall). */
  private nearestWall(t: [number, number]): [number, number] {
    const g = this.game.grid;
    let best: [number, number] = t;
    let bd = Infinity;
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        if (g.at(x, y) !== '#') continue;
        const d = Math.hypot(x - t[0], y - t[1]);
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    return best;
  }

  private buildScanner() {
    const dotGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const circuitIdx = new Map(this.level.circuits.map((c, i) => [c.id, i]));
    for (const d of this.level.devices) {
      const circuit = this.level.circuits.find((c) => c.parts.some((p) => p.id === d.part));
      if (!circuit) continue;
      const panel = this.level.panels.find((p) => p.id === circuit.panel);
      if (!panel) continue;
      // conduit height inside the wall, staggered per circuit so parallel feeds don't overlap
      const H = 0.32 + (circuitIdx.get(circuit.id)! % 4) * 0.13;
      const pn = this.wallNormal(panel.tile, panel.front);
      const p0 = tileCenter(panel.tile[0], panel.tile[1], 1.35).addScaledVector(pn, 0.45);
      let endTile: [number, number];
      let end: THREE.Vector3;
      let viaCeiling = false;
      if (d.kind === 'lamp') {
        const wallLamp = this.game.grid.at(d.tile[0], d.tile[1]) === '#';
        endTile = wallLamp ? d.tile : this.nearestWall(d.tile);
        end = tileCenter(d.tile[0], d.tile[1], d.style === 'display' ? 1.1 : d.style === 'wall' ? 2.0 : 2.6);
        viaCeiling = !wallLamp;
      } else if (d.kind === 'camera' || d.kind === 'alarm') {
        endTile = d.tile;
        end = tileCenter(d.tile[0], d.tile[1], 2.3).addScaledVector(this.wallNormal(d.tile), 0.5);
      } else if (d.kind === 'laser') {
        endTile = d.from;
        end = tileCenter(d.from[0], d.from[1], 0.6);
      } else if (d.kind === 'door') {
        endTile = d.tiles[0];
        end = tileCenter(d.tiles[0][0], d.tiles[0][1], 2.3);
      } else if (d.kind === 'window') {
        endTile = d.tile;
        end = tileCenter(d.tile[0], d.tile[1], 2.1);
      } else {
        endTile = this.nearestWall(d.tiles[0]);
        end = tileCenter(d.tiles[0][0], d.tiles[0][1], 0.15);
        viaCeiling = false;
      }
      const route = this.wallRoute(panel.tile, endTile);
      const pts: THREE.Vector3[] = [p0, tileCenter(panel.tile[0], panel.tile[1], H)];
      for (const [x, y] of route.slice(1)) pts.push(tileCenter(x, y, H));
      const last = pts[pts.length - 1];
      if (viaCeiling) {
        pts.push(last.clone().setY(2.55));
        pts.push(end.clone().setY(2.55));
      } else pts.push(last.clone().setY(end.y));
      pts.push(end);
      // drop collinear points
      const simple: THREE.Vector3[] = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = simple[simple.length - 1];
        const b = pts[i];
        const c = pts[i + 1];
        const ab = b.clone().sub(a).normalize();
        const bc = c.clone().sub(b).normalize();
        if (ab.dot(bc) < 0.999) simple.push(b);
      }
      simple.push(pts[pts.length - 1]);
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < simple.length - 1; i++) if (simple[i].distanceTo(simple[i + 1]) > 0.01) path.add(new THREE.LineCurve3(simple[i], simple[i + 1]));
      const length = path.getLength();
      const tubeMat = new THREE.MeshBasicMaterial({ color: circuit.color, transparent: true, opacity: 0.85 });
      const segs: THREE.Mesh[] = [];
      for (const c of path.curves) {
        const lc = c as THREE.LineCurve3;
        const tube = new THREE.Mesh(new THREE.TubeGeometry(lc, 1, 0.035, 6), tubeMat);
        tube.userData.a = lc.v1.clone();
        tube.userData.b = lc.v2.clone();
        segs.push(tube);
        this.scannerGroup.add(tube);
      }
      const n = Math.max(3, Math.floor(length / 0.7));
      const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(circuit.color).lerp(new THREE.Color(0xffffff), 0.6) }), n);
      dots.frustumCulled = false;
      this.scannerGroup.add(dots);
      this.wires.push({ device: d.id, part: d.part, circuit: circuit.id, curve: path, length, dots, phase: 0, tube: segs[0], tubeMat, segs });
    }
    this.scannerGroup.visible = false;
    // the X-ray wave ring that sweeps out from the thief when the scanner opens
    this.waveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.waveRing.rotation.x = -Math.PI / 2;
    this.waveRing.position.y = 0.08;
    this.scene.add(this.waveRing);
  }

  // ───────────────────────── camera

  private yawFor(i: number) {
    return Math.PI / 4 + (i * Math.PI) / 2;
  }

  /** Dotted patrol routes, shown in the overview map. */
  private buildRoutes() {
    for (const gd of this.level.guards) {
      if (gd.route.length < 2) {
        const post = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.9, depthWrite: false }));
        post.rotation.x = -Math.PI / 2;
        post.position.copy(tileCenter(gd.route[0].x, gd.route[0].y, 0.09));
        this.routes.add(post);
        continue;
      }
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < gd.route.length; i++) {
        const a = gd.route[i];
        const b = gd.route[(i + 1) % gd.route.length];
        const path = this.game.grid.path([a.x, a.y], [b.x, b.y], (x, y) => this.game.grid.guardWalkable(x, y)) ?? [];
        pts.push(tileCenter(a.x, a.y, 0.09), ...path.map(([x, y]) => tileCenter(x, y, 0.09)));
      }
      pts.push(pts[0].clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffb300, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.9 }));
      line.computeLineDistances();
      this.routes.add(line);
    }
    this.routes.visible = false;
  }

  /** Opening flyover: show the exhibit, then the exit, then come back to the thief. */
  startIntro() {
    const pts: { pos: THREE.Vector3; hold: number; caption: string }[] = [];
    for (const e of this.level.exhibits) pts.push({ pos: tileCenter(e.tile[0], e.tile[1]), hold: 1.7, caption: `המטרה: ${e.name}` });
    pts.push({ pos: tileCenter(this.level.exit[0], this.level.exit[1]), hold: 1.3, caption: 'היציאה' });
    const t = this.game.state.thief;
    pts.push({ pos: new THREE.Vector3(t.x, 0, t.y), hold: 0.6, caption: '' });
    this.intro = { pts, i: 0, t: 0 };
  }

  get introActive() {
    return !!this.intro;
  }

  skipIntro() {
    this.intro = null;
    this.labels.hide('intro-cap');
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
    let want3 = new THREE.Vector3(t.x, 0, t.y);
    let rate = 5;
    if (this.attract || this.overview) {
      want3 = new THREE.Vector3(this.game.grid.w / 2, 0, this.game.grid.h / 2);
      rate = this.overview ? 6 : 2;
    } else if (this.intro) {
      const pt = this.intro.pts[this.intro.i];
      want3 = pt.pos;
      rate = 3.2;
      this.intro.t += dt;
      if (pt.caption) this.labels.set('intro-cap', pt.pos.clone().setY(2.6), `<span>${pt.caption}</span>`, 'intro-cap', this.intro.t > 0.35);
      else this.labels.hide('intro-cap');
      if (this.intro.t > pt.hold + 0.6) {
        this.intro.i++;
        this.intro.t = 0;
        if (this.intro.i >= this.intro.pts.length) this.skipIntro();
      }
    } else {
      // lead the camera a little in the direction the thief is moving
      if (t.moving) want3.add(new THREE.Vector3(Math.cos(t.heading), 0, Math.sin(t.heading)).multiplyScalar(1.2));
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    this.camTarget.lerp(want3, k);
    const want = this.yawFor(this.yawIndex);
    if (!this.attract) this.yaw += angleLerp(this.yaw, want, snap ? 1 : 1 - Math.exp(-dt * 8));
    const aspect = this.camera.aspect || 1.6;
    // push in on the thief when the heist ends (busted or escaped)
    const ended = this.game.state.status !== 'playing';
    this.endZoom += ((ended ? 0.55 : this.overview ? Math.max(this.game.grid.w, this.game.grid.h) / 13 : this.attract ? 1.45 : this.intro ? 1.25 : 1) - this.endZoom) * Math.min(1, dt * (this.overview ? 6 : 2.5));
    const dist = 23 * this.zoom * this.endZoom * Math.min(1.6, Math.max(1, 1.2 / aspect));
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
    if (this.reduced) return;
    this.shake = Math.max(this.shake, amount);
  }

  // ───────────────────────── per frame

  update(dt: number, opts: ViewOptions, w: number, h: number) {
    this.time += dt;
    this.attract = !!opts.attract;
    this.reduced = opts.reducedMotion;
    if (this.attract && !opts.reducedMotion) this.yaw += dt * 0.07;
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
        // arc from the pedestal into the backpack, then ride on the thief's back
        const k = (grp.userData.fly = Math.min(1, (grp.userData.fly ?? 0) + dt * 1.6));
        const back = new THREE.Vector3(st.thief.x - Math.cos(st.thief.heading) * 0.32, 1.25, st.thief.y - Math.sin(st.thief.heading) * 0.32);
        if (k < 1) {
          const from = (grp.userData.from ??= grp.position.clone()) as THREE.Vector3;
          grp.position.lerpVectors(from, back, k).setY(THREE.MathUtils.lerp(from.y, back.y, k) + Math.sin(k * Math.PI) * 1.6);
          grp.scale.setScalar(1 - k * 0.65);
          grp.rotation.y += dt * 9;
        } else {
          grp.position.copy(back);
          grp.scale.setScalar(0.35);
          grp.rotation.y = Math.PI / 2 - st.thief.heading;
        }
      } else if (!opts.reducedMotion) {
        grp.rotation.y += dt * 0.4;
        grp.traverse((o) => o.name === 'spin' && (o.rotation.x += dt * 2));
      }
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
      const post = this.level.guards.find((g) => g.id === gs.id)!.route.length === 1;
      if (post && gs.mode === 'patrol' && !gs.moving) gp = 'sit';
      if (gs.notice > 0.2 || gs.mode === 'busted') gp = 'alert';
      gv.actor.setPose(gp);
      gv.actor.update(game.running || st.status !== 'playing' ? dt : 0, 0);
      const r = game.guardRange(gs);
      this.updateFan(gv.fanFar, gs.x, gs.y, gs.heading, r.fov, r.lit, 0.04);
      this.updateFan(gv.fanNear, gs.x, gs.y, gs.heading, r.fov, r.dark, 0.05);
      (gv.fanNear.material as THREE.MeshBasicMaterial).opacity = 0.42 + gs.notice * 0.35;
      (gv.fanNear.material as THREE.MeshBasicMaterial).color.setHex(gs.notice > 0.2 ? 0xff4020 : 0xffa000);
      // speech bubble
      this.labels.set(`say-${gs.id}`, new THREE.Vector3(gs.x, 3.05, gs.y), `<span>${gs.say ?? ''}</span>`, 'say', !!gs.say && st.status === 'playing' && !this.intro);
      // barks
      const bark = gs.bark === 'fix' ? '🔧' : gs.bark === 'zzz' ? 'Zzz' : gs.bark;
      const noticing = gs.notice > 0.03 && gs.mode !== 'busted';
      if (noticing)
        this.labels.set(`bark-${gs.id}`, new THREE.Vector3(gs.x, 2.45, gs.y), `<div class="notice ${gs.notice > 0.5 ? 'hot' : ''}" style="--n:${gs.notice.toFixed(3)}"><span>${gs.notice > 0.5 ? '!' : '?'}</span></div>`, 'bark meter', true);
      else this.labels.set(`bark-${gs.id}`, new THREE.Vector3(gs.x, 2.45, gs.y), `<span>${bark}</span>`, `bark ${gs.bark === '!' || gs.bark === '!!' ? 'alert' : ''} ${gs.bark === 'fix' ? 'fix' : ''}`, !!gs.bark);
    }

    this.routes.visible = this.overview;
    // objective markers, pinned to the screen edge when off-screen
    const done = game.objectiveDone();
    for (const e of this.level.exhibits) {
      const show = !done && !st.stolen[e.id] && st.status === 'playing' && !this.intro;
      this.labels.set(`obj-${e.id}`, tileCenter(e.tile[0], e.tile[1], 2.1), `<i class="arr"></i><span class="gem">◆</span><b>${e.name}</b>`, 'objmark', show, true);
    }
    this.labels.set('obj-exit', tileCenter(this.level.exit[0], this.level.exit[1], 2.1), '<i class="arr"></i><span class="gem">➜</span><b>יציאה</b>', 'objmark exit', done && st.status === 'playing', true);

    // running makes noise: show how far it carries
    if (st.thief.running && game.running) {
      this.noiseTimer -= dt;
      if (this.noiseTimer <= 0) {
        this.noiseTimer = 0.45;
        let r = this.noiseRings.find((x) => x.t >= 1);
        if (!r) {
          const mesh = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1, 48),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
          );
          mesh.rotation.x = -Math.PI / 2;
          this.scene.add(mesh);
          r = { mesh, t: 1 };
          this.noiseRings.push(r);
        }
        r.t = 0;
        r.mesh.position.set(st.thief.x, 0.07, st.thief.y);
      }
    }
    for (const r of this.noiseRings) {
      if (r.t >= 1) {
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      r.t = Math.min(1, r.t + dt / 0.7);
      r.mesh.scale.setScalar(0.3 + r.t * 3.7);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - r.t);
    }

    // scanner wires, revealed by an expanding X-ray wave
    if (scan > 0.02 && this.prevScan <= 0.02) this.waveT = 0;
    if (scan <= 0.02) this.waveT = -1;
    this.prevScan = scan;
    if (this.waveT >= 0) this.waveT += dt;
    const waveR = this.waveT < 0 ? 0 : opts.reducedMotion ? 999 : this.waveT * 16;
    const ringMat = this.waveRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = this.waveT >= 0 && waveR < 40 ? 0.9 * (1 - waveR / 40) : 0;
    this.waveRing.position.set(st.thief.x, 0.08, st.thief.y);
    this.waveRing.scale.setScalar(Math.max(0.01, waveR));
    this.scannerGroup.visible = scan > 0.02;
    const tp = new THREE.Vector3(st.thief.x, 0, st.thief.y);
    const flat = (v: THREE.Vector3) => Math.hypot(v.x - tp.x, v.z - tp.z);
    if (this.scannerGroup.visible) {
      const m4 = new THREE.Matrix4();
      const tmp = new THREE.Vector3();
      for (const w of this.wires) {
        const I = game.current(w.part);
        const live = I > 0.005;
        w.tubeMat.opacity = (live ? 0.95 : 0.3) * scan;
        w.tubeMat.color.setHex(live ? this.level.circuits.find((c) => c.id === w.circuit)!.color : 0x556070);
        for (const sg of w.segs) {
          const a = sg.userData.a as THREE.Vector3;
          const b = sg.userData.b as THREE.Vector3;
          sg.visible = Math.min(flat(a), flat(b), flat(tmp.copy(a).lerp(b, 0.5))) < waveR;
        }
        const speed = Math.min(7, 0.6 + Math.sqrt(I) * 2.2);
        if (live && !opts.reducedMotion) w.phase = (w.phase + (speed * dt) / w.length) % 1;
        const n = w.dots.count;
        for (let i = 0; i < n; i++) {
          const u = (i / n + w.phase) % 1;
          const p = w.curve.getPointAt(u);
          const show = live && flat(p) < waveR;
          m4.makeScale(show ? 1 : 0.0001, show ? 1 : 0.0001, show ? 1 : 0.0001);
          m4.setPosition(p);
          w.dots.setMatrixAt(i, m4);
        }
        w.dots.instanceMatrix.needsUpdate = true;
        const tagPos = w.curve.getPointAt(1).clone().add(new THREE.Vector3(0, 0.35, 0));
        const revealed = flat(tagPos) < waveR;
        this.labels.set(`amp-${w.device}`, tagPos, `<bdi dir="ltr">${I < 0.005 ? '0 A' : I >= 100 ? '>99 A' : I.toFixed(I < 1 ? 2 : 1) + ' A'}</bdi>`, `amp ${live ? '' : 'dead'}`, scan > 0.5 && revealed);
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
      if (e.type === 'closeCall') {
        this.labels.set(`cc-${this.time}`, new THREE.Vector3(e.x!, 2.6, e.y!), '<span>על הסף! 😮‍💨</span>', 'closecall', true);
        const key = `cc-${this.time}`;
        window.setTimeout(() => this.labels.hide(key), 1400);
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
