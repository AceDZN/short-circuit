// Prints renderer stats per heist (dev server on 5196).
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const n of [1, 2, 3, 4, 5, 6]) {
  await page.goto(`http://127.0.0.1:5196/?play=1&all=1&nointro=1&level=${n}`);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__sc.setScreen('play'));
  await page.waitForTimeout(800);
  console.log(n, JSON.stringify(await page.evaluate(() => window.__sc.renderInfo)), await page.evaluate(() => { let n = 0; window.__sc.world.scene.traverse((o) => { if (o.isMesh || o.isSprite) n++; }); return n; }));
}
await browser.close();
