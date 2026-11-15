// Smoke test against a running `wrangler dev` (default http://127.0.0.1:8787).
// Usage: node test/api-smoke.mjs [baseUrl]
// Covers: health, server-issued seeds, score verification, daily challenge, replays, classrooms,
// the leaderboard, online rooms and spectators.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import assert from 'node:assert/strict';
import { defaultConfig, runMission, scoreMission, challengeSeed, hashString, decodeDesign } from '../public/js/engine.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const CALLSIGN = 'Swift-Falcon-07';
const DAY_MS = 24 * 60 * 60 * 1000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body: data };
}
const post = (path, body, headers) => call('POST', path, body, headers);
const get = (path) => call('GET', path);
async function newSeed(mission, level) {
  const r = await post('/api/seed', { mission, level });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.id, /^[A-Z0-9]{16}$/);
  assert.ok(Number.isInteger(r.body.seed) && r.body.seed >= 0 && r.body.seed <= 0xffffffff);
  return r.body;
}
const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);
function dailyFor(date) {
  const missions = ['cube', 'fire', 'relay', 'rock', 'mars'];
  const mission = missions[hashString('daily:' + date) % missions.length];
  return { date, mission, level: 'eng', seed: hashString('daily:' + date + ':' + mission + ':eng') >>> 0 };
}

async function openSocket(code, join) {
  const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
  const inbox = [];
  const closed = new Promise((r) => { ws.onclose = (e) => r(e.code); });
  ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
  await new Promise((resolve, reject) => { ws.onopen = () => { if (join) ws.send(JSON.stringify(join)); resolve(); }; ws.onerror = reject; });
  return { ws, inbox, closed };
}

// A run is on a top-20 board, unless 20 other runs already scored at least as much (repeat runs on a reused database).
const onBoard = (scores, id, score) => scores.some((s) => s.id === id) || (scores.length >= 20 && scores[scores.length - 1].score >= score);

async function main() {
  const health = (await get('/api/health')).body;
  assert.equal(health.ok, true);
  console.log('health ok', health);

  // ---------- Server-issued seeds and score verification ----------
  let r = await post('/api/seed', { mission: 'constructor', level: 'eng' });
  assert.equal(r.status, 400, 'unknown mission is rejected');
  r = await post('/api/seed', 'null');
  assert.equal(r.status, 400);

  const cfg = defaultConfig('fire', 'eng');
  cfg.design.sel.comms = 'x';
  const issued = await newSeed('fire', 'eng');
  const expected = scoreMission(cfg, runMission(cfg, issued.seed, [])).total;
  r = await post('/api/scores', { config: cfg, seedId: issued.id, seed: 1, decisions: [], callsign: CALLSIGN, score: 999999 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.score, expected, 'server must ignore client seed and score and replay with its own seed');
  assert.ok(Number.isInteger(r.body.id) && r.body.id > 0, 'response carries the row id');
  assert.ok(r.body.rank >= 1);
  const openRunId = r.body.id;
  console.log('score ok', r.body);

  // A seed is single use.
  r = await post('/api/scores', { config: cfg, seedId: issued.id, decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 409, 'second submit with the same seed is a conflict');

  // Missing, unknown and mismatched seeds are rejected.
  r = await post('/api/scores', { config: cfg, seed: 2026, decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 400, 'open runs need a seedId');
  r = await post('/api/scores', { config: cfg, seedId: 'ZZZZZZZZZZZZZZZZ', decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 400, 'unknown/expired seed');
  r = await post('/api/scores', { config: cfg, seedId: "x' OR 1=1 --", decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 400, 'malformed seed id');
  const cubeSeed = await newSeed('cube', 'eng');
  r = await post('/api/scores', { config: cfg, seedId: cubeSeed.id, decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 400, 'seed issued for another mission is rejected');
  const cadetSeed = await newSeed('fire', 'cadet');
  r = await post('/api/scores', { config: cfg, seedId: cadetSeed.id, decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 400, 'seed issued for another level is rejected');
  // A rejected submit does not burn the seed.
  const okCfg = defaultConfig('cube', 'eng');
  r = await post('/api/scores', { config: okCfg, seedId: cubeSeed.id, decisions: [], callsign: CALLSIGN });
  assert.equal(r.status, 200, 'the cube seed still works for the cube mission: ' + JSON.stringify(r.body));
  console.log('seed rules ok');

  // Two racing submits with one seed: exactly one wins (the seed is spent in the same transaction as the insert).
  const raceSeed = await newSeed('fire', 'eng');
  const race = await Promise.all([0, 1].map(() => post('/api/scores', { config: cfg, seedId: raceSeed.id, decisions: [], callsign: CALLSIGN })));
  assert.deepEqual(race.map((x) => x.status).sort(), [200, 409], 'exactly one racing submit wins: ' + JSON.stringify(race.map((x) => x.status)));
  console.log('seed race ok');

  // ---------- Validation ----------
  const s2 = await newSeed('fire', 'eng');
  r = await post('/api/scores', { config: cfg, seedId: s2.id, callsign: 'Robert Tables' });
  assert.equal(r.status, 400, 'free-text names are rejected');
  const sandbox = defaultConfig('fire', 'eng', 'sandbox');
  r = await post('/api/scores', { config: sandbox, seedId: s2.id, callsign: CALLSIGN });
  assert.equal(r.status, 400, 'sandbox runs are not ranked');
  // Designs that could never launch are rejected.
  const bad = defaultConfig('mars', 'eng');
  bad.design.sel.prop = 'none';
  const sMars = await newSeed('mars', 'eng');
  r = await post('/api/scores', { config: bad, seedId: sMars.id, callsign: CALLSIGN });
  assert.equal(r.status, 400, 'unready design must be rejected');
  r = await call('GET', '/api/leaderboard?mission=constructor&level=eng');
  assert.equal(r.status, 400);
  r = await post('/api/scores', 'null');
  assert.equal(r.status, 400);
  r = await post('/api/scores', { config: cfg, seedId: s2.id, callsign: CALLSIGN, class: 'ZZZZZ' });
  assert.equal(r.status, 400, 'unknown class is rejected');
  r = await post('/api/scores', { config: cfg, seedId: s2.id, callsign: CALLSIGN, class: 'not a code' });
  assert.equal(r.status, 400, 'bad class code is rejected');

  // Challenge runs ignore the client seed and use the shared one.
  const chSeed = challengeSeed('AB2CD', 'fire', 'eng');
  const chExpected = scoreMission(cfg, runMission(cfg, chSeed, [])).total;
  r = await post('/api/scores', { config: cfg, seed: 12345, decisions: [], callsign: CALLSIGN, challenge: 'AB2CD' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.score, chExpected, 'challenge seed derived on the server');
  const challengeRunId = r.body.id;
  r = await post('/api/scores', { config: cfg, decisions: [], callsign: CALLSIGN, challenge: 'AB2CD', daily: utcDate(Date.now()) });
  assert.equal(r.status, 400, 'challenge and daily cannot be combined');
  console.log('validation ok');

  r = await get('/api/leaderboard?mission=fire&level=eng');
  assert.ok(r.body.scores.some((s) => s.callsign === CALLSIGN));
  assert.ok(r.body.scores.every((s) => Number.isInteger(s.id)), 'leaderboard rows carry ids');
  assert.ok(!r.body.scores.some((s) => s.id === challengeRunId), 'challenge runs stay off the open board');
  assert.ok(onBoard(r.body.scores, openRunId, expected), 'the run is on the open board');
  console.log('leaderboard ok', r.body.scores.length, 'rows');

  // ---------- Daily challenge ----------
  r = await get('/api/daily');
  assert.equal(r.status, 200);
  const day = r.body;
  const today = utcDate(Date.now());
  assert.equal(day.date, today);
  assert.equal(day.level, 'eng');
  assert.deepEqual({ ...dailyFor(day.date), endsAt: day.endsAt }, { ...day }, 'daily mission and seed follow the published formula');
  const nextMidnight = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS;
  assert.equal(day.endsAt, nextMidnight);
  const dcfg = defaultConfig(day.mission, 'eng');
  const dExpected = scoreMission(dcfg, runMission(dcfg, day.seed, [])).total;
  r = await post('/api/scores', { config: dcfg, seed: 5, decisions: [], callsign: CALLSIGN, daily: today });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.score, dExpected, 'daily seed derived on the server');
  const dailyRunId = r.body.id;
  // Daily runs are not tied to a single-use seed, but must match the day's mission and level.
  const otherMission = ['cube', 'fire', 'relay', 'rock', 'mars'].find((m) => m !== day.mission);
  r = await post('/api/scores', { config: defaultConfig(otherMission, 'eng'), decisions: [], callsign: CALLSIGN, daily: today });
  assert.equal(r.status, 400, 'wrong mission for the daily');
  r = await post('/api/scores', { config: defaultConfig(day.mission, 'cadet'), decisions: [], callsign: CALLSIGN, daily: today });
  assert.equal(r.status, 400, 'wrong level for the daily');
  r = await post('/api/scores', { config: dcfg, decisions: [], callsign: CALLSIGN, daily: utcDate(Date.now() - 3 * DAY_MS) });
  assert.equal(r.status, 400, 'old daily is closed');
  r = await post('/api/scores', { config: dcfg, decisions: [], callsign: CALLSIGN, daily: '2026-13-45' });
  assert.equal(r.status, 400, 'bad daily date');
  // Yesterday is still accepted, with yesterday's mission and seed.
  const yest = dailyFor(utcDate(Date.now() - DAY_MS));
  const ycfg = defaultConfig(yest.mission, 'eng');
  r = await post('/api/scores', { config: ycfg, decisions: [], callsign: CALLSIGN, daily: yest.date });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.score, scoreMission(ycfg, runMission(ycfg, yest.seed, [])).total);
  r = await get('/api/daily/leaderboard');
  assert.equal(r.status, 200);
  assert.equal(r.body.date, today);
  assert.equal(r.body.mission, day.mission);
  assert.ok(onBoard(r.body.scores, dailyRunId, dExpected), 'the run is on the daily board');
  r = await get(`/api/daily/leaderboard?date=${yest.date}`);
  assert.equal(r.body.mission, yest.mission);
  assert.ok(r.body.scores.length >= 1);
  r = await get('/api/daily/leaderboard?date=nope');
  assert.equal(r.status, 400);
  // Daily runs do not leak into the open leaderboard.
  r = await get(`/api/leaderboard?mission=${day.mission}&level=eng`);
  assert.ok(!r.body.scores.some((s) => s.id === dailyRunId), 'daily runs stay off the open board');
  console.log('daily ok', day.date, day.mission);

  // ---------- Replay round trip ----------
  const decisionsCfg = defaultConfig('fire', 'eng');
  const dSeed = await newSeed('fire', 'eng');
  const picks = ['safe', 'risky', 'safe'];
  r = await post('/api/scores', { config: decisionsCfg, seedId: dSeed.id, decisions: picks, callsign: CALLSIGN });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rid = r.body.id;
  r = await get(`/api/replay?id=${rid}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rp = r.body;
  assert.equal(rp.id, rid);
  assert.equal(rp.mission, 'fire');
  assert.equal(rp.callsign, CALLSIGN);
  assert.equal(rp.seed, dSeed.seed);
  assert.ok(Array.isArray(rp.decisions));
  assert.ok('challenge' in rp && 'daily' in rp && rp.created_at);
  const rcfg = decodeDesign(rp.design);
  assert.ok(rcfg, 'design decodes');
  const replayed = scoreMission(rcfg, runMission(rcfg, rp.seed, rp.decisions));
  assert.equal(Math.round(replayed.total), rp.score, 'replaying the stored run reproduces the stored score');
  assert.equal(replayed.stars, rp.stars);
  // Replays of boards that are still open stay hidden, so a leader's run cannot be copied and tweaked.
  r = await get(`/api/replay?id=${challengeRunId}`);
  assert.equal(r.status, 403, 'a fresh challenge run is hidden for a few hours');
  r = await get(`/api/replay?id=${dailyRunId}`);
  assert.equal(r.status, 403, "today's daily run is hidden until the daily closes");
  r = await get('/api/replay?id=999999999');
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'No replay for this run');
  r = await get('/api/replay?id=abc');
  assert.equal(r.status, 400);
  console.log('replay ok', rid);

  // ---------- Classes ----------
  r = await post('/api/class');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const { code: classCode, teacherKey } = r.body;
  assert.match(classCode, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  assert.match(teacherKey, /^[A-Z0-9]{16}$/);
  r = await get(`/api/class/${classCode}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.students, []);
  assert.equal(r.body.total, 0);
  assert.equal(r.body.code, classCode);
  assert.ok(r.body.createdAt);
  const cs1 = await newSeed('fire', 'eng');
  r = await post('/api/scores', { config: cfg, seedId: cs1.id, decisions: [], callsign: 'Bright-Comet-11', class: classCode });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const classRunId = r.body.id;
  const cs2 = await newSeed('cube', 'eng');
  r = await post('/api/scores', { config: defaultConfig('cube', 'eng'), seedId: cs2.id, decisions: [], callsign: 'Bright-Comet-11', class: classCode });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await get(`/api/class/${classCode}`);
  assert.equal(r.body.students.length, 1);
  assert.equal(r.body.total, 1);
  const st = r.body.students[0];
  assert.equal(st.callsign, 'Bright-Comet-11');
  assert.equal(st.runs, 2);
  assert.ok(st.best > 0 && st.bestStars >= 0);
  assert.deepEqual([...st.missions].sort(), ['cube', 'fire']);
  r = await get('/api/class/ZZZZZ');
  assert.equal(r.status, 404);
  r = await get('/api/class/nope');
  assert.equal(r.status, 400);
  r = await call('DELETE', `/api/class/${classCode}`, undefined, { 'x-teacher-key': 'AAAAAAAAAAAAAAAA' });
  assert.equal(r.status, 403, 'wrong teacher key');
  r = await call('DELETE', `/api/class/${classCode}`);
  assert.equal(r.status, 403, 'missing teacher key');
  r = await get(`/api/class/${classCode}`);
  assert.equal(r.status, 200, 'class survives a wrong key');
  r = await call('DELETE', `/api/class/${classCode}`, undefined, { 'x-teacher-key': teacherKey });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  r = await get(`/api/class/${classCode}`);
  assert.equal(r.status, 404, 'class is gone');
  r = await get(`/api/replay?id=${classRunId}`);
  assert.equal(r.status, 200, 'the leaderboard run itself is kept');
  const cs3 = await newSeed('fire', 'eng');
  r = await post('/api/scores', { config: cfg, seedId: cs3.id, decisions: [], callsign: CALLSIGN, class: classCode });
  assert.equal(r.status, 400, 'a deleted class no longer accepts runs');
  console.log('class ok', classCode);

  // ---------- Online room ----------
  r = await post('/api/room');
  const code = r.body.code;
  assert.match(code, /^[A-Z0-9]{5}$/);
  const open = (want) => openSocket(code, { t: 'join', want });
  const a = await open('cmd');
  await wait(300);
  const b = await open('cmd');
  await wait(300);
  const wa = a.inbox.find((m) => m.t === 'welcome');
  const wb = b.inbox.find((m) => m.t === 'welcome');
  assert.equal(wa.role, 'cmd');
  assert.notEqual(wb.role, 'cmd', 'second player gets a different seat');
  a.ws.send(JSON.stringify({ t: 'state', state: { screen: 'hangar', missionId: 'fire' } }));
  await wait(300);
  assert.ok(b.inbox.some((m) => m.t === 'state' && m.state.screen === 'hangar'), 'state relayed');
  b.ws.send(JSON.stringify({ t: 'vote', key: 'e0', option: 'safe' }));
  await wait(300);
  assert.ok(a.inbox.some((m) => m.t === 'vote' && m.role === wb.role), 'vote relayed');
  // A crew member's state is relayed but never persisted for new joiners.
  b.ws.send(JSON.stringify({ t: 'state', state: { screen: 'debrief', seed: '<img src=x>', cfg: {} } }));
  await wait(300);
  const c3 = await open(null);
  await wait(400);
  const w3 = c3.inbox.find((m) => m.t === 'welcome');
  assert.equal(w3.state.screen, 'hangar', 'only the Commander state is stored');
  assert.match(w3.token, /^[A-Z0-9]{16}$/);
  // Reclaiming a seat with its token keeps the role.
  const again = await openSocket(code, { t: 'join', want: 'sci', token: wa.token });
  await wait(400);
  assert.equal(again.inbox.find((m) => m.t === 'welcome')?.role, 'cmd', 'token reclaims the Commander seat: ' + JSON.stringify({ wa, again: again.inbox }));
  c3.ws.close(); again.ws.close();
  console.log('room ok', code, wa.role, wb.role);
  a.ws.close(); b.ws.close();
  await wait(300);

  // ---------- Spectators ----------
  r = await post('/api/room');
  const scode = r.body.code;
  const spec = await openSocket(scode, { t: 'join', spectate: true });
  await wait(300);
  const sw = spec.inbox.find((m) => m.t === 'welcome');
  assert.equal(sw.role, 'spectator');
  assert.equal(sw.spectators, 1);
  assert.deepEqual(sw.seats, {}, 'a spectator takes no seat');
  assert.equal(sw.state, null);
  assert.equal(sw.token, undefined, 'spectators get no seat token');
  const cmd = await openSocket(scode, { t: 'join', want: 'cmd' });
  await wait(300);
  const cw = cmd.inbox.find((m) => m.t === 'welcome');
  assert.equal(cw.role, 'cmd', 'the Commander seat is still free');
  assert.ok(spec.inbox.some((m) => m.t === 'seats' && m.seats.cmd === true && m.spectators === 1), 'spectator sees seats and spectator count');
  cmd.ws.send(JSON.stringify({ t: 'state', state: { screen: 'hangar', missionId: 'cube' } }));
  cmd.ws.send(JSON.stringify({ t: 'ops', snap: { day: 3 } }));
  cmd.ws.send(JSON.stringify({ t: 'vote', key: 'e1', option: 'safe' }));
  cmd.ws.send(JSON.stringify({ t: 'suggest', slot: 'comms', option: 'x' }));
  await wait(400);
  for (const t of ['state', 'ops', 'vote', 'suggest']) assert.ok(spec.inbox.some((m) => m.t === t), `spectator receives ${t}`);
  // A spectator cannot act: nothing reaches the crew and nothing is stored.
  const before = cmd.inbox.length;
  spec.ws.send(JSON.stringify({ t: 'state', state: { screen: 'debrief', evil: true } }));
  spec.ws.send(JSON.stringify({ t: 'ops', snap: { day: 99 } }));
  spec.ws.send(JSON.stringify({ t: 'vote', key: 'e1', option: 'risky' }));
  spec.ws.send(JSON.stringify({ t: 'suggest', slot: 'comms', option: 'x' }));
  spec.ws.send(JSON.stringify({ t: 'join', want: 'eng' })); // joining again must not grant a seat
  await wait(400);
  assert.deepEqual(cmd.inbox.slice(before).filter((m) => m.t !== 'seats'), [], 'spectator messages are ignored (only seat refreshes may arrive)');
  assert.equal(cmd.inbox.slice(before).filter((m) => m.t === 'seats').length, 0, 'a spectator re-joining does not fan out seat messages to the crew');
  const late = await openSocket(scode, { t: 'join', want: 'eng' });
  await wait(300);
  const lw = late.inbox.find((m) => m.t === 'welcome');
  assert.equal(lw.state.screen, 'hangar', 'spectator cannot overwrite the stored state');
  assert.equal(lw.role, 'eng', 'the engineer seat was free, so the spectator never took it');
  late.ws.close();
  // The 21st spectator is refused (the first one is already in).
  const crowd = [spec];
  for (let i = 1; i < 20; i++) crowd.push(await openSocket(scode, { t: 'join', spectate: true }));
  await wait(500);
  assert.ok(crowd.every((c) => c.inbox.some((m) => m.t === 'welcome' && m.role === 'spectator')), '20 spectators fit');
  const extra = await openSocket(scode, { t: 'join', spectate: true });
  const closeCode = await Promise.race([extra.closed, wait(2000).then(() => null)]);
  assert.ok(extra.inbox.some((m) => m.t === 'full'), 'the 21st spectator is told the room is full');
  assert.equal(closeCode, 1008);
  assert.ok(!extra.inbox.some((m) => m.t === 'welcome'));
  // Seated crew can still get in while the gallery is full.
  const crew2 = await openSocket(scode, { t: 'join', want: 'sci' });
  await wait(400);
  assert.equal(crew2.inbox.find((m) => m.t === 'welcome').role, 'sci');
  console.log('spectators ok', scode);
  for (const c of [...crowd, cmd, crew2]) c.ws.close();

  console.log('ALL SMOKE TESTS PASSED');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
