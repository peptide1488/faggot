// Dev-only local visual verification for iso-renderer.js — NOT part of the shipped app, not
// precached by sw.js. Renders a handful of canonical elevation scenes through a real headless
// Chromium (ground truth Canvas2D, not a second hand-rolled implementation that could have its
// own bugs) so elevation/wall bugs get caught by looking at a PNG locally, before a push.
//
// Usage: node tools/iso-preview.js
// Requires `playwright` + a cached Chromium; see the parent conversation for how it was set up
// (`npm install playwright` + `npx playwright install chromium`) if this errors with "Cannot
// find module 'playwright'" or a missing-browser error.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.ISO_PREVIEW_PLAYWRIGHT || 'playwright');

const OUT_DIR = process.env.ISO_PREVIEW_OUT || __dirname;
const RENDERER = path.join(__dirname, '..', 'iso-renderer.js');

// name -> {cols, rows, height:{...}, tiles:{...}} — same shape as s.map in index.html
const SCENES = {
  flat: { cols: 4, rows: 4, height: {}, tiles: {} },
  mound: { cols: 5, rows: 5, height: { '2,2': 2 }, tiles: {} },
  pit: { cols: 5, rows: 5, height: { '2,2': -2 }, tiles: {} },
  staircase: { cols: 4, rows: 1, height: { '0,0': 3, '1,0': 2, '2,0': 1, '3,0': 0 }, tiles: {} },
  pyramid_hill: (() => {
    const height = {}; for(let y = 1; y <= 3; y++) for(let x = 1; x <= 3; x++) height[x + ',' + y] = 1;
    height['2,2'] = 2;
    return { cols: 5, rows: 5, height, tiles: {} };
  })(),
  mound_next_to_pit: { cols: 6, rows: 3, height: { '2,1': 2, '3,1': -2 }, tiles: {} },
};

const PALETTE = { grass: '#6f9442', stone: '#9aa0a8', wood: '#9a6a3a', sand: '#d9c48a' };

async function main(){
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: RENDERER });

  for(const [name, scene] of Object.entries(SCENES)){
    const { w, h } = await page.evaluate(({ scene }) => {
      const { w, h } = IsoRenderer.stageSize(scene.cols, scene.rows, 0);
      return { w: Math.ceil(w), h: Math.ceil(h) };
    }, { scene });

    await page.evaluate(({ scene, w, h, PALETTE }) => {
      document.body.innerHTML = '';
      const cv = document.createElement('canvas');
      cv.className = 'isocanvas';
      cv.width = w; cv.height = h;
      cv.dataset.cols = scene.cols; cv.dataset.rows = scene.rows; cv.dataset.rot = '0';
      cv.dataset.tiles = encodeURIComponent(JSON.stringify(scene.tiles));
      cv.dataset.height = encodeURIComponent(JSON.stringify(scene.height));
      cv.dataset.palette = encodeURIComponent(JSON.stringify(PALETTE));
      cv.dataset.painted = '1'; // paint synchronously below, skip the MutationObserver race
      document.body.appendChild(cv);
      IsoRenderer.paint(cv);
    }, { scene, w, h, PALETTE });

    const el = await page.$('canvas.isocanvas');
    const outPath = path.join(OUT_DIR, `iso_${name}.png`);
    await el.screenshot({ path: outPath });
    console.log('wrote', outPath, `${w}x${h}`);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
