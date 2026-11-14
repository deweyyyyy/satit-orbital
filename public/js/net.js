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

async function call(path, opts) {
  const r = await fetch(path, opts);
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) throw new Error((body && body.error) || `Request failed (${r.status})`);
  return body;
}

export function getLeaderboard(mission, level, challenge) {
  const q = new URLSearchParams({ mission, level });
  if (challenge) q.set('challenge', challenge);
  return call(`/api/leaderboard?${q}`, { cache: 'no-store' });
}

export function submitScore(payload) {
  return call('/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
}

export function createRoom() {
  return call('/api/room', { method: 'POST' });
}

export class Room {
  constructor(code, handlers) {
    this.code = code;
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
      ws.send(JSON.stringify({ t: 'join', want: this.role || this.want, token: this.token }));
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
