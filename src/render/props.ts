import * as THREE from 'three';
import { glowTex, hazardTex, labelTex } from './textures';

const glow = glowTex();

export const M = {
  brass: new THREE.MeshStandardMaterial({ color: 0xc89b4a, metalness: 0.85, roughness: 0.3 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc8703a, metalness: 0.9, roughness: 0.35 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b95a3, metalness: 0.8, roughness: 0.38 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.7, roughness: 0.45 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b3b22, metalness: 0.05, roughness: 0.45 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x2e2836, metalness: 0.05, roughness: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
  black: new THREE.MeshStandardMaterial({ color: 0x15161b, metalness: 0.3, roughness: 0.6 }),
  velvet: new THREE.MeshStandardMaterial({ color: 0x8c1b2b, roughness: 0.8 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x5c6a66, metalness: 0.6, roughness: 0.5, map: hazardTex() }),
};

export function emissive(color: number, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

export function glowSprite(color: number, size: number, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** Flat additive light pool on the floor. */
export function floorPool(color: number, radius: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: glow, color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  return m;
}

export function makeExhibit(kind: 'pile' | 'bulb' | 'coil' | 'generator' | 'crown') {
  const g = new THREE.Group();
  if (kind === 'pile') {
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), i % 2 ? M.copper : new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.25 }));
      d.position.y = 0.03 + i * 0.045;
      g.add(d);
    }
    for (const x of [-0.22, 0.22]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75), M.wood);
      rod.position.set(x, 0.37, 0);
      g.add(rod);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.12), M.wood);
    top.position.y = 0.74;
    g.add(top);
  } else if (kind === 'bulb') {
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.38, 28, 20), new THREE.MeshPhysicalMaterial({ color: 0xfff1d0, transmission: 0.6, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
    glass.scale.set(1, 1.15, 1);
    glass.position.y = 0.7;
    g.add(glass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 20), M.brass);
    neck.position.y = 0.18;
    g.add(neck);
    const fil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.1, 0.012, 64, 6, 2, 5), emissive(0xffa040, 4));
    fil.position.y = 0.66;
    fil.name = 'filament';
    g.add(fil);
    g.add(Object.assign(glowSprite(0xffb050, 1.6, 0.7), { name: 'halo' })).children.at(-1)!.position.set(0, 0.68, 0);
  } else if (kind === 'coil') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 24), M.wood);
    base.position.y = 0.06;
    g.add(base);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 20), M.copper);
    coil.position.y = 0.52;
    g.add(coil);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 14, 28), M.steel);
    torus.rotation.x = Math.PI / 2;
    torus.position.y = 0.98;
    g.add(torus);
    const sp = glowSprite(0xb070ff, 1.3, 0.9);
    sp.position.y = 1.0;
    sp.name = 'halo';
    g.add(sp);
  } else if (kind === 'generator') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 24), M.copper);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.38;
    g.add(body);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 10, 28), M.darkSteel);
    wheel.position.set(0.38, 0.38, 0);
    wheel.rotation.y = Math.PI / 2;
    g.add(wheel);
  } else {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.18, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd04a, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }));
    crown.position.y = 0.2;
    g.add(crown);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), emissive(0x40e0ff, 3));
    gem.position.y = 0.36;
    g.add(gem);
    const sp = glowSprite(0x60e8ff, 0.9, 0.7);
    sp.position.y = 0.3;
    g.add(sp);
  }
  return g;
}

export function makePedestal() {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.8), M.stone);
  p.position.y = 0.425;
  p.castShadow = p.receiveShadow = true;
  g.add(p);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.05, 0.84), M.brass);
  trim.position.y = 0.86;
  g.add(trim);
  return g;
}

export function makeStanchions(g: THREE.Group) {
  for (const [x, z] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.6, 10), M.brass);
    post.position.set(x, 0.3, z);
    g.add(post);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), M.brass);
    ball.position.set(x, 0.62, z);
    g.add(ball);
  }
  for (const [a, b] of [
    [[-0.55, -0.55], [0.55, -0.55]],
    [[0.55, -0.55], [0.55, 0.55]],
    [[0.55, 0.55], [-0.55, 0.55]],
    [[-0.55, 0.55], [-0.55, -0.55]],
  ]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a[0], 0.56, a[1]), new THREE.Vector3((a[0] + b[0]) / 2, 0.42, (a[1] + b[1]) / 2), new THREE.Vector3(b[0], 0.56, b[1]));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.012, 5), M.velvet));
  }
}

export function makePanel(fusebox = false) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.16), M.panel);
  box.castShadow = true;
  g.add(box);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), new THREE.MeshBasicMaterial({ map: labelTex('⚡', { bg: '#f2c230', fg: '#111', w: 128, h: 128 }), transparent: true }));
  sign.position.set(0, 0.18, 0.081);
  g.add(sign);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.02), emissive(fusebox ? 0xffb347 : 0x38e8ff, 2.5));
  strip.position.set(0.3, 0, 0.085);
  strip.name = 'led';
  g.add(strip);
  return g;
}

export function makeSecurityCamera() {
  const g = new THREE.Group();
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), M.darkSteel);
  g.add(mount);
  const head = new THREE.Group();
  head.name = 'head';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.45), new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.4, roughness: 0.4 }));
  body.position.z = 0.25;
  head.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), M.black);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.48;
  head.add(lens);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), emissive(0xff2a2a, 4));
  led.position.set(0.07, 0.07, 0.47);
  led.name = 'led';
  head.add(led);
  head.rotation.x = 0.45;
  g.add(head);
  return g;
}

export function makeLampFixture(style: 'ceiling' | 'display' | 'chandelier' | 'wall' = 'ceiling') {
  const g = new THREE.Group();
  const bulbMat = emissive(0xffd27a, 3);
  bulbMat.name = 'bulb';
  if (style === 'chandelier') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 32), M.brass);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2), M.brass);
    chain.position.y = 0.6;
    g.add(chain);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bulbMat);
      b.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55);
      g.add(b);
    }
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.05, transparent: true, opacity: 0.6 }));
    crystal.rotation.x = Math.PI;
    crystal.position.y = -0.2;
    g.add(crystal);
  } else if (style === 'wall') {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), M.brass);
    arm.position.z = 0.15;
    g.add(arm);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), bulbMat);
    b.position.set(0, 0.06, 0.3);
    g.add(b);
  } else if (style === 'display') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), bulbMat);
    b.scale.y = 1.25;
    g.add(b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), M.brass);
    cap.position.y = -0.15;
    g.add(cap);
  } else {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.25, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x24303a, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    g.add(shade);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), bulbMat);
    b.position.y = -0.1;
    g.add(b);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1), M.black);
    cord.position.y = 0.6;
    g.add(cord);
  }
  return { group: g, bulbMat };
}

export function makeDoor() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 2.5, 0.22), M.panel);
  slab.position.y = 1.25;
  slab.castShadow = true;
  slab.name = 'slab';
  g.add(slab);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.24), emissive(0xff3b3b, 3));
  led.position.y = 2.1;
  led.name = 'led';
  slab.add(led);
  led.position.set(0, 0.85, 0);
  return g;
}

export function makeLaserEmitter() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), M.darkSteel);
  b.position.y = 0.45;
  g.add(b);
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), emissive(0xff2020, 4));
    l.position.y = 0.25 + i * 0.25;
    l.name = 'led';
    g.add(l);
  }
  return g;
}

export function makeSiren() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.12), M.darkSteel);
  g.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), emissive(0xff2020, 0.4));
  dome.rotation.x = Math.PI / 2;
  dome.position.z = 0.06;
  dome.name = 'dome';
  g.add(dome);
  return g;
}

export function makeExitSign() {
  const g = new THREE.Group();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: labelTex('יציאה ➜', { bg: '#0d4d24', fg: '#7dffa4' }), transparent: true, side: THREE.DoubleSide }));
  sign.position.y = 2.3;
  g.add(sign);
  const pool = floorPool(0x3dff7a, 0.9);
  pool.material.opacity = 0.5;
  g.add(pool);
  return g;
}

export function makeDesk() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 0.9), M.wood);
  top.position.y = 0.45;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  return g;
}
