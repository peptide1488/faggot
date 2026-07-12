#!/usr/bin/env node
// Tiny static file server for iso3d-engine/ — ES module imports need http://, not file://.
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8090;

// Where the material maker's uploaded source images get saved as real files (in addition to
// the localStorage/data-URL copy it keeps for the atlas redraw) — see CONTENT_TOOLS_PLAN.md.
// Local-only, no third-party backend: this dev server already runs on the user's machine for
// every voxel.html testing session, this just teaches it one more route. Ordinary files land
// here, so `git add`/commit/push and deploying alongside Grimoire's other assets works exactly
// like any other checked-in texture.
const TEXTURES_DIR = path.join(ROOT, 'src', 'voxel', 'textures', 'custom');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.css': 'text/css',
};

const DATA_URL_EXT = {
  'image/png': '.png',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** POST /api/save-texture  { "name": "mossy_brick__top", "dataURL": "data:image/png;base64,..." }
 * Writes src/voxel/textures/custom/<name><ext-from-mime>. `name` is sanitized to a bare
 * filename (no path separators, no "..") so this can't be used to write outside the
 * textures/custom directory. */
async function handleSaveTexture(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const match = /^data:([^;]+);base64,(.*)$/s.exec(body.dataURL || '');
    if (!match) throw new Error('dataURL must be a base64 data: URL');
    const ext = DATA_URL_EXT[match[1]];
    if (!ext) throw new Error(`unsupported image type: ${match[1]}`);
    const safeName = path.basename(String(body.name || '')).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) throw new Error('name is required');
    await mkdir(TEXTURES_DIR, { recursive: true });
    const filePath = path.join(TEXTURES_DIR, safeName + ext);
    await writeFile(filePath, Buffer.from(match[2], 'base64'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: path.relative(ROOT, filePath).replace(/\\/g, '/') }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

http
  .createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/save-texture') {
      await handleSaveTexture(req, res);
      return;
    }
    try {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? '/voxel.html' : urlPath);
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(PORT, () => console.log(`iso3d-engine serving on http://localhost:${PORT}/`));
