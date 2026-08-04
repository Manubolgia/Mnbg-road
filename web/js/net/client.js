// Thin websocket client for the room server, with reconnection.

const RETRY_STEPS = [500, 1000, 2000, 4000, 8000, 8000];

export class RoomClient extends EventTarget {
  constructor(baseUrl) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.ws = null;
    this.room = null;
    this.pid = null;
    this.name = null;
    this.attempt = 0;
    this.closedByUs = false;
    this.status = 'idle';
  }

  get httpBase() {
    return this.baseUrl;
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: status }));
  }

  /** Ask the server for a fresh room code. */
  async createRoom() {
    const res = await fetch(`${this.httpBase}/api/room`, { method: 'POST' });
    if (!res.ok) throw new Error('Could not reach the game server.');
    const data = await res.json();
    return data.code;
  }

  connect(room, pid, name) {
    this.room = room.toUpperCase();
    this.pid = pid;
    this.name = name;
    this.closedByUs = false;
    this.open();
  }

  open() {
    const url = new URL(`${this.httpBase}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room', this.room);
    url.searchParams.set('pid', this.pid);
    url.searchParams.set('name', this.name);

    this.setStatus(this.attempt ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(url.toString());
    } catch (err) {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.attempt = 0;
      this.setStatus('online');
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.dispatchEvent(new CustomEvent('message', { detail: msg }));
    });

    ws.addEventListener('close', () => {
      this.ws = null;
      if (this.closedByUs) {
        this.setStatus('idle');
        return;
      }
      this.scheduleRetry();
    });

    ws.addEventListener('error', () => {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    });
  }

  scheduleRetry() {
    this.setStatus('offline');
    const wait = RETRY_STEPS[Math.min(this.attempt, RETRY_STEPS.length - 1)];
    this.attempt++;
    setTimeout(() => {
      if (!this.closedByUs) this.open();
    }, wait);
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  leave() {
    this.closedByUs = true;
    if (this.ws) this.ws.close();
    this.ws = null;
    this.setStatus('idle');
  }
}
