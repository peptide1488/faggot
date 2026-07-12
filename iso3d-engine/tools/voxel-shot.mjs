#!/usr/bin/env node
/**
 * Headless screenshot of voxel.html (or any page in this project) — no manual browser
 * dance, no dependencies. Serves iso3d-engine/ over plain HTTP (ES module imports don't
 * work over file://) and drives Chrome/Edge's built-in headless screenshot flag.
 *
 * Usage: node tools/voxel-shot.mjs [--page voxel.html] [--out shot.png] [--width 1280]
 *        [--height 800] [--wait 800]
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.css': 'text/css',
};

function parseArgs(argv) {
  const out = { page: 'voxel.html', out: 'voxel-shot.png', width: 1280, height: 800, wait: 800 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--page') out.page = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--height') out.height = Number(argv[++i]);
    else if (a === '--wait') out.wait = Number(argv[++i]);
  }
  return out;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const filePath = path.join(ROOT, urlPath);
        const data = await readFile(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function findBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge install found in the usual locations.');
  return found;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/${args.page}`;
  const outPath = path.resolve(args.out);
  const browser = findBrowser();

  const flags = [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    `--window-size=${args.width},${args.height}`,
    `--virtual-time-budget=${args.wait}`,
    `--screenshot=${outPath}`,
    url,
  ];

  await new Promise((resolve, reject) => {
    execFile(browser, flags, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(stderr || stdout);
        reject(err);
      } else {
        resolve();
      }
    });
  }).finally(() => server.close());

  console.log(`Saved ${outPath} (via ${url})`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
