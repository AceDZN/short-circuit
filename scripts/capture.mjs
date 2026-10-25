// Captures real gameplay screenshots for docs/VISUAL_REVIEW.md.
// Usage: dev server on 5196, then `node scripts/capture.mjs [outDir]`.
// Inputs are real keyboard/mouse events; walking uses the same click-to-move path as a floor click.
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] ?? 'docs/captures';
fs.mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:5196/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function level(n) {
  await page.goto(`${base}?play=1&all=1&level=${n}`);
  await page.waitForFunction(() => typeof window.advanceTime === 'function');
  await page.waitForTimeout(2500); // models + fonts
  await page.evaluate(() => window.__sc.setScreen('play'));
  await page.evaluate(() => window.advanceTime(100));
}
const adv = (ms) => page.evaluate((m) => window.advanceTime(m), ms);
const walk = async (tile) => {
  await page.evaluate((t) => window.__sc.game.moveTo(t), tile);
  for (let i = 0; i < 40; i++) {
    await adv(200);
    if (await page.evaluate(() => !window.__sc.game.state.thief.path.length)) break;
  }
};
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name, await page.evaluate(() => JSON.parse(window.render_game_to_text()).status));
};

// 01 — first 30 seconds: entering the lobby, guard at the desk, camera sweeping.
await level(1);
await page.keyboard.down('KeyD');
await adv(600);
await page.keyboard.up('KeyD');
await walk([4, 8]);
await shot('actual-01-first-30s');

// 02a — scanner X-ray.
await page.keyboard.press('Tab');
await adv(500);
await page.waitForTimeout(600);
await shot('actual-02a-scanner');
await page.keyboard.press('Tab');

// 02b — panel close-up: open with E, click the chandelier wire, press ✂.
await walk([1, 7]);
await page.keyboard.press('KeyE');
await adv(100);
await page.waitForTimeout(900);
const pt = await page.evaluate(() => {
  const pv = window.__sc.panel;
  const c = window.__sc.game.circuit('c1');
  const [ax, ay] = c.nodes.f;
  const [bx, by] = c.nodes.l;
  const v = { x: ((ax + bx) / 2 - 6) * 0.1, y: (3.6 - (ay + by) / 2) * 0.1, z: 0.01 };
  const p = pv.camera.position.clone().set(v.x, v.y, v.z).project(pv.camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
});
await page.mouse.move(pt.x, pt.y);
await page.waitForTimeout(100);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(200);
console.log('click at', pt, 'selection', await page.evaluate(() => JSON.stringify(window.__sc.panel?.selection)), await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.className, [pt.x, pt.y]));
await page.click('#pvCut');
await adv(300);
await shot('actual-02b-panel-closeup');
await page.keyboard.press('Escape');

// 03 — failure: heist 3, open the window before bridging the alarm loop.
await level(3);
await walk([11, 7]);
await page.keyboard.press('KeyE');
await adv(1700);
await page.waitForTimeout(3200);
await shot('actual-03-alarm-fail');

// Extra gameplay captures of the other heists.
for (const [n, tile] of [
  [2, [6, 3]],
  [4, [9, 7]],
  [5, [13, 8]],
  [6, [11, 8]],
]) {
  await level(n);
  await walk(tile);
  await shot(`actual-heist${n}`);
}

const fps = await page.evaluate(async () => {
  let n = 0;
  const t0 = performance.now();
  await new Promise((r) => {
    const f = () => (++n < 120 ? requestAnimationFrame(f) : r());
    requestAnimationFrame(f);
  });
  return Math.round((n * 1000) / (performance.now() - t0));
});
console.log('headless swiftshader fps (not representative of a GPU):', fps);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
