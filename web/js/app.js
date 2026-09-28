// MAINLINE — a roll-and-draw route building game for up to ten phones.

import { TILES, SPECIALS, SPECIAL_ALLOWANCE, distinctOrientations } from './rules/tiles.js';
import { SIZE, cloneBoard, legalCells, canPlace, place, idx, hasAnyPlacement } from './rules/board.js';
import { scoreBoard, NETWORK_TABLE } from './rules/scoring.js';
import { validateRound, ROUNDS } from './rules/game.js';
import { renderBoard, boardMarkup, VIEWBOX } from './ui/boardview.js';
import { tileSVG } from './ui/tilesvg.js';
import { serverUrl, hasServer, playerId, playerName, setPlayerName } from './config.js';
import { SoloSession, OnlineSession } from './session.js';

const MAX_PLAYERS = 10;

const ui = {
  screen: 'home',
  session: null,
  mode: null,
  draftName: playerName(),
  draftCode: (location.hash.match(/[A-Z0-9]{4,6}/i) || [''])[0].toUpperCase(),
  turn: null,
  selected: null,
  panel: null,
  viewing: null,
  message: '',
  busy: false,
};

const root = document.getElementById('screen');
const statusEl = document.getElementById('status');

/* ------------------------------------------------------------------ utils */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

function say(message) {
  ui.message = message;
  render();
  if (message) {
    clearTimeout(say.timer);
    say.timer = setTimeout(() => {
      ui.message = '';
      render();
    }, 3200);
  }
}

/* ------------------------------------------------------- turn bookkeeping */

function meOf(state) {
  if (!state) return null;
  return state.players.find((p) => p.id === state.you) || null;
}

function syncTurn(state) {
  const me = meOf(state);
  if (!me || state.phase !== 'round') {
    ui.turn = null;
    ui.selected = null;
    return;
  }
  const stale = !ui.turn || ui.turn.round !== state.round || me.ready !== ui.turn.readyMirror;
  if (stale) {
    ui.turn = {
      round: state.round,
      readyMirror: me.ready,
      base: me.board,
      board: cloneBoard(me.board),
      placements: [],
    };
    ui.selected = null;
  }
}

function spentDice() {
  const set = new Set();
  for (const p of ui.turn.placements) if (p.src !== 'special') set.add(p.src);
  return set;
}

function specialsThisRound() {
  return ui.turn.placements.filter((p) => p.src === 'special').length;
}

function specialsSpent(state) {
  const me = meOf(state);
  return new Set([...(me.usedSpecials || []), ...ui.turn.placements.filter((p) => p.src === 'special').map((p) => p.t)]);
}

function selectDie(index) {
  const state = ui.session.state;
  if (spentDice().has(index)) return;
  const t = state.dice[index];
  ui.selected = { src: index, t, rot: 0, flip: 0 };
  render();
}

function selectSpecial(tileId) {
  const state = ui.session.state;
  if (specialsThisRound() >= 1) return say('One special piece per round.');
  if (specialsSpent(state).size >= SPECIAL_ALLOWANCE) return say('No special pieces left.');
  if (specialsSpent(state).has(tileId)) return say('That special piece is spent.');
  ui.selected = { src: 'special', t: tileId, rot: 0, flip: 0 };
  render();
}

function tapCell(cell) {
  if (!ui.turn) return;
  const existing = ui.turn.placements.findIndex((p) => idx(p.r, p.c) === cell);
  if (existing >= 0) {
    undoTo(existing);
    return;
  }
  if (!ui.selected) return;
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  const { t, rot, flip, src } = ui.selected;
  if (!canPlace(ui.turn.board, t, rot, flip, r, c)) return;
  place(ui.turn.board, t, rot, flip, r, c, { src });
  ui.turn.placements.push({ t, rot, flip, r, c, src });
  ui.selected = null;
  render();
}

function undoTo(index) {
  const keep = ui.turn.placements.slice(0, index);
  ui.turn.placements = [];
  ui.turn.board = cloneBoard(ui.turn.base);
  for (const p of keep) {
    place(ui.turn.board, p.t, p.rot, p.flip, p.r, p.c, { src: p.src });
    ui.turn.placements.push(p);
  }
  ui.selected = null;
  render();
}

function undoLast() {
  if (!ui.turn || !ui.turn.placements.length) return;
  undoTo(ui.turn.placements.length - 1);
}

function rotate() {
  if (!ui.selected) return;
  ui.selected.rot = (ui.selected.rot + 1) % 4;
  render();
}

function flip() {
  if (!ui.selected) return;
  ui.selected.flip ^= 1;
  render();
}

function submitRound() {
  const state = ui.session.state;
  const me = meOf(state);
  const result = validateRound(ui.turn.base, state.dice, ui.turn.placements, me.usedSpecials || []);
  if (!result.ok) return say(result.error);
  ui.session.submit(ui.turn.placements);
}

/* ------------------------------------------------------------- rendering */

function chip(text, cls = '') {
  return `<span class="chip ${cls}">${esc(text)}</span>`;
}

// The MNBG tape library runs its games in a frame named "mnbglibrary"; inside
// it, the start screen offers a way back.
const IN_LIBRARY = window.parent !== window && window.name === 'mnbglibrary';
// Tell the library we have our own way back, so it can hide its eject tab.
if (IN_LIBRARY) window.parent.postMessage({ type: 'mnbglibrary:hello', exit: true }, location.origin);

function renderHome() {
  const server = hasServer();
  return `
    <section class="stack">
      <div class="hero">
        <h1 class="wordmark">MAINLINE</h1>
        <p class="lede">Roll four dice, draw the same four routes, build the best network on your own sheet. Seven rounds, up to ten players, one phone each.</p>
      </div>

      <label class="field">
        <span class="field-label">Your name</span>
        <input id="input-name" class="input" maxlength="14" placeholder="Player" value="${esc(ui.draftName)}" autocomplete="nickname">
      </label>

      <div class="stack tight">
        <button class="btn btn-primary" data-act="create" ${server ? '' : 'disabled'}>Create a room</button>
        <div class="row">
          <input id="input-code" class="input mono" maxlength="6" placeholder="CODE" value="${esc(ui.draftCode)}" autocapitalize="characters" spellcheck="false">
          <button class="btn" data-act="join" ${server ? '' : 'disabled'}>Join</button>
        </div>
        ${server ? '' : '<p class="note">This build has no room server configured, so online play is unavailable. Solo play works offline.</p>'}
      </div>

      <div class="rule"></div>

      <button class="btn btn-ghost" data-act="solo">Play solo</button>
      <button class="btn btn-ghost" data-act="rules">How to play</button>
      ${IN_LIBRARY ? '<button class="btn btn-ghost" data-act="library">Back to the library</button>' : ''}
    </section>
  `;
}

function renderLobby(state) {
  const isHost = state.you === state.hostId;
  const link = `${location.origin}${location.pathname}#${state.code}`;
  return `
    <section class="stack">
      <div class="panel">
        <div class="panel-label">Room code</div>
        <div class="roomcode">${esc(state.code)}</div>
        <button class="btn btn-ghost" data-act="share" data-link="${esc(link)}">Copy invite link</button>
      </div>

      <div class="panel">
        <div class="panel-label">Players ${state.players.length} / ${MAX_PLAYERS}</div>
        <ul class="players">
          ${state.players
            .map(
              (p) => `<li class="player">
                <span class="avatar">${esc(initials(p.name))}</span>
                <span class="player-name">${esc(p.name)}${p.id === state.hostId ? ' <em>host</em>' : ''}</span>
                <span class="dot ${p.connected ? 'on' : 'off'}"></span>
              </li>`
            )
            .join('')}
        </ul>
      </div>

      ${isHost
        ? `<button class="btn btn-primary" data-act="start">Start the game</button>`
        : `<p class="note">Waiting for the host to start.</p>`}
      <button class="btn btn-ghost" data-act="leave">Leave room</button>
    </section>
  `;
}

function dieButton(state, i) {
  const t = state.dice[i];
  const used = spentDice().has(i);
  const sel = ui.selected && ui.selected.src === i;
  const dead = !used && !hasAnyPlacement(ui.turn.board, t);
  const rot = sel ? ui.selected.rot : 0;
  const fl = sel ? ui.selected.flip : 0;
  const cls = ['die', used ? 'is-used' : '', sel ? 'is-sel' : '', dead ? 'is-dead' : ''].join(' ');
  return `<button class="${cls}" data-act="die" data-i="${i}" ${used ? 'disabled' : ''} aria-label="${esc(TILES[t].name)}">
      ${tileSVG(t, rot, fl)}
    </button>`;
}

function specialsRow(state) {
  const spent = specialsSpent(state);
  const left = SPECIAL_ALLOWANCE - spent.size;
  const blocked = specialsThisRound() >= 1 || left <= 0;
  return `
    <div class="tray-label">Special pieces <span class="counter">${left} left</span></div>
    <div class="tray specials">
      ${SPECIALS.map((t) => {
        const used = spent.has(t);
        const sel = ui.selected && ui.selected.src === 'special' && ui.selected.t === t;
        const disabled = used || (blocked && !sel);
        const rot = sel ? ui.selected.rot : 0;
        const fl = sel ? ui.selected.flip : 0;
        return `<button class="die small ${used ? 'is-used' : ''} ${sel ? 'is-sel' : ''}" data-act="special" data-t="${t}" ${disabled ? 'disabled' : ''} aria-label="${esc(TILES[t].name)}">${tileSVG(t, rot, fl)}</button>`;
      }).join('')}
    </div>`;
}

function renderGame(state) {
  const me = meOf(state);
  const ready = me.ready;
  const canFlip = ui.selected && distinctOrientations(ui.selected.t).length > 4;
  const waiting = state.players.filter((p) => !p.ready && p.connected).length;
  const isHost = state.you === state.hostId;

  return `
    <section class="game">
      <div class="strip">
        <span class="round">Round ${state.round} <em>/ ${ROUNDS}</em></span>
        ${state.code === 'SOLO' ? '' : chip(state.code, 'mono')}
        <button class="btn btn-mini" data-act="rules">Rules</button>
      </div>

      ${ready
        ? `<div class="banner">Sheet submitted. Waiting for ${waiting} more ${waiting === 1 ? 'player' : 'players'}.
            ${isHost && waiting > 0 ? '<button class="btn btn-mini" data-act="force">Move on</button>' : ''}</div>`
        : `<div class="tray-label">This round's dice</div>
           <div class="tray">${state.dice.map((_, i) => dieButton(state, i)).join('')}</div>
           ${specialsRow(state)}`}

      <div class="boardwrap">
        <svg id="board" class="board" viewBox="${VIEWBOX}" role="img" aria-label="Your sheet"></svg>
      </div>

      ${ready
        ? ''
        : `<div class="controls">
            <button class="btn" data-act="rotate" ${ui.selected ? '' : 'disabled'}>Turn</button>
            <button class="btn" data-act="flip" ${canFlip ? '' : 'disabled'}>Mirror</button>
            <button class="btn" data-act="undo" ${ui.turn.placements.length ? '' : 'disabled'}>Undo</button>
            <button class="btn btn-primary" data-act="submit">Done</button>
          </div>`}

      <div class="tray-label">Players</div>
      <ul class="roster">
        ${state.players
          .map(
            (p) => `<li class="roster-item ${p.ready ? 'is-ready' : ''}" data-act="view" data-pid="${esc(p.id)}">
              <span class="avatar">${esc(initials(p.name))}</span>
              <span class="roster-name">${esc(p.name)}</span>
              <span class="tick">${p.ready ? '✓' : p.connected ? '·' : '—'}</span>
            </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

/** Renders a total with a real minus sign rather than a hyphen. */
function signed(n) {
  return n < 0 ? `\u2212${Math.abs(n)}` : String(n);
}

function scoreCard(player, rank) {
  const s = player.score || scoreBoard(player.board);
  return `
    <li class="scorecard ${rank === 0 ? 'is-top' : ''}" data-act="view" data-pid="${esc(player.id)}">
      <div class="scorecard-head">
        <span class="avatar">${esc(initials(player.name))}</span>
        <span class="scorecard-name">${esc(player.name)}</span>
        <span class="scorecard-total">${signed(s.total)}</span>
      </div>
      <div class="breakdown">
        <span><b>${s.network}</b> network</span>
        <span><b>${s.central}</b> centre</span>
        <span><b>${s.road}</b> road</span>
        <span><b>${s.rail}</b> rail</span>
        <span class="neg"><b>−${s.errors}</b> loose ends</span>
      </div>
    </li>`;
}

function renderResults(state) {
  const ranked = [...state.players].sort((a, b) => {
    const sa = (a.score || scoreBoard(a.board)).total;
    const sb = (b.score || scoreBoard(b.board)).total;
    return sb - sa;
  });
  const isHost = state.you === state.hostId;
  return `
    <section class="stack">
      <h2 class="section-title">Final scores</h2>
      <ul class="scorelist">${ranked.map(scoreCard).join('')}</ul>
      ${isHost ? '<button class="btn btn-primary" data-act="rematch">Play again</button>' : ''}
      <button class="btn btn-ghost" data-act="leave">Back to the start</button>
    </section>
  `;
}

function renderRules() {
  const sample = (t) => `<div class="sample">${tileSVG(t)}<span>${esc(TILES[t].name)}</span></div>`;
  return `
    <div class="sheet">
      <div class="sheet-head">
        <h2 class="section-title">How to play</h2>
        <button class="btn btn-mini" data-act="close">Close</button>
      </div>
      <div class="prose">
        <h3>The sheet</h3>
        <p>Seven by seven squares. Twelve gateways sit around the edge, three to a side — six road, six rail. The middle three by three is the centre.</p>

        <h3>A round</h3>
        <p>Four dice are rolled: three route dice and one junction die. Every player draws the same four results on their own sheet, in any order and any rotation, mirrored if you like.</p>
        <p><b>You must use as many of the four as you legally can.</b> A die you truly cannot place is lost.</p>

        <h3>Drawing a piece</h3>
        <p>Every piece must touch an existing route end or a gateway on the board edge. A road end may never meet a rail end — only an interchange lets traffic change between them. Running a route off the board edge where there is no gateway is allowed, but it will cost you at the end.</p>

        <h3>Special pieces</h3>
        <p>Six exist. You may draw one per round, three per game, and never the same one twice.</p>
        <div class="samples">${SPECIALS.map(sample).join('')}</div>

        <h3>Pieces</h3>
        <div class="samples">${['ROAD_S', 'ROAD_C', 'ROAD_T', 'RAIL_S', 'RAIL_C', 'RAIL_T', 'FLYOVER', 'HUB_S', 'HUB_C'].map(sample).join('')}</div>
        <p>The flyover carries a road over a rail without joining them. The two interchanges join road to rail.</p>

        <h3>Scoring, after seven rounds</h3>
        <ul>
          <li><b>Network.</b> Count the gateways joined into your single largest network: ${NETWORK_TABLE.slice(2).map((v, i) => `${i + 2}→${v}`).join(', ')}.</li>
          <li><b>Centre.</b> One point for each filled square of the middle three by three.</li>
          <li><b>Longest road.</b> One point per square along your longest unbroken road. A square counts once.</li>
          <li><b>Longest rail.</b> The same, for rail.</li>
          <li><b>Loose ends.</b> Minus one for every route end left pointing at an empty square or off the board.</li>
        </ul>
      </div>
    </div>`;
}

function renderViewer(state) {
  const player = state.players.find((p) => p.id === ui.viewing);
  if (!player) return '';
  const s = state.phase === 'over' ? player.score || scoreBoard(player.board) : null;
  return `
    <div class="sheet">
      <div class="sheet-head">
        <h2 class="section-title">${esc(player.name)}</h2>
        <button class="btn btn-mini" data-act="close">Close</button>
      </div>
      <div class="boardwrap">
        <svg class="board" viewBox="${VIEWBOX}">${boardMarkup(player.board, { looseEnds: s ? s.looseEnds : null })}</svg>
      </div>
      ${s
        ? `<div class="breakdown wide">
            <span><b>${s.network}</b> network</span><span><b>${s.central}</b> centre</span>
            <span><b>${s.road}</b> road</span><span><b>${s.rail}</b> rail</span>
            <span class="neg"><b>−${s.errors}</b> loose ends</span><span class="tot"><b>${signed(s.total)}</b> total</span>
          </div>`
        : ''}
    </div>`;
}

function renderStatus() {
  const s = ui.session;
  if (!s) return '';
  if (s.connection === 'local') return chip('solo');
  const map = { online: 'online', connecting: 'connecting', reconnecting: 'reconnecting', offline: 'offline', idle: '' };
  const label = map[s.connection] ?? s.connection;
  return label ? chip(label, s.connection === 'online' ? 'ok' : 'warn') : '';
}

function render() {
  const state = ui.session ? ui.session.state : null;
  if (state) syncTurn(state);

  let body = '';
  if (!state) body = renderHome();
  else if (state.phase === 'lobby') body = renderLobby(state);
  else if (state.phase === 'round') body = renderGame(state);
  else body = renderResults(state);

  let overlay = '';
  if (ui.panel === 'rules') overlay = renderRules();
  else if (ui.panel === 'view') overlay = renderViewer(state);

  root.innerHTML =
    body +
    (overlay ? `<div class="overlay">${overlay}</div>` : '') +
    (ui.message ? `<div class="toast">${esc(ui.message)}</div>` : '');

  statusEl.innerHTML = renderStatus();

  if (state && state.phase === 'round' && ui.turn) {
    const me = meOf(state);
    const svg = document.getElementById('board');
    if (svg) {
      renderBoard(svg, ui.turn.board, {
        highlights:
          !me.ready && ui.selected
            ? new Set(legalCells(ui.turn.board, ui.selected.t, ui.selected.rot, ui.selected.flip))
            : null,
        pending: new Set(ui.turn.placements.map((p) => idx(p.r, p.c))),
        interactive: !me.ready,
      });
    }
  }
}

/* --------------------------------------------------------------- actions */

function attachSession(session) {
  ui.session = session;
  session.addEventListener('state', () => render());
  session.addEventListener('error', (ev) => say(ev.detail));
  session.addEventListener('connection', () => render());
}

function currentName() {
  const input = document.getElementById('input-name');
  const name = (input ? input.value : ui.draftName).trim().slice(0, 14) || 'Player';
  ui.draftName = name;
  setPlayerName(name);
  return name;
}

async function createRoom() {
  if (ui.busy) return;
  ui.busy = true;
  try {
    const name = currentName();
    const code = await OnlineSession.create(serverUrl());
    const session = new OnlineSession(serverUrl(), playerId(), name);
    attachSession(session);
    session.join(code);
    location.hash = code;
  } catch (err) {
    say(err.message || 'Could not create the room.');
  } finally {
    ui.busy = false;
  }
}

function joinRoom() {
  const input = document.getElementById('input-code');
  const code = (input ? input.value : ui.draftCode).trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) return say('Enter the four letter room code.');
  const name = currentName();
  const session = new OnlineSession(serverUrl(), playerId(), name);
  attachSession(session);
  session.join(code);
  location.hash = code;
  render();
}

function playSolo() {
  const session = new SoloSession(currentName());
  attachSession(session);
  session.start();
}

function leave() {
  if (ui.session) ui.session.leave();
  ui.session = null;
  ui.turn = null;
  ui.selected = null;
  ui.panel = null;
  location.hash = '';
  render();
}

const ACTIONS = {
  create: createRoom,
  join: joinRoom,
  solo: playSolo,
  leave,
  start: () => ui.session.start(),
  force: () => ui.session.force(),
  rematch: () => ui.session.rematch(),
  submit: submitRound,
  rotate,
  flip,
  undo: undoLast,
  rules: () => {
    ui.panel = 'rules';
    render();
  },
  library: () => window.parent.postMessage({ type: 'mnbglibrary:eject' }, location.origin),
  close: () => {
    ui.panel = null;
    ui.viewing = null;
    render();
  },
};

document.addEventListener('click', (ev) => {
  const hit = ev.target.closest('[data-act]');
  if (!hit) return;
  const act = hit.dataset.act;

  if (act === 'die') return selectDie(Number(hit.dataset.i));
  if (act === 'special') return selectSpecial(hit.dataset.t);
  if (act === 'view') {
    ui.viewing = hit.dataset.pid;
    ui.panel = 'view';
    return render();
  }
  if (act === 'share') {
    const link = hit.dataset.link;
    if (navigator.share) navigator.share({ title: 'MAINLINE', url: link }).catch(() => {});
    else navigator.clipboard.writeText(link).then(() => say('Invite link copied.'), () => say(link));
    return;
  }
  const fn = ACTIONS[act];
  if (fn) fn();
});

document.addEventListener('pointerdown', (ev) => {
  const hit = ev.target.closest('[data-cell]');
  if (!hit) return;
  tapCell(Number(hit.dataset.cell));
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'input-name') ui.draftName = ev.target.value;
  if (ev.target.id === 'input-code') ui.draftCode = ev.target.value.toUpperCase();
});

document.getElementById('brand').addEventListener('click', () => {
  if (ui.session) return;
  ui.panel = null;
  render();
});

/* ------------------------------------------------------------------ boot */

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
