// Smoke test against a running `wrangler dev` (default http://127.0.0.1:8787).
// Usage: node test/api-smoke.mjs [baseUrl]
import assert from 'node:assert/strict';
import { defaultConfig, runMission, scoreMission, challengeSeed } from '../public/js/engine.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');

async function main() {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.ok, true);
  console.log('health ok', health);

  // Score submission is recomputed on the server.
  const cfg = defaultConfig('fire', 'eng');
  cfg.design.sel.comms = 'x';
  const seed = 2026;
  const expected = scoreMission(cfg, runMission(cfg, seed, [])).total;
  let res = await fetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: cfg, seed, decisions: [], callsign: 'Swift-Falcon-07', score: 999999 }) });
  let body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.score, expected, 'server must ignore client score and replay');
  console.log('score ok', body);

  res = await fetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: cfg, seed, callsign: 'Robert Tables' }) });
  assert.equal(res.status, 400, 'free-text names are rejected');

  // Designs that could never launch are rejected.
  const bad = defaultConfig('mars', 'eng');
  bad.design.sel.prop = 'none';
  res = await fetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: bad, seed: 1, callsign: 'Swift-Falcon-07' }) });
  assert.equal(res.status, 400, 'unready design must be rejected');

  // Prototype keys and junk bodies are client errors, not crashes.
  res = await fetch(`${BASE}/api/leaderboard?mission=constructor&level=eng`);
  assert.equal(res.status, 400);
  res = await fetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  assert.equal(res.status, 400);

  // Challenge runs ignore the client seed and use the shared one.
  const chSeed = challengeSeed('AB2CD', 'fire', 'eng');
  const chExpected = scoreMission(cfg, runMission(cfg, chSeed, [])).total;
  res = await fetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: cfg, seed: 12345, decisions: [], callsign: 'Swift-Falcon-07', challenge: 'AB2CD' }) });
  body = await res.json();
  assert.equal(body.score, chExpected, 'challenge seed derived on the server');
  console.log('validation ok');

  res = await fetch(`${BASE}/api/leaderboard?mission=fire&level=eng`);
  body = await res.json();
  assert.ok(body.scores.some((s) => s.callsign === 'Swift-Falcon-07'));
  console.log('leaderboard ok', body.scores.length, 'rows');

  // Online room: two players get different roles and share state.
  const { code } = await (await fetch(`${BASE}/api/room`, { method: 'POST' })).json();
  assert.match(code, /^[A-Z0-9]{5}$/);
  const open = (want) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
    const inbox = [];
    ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', want })); resolve({ ws, inbox }); };
    ws.onerror = reject;
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const again = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/room/${code}/ws`);
    const inbox = [];
    ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', want: 'sci', token: wa.token })); resolve({ ws, inbox }); };
    ws.onerror = reject;
  });
  await wait(400);
  assert.equal(again.inbox.find((m) => m.t === 'welcome').role, 'cmd', 'token reclaims the Commander seat');
  c3.ws.close(); again.ws.close();
  console.log('room ok', code, wa.role, wb.role);
  a.ws.close(); b.ws.close();
  console.log('ALL SMOKE TESTS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
