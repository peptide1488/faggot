/**
 * Load terrain PNGs and sample pixel colors for mesh painting.
 * Paths are relative to the Grimoire app root (same origin as index.html).
 *
 * Art direction: Final Fantasy Tactics / Ogre Battle soft painted tiles
 * (tools/process_fft_pack.py). Not voxel Minecraft atlas.
 */

/**
 * Grimoire tile key → TOP-face texture PNG (128×128 FFT-style).
 */
// ?v= cache-bust after PixelLab 32→128 terrain regen
const _TV = 'v122';
export const TERRAIN_TEX_URLS = {
  grass: `sprites/hq/terrain/grass.png?${_TV}`,
  brush: `sprites/hq/terrain/grass.png?${_TV}`,
  wood: `sprites/hq/terrain/wood.png?${_TV}`,
  floor: `sprites/hq/terrain/wood.png?${_TV}`,
  stone: `sprites/hq/terrain/stone.png?${_TV}`,
  wall: `sprites/hq/terrain/brick_top.png?${_TV}`,
  cave_wall: `sprites/hq/terrain/cave_top.png?${_TV}`,
  low_wall: `sprites/hq/terrain/brick_top.png?${_TV}`,
  window: null, // no texture — rendered as a plain glassy color, see TERRAIN_COLORS override
  sand: `sprites/hq/terrain/sand.png?${_TV}`,
  snow: `sprites/hq/terrain/snow.png?${_TV}`,
  ice: `sprites/hq/terrain/snow.png?${_TV}`,
  mud: `sprites/hq/terrain/mud.png?${_TV}`,
  rubble: `sprites/hq/terrain/stone.png?${_TV}`,
  dirt: `sprites/hq/terrain/dirt.png?${_TV}`,
  water: `sprites/hq/terrain/water.png?${_TV}`,
  lava: 'sprites/terrain/lava_sheet.png',
  void: null,
  pit: null,
  fog: `sprites/hq/terrain/stone.png?${_TV}`,
  acid: `sprites/hq/terrain/mud.png?${_TV}`,
  grease: `sprites/hq/terrain/mud.png?${_TV}`,
  web: `sprites/hq/terrain/stone.png?${_TV}`,
  caltrops: `sprites/hq/terrain/stone.png?${_TV}`,
};

/**
 * Cliff / bank SIDE faces — when set, used instead of the top texture so grass
 * banks show dirt+grass fringe and walls show brick coursing (matches voxel engine).
 * Keys absent here fall back to TERRAIN_TEX_URLS[key] if the renderer enables sides.
 */
export const TERRAIN_SIDE_TEX_URLS = {
  grass: `sprites/hq/terrain/grass_side.png?${_TV}`,
  brush: `sprites/hq/terrain/grass_side.png?${_TV}`,
  dirt: `sprites/hq/terrain/dirt.png?${_TV}`,
  mud: `sprites/hq/terrain/mud.png?${_TV}`,
  sand: `sprites/hq/terrain/sand.png?${_TV}`,
  stone: `sprites/hq/terrain/stone.png?${_TV}`,
  wood: `sprites/hq/terrain/wood_side.png?${_TV}`,
  floor: `sprites/hq/terrain/wood_side.png?${_TV}`,
  wall: `sprites/hq/terrain/brick.png?${_TV}`,
  low_wall: `sprites/hq/terrain/brick.png?${_TV}`,
  cave_wall: `sprites/hq/terrain/cave_wall.png?${_TV}`,
  rubble: `sprites/hq/terrain/stone.png?${_TV}`,
};

/** How many times the texture repeats across one map tile (higher = finer ground detail). */
export const TEX_TILE_REPEAT = 1;

/**
 * Decor kinds drawn as pure meshes only (never billboards / PNG props).
 * Adapter skips these when building decorSprites; renderer builds solid geometry.
 */
export const MESH_DECOR_KINDS = new Set([
  'door', 'door_open',
  'grate', 'grate_open',
  'trap', 'trap_safe', 'trap2', 'trap3', 'trap_safe2', 'trap_safe3',
  'plank', 'loose_rock',
  'oil_barrel', 'acid_barrel', 'powder_barrel',
  'cauldron', 'cauldron_tipped',
  'crate', 'chest', 'barrel',
  'lever', 'switch',
  'drawbridge', 'drawbridge_down',
  'fence', 'hedge', 'table', 'chair', 'tent',
  'sign', 'sign_post',
]);

/**
 * Wang autotile blends — empty while FFT terrain pack is active (old
 * grass_sand atlas was a different art style and clashed). Re-add entries
 * when a matching FFT blend sheet is authored.
 */
export const WANG_TILESETS = {};

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
    for (const [key, rel] of Object.entries(TERRAIN_SIDE_TEX_URLS)) {
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      jobs.push(this._loadOne(rel));
    }
    for (const wang of Object.values(WANG_TILESETS)) {
      if (seen.has(wang.url)) continue;
      seen.add(wang.url);
      jobs.push(this._loadOne(wang.url));
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
