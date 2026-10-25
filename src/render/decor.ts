import * as THREE from 'three';
import type { LevelDef } from '../sim/types';
import type { Grid } from '../sim/grid';
import { M, emissive, glowSprite } from './props';

/** Decoration hung on a wall face. It hides when that wall is cut down for the camera. */
export interface WallDecor {
  key: string; // wall tile "x,y"
  obj: THREE.Object3D;
}

const hash = (x: number, y: number, k: number) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

function artTexture(seed: number) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 96;
  const c = cv.getContext('2d')!;
  const pal = [
    ['#1b1440', '#38e8ff', '#ffd04a'],
    ['#2a0f1f', '#ff6a8a', '#ffe0a0'],
    ['#0f2a24', '#7dffb0', '#e0f0ff'],
    ['#22183a', '#b98aff', '#ffd04a'],
  ][seed % 4];
  c.fillStyle = pal[0];
  c.fillRect(0, 0, 128, 96);
  c.strokeStyle = pal[1];
  c.lineWidth = 3;
  const kind = seed % 3;
  if (kind === 0) {
    // atom
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(64, 48);
      c.rotate((i * Math.PI) / 3);
      c.beginPath();
      c.ellipse(0, 0, 40, 14, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    c.fillStyle = pal[2];
    c.beginPath();
    c.arc(64, 48, 7, 0, Math.PI * 2);
    c.fill();
  } else if (kind === 1) {
    // lightning / circuit
    c.beginPath();
    c.moveTo(14, 20);
    for (let x = 14; x <= 114; x += 20) c.lineTo(x, x % 40 ? 20 : 76);
    c.stroke();
    c.fillStyle = pal[2];
    for (let x = 14; x <= 114; x += 20) c.fillRect(x - 3, (x % 40 ? 20 : 76) - 3, 6, 6);
  } else {
    // light bulb
    c.beginPath();
    c.arc(64, 40, 22, Math.PI * 0.8, Math.PI * 2.2);
    c.lineTo(74, 70);
    c.lineTo(54, 70);
    c.closePath();
    c.stroke();
    c.strokeStyle = pal[2];
    c.beginPath();
    c.moveTo(56, 52);
    c.lineTo(60, 38);
    c.lineTo(64, 50);
    c.lineTo(68, 38);
    c.lineTo(72, 52);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(text: string) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#3a1f5c';
  c.fillRect(0, 0, 128, 256);
  c.strokeStyle = '#d7b46a';
  c.lineWidth = 4;
  c.strokeRect(6, 6, 116, 244);
  c.strokeStyle = '#e8e0ff';
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    c.save();
    c.translate(64, 80);
    c.rotate((i * Math.PI) / 3);
    c.beginPath();
    c.ellipse(0, 0, 34, 12, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  c.fillStyle = '#e8e0ff';
  c.font = '700 26px Rubik, sans-serif';
  c.textAlign = 'center';
  c.direction = 'rtl';
  const [a, b] = text.split(' ');
  c.fillText(a, 64, 160);
  if (b) c.fillText(b, 64, 194);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shared = {
  frame: new THREE.MeshStandardMaterial({ color: 0xb8913f, metalness: 0.9, roughness: 0.3 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.7 }),
  moon: new THREE.MeshStandardMaterial({ color: 0x0a1030, emissive: 0x2b4dbf, emissiveIntensity: 0.55, roughness: 0.2 }),
  mullion: new THREE.MeshStandardMaterial({ color: 0x1a1726, roughness: 0.6 }),
  box: new THREE.MeshStandardMaterial({ color: 0x6f7c8f, metalness: 0.85, roughness: 0.35 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0x4f5866, metalness: 0.8, roughness: 0.4 }),
};

/** Dress the walls and corners. Nothing here affects gameplay or collisions. */
export function buildDecor(scene: THREE.Scene, level: LevelDef, grid: Grid, wallTiles: [number, number][]): WallDecor[] {
  const out: WallDecor[] = [];
  const reserved = new Set<string>();
  const res = (x: number, y: number) => reserved.add(`${x},${y}`);
  for (const p of level.panels) res(p.tile[0], p.tile[1]);
  for (const d of level.devices) {
    if ('tile' in d) res(d.tile[0], d.tile[1]);
    if (d.kind === 'laser') {
      res(d.from[0], d.from[1]);
      res(d.to[0], d.to[1]);
    }
  }
  const open = (c: string) => c === '.' || c === ',' || c === '~' || c === 'g' || c === 'b';
  const theme = level.theme;
  let bannerN = 0;
  for (const [x, y] of wallTiles) {
    if (reserved.has(`${x},${y}`)) continue;
    for (const [dx, dy, k] of [
      [0, 1, 0],
      [0, -1, 1],
      [1, 0, 2],
      [-1, 0, 3],
    ] as const) {
      if (!open(grid.at(x + dx, y + dy))) continue;
      const r = hash(x, y, k);
      const n = new THREE.Vector3(dx, 0, dy);
      const base = new THREE.Vector3(x + 0.5 + dx * 0.51, 0, y + 0.5 + dy * 0.51);
      const rotY = Math.atan2(dx, dy);
      let obj: THREE.Object3D | null = null;
      if (theme === 'vault') {
        if (r < 0.35) {
          // safe-deposit boxes
          const g = new THREE.Group();
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < 4; j++) {
              const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.04), shared.box);
              b.position.set(-0.32 + i * 0.32, 0.7 + j * 0.24, 0.02);
              g.add(b);
              const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), M.brass);
              knob.rotation.x = Math.PI / 2;
              knob.position.set(-0.32 + i * 0.32 + 0.06, 0.7 + j * 0.24, 0.05);
              g.add(knob);
            }
          obj = g;
        } else if (r < 0.55) {
          const g = new THREE.Group();
          for (const h of [1.9, 2.15]) {
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), shared.pipe);
            pipe.rotation.z = Math.PI / 2;
            pipe.position.set(0, h, 0.07);
            g.add(pipe);
          }
          obj = g;
        } else if (r < 0.68) {
          const g = new THREE.Group();
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.06), emissive(0x8fb8ff, 1.5));
          lamp.position.set(0, 2.1, 0.04);
          g.add(lamp);
          const gl = glowSprite(0x8fb8ff, 0.9, 0.35);
          gl.position.set(0, 2.1, 0.2);
          g.add(gl);
          obj = g;
        }
      } else if (theme === 'courtyard') {
        if (r < 0.3 && dy === 1) {
          // lit apartment-style window on the museum facade
          const g = new THREE.Group();
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8), new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffb25a, emissiveIntensity: hash(x, y, 9) < 0.5 ? 0.5 : 0.08 }));
          pane.position.set(0, 1.7, 0.02);
          g.add(pane);
          obj = g;
        } else if (r < 0.55) {
          // ivy / hedge
          const g = new THREE.Group();
          for (let i = 0; i < 4; i++) {
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 + hash(x, y, i) * 0.1, 8, 6), shared.leaf);
            b.position.set(-0.35 + i * 0.24, 0.25 + hash(x, i, y) * 0.2, 0.18);
            g.add(b);
          }
          obj = g;
          // ivy stays visible even on cut walls
          obj.position.copy(base);
          obj.rotation.y = rotY;
          scene.add(obj);
          continue;
        }
      } else {
        if (r < 0.2) {
          // framed painting with a science motif
          const g = new THREE.Group();
          const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.04), shared.frame);
          frame.position.set(0, 1.65, 0.02);
          g.add(frame);
          const art = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ map: artTexture(Math.floor(hash(x, y, 5) * 100)), roughness: 0.6 }));
          art.position.set(0, 1.65, 0.045);
          g.add(art);
          obj = g;
        } else if (r < 0.3) {
          // museum banner
          const g = new THREE.Group();
          const b = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.24), new THREE.MeshStandardMaterial({ map: bannerTexture(bannerN++ % 2 ? 'מוזיאון המדע' : 'מוזיאון החשמל'), roughness: 0.9, side: THREE.DoubleSide }));
          b.position.set(0, 1.75, 0.03);
          g.add(b);
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), M.brass);
          rod.rotation.z = Math.PI / 2;
          rod.position.set(0, 2.38, 0.04);
          g.add(rod);
          obj = g;
        } else if (r < 0.42) {
          // warm sconce (decorative only — no gameplay light)
          const g = new THREE.Group();
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), M.brass);
          arm.position.set(0, 1.95, 0.08);
          g.add(arm);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), emissive(0xffc070, 2.2));
          bulb.position.set(0, 2.0, 0.17);
          g.add(bulb);
          const gl = glowSprite(0xffb050, 0.75, 0.45);
          gl.position.set(0, 2.0, 0.2);
          g.add(gl);
          obj = g;
        } else if (r < 0.52) {
          // tall moonlit window
          const g = new THREE.Group();
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), shared.moon);
          pane.position.set(0, 1.55, 0.02);
          g.add(pane);
          for (const [w, h, px, py] of [
            [0.05, 1.5, 0, 1.55],
            [0.7, 0.05, 0, 1.55],
            [0.7, 0.05, 0, 1.0],
            [0.7, 0.05, 0, 2.1],
          ]) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), shared.mullion);
            m.position.set(px, py, 0.04);
            g.add(m);
          }
          obj = g;
        } else if (r < 0.6) {
          // potted plant on the floor against the wall (always visible)
          const g = new THREE.Group();
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 12), shared.pot);
          pot.position.set(0, 0.15, 0.2);
          g.add(pot);
          for (let i = 0; i < 6; i++) {
            const lf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 5), shared.leaf);
            const a = (i / 6) * Math.PI * 2;
            lf.position.set(Math.cos(a) * 0.08, 0.5, 0.2 + Math.sin(a) * 0.08);
            lf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
            g.add(lf);
          }
          g.position.copy(base);
          g.rotation.y = rotY;
          scene.add(g);
          continue;
        }
      }
      if (!obj) continue;
      obj.position.copy(base);
      obj.rotation.y = rotY;
      void n;
      scene.add(obj);
      out.push({ key: `${x},${y}`, obj });
    }
  }
  return out;
}
