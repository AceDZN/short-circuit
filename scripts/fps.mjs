// Measures frame rate of each heist in headless Chromium on the host GPU (Metal/ANGLE).
// Usage: dev server on 5196, then `node scripts/fps.mjs`.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
for (const n of [1, 2, 3, 4, 5, 6]) {
  await page.goto(`http://127.0.0.1:5196/?play=1&all=1&level=${n}`);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__sc.setScreen('play'));
  const r = await page.evaluate(async () => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
    let n = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const f = () => (performance.now() - t0 < 3000 ? (n++, requestAnimationFrame(f)) : res());
      requestAnimationFrame(f);
    });
    return { fps: Math.round((n * 1000) / (performance.now() - t0)), renderer };
  });
  console.log(`heist ${n}: ${r.fps} fps (${r.renderer})`);
}
await browser.close();
