// SATIT Orbital — app controller: state, actions, simulation loop, online sync.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { ROLES, ROLE_ORDER, SLOT_OWNER, SLOT_INFO, INSTRUMENTS, CALLSIGN_WORDS, MISSION_BY_ID, LEVELS, CATALOG, EVENTS } from './data.js';
import {
  defaultConfig, normalizeConfig, evaluate, createSim, stepDay, decide, runMission, scoreMission, suggestions,
  encodeDesign, decodeDesign, designSummary, fmtNum, fmtMoney, fmtData, CODE_RE, challengeSeed
} from './engine.js';
import * as V from './views.js';
import { sfx, setMuted, startAmbient, stopAmbient } from './fx.js';
import * as G from './scene3d.js';
import * as net from './net.js';

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
  online: { status: 'off', code: '', role: null, seats: {}, error: '' },
  netOk: false,
  seed: 0, sim: null, runCfg: null, snap: null, speed: 1, acc: 0, votes: {}, outcome: null,
  launchSeq: null,
  result: null, sugg: [], finalSim: null, submitted: null, rankUp: false, rankAwarded: false,
  board: null, boardOpen: false, boardQ: { mission: 'fire', level: 'cadet', challenge: false },
  helpOpen: false, toast: '',
  rank: store.get('rank', 1), callsign: store.get('callsign', null) || newCallsign(), muted: store.get('muted', false),
  demoEv: evaluate(demoCfg, 'hangar'),
  has3d: G.supported(),
  ev: null,

  isGuest() { return this.cfg.mode === 'online' && this.online.status === 'in' && this.online.role !== 'cmd'; },
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
    if (this.screen === 'launch' && this.launchSeq) return V.launchOverlay(this);
    if (this.screen === 'ops') {
      const d = opsData();
      if (!d) return V.groundOverlay(this);
      const outcome = this.isGuest() ? d.outcome : this.outcome;
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

function snapshot(sim) {
  const ev = sim._ev;
  return {
    day: sim.day, days: sim.days, health: sim.health, battery: sim.battery, stored: sim.stored, storage: ev.storage,
    generated: sim.generated, delivered: sim.delivered, lost: sim.lost, sci: sim.sci,
    budgetLeft: sim.budgetLeft, budgetStart: sim.budgetStart, opsStart: sim.opsStart, sandbox: sim.sandbox,
    status: sim.status, endReason: sim.endReason, events: sim.events, eventIdx: sim.eventIdx, pending: sim.pending,
    log: sim.log.slice(-10), history: sim.history, today: sim.today, powerLimitedDays: sim.powerLimitedDays, wise: sim.wise,
    outcome: S.outcome
  };
}
function opsData() {
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
    if (el) el.focus({ preventScroll: true });
  }
  afterRender(false);
}

function afterRender(entered) {
  sync3d();
  if (S.screen === 'ops' && (S.sim || S.snap)) startAmbient(); else stopAmbient();
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
    const busy = !d || !running || d.pending || (S.isGuest() ? d.outcome : S.outcome);
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
  S.submitted = null; S.rankUp = false; S.rankAwarded = false; S.acc = 0;
}

function go(screen) {
  if (S.isGuest() && screen !== 'title') return;
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
    if (S.result.stars >= 2 && S.rank < 4 && S.cfg.mode !== 'sandbox') { S.rank++; S.rankUp = true; store.set('rank', S.rank); }
  }
  if (S.result.stars >= 2) setTimeout(() => sfx.fanfare(), 250); else if (S.result.stars === 0) sfx.fail();
  for (let i = 0; i < S.result.stars; i++) setTimeout(() => sfx.ding(i), 700 + i * 350);
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

function startMission() {
  if (S.isGuest()) return;
  const ev = evaluate(S.cfg, 'ops');
  if (!ev.ready) { sfx.error(); return; }
  S.seed = S.cfg.mode === 'versus' && CODE_RE.test(S.challenge) ? challengeSeed(S.challenge, S.cfg.missionId, S.cfg.level) : randomInt();
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
setInterval(() => {
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
  if (!room || S.online.status !== 'in') return;
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
  if (!st || typeof st !== 'object' || !st.cfg) return;
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

function connectRoom(code, want) {
  if (room) room.leave();
  S.online = { status: 'connecting', code, role: null, seats: {}, error: '' };
  room = new net.Room(code, {
    welcome: (m) => {
      S.online = { status: 'in', code, role: m.role, seats: m.seats || {}, error: '' };
      S.cfg.mode = 'online';
      sfx.success();
      if (m.role === 'cmd') pushState();
      else if (m.state) applyState(m.state, 'cmd');
      toast(`Joined room ${code} as ${ROLES[m.role].name}`);
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
      const slot = SLOT_INFO[m.slot] ? SLOT_INFO[m.slot].name : m.slot;
      const name = INSTRUMENTS[m.option] ? INSTRUMENTS[m.option].name : (Object.values(CATALOG).flatMap((c) => c[m.slot] || []).find((o) => o.id === m.option) || {}).name || m.option;
      sfx.beep();
      toast(`${ROLES[m.role].name} suggests: ${name} (${slot})`);
    },
    seats: (m) => {
      S.online.seats = {};
      for (const r of ROLE_ORDER) if (m.seats && m.seats[r]) S.online.seats[r] = true;
      render();
      // Bring newcomers up to date right away.
      if (S.online.role === 'cmd') { pushState(); broadcastOps(true); }
    },
    full: () => { S.online = { status: 'off', code: '', role: null, seats: {}, error: 'That room is full (4 crew max).' }; room.leave(); room = null; render(); },
    reconnecting: () => { toast('Connection lost. Reconnecting…'); },
    close: () => { S.online = { status: 'off', code: '', role: null, seats: {}, error: 'Disconnected from the room.' }; room = null; render(); }
  });
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
  S.board = null;
  render();
  if (!S.netOk) return;
  try {
    const q = S.boardQ;
    S.board = await net.getLeaderboard(q.mission, q.level, q.challenge ? S.challenge : '');
  } catch (e) { S.board = { error: e.message }; }
  render();
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
  pickMission: (id) => { S.cfg = defaultConfig(id, S.cfg.level, S.cfg.mode); S.tab = 'bus'; resetRun(); sfx.click(); render(); pushState(); },
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
    if (!S.canEdit(slot)) { room && room.send({ t: 'suggest', slot, option: id }); toast(`Suggestion sent to your ${ROLES[S.ownerOf(slot)].name}.`); return; }
    if (S.cfg.design.sel[slot] === id) return;
    const before = evaluate(S.cfg, 'hangar').bad.length;
    S.cfg.design.sel[slot] = id; S.msg = 0;
    if (evaluate(S.cfg, 'hangar').bad.length > before) sfx.warn(); else sfx.equip();
    render(); pushState();
  },
  toggleInst: (id) => {
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
    if (!S.finalSim || S.submitted) return;
    S.submitted = { pending: true, rank: '…', score: S.result.total };
    render();
    try {
      const res = await net.submitScore({ config: S.runCfg || S.cfg, seed: S.seed, decisions: S.finalSim.decisions, callsign: S.callsign, challenge: S.cfg.mode === 'versus' ? S.challenge : null });
      S.submitted = res;
      sfx.success();
    } catch (e) { S.submitted = { error: e.message }; sfx.error(); }
    render();
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
  openBoard: () => { S.boardOpen = true; S.boardQ = { mission: S.cfg.missionId, level: S.cfg.level, challenge: S.cfg.mode === 'versus' && !!S.challenge }; loadBoard(); },
  boardMission: (id) => { S.boardQ.mission = id; loadBoard(); },
  boardLevel: (l) => { S.boardQ.level = l; loadBoard(); },
  boardChallenge: () => { S.boardQ.challenge = !S.boardQ.challenge; loadBoard(); },
  openHelp: () => { S.helpOpen = true; render(); },
  closeOverlay: () => { S.helpOpen = false; S.boardOpen = false; render(); },
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
  const v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (el.value !== v) el.value = v;
  if (el.dataset.act === 'typeRoom') S.roomInput = v;
  if (el.dataset.act === 'typeChallenge') S.challenge = v;
});
stage.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.act === 'typeRoom') A.joinRoom();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (S.helpOpen || S.boardOpen)) { A.closeOverlay(); return; }
  if (e.code === 'Space' && S.screen === 'ops' && S.sim && !S.isGuest() && !(e.target && e.target.matches && e.target.matches('input, button, a'))) {
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

fit();
bootFromHash();
render();
net.probe().then((ok) => { S.netOk = ok; render(); });
