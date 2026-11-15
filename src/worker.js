// SATIT Orbital — Cloudflare Worker: static game + API.
//   D1 (env.DB): leaderboard. Scores are recomputed on the server from the design, seed and decisions.
//   Durable Objects (env.ROOMS): one MissionRoom per online co-op room, WebSocket hibernation API.
// Code written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { DurableObject } from 'cloudflare:workers';
import { normalizeConfig, evaluate, runMission, scoreMission, encodeDesign, isLevel, isMission, CODE_RE, challengeSeed, hashString } from '../public/js/engine.js';
import { CALLSIGN_WORDS, ROLE_ORDER } from '../public/js/data.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CALLSIGN_RE = new RegExp(`^(${CALLSIGN_WORDS.a.join('|')})-(${CALLSIGN_WORDS.b.join('|')})-[0-9]{2}$`);
const MAX_SPECTATORS = 20;
const MAX_SOCKETS = 6 + MAX_SPECTATORS; // 4 seats plus room for reconnects, plus spectators
const DAILY_MISSIONS = ['cube', 'fire', 'relay', 'rock', 'mars'];
const DAILY_LEVEL = 'eng';
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED_MAX_AGE_MS = 6 * 60 * 60 * 1000;

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

function randomId(len, alphabet = ID_ALPHABET) {
  const out = [];
  const limit = 256 - (256 % alphabet.length); // rejection sampling: no modulo bias
  while (out.length < len) {
    const bytes = new Uint8Array(len * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) { if (b < limit && out.length < len) out.push(alphabet[b % alphabet.length]); }
  }
  return out.join('');
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Daily challenge ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function utcDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && utcDate(t) === s;
}
// Everyone gets the same mission, level and emergencies on a given UTC day.
function dailyFor(date) {
  const mission = DAILY_MISSIONS[hashString('daily:' + date) % DAILY_MISSIONS.length];
  const level = DAILY_LEVEL;
  const seed = hashString('daily:' + date + ':' + mission + ':' + level) >>> 0;
  return { date, mission, level, seed };
}

function dailyInfo() {
  const now = Date.now();
  const d = dailyFor(utcDate(now));
  return json({ ...d, endsAt: Math.floor(now / DAY_MS) * DAY_MS + DAY_MS });
}

async function dailyLeaderboard(url, env) {
  const date = url.searchParams.get('date') || utcDate(Date.now());
  if (!validDate(date)) throw new HttpError(400, 'Bad date');
  const d = dailyFor(date);
  const { results } = await env.DB.prepare('SELECT id, callsign, score, stars, created_at FROM scores WHERE daily = ?1 AND mission = ?2 ORDER BY score DESC, id ASC LIMIT 20').bind(date, d.mission).all();
  return json({ date, mission: d.mission, level: d.level, scores: results });
}

// ---------- Server-issued seeds ----------
async function issueSeed(request, env) {
  const body = await readJson(request, 1024);
  const mission = String(body.mission || '');
  const level = String(body.level || '');
  if (!isMission(mission) || !isLevel(level)) throw new HttpError(400, 'Unknown mission or level');
  const now = Date.now();
  // Opportunistic cleanup keeps the table small without a cron job.
  await env.DB.prepare('DELETE FROM issued_seeds WHERE issued_at < ?1').bind(now - DAY_MS).run();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM issued_seeds WHERE used = 0 AND issued_at > ?1').bind(now - 60 * 1000).first();
  if (recent && recent.n > 300) throw new HttpError(429, 'Too many missions starting right now. Try again in a minute.');
  const id = randomId(16);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  await env.DB.prepare('INSERT INTO issued_seeds (id, seed, mission, level, issued_at, used) VALUES (?1, ?2, ?3, ?4, ?5, 0)').bind(id, seed, mission, level, now).run();
  return json({ id, seed });
}

// ---------- Leaderboard ----------
async function leaderboard(url, env) {
  const mission = url.searchParams.get('mission') || 'fire';
  const level = url.searchParams.get('level') || 'cadet';
  const challenge = url.searchParams.get('challenge') || '';
  if (!isMission(mission) || !isLevel(level)) throw new HttpError(400, 'Unknown mission or level');
  if (challenge && !CODE_RE.test(challenge)) throw new HttpError(400, 'Bad challenge code');
  const stmt = challenge
    ? env.DB.prepare('SELECT id, callsign, score, stars, level, created_at FROM scores WHERE challenge = ?1 AND mission = ?2 AND level = ?3 ORDER BY score DESC LIMIT 20').bind(challenge, mission, level)
    : env.DB.prepare('SELECT id, callsign, score, stars, level, created_at FROM scores WHERE mission = ?1 AND level = ?2 AND challenge IS NULL AND daily IS NULL ORDER BY score DESC LIMIT 20').bind(mission, level);
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
  const daily = body.daily ? String(body.daily) : null;
  if (daily && challenge) throw new HttpError(400, 'A run is either a challenge or a daily run');
  const decisions = Array.isArray(body.decisions) ? body.decisions.slice(0, 12).map((d) => String(d).slice(0, 16)) : [];
  const callsign = String(body.callsign || '');
  if (!CALLSIGN_RE.test(callsign)) throw new HttpError(400, 'Bad callsign');
  const cls = body.class ? String(body.class) : null;
  if (cls) {
    if (!CODE_RE.test(cls)) throw new HttpError(400, 'Bad class code');
    const row = await env.DB.prepare('SELECT code FROM classes WHERE code = ?1').bind(cls).first();
    if (!row) throw new HttpError(400, 'Unknown class');
  }

  // The server decides the seed. The client's own seed and score are never used.
  let seed;
  let seedId = null;
  if (challenge) {
    seed = challengeSeed(challenge, cfg.missionId, cfg.level);
  } else if (daily) {
    if (!validDate(daily)) throw new HttpError(400, 'Bad daily date');
    const today = Date.now();
    if (daily !== utcDate(today) && daily !== utcDate(today - DAY_MS)) throw new HttpError(400, 'That daily challenge is closed');
    const d = dailyFor(daily);
    if (cfg.missionId !== d.mission || cfg.level !== d.level) throw new HttpError(400, 'This is not the daily mission');
    seed = d.seed;
  } else {
    seedId = typeof body.seedId === 'string' ? body.seedId : '';
    if (!/^[A-Z0-9]{16}$/.test(seedId)) throw new HttpError(400, 'A mission seed is required');
    const row = await env.DB.prepare('SELECT seed, mission, level, issued_at, used FROM issued_seeds WHERE id = ?1').bind(seedId).first();
    if (!row) throw new HttpError(400, 'Unknown or expired mission seed');
    if (row.used) throw new HttpError(409, 'This mission seed was already used');
    if (Date.now() - row.issued_at > SEED_MAX_AGE_MS) throw new HttpError(400, 'Unknown or expired mission seed');
    if (row.mission !== cfg.missionId || row.level !== cfg.level) throw new HttpError(400, 'This seed belongs to a different mission');
    seed = row.seed;
  }

  // Never trust the client's score: replay the mission deterministically.
  const sim = runMission(cfg, seed, decisions);
  const s = scoreMission(cfg, sim);
  if (!Number.isFinite(s.total)) throw new HttpError(400, 'Could not score this mission');
  const score = Math.round(s.total);

  // Store the score. For open runs the seed is spent in the same transaction, so a failed insert never
  // burns the player's seed, and two racing submits cannot both win.
  const cols = 'mission, level, challenge, callsign, score, stars, design, seed, decisions, daily, class';
  const vals = [cfg.missionId, cfg.level, challenge, callsign, score, s.stars, encodeDesign(cfg), seed, JSON.stringify(decisions), daily, cls];
  let ins;
  if (seedId) {
    const [, inserted] = await env.DB.batch([
      env.DB.prepare('UPDATE issued_seeds SET used = 1 WHERE id = ?1 AND used = 0').bind(seedId),
      env.DB.prepare(`INSERT INTO scores (${cols}) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11 WHERE changes() = 1`).bind(...vals)
    ]);
    if (!inserted.meta || inserted.meta.changes !== 1) throw new HttpError(409, 'This mission seed was already used');
    ins = inserted;
  } else {
    ins = await env.DB.prepare(`INSERT INTO scores (${cols}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(...vals).run();
  }
  const rankStmt = challenge
    ? env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE challenge = ?1 AND mission = ?2 AND level = ?3 AND score > ?4').bind(challenge, cfg.missionId, cfg.level, score)
    : daily
      ? env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE daily = ?1 AND mission = ?2 AND score > ?3').bind(daily, cfg.missionId, score)
      : env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE mission = ?1 AND level = ?2 AND challenge IS NULL AND daily IS NULL AND score > ?3').bind(cfg.missionId, cfg.level, score);
  const rankRow = await rankStmt.first();
  return json({ ok: true, id: ins.meta ? ins.meta.last_row_id : null, score, stars: s.stars, rank: rankRow ? rankRow.rank : null });
}

// ---------- Replays ----------
async function replay(url, env) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Bad run id');
  const row = await env.DB.prepare('SELECT id, mission, level, callsign, score, stars, design, seed, decisions, challenge, daily, created_at FROM scores WHERE id = ?1').bind(id).first();
  if (!row || row.seed === null || row.seed === undefined) throw new HttpError(404, 'No replay for this run');
  // Everyone on a daily or challenge board faces the same seed, so replays stay hidden while the board is open.
  const now = Date.now();
  if (row.daily && (row.daily === utcDate(now) || row.daily === utcDate(now - DAY_MS))) throw new HttpError(403, 'Replays of a daily challenge unlock when it closes');
  const made = Date.parse(String(row.created_at).replace(' ', 'T') + 'Z');
  if (row.challenge && Number.isFinite(made) && now - made < 3 * 60 * 60 * 1000) throw new HttpError(403, 'Replays of a challenge unlock after 3 hours');
  let decisions = [];
  try { const d = JSON.parse(row.decisions || '[]'); if (Array.isArray(d)) decisions = d.slice(0, 12).map((x) => String(x)); } catch { /* keep empty */ }
  return json({
    id: row.id, mission: row.mission, level: row.level, callsign: row.callsign, score: row.score, stars: row.stars,
    design: row.design, seed: row.seed, decisions, challenge: row.challenge, daily: row.daily, created_at: row.created_at
  });
}

// ---------- Classrooms (random codes only, no names or free text) ----------
async function createClass(env) {
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM classes WHERE created_at > datetime('now', '-1 hour')").first();
  if (recent && recent.n >= 100) throw new HttpError(429, 'Too many classes created right now. Try again later.');
  const teacherKey = randomId(16);
  const hash = await sha256Hex(teacherKey);
  for (let tries = 0; tries < 8; tries++) {
    const code = randomId(5, CODE_ALPHABET);
    const res = await env.DB.prepare('INSERT OR IGNORE INTO classes (code, teacher_hash) VALUES (?1, ?2)').bind(code, hash).run();
    if (res.meta && res.meta.changes === 1) return json({ code, teacherKey });
  }
  throw new HttpError(500, 'Could not create a class');
}

async function viewClass(code, env) {
  const cls = await env.DB.prepare('SELECT code, created_at FROM classes WHERE code = ?1').bind(code).first();
  if (!cls) throw new HttpError(404, 'Class not found');
  const { results } = await env.DB.prepare('SELECT callsign, COUNT(*) AS runs, MAX(score) AS best, MAX(stars) AS bestStars, GROUP_CONCAT(DISTINCT mission) AS missions FROM scores WHERE class = ?1 GROUP BY callsign ORDER BY best DESC, callsign ASC LIMIT 200').bind(code).all();
  const totalRow = await env.DB.prepare('SELECT COUNT(DISTINCT callsign) AS n FROM scores WHERE class = ?1').bind(code).first();
  const students = results.map((r) => ({ callsign: r.callsign, runs: r.runs, best: r.best, bestStars: r.bestStars, missions: r.missions ? String(r.missions).split(',') : [] }));
  return json({ code: cls.code, createdAt: cls.created_at, students, total: totalRow ? totalRow.n : students.length });
}

async function deleteClass(code, request, env) {
  const cls = await env.DB.prepare('SELECT teacher_hash FROM classes WHERE code = ?1').bind(code).first();
  if (!cls) throw new HttpError(404, 'Class not found');
  const key = request.headers.get('x-teacher-key') || '';
  if (!/^[A-Z0-9]{16}$/.test(key) || !sameString(await sha256Hex(key), cls.teacher_hash)) throw new HttpError(403, 'Wrong teacher key');
  await env.DB.batch([
    env.DB.prepare('UPDATE scores SET class = NULL WHERE class = ?1').bind(code),
    env.DB.prepare('DELETE FROM classes WHERE code = ?1').bind(code)
  ]);
  return json({ ok: true });
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
      if (path === '/api/seed' && request.method === 'POST') return await issueSeed(request, env);
      if (path === '/api/daily' && request.method === 'GET') return dailyInfo();
      if (path === '/api/daily/leaderboard' && request.method === 'GET') return await dailyLeaderboard(url, env);
      if (path === '/api/replay' && request.method === 'GET') return await replay(url, env);
      if (path === '/api/class' && request.method === 'POST') return await createClass(env);
      const classMatch = path.match(/^\/api\/class\/([^/]+)$/);
      if (classMatch) {
        if (!CODE_RE.test(classMatch[1])) throw new HttpError(400, 'Bad class code');
        if (request.method === 'GET') return await viewClass(classMatch[1], env);
        if (request.method === 'DELETE') return await deleteClass(classMatch[1], request, env);
      }

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
    server.serializeAttachment({ role: null, token: null, spectator: false });
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

  spectators(exclude) {
    return this.ctx.getWebSockets().filter((ws) => { if (ws === exclude) return false; const a = ws.deserializeAttachment(); return !!(a && a.spectator && !a.role); });
  }

  seatsMsg(exclude) {
    return { t: 'seats', seats: this.seats(exclude), spectators: this.spectators(exclude).length };
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket already gone */ }
  }

  // Seated crew and spectators receive room traffic. Spectators never send any.
  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of [...this.seated(), ...this.spectators()]) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* ignore */ }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 32768) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const att = ws.deserializeAttachment() || { role: null, token: null, spectator: false };
    // Spectators may only (re)join or ping. Everything else from them is ignored.
    if (att.spectator && !att.role && msg.t !== 'join') return;

    switch (msg.t) {
      case 'join': {
        if (!att.role && (att.spectator || msg.spectate === true)) {
          const already = !!att.spectator;
          if (!att.spectator) {
            if (this.spectators(ws).length >= MAX_SPECTATORS) { this.send(ws, { t: 'full' }); ws.close(1008, 'Room full'); return; }
            att.spectator = true;
            ws.serializeAttachment(att);
          }
          const state = (await this.ctx.storage.get('state')) ?? null;
          const m = this.seatsMsg();
          this.send(ws, { t: 'welcome', role: 'spectator', state, seats: m.seats, spectators: m.spectators });
          if (!already) this.broadcast(m, ws); // a repeat join must not fan out to the whole room
          break;
        }
        if (!att.role) {
          // A crew member reconnecting with their seat token takes back their seat from the stale socket.
          const token = typeof msg.token === 'string' && /^[A-Z0-9]{16}$/.test(msg.token) ? msg.token : null;
          let role = null;
          if (token) {
            for (const other of this.seated()) {
              const oa = other.deserializeAttachment();
              if (other !== ws && oa.token === token) { role = oa.role; other.serializeAttachment({ role: null, token: null, spectator: false }); try { other.close(4000, 'Seat reclaimed'); } catch { /* gone */ } }
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
        const m = this.seatsMsg();
        this.send(ws, { t: 'welcome', role: att.role, token: att.token, state, seats: m.seats, spectators: m.spectators });
        this.broadcast(m, ws);
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
    this.broadcast(this.seatsMsg(ws), ws);
  }

  async webSocketError(ws) {
    this.broadcast(this.seatsMsg(ws), ws);
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
