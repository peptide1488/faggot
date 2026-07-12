/**
 * Load RPG Paper Maker terrain PNGs and sample pixel colors for mesh painting.
 * Paths are relative to the Grimoire app root (same origin as index.html).
 */

/**
 * Grimoire tile key → ground texture PNG.
 * Prefer seamless 128×128 HQ pixel tiles (see tools/gen_hq_terrain.py).
 */
export const TERRAIN_TEX_URLS = {
  grass: 'sprites/hq/terrain/grass.png',
  brush: 'sprites/hq/terrain/grass.png',
  wood: 'sprites/hq/terrain/wood.png',
  floor: 'sprites/hq/terrain/wood.png',
  stone: 'sprites/hq/terrain/stone.png',
  wall: 'sprites/hq/terrain/brick.png',
  cave_wall: 'sprites/hq/terrain/cave_wall.png',
  low_wall: 'sprites/hq/terrain/brick.png',
  window: null, // no texture — rendered as a plain glassy color, see TERRAIN_COLORS override
  sand: 'sprites/hq/terrain/sand.png',
  snow: 'sprites/hq/terrain/snow.png',
  ice: 'sprites/hq/terrain/snow.png',
  mud: 'sprites/hq/terrain/mud.png',
  rubble: 'sprites/hq/terrain/stone.png',
  dirt: 'sprites/hq/terrain/dirt.png',
  water: 'sprites/hq/terrain/water.png',
  lava: 'sprites/terrain/lava_sheet.png',
  void: null,
  pit: null,
  fog: 'sprites/hq/terrain/stone.png',
  acid: 'sprites/hq/terrain/mud.png',
  grease: 'sprites/hq/terrain/mud.png',
  web: 'sprites/hq/terrain/stone.png',
  caltrops: 'sprites/hq/terrain/stone.png',
};

/** How many times the texture repeats across one map tile (higher = finer ground detail). */
export const TEX_TILE_REPEAT = 1;

/**
 * Non-terrain textures the renderer GPU-uploads the same way as ground (real per-pixel
 * sampling, not billboards) — currently just the door, built as a wall-oriented 3D quad
 * in buildMapMesh instead of a camera-facing sprite.
 */
export const DECOR_TEX_URLS = {
  door: 'sprites/decor/door.png',
  door_open: 'sprites/decor/door_open.png',
};

/**
 * Wang (corner-based) autotile sets for smooth terrain-pair transitions (grass<->sand etc.),
 * generated via PixelLab's create_topdown_tileset. Each tile's corners are 0 (lower/first
 * terrain) or 1 (upper/second terrain); `x,y,w,h` locate it within the combined atlas image.
 * Rendered as a "dual grid": one quad per map VERTEX (not per cell), sampling the 4 cells
 * touching that vertex as the tile's NW/NE/SW/SE corners — see buildMapMesh in renderer.js.
 */
export const WANG_TILESETS = {
  grass_sand: {
    lower: 'grass',
    upper: 'sand',
    url: 'sprites/hq/terrain/wang/grass_sand.png',
    atlasW: 128,
    atlasH: 128,
    tiles: [
      { nw: 1, ne: 1, sw: 0, se: 1, x: 0, y: 0, w: 32, h: 32 },
      { nw: 1, ne: 0, sw: 1, se: 0, x: 32, y: 0, w: 32, h: 32 },
      { nw: 0, ne: 1, sw: 0, se: 0, x: 64, y: 0, w: 32, h: 32 },
      { nw: 1, ne: 1, sw: 0, se: 0, x: 96, y: 0, w: 32, h: 32 },
      { nw: 0, ne: 1, sw: 1, se: 0, x: 0, y: 32, w: 32, h: 32 },
      { nw: 1, ne: 0, sw: 0, se: 0, x: 32, y: 32, w: 32, h: 32 },
      { nw: 0, ne: 0, sw: 0, se: 0, x: 64, y: 32, w: 32, h: 32 },
      { nw: 0, ne: 0, sw: 0, se: 1, x: 96, y: 32, w: 32, h: 32 },
      { nw: 1, ne: 0, sw: 1, se: 1, x: 0, y: 64, w: 32, h: 32 },
      { nw: 0, ne: 0, sw: 1, se: 1, x: 32, y: 64, w: 32, h: 32 },
      { nw: 0, ne: 0, sw: 1, se: 0, x: 64, y: 64, w: 32, h: 32 },
      { nw: 0, ne: 1, sw: 0, se: 1, x: 96, y: 64, w: 32, h: 32 },
      { nw: 1, ne: 1, sw: 1, se: 1, x: 0, y: 96, w: 32, h: 32 },
      { nw: 1, ne: 1, sw: 1, se: 0, x: 32, y: 96, w: 32, h: 32 },
      { nw: 1, ne: 0, sw: 0, se: 1, x: 64, y: 96, w: 32, h: 32 },
      { nw: 0, ne: 1, sw: 1, se: 1, x: 96, y: 96, w: 32, h: 32 },
    ],
  },
};

/**
 * @typedef {{ w:number, h:number, data:Uint8ClampedArray }} TexMap
 */

export class TerrainSampler {
  constructor(assetBase = '') {
    this.assetBase = assetBase || '';
    /** @type {Record<string, TexMap>} */
    this.maps = {};
    /** @type {Record<string, HTMLImageElement>} raw decoded images, for real GPU texture upload */
    this.images = {};
    this.loading = false;
    this.ready = false;
    this._onReady = [];
  }

  onReady(fn) {
    if (this.ready) fn();
    else this._onReady.push(fn);
  }

  /**
   * Kick off loads (idempotent). Resolves when all attempted.
   * @returns {Promise<void>}
   */
  loadAll() {
    if (this.ready) return Promise.resolve();
    if (this.loading) {
      return new Promise((res) => this.onReady(res));
    }
    this.loading = true;
    const jobs = [];
    const seen = new Set();
    for (const [key, rel] of Object.entries(TERRAIN_TEX_URLS)) {
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      jobs.push(this._loadOne(rel));
    }
    for (const wang of Object.values(WANG_TILESETS)) {
      if (seen.has(wang.url)) continue;
      seen.add(wang.url);
      jobs.push(this._loadOne(wang.url));
    }
    for (const rel of Object.values(DECOR_TEX_URLS)) {
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      jobs.push(this._loadOne(rel));
    }
    return Promise.all(jobs).then(() => {
      this.ready = true;
      this.loading = false;
      for (const fn of this._onReady.splice(0)) {
        try {
          fn();
        } catch (e) {
          /* ignore */
        }
      }
    });
  }

  _url(rel) {
    if (!rel) return rel;
    if (/^https?:\/\//i.test(rel) || rel.startsWith('/')) return rel;
    if (!this.assetBase) return rel;
    return this.assetBase.replace(/\/?$/, '/') + rel.replace(/^\//, '');
  }

  _loadOne(rel) {
    const url = this._url(rel);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, c.width, c.height);
          this.maps[rel] = { w: c.width, h: c.height, data: id.data };
          // Keep the raw decoded Image too so the renderer can upload it as a real GPU
          // texture (per-pixel GPU sampling) instead of only CPU-side color approximation.
          this.images[rel] = img;
        } catch (e) {
          console.warn('[TerrainSampler] decode failed', rel, e);
        }
        resolve();
      };
      img.onerror = () => {
        console.warn('[TerrainSampler] missing', url);
        resolve();
      };
      img.src = url;
    });
  }

  /**
   * Sample RGB 0..1 for a grimoire terrain key at local UV (0..1 within tile).
   * Uses nearest-neighbor so 128×128 HQ tiles stay crisp when the mesh is subdivided.
   * @param {string} gKey
   * @param {number} u 0..1 local, or world-scaled from caller
   * @param {number} v
   * @returns {[number,number,number]|null}
   */
  sample(gKey, u, v) {
    const rel = TERRAIN_TEX_URLS[gKey] || TERRAIN_TEX_URLS.grass;
    if (!rel) return null;
    const m = this.maps[rel];
    if (!m) return null;
    // Nearest texel — do not blend (pixel-art ground)
    let x = Math.floor(u * m.w) % m.w;
    let y = Math.floor(v * m.h) % m.h;
    if (x < 0) x += m.w;
    if (y < 0) y += m.h;
    const i = (y * m.w + x) * 4;
    const a = m.data[i + 3];
    if (a < 16) return null;
    return [m.data[i] / 255, m.data[i + 1] / 255, m.data[i + 2] / 255];
  }

  /**
   * Multi-sample within a sub-cell for slightly richer color without bilinear blur.
   * Averages a few nearest texels so 128px maps still read when TEX_SUB is high.
   */
  sampleAvg(gKey, u, v, radius = 0) {
    if (radius <= 0) return this.sample(gKey, u, v);
    const rel = TERRAIN_TEX_URLS[gKey] || TERRAIN_TEX_URLS.grass;
    if (!rel) return null;
    const m = this.maps[rel];
    if (!m) return null;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    const step = 1 / Math.max(m.w, m.h);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const s = this.sample(gKey, u + dx * step, v + dy * step);
        if (!s) continue;
        r += s[0];
        g += s[1];
        b += s[2];
        n++;
      }
    }
    if (!n) return null;
    return [r / n, g / n, b / n];
  }
}
