// Rule checks for the MAINLINE engine.  Run: node tools/test-rules.mjs

import assert from 'node:assert/strict';

import { ROAD, RAIL, orient, distinctOrientations, TILES } from '../web/js/rules/tiles.js';
import {
  createBoard, place, canPlace, placementError, GATEWAYS, hasAnyPlacement,
  INVALID_CLASH, INVALID_ORPHAN,
} from '../web/js/rules/board.js';
import { scoreBoard } from '../web/js/rules/scoring.js';
import { validateRound, ERRORS } from '../web/js/rules/game.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

test('twelve gateways, six of each kind', () => {
  assert.equal(GATEWAYS.length, 12);
  assert.equal(GATEWAYS.filter((g) => g.type === ROAD).length, 6);
  assert.equal(GATEWAYS.filter((g) => g.type === RAIL).length, 6);
});

test('four quarter turns return a tile to itself', () => {
  for (const id of Object.keys(TILES)) {
    assert.deepEqual(orient(id, 0, 0).edges, orient(id, 4 % 4, 0).edges);
  }
  assert.deepEqual(orient('ROAD_C', 1, 0).edges, [0, ROAD, ROAD, 0]);
  assert.deepEqual(orient('ROAD_C', 0, 1).edges, [ROAD, 0, 0, ROAD]);
});

test('only the corner interchange has eight distinct orientations', () => {
  assert.equal(distinctOrientations('HUB_C').length, 8);
  assert.equal(distinctOrientations('ROAD_C').length, 4);
  assert.equal(distinctOrientations('ROAD_S').length, 2);
  assert.equal(distinctOrientations('ROAD_X').length, 1);
});

test('the first piece must reach a gateway', () => {
  const board = createBoard();
  assert.equal(placementError(board, 'ROAD_S', 0, 0, 3, 3), INVALID_ORPHAN);
  assert.equal(placementError(board, 'ROAD_S', 0, 0, 0, 1), null); // gateway N1 is a road
  assert.equal(placementError(board, 'RAIL_S', 0, 0, 0, 1), INVALID_CLASH);
  assert.equal(placementError(board, 'RAIL_S', 0, 0, 0, 3), null); // gateway N3 is a rail
});

test('a road end may not meet a rail end', () => {
  const board = createBoard();
  place(board, 'ROAD_S', 0, 0, 0, 1);
  assert.equal(placementError(board, 'RAIL_S', 0, 0, 1, 1), INVALID_CLASH);
  assert.equal(placementError(board, 'ROAD_S', 0, 0, 1, 1), null);
  assert.equal(placementError(board, 'HUB_S', 0, 0, 1, 1), null); // road in, rail out
});

test('running off the board edge is legal but loses a point', () => {
  const board = createBoard();
  place(board, 'ROAD_C', 0, 0, 0, 1); // road north to a gateway, road east into (0,2)
  const s = scoreBoard(board);
  assert.equal(s.errors, 1);
  assert.equal(s.gateways, 1);
  assert.equal(s.network, 0); // a lone gateway scores nothing
  assert.equal(s.total, 1 - 1); // one road square, one loose end
});

test('a road spanning two gateways scores the network', () => {
  const board = createBoard();
  for (let r = 0; r < 7; r++) place(board, 'ROAD_S', 0, 0, r, 1);
  const s = scoreBoard(board);
  assert.equal(s.gateways, 2);
  assert.equal(s.network, 4);
  assert.equal(s.road, 7);
  assert.equal(s.rail, 0);
  assert.equal(s.central, 0);
  assert.equal(s.errors, 0);
  assert.equal(s.total, 11);
});

test('the flyover keeps road and rail apart', () => {
  const board = createBoard();
  for (let r = 0; r < 3; r++) place(board, 'ROAD_S', 0, 0, r, 1);
  place(board, 'FLYOVER', 0, 0, 3, 1); // road north-south, rail east-west
  const s = scoreBoard(board);
  assert.equal(s.road, 4);
  assert.equal(s.rail, 1); // the rail across the flyover is stranded on its own
  const board2 = createBoard();
  // gateway W3 is a road, so a rail cannot start against it
  assert.equal(canPlace(board2, 'RAIL_S', 1, 0, 3, 0), false);
});

test('an interchange joins road to rail for the network but not for a run', () => {
  const board = createBoard();
  place(board, 'ROAD_S', 0, 0, 0, 1); // gateway N1, road
  place(board, 'HUB_S', 0, 0, 1, 1); // road north, rail south
  place(board, 'RAIL_S', 0, 0, 2, 1);
  const s = scoreBoard(board);
  assert.equal(s.road, 2); // the two squares carrying road
  assert.equal(s.rail, 2); // the two squares carrying rail
  assert.equal(s.gateways, 1);
});

test('the central three by three pays a point a square', () => {
  const board = createBoard();
  for (let r = 0; r < 7; r++) place(board, 'ROAD_S', 0, 0, r, 3); // column 3 runs through the centre
  // column 3 has rail gateways top and bottom, so the road ends are loose
  const s = scoreBoard(board);
  assert.equal(s.central, 3);
  assert.equal(s.errors, 2);
});

test('a round must use every die that can still be placed', () => {
  const board = createBoard();
  const dice = ['ROAD_S', 'ROAD_S', 'ROAD_S', 'HUB_S'];
  assert.equal(validateRound(board, dice, [], []).error, ERRORS.NOT_MAXIMAL);

  const placements = [
    { t: 'ROAD_S', rot: 0, flip: 0, r: 0, c: 1, src: 0 },
    { t: 'ROAD_S', rot: 0, flip: 0, r: 1, c: 1, src: 1 },
    { t: 'ROAD_S', rot: 0, flip: 0, r: 2, c: 1, src: 2 },
    { t: 'HUB_S', rot: 0, flip: 0, r: 3, c: 1, src: 3 },
  ];
  const ok = validateRound(board, dice, placements, []);
  assert.equal(ok.ok, true);
  assert.equal(ok.board.filter(Boolean).length, 4);
});

test('a die that cannot go anywhere is simply lost', () => {
  const board = createBoard();
  // Fill the sheet so nothing else fits.
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) place(board, 'ROAD_X', 0, 0, r, c);
  assert.equal(hasAnyPlacement(board, 'ROAD_S'), false);
  assert.equal(validateRound(board, ['ROAD_S', 'ROAD_S', 'ROAD_S', 'HUB_S'], [], []).ok, true);
});

test('special pieces: one a round, three a game, never repeated', () => {
  const board = createBoard();
  const dice = ['RAIL_S', 'RAIL_S', 'RAIL_S', 'FLYOVER'];
  const two = [
    { t: 'ROAD_X', rot: 0, flip: 0, r: 0, c: 1, src: 'special' },
    { t: 'RAIL_X', rot: 0, flip: 0, r: 0, c: 3, src: 'special' },
  ];
  assert.equal(validateRound(board, dice, two, []).error, ERRORS.SPECIAL_LIMIT);

  const repeat = [{ t: 'ROAD_X', rot: 0, flip: 0, r: 0, c: 1, src: 'special' }];
  assert.equal(validateRound(board, dice, repeat, ['ROAD_X']).error, ERRORS.SPECIAL_REPEAT);
  assert.equal(
    validateRound(board, dice, repeat, ['RAIL_X', 'HUB_X', 'HUB_L']).error,
    ERRORS.SPECIAL_GONE
  );
});

test('a die may not be spent twice, or faked', () => {
  const board = createBoard();
  const dice = ['ROAD_S', 'RAIL_S', 'RAIL_S', 'FLYOVER'];
  const twice = [
    { t: 'ROAD_S', rot: 0, flip: 0, r: 0, c: 1, src: 0 },
    { t: 'ROAD_S', rot: 0, flip: 0, r: 1, c: 1, src: 0 },
  ];
  assert.equal(validateRound(board, dice, twice, []).error, ERRORS.DIE_SPENT);
  const faked = [{ t: 'ROAD_X', rot: 0, flip: 0, r: 0, c: 1, src: 1 }];
  assert.equal(validateRound(board, dice, faked, []).error, ERRORS.BAD_DIE);
});

test('the biggest network is the one that counts', () => {
  const board = createBoard();
  for (let r = 0; r < 7; r++) place(board, 'ROAD_S', 0, 0, r, 1); // N1 to S1, two gateways
  for (let r = 0; r < 7; r++) place(board, 'RAIL_S', 0, 0, r, 3); // N3 to S3, two gateways
  const s = scoreBoard(board);
  assert.equal(s.gateways, 2);
  assert.equal(s.network, 4);
});

console.log(`\n${passed} checks passed`);
