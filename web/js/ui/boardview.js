// Renders a sheet: grid, gateways, drawn pieces, hints.

import { SIZE, GATEWAYS, idx } from '../rules/board.js';
import { tileMarkup, gatewayMarkup } from './tilesvg.js';

const CELL = 100;
const GRID = SIZE * CELL;
const MARGIN = 22;
export const VIEWBOX = `${-MARGIN} ${-MARGIN} ${GRID + MARGIN * 2} ${GRID + MARGIN * 2}`;

function cellTransform(r, c) {
  return `translate(${c * CELL} ${r * CELL})`;
}

/**
 * @param {Array} board
 * @param {object} opts
 *   highlights  Set of cell indices to mark as legal targets
 *   pending     Set of cell indices drawn this round (shown in accent)
 *   preview     { cell, t, rot, flip } ghost piece
 *   looseEnds   [{r,c,d}] to mark with an error tick
 *   interactive whether to emit tap targets
 */
export function boardMarkup(board, opts = {}) {
  const { highlights, pending, preview, looseEnds, interactive = false } = opts;
  const parts = [];

  parts.push(`<rect x="0" y="0" width="${GRID}" height="${GRID}" class="bv-paper"/>`);

  // central bonus area
  parts.push(
    `<rect x="${2 * CELL}" y="${2 * CELL}" width="${3 * CELL}" height="${3 * CELL}" class="bv-central"/>`
  );

  // grid
  for (let i = 1; i < SIZE; i++) {
    const p = i * CELL;
    parts.push(`<line x1="${p}" y1="0" x2="${p}" y2="${GRID}" class="bv-grid"/>`);
    parts.push(`<line x1="0" y1="${p}" x2="${GRID}" y2="${p}" class="bv-grid"/>`);
  }
  parts.push(`<rect x="0" y="0" width="${GRID}" height="${GRID}" class="bv-frame"/>`);

  // gateways
  for (const g of GATEWAYS) {
    const x = g.c * CELL + (g.dir === 1 ? CELL : g.dir === 3 ? 0 : CELL / 2);
    const y = g.r * CELL + (g.dir === 2 ? CELL : g.dir === 0 ? 0 : CELL / 2);
    parts.push(`<g transform="translate(${x} ${y})">${gatewayMarkup(g.type, g.dir, MARGIN)}</g>`);
  }

  // pieces
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = board[idx(r, c)];
      if (!cell) continue;
      const fresh = pending && pending.has(idx(r, c));
      parts.push(
        `<g transform="${cellTransform(r, c)}"${fresh ? ' class="bv-fresh"' : ''}>` +
          tileMarkup(cell.t, cell.rot, cell.flip) +
          (fresh ? `<rect x="2" y="2" width="96" height="96" class="bv-fresh-ring"/>` : '') +
          '</g>'
      );
    }
  }

  // legal target hints
  if (highlights) {
    for (const cellIndex of highlights) {
      const r = Math.floor(cellIndex / SIZE);
      const c = cellIndex % SIZE;
      parts.push(
        `<rect x="${c * CELL + 6}" y="${r * CELL + 6}" width="${CELL - 12}" height="${CELL - 12}" class="bv-target"/>`
      );
    }
  }

  // ghost of the piece about to be drawn
  if (preview && preview.cell != null) {
    const r = Math.floor(preview.cell / SIZE);
    const c = preview.cell % SIZE;
    parts.push(
      `<g transform="${cellTransform(r, c)}" class="bv-preview">${tileMarkup(preview.t, preview.rot, preview.flip)}</g>`
    );
  }

  // hanging ends
  if (looseEnds) {
    for (const e of looseEnds) {
      const ox = [0, 1, 0, -1][e.d];
      const oy = [-1, 0, 1, 0][e.d];
      const x = e.c * CELL + CELL / 2 + ox * (CELL / 2 - 11);
      const y = e.r * CELL + CELL / 2 + oy * (CELL / 2 - 11);
      parts.push(`<rect x="${x - 9}" y="${y - 9}" width="18" height="18" class="bv-error"/>`);
    }
  }

  // tap targets last so they sit on top
  if (interactive) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        parts.push(
          `<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" class="bv-hit" data-cell="${idx(r, c)}"/>`
        );
      }
    }
  }

  return parts.join('');
}

export function renderBoard(svg, board, opts) {
  svg.setAttribute('viewBox', VIEWBOX);
  svg.innerHTML = boardMarkup(board, opts);
}
