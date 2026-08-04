// Two ways to run a game behind one interface: on this device, or on the
// room server. Both emit `state` events carrying the same shape.

import { createBoard } from './rules/board.js';
import { scoreBoard } from './rules/scoring.js';
import { rollDice, validateRound, ROUNDS } from './rules/game.js';
import { RoomClient } from './net/client.js';

export class SoloSession extends EventTarget {
  constructor(name) {
    super();
    this.id = 'solo';
    this.state = {
      code: 'SOLO',
      phase: 'lobby',
      round: 0,
      dice: [],
      hostId: 'solo',
      you: 'solo',
      players: [
        { id: 'solo', name: name || 'You', connected: true, ready: false, board: createBoard(), usedSpecials: [] },
      ],
    };
    this.connection = 'local';
  }

  get me() {
    return this.state.players[0];
  }

  emit() {
    this.dispatchEvent(new CustomEvent('state', { detail: this.state }));
  }

  start() {
    this.state.phase = 'round';
    this.state.round = 1;
    this.state.dice = rollDice();
    this.me.ready = false;
    this.emit();
  }

  submit(placements) {
    const result = validateRound(this.me.board, this.state.dice, placements, this.me.usedSpecials);
    if (!result.ok) {
      this.dispatchEvent(new CustomEvent('error', { detail: result.error }));
      return;
    }
    this.me.board = result.board;
    this.me.usedSpecials = result.usedSpecials;

    if (this.state.round >= ROUNDS) {
      this.me.score = scoreBoard(this.me.board);
      this.state.phase = 'over';
    } else {
      this.state.round++;
      this.state.dice = rollDice();
    }
    this.emit();
  }

  rematch() {
    this.me.board = createBoard();
    this.me.usedSpecials = [];
    this.me.score = undefined;
    this.state.round = 1;
    this.state.phase = 'round';
    this.state.dice = rollDice();
    this.emit();
  }

  force() {}
  leave() {}
}

export class OnlineSession extends EventTarget {
  constructor(serverUrl, pid, name) {
    super();
    this.client = new RoomClient(serverUrl);
    this.pid = pid;
    this.name = name;
    this.state = null;
    this.connection = 'connecting';

    this.client.addEventListener('status', (ev) => {
      this.connection = ev.detail;
      this.dispatchEvent(new CustomEvent('connection', { detail: ev.detail }));
    });

    this.client.addEventListener('message', (ev) => {
      const msg = ev.detail;
      if (msg.type === 'state') {
        this.state = msg.state;
        this.dispatchEvent(new CustomEvent('state', { detail: this.state }));
      } else if (msg.type === 'error') {
        this.dispatchEvent(new CustomEvent('error', { detail: msg.message }));
      }
    });
  }

  static async create(serverUrl) {
    const client = new RoomClient(serverUrl);
    return client.createRoom();
  }

  join(code) {
    this.client.connect(code, this.pid, this.name);
  }

  get me() {
    if (!this.state) return null;
    return this.state.players.find((p) => p.id === this.pid) || null;
  }

  start() {
    this.client.send({ type: 'start' });
  }

  submit(placements) {
    this.client.send({ type: 'submit', round: this.state.round, placements });
  }

  force() {
    this.client.send({ type: 'force' });
  }

  rematch() {
    this.client.send({ type: 'rematch' });
  }

  leave() {
    this.client.leave();
  }
}
