// SATIT Orbital — talks to the Cloudflare Worker: leaderboard (D1) and online rooms (Durable Objects).
// Everything degrades gracefully: the game is fully playable offline.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool.

export async function probe() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.ok);
  } catch { return false; }
}

async function call(path, opts = {}, timeoutMs = 0) {
  let timer = null;
  const o = { ...opts };
  if (timeoutMs && typeof AbortController !== 'undefined') {
    const ctl = new AbortController();
    o.signal = ctl.signal;
    timer = setTimeout(() => ctl.abort(), timeoutMs);
  }
  let r;
  try { r = await fetch(path, o); } catch (e) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  } finally { clearTimeout(timer); }
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) {
    const err = new Error((body && typeof body.error === 'string' && body.error) || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return body;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export function getLeaderboard(mission, level, challenge) {
  const q = new URLSearchParams({ mission, level });
  if (challenge) q.set('challenge', challenge);
  return call(`/api/leaderboard?${q}`, { cache: 'no-store' });
}

export function submitScore(payload) {
  return call('/api/scores', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
}

// A server-issued seed for an open (ranked) run. Short timeout so an offline player is not kept waiting.
export function issueSeed(mission, level) {
  return call('/api/seed', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ mission, level }) }, 4000);
}

export function getDaily() {
  return call('/api/daily', { cache: 'no-store' }, 6000);
}

export function getDailyBoard(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  return call(`/api/daily/leaderboard${q}`, { cache: 'no-store' });
}

export function getReplay(id) {
  return call(`/api/replay?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
}

// Classroom (no free text anywhere: codes and generated callsigns only).
export function createClass() {
  return call('/api/class', { method: 'POST', headers: JSON_HEADERS, body: '{}' });
}
export function getClass(code) {
  return call(`/api/class/${encodeURIComponent(code)}`, { cache: 'no-store' });
}
export function deleteClass(code, teacherKey) {
  return call(`/api/class/${encodeURIComponent(code)}`, { method: 'DELETE', headers: { 'x-teacher-key': teacherKey } });
}

export function createRoom() {
  return call('/api/room', { method: 'POST' });
}

export class Room {
  // opts.spectate: join as a watcher (no seat, cannot act).
  constructor(code, handlers, opts = {}) {
    this.code = code;
    this.spectate = !!opts.spectate;
    this.handlers = handlers;
    this.ws = null;
    this.closedByUser = false;
    this.retries = 0;
    this.want = null;
    this.role = null;
    this.token = null; // lets us reclaim our seat after a dropped connection
    this.beat = null;
  }

  connect(want) {
    this.want = want;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/room/${encodeURIComponent(this.code)}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      // Rejoin the same seat after a reconnect.
      if (this.spectate) ws.send(JSON.stringify({ t: 'join', spectate: true }));
      else ws.send(JSON.stringify({ t: 'join', want: this.role || this.want, token: this.token }));
      clearInterval(this.beat);
      this.beat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 20000);
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return; // ignore an old socket after reconnecting
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'welcome') { this.role = msg.role; this.token = msg.token || null; }
      const h = this.handlers[msg.t];
      if (h) h(msg);
    };
    ws.onclose = (e) => {
      if (ws !== this.ws) return;
      clearInterval(this.beat);
      if (this.closedByUser) return;
      if (e && e.code === 4000) { if (this.handlers.close) this.handlers.close(); return; } // seat taken over by our newer connection
      if (this.retries < 4) {
        this.retries++;
        setTimeout(() => { if (!this.closedByUser) this.connect(this.want); }, 600 * this.retries);
        if (this.handlers.reconnecting) this.handlers.reconnecting();
      } else if (this.handlers.close) this.handlers.close();
    };
    ws.onerror = () => { /* onclose handles retries */ };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  leave() {
    this.closedByUser = true;
    clearInterval(this.beat);
    try { this.ws && this.ws.close(1000, 'bye'); } catch { /* ignore */ }
  }
}
