// SATIT Orbital — Cloudflare Worker: static game + API.
//   D1 (env.DB): leaderboard. Scores are recomputed on the server from the design, seed and decisions.
//   Durable Objects (env.ROOMS): one MissionRoom per online co-op room, WebSocket hibernation API.
// Code written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { DurableObject } from 'cloudflare:workers';
import { normalizeConfig, evaluate, runMission, scoreMission, encodeDesign, isLevel, isMission, CODE_RE, challengeSeed } from '../public/js/engine.js';
import { CALLSIGN_WORDS, ROLE_ORDER } from '../public/js/data.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CALLSIGN_RE = new RegExp(`^(${CALLSIGN_WORDS.a.join('|')})-(${CALLSIGN_WORDS.b.join('|')})-[0-9]{2}$`);
const MAX_SOCKETS = 6; // 4 seats plus room for reconnects

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function randomCode(len = 5) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'Request too large');
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, 'Request too large');
  let body;
  try { body = JSON.parse(new TextDecoder().decode(buf)); } catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object');
  return body;
}

async function leaderboard(url, env) {
  const mission = url.searchParams.get('mission') || 'fire';
  const level = url.searchParams.get('level') || 'cadet';
  const challenge = url.searchParams.get('challenge') || '';
  if (!isMission(mission) || !isLevel(level)) throw new HttpError(400, 'Unknown mission or level');
  if (challenge && !CODE_RE.test(challenge)) throw new HttpError(400, 'Bad challenge code');
  const stmt = challenge
    ? env.DB.prepare('SELECT callsign, score, stars, level, created_at FROM scores WHERE challenge = ?1 AND mission = ?2 AND level = ?3 ORDER BY score DESC LIMIT 20').bind(challenge, mission, level)
    : env.DB.prepare('SELECT callsign, score, stars, level, created_at FROM scores WHERE mission = ?1 AND level = ?2 AND challenge IS NULL ORDER BY score DESC LIMIT 20').bind(mission, level);
  const { results } = await stmt.all();
  return json({ mission, level, challenge: challenge || null, scores: results });
}

async function submitScore(request, env) {
  const body = await readJson(request, 8192);
  const cfg = normalizeConfig(body.config);
  if (cfg.mode === 'sandbox') throw new HttpError(400, 'Sandbox missions are not ranked');
  // Only designs that could actually launch are ranked (the simulation itself does not re-check physics).
  const ev = evaluate(cfg, 'ops');
  if (!ev.ready) throw new HttpError(400, 'This design could not launch: ' + (ev.bad[0] ? ev.bad[0].t : 'not flight-ready'));
  const challenge = body.challenge ? String(body.challenge) : null;
  if (challenge && !CODE_RE.test(challenge)) throw new HttpError(400, 'Bad challenge code');
  // Challenge runs use a seed derived on the server, so every team really faces the same emergencies.
  const seed = challenge ? challengeSeed(challenge, cfg.missionId, cfg.level) : Number(body.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new HttpError(400, 'Bad seed');
  const decisions = Array.isArray(body.decisions) ? body.decisions.slice(0, 12).map((d) => String(d).slice(0, 16)) : [];
  const callsign = String(body.callsign || '');
  if (!CALLSIGN_RE.test(callsign)) throw new HttpError(400, 'Bad callsign');

  // Never trust the client's score: replay the mission deterministically.
  const sim = runMission(cfg, seed, decisions);
  const s = scoreMission(cfg, sim);
  if (!Number.isFinite(s.total)) throw new HttpError(400, 'Could not score this mission');
  await env.DB.prepare('INSERT INTO scores (mission, level, challenge, callsign, score, stars, design) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(cfg.missionId, cfg.level, challenge, callsign, Math.round(s.total), s.stars, encodeDesign(cfg)).run();
  const rankRow = challenge
    ? await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE challenge = ?1 AND mission = ?2 AND level = ?3 AND score > ?4').bind(challenge, cfg.missionId, cfg.level, Math.round(s.total)).first()
    : await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE mission = ?1 AND level = ?2 AND challenge IS NULL AND score > ?3').bind(cfg.missionId, cfg.level, Math.round(s.total)).first();
  return json({ ok: true, score: Math.round(s.total), stars: s.stars, rank: rankRow ? rankRow.rank : null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/health') return json({ ok: true, leaderboard: !!env.DB, rooms: !!env.ROOMS });

      if (path === '/api/room' && request.method === 'POST') return json({ code: randomCode() });

      const roomMatch = path.match(/^\/api\/room\/([A-Z0-9]+)\/ws$/);
      if (roomMatch) {
        if (!CODE_RE.test(roomMatch[1])) throw new HttpError(400, 'Bad room code');
        if (request.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'Expected WebSocket');
        return env.ROOMS.getByName(roomMatch[1]).fetch(request);
      }

      if (path === '/api/leaderboard' && request.method === 'GET') return await leaderboard(url, env);
      if (path === '/api/scores' && request.method === 'POST') return await submitScore(request, env);

      if (path.startsWith('/api/')) throw new HttpError(404, 'Not found');
      return env.ASSETS.fetch(request);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error('request failed', path, err && err.stack ? err.stack : String(err));
      return json({ error: 'Server error' }, 500);
    }
  }
};

// ---------- Online co-op room ----------
// Holds the Commander's shared mission state and relays crew messages. The Commander's browser runs the simulation.
export class MissionRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastTouch = 0;
    // Answer heartbeats without waking the object from hibernation.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch() {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response('Room busy', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, token: null });
    await this.touch(true);
    return new Response(null, { status: 101, webSocket: client });
  }

  seated() {
    return this.ctx.getWebSockets().filter((ws) => { const a = ws.deserializeAttachment(); return a && a.role; });
  }

  seats(exclude) {
    const seats = {};
    for (const ws of this.seated()) if (ws !== exclude) seats[ws.deserializeAttachment().role] = true;
    return seats;
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket already gone */ }
  }

  // Only seated crew receive room traffic.
  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.seated()) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* ignore */ }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 32768) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const att = ws.deserializeAttachment() || { role: null, token: null };

    switch (msg.t) {
      case 'join': {
        if (!att.role) {
          // A crew member reconnecting with their seat token takes back their seat from the stale socket.
          const token = typeof msg.token === 'string' && /^[A-Z0-9]{16}$/.test(msg.token) ? msg.token : null;
          let role = null;
          if (token) {
            for (const other of this.seated()) {
              const oa = other.deserializeAttachment();
              if (other !== ws && oa.token === token) { role = oa.role; other.serializeAttachment({ role: null, token: null }); try { other.close(4000, 'Seat reclaimed'); } catch { /* gone */ } }
            }
          }
          if (!role) {
            const taken = this.seats(ws);
            const want = ROLE_ORDER.includes(msg.want) && !taken[msg.want] ? msg.want : null;
            role = want || ROLE_ORDER.find((r) => !taken[r]);
          }
          if (!role) { this.send(ws, { t: 'full' }); ws.close(1008, 'Room full'); return; }
          att.role = role;
          att.token = token || randomCode(16);
          ws.serializeAttachment(att);
        }
        const state = (await this.ctx.storage.get('state')) ?? null;
        this.send(ws, { t: 'welcome', role: att.role, token: att.token, state, seats: this.seats() });
        this.broadcast({ t: 'seats', seats: this.seats() }, ws);
        break;
      }
      case 'state': {
        if (!att.role || !msg.state || typeof msg.state !== 'object') return;
        if (JSON.stringify(msg.state).length > 16000) return;
        // Only the Commander's state is persisted and handed to new joiners; crew edits are relayed for merging.
        if (att.role === 'cmd') await this.ctx.storage.put('state', msg.state);
        this.broadcast({ t: 'state', state: msg.state, by: att.role }, ws);
        break;
      }
      case 'ops': {
        if (att.role !== 'cmd') return;
        this.broadcast({ t: 'ops', snap: msg.snap }, ws);
        break;
      }
      case 'vote': {
        if (!att.role) return;
        this.broadcast({ t: 'vote', role: att.role, key: String(msg.key).slice(0, 32), option: String(msg.option).slice(0, 16) });
        break;
      }
      case 'suggest': {
        if (!att.role) return;
        this.broadcast({ t: 'suggest', role: att.role, slot: String(msg.slot).slice(0, 12), option: String(msg.option).slice(0, 24) }, ws);
        break;
      }
      default:
        return;
    }
    await this.touch(false);
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* already closed */ }
    this.broadcast({ t: 'seats', seats: this.seats(ws) }, ws);
  }

  async webSocketError(ws) {
    this.broadcast({ t: 'seats', seats: this.seats(ws) }, ws);
  }

  // Clean up idle rooms after a day. Throttled so chatty rooms do not write an alarm on every message.
  async touch(force) {
    const now = Date.now();
    if (!force && now - this.lastTouch < 10 * 60 * 1000) return;
    this.lastTouch = now;
    await this.ctx.storage.setAlarm(now + 24 * 60 * 60 * 1000);
  }

  async alarm() {
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.deleteAll();
    else await this.touch(true);
  }
}
