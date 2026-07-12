/**
 * Demo bootstrap: renderer + game + terrain editor + UI.
 */

import { APP_VERSION, APP_NAME } from './version.js';
import { Renderer } from './renderer.js';
import { Game, Phase } from './game.js';
import { canUseSpell, hasRangedWeapon } from './units.js';
import {
  TERRAIN,
  TERRAIN_META,
  paintTerrain,
  raiseTile,
  lowerTile,
  flattenTile,
  cloneMap,
  serializeMap,
  deserializeMap,
  buildDemoMap,
  cellAt,
} from './map.js';

const canvas = document.getElementById('gl');
const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const unitEl = document.getElementById('unitInfo');
const rosterEl = document.getElementById('roster');
const editorPanel = document.getElementById('editorPanel');
const editModeBadge = document.getElementById('editModeBadge');
const versionEl = document.getElementById('versionLabel');

function showBootError(err) {
  console.error('[Iso3D boot]', err);
  const msg = err && err.message ? err.message : String(err);
  if (statusEl) {
    statusEl.textContent = 'BOOT ERROR';
    statusEl.className = 'status lose';
  }
  if (unitEl) {
    unitEl.innerHTML = `<div style="color:#e06060;font-size:12px;white-space:pre-wrap">${escapeHtml(msg)}\n\nOpen DevTools (F12) → Console for details.\nHard-refresh: Ctrl+F5</div>`;
  }
  const banner = document.getElementById('bootError');
  if (banner) {
    banner.hidden = false;
    banner.textContent = `v${APP_VERSION} error: ${msg}`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** @type {Renderer} */
let renderer;
/** @type {Game} */
let game;

/** @type {{ enabled: boolean, tool: string, terrain: number, painting: boolean, undo: object[], lastPaintKey: string|null }} */
const editor = {
  enabled: false,
  tool: 'paint',
  terrain: TERRAIN.GRASS,
  painting: false,
  undo: [],
  lastPaintKey: null,
};

function pushUndo() {
  editor.undo.push(cloneMap(game.map));
  if (editor.undo.length > 40) editor.undo.shift();
}

function undoEdit() {
  if (!editor.undo.length) return;
  game.map = editor.undo.pop();
  renderer.setMap(game.map);
  renderer.invalidateMap();
  refreshHighlights();
}

function applyEdit(col, row) {
  const key = `${col},${row}`;
  if (editor.painting && editor.lastPaintKey === key) return;
  editor.lastPaintKey = key;

  let changed = false;
  if (editor.tool === 'paint') {
    changed = paintTerrain(game.map, col, row, editor.terrain);
  } else if (editor.tool === 'raise') {
    changed = raiseTile(game.map, col, row);
  } else if (editor.tool === 'lower') {
    changed = lowerTile(game.map, col, row);
  } else if (editor.tool === 'flatten') {
    changed = flattenTile(game.map, col, row);
  }
  if (changed) {
    renderer.setMap(game.map);
    renderer.invalidateMap();
  }
}

function setEditMode(on) {
  editor.enabled = on;
  document.body.classList.toggle('edit-mode', on);
  if (editorPanel) editorPanel.hidden = !on;
  if (editModeBadge) editModeBadge.hidden = !on;
  if (on) {
    game.mode = 'idle';
    game.moveRange = new Set();
    game.attackTiles = new Set();
    game.healTiles = new Set();
  }
  syncEditorUI();
  refreshHighlights();
  renderUI();
}

function syncEditorUI() {
  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === editor.tool);
  });
  document.querySelectorAll('[data-terrain]').forEach((btn) => {
    btn.classList.toggle(
      'active',
      Number(btn.dataset.terrain) === editor.terrain,
    );
  });
  const toolLabel = document.getElementById('editorToolLabel');
  if (toolLabel) {
    const tName =
      TERRAIN_META.find((t) => t.id === editor.terrain)?.name || '';
    toolLabel.textContent =
      editor.tool === 'paint'
        ? `Paint: ${tName}`
        : editor.tool.charAt(0).toUpperCase() + editor.tool.slice(1);
  }
}

function refreshHighlights() {
  if (!renderer || !game) return;
  const v = game.view();
  renderer.setMap(v.map);
  renderer.setUnits(editor.enabled ? [] : v.units);
  renderer.setHighlights({
    move: !editor.enabled && v.mode === 'move' ? v.moveRange : null,
    attack: !editor.enabled && v.mode === 'attack' ? v.attackTiles : null,
    heal: !editor.enabled && v.mode === 'heal' ? v.healTiles : null,
    selected: editor.enabled ? null : v.selected,
    hover: window.__hover || null,
    editHover: editor.enabled ? window.__hover || null : null,
    activeUnitId: editor.enabled ? null : v.current?.id ?? null,
  });
}

function renderUI() {
  if (!game) return;
  const v = game.view();
  const cur = v.current;

  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;
  const vin = document.getElementById('versionInline');
  if (vin) vin.textContent = `v${APP_VERSION}`;

  if (editor.enabled) {
    if (statusEl) {
      statusEl.textContent = 'TERRAIN EDITOR';
      statusEl.className = 'status edit';
    }
    if (unitEl) {
      unitEl.innerHTML = `<div class="hint">Click / drag to sculpt. <kbd>E</kbd> battle · <kbd>Z</kbd> undo</div>`;
    }
  } else if (v.phase === Phase.WON) {
    if (statusEl) {
      statusEl.textContent = 'VICTORY';
      statusEl.className = 'status win';
    }
  } else if (v.phase === Phase.LOST) {
    if (statusEl) {
      statusEl.textContent = 'DEFEAT';
      statusEl.className = 'status lose';
    }
  } else if (statusEl) {
    statusEl.textContent = `Round ${v.round} · ${cur ? cur.label : '—'} (${cur?.team || ''})`;
    statusEl.className = 'status';
  }

  if (!editor.enabled && cur && unitEl) {
    const weapons = [cur.weaponName, cur.rangedName].filter(Boolean).join(' · ');
    const spells = cur.spells
      .map((s) => `${s.name} (${s.remaining === Infinity ? '∞' : s.remaining})`)
      .join(', ');
    unitEl.innerHTML = `
      <div><strong>${cur.label}</strong> · ${cur.archetype}</div>
      <div>HP ${cur.hp}/${cur.maxHp} · AC ${cur.ac}</div>
      <div class="muted">${weapons}${spells ? ` · ${spells}` : ''}</div>
      <div>Moved: ${cur.hasMoved ? 'yes' : 'no'} · Acted: ${cur.hasActed ? 'yes' : 'no'}</div>
      <div class="hint">${v.isPlayerTurn ? `Mode: ${v.mode}` : 'Enemy turn…'}</div>
    `;
  } else if (!editor.enabled && unitEl && !cur) {
    unitEl.textContent = '';
  }

  if (rosterEl) {
    rosterEl.innerHTML = v.units
      .map((u) => {
        const dead = !u.alive ? ' dead' : '';
        const active = cur && u.id === cur.id ? ' active' : '';
        const team = u.team === 'player' ? 'ally' : 'foe';
        return `<div class="roster-item ${team}${dead}${active}" title="${u.label}">
          <span class="dot"></span>
          <span class="name">${escapeHtml(u.label)}</span>
          <span class="hp">${u.alive ? `${u.hp}/${u.maxHp}` : 'KO'}</span>
        </div>`;
      })
      .join('');
  }

  const playerTurn = v.isPlayerTurn && !editor.enabled;
  const setDis = (id, d) => {
    const el = document.getElementById(id);
    if (el) el.disabled = d;
  };
  setDis('btnMove', !playerTurn || !!cur?.hasMoved);
  setDis('btnAttack', !playerTurn || !!cur?.hasActed);
  setDis(
    'btnHeal',
    !playerTurn || !cur || cur.hasActed || !canUseSpell(cur, 'cure_wounds'),
  );
  setDis('btnWait', !playerTurn);
  setDis('btnEnd', !playerTurn);

  const atkBtn = document.getElementById('btnAttack');
  if (atkBtn && cur) {
    if (hasRangedWeapon(cur)) atkBtn.title = `Melee or ${cur.rangedName}`;
    else if (canUseSpell(cur, 'fire_bolt')) atkBtn.title = 'Melee or Fire Bolt';
    else atkBtn.title = 'Melee attack';
  }

  const inspect = document.getElementById('tileInspect');
  if (inspect && window.__hover && game.map) {
    const c = cellAt(game.map, window.__hover.col, window.__hover.row);
    const name = TERRAIN_META.find((t) => t.id === c?.type)?.name || '?';
    inspect.textContent = c
      ? `(${window.__hover.col}, ${window.__hover.row}) ${name}  h=${c.h}`
      : '';
  } else if (inspect) {
    inspect.textContent = '';
  }

  if (logEl) {
    logEl.innerHTML = v.log
      .slice()
      .reverse()
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
  }
}

function afterAction() {
  if (!game) return;
  if (!editor.enabled) game.flushEnemyTurns();
  refreshHighlights();
  renderUI();
}

function wireUI() {
  document.getElementById('btnRotate')?.addEventListener('click', () => {
    renderer.rotate(1);
  });
  document.getElementById('btnMove')?.addEventListener('click', () => {
    if (editor.enabled) return;
    game.enterMoveMode();
    refreshHighlights();
    renderUI();
  });
  document.getElementById('btnAttack')?.addEventListener('click', () => {
    if (editor.enabled) return;
    game.enterAttackMode();
    refreshHighlights();
    renderUI();
  });
  document.getElementById('btnHeal')?.addEventListener('click', () => {
    if (editor.enabled) return;
    game.enterHealMode();
    refreshHighlights();
    renderUI();
  });
  document.getElementById('btnWait')?.addEventListener('click', () => {
    if (editor.enabled) return;
    game.wait();
    afterAction();
  });
  document.getElementById('btnEnd')?.addEventListener('click', () => {
    if (editor.enabled) return;
    const u = game.current();
    if (u) {
      u.hasMoved = true;
      u.hasActed = true;
    }
    game.endTurn();
    afterAction();
  });
  document.getElementById('btnRestart')?.addEventListener('click', () => {
    game = new Game();
    editor.undo = [];
    afterAction();
  });
  document.getElementById('btnEdit')?.addEventListener('click', () => {
    setEditMode(!editor.enabled);
  });

  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editor.tool = btn.dataset.tool;
      syncEditorUI();
    });
  });
  document.querySelectorAll('[data-terrain]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editor.terrain = Number(btn.dataset.terrain);
      editor.tool = 'paint';
      syncEditorUI();
    });
  });
  document.getElementById('btnUndo')?.addEventListener('click', () => undoEdit());
  document.getElementById('btnResetMap')?.addEventListener('click', () => {
    pushUndo();
    game.map = buildDemoMap(12, 12);
    renderer.setMap(game.map);
    renderer.invalidateMap();
    refreshHighlights();
  });
  document.getElementById('btnExportMap')?.addEventListener('click', () => {
    const json = serializeMap(game.map);
    navigator.clipboard?.writeText(json).then(
      () => {
        game.pushLog('Map JSON copied to clipboard.');
        renderUI();
      },
      () => prompt('Map JSON:', json),
    );
  });
  document.getElementById('btnImportMap')?.addEventListener('click', () => {
    const raw = prompt('Paste map JSON:');
    if (!raw) return;
    try {
      pushUndo();
      game.map = deserializeMap(raw);
      renderer.setMap(game.map);
      renderer.invalidateMap();
      game.pushLog('Map imported.');
      refreshHighlights();
      renderUI();
    } catch {
      alert('Invalid map JSON.');
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const cam = renderer.getCamera();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      renderer.setCamera({ zoom: cam.zoom + delta });
    },
    { passive: false },
  );

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  let panOnly = false;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    panOnly = e.shiftKey;

    if (editor.enabled && !panOnly) {
      const tile = renderer.pickTile(e.clientX, e.clientY);
      if (tile) {
        pushUndo();
        editor.painting = true;
        editor.lastPaintKey = null;
        applyEdit(tile.col, tile.row);
        refreshHighlights();
        renderUI();
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    const wasPainting = editor.painting;
    dragging = false;
    editor.painting = false;
    editor.lastPaintKey = null;

    if (!wasPainting && !moved && e.button === 0 && !editor.enabled) {
      const tile = renderer.pickTile(e.clientX, e.clientY);
      if (tile) {
        game.handleTileClick(tile.col, tile.row);
        afterAction();
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!renderer) return;
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;

      if (editor.enabled && editor.painting && !panOnly) {
        const tile = renderer.pickTile(e.clientX, e.clientY);
        if (tile) applyEdit(tile.col, tile.row);
        lastX = e.clientX;
        lastY = e.clientY;
      } else {
        lastX = e.clientX;
        lastY = e.clientY;
        const cam = renderer.getCamera();
        const scale = 0.02 / cam.zoom;
        const cos = Math.cos(cam.rot);
        const sin = Math.sin(cam.rot);
        renderer.setCamera({
          panX: cam.panX + (-dx * cos - dy * sin) * scale,
          panY: cam.panY + (dx * sin - dy * cos) * scale,
        });
      }
    }

    window.__hover = renderer.pickTile(e.clientX, e.clientY);
    refreshHighlights();
    if (editor.enabled) renderUI();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();

    if (k === 'e') {
      setEditMode(!editor.enabled);
      return;
    }
    if (k === 'z' && (e.ctrlKey || e.metaKey || editor.enabled)) {
      e.preventDefault();
      undoEdit();
      return;
    }

    if (editor.enabled) {
      if (k === '1') {
        editor.terrain = TERRAIN.GRASS;
        editor.tool = 'paint';
        syncEditorUI();
      } else if (k === '2') {
        editor.terrain = TERRAIN.DIRT;
        editor.tool = 'paint';
        syncEditorUI();
      } else if (k === '3') {
        editor.terrain = TERRAIN.WATER;
        editor.tool = 'paint';
        syncEditorUI();
      } else if (k === '4') {
        editor.terrain = TERRAIN.CLIFF;
        editor.tool = 'paint';
        syncEditorUI();
      } else if (k === '[') {
        editor.tool = 'lower';
        syncEditorUI();
      } else if (k === ']') {
        editor.tool = 'raise';
        syncEditorUI();
      } else if (k === 'r') {
        renderer.rotate(1);
      }
      return;
    }

    if (k === 'm') {
      game.enterMoveMode();
      refreshHighlights();
      renderUI();
    } else if (k === 'a') {
      game.enterAttackMode();
      refreshHighlights();
      renderUI();
    } else if (k === 'h') {
      game.enterHealMode();
      refreshHighlights();
      renderUI();
    } else if (k === 'w' || k === ' ') {
      e.preventDefault();
      game.wait();
      afterAction();
    } else if (k === 'r') {
      renderer.rotate(1);
    } else if (k === 'n') {
      game = new Game();
      editor.undo = [];
      afterAction();
    }
  });
}

function frame() {
  try {
    if (renderer && game) {
      if (!editor.enabled) {
        renderer.setUnits(game.units);
        renderer.setActiveUnitId(game.current()?.id ?? null);
      }
      renderer.draw();
    }
  } catch (err) {
    console.error('[Iso3D frame]', err);
  }
  requestAnimationFrame(frame);
}

function boot() {
  try {
    document.title = `${APP_NAME} v${APP_VERSION}`;
    if (versionEl) versionEl.textContent = `v${APP_VERSION}`;
    if (statusEl) statusEl.textContent = 'Starting…';

    if (!canvas) throw new Error('Missing #gl canvas element');

    // Ensure layout has non-zero size before WebGL buffer alloc
    if (!canvas.clientWidth || !canvas.clientHeight) {
      canvas.width = window.innerWidth || 800;
      canvas.height = window.innerHeight || 600;
    }

    renderer = new Renderer(canvas);
    game = new Game();
    wireUI();
    syncEditorUI();
    afterAction();
    requestAnimationFrame(frame);

    console.log(`${APP_NAME} v${APP_VERSION} ready`);
  } catch (err) {
    showBootError(err);
  }
}

// Surface module-load failures (import errors show as black + Loading otherwise)
window.addEventListener('error', (e) => {
  if (statusEl && statusEl.textContent.includes('Loading')) {
    showBootError(e.error || e.message);
  }
});
window.addEventListener('unhandledrejection', (e) => {
  showBootError(e.reason || 'Unhandled promise rejection');
});

boot();
