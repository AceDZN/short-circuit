// Holds real WASD keys in each heist and logs how far the thief moved (dev server on 5196).
// Usage: node scripts/walkcheck.mjs <screenshot dir>
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const lvl of [1, 2, 3, 4, 5, 6]) {
  await page.goto(`http://127.0.0.1:5196/?play=1&all=1&nointro=1&level=${lvl}`);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__sc.setScreen('play'); window.__sc.game.failWith = () => {}; });
  await page.mouse.click(720, 300);
  const pos = () => page.evaluate(() => { const t = window.__sc.game.state.thief; return [+t.x.toFixed(2), +t.y.toFixed(2)]; });
  const log = [];
  for (const key of ['KeyD', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyS', 'KeyA', 'KeyW']) {
    const a = await pos();
    await page.keyboard.down(key);
    await page.waitForTimeout(700);
    await page.keyboard.up(key);
    const b = await pos();
    log.push(`${key.slice(3)}:${(b[0] - a[0]).toFixed(1)},${(b[1] - a[1]).toFixed(1)}`);
  }
  await page.screenshot({ path: `${out}/walk-l${lvl}.png` });
  console.log('L' + lvl, log.join(' '), 'end', JSON.stringify(await pos()));
}
await browser.close();
