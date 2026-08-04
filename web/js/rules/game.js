// Round structure, dice and the rules that police a submitted round.
//
// Seven rounds. Each round four dice are rolled and every player draws the
// same four results on their own sheet. You must use as many of them as you
// legally can. Once per round you may also draw one special piece, three per
// game, and never the same one twice.

import {
  ROUTE_DIE,
  JUNCTION_DIE,
  SPECIALS,
  SPECIAL_ALLOWANCE,
  ROUNDS,
  DICE_PER_ROUND,
  TILES,
} from './tiles.js';
import { canPlace, place, cloneBoard, hasAnyPlacement, placementError, INVALID_CLASH, INVALID_ORPHAN } from './board.js';

export { ROUNDS, DICE_PER_ROUND, SPECIAL_ALLOWANCE, SPECIALS };

function randomInt(bound) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / bound) * bound;
  let v;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % bound;
}

/** Roll the three route dice and the junction die. */
export function rollDice() {
  return [
    ROUTE_DIE[randomInt(6)],
    ROUTE_DIE[randomInt(6)],
    ROUTE_DIE[randomInt(6)],
    JUNCTION_DIE[randomInt(6)],
  ];
}

export const ERRORS = {
  BAD_DIE: 'That piece does not match the die.',
  DIE_SPENT: 'That die has already been used this round.',
  SPECIAL_LIMIT: 'Only one special piece per round.',
  SPECIAL_GONE: 'No special pieces left.',
  SPECIAL_REPEAT: 'That special piece has already been used.',
  CLASH: 'A road end cannot meet a rail end.',
  ORPHAN: 'Every piece must join an existing route or a gateway.',
  OCCUPIED: 'That square is taken.',
  NOT_MAXIMAL: 'You can still place another die.',
};

/**
 * Replay a round's placements against a board and report whether they are legal.
 *
 * @param {Array} board            board as it stood at the start of the round
 * @param {string[]} dice          the four die faces for this round
 * @param {Array} placements       [{ t, rot, flip, r, c, src }] in draw order,
 *                                 src is a die index 0-3 or the string 'special'
 * @param {string[]} usedSpecials  special tile ids already spent in earlier rounds
 * @returns {{ ok: boolean, error?: string, board?: Array, usedSpecials?: string[] }}
 */
export function validateRound(board, dice, placements, usedSpecials = []) {
  const next = cloneBoard(board);
  const spentDice = new Set();
  const spent = new Set(usedSpecials);
  let specialsThisRound = 0;

  for (const p of placements) {
    if (!TILES[p.t]) return { ok: false, error: ERRORS.BAD_DIE };

    if (p.src === 'special') {
      if (specialsThisRound >= 1) return { ok: false, error: ERRORS.SPECIAL_LIMIT };
      if (spent.size >= SPECIAL_ALLOWANCE) return { ok: false, error: ERRORS.SPECIAL_GONE };
      if (!SPECIALS.includes(p.t)) return { ok: false, error: ERRORS.BAD_DIE };
      if (spent.has(p.t)) return { ok: false, error: ERRORS.SPECIAL_REPEAT };
      spent.add(p.t);
      specialsThisRound++;
    } else {
      const i = Number(p.src);
      if (!Number.isInteger(i) || i < 0 || i >= dice.length) return { ok: false, error: ERRORS.BAD_DIE };
      if (spentDice.has(i)) return { ok: false, error: ERRORS.DIE_SPENT };
      if (dice[i] !== p.t) return { ok: false, error: ERRORS.BAD_DIE };
      spentDice.add(i);
    }

    const problem = placementError(next, p.t, p.rot, p.flip, p.r, p.c);
    if (problem === INVALID_CLASH) return { ok: false, error: ERRORS.CLASH };
    if (problem === INVALID_ORPHAN) return { ok: false, error: ERRORS.ORPHAN };
    if (problem) return { ok: false, error: ERRORS.OCCUPIED };

    place(next, p.t, p.rot, p.flip, p.r, p.c, { src: p.src });
  }

  // You must use as many dice as you can. We check that nothing left over
  // could still go down; a player who genuinely has no move keeps their dice.
  for (let i = 0; i < dice.length; i++) {
    if (spentDice.has(i)) continue;
    if (hasAnyPlacement(next, dice[i])) return { ok: false, error: ERRORS.NOT_MAXIMAL };
  }

  return { ok: true, board: next, usedSpecials: [...spent] };
}

/** Dice from this round's roll that are still playable on the given board. */
export function playableDice(board, dice, spentIndices) {
  const out = [];
  for (let i = 0; i < dice.length; i++) {
    if (spentIndices.has(i)) continue;
    if (hasAnyPlacement(board, dice[i])) out.push(i);
  }
  return out;
}

export { canPlace };
