// MAINLINE room server.
//
// A Durable Object per room holds the authoritative game: it rolls the dice,
// re-checks every submitted round against the same rules module the app uses,
// and broadcasts the state to everyone in the room.

import { createBoard } from '../../web/js/rules/board.js';
import { rollDice, validateRound, ROUNDS } from '../../web/js/rules/game.js';
import { scoreBoard } from '../../web/js/rules/scoring.js';

const MAX_PLAYERS = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const CODE_LENGTH = 4;
const IDLE_MS = 12 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CORS, ...(init.headers || {}) },
  });
}

function newCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function roomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/api/health') return json({ ok: true, rounds: ROUNDS });

    if (url.pathname === '/api/room' && request.method === 'POST') {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = newCode();
        const res = await roomStub(env, code).fetch(new Request(`https://room/claim?code=${code}`, { method: 'POST' }));
        if (res.ok) return json({ code });
      }
      return json({ error: 'Could not allocate a room code.' }, { status: 503 });
    }

    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-Z0-9]{4,6}$/.test(code)) return json({ error: 'Bad room code.' }, { status: 400 });
      return roomStub(env, code).fetch(request);
    }

    return json({ error: 'Not found.' }, { status: 404 });
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.game = null;
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.game = (await this.state.storage.get('game')) || null;
    this.loaded = true;
  }

  async save() {
    await this.state.storage.put('game', this.game);
    await this.state.storage.setAlarm(Date.now() + IDLE_MS);
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }

  freshGame(code) {
    return {
      code,
      hostId: null,
      phase: 'lobby',
      round: 0,
      dice: [],
      players: {},
      order: [],
      createdAt: Date.now(),
    };
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    if (url.pathname === '/claim') {
      const code = url.searchParams.get('code');
      if (this.game) return new Response('taken', { status: 409 });
      this.game = this.freshGame(code);
      await this.save();
      return new Response('ok');
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a websocket.', { status: 426 });
    }

    const code = (url.searchParams.get('room') || '').toUpperCase();
    const pid = url.searchParams.get('pid') || '';
    const name = (url.searchParams.get('name') || 'Player').slice(0, 14);

    if (!this.game) this.game = this.freshGame(code);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ pid });

    const admission = this.admit(pid, name);
    if (admission) {
      server.send(JSON.stringify({ type: 'error', message: admission }));
      server.close(4001, admission);
      return new Response(null, { status: 101, webSocket: client });
    }

    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Returns an error string when the player may not come in. */
  admit(pid, name) {
    if (!pid) return 'Missing player id.';
    const known = this.game.players[pid];
    if (known) {
      known.name = name;
      return null;
    }
    if (this.game.phase !== 'lobby') return 'That game has already started.';
    if (this.game.order.length >= MAX_PLAYERS) return 'That room is full.';
    this.game.players[pid] = {
      id: pid,
      name,
      board: createBoard(),
      usedSpecials: [],
      ready: false,
      score: null,
    };
    this.game.order.push(pid);
    if (!this.game.hostId) this.game.hostId = pid;
    return null;
  }

  sockets() {
    return this.state.getWebSockets();
  }

  connectedIds(exclude = null) {
    const ids = new Set();
    for (const ws of this.sockets()) {
      if (ws === exclude) continue;
      const meta = ws.deserializeAttachment();
      if (meta && meta.pid) ids.add(meta.pid);
    }
    return ids;
  }

  publicState(viewerId, exclude = null) {
    const online = this.connectedIds(exclude);
    return {
      code: this.game.code,
      phase: this.game.phase,
      round: this.game.round,
      dice: this.game.dice,
      hostId: this.game.hostId,
      you: viewerId,
      players: this.game.order
        .filter((id) => this.game.players[id])
        .map((id) => {
          const p = this.game.players[id];
          return {
            id: p.id,
            name: p.name,
            connected: online.has(p.id),
            ready: p.ready,
            board: p.board,
            usedSpecials: p.usedSpecials,
            score: p.score || undefined,
          };
        }),
    };
  }

  broadcast(exclude = null) {
    for (const ws of this.sockets()) {
      if (ws === exclude) continue;
      const meta = ws.deserializeAttachment();
      const viewer = meta && meta.pid;
      try {
        ws.send(JSON.stringify({ type: 'state', state: this.publicState(viewer, exclude) }));
      } catch {
        /* socket on its way out */
      }
    }
  }

  fail(ws, message) {
    try {
      ws.send(JSON.stringify({ type: 'error', message }));
    } catch {
      /* ignore */
    }
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    if (!this.game) return;

    const meta = ws.deserializeAttachment() || {};
    const pid = meta.pid;
    const player = this.game.players[pid];
    if (!player) return;

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'start':
        if (pid !== this.game.hostId) return this.fail(ws, 'Only the host can start.');
        if (this.game.phase !== 'lobby') return;
        this.beginRound(1);
        break;

      case 'submit': {
        if (this.game.phase !== 'round') return;
        if (msg.round !== this.game.round) return this.fail(ws, 'That round has already closed.');
        if (player.ready) return;
        const placements = Array.isArray(msg.placements) ? msg.placements.slice(0, 8) : [];
        const result = validateRound(player.board, this.game.dice, placements, player.usedSpecials);
        if (!result.ok) return this.fail(ws, result.error);
        player.board = result.board;
        player.usedSpecials = result.usedSpecials;
        player.ready = true;
        this.maybeAdvance();
        break;
      }

      case 'force':
        if (pid !== this.game.hostId) return this.fail(ws, 'Only the host can move on.');
        if (this.game.phase !== 'round') return;
        this.advance();
        break;

      case 'rematch': {
        if (pid !== this.game.hostId) return this.fail(ws, 'Only the host can restart.');
        for (const id of this.game.order) {
          const p = this.game.players[id];
          p.board = createBoard();
          p.usedSpecials = [];
          p.ready = false;
          p.score = null;
        }
        this.beginRound(1);
        break;
      }

      default:
        return;
    }

    await this.save();
    this.broadcast();
  }

  beginRound(round) {
    this.game.phase = 'round';
    this.game.round = round;
    this.game.dice = rollDice();
    for (const id of this.game.order) this.game.players[id].ready = false;
  }

  /** Move on once every player still in the room has handed their sheet in. */
  maybeAdvance(exclude = null) {
    const online = this.connectedIds(exclude);
    if (online.size === 0) return;
    const waiting = this.game.order.filter((id) => {
      const p = this.game.players[id];
      return p && !p.ready && online.has(id);
    });
    if (waiting.length === 0) this.advance();
  }

  advance() {
    if (this.game.round >= ROUNDS) {
      for (const id of this.game.order) {
        const p = this.game.players[id];
        p.score = scoreBoard(p.board);
      }
      this.game.phase = 'over';
      return;
    }
    this.beginRound(this.game.round + 1);
  }

  async webSocketClose(ws) {
    await this.load();
    if (!this.game) return;
    // A player leaving mid-round must not stall everyone else.
    if (this.game.phase === 'round') this.maybeAdvance(ws);
    await this.save();
    this.broadcast(ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
