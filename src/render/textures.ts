import * as THREE from 'three';

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Deterministic pseudo-random for texture noise. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function marbleFloor(theme: 'museum' | 'vault' | 'courtyard') {
  return canvasTex(256, 256, (c) => {
    const r = rng(theme === 'vault' ? 7 : theme === 'courtyard' ? 11 : 3);
    const base = theme === 'vault' ? '#2a3140' : theme === 'courtyard' ? '#2b2d33' : '#2a2433';
    c.fillStyle = base;
    c.fillRect(0, 0, 256, 256);
    // veins / grain
    for (let i = 0; i < 60; i++) {
      c.strokeStyle = `rgba(${theme === 'vault' ? '170,190,220' : '200,180,230'},${0.02 + r() * 0.05})`;
      c.lineWidth = 0.5 + r() * 2;
      c.beginPath();
      let x = r() * 256;
      let y = r() * 256;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 80;
        y += (r() - 0.5) * 80;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    if (theme === 'courtyard') {
      // cobbles
      for (let y = 0; y < 256; y += 32)
        for (let x = (y / 32) % 2 ? -16 : 0; x < 256; x += 32) {
          c.fillStyle = `rgba(${60 + r() * 30},${62 + r() * 30},${70 + r() * 30},0.85)`;
          c.beginPath();
          c.roundRect(x + 2, y + 2, 28, 28, 7);
          c.fill();
        }
    }
    // grout
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 3;
    c.strokeRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    c.strokeRect(3, 3, 250, 250);
  });
}

export function wallTex(theme: 'museum' | 'vault' | 'courtyard') {
  return canvasTex(128, 256, (c) => {
    const r = rng(19);
    c.fillStyle = theme === 'vault' ? '#3a4352' : theme === 'courtyard' ? '#4a4048' : '#3b3346';
    c.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(255,255,255,${r() * 0.04})`;
      c.fillRect(r() * 128, r() * 256, 2, 2);
    }
    if (theme === 'vault') {
      c.strokeStyle = 'rgba(0,0,0,0.4)';
      for (let y = 0; y < 256; y += 64) c.strokeRect(2, y + 2, 124, 60);
      c.fillStyle = 'rgba(200,210,230,0.25)';
      for (let y = 0; y < 256; y += 64) for (const x of [10, 118]) c.fillRect(x, y + 10, 3, 3);
    } else if (theme === 'courtyard') {
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let y = 0; y < 256; y += 24) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(128, y);
        c.stroke();
        for (let x = (y / 24) % 2 ? 0 : 32; x < 128; x += 64) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 24);
          c.stroke();
        }
      }
    } else {
      // wainscot panel at the bottom, plaster above
      c.fillStyle = '#2a2131';
      c.fillRect(0, 170, 128, 86);
      c.fillStyle = 'rgba(210,170,110,0.35)';
      c.fillRect(0, 168, 128, 3);
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.strokeRect(10, 182, 108, 62);
    }
  });
}

export function hazardTex() {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = '#58606a';
    c.fillRect(0, 0, 128, 128);
    c.save();
    c.beginPath();
    c.rect(0, 96, 128, 32);
    c.clip();
    for (let x = -128; x < 256; x += 24) {
      c.fillStyle = '#f2c230';
      c.beginPath();
      c.moveTo(x, 128);
      c.lineTo(x + 12, 128);
      c.lineTo(x + 44, 96);
      c.lineTo(x + 32, 96);
      c.fill();
    }
    c.restore();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 8; y < 90; y += 14) c.fillRect(8, y, 112, 2);
  });
}

/** Soft radial sprite used for glows and the floor light pools. */
export function glowTex() {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

const labelCache = new Map<string, THREE.CanvasTexture>();
/** Text on a rounded chip. Cached: the same label is never drawn twice. */
export function labelTex(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string } = {}) {
  const key = JSON.stringify([text, opts]);
  let t = labelCache.get(key);
  if (!t) {
    t = drawLabel(text, opts);
    labelCache.set(key, t);
  }
  return t;
}

function drawLabel(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string }) {
  const w = opts.w ?? 256;
  const h = opts.h ?? 96;
  return canvasTex(w, h, (c) => {
    c.fillStyle = opts.bg ?? '#0b3b1f';
    c.beginPath();
    c.roundRect(4, 4, w - 8, h - 8, 12);
    c.fill();
    c.fillStyle = opts.fg ?? '#6dff9b';
    c.font = opts.font ?? `700 ${Math.floor(h * 0.5)}px Rubik, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.direction = 'rtl';
    c.fillText(text, w / 2, h / 2 + 2);
  });
}

export function boardTex() {
  return canvasTex(512, 320, (c) => {
    const r = rng(5);
    c.fillStyle = '#1d2a2c';
    c.fillRect(0, 0, 512, 320);
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = `rgba(255,255,255,${r() * 0.035})`;
      c.fillRect(r() * 512, r() * 320, 2, 1);
    }
    c.strokeStyle = 'rgba(120,200,210,0.06)';
    for (let x = 0; x < 512; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 320);
      c.stroke();
    }
    for (let y = 0; y < 320; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(512, y);
      c.stroke();
    }
  });
}
