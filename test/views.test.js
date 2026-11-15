// Render checks for the network-feature screens: each view is rendered in Node with a stub state and must not
// leak "undefined", "NaN" or "[object" into the page. Run with: npm test
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ROLE_ORDER, SLOT_OWNER } from '../public/js/data.js';
import { defaultConfig, evaluate, createSim, stepDay, decide, runMission, scoreMission, suggestions, encodeDesign } from '../public/js/engine.js';
import * as V from '../public/js/views.js';
import { parseReplay, advance } from '../public/js/replay.js';

const clean = (html, label) => {
  assert.ok(typeof html === 'string' && html.length > 50, `${label}: renders something`);
  for (const bad of ['undefined', 'NaN', '[object', 'null']) assert.ok(!html.includes(bad), `${label}: contains "${bad}"`);
  return html;
};

function makeS(over = {}) {
  const S = {
    screen: 'title', cfg: defaultConfig('fire', 'eng', 'solo'), tab: 'bus', msg: 0, players: 2, challenge: '', roomInput: '', watchInput: '',
    online: { status: 'off', code: '', role: null, seats: {}, error: '', spectators: 0 }, netOk: true, seed: 4242, speed: 1,
    sim: null, runCfg: null, snap: null, votes: {}, outcome: null, launchSeq: null, result: null, sugg: [], finalSim: null,
    submitted: null, rankUp: false, board: null, boardOpen: false, boardTab: 'top', boardQ: { mission: 'fire', level: 'cadet', challenge: false },
    helpOpen: false, toast: '', rank: 1, callsign: 'Swift-Falcon-07', muted: false, has3d: false,
    daily: null, runDaily: '', seedId: null, unranked: false, starting: false, replay: null, dailyBoard: null,
    classCode: '', classOpen: false, classUi: { busy: false, error: '', created: null, viewInput: '', data: null, keyInput: '', armDelete: false, joinInput: '', joinError: '' },
    cardBusy: false, canShare: false, ev: null,
    demoEv: evaluate(defaultConfig('fire', 'cadet'), 'hangar'),
    isGuest() { return this.cfg.mode === 'online' && this.online.status === 'in' && this.online.role !== 'cmd'; },
    isSpectator() { return this.cfg.mode === 'online' && this.online.status === 'in' && this.online.role === 'spectator'; },
    myRole() { return this.cfg.mode === 'online' && this.online.status === 'in' ? this.online.role : 'cmd'; },
    ownerOf(slot) { return SLOT_OWNER[slot] || 'ops'; },
    canEdit(slot) { if (this.cfg.mode !== 'online' || this.online.status !== 'in') return true; return this.online.role === 'cmd' || this.ownerOf(slot) === this.online.role; },
    humanRoles() { return this.cfg.mode === 'online' && this.online.status === 'in' ? ROLE_ORDER.filter((r) => this.online.seats[r]) : ['cmd']; },
    seatLabel(r) { return r === 'cmd' ? { name: 'You', tag: 'YOU' } : { name: ROLES[r].npc, tag: 'AI' }; },
    currentVotes(p) { return { ...p.votes }; },
    messages(ev) { const l = ev.bad.concat(ev.warns); return l.length ? l : [{ k: 'good', who: 'sci', t: 'All good.' }]; },
    overlayHTML() { return ''; },
    ...over
  };
  S.ev = evaluate(S.cfg, S.screen === 'hangar' ? 'hangar' : 'ops');
  return S;
}

function snap(sim, outcome = null) {
  return {
    day: sim.day, days: sim.days, health: sim.health, battery: sim.battery, stored: sim.stored, storage: sim._ev.storage,
    generated: sim.generated, delivered: sim.delivered, lost: sim.lost, sci: sim.sci, budgetLeft: sim.budgetLeft, budgetStart: sim.budgetStart,
    opsStart: sim.opsStart, sandbox: sim.sandbox, status: sim.status, endReason: sim.endReason, events: sim.events, eventIdx: sim.eventIdx,
    pending: sim.pending, log: sim.log.slice(-10), history: sim.history, today: sim.today, powerLimitedDays: sim.powerLimitedDays, wise: sim.wise, outcome
  };
}

test('title screen: daily, classroom, class chip and provenance badge', () => {
  let html = clean(V.titleView(makeS({ classCode: 'ABCDE' })) + V.commonRegions(makeS()), 'title');
  assert.match(html, /DAILY CHALLENGE/);
  assert.match(html, /CLASSROOM/);
  assert.match(html, /Class <b[^>]*>ABCDE<\/b>/);
  assert.match(html, /LEAVE/);
  assert.match(html, /Originally by SATIT Orbital/);
  assert.ok(!/data-act="openDaily"[^>]*disabled/.test(html), 'daily enabled online');
  html = clean(V.titleView(makeS({ netOk: false })), 'title offline');
  assert.match(html, /data-act="openDaily"[^>]*disabled title="[^"]+"/);
});

test('mission select: watch-a-room panel and spectator state', () => {
  const S = makeS({ screen: 'select' });
  S.cfg.mode = 'online';
  let html = clean(V.selectView(S), 'select online');
  assert.match(html, /WATCH A ROOM/);
  assert.match(html, /data-act="typeWatch"/);
  S.online = { status: 'in', code: 'ABCDE', role: 'spectator', seats: { cmd: true }, error: '', spectators: 2 };
  html = clean(V.selectView(S), 'select spectator');
  assert.match(html, /STOP WATCHING/);
  assert.match(html, /You are watching this room/);
  S.online = { status: 'in', code: 'ABCDE', role: 'cmd', seats: { cmd: true }, error: '', spectators: 3 };
  assert.match(clean(V.selectView(S), 'select cmd'), /3 watching/);
});

test('hangar as a spectator: parts disabled, SPECTATING badge, daily banner and back button', () => {
  const S = makeS({ screen: 'hangar' });
  S.cfg.mode = 'online';
  S.online = { status: 'in', code: 'ABCDE', role: 'spectator', seats: { cmd: true }, error: '', spectators: 1 };
  let html = clean(V.hangarView(S), 'hangar spectator');
  assert.match(html, /SPECTATING/);
  assert.ok(!/SUGGEST/.test(html), 'spectators cannot suggest');
  assert.ok(/data-act="pickPart"[^>]*disabled/.test(html));
  const D = makeS({ screen: 'hangar', daily: { date: '2026-11-15', mission: 'rock', seed: 1, endsAt: 0 } });
  html = clean(V.hangarView(D), 'hangar daily');
  assert.match(html, /Daily challenge 2026-11-15: /);
  assert.match(html, /data-act="go" data-arg="title"/);
});

function runningReplay() {
  const cfg = defaultConfig('fire', 'eng');
  cfg.design.sel = { bus: 'm', solar: 'wing', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'cold' };
  cfg.design.inst = { tir: true, msi: true };
  const sim = runMission(cfg, 777, []);
  const parsed = parseReplay({ id: 9, mission: 'fire', level: 'eng', callsign: 'Calm-Otter-12', score: scoreMission(cfg, sim).total, stars: 2, design: encodeDesign(cfg), seed: 777, decisions: sim.decisions, challenge: null, daily: null });
  assert.ok(parsed.ok, parsed.error);
  return parsed.replay;
}

test('operations screen in replay mode: badge, back button, event, outcome and end overlays', () => {
  const R = runningReplay();
  const S = makeS({ screen: 'ops', cfg: R.cfg, replay: R });
  let guard = 0, sawDialog = false, sawOutcome = false;
  while (R.phase !== 'end' && guard++ < 5000) {
    advance(R, 100, 1);
    const d = snap(R.sim, R.outcome);
    S.ev = evaluate(S.cfg, 'ops');
    clean(V.opsView(S, d), `ops replay ${R.phase}`);
    if (R.phase === 'dialog') { sawDialog = true; const o = clean(V.eventOverlay(S, d), 'replay event'); assert.match(o, /CHOSEN IN THIS RUN/); assert.ok(!/data-act="choose"/.test(o)); }
    if (R.phase === 'outcome') { sawOutcome = true; const o = clean(V.outcomeOverlay(S, d.outcome), 'replay outcome'); assert.ok(!/data-act="continueOps"/.test(o)); }
  }
  assert.equal(R.phase, 'end');
  assert.ok(sawDialog && sawOutcome, 'the stored decisions were shown');
  const d = snap(R.sim, null);
  const html = clean(V.opsView(S, d), 'ops replay end');
  assert.match(html, /REPLAY · Calm-Otter-12/);
  assert.match(html, /data-act="exitReplay"/);
  assert.match(html, /data-act="speed"/);
  const end = clean(V.endOverlay(S, d), 'replay end');
  assert.match(end, /Replayed score/);
  assert.match(end, /Saved score/);
  assert.match(end, /BACK TO LEADERBOARD/);
});

function debriefState(over = {}) {
  const cfg = defaultConfig('fire', 'eng');
  cfg.design.sel = { bus: 'm', solar: 'wing', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'cold' };
  cfg.design.inst = { tir: true, msi: true };
  const sim = runMission(cfg, 99, []);
  return makeS({ screen: 'debrief', cfg, runCfg: cfg, seed: 99, finalSim: sim, result: scoreMission(cfg, sim), sugg: suggestions(cfg, sim), ...over });
}

test('debrief: submit, unranked, daily, class, card buttons and provenance', () => {
  let html = clean(V.debriefView(debriefState({ seedId: 'ABCDEFGH23456789' })), 'debrief');
  assert.match(html, /SUBMIT AS Swift-Falcon-07/);
  assert.match(html, /SAVE RESULT CARD/);
  assert.ok(!/SHARE RESULT/.test(html));
  assert.match(html, /Originally by SATIT Orbital/);
  html = clean(V.debriefView(debriefState({ canShare: true, runDaily: '2026-11-15', classCode: 'ABCDE', seedId: null })), 'debrief daily');
  assert.match(html, /SHARE RESULT/);
  assert.match(html, /Daily challenge 2026-11-15/);
  assert.match(html, /Class ABCDE/);
  html = clean(V.debriefView(debriefState({ unranked: true })), 'debrief unranked');
  assert.match(html, /Offline run: not ranked/);
  assert.ok(!/data-act="submitScore"/.test(html), 'no submit when unranked');
  html = clean(V.debriefView(debriefState({ seedId: 'ABCDEFGH23456789', submitted: { error: 'Seed already used' } })), 'debrief error');
  assert.match(html, /TRY AGAIN/);
  html = clean(V.debriefView(debriefState({ submitted: { ok: true, id: 5, score: 4200, stars: 2, rank: 3 }, seedId: 'ABCDEFGH23456789' })), 'debrief ranked');
  assert.match(html, /Ranked #3/);
  assert.ok(!/data-act="submitScore"/.test(html));
  html = clean(V.debriefView(debriefState({ cardBusy: true })), 'debrief card busy');
  assert.match(html, /MAKING IMAGE/);
});

test('leaderboard: all-time and today tabs with WATCH buttons', () => {
  const rows = [{ id: 11, callsign: 'Calm-Otter-12', score: 9000, stars: 3 }, { id: 12, callsign: 'Swift-Falcon-07', score: 8000.4, stars: 2 }, { callsign: 'Old-Row-01', score: 100, stars: 1 }];
  let html = clean(V.boardOverlay(makeS({ board: { scores: rows } })), 'board top');
  assert.match(html, /data-act="watch" data-arg="11"/);
  assert.equal((html.match(/data-act="watch"/g) || []).length, 2, 'rows without an id get no WATCH button');
  assert.match(html, /ALL-TIME/);
  html = clean(V.boardOverlay(makeS({ boardTab: 'today', dailyBoard: { date: '2026-11-15', mission: 'rock', level: 'eng', scores: rows } })), 'board today');
  assert.match(html, /Daily challenge 2026-11-15: /);
  assert.equal((html.match(/data-act="watch"/g) || []).length, 0, "today's daily runs cannot be replayed until the daily closes");
  clean(V.boardOverlay(makeS({ boardTab: 'today', dailyBoard: null })), 'board today loading');
  clean(V.boardOverlay(makeS({ boardTab: 'today', dailyBoard: { error: 'Oops' } })), 'board today error');
  clean(V.boardOverlay(makeS({ boardTab: 'today', dailyBoard: { date: '2026-11-15', mission: 'rock', level: 'eng', scores: [] } })), 'board today empty');
  clean(V.boardOverlay(makeS({ netOk: false })), 'board offline');
  const evil = V.boardOverlay(makeS({ board: { scores: [{ id: 1, callsign: '<img src=x onerror=alert(1)>', score: 1, stars: 1 }] } }));
  assert.ok(!evil.includes('<img'), 'callsigns are escaped');
});

test('classroom overlay: empty, created, viewing, armed delete and joined', () => {
  const data = { code: 'ABCDE', createdAt: '2026-11-15', total: 2, students: [{ callsign: 'Calm-Otter-12', runs: 3, best: 9100, bestStars: 3, missions: ['fire', 'cube'] }, { callsign: 'Swift-Falcon-07', runs: 1, best: 4000, bestStars: 1, missions: ['mars'] }] };
  const S = makeS({ classOpen: true });
  clean(V.classOverlay(S), 'class empty');
  S.classUi.created = { code: 'ABCDE', teacherKey: 'ABCDEFGH23456789' };
  S.classUi.viewInput = 'ABCDE';
  S.classUi.data = data;
  S.classUi.keyInput = 'ABCDEFGH23456789';
  let html = clean(V.classOverlay(S), 'class created');
  assert.match(html, /Save the teacher key now/);
  assert.match(html, /Calm-Otter-12/);
  assert.match(html, /PRINT REPORT/);
  assert.ok(!/data-act="printClass"[^>]*disabled/.test(html));
  S.classUi.armDelete = true;
  html = clean(V.classOverlay(S), 'class armed');
  assert.match(html, /CLICK AGAIN: DELETE ABCDE FOREVER/);
  S.classCode = 'ABCDE';
  assert.match(clean(V.classOverlay(S), 'class joined'), /You are in Class/);
  S.netOk = false;
  assert.match(clean(V.classOverlay(S), 'class offline'), /need the online version/);
});

test('help overlay credits carry the provenance badge', () => {
  assert.match(clean(V.helpOverlay(), 'help'), /Originally by SATIT Orbital/);
});

test('ground overlay shows CONNECTING while the seed is requested', () => {
  const S = makeS({ screen: 'ops', starting: true });
  assert.match(clean(V.groundOverlay(S), 'ground'), /CONNECTING/);
});
