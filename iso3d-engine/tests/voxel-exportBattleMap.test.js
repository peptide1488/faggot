/**
 * voxel → Grimoire/Iso3D battle map bake
 */
import { VoxelStore } from '../src/voxel/store.js';
import { BillboardStore } from '../src/voxel/billboards.js';
import {
  voxelToGrimoireMap,
  voxelTypeToGrimoireTile,
  grimoireSessionFromBattleMap,
  sanitizeForGrimoire,
} from '../src/voxel/exportBattleMap.js';
import { grimoireMapToIso } from '../src/adapter.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

console.log('voxelTypeToGrimoireTile');
{
  assert(voxelTypeToGrimoireTile('grass') === 'grass', 'grass');
  assert(voxelTypeToGrimoireTile('cliff') === 'stone', 'cliff → stone (walkable top)');
  assert(voxelTypeToGrimoireTile('dungeon_wall') === 'wall', 'dungeon wall');
  assert(voxelTypeToGrimoireTile('water') === 'water', 'water');
  assert(voxelTypeToGrimoireTile('planks') === 'wood', 'planks → wood');
}

console.log('voxelToGrimoireMap — flat grass field');
{
  const store = new VoxelStore();
  // 4x4 grass platform at z=0
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      store.set(c, r, 0, 'grass');
    }
  }
  const gMap = voxelToGrimoireMap(store, { cols: 4, rows: 4, originC: 0, originR: 0 });
  assert(gMap.cols === 4 && gMap.rows === 4, 'size');
  assert(gMap.tiles['0,0'] === 'grass', 'grass tile');
  assert(gMap.height['0,0'] === 0, 'relative height 0 on flat field');
  assert(gMap.stats.walkable === 16, 'all walkable');
  assert(gMap.source === 'voxel', 'source tag');

  // Adapter must accept it
  const { map } = grimoireMapToIso(gMap);
  assert(map.cols === 4 && map.rows === 4, 'iso map size');
  assert(map.cells[0].h === 0, 'iso height 0');
}

console.log('voxelToGrimoireMap — raised cliff + water + billboard decor');
{
  const store = new VoxelStore();
  // Ground grass at z=1
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      store.set(c, r, 1, 'grass');
    }
  }
  // Pond
  store.remove(1, 1, 1);
  store.set(1, 1, 0, 'water');
  store.remove(2, 1, 1);
  store.set(2, 1, 0, 'water');

  // Cliff stack (walkable top)
  for (let z = 1; z <= 4; z++) store.set(4, 3, z, 'cliff');
  store.set(4, 3, 4, 'cliff'); // top

  const bbs = new BillboardStore();
  bbs.set(0, 0, 2, 'tree');
  bbs.set(5, 5, 2, 'bush_custom');

  const gMap = voxelToGrimoireMap(store, {
    cols: 6,
    rows: 6,
    originC: 0,
    originR: 0,
    billboardStore: bbs,
    billboardTypes: {
      tree: { id: 'tree', name: 'Oak' },
      bush_custom: { id: 'bush_custom', name: 'Wild Bush' },
    },
  });

  assert(gMap.tiles['1,1'] === 'water' || gMap.stats.water >= 1, 'water present');
  // Cliff top should be walkable stone, elevated
  assert(gMap.tiles['4,3'] === 'stone' || gMap.tiles['4,3'] === 'cliff' || gMap.tiles['4,3'] === 'wall',
    `cliff column classified (got ${gMap.tiles['4,3']})`);
  assert(gMap.height['4,3'] > gMap.height['0,0'], 'cliff higher than grass floor');
  assert(gMap.decor['0,0'] === 'tree', 'tree decor exported');
  assert(gMap.decor['5,5'] === 'bush', 'bush name maps to bush decor');

  const { map } = grimoireMapToIso(gMap);
  const cliffCell = map.cells[3 * 6 + 4];
  const grassCell = map.cells[0 * 6 + 0];
  assert(cliffCell.h > grassCell.h, 'iso cliff taller than grass');
}

console.log('grimoireSessionFromBattleMap places units on walkable tiles');
{
  const store = new VoxelStore();
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) store.set(c, r, 0, 'grass');
  }
  const gMap = voxelToGrimoireMap(store, { cols: 5, rows: 5 });
  const session = grimoireSessionFromBattleMap(gMap);
  assert(session.players.length === 2, '2 PCs');
  assert(session.monsters.length === 2, '2 monsters');
  assert(session.map.cols === 5, 'map attached');
  const t = session.map.tiles[`${session.players[0].x},${session.players[0].y}`];
  assert(t && t !== 'water' && t !== 'wall', 'PC on walkable tile');
}

console.log('sanitizeForGrimoire — dirt→mud, clamp size');
{
  const raw = {
    cols: 100, rows: 100,
    tiles: { '0,0': 'dirt', '1,0': 'not_a_tile', '2,0': 'cliff' },
    height: { '0,0': 9 },
    decor: { '0,0': 'tree', '1,0': 'custom_unknown' },
    name: 'test',
    source: 'voxel',
  };
  const c = sanitizeForGrimoire(raw);
  assert(c.cols === 40 && c.rows === 40, 'clamped to 40');
  assert(c.tiles['0,0'] === 'mud', 'dirt → mud');
  assert(c.tiles['1,0'] === 'grass', 'unknown → grass');
  assert(c.height['0,0'] === 6, 'height clamped to 6');
  assert(c.decor['0,0'] === 'tree', 'tree kept');
  assert(!c.decor['1,0'], 'unknown decor dropped');
}

console.log('ok — exportBattleMap tests passed');
