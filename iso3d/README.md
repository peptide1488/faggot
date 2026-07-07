# Iso3D Engine

A from-scratch, vanilla WebGL2 isometric tile/token renderer, built as a real 3D
replacement for `dnd-character`'s existing 2D canvas battle-map renderer
(`iso-renderer.js`). No libraries, no build step, no framework -- one JS module
and one demo page.

## File layout

- `demo.html` -- standalone test harness page (fullscreen canvas + basic UI:
  rotate button, current-rotation readout, click-to-pick feedback).
- `renderer3d.js` -- the entire engine: WebGL2 setup, shaders, camera math,
  tile/token geometry, ray-cast picking.
- `renderer3d-test.js` -- headless Node tests for the pure math (coordinate
  conversion + camera matrix), no browser/WebGL context required.

## Public API (`renderer3d.js`)

- `init(canvasEl)` -- entry point. Compiles shaders, sets up the WebGL2
  context and orthographic isometric camera on the given canvas.
- `setMap(cols, rows, heights, palette)` -- defines the tile grid. `heights`
  is a flat `cols*rows` array (0-4); tiles with height > 0 get simple box
  side-walls down to the ground so elevation reads visually. `palette` maps
  a terrain-type int to an RGB color (falls back to a built-in grass-tone
  ramp by height if omitted).
- `setTokens(tokens)` -- `tokens: [{x, z, color, label}]`. Renders a simple
  3D marker per token, sitting on top of that grid cell's tile height.
- `rotate(step)` -- steps the camera by 90 degrees (4 fixed yaw angles).
- `setZoom(z)` / `setPan(x, y)` -- camera zoom and pan (wired to scroll/drag
  in `demo.html`).
- `getCamState()` -- current `{rot, zoom, panX, panY}`.
- `pickTile(screenX, screenY)` -- real ray-cast (not a flat-plane
  approximation) from a screen-space click through the current
  view/projection matrices to the grid cell actually under the cursor,
  correctly accounting for elevated tiles.
- `selectTile(c, r)` -- marks a cell selected/highlighted for the next paint.
- `gridToWorld(col, row, cols, rows, height)` / `worldToGrid(x, z, cols, rows)`
  -- the pure coordinate-conversion math, exported standalone so it's testable
  headlessly (see `renderer3d-test.js`).
- `getCameraMatrix(camRot, camZoom, camPanX, camPanY, aspect)` -- builds the
  camera's projection*rotation*translation matrix; also exported standalone
  for the same headless-testing reason.

## What's actually built vs. still missing

**Built and tested:** tile grid with elevation, 4-step camera rotation +
zoom/pan, token rendering, accurate ray-cast picking, a passing headless
math test suite (8 assertions, coordinate conversion + all 4 rotation
matrices + pan/zoom scaling).

**Still needed before this could replace `iso-renderer.js` in Grimoire:**
- The same `data-cols/rows/rot/tiles/height/palette` contract that
  `mapGridHTML` already hands to the 2D renderer via a `<canvas
  class="isocanvas">` tag + `MutationObserver` -- this engine currently
  exposes a JS function API (`setMap`/`setTokens`), not that data-attribute
  contract, so it isn't a drop-in swap yet.
- Sprite/texture support -- tokens and terrain are flat colors right now,
  no image assets.
- Performance validation at Grimoire's actual map sizes (its presets got
  roughly doubled in v120; this has only been tried on a 10x10 demo grid).
- No integration with the `Events` bus (`window.GrimoireEvents`) that the
  rest of Grimoire's combat system already emits `attack`/`death`/`move`/
  `cast` through -- this renderer doesn't listen to or react to anything yet,
  it's a standalone visual demo.
- No terrain type variety beyond height-based coloring (walls/water/lava/etc.
  as distinct types, matching `TERRAIN` in `index.html`, aren't modeled).
- 5e rules integration was deliberately out of scope for this build (by
  design -- this pass was graphics-only, rules come later).
