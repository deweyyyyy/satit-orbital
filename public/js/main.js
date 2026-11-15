// SATIT Orbital — app controller: state, actions, simulation loop, online sync.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { ROLES, ROLE_ORDER, SLOT_OWNER, SLOT_INFO, INSTRUMENTS, CALLSIGN_WORDS, MISSION_BY_ID, LEVELS, CATALOG, EVENTS } from './data.js';
import {
  defaultConfig, normalizeConfig, evaluate, createSim, stepDay, decide, runMission, scoreMission, suggestions,
  encodeDesign, decodeDesign, designSummary, fmtNum, fmtMoney, fmtData, CODE_RE, challengeSeed, isMission
} from './engine.js';
import * as V from './views.js';
import { sfx, setMuted, startAmbient, stopAmbient } from './fx.js';
import * as G from './scene3d.js';
import * as net from './net.js';
import * as card from './card.js';
import * as replay from './replay.js';
import * as classroom from './classroom.js';
import { ORIGIN, showCopyNotice } from './provenance.js';

const stage = document.getElementById('stage');
const live = document.getElementById('live');
const tpl = document.createElement('template');

// ---------- persistence (per-viewer conveniences only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('satit.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('satit.' + k, JSON.stringify(v)); } catch { /* storage blocked */ } }
};

function randomInt() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
function newCallsign() {
  const r = randomInt();
  const a = CALLSIGN_WORDS.a[r % CALLSIGN_WORDS.a.length];
  const b = CALLSIGN_WORDS.b[(r >>> 8) % CALLSIGN_WORDS.b.length];
  return `${a}-${b}-${String((r >>> 16) % 100).padStart(2, '0')}`;
}
function newCode() {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alpha[randomInt() % alpha.length];
  return s;
}

const demoCfg = defaultConfig('fire', 'cadet');
demoCfg.design.sel.comms = 'x';

// ---------- state ----------
const S = {
  screen: 'title',
  cfg: defaultConfig('fire', 'cadet', 'solo'),
  tab: 'bus', msg: 0, players: 2,
  challenge: '', roomInput: '',
  online: { status: 'off', code: '', role: null, seats: {}, error: '', spectators: 0 },
  netOk: false,
  watchInput: '',
  // daily challenge (S.daily = the chosen day's fixed mission), server-issued seeds, replays, classroom, result card
  daily: null, dailyLoading: false, runDaily: '', seedId: null, unranked: false, starting: false,
  replay: null, watching: 0, dailyBoard: null,
  classCode: classroom.getStoredClass(), classOpen: false,
  classUi: { busy: false, error: '', created: null, viewInput: '', data: null, keyInput: '', armDelete: false, joinInput: '', joinError: '' },
  cardBusy: false, canShare: card.canShareFiles(),
  seed: 0, sim: null, runCfg: null, snap: null, speed: 1, acc: 0, votes: {}, outcome: null,
  launchSeq: null,
  result: null, sugg: [], finalSim: null, submitted: null, rankUp: false, rankAwarded: false,
  board: null, boardOpen: false, boardTab: 'top', boardQ: { mission: 'fire', level: 'cadet', challenge: false },
  helpOpen: false, toast: '',
  rank: store.get('rank', 1), callsign: store.get('callsign', null) || newCallsign(), muted: store.get('muted', false),
  demoEv: evaluate(demoCfg, 'hangar'),
  has3d: G.supported(),
  ev: null,

  isGuest() { return this.cfg.mode === 'online' && this.online.status === 'in' && this.online.role !== 'cmd'; },
  isSpectator() { return this.cfg.mode === 'online' && this.online.status === 'in' && this.online.role === 'spectator'; },
  myRole() { return this.cfg.mode === 'online' && this.online.status === 'in' ? this.online.role : 'cmd'; },
  ownerOf(slot) { return SLOT_OWNER[slot] || 'ops'; },
  canEdit(slot) {
    if (this.cfg.mode !== 'online' || this.online.status !== 'in') return true;
    return this.online.role === 'cmd' || this.ownerOf(slot) === this.online.role;
  },
  humanRoles() {
    const mode = this.cfg.mode;
    if (mode === 'local') return ROLE_ORDER.slice(0, this.players);
    if (mode === 'online' && this.online.status === 'in') return ROLE_ORDER.filter((r) => this.online.seats[r]);
    return ['cmd'];
  },
  seatLabel(r) {
    const mode = this.cfg.mode;
    const role = ROLES[r];
    if (mode === 'local') {
      const i = ROLE_ORDER.indexOf(r);
      return i < this.players ? { name: `Player ${i + 1}`, tag: `P${i + 1}` } : { name: role.npc, tag: 'AI' };
    }
    if (mode === 'online' && this.online.status === 'in') {
      if (this.online.seats[r]) return r === this.online.role ? { name: 'You', tag: 'YOU' } : { name: 'Crew', tag: 'LIVE' };
      return { name: role.npc, tag: 'AI' };
    }
    return r === 'cmd' ? { name: 'You', tag: 'YOU' } : { name: role.npc, tag: 'AI' };
  },
  currentVotes(p) {
    const humans = this.humanRoles();
    const out = {};
    for (const r of ROLE_ORDER) {
      if (humans.includes(r)) { if (this.votes[r]) out[r] = this.votes[r]; }
      else if (p.votes[r]) out[r] = p.votes[r];
    }
    return out;
  },
  messages(ev) {
    const list = ev.bad.concat(ev.warns);
    if (list.length) return list;
    return [{ k: 'good', who: this.screen === 'launch' ? 'ops' : 'sci', t: this.screen === 'launch' ? 'Orbit and rocket check out, Commander. Every system is go for launch!' : 'All systems green, Commander! Good margins everywhere. On to launch when you are ready.' }];
  },
  overlayHTML() {
    if (this.helpOpen) return V.helpOverlay();
    if (this.boardOpen) return V.boardOverlay(this);
    if (this.classOpen) return V.classOverlay(this);
    if (this.screen === 'launch' && this.launchSeq) return V.launchOverlay(this);
    if (this.screen === 'ops') {
      const d = opsData();
      if (!d) return V.groundOverlay(this);
      const outcome = this.isGuest() || this.replay ? d.outcome : this.outcome;
      if (outcome) return V.outcomeOverlay(this, outcome);
      if (d.pending) return V.eventOverlay(this, d);
      if (d.status !== 'running') return V.endOverlay(this, d);
    }
    return '';
  }
};
store.set('callsign', S.callsign);
setMuted(S.muted);

function phaseFor(screen) { return screen === 'hangar' ? 'hangar' : screen === 'launch' ? 'launch' : 'ops'; }

function snapshot(sim, outcome = S.outcome) {
  const ev = sim._ev;
  return {
    day: sim.day, days: sim.days, health: sim.health, battery: sim.battery, stored: sim.stored, storage: ev.storage,
    generated: sim.generated, delivered: sim.delivered, lost: sim.lost, sci: sim.sci,
    budgetLeft: sim.budgetLeft, budgetStart: sim.budgetStart, opsStart: sim.opsStart, sandbox: sim.sandbox,
    status: sim.status, endReason: sim.endReason, events: sim.events, eventIdx: sim.eventIdx, pending: sim.pending,
    log: sim.log.slice(-10), history: sim.history, today: sim.today, powerLimitedDays: sim.powerLimitedDays, wise: sim.wise,
    outcome
  };
}
function opsData() {
  if (S.replay) return snapshot(S.replay.sim, S.replay.outcome);
  if (S.isGuest()) return S.snap;
  return S.sim ? snapshot(S.sim) : null;
}

// ---------- rendering ----------
const VIEWS = {
  title: () => V.titleView(S),
  select: () => V.selectView(S) + V.commonRegions(S),
  hangar: () => V.hangarView(S),
  launch: () => V.launchView(S),
  ops: () => V.opsView(S, opsData()),
  debrief: () => V.debriefView(S)
};

let lastScreen = null;
let swapping = false;
let again = false;
let lastDialog = '';
let stageScale = 1;
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function render() {
  if (swapping) { again = true; return; }
  S.ev = evaluate(S.cfg, phaseFor(S.screen));
  let html = VIEWS[S.screen]();
  if (S.screen === 'title') html += V.commonRegions(S);
  const active = document.activeElement;
  const focusKey = active && active.dataset && active.dataset.act ? `${active.dataset.act}|${active.dataset.arg || ''}` : null;
  const caret = active && active.dataset && active.dataset.input && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

  if (lastScreen !== S.screen) {
    // Page transition: the old screen blurs out, the new one flies in.
    const firstLoad = lastScreen === null;
    lastScreen = S.screen;
    const swap = () => {
      stage.innerHTML = `<div class="screen">${html}</div>`;
      live.textContent = { title: 'Title screen', select: 'Mission select', hangar: 'Hangar: build your spacecraft', launch: 'Launch and orbit', ops: 'Mission operations', debrief: 'Debrief' }[S.screen];
      const hadFocus = stage.contains(document.activeElement) || document.activeElement === document.body;
      const first = stage.querySelector('.modal h2') || stage.querySelector('h1, h2');
      if (first) { first.setAttribute('tabindex', '-1'); if (hadFocus) first.focus({ preventScroll: true }); }
      swapping = false;
      afterRender(true);
      if (again) { again = false; render(); }
    };
    if (firstLoad || reduceMotion()) { swap(); return; }
    swapping = true;
    const cur = stage.querySelector('.screen');
    if (cur) { cur.classList.add('screen-out'); cur.inert = true; }
    sfx.whoosh();
    setTimeout(swap, 190);
    return;
  }

  tpl.innerHTML = html;
  const next = tpl.content;
  const newKeys = [...next.querySelectorAll('[data-r]')].map((e) => e.dataset.r);
  const oldKeys = [...stage.querySelectorAll('[data-r]')].map((e) => e.dataset.r);
  if (newKeys.join('|') !== oldKeys.join('|')) stage.innerHTML = `<div class="screen no-anim">${html}</div>`;
  else {
    for (const n of next.querySelectorAll('[data-r]')) {
      const old = stage.querySelector(`[data-r="${n.dataset.r}"]`);
      if (!old) continue;
      // 3D hosts keep their canvas: only replace them if their key changes.
      if (old.dataset.static === '1' && old.dataset.key === n.dataset.key) continue;
      if (old.innerHTML !== n.innerHTML) {
        if (n.dataset.r === 'overlay' && old.querySelector('.modal')) n.querySelectorAll('.overlay, .modal').forEach((e) => e.classList.add('no-anim'));
        const scrolls = {};
        old.querySelectorAll('[data-scroll]').forEach((el) => { scrolls[el.dataset.scroll] = el.scrollTop; });
        old.innerHTML = n.innerHTML;
        old.querySelectorAll('[data-scroll]').forEach((el) => { if (scrolls[el.dataset.scroll] !== undefined) el.scrollTop = scrolls[el.dataset.scroll]; });
      }
      for (const attr of ['class', 'style']) if (old.getAttribute(attr) !== n.getAttribute(attr)) { if (n.hasAttribute(attr)) old.setAttribute(attr, n.getAttribute(attr)); else old.removeAttribute(attr); }
    }
  }
  if (focusKey && document.activeElement !== active) {
    const [a, g] = focusKey.split('|');
    const el = [...stage.querySelectorAll(`[data-act="${a}"]`)].find((x) => (x.dataset.arg || '') === g);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret && el.setSelectionRange) { try { el.setSelectionRange(Math.min(caret[0], el.value.length), Math.min(caret[1], el.value.length)); } catch { /* not a text input */ } }
    }
  }
  afterRender(false);
}

function afterRender(entered) {
  sync3d();
  if (S.screen === 'ops' && (S.sim || S.snap || S.replay)) startAmbient(); else stopAmbient();
  const dp = stage.querySelector('.dialog p');
  const txt = dp ? dp.textContent : '';
  if (txt && txt !== lastDialog && (S.screen === 'hangar' || S.screen === 'launch')) sfx.type(8);
  lastDialog = txt;
  if (entered && S.screen === 'debrief') countUps();
}

function countUps() {
  if (reduceMotion()) return;
  stage.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1400);
      el.textContent = fmtNum(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  });
}

const SPEED_SCALE = { 0: 0, 1: 1, 3: 1.8, 8: 3.2 };
function sync3d() {
  if (!S.has3d) return;
  const host = stage.querySelector('[data-3d]');
  if (!host || swapping) { G.sync(null); return; }
  const kind = host.dataset['3d'];
  const m = MISSION_BY_ID[S.cfg.missionId];
  const base = { stageScale, designKey: JSON.stringify(S.cfg.design) };
  let cfg;
  if (kind === 'hero') cfg = { ...base, mode: 'hero', target: 'earth', orbitId: 'sso', ev: S.demoEv, designKey: 'demo' };
  else if (kind === 'planet') cfg = { ...base, mode: 'planet', target: m.target, orbitId: m.defaults.orbit, ev: evaluate(defaultConfig(m.id, S.cfg.level), 'hangar'), designKey: 'default-' + m.id, interactive: true };
  else if (kind === 'craft') cfg = { ...base, mode: 'craft', target: 'earth', orbitId: '', ev: S.ev, interactive: true };
  else if (kind === 'orbit') cfg = { ...base, mode: 'orbit', target: m.target, orbitId: S.cfg.orbitId, ev: S.ev, interactive: true };
  else {
    const d = opsData();
    const running = !!(d && d.status === 'running');
    const busy = !d || !running || d.pending || (S.isGuest() || S.replay ? d.outcome : S.outcome);
    cfg = { ...base, mode: 'ops', target: m.target, orbitId: S.cfg.orbitId, ev: S.ev, interactive: true,
      timeScale: busy ? 0.25 : (SPEED_SCALE[S.speed] ?? 1), sending: !!(running && !busy && d.today.sent > 0), alert: !!(d && d.pending) };
  }
  let shown = false;
  try { shown = G.sync(host, cfg); } catch (e) { shown = false; }
  if (!shown) { S.has3d = false; setTimeout(render, 0); } // switch to the 2D art
}

let toastTimer = null;
function toast(msg) {
  S.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = ''; render(); }, 3200);
  render();
}

function fit() {
  const s = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
  stageScale = s;
  stage.style.transform = `scale(${s})`;
  if (lastScreen !== null) sync3d();
}
window.addEventListener('resize', fit);

// ---------- run lifecycle ----------
function resetRun() {
  S.sim = null; S.runCfg = null; S.snap = null; S.outcome = null; S.votes = {}; S.result = null; S.finalSim = null;
  S.submitted = null; S.rankUp = false; S.rankAwarded = false; S.acc = 0; S.cardBlob = null; cardToken++;
  S.seedId = null; S.unranked = false; S.runDaily = '';
}

function go(screen) {
  if (S.replay) return; // a replay is left with BACK TO LEADERBOARD
  if (S.isGuest() && screen !== 'title') return;
  if (screen === 'title' || screen === 'select') S.daily = null; // leaving the daily challenge
  if (screen === 'launch' && !evaluate(S.cfg, 'hangar').ready) { sfx.error(); return; }
  if (screen === 'debrief') { if (!S.sim || S.sim.status === 'running') return; finishDebrief(S.sim); }
  if (screen === 'select' || screen === 'hangar' || screen === 'title') { if (S.screen === 'debrief' || S.screen === 'ops') resetRun(); }
  if (screen === 'title' && S.cfg.mode === 'online') leaveRoom();
  S.screen = screen;
  S.msg = 0;
  sfx.click();
  render();
  pushState();
}

function finishDebrief(sim) {
  // Score the design that actually flew, not whatever the parts bay shows now.
  if (S.runCfg) S.cfg = structuredClone(S.runCfg);
  S.finalSim = sim;
  S.result = scoreMission(S.cfg, sim);
  S.sugg = suggestions(S.cfg, sim);
  if (!S.rankAwarded) {
    S.rankAwarded = true;
    if (S.result.stars >= 2 && S.rank < 4 && S.cfg.mode !== 'sandbox' && !S.isSpectator()) { S.rank++; S.rankUp = true; store.set('rank', S.rank); }
  }
  if (S.result.stars >= 2) setTimeout(() => sfx.fanfare(), 250); else if (S.result.stars === 0) sfx.fail();
  for (let i = 0; i < S.result.stars; i++) setTimeout(() => sfx.ding(i), 700 + i * 350);
  prepareCard();
}

// Draw the result card in the background so SAVE and SHARE can use it straight away.
let cardToken = 0;
function prepareCard() {
  S.cardBlob = null;
  const token = ++cardToken;
  if (!S.result || S.isSpectator()) return;
  card.drawCard(S).then((c) => card.canvasToBlob(c)).then((b) => { if (token === cardToken) S.cardBlob = b; }).catch(() => { /* built on demand instead */ });
}

const LAUNCH_STEPS = {
  leo: ['T-3', 'T-2', 'T-1', 'LIFTOFF', 'MAX-Q', 'STAGE SEPARATION', 'ORBIT INSERTION', 'SPACECRAFT DEPLOYED'],
  gto: ['T-3', 'T-2', 'T-1', 'LIFTOFF', 'STAGE SEPARATION', 'TRANSFER ORBIT', 'APOGEE BURN', 'GEOSTATIONARY'],
  tli: ['T-3', 'T-2', 'T-1', 'LIFTOFF', 'STAGE SEPARATION', 'TRANS-LUNAR INJECTION', 'COAST: 5 DAYS', 'LUNAR ORBIT INSERTION'],
  deep: ['T-3', 'T-2', 'T-1', 'LIFTOFF', 'STAGE SEPARATION', 'ESCAPE BURN', 'CRUISE', 'ASTEROID APPROACH'],
  mars: ['T-3', 'T-2', 'T-1', 'LIFTOFF', 'STAGE SEPARATION', 'TRANS-MARS INJECTION', 'CRUISE', 'MARS ORBIT INSERTION']
};
let launchTimer = null;
function startLaunchSeq(navigate) {
  const ev = evaluate(S.cfg, 'launch');
  const steps = [...LAUNCH_STEPS[ev.dest]];
  if (ev.m.cls === 'cube' && S.cfg.launcherId === 'csli') steps.splice(3, 0, `WAITED ${ev.launcher.delayMonths} MONTHS`);
  if (ev.dest === 'mars' && ev.eq.prop && ev.eq.prop.cruiseMonths) steps[6] = `CRUISE: ${ev.eq.prop.cruiseMonths} MONTHS`;
  S.launchSeq = { i: 0, steps, navigate };
  sfx.launch();
  sfx.count();
  clearInterval(launchTimer);
  launchTimer = setInterval(() => {
    if (!S.launchSeq) { clearInterval(launchTimer); return; }
    S.launchSeq.i++;
    const st = S.launchSeq.steps[S.launchSeq.i] || '';
    if (/^T-/.test(st)) sfx.count();
    else if (st === 'LIFTOFF') { sfx.go(); const sc = stage.querySelector('.screen'); if (sc) { sc.classList.add('shake'); setTimeout(() => sc.classList.remove('shake'), 1600); } }
    else if (st) sfx.beep();
    if (S.launchSeq.i >= S.launchSeq.steps.length + 1) finishLaunch();
    else render();
  }, 720);
  render();
}
function finishLaunch() {
  clearInterval(launchTimer);
  const nav = S.launchSeq && S.launchSeq.navigate;
  S.launchSeq = null;
  const sc = stage.querySelector('.screen.shake'); if (sc) sc.classList.remove('shake');
  if (nav || S.screen === 'launch') {
    stage.classList.add('warp');
    sfx.warp();
    setTimeout(() => stage.classList.remove('warp'), 950);
  }
  if (nav) { S.screen = 'ops'; S.msg = 0; }
  render();
  pushState();
}

// Seeds: ranked open runs get a server-issued seed (so a score can be checked), daily runs use the day's seed,
// challenge runs use the challenge code, sandbox is local. If the server cannot be reached the run is unranked.
async function startMission() {
  if (S.isGuest() || S.starting) return;
  const ev = evaluate(S.cfg, 'ops');
  if (!ev.ready) { sfx.error(); return; }
  const sandbox = S.cfg.mode === 'sandbox';
  let seed, seedId = null, unranked = false, runDaily = '';
  if (S.daily && !sandbox) { seed = S.daily.seed >>> 0; runDaily = S.daily.date; }
  else if (S.cfg.mode === 'versus' && CODE_RE.test(S.challenge)) seed = challengeSeed(S.challenge, S.cfg.missionId, S.cfg.level);
  else if (sandbox) seed = randomInt();
  else if (S.netOk) {
    S.starting = true;
    render();
    try {
      const r = await net.issueSeed(S.cfg.missionId, S.cfg.level);
      if (!r || !/^[A-Za-z0-9]{8,32}$/.test(String(r.id)) || !Number.isFinite(Number(r.seed))) throw new Error('bad seed');
      seed = Number(r.seed) >>> 0; seedId = String(r.id);
    } catch { seed = randomInt(); unranked = true; }
    S.starting = false;
    if (S.screen !== 'ops' || S.sim || S.isGuest() || S.replay) { render(); return; } // the player moved on while we waited
  } else { seed = randomInt(); unranked = true; }
  S.seed = seed; S.seedId = seedId; S.unranked = unranked; S.runDaily = runDaily;
  S.runCfg = structuredClone(S.cfg);
  S.sim = createSim(S.runCfg, S.seed);
  S.speed = 1; S.acc = 0; S.votes = {}; S.outcome = null;
  sfx.success();
  render();
  pushState();
  broadcastOps(true);
}

function decideNow(optionId) {
  if (!S.sim || !S.sim.pending) return;
  decide(S.sim, optionId);
  S.outcome = S.sim.log[S.sim.log.length - 1];
  S.votes = {};
  if (S.outcome && S.outcome.wise) sfx.equip(); else sfx.error();
  render();
  broadcastOps(true);
}

function majority() {
  const p = S.sim.pending;
  const votes = S.currentVotes(p);
  const tally = {};
  for (const r of ROLE_ORDER) if (votes[r]) tally[votes[r]] = (tally[votes[r]] || 0) + 1;
  let best = null, bestN = -1, tie = false;
  for (const [opt, n] of Object.entries(tally)) {
    if (n > bestN) { best = opt; bestN = n; tie = false; } else if (n === bestN) tie = true;
  }
  if (tie && votes.cmd && tally[votes.cmd] === bestN) best = votes.cmd;
  return best;
}

// ---------- simulation loop ----------
let tickN = 0;
function replayTick() {
  const R = S.replay;
  if (S.helpOpen || S.boardOpen) return;
  const prev = R.phase;
  if (!replay.advance(R, 100, S.speed)) return;
  if (R.phase === 'dialog' && prev !== 'dialog') sfx.alert();
  if (R.phase === 'outcome' && prev === 'dialog') { if (R.outcome && R.outcome.wise) sfx.equip(); else sfx.error(); }
  if (R.phase === 'end' && prev !== 'end') { if (R.sim.status === 'lost') sfx.fail(); else sfx.success(); }
  render();
}
setInterval(() => {
  if (S.screen === 'ops' && S.replay) { replayTick(); return; }
  if (S.screen !== 'ops' || !S.sim || S.isGuest()) return;
  const sim = S.sim;
  if (sim.status !== 'running' || sim.pending || S.outcome || S.speed === 0 || S.helpOpen || S.boardOpen) return;
  S.acc += sim.days / 250 * S.speed;
  let changed = false;
  while (S.acc >= 1) {
    stepDay(sim);
    S.acc -= 1;
    if (sim.pending || sim.status !== 'running') { S.acc = 0; changed = true; break; }
  }
  if (sim.pending) { S.votes = {}; sfx.alert(); }
  if (sim.status !== 'running') { if (sim.status === 'lost') sfx.fail(); else sfx.success(); }
  render();
  tickN++;
  broadcastOps(changed || tickN % 3 === 0);
}, 100);

// ---------- online ----------
let room = null;
let pushTimer = null;
function sharedState() {
  return {
    screen: S.screen, cfg: S.cfg, seed: S.seed, challenge: S.challenge, launching: !!S.launchSeq,
    final: S.screen === 'debrief' && S.finalSim ? { decisions: S.finalSim.decisions } : null
  };
}
function pushState() {
  if (!room || S.online.status !== 'in' || S.isSpectator()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => room.send({ t: 'state', state: sharedState() }), 100);
}
function broadcastOps(force) {
  if (!room || S.online.status !== 'in' || S.online.role !== 'cmd' || !S.sim || !force) return;
  room.send({ t: 'ops', snap: snapshot(S.sim) });
}

const SCREENS = ['title', 'select', 'hangar', 'launch', 'ops', 'debrief'];
function canMerge() { return S.screen === 'hangar' || S.screen === 'launch' || S.screen === 'select' || (S.screen === 'ops' && !S.sim); }

// Copy only the parts the sending crew member owns.
function mergeOwned(cfg, by) {
  if (cfg.missionId !== S.cfg.missionId) return;
  for (const slot of Object.keys(S.cfg.design.sel)) if (SLOT_OWNER[slot] === by && cfg.design.sel[slot]) S.cfg.design.sel[slot] = cfg.design.sel[slot];
  if (by === 'sci') S.cfg.design.inst = { ...cfg.design.inst };
  if (by === 'ops') { S.cfg.orbitId = cfg.orbitId; S.cfg.launcherId = cfg.launcherId; S.cfg.groundId = cfg.groundId; }
}

function applyState(st, by) {
  if (!st || typeof st !== 'object' || !st.cfg || S.replay) return;
  const cfg = normalizeConfig({ ...st.cfg, mode: 'online' });
  if (!S.isGuest()) {
    // Commander: merge crew edits only while designing, then rebroadcast the authoritative state.
    if (by === 'cmd' || !ROLE_ORDER.includes(by) || !canMerge()) return;
    mergeOwned(cfg, by);
    render();
    pushState();
    return;
  }
  if (by !== 'cmd') return; // guests follow the Commander's merged state only
  const screen = SCREENS.includes(st.screen) ? st.screen : S.screen;
  S.cfg = cfg;
  S.seed = (Number(st.seed) >>> 0) || 0;
  S.challenge = typeof st.challenge === 'string' && CODE_RE.test(st.challenge) ? st.challenge : '';
  if (screen === 'debrief' && st.final && Array.isArray(st.final.decisions) && S.screen !== 'debrief') {
    S.runCfg = structuredClone(S.cfg);
    const sim = runMission(S.cfg, S.seed, st.final.decisions.slice(0, 12).map((d) => String(d).slice(0, 16)));
    S.rankAwarded = false;
    finishDebrief(sim);
  }
  if (screen !== S.screen && (screen === 'select' || screen === 'hangar')) resetRun();
  if (screen === 'launch' && st.launching && !S.launchSeq) startLaunchSeq(false);
  if (!st.launching && S.launchSeq) { clearInterval(launchTimer); S.launchSeq = null; }
  S.screen = screen;
  render();
}

// Snapshots come from another player's browser: rebuild them from known data and plain numbers only.
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, n = 300) => String(v ?? '').slice(0, n);
function cleanLog(l) {
  if (!l || typeof l !== 'object') return null;
  return { day: num(l.day), kind: ['good', 'warn', 'bad'].includes(l.kind) ? l.kind : 'warn', title: str(l.title, 80), choice: l.choice ? str(l.choice, 80) : undefined, text: str(l.text), lesson: str(l.lesson), wise: !!l.wise };
}
function cleanSnap(s) {
  if (!s || typeof s !== 'object') return null;
  let pending = null;
  const p = s.pending;
  if (p && typeof p === 'object' && Object.prototype.hasOwnProperty.call(EVENTS, p.type)) {
    const def = EVENTS[p.type];
    const given = Array.isArray(p.options) ? p.options : [];
    const options = def.options.map((o) => { const g = given.find((x) => x && x.id === o.id) || {}; return { id: o.id, label: o.label, effect: o.effect, disabled: !!g.disabled, why: g.disabled ? str(g.why, 80) : '' }; });
    const votes = {};
    for (const r of ROLE_ORDER) if (p.votes && options.some((o) => o.id === p.votes[r])) votes[r] = p.votes[r];
    pending = { type: p.type, title: def.title, text: str(p.text), owner: def.owner, lesson: def.lesson, options, votes };
  }
  const t = s.today || {};
  return {
    day: num(s.day), days: Math.max(1, num(s.days, 1)), health: num(s.health), battery: num(s.battery), stored: num(s.stored), storage: Math.max(0.001, num(s.storage, 1)),
    generated: num(s.generated), delivered: num(s.delivered), lost: num(s.lost), sci: num(s.sci),
    budgetLeft: num(s.budgetLeft), budgetStart: num(s.budgetStart, 1), opsStart: Math.max(0.001, num(s.opsStart, 1)), sandbox: !!s.sandbox,
    status: ['running', 'done', 'lost'].includes(s.status) ? s.status : 'running', endReason: str(s.endReason, 20),
    events: (Array.isArray(s.events) ? s.events : []).slice(0, 12).map((e) => ({ day: num(e && e.day), type: str(e && e.type, 20) })),
    eventIdx: num(s.eventIdx), pending,
    log: (Array.isArray(s.log) ? s.log : []).slice(-10).map(cleanLog).filter(Boolean),
    history: (Array.isArray(s.history) ? s.history : []).slice(-80).map((h) => ({ day: num(h && h.day), sci: num(h && h.sci) })),
    today: { gen: num(t.gen), sent: num(t.sent), duty: num(t.duty, 1), power: num(t.power), load: num(t.load) },
    powerLimitedDays: num(s.powerLimitedDays), wise: num(s.wise), outcome: s.outcome ? cleanLog(s.outcome) : null
  };
}

function currentEvent() {
  const d = S.isGuest() ? S.snap : (S.sim ? { eventIdx: S.sim.eventIdx, pending: S.sim.pending } : null);
  return d && d.pending ? d : null;
}

function connectRoom(code, want, spectate = false) {
  if (room) room.leave();
  S.online = { status: 'connecting', code, role: null, seats: {}, error: '', spectators: 0 };
  const spectatorCount = (v) => Math.max(0, Math.min(99, Math.round(num(v))));
  room = new net.Room(code, {
    welcome: (m) => {
      if (spectate && m.role !== 'spectator') { // the server did not treat us as a spectator: never take a seat by accident
        if (room) room.leave();
        room = null;
        S.online = { status: 'off', code: '', role: null, seats: {}, error: 'This server does not support watching rooms yet.', spectators: 0 };
        render();
        return;
      }
      const seats = {};
      for (const r of ROLE_ORDER) if (m.seats && m.seats[r]) seats[r] = true;
      S.online = { status: 'in', code, role: spectate ? 'spectator' : m.role, seats, error: '', spectators: spectatorCount(m.spectators) };
      S.cfg.mode = 'online';
      sfx.success();
      if (m.role === 'cmd') pushState();
      else if (m.state) applyState(m.state, 'cmd');
      toast(spectate ? `Watching room ${code}` : `Joined room ${code} as ${ROLES[m.role].name}`);
    },
    state: (m) => applyState(m.state, m.by),
    ops: (m) => {
      if (!S.isGuest()) return;
      const prevPending = S.snap && S.snap.pending;
      S.snap = cleanSnap(m.snap);
      if (!S.snap) return;
      if (S.snap.pending && !prevPending) { S.votes = {}; sfx.alert(); }
      if (S.screen === 'ops') render();
    },
    vote: (m) => {
      const d = currentEvent();
      if (!d || m.key !== `e${d.eventIdx}` || !ROLE_ORDER.includes(m.role) || !d.pending.options.some((o) => o.id === m.option && !o.disabled)) return;
      S.votes[m.role] = m.option;
      render();
    },
    suggest: (m) => {
      if (S.isSpectator() || !ROLES[m.role]) return;
      const slot = SLOT_INFO[m.slot] ? SLOT_INFO[m.slot].name : String(m.slot).slice(0, 30);
      const name = INSTRUMENTS[m.option] ? INSTRUMENTS[m.option].name : (Object.values(CATALOG).flatMap((c) => c[m.slot] || []).find((o) => o.id === m.option) || {}).name || String(m.option).slice(0, 40);
      sfx.beep();
      toast(`${ROLES[m.role].name} suggests: ${name} (${slot})`);
    },
    seats: (m) => {
      S.online.seats = {};
      for (const r of ROLE_ORDER) if (m.seats && m.seats[r]) S.online.seats[r] = true;
      if (m.spectators !== undefined) S.online.spectators = spectatorCount(m.spectators);
      render();
      // Bring newcomers up to date right away.
      if (S.online.role === 'cmd') { pushState(); broadcastOps(true); }
    },
    full: () => { S.online = { status: 'off', code: '', role: null, seats: {}, error: spectate ? 'That room has no free places for spectators.' : 'That room is full (4 crew max).', spectators: 0 }; if (room) room.leave(); room = null; render(); },
    reconnecting: () => { toast('Connection lost. Reconnecting…'); },
    close: () => { S.online = { status: 'off', code: '', role: null, seats: {}, error: 'Disconnected from the room.', spectators: 0 }; room = null; render(); }
  }, { spectate });
  room.connect(want);
  render();
}
function leaveRoom() {
  if (room) room.leave();
  room = null;
  S.online = { status: 'off', code: '', role: null, seats: {}, error: '' };
}

// ---------- leaderboard ----------
async function loadBoard() {
  const today = S.boardTab === 'today';
  if (today) S.dailyBoard = null; else S.board = null;
  render();
  if (!S.netOk) return;
  try {
    if (today) {
      const j = await net.getDailyBoard();
      S.dailyBoard = { date: str(j && j.date, 10), mission: str(j && j.mission, 20), level: str(j && j.level, 10), scores: Array.isArray(j && j.scores) ? j.scores.slice(0, 50) : [] };
    } else {
      const q = S.boardQ;
      S.board = await net.getLeaderboard(q.mission, q.level, q.challenge ? S.challenge : '');
    }
  } catch (e) { if (today) S.dailyBoard = { error: e.message }; else S.board = { error: e.message }; }
  render();
}

// ---------- watch a saved run ----------
function startReplay(R) {
  R.saved = { screen: S.screen, cfg: S.cfg, speed: S.speed, msg: S.msg };
  S.replay = R;
  S.cfg = R.cfg;
  S.boardOpen = false; S.toast = '';
  S.speed = 1; S.msg = 0;
  S.screen = 'ops';
  sfx.success();
  render();
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function setClass(code) {
  S.classCode = code;
  classroom.setStoredClass(code);
}

// ---------- report ----------
function reportText() {
  const ev = evaluate(S.cfg, 'ops');
  const r = S.result;
  const d = designSummary(S.cfg);
  const sim = S.finalSim;
  const lines = [
    'SATIT ORBITAL — MISSION REPORT', '================================', '',
    `Mission: ${ev.m.name} (${LEVELS[S.cfg.level].name}, ${S.cfg.mode})`, `Callsign: ${S.callsign}`, `Seed: ${S.seed}${S.challenge ? `  Challenge: ${S.challenge}` : ''}`, '',
    `RESULT: ${r.result}   Stars: ${r.stars}/3   Score: ${r.total}`,
    `  Science ${r.science} | Objectives ${r.objectivesPts} | Efficiency ${r.efficiency} | Decisions ${r.decisionsPts}`, '',
    'DESIGN', ...d.parts.map((p) => `  - ${p}`), `  Instruments: ${d.instruments.join(', ') || 'none'}`, `  Orbit: ${d.orbit}`, `  Rocket: ${d.launcher}`, `  Ground: ${d.ground}`,
    `  Mass ${fmtNum(ev.mass)} kg | Power ${fmtNum(ev.draw)}/${fmtNum(ev.gen)} W | Cost ${fmtMoney(ev.totalCost)} of ${fmtMoney(ev.budget)}`, '',
    'REQUIREMENTS', ...r.objectives.map((o) => `  [${o.status === 'met' ? 'MET ' : 'MISS'}] ${o.text} — ${o.sub}`), '',
    'MISSION', `  Days operated: ${sim.day} of ${sim.days}`, `  Data collected ${fmtData(sim.generated)}, delivered ${fmtData(sim.delivered)}, lost ${fmtData(sim.lost)}`, '',
    'DECISIONS', ...(sim.log.filter((l) => l.choice).map((l) => `  Day ${l.day}: ${l.title} → ${l.choice} (${l.wise ? 'wise' : 'risky'}). ${l.text}`)), '',
    'WHAT WOULD CHANGE THE OUTCOME', ...S.sugg.map((s) => `  - ${s}`), '',
    `Share this design: ${location.origin}/#d=${encodeDesign(S.cfg)}`
  ];
  return lines.join('\n');
}

// ---------- actions ----------
const A = {
  go: (s) => go(s),
  pickMission: (id) => {
    if (S.daily) return; S.cfg = defaultConfig(id, S.cfg.level, S.cfg.mode); S.tab = 'bus'; resetRun(); sfx.click(); render(); pushState(); },
  pickMode: (mode) => {
    if (S.cfg.mode === 'online' && mode !== 'online') leaveRoom();
    S.cfg.mode = mode;
    if (mode === 'versus' && !S.challenge) S.challenge = newCode();
    sfx.click(); render(); pushState();
  },
  pickLevel: (l) => { S.cfg.level = l; sfx.click(); render(); pushState(); },
  pickPlayers: (n) => { S.players = Number(n); sfx.click(); render(); },
  acceptMission: () => {
    if (S.cfg.mode === 'online' && S.online.status !== 'in') return;
    if (S.cfg.mode === 'versus' && !CODE_RE.test(S.challenge)) { sfx.error(); toast('Challenge codes are 5 characters (letters and numbers, no 0, 1, I, L or O). Tap NEW CODE to make one.'); return; }
    go('hangar');
  },
  tab: (t) => { S.tab = t; sfx.click(); render(); },
  pickPart: (arg) => {
    const [slot, id] = arg.split(':');
    if (S.isSpectator()) return;
    if (!S.canEdit(slot)) { room && room.send({ t: 'suggest', slot, option: id }); toast(`Suggestion sent to your ${ROLES[S.ownerOf(slot)].name}.`); return; }
    if (S.cfg.design.sel[slot] === id) return;
    const before = evaluate(S.cfg, 'hangar').bad.length;
    S.cfg.design.sel[slot] = id; S.msg = 0;
    if (evaluate(S.cfg, 'hangar').bad.length > before) sfx.warn(); else sfx.equip();
    render(); pushState();
  },
  toggleInst: (id) => {
    if (S.isSpectator()) return;
    if (!S.canEdit('inst')) { room && room.send({ t: 'suggest', slot: 'inst', option: id }); toast('Suggestion sent to your Scientist.'); return; }
    const before = evaluate(S.cfg, 'hangar').bad.length;
    S.cfg.design.inst[id] = !S.cfg.design.inst[id]; S.msg = 0;
    if (evaluate(S.cfg, 'hangar').bad.length > before) sfx.warn(); else sfx.equip();
    render(); pushState();
  },
  pickOrbit: (id) => { if (!S.canEdit('orbit')) return; S.cfg.orbitId = id; S.msg = 0; sfx.equip(); render(); pushState(); },
  pickLauncher: (id) => { if (!S.canEdit('launcher')) return; S.cfg.launcherId = id; S.msg = 0; sfx.equip(); render(); pushState(); },
  pickGround: (id) => { if (!S.canEdit('ground')) return; S.cfg.groundId = id; sfx.equip(); render(); pushState(); },
  nextMsg: () => { S.msg++; sfx.click(); render(); },
  launch: () => { if (S.isGuest()) return; if (!evaluate(S.cfg, 'launch').ready) { sfx.error(); return; } startLaunchSeq(true); pushState(); },
  skipLaunch: () => { if (S.launchSeq && S.launchSeq.navigate) finishLaunch(); else { clearInterval(launchTimer); S.launchSeq = null; render(); } },
  startMission: () => startMission(),
  speed: (v) => { S.speed = Number(v); sfx.click(); render(); },
  choose: (id) => decideNow(id),
  vote: (arg) => {
    const [role, opt] = arg.split(':');
    if (S.isSpectator()) return;
    if (S.cfg.mode === 'online') {
      if (role !== S.myRole()) return;
      S.votes[role] = opt;
      const d = opsData();
      room && room.send({ t: 'vote', key: `e${d ? d.eventIdx : 0}`, option: opt });
    } else S.votes[role] = opt;
    sfx.click(); render();
  },
  resolve: () => { if (S.isGuest() || !S.sim || !S.sim.pending) return; const pick = majority(); if (pick) decideNow(pick); },
  continueOps: () => { S.outcome = null; sfx.click(); render(); broadcastOps(true); },
  redesign: () => { resetRun(); S.screen = 'hangar'; S.msg = 0; sfx.click(); render(); pushState(); },
  submitScore: async () => {
    if (!S.finalSim || (S.submitted && !S.submitted.error) || S.unranked) return;
    const challenge = S.cfg.mode === 'versus' && CODE_RE.test(S.challenge) ? S.challenge : '';
    if (!challenge && !S.runDaily && !S.seedId) return; // nothing the server could verify
    S.submitted = { pending: true, rank: '…', score: S.result.total };
    render();
    // The server re-plays the run itself: we send the design, the decisions and which seed we were given, never a score.
    const payload = { config: S.runCfg || S.cfg, decisions: S.finalSim.decisions, callsign: S.callsign };
    if (challenge) payload.challenge = challenge;
    else if (S.runDaily) payload.daily = S.runDaily;
    else payload.seedId = S.seedId;
    if (S.classCode) payload.class = S.classCode;
    try {
      try { S.submitted = await net.submitScore(payload); }
      catch (e) {
        // The class was deleted (or never existed): leave it and send the score without it. The seed is not spent on a rejected submit.
        if (payload.class && /unknown class/i.test(String(e && e.message))) {
          setClass(''); delete payload.class;
          toast('That class no longer exists, so you left it. Your score was sent on its own.');
          S.submitted = await net.submitScore(payload);
        } else throw e;
      }
      sfx.success();
    } catch (e) { S.submitted = { error: e.message }; sfx.error(); }
    render();
  },
  saveCard: async () => {
    if (!S.result || S.cardBusy) return;
    S.cardBusy = true; render();
    try {
      const blob = S.cardBlob || await card.canvasToBlob(await card.drawCard(S));
      downloadBlob(blob, `satit-orbital-${S.cfg.missionId}-${S.result.stars}-stars.png`);
      toast('Result card saved as a PNG.');
    } catch { toast('Sorry, the result card could not be made in this browser.'); }
    S.cardBusy = false; render();
  },
  shareCard: async () => {
    if (!S.result || S.cardBusy) return;
    if (!S.cardBlob) { // not ready yet: build it now, then ask for another tap (browsers need the share inside the tap)
      S.cardBusy = true; render();
      try { S.cardBlob = await card.canvasToBlob(await card.drawCard(S)); toast('Your result card is ready. Tap SHARE RESULT again.'); } catch { toast('Sorry, the result card could not be made in this browser.'); }
      S.cardBusy = false; render();
      return;
    }
    S.cardBusy = true; render();
    try {
      const blob = S.cardBlob;
      const file = new File([blob], `satit-orbital-${S.cfg.missionId}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'SATIT Orbital result', text: `${S.result.stars} of 3 stars on ${MISSION_BY_ID[S.cfg.missionId].name} in SATIT Orbital: ${ORIGIN.liveUrl}` });
      } else toast('Sharing images is not supported here. Use SAVE RESULT CARD instead.');
    } catch (e) { if (!e || e.name !== 'AbortError') toast('Sharing did not work. Use SAVE RESULT CARD instead.'); }
    S.cardBusy = false; render();
  },
  openDaily: async () => {
    if (!S.netOk || S.dailyLoading) return;
    S.dailyLoading = true;
    try {
      const j = await net.getDaily();
      const date = String(j && j.date);
      const mission = String(j && j.mission);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isMission(mission) || !Number.isFinite(Number(j.seed))) throw new Error('bad daily');
      S.daily = { date, mission, seed: Number(j.seed) >>> 0, endsAt: Number(j.endsAt) || 0 };
      S.cfg = defaultConfig(mission, 'eng', 'solo');
      S.challenge = ''; S.tab = 'bus';
      resetRun();
      S.dailyLoading = false;
      go('hangar');
    } catch {
      S.dailyLoading = false;
      toast('The daily challenge is not available right now. Please try again in a moment.');
    }
  },
  watch: async (arg) => {
    const id = Number(arg);
    if (!Number.isInteger(id) || id <= 0 || S.watching) return;
    if (S.online.status !== 'off') { toast('Leave the room first, then you can watch a replay.'); return; }
    S.watching = id;
    toast('Loading replay…');
    try {
      const parsed = replay.parseReplay(await net.getReplay(id));
      if (!parsed.ok) throw new Error(parsed.error);
      startReplay(parsed.replay);
    } catch (e) { toast(e && e.message ? e.message : 'That replay is not available.'); }
    S.watching = 0;
  },
  exitReplay: () => {
    const R = S.replay;
    if (!R) return;
    S.replay = null;
    S.cfg = R.saved.cfg; S.screen = R.saved.screen; S.speed = R.saved.speed; S.msg = R.saved.msg;
    S.boardOpen = true;
    sfx.click(); render();
  },
  boardTab: (t) => { S.boardTab = t === 'today' ? 'today' : 'top'; loadBoard(); },
  // ----- classroom -----
  openClass: () => { S.classOpen = true; S.classUi.error = ''; S.classUi.joinError = ''; sfx.click(); render(); },
  createClass: async () => {
    const u = S.classUi;
    if (!S.netOk || u.busy) return;
    u.busy = true; u.error = ''; render();
    try {
      const j = await net.createClass();
      if (!j || !CODE_RE.test(String(j.code)) || !classroom.KEY_RE.test(String(j.teacherKey))) throw new Error('The server sent an unexpected answer. Please try again.');
      u.created = { code: j.code, teacherKey: j.teacherKey };
      u.viewInput = j.code; u.data = null; u.armDelete = false;
      sfx.success();
    } catch (e) { u.error = e.message; sfx.error(); }
    u.busy = false; render();
  },
  viewClass: async () => {
    const u = S.classUi;
    if (u.busy) return;
    if (!CODE_RE.test(u.viewInput)) { u.error = 'Class codes have 5 letters and numbers (no 0, 1, I, L or O).'; sfx.error(); render(); return; }
    u.busy = true; u.error = ''; u.armDelete = false; render();
    try {
      const data = classroom.cleanClass(await net.getClass(u.viewInput));
      if (!data) throw new Error('The server sent an unexpected answer.');
      u.data = data;
    } catch (e) { u.data = null; u.error = e.status === 404 ? 'No class with that code.' : e.message; }
    u.busy = false; render();
  },
  printClass: () => { if (S.classUi.data) classroom.printReport(S.classUi.data); },
  deleteClass: async () => {
    const u = S.classUi;
    if (u.busy || !CODE_RE.test(u.viewInput) || !classroom.KEY_RE.test(u.keyInput)) return;
    if (!u.armDelete) { u.armDelete = true; sfx.warn(); render(); return; } // a second click confirms (no pop-up)
    const code = u.viewInput;
    u.armDelete = false; u.busy = true; u.error = ''; render();
    try {
      await net.deleteClass(code, u.keyInput);
      u.data = null; u.keyInput = '';
      if (u.created && u.created.code === code) u.created = null;
      if (S.classCode === code) setClass('');
      toast(`Class ${code} was deleted.`);
    } catch (e) { u.error = e.status === 403 ? 'That teacher key does not match this class.' : e.status === 404 ? 'No class with that code.' : e.message; sfx.error(); }
    u.busy = false; render();
  },
  copyText: async (what) => {
    const c = S.classUi.created;
    if (!c) return;
    const text = what === 'key' ? c.teacherKey : c.code;
    try { await navigator.clipboard.writeText(text); toast(what === 'key' ? 'Teacher key copied. Keep it somewhere safe.' : 'Class code copied.'); } catch { toast('Copy did not work. Select the text and copy it by hand.'); }
  },
  joinClass: async () => {
    const u = S.classUi;
    if (u.busy) return;
    if (!CODE_RE.test(u.joinInput)) { u.joinError = 'Class codes have 5 letters and numbers (no 0, 1, I, L or O).'; sfx.error(); render(); return; }
    u.busy = true; u.joinError = ''; render();
    let ok = false;
    if (!S.netOk) u.joinError = 'Joining a class needs an internet connection.';
    else {
      try { await net.getClass(u.joinInput); ok = true; }
      catch (e) { u.joinError = e && e.status === 404 ? 'No class with that code. Check it with your teacher.' : 'Could not reach the server to check that code. Try again.'; }
    }
    if (ok) { setClass(u.joinInput); u.joinInput = ''; sfx.success(); toast(`You joined Class ${S.classCode}.`); } else sfx.error();
    u.busy = false; render();
  },
  leaveClass: () => { setClass(''); sfx.click(); render(); },
  watchRoom: () => {
    const code = (S.watchInput || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { S.online.error = 'Room codes have 5 letters and numbers.'; sfx.error(); render(); return; }
    connectRoom(code, null, true);
  },
  share: async () => {
    const url = `${location.origin}/#d=${encodeDesign(S.cfg)}`;
    try { await navigator.clipboard.writeText(url); toast('Design link copied. Send it to a friend!'); } catch { toast(url); }
  },
  report: () => {
    const blob = new Blob([reportText()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `satit-orbital-${S.cfg.missionId}-report.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  openBoard: () => { S.boardOpen = true; S.boardTab = S.daily && S.screen !== 'title' ? 'today' : 'top'; S.boardQ = { mission: S.cfg.missionId, level: S.cfg.level, challenge: S.cfg.mode === 'versus' && !!S.challenge }; loadBoard(); },
  boardMission: (id) => { S.boardQ.mission = id; loadBoard(); },
  boardLevel: (l) => { S.boardQ.level = l; loadBoard(); },
  boardChallenge: () => { S.boardQ.challenge = !S.boardQ.challenge; loadBoard(); },
  openHelp: () => { S.helpOpen = true; render(); },
  closeOverlay: () => { S.helpOpen = false; S.boardOpen = false; S.classOpen = false; S.classUi.created = null; S.classUi.keyInput = ''; S.classUi.armDelete = false; render(); },
  toggleMute: () => { S.muted = !S.muted; setMuted(S.muted); store.set('muted', S.muted); render(); },
  reroll: () => { S.callsign = newCallsign(); store.set('callsign', S.callsign); sfx.click(); render(); },
  newChallenge: () => { S.challenge = newCode(); sfx.click(); render(); pushState(); },
  createRoom: async () => {
    try { const { code } = await net.createRoom(); connectRoom(code, 'cmd'); }
    catch (e) { S.online.error = e.message; render(); }
  },
  joinRoom: () => {
    const code = (S.roomInput || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { S.online.error = 'Room codes have 5 letters and numbers.'; sfx.error(); render(); return; }
    connectRoom(code, null);
  },
  leaveRoom: () => { leaveRoom(); render(); }
};

stage.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.dataset.input) return;
  const fn = A[el.dataset.act];
  if (fn) fn(el.dataset.arg);
});
let hoverEl = null;
stage.addEventListener('pointerover', (e) => {
  const el = e.target.closest('.btn, .card, .iconbtn');
  if (el && el !== hoverEl && !el.disabled) sfx.hover();
  hoverEl = el;
});
stage.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.input) return;
  const v = classroom.cleanInput(el.value, Number(el.dataset.max) || 5);
  if (el.value !== v) el.value = v;
  const u = S.classUi;
  switch (el.dataset.act) {
    case 'typeRoom': S.roomInput = v; break;
    case 'typeWatch': S.watchInput = v; break;
    case 'typeChallenge': S.challenge = v; break;
    // classroom inputs re-render so the buttons next to them switch on and off
    case 'typeClassView': u.viewInput = v; u.armDelete = false; render(); break;
    case 'typeTeacherKey': u.keyInput = v; u.armDelete = false; render(); break;
    case 'typeClassJoin': u.joinInput = v; u.joinError = ''; render(); break;
    default: break;
  }
});
stage.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.dataset) return;
  const act = e.target.dataset.act;
  if (act === 'typeRoom') A.joinRoom();
  else if (act === 'typeWatch') A.watchRoom();
  else if (act === 'typeClassJoin') A.joinClass();
  else if (act === 'typeClassView') A.viewClass();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (S.helpOpen || S.boardOpen || S.classOpen)) { A.closeOverlay(); return; }
  if (e.code === 'Space' && S.screen === 'ops' && (S.replay || (S.sim && !S.isGuest())) && !(e.target && e.target.matches && e.target.matches('input, button, a'))) {
    e.preventDefault();
    S.speed = S.speed === 0 ? (S.lastSpeed || 1) : (S.lastSpeed = S.speed, 0);
    render();
  }
});

// ---------- boot ----------
function bootFromHash() {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  const cfg = decodeDesign(m[1]);
  history.replaceState(null, '', location.pathname);
  if (!cfg) { toast('That design link is broken.'); return; }
  S.cfg = cfg;
  S.screen = 'hangar';
  toast(`Loaded a shared ${MISSION_BY_ID[cfg.missionId].name} design.`);
}

showCopyNotice(); // on a copy of the game (not an official host) this shows a dismissible "this is a copy" bar
fit();
bootFromHash();
render();
net.probe().then((ok) => { S.netOk = ok; render(); });
