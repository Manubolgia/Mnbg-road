// Tile vocabulary for MAINLINE.
//
// Every tile occupies one square and is described by what it presents on each
// of its four sides, plus which of those sides are joined to each other inside
// the square.
//
//   edges : [N, E, S, W]  -> NONE | ROAD | RAIL
//   links : groups of edge indices that are internally connected
//
// A square may hold more than one group (the Flyover carries a road and a rail
// straight past each other without joining them). A group holding both road
// and rail edges is an Interchange: traffic may change mode there.

export const NONE = 0;
export const ROAD = 1;
export const RAIL = 2;

function def(id, name, edges, links) {
  return { id, name, edges, links };
}

export const TILES = {
  // --- route die faces -----------------------------------------------------
  ROAD_S: def('ROAD_S', 'Road Straight', [ROAD, NONE, ROAD, NONE], [[0, 2]]),
  ROAD_C: def('ROAD_C', 'Road Corner', [ROAD, ROAD, NONE, NONE], [[0, 1]]),
  ROAD_T: def('ROAD_T', 'Road Fork', [ROAD, ROAD, ROAD, NONE], [[0, 1, 2]]),
  RAIL_S: def('RAIL_S', 'Rail Straight', [RAIL, NONE, RAIL, NONE], [[0, 2]]),
  RAIL_C: def('RAIL_C', 'Rail Corner', [RAIL, RAIL, NONE, NONE], [[0, 1]]),
  RAIL_T: def('RAIL_T', 'Rail Fork', [RAIL, RAIL, RAIL, NONE], [[0, 1, 2]]),

  // --- junction die faces --------------------------------------------------
  FLYOVER: def('FLYOVER', 'Flyover', [ROAD, RAIL, ROAD, RAIL], [[0, 2], [1, 3]]),
  HUB_S: def('HUB_S', 'Straight Interchange', [ROAD, NONE, RAIL, NONE], [[0, 2]]),
  HUB_C: def('HUB_C', 'Corner Interchange', [ROAD, RAIL, NONE, NONE], [[0, 1]]),

  // --- special pieces (three per game, one per round) ----------------------
  ROAD_X: def('ROAD_X', 'Road Crossing', [ROAD, ROAD, ROAD, ROAD], [[0, 1, 2, 3]]),
  RAIL_X: def('RAIL_X', 'Rail Crossing', [RAIL, RAIL, RAIL, RAIL], [[0, 1, 2, 3]]),
  ROAD3: def('ROAD3', 'Road Fork Interchange', [ROAD, ROAD, ROAD, RAIL], [[0, 1, 2, 3]]),
  RAIL3: def('RAIL3', 'Rail Fork Interchange', [RAIL, RAIL, RAIL, ROAD], [[0, 1, 2, 3]]),
  HUB_X: def('HUB_X', 'Crossed Interchange', [ROAD, RAIL, ROAD, RAIL], [[0, 1, 2, 3]]),
  HUB_L: def('HUB_L', 'Paired Interchange', [ROAD, ROAD, RAIL, RAIL], [[0, 1, 2, 3]]),
};

// The three identical route dice.
export const ROUTE_DIE = ['ROAD_S', 'ROAD_C', 'ROAD_T', 'RAIL_S', 'RAIL_C', 'RAIL_T'];

// The single junction die: two of each face.
export const JUNCTION_DIE = ['FLYOVER', 'FLYOVER', 'HUB_S', 'HUB_S', 'HUB_C', 'HUB_C'];

export const SPECIALS = ['ROAD_X', 'RAIL_X', 'ROAD3', 'RAIL3', 'HUB_X', 'HUB_L'];

export const SPECIAL_ALLOWANCE = 3; // per game
export const ROUNDS = 7;
export const DICE_PER_ROUND = 4;

// Mirror maps N,E,S,W -> N,W,S,E (a horizontal flip).
const MIRROR = [0, 3, 2, 1];

/** Where does original edge `i` end up after `flip` then `rot` quarter turns? */
function mapEdge(i, rot, flip) {
  const f = flip ? MIRROR[i] : i;
  return (f + rot) & 3;
}

const orientCache = new Map();

/** Resolve a tile in a given orientation to `{ edges, links }`. */
export function orient(tileId, rot = 0, flip = 0) {
  const key = `${tileId}|${rot}|${flip}`;
  const hit = orientCache.get(key);
  if (hit) return hit;

  const tile = TILES[tileId];
  const edges = [NONE, NONE, NONE, NONE];
  for (let i = 0; i < 4; i++) edges[mapEdge(i, rot, flip)] = tile.edges[i];
  const links = tile.links.map((g) => g.map((i) => mapEdge(i, rot, flip)).sort());

  const value = { edges, links };
  orientCache.set(key, value);
  return value;
}

/** Which link group of this orientation contains edge `d`? -1 if none. */
export function groupOf(shape, d) {
  for (let g = 0; g < shape.links.length; g++) {
    if (shape.links[g].includes(d)) return g;
  }
  return -1;
}

function shapeKey(shape) {
  return shape.edges.join('') + '|' + shape.links.map((g) => g.join('')).sort().join('/');
}

const distinctCache = new Map();

/** The orientations of a tile that actually look different, as `[rot, flip]`. */
export function distinctOrientations(tileId) {
  const hit = distinctCache.get(tileId);
  if (hit) return hit;
  const seen = new Set();
  const out = [];
  for (const flip of [0, 1]) {
    for (let rot = 0; rot < 4; rot++) {
      const key = shapeKey(orient(tileId, rot, flip));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([rot, flip]);
    }
  }
  distinctCache.set(tileId, out);
  return out;
}

/** True when a link group joins road to rail, i.e. it is an interchange. */
export function isInterchange(shape, groupIndex) {
  let road = false;
  let rail = false;
  for (const d of shape.links[groupIndex]) {
    if (shape.edges[d] === ROAD) road = true;
    if (shape.edges[d] === RAIL) rail = true;
  }
  return road && rail;
}
