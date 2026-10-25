import * as THREE from 'three';
import { glowTex } from './textures';

interface P {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  kind: 'spark' | 'smoke' | 'confetti';
}

/** Small CPU particle system: sparks, smoke puffs, confetti. */
export class Particles {
  readonly points: THREE.Points;
  private list: P[] = [];
  private geo = new THREE.BufferGeometry();
  private max = 600;
  private pos = new Float32Array(this.max * 3);
  private col = new Float32Array(this.max * 3);
  private size = new Float32Array(this.max);

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex() } },
      vertexShader: `attribute float size; varying vec3 vColor; void main(){ vColor = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.a, t.a); }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  sparks(at: THREE.Vector3, n = 40, color = 0xffd27a) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5);
      this.add({ pos: at.clone(), vel: v, life: 0, max: 0.4 + Math.random() * 0.5, size: 0.12 + Math.random() * 0.1, color: c, kind: 'spark' });
    }
  }

  smoke(at: THREE.Vector3, n = 14) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
      this.add({ pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)), vel: v, life: 0, max: 1.5 + Math.random(), size: 0.5, color: new THREE.Color(0x40404a), kind: 'smoke' });
    }
  }

  confetti(at: THREE.Vector3, n = 80) {
    const palette = [0x38e8ff, 0xffd04a, 0x7dffb0, 0xff6ad5];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6);
      this.add({ pos: at.clone(), vel: v, life: 0, max: 1.6 + Math.random(), size: 0.16, color: new THREE.Color(palette[i % 4]), kind: 'confetti' });
    }
  }

  private add(p: P) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  }

  update(dt: number) {
    const keep: P[] = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.kind === 'spark') p.vel.y -= 9.8 * dt;
      if (p.kind === 'confetti') {
        p.vel.y -= 4 * dt;
        p.vel.multiplyScalar(0.98);
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03 && p.kind !== 'smoke') {
        p.pos.y = 0.03;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      keep.push(p);
    }
    this.list = keep;
    for (let i = 0; i < this.max; i++) {
      const p = this.list[i];
      if (!p) {
        this.size[i] = 0;
        continue;
      }
      const k = 1 - p.life / p.max;
      this.pos.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
      const fade = p.kind === 'smoke' ? 0.35 * k : k;
      this.col.set([p.color.r * fade, p.color.g * fade, p.color.b * fade], i * 3);
      this.size[i] = p.kind === 'smoke' ? p.size * (1.5 - k) : p.size;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

/** DOM labels that follow 3D points. */
export class Labels {
  private layer: HTMLElement;
  private items = new Map<string, { el: HTMLElement; pos: THREE.Vector3; visible: boolean; clamp: boolean }>();
  private v = new THREE.Vector3();
  constructor(layer: HTMLElement) {
    this.layer = layer;
  }
  set(key: string, pos: THREE.Vector3, html: string, cls: string, visible = true, clamp = false) {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('div');
      this.layer.appendChild(el);
      it = { el, pos: pos.clone(), visible, clamp };
      this.items.set(key, it);
    }
    it.clamp = clamp;
    it.pos.copy(pos);
    if (it.el.className !== cls) it.el.className = cls;
    if (it.el.innerHTML !== html) it.el.innerHTML = html;
    it.visible = visible;
  }
  hide(key: string) {
    const it = this.items.get(key);
    if (it) it.visible = false;
  }
  clear() {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
  }
  update(camera: THREE.Camera, w: number, h: number) {
    for (const it of this.items.values()) {
      if (!it.visible) {
        it.el.style.display = 'none';
        continue;
      }
      this.v.copy(it.pos).project(camera);
      if (this.v.z > 1 && !it.clamp) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = '';
      let x = ((this.v.x + 1) / 2) * w;
      let y = ((1 - this.v.y) / 2) * h;
      if (it.clamp) {
        // pin off-screen targets to the screen edge with an arrow pointing at them
        const m = 56;
        const off = x < m || x > w - m || y < m + 40 || y > h - m - 90 || this.v.z > 1;
        it.el.classList.toggle('edge', off);
        if (off) {
          const cx = w / 2;
          const cy = h / 2;
          let dx = x - cx;
          let dy = y - cy;
          if (this.v.z > 1) {
            dx = -dx;
            dy = -dy;
          }
          const k = Math.min((w / 2 - m) / Math.max(1e-3, Math.abs(dx)), (h / 2 - m - 70) / Math.max(1e-3, Math.abs(dy)));
          x = cx + dx * k;
          y = cy + dy * k;
          it.el.style.setProperty('--ang', `${Math.atan2(dy, dx)}rad`);
        }
      }
      it.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    }
  }
}
