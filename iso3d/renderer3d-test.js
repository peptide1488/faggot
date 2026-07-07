import assert from 'node:assert';
import { gridToWorld, worldToGrid, getCameraMatrix } from './renderer3d.js';

const EPS = 1e-4;

function approxEqual(a, b) {
  return Math.abs(a - b) < EPS;
}

// --- Grid <-> World Coordinate Tests (with heights) ---

// Center of a 5x5 grid at height 0
assert.deepStrictEqual(gridToWorld(2, 2, 5, 5, 0), { x: 0, y: 0, z: 0 });
assert.deepStrictEqual(worldToGrid(0, 0, 5, 5), { col: 2, row: 2 });

// Corner of a 5x5 grid at height 4
assert.deepStrictEqual(gridToWorld(0, 0, 5, 5, 4), { x: -2, y: 4, z: -2 });
assert.deepStrictEqual(worldToGrid(-2, -2, 5, 5), { col: 0, row: 0 });

// Opposite corner at height 1
assert.deepStrictEqual(gridToWorld(4, 4, 5, 5, 1), { x: 2, y: 1, z: 2 });
assert.deepStrictEqual(worldToGrid(2, 2, 5, 5), { col: 4, row: 4 });

// Even dimensions (4x4) center offset by 0.5, height 3
assert.deepStrictEqual(gridToWorld(1, 1, 4, 4, 3), { x: -0.5, y: 3, z: -0.5 });
assert.deepStrictEqual(worldToGrid(-0.5, -0.5, 4, 4), { col: 1, row: 1 });

// Out of bounds world coordinates return null regardless of height context
assert.strictEqual(worldToGrid(10, 10, 5, 5), null);
assert.strictEqual(worldToGrid(-3, -3, 5, 5), null);

// --- Camera Matrix Tests (all 4 rotation steps) ---

// Identity-like projection at 0 deg rotation, zoom=1, aspect=1, pan=(0,0)
const m0 = getCameraMatrix(0, 1.0, 0, 0, 1);
assert.ok(approxEqual(m0[0], 0.02), 'm0[0] should be 1/50');
assert.ok(approxEqual(m0[5], 0.02), 'm0[5] should be 1/50');
assert.ok(approxEqual(m0[10], -0.02), 'm0[10] should be -1/50');

// 90 deg rotation: X and Z axes swap with sign changes
const m90 = getCameraMatrix(90, 1.0, 0, 0, 1);
assert.ok(approxEqual(m90[2], -0.02), 'm90[2] should be -1/50');
assert.ok(approxEqual(m90[6], -0.02), 'm90[6] should be -1/50');
assert.ok(approxEqual(m90[5], 0.02), 'm90[5] Y scale unchanged');

// 180 deg rotation: X and Z axes flip signs
const m180 = getCameraMatrix(180, 1.0, 0, 0, 1);
assert.ok(approxEqual(m180[0], -0.02), 'm180[0] should be -1/50');
assert.ok(approxEqual(m180[10], 0.02), 'm180[10] should be 1/50');

// 270 deg rotation: X and Z axes swap again
const m270 = getCameraMatrix(270, 1.0, 0, 0, 1);
assert.ok(approxEqual(m270[2], 0.02), 'm270[2] should be 1/50');
assert.ok(approxEqual(m270[6], 0.02), 'm270[6] should be 1/50');

// Pan translation affects matrix translation components (indices 3 and 7)
const mPan = getCameraMatrix(0, 1.0, 10, 20, 1);
assert.ok(approxEqual(mPan[3], 10), 'mPan[3] should reflect camPanX');
assert.ok(approxEqual(mPan[7], 20), 'mPan[7] should reflect camPanY');

// Zoom scaling affects projection scale inversely
const mZoom = getCameraMatrix(0, 2.0, 0, 0, 1);
assert.ok(approxEqual(mZoom[0], 0.01), 'mZoom[0] should be 1/100 (zoom=2)');
assert.ok(approxEqual(mZoom[5], 0.01), 'mZoom[5] should be 1/100 (zoom=2)');

console.log('All renderer3d pure math tests passed!');
