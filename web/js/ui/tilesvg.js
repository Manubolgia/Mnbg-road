// SVG drawing for the pieces. Everything lives in a 100x100 square.
// Straight segments only, square ends: corners are hard 90 degree turns.

import { NONE, ROAD, RAIL, orient, isInterchange } from '../rules/tiles.js';

const MID = [
  [50, 0],
  [100, 50],
  [50, 100],
  [0, 50],
];
const CX = 50;
const CY = 50;

const ROAD_WIDTH = 18;
const ROAD_LINE = 3;
const RAIL_SPINE = 4;
const RAIL_TIE_LEN = 26;
const RAIL_TIE_WIDTH = 5;
const TIE_STOPS = [0.2, 0.52];

function line(x1, y1, x2, y2, stroke, width, extra = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
}

function roadSegment(d, colors, underlay) {
  const [x, y] = MID[d];
  let out = '';
  if (underlay) out += line(x, y, CX, CY, colors.paper, ROAD_WIDTH + 12);
  out += line(x, y, CX, CY, colors.ink, ROAD_WIDTH);
  out += line(x, y, CX, CY, colors.paper, ROAD_LINE, 'stroke-dasharray="9 7"');
  return out;
}

/** Fills the notch left where two butt-ended segments meet at the middle. */
function hub(size, fill) {
  const h = size / 2;
  return `<rect x="${CX - h}" y="${CY - h}" width="${size}" height="${size}" fill="${fill}"/>`;
}

function railSegment(d, colors) {
  const [x, y] = MID[d];
  let out = line(x, y, CX, CY, colors.second, RAIL_SPINE);
  const vertical = x === CX;
  for (const t of TIE_STOPS) {
    const tx = x + (CX - x) * t;
    const ty = y + (CY - y) * t;
    const h = RAIL_TIE_LEN / 2;
    out += vertical
      ? line(tx - h, ty, tx + h, ty, colors.second, RAIL_TIE_WIDTH)
      : line(tx, ty - h, tx, ty + h, colors.second, RAIL_TIE_WIDTH);
  }
  return out;
}

/**
 * Inner markup for one piece.
 * @param {string} tileId
 * @param {number} rot 0-3 quarter turns
 * @param {number} flip 0 or 1
 */
export function tileMarkup(tileId, rot = 0, flip = 0, opts = {}) {
  const colors = {
    ink: opts.ink || 'var(--ink)',
    second: opts.second || 'var(--second)',
    accent: opts.accent || 'var(--accent)',
    paper: opts.paper || 'var(--paper)',
  };
  const shape = orient(tileId, rot, flip);
  const layered = shape.links.length > 1; // only the flyover carries two groups

  // Rail first so that a flyover's road sits over the top of it.
  const order = [...shape.links.keys()].sort((a, b) => {
    const roadA = shape.links[a].some((d) => shape.edges[d] === ROAD) ? 1 : 0;
    const roadB = shape.links[b].some((d) => shape.edges[d] === ROAD) ? 1 : 0;
    return roadA - roadB;
  });

  let out = '';
  for (const g of order) {
    const group = shape.links[g];
    const roadEnds = group.filter((d) => shape.edges[d] === ROAD);
    const railEnds = group.filter((d) => shape.edges[d] === RAIL);
    for (const d of railEnds) out += railSegment(d, colors);
    // A straight rail needs no patch; a bend or a branch does.
    const railTurns = railEnds.length > 2 || (railEnds.length === 2 && (railEnds[0] + 2) % 4 !== railEnds[1]);
    if (railTurns) out += hub(RAIL_SPINE + 4, colors.second);
    for (const d of roadEnds) out += roadSegment(d, colors, layered && roadEnds.length > 0);
    if (roadEnds.length > 1) out += hub(ROAD_WIDTH, colors.ink);
    if (isInterchange(shape, g)) {
      out += `<rect x="${CX - 11}" y="${CY - 11}" width="22" height="22" fill="${colors.accent}"/>`;
    }
  }
  return `<g stroke-linecap="butt">${out}</g>`;
}

/** A standalone square SVG for a piece, for the dice tray and the rules sheet. */
export function tileSVG(tileId, rot = 0, flip = 0, opts = {}) {
  return `<svg class="tile-svg" viewBox="0 0 100 100" aria-hidden="true">${tileMarkup(tileId, rot, flip, opts)}</svg>`;
}

/** A short stub of route poking out of the board edge, used for gateways. */
export function gatewayMarkup(type, dir, len = 16) {
  // dir points outward from the board; draw from the board edge outwards.
  const dx = [0, 1, 0, -1][dir];
  const dy = [-1, 0, 1, 0][dir];
  const x2 = dx * len;
  const y2 = dy * len;
  if (type === ROAD) {
    // Too short for a centre line; a solid bar reads more clearly at this size.
    return `<line x1="0" y1="0" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="${ROAD_WIDTH}"/>`;
  }
  if (type === RAIL) {
    const vertical = dx === 0;
    const h = RAIL_TIE_LEN / 2;
    const tx = x2 * 0.6;
    const ty = y2 * 0.6;
    return (
      `<line x1="0" y1="0" x2="${x2}" y2="${y2}" stroke="var(--second)" stroke-width="${RAIL_SPINE}"/>` +
      (vertical
        ? line(tx - h, ty, tx + h, ty, 'var(--second)', RAIL_TIE_WIDTH)
        : line(tx, ty - h, tx, ty + h, 'var(--second)', RAIL_TIE_WIDTH))
    );
  }
  return '';
}

export { NONE, ROAD, RAIL };
