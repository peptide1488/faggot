/**
 * Grid pathfinding for Iso3D maps — aligned with Grimoire's 5e elevation rules:
 * - 1 height level = 5 ft vertical
 * - Running high jump = 3+STR mod ft (≥10 ft run-up along path); standing = half
 * - Climb without climb speed: ×2 movement per vertical foot
 * - Tall unaided climbs blocked
 * - Difficult terrain: 10 ft enter
 */

import { heightAt, isWalkable, moveCost } from './map.js?v=0.6.8';

/**
 * @param {object} map
 * @param {number} sx
 * @param {number} sy
 * @param {number} tx
 * @param {number} ty
 * @param {{
 *   maxCost?: number,
 *   fly?: boolean,
 *   strMod?: number,
 *   climbSpeed?: boolean,
 *   blocked?: (col:number,row:number)=>boolean,
 * }} [opts]
 */
export function findPath(map, sx, sy, tx, ty, opts = {}) {
  const maxCost = opts.maxCost != null ? opts.maxCost : 999;
  const fly = !!opts.fly;
  const strMod = opts.strMod != null ? opts.strMod : 0;
  const climbSpeed = !!opts.climbSpeed;
  const blocked = opts.blocked || (() => false);
  const runJump = Math.max(0, 3 + strMod);
  const standJump = Math.floor(runJump / 2);

  if (sx === tx && sy === ty) return [{ x: sx, y: sy }];
  if (!inBounds(map, sx, sy) || !inBounds(map, tx, ty)) return null;
  if (!fly && !isWalkable(map, tx, ty)) return null;
  if (blocked(tx, ty)) return null;

  const K = (x, y) => `${x},${y}`;
  const cost = new Map();
  const prev = new Map();
  const start = K(sx, sy);
  cost.set(start, 0);
  const frontier = [{ x: sx, y: sy, c: 0 }];

  while (frontier.length) {
    frontier.sort((a, b) => a.c - b.c);
    const cur = frontier.shift();
    if (cur.x === tx && cur.y === ty) break;
    if (cur.c > maxCost) continue;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inBounds(map, nx, ny)) continue;
        if (!fly && !isWalkable(map, nx, ny)) continue;
        if (blocked(nx, ny) && !(nx === tx && ny === ty)) continue;
        if (dx && dy) {
          if (!fly) {
            if (
              !isWalkable(map, cur.x + dx, cur.y) ||
              !isWalkable(map, cur.x, cur.y + dy)
            ) {
              continue;
            }
          }
          if (
            (blocked(cur.x + dx, cur.y) &&
              !(cur.x + dx === tx && cur.y === ty)) ||
            (blocked(cur.x, cur.y + dy) &&
              !(cur.x === tx && cur.y + dy === ty))
          ) {
            continue;
          }
        }

        let step = fly ? 5 : moveCost(map, nx, ny);
        if (!Number.isFinite(step) || step <= 0) step = 5;
        if (!fly) {
          const elev = elevExtra(
            map,
            cur.x,
            cur.y,
            nx,
            ny,
            cur.c >= 10 ? runJump : standJump,
            runJump,
            climbSpeed,
          );
          if (elev == null) continue;
          step += elev;
        }

        const nc = cur.c + step;
        if (nc > maxCost) continue;
        const key = K(nx, ny);
        if (cost.has(key) && cost.get(key) <= nc) continue;
        cost.set(key, nc);
        prev.set(key, K(cur.x, cur.y));
        frontier.push({ x: nx, y: ny, c: nc });
      }
    }
  }

  const end = K(tx, ty);
  if (!cost.has(end)) return null;

  const path = [];
  let cur = end;
  while (cur) {
    const [x, y] = cur.split(',').map(Number);
    path.push({ x, y });
    if (cur === start) break;
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

function elevExtra(map, x, y, nx, ny, jumpFt, runJumpFt, climbSpeed) {
  const dH = heightAt(map, nx, ny) - heightAt(map, x, y);
  if (!dH) return 0;
  const riseFt = dH > 0 ? dH * 5 : 0;
  const dropFt = dH < 0 ? -dH * 5 : 0;
  if (riseFt > 0) {
    if (riseFt <= jumpFt) return riseFt;
    const maxClimb = climbSpeed ? 1e9 : Math.max(20, runJumpFt * 4);
    if (riseFt > maxClimb) return null;
    return climbSpeed ? riseFt : riseFt * 2;
  }
  if (dropFt <= 5) return 0;
  return climbSpeed ? dropFt : dropFt * 2;
}

function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.cols && y < map.rows;
}

/**
 * Canonical 8-direction order, matching a clockwise-from-down rotation sheet
 * (frame 0 = down, 1 = down-left, 2 = left, 3 = up-left, 4 = up, 5 = up-right,
 * 6 = right, 7 = down-right). A sprite's spriteDraw.dirOrder must list all 8 of
 * these strings (in any order) for 8-directional facing to actually show up —
 * 4-direction sprites just never match the diagonal strings and keep working
 * exactly as before (dirOrder.indexOf returns -1 → falls back to row 0).
 */
export const DIR_ORDER_8 = [
  'down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right',
];

/** 8-way facing from a grid step — diagonal movement now shows a diagonal facing
 * instead of snapping to whichever cardinal axis happened to dominate. */
export function facingFromStep(dx, dy) {
  if (!dx && !dy) return null;
  const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; // 0=+x(right), 90=+y(down)
  const buckets = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  return buckets[Math.round(deg / 45) % 8];
}

/** High jump feet (running) for a STR modifier — mirrors Grimoire. */
export function runningHighJumpFt(strMod) {
  return Math.max(0, 3 + (strMod || 0));
}
