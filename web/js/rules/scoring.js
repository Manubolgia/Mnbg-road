// End-of-game scoring.
//
//   gateways  connected gateways in the single largest network
//   central   one point per filled square of the middle three-by-three
//   road      squares in the longest unbroken road
//   rail      squares in the longest unbroken rail
//   errors    minus one for every route end left hanging

import { NONE, ROAD, RAIL, groupOf } from './tiles.js';
import { SIZE, DIRS, OPP, GATEWAYS, gatewayAt, inBounds, idx, isCentral, shapeAt } from './board.js';

// Index by number of gateways in the network. One gateway on its own is worth nothing.
export const NETWORK_TABLE = [0, 0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 45];

class DisjointSet {
  constructor() {
    this.parent = new Map();
  }
  find(a) {
    let root = a;
    while (this.parent.get(root) !== root) {
      if (!this.parent.has(root)) {
        this.parent.set(root, root);
        return root;
      }
      root = this.parent.get(root);
    }
    return root;
  }
  add(a) {
    if (!this.parent.has(a)) this.parent.set(a, a);
    return a;
  }
  union(a, b) {
    const ra = this.find(this.add(a));
    const rb = this.find(this.add(b));
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function nodeId(r, c, g) {
  return `${r},${c},${g}`;
}

/** Largest number of gateways joined into one network. */
function gatewayNetwork(board) {
  const dsu = new DisjointSet();

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const shape = shapeAt(board, r, c);
      if (!shape) continue;
      for (let g = 0; g < shape.links.length; g++) dsu.add(nodeId(r, c, g));

      for (let d = 0; d < 4; d++) {
        if (shape.edges[d] === NONE) continue;
        const nr = r + DIRS[d][0];
        const nc = c + DIRS[d][1];
        if (!inBounds(nr, nc)) continue;
        const nb = shapeAt(board, nr, nc);
        if (!nb || nb.edges[OPP[d]] !== shape.edges[d]) continue;
        dsu.union(nodeId(r, c, groupOf(shape, d)), nodeId(nr, nc, groupOf(nb, OPP[d])));
      }
    }
  }

  const reached = new Map(); // root -> gateway count
  for (const gate of GATEWAYS) {
    const shape = shapeAt(board, gate.r, gate.c);
    if (!shape || shape.edges[gate.dir] !== gate.type) continue;
    const root = dsu.find(dsu.add(nodeId(gate.r, gate.c, groupOf(shape, gate.dir))));
    reached.set(root, (reached.get(root) || 0) + 1);
  }

  let best = 0;
  for (const n of reached.values()) best = Math.max(best, n);
  return best;
}

/**
 * Longest simple path, counted in squares, over one kind of route.
 * A square may be crossed once, and only along ends that are joined inside it,
 * so a flyover carries road and rail past each other independently.
 */
function longestRun(board, type) {
  // Build the traversal graph: one node per (square, link group carrying `type`).
  const nodes = [];
  const nodeAt = new Map(); // "r,c,g" -> node index

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const shape = shapeAt(board, r, c);
      if (!shape) continue;
      for (let g = 0; g < shape.links.length; g++) {
        const ends = shape.links[g].filter((d) => shape.edges[d] === type);
        if (!ends.length) continue;
        nodeAt.set(nodeId(r, c, g), nodes.length);
        nodes.push({ r, c, cell: idx(r, c), ends, neighbours: [] });
      }
    }
  }
  if (!nodes.length) return 0;

  for (const node of nodes) {
    for (const d of node.ends) {
      const nr = node.r + DIRS[d][0];
      const nc = node.c + DIRS[d][1];
      if (!inBounds(nr, nc)) continue;
      const nb = shapeAt(board, nr, nc);
      if (!nb || nb.edges[OPP[d]] !== type) continue;
      const other = nodeAt.get(nodeId(nr, nc, groupOf(nb, OPP[d])));
      if (other !== undefined) node.neighbours.push(other);
    }
  }

  const visitedCell = new Uint8Array(SIZE * SIZE);
  let best = 0;
  let budget = 400000; // generous; a full board never gets close in practice

  const walk = (at, depth) => {
    if (depth > best) best = depth;
    if (--budget <= 0) return;
    for (const next of nodes[at].neighbours) {
      const cell = nodes[next].cell;
      if (visitedCell[cell]) continue;
      visitedCell[cell] = 1;
      walk(next, depth + 1);
      visitedCell[cell] = 0;
    }
  };

  for (let i = 0; i < nodes.length && budget > 0; i++) {
    visitedCell[nodes[i].cell] = 1;
    walk(i, 1);
    visitedCell[nodes[i].cell] = 0;
  }

  return best;
}

/** Route ends pointing at an empty square or off the board with no gateway. */
export function looseEnds(board) {
  const list = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const shape = shapeAt(board, r, c);
      if (!shape) continue;
      for (let d = 0; d < 4; d++) {
        if (shape.edges[d] === NONE) continue;
        const nr = r + DIRS[d][0];
        const nc = c + DIRS[d][1];
        if (inBounds(nr, nc)) {
          if (!shapeAt(board, nr, nc)) list.push({ r, c, d });
        } else {
          const gate = gatewayAt(r, c, d);
          if (!gate || gate.type !== shape.edges[d]) list.push({ r, c, d });
        }
      }
    }
  }
  return list;
}

export function scoreBoard(board) {
  const gateways = gatewayNetwork(board);
  const network = NETWORK_TABLE[Math.min(gateways, NETWORK_TABLE.length - 1)];

  let central = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isCentral(r, c) && board[idx(r, c)]) central++;
    }
  }

  const road = longestRun(board, ROAD);
  const rail = longestRun(board, RAIL);
  const ends = looseEnds(board);
  const errors = ends.length;

  return {
    gateways,
    network,
    central,
    road,
    rail,
    errors,
    looseEnds: ends,
    total: network + central + road + rail - errors,
  };
}
