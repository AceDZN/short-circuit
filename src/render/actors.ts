import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { M, emissive } from './props';

export type ActorPose = 'idle' | 'walk' | 'run' | 'sneak' | 'interact' | 'busted' | 'look' | 'alert' | 'cheer';

export interface Actor {
  root: THREE.Group;
  /** Attach point for a head lamp / flashlight in local space. */
  lampAnchor: THREE.Object3D;
  setPose(p: ActorPose): void;
  update(dt: number, speed: number): void;
  usesModel: boolean;
}

// ───────────────────────── GLB cache

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF | null>>();

export function loadModel(name: string): Promise<GLTF | null> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`./models/${name}.glb`).catch(() => null);
    cache.set(name, p);
  }
  return p;
}

export function modelClipNames(g: GLTF | null) {
  return g?.animations.map((a) => a.name) ?? [];
}

const CLIP_KEYS: Record<ActorPose, string[]> = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['sneak', 'walk', 'crouch'],
  sneak: ['sneak', 'crouch', 'walk'],
  run: ['run', 'jog', 'sprint'],
  interact: ['interact', 'pick', 'use', 'idle'],
  busted: ['surrender', 'hands', 'afraid', 'frightened', 'scared', 'hit', 'idle'],
  look: ['look', 'search', 'idle'],
  alert: ['alert', 'surprise', 'frightened', 'shock', 'angry', 'idle'],
  cheer: ['cheer', 'victory', 'dance', 'jump', 'idle'],
};

function pickClip(clips: THREE.AnimationClip[], pose: ActorPose) {
  for (const k of CLIP_KEYS[pose]) {
    const c = clips.find((x) => x.name.toLowerCase().includes(k));
    if (c) return c;
  }
  return clips[0];
}

/** Wrap a rigged GLB into an Actor, normalized to `height` metres, facing +Z. */
function glbActor(gltf: GLTF, height: number, yaw: number): Actor {
  const model = skeletonClone(gltf.scene) as THREE.Group;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(0.001, size.y);
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  model.rotation.y = yaw;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      (o as THREE.Mesh).frustumCulled = false;
    }
  });
  const root = new THREE.Group();
  root.add(model);
  const lampAnchor = new THREE.Object3D();
  lampAnchor.position.set(0, height * 0.93, 0.12);
  root.add(lampAnchor);
  const mixer = new THREE.AnimationMixer(model);
  const bone = (n: string) => model.getObjectByName(`mixamorig${n}`) ?? model.getObjectByName(`mixamorig:${n}`);
  const arms = { la: bone('LeftArm'), ra: bone('RightArm'), lf: bone('LeftForeArm'), rf: bone('RightForeArm') };
  let pose: ActorPose | null = null;
  let action: THREE.AnimationAction | null = null;
  const hasRun = gltf.animations.some((a) => /run|jog|sprint/i.test(a.name));
  return {
    root,
    lampAnchor,
    usesModel: true,
    setPose(p) {
      if (p === pose) return;
      pose = p;
      const clip = pickClip(gltf.animations, p);
      if (!clip) return;
      const next = mixer.clipAction(clip);
      if (next !== action) {
        next.reset().fadeIn(0.18).play();
        action?.fadeOut(0.18);
        action = next;
      }
      const once = p === 'busted' || p === 'cheer';
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.timeScale = p === 'run' && !hasRun ? 1.7 : 1;
    },
    update(dt) {
      mixer.update(dt);
      // No surrender/cheer clip in the Tripo rig: raise the arms on top of the idle clip.
      if ((pose === 'busted' || pose === 'cheer') && arms.la && arms.ra) {
        const t = (window as unknown as { __armPose?: number[] }).__armPose ?? ARMS_UP;
        const wave = pose === 'cheer' ? Math.sin(performance.now() / 120) * 0.25 : 0;
        arms.la.rotation.set(t[0] + wave, t[1], t[2]);
        arms.ra.rotation.set(t[3] - wave, t[4], t[5]);
        arms.lf?.rotation.set(t[6], t[7], t[8]);
        arms.rf?.rotation.set(t[9], t[10], t[11]);
      }
    },
  };
}

/** Euler angles (Mixamo local space) for both arms raised: L arm, R arm, L forearm, R forearm. */
const ARMS_UP = [2.5, 0, 0, -2.5, 0, 0, 0, 0, -0.8, 0, 0, 0.8];

// ───────────────────────── procedural fallbacks (also used before GLBs load)

function limb(len: number, r: number, mat: THREE.Material) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}

function proceduralActor(kind: 'thief' | 'guard'): Actor {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const guard = kind === 'guard';
  const cloth = new THREE.MeshStandardMaterial({ color: guard ? 0x1f2d55 : 0x2b2d33, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: guard ? 0x1a2240 : 0x1b1c20, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac86, roughness: 0.7 });
  const hipY = guard ? 0.85 : 0.8;
  const legL = limb(0.62, guard ? 0.11 : 0.085, pants);
  const legR = limb(0.62, guard ? 0.11 : 0.085, pants);
  legL.position.set(-0.11, hipY, 0);
  legR.position.set(0.11, hipY, 0);
  body.add(legL, legR);
  const shoe = new THREE.MeshStandardMaterial({ color: guard ? 0x111111 : 0x20262c, emissive: guard ? 0 : 0x15d8e8, emissiveIntensity: guard ? 0 : 0.6 });
  for (const leg of [legL, legR]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.24), shoe);
    s.position.set(0, -0.75, 0.05);
    leg.add(s);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(guard ? 0.27 : 0.19, guard ? 0.42 : 0.4, 4, 10), cloth);
  torso.position.y = hipY + 0.32;
  torso.castShadow = true;
  if (guard) torso.scale.set(1, 1, 0.85);
  body.add(torso);
  const head = new THREE.Group();
  head.position.y = hipY + 0.8;
  body.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(guard ? 0.17 : 0.15, 16, 12), skin);
  head.add(face);
  if (guard) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x141c38 }));
    cap.position.y = 0.12;
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), M.black);
    brim.position.set(0, 0.07, 0.15);
    head.add(brim);
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), M.black);
    stache.position.set(0, -0.05, 0.15);
    head.add(stache);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.04, 6), M.brass);
    badge.position.set(-0.12, hipY + 0.5, 0.24);
    body.add(badge);
  } else {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth);
    hood.rotation.x = -0.35;
    hood.position.set(0, 0.03, -0.03);
    head.add(hood);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), emissive(0xdff8ff, 3));
    lamp.position.set(0, 0.1, 0.16);
    head.add(lamp);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.16), new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.7 }));
    pack.position.set(0, hipY + 0.38, -0.24);
    pack.castShadow = true;
    body.add(pack);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.01), emissive(0x29e6ff, 3));
    strip.position.set(0, hipY + 0.45, -0.325);
    body.add(strip);
  }
  const armL = limb(0.5, guard ? 0.08 : 0.065, cloth);
  const armR = limb(0.5, guard ? 0.08 : 0.065, cloth);
  armL.position.set(guard ? -0.33 : -0.25, hipY + 0.58, 0);
  armR.position.set(guard ? 0.33 : 0.25, hipY + 0.58, 0);
  body.add(armL, armR);
  if (guard) {
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.22, 10), M.black);
    torch.rotation.x = Math.PI / 2;
    torch.position.set(0, -0.6, 0.1);
    armR.add(torch);
    const tip = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), emissive(0xfff1b0, 4));
    tip.position.set(0, -0.6, 0.215);
    armR.add(tip);
  }
  const lampAnchor = new THREE.Object3D();
  lampAnchor.position.set(0, hipY + 0.9, 0.15);
  root.add(lampAnchor);
  let pose: ActorPose = 'idle';
  let t = 0;
  return {
    root,
    lampAnchor,
    usesModel: false,
    setPose(p) {
      pose = p;
    },
    update(dt, speed) {
      t += dt * (pose === 'run' ? 11 : pose === 'walk' || pose === 'sneak' ? 7.5 : 2);
      const moving = pose === 'walk' || pose === 'run' || pose === 'sneak';
      const amp = pose === 'run' ? 0.9 : moving ? 0.55 : 0;
      legL.rotation.x = Math.sin(t) * amp;
      legR.rotation.x = -Math.sin(t) * amp;
      armL.rotation.x = -Math.sin(t) * amp * 0.8;
      armR.rotation.x = Math.sin(t) * amp * 0.8;
      armL.rotation.z = armR.rotation.z = 0;
      body.position.y = moving ? Math.abs(Math.sin(t)) * 0.05 : Math.sin(t) * 0.01;
      body.rotation.x = pose === 'sneak' ? 0.25 : pose === 'run' ? 0.15 : 0;
      head.rotation.y = 0;
      if (pose === 'busted') {
        armL.rotation.x = armR.rotation.x = Math.PI;
        armL.rotation.z = -0.25;
        armR.rotation.z = 0.25;
        legL.rotation.x = legR.rotation.x = 0;
      } else if (pose === 'interact') {
        armL.rotation.x = armR.rotation.x = -1.3 + Math.sin(t * 6) * 0.15;
      } else if (pose === 'look') {
        head.rotation.y = Math.sin(t * 1.4) * 0.8;
      } else if (pose === 'alert') {
        armR.rotation.x = -1.4;
        body.position.y = Math.abs(Math.sin(t * 3)) * 0.04;
      } else if (pose === 'cheer') {
        armL.rotation.x = armR.rotation.x = Math.PI * 0.95 + Math.sin(t * 4) * 0.2;
        body.position.y = Math.abs(Math.sin(t * 2.5)) * 0.25;
      } else if (guard && !moving) {
        armR.rotation.x = -0.9; // flashlight forward
      }
      if (guard && moving) armR.rotation.x = -0.9 + Math.sin(t) * 0.1;
      void speed;
    },
  };
}

/** Create an actor right away (procedural) and swap in the rigged GLB when it loads. */
export function createActor(kind: 'thief' | 'guard', onSwap?: (a: Actor) => void): Actor {
  const holder = new THREE.Group();
  let inner = proceduralActor(kind);
  inner.root.scale.setScalar(1.2);
  holder.add(inner.root);
  let pose: ActorPose = 'idle';
  const lampAnchor = new THREE.Object3D();
  holder.add(lampAnchor);
  const syncAnchor = () => lampAnchor.position.copy(inner.lampAnchor.position).multiplyScalar(inner.root.scale.x);
  syncAnchor();
  const actor: Actor = {
    root: holder,
    lampAnchor,
    usesModel: false,
    setPose(p) {
      pose = p;
      inner.setPose(p);
    },
    update(dt, speed) {
      inner.update(dt, speed);
    },
  };
  loadModel(kind).then((g) => {
    if (!g || !g.animations.length) return;
    const meta = MODEL_META[kind];
    const next = glbActor(g, meta.height, meta.yaw);
    holder.remove(inner.root);
    inner = next;
    holder.add(next.root);
    next.setPose(pose);
    syncAnchor();
    actor.usesModel = true;
    onSwap?.(actor);
  });
  return actor;
}

/** Height and forward-axis correction for each rigged GLB (see ASSETS.md). */
export const MODEL_META: Record<'thief' | 'guard', { height: number; yaw: number }> = {
  thief: { height: 1.95, yaw: 0 },
  guard: { height: 2.1, yaw: 0 },
};
