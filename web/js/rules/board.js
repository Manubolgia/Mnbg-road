// Board geometry and placement legality.

import { NONE, ROAD, RAIL, TILES, orient, distinctOrientations } from './tiles.js';

export const SIZE = 7;
export const CELLS = SIZE * SIZE;

// N, E, S, W
export const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
export const OPP = [2, 3, 0, 1];

// Three gateways per side, on the second, fourth and sixth square.
// Top and bottom: road / rail / road. Left and right: rail / road / rail.
const TB = { 1: ROAD, 3: RAIL, 5: ROAD };
const LR = { 1: RAIL, 3: ROAD, 5: RAIL };

export const GATEWAYS = (() => {
  const list = [];
  for (const c of [1, 3, 5]) {
    list.push({ id: `N${c}`, r: 0, c, dir: 0, type: TB[c] });
    list.push({ id: `S${c}`, r: SIZE - 1, c, dir: 2, type: TB[c] });
  }
  for (const r of [1, 3, 5]) {
    list.push({ id: `W${r}`, r, c: 0, dir: 3, type: LR[r] });
    list.push({ id: `E${r}`, r, c: SIZE - 1, dir: 1, type: LR[r] });
  }
  return list;
})();

const GATEWAY_BY_SIDE = new Map(GATEWAYS.map((g) => [`${g.r},${g.c},${g.dir}`, g]));

/** Gateway sitting on the given side of the given square, or null. */
export function gatewayAt(r, c, dir) {
  return GATEWAY_BY_SIDE.get(`${r},${c},${dir}`) || null;
}

export function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function idx(r, c) {
  return r * SIZE + c;
}

export function isCentral(r, c) {
  return r >= 2 && r <= 4 && c >= 2 && c <= 4;
}

export function createBoard() {
  return new Array(CELLS).fill(null);
}

export function cloneBoard(board) {
  return board.slice();
}

/** Resolved shape of a placed square, or null when empty. */
export function shapeAt(board, r, c) {
  if (!inBounds(r, c)) return null;
  const cell = board[idx(r, c)];
  if (!cell) return null;
  return orient(cell.t, cell.rot, cell.flip);
}

export const INVALID_OCCUPIED = 'occupied';
export const INVALID_CLASH = 'clash';
export const INVALID_ORPHAN = 'orphan';

/**
 * Can this tile be drawn here?
 * Returns null when legal, otherwise a reason code.
 *
 * A placement is legal when the square is empty, no road end meets a rail end,
 * and at least one end joins an existing route or a board gateway.
 */
export function placementError(board, tileId, rot, flip, r, c) {
  if (!inBounds(r, c)) return INVALID_OCCUPIED;
  if (board[idx(r, c)]) return INVALID_OCCUPIED;

  const { edges } = orient(tileId, rot, flip);
  let joined = false;

  for (let d = 0; d < 4; d++) {
    const e = edges[d];
    const nr = r + DIRS[d][0];
    const nc = c + DIRS[d][1];

    if (inBounds(nr, nc)) {
      const nb = shapeAt(board, nr, nc);
      if (!nb) continue;
      const ne = nb.edges[OPP[d]];
      if (e === NONE || ne === NONE) continue;
      if (e !== ne) return INVALID_CLASH;
      joined = true;
    } else {
      const gate = gatewayAt(r, c, d);
      if (!gate || e === NONE) continue; // running off the edge is allowed, it just costs a point later
      if (e !== gate.type) return INVALID_CLASH;
      joined = true;
    }
  }

  return joined ? null : INVALID_ORPHAN;
}

export function canPlace(board, tileId, rot, flip, r, c) {
  return placementError(board, tileId, rot, flip, r, c) === null;
}

/** Every square where this tile, in this orientation, may be drawn. */
export function legalCells(board, tileId, rot, flip) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (canPlace(board, tileId, rot, flip, r, c)) out.push(idx(r, c));
    }
  }
  return out;
}

/** Is there any square and orientation at all for this tile? */
export function hasAnyPlacement(board, tileId) {
  for (const [rot, flip] of distinctOrientations(tileId)) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (canPlace(board, tileId, rot, flip, r, c)) return true;
      }
    }
  }
  return false;
}

export function place(board, tileId, rot, flip, r, c, meta = {}) {
  board[idx(r, c)] = { t: tileId, rot, flip, ...meta };
}

export function clear(board, r, c) {
  board[idx(r, c)] = null;
}

export function tileName(tileId) {
  return TILES[tileId].name;
}

export { NONE, ROAD, RAIL };
