// SATIT Orbital — guided first mission. A "Guide" coach panel follows the real game flow
// (title > mission select > hangar > launch > operations > debrief), highlights what to press and moves on
// when the player really does it. Every step also has a manual Next. It is ON for first-time players and
// is switched off for good (localStorage satit.tutorial = 'done') when the player finishes or skips it.
// Nothing here moves or rebuilds game elements: a highlight is just a CSS class (tut-target) on the target.
// All text is English and goes through i18n.t(), so Thai mode translates the panel too.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { ROLES, MISSION_BY_ID } from './data.js';
import { t, onLangChange } from './i18n.js';

const STORE_KEY = 'satit.tutorial';
const RANK = { title: 0, select: 1, hangar: 2, launch: 3, ops: 4, debrief: 5 };

const def = (S) => (MISSION_BY_ID[S.cfg.missionId] || MISSION_BY_ID.cube).defaults;
const hasRed = (S) => !!(S.ev && S.ev.bad && S.ev.bad.length);
const isReady = (S) => !!(S.ev && S.ev.ready);
const pending = (S) => !!(S.sim && S.sim.pending);
const betterRadio = (S) => {
  const cat = S.ev && S.ev.cat && S.ev.cat.comms;
  const cur = S.ev && S.ev.eq && S.ev.eq.comms;
  if (!cat || !cur) return null;
  return cat.find((c) => c.down > cur.down) || null;
};

// A step: { id, screen, who, dock, target, title, text, done(S), act?, wait?, waitText?, overlay?, auto? }
//   auto: the player must do the thing (no Next button). Action steps without `go` also have no Next button.
//   target: CSS selector (or function of the state). Never select by aria-label or title: Thai mode changes those.
//   text / title may be functions of the state. All returned strings must exist as English keys in th.js.
//   act: { go: 'screen', hint: '...' } makes the step an action step: Next presses the screen change for the
//        player when it is allowed, otherwise it shows the hint.
export const STEPS = [
  { id: 'welcome', screen: 'title', who: 'eng', dock: 'title', target: '[data-act="go"][data-arg="select"]',
    title: 'Welcome, Commander!',
    text: 'I’m Rio, your engineer. Together we will design, launch and fly a real space mission. Press START MISSION to begin.',
    done: (S) => S.screen !== 'title', act: { go: 'select' } },

  { id: 'pick', screen: 'select', who: 'sci', dock: 'bottom', target: '[data-act="pickMission"][data-arg="cube"]',
    title: 'Pick a mission',
    text: 'Each mission is a different science goal. CubeSat Classroom is the friendliest one for a first flight. Click it in the Missions list.',
    done: (S) => S.cfg.missionId === 'cube' },
  { id: 'brief', screen: 'select', who: 'sci', dock: 'bottom', target: 'section[aria-labelledby="brief-h"]',
    title: 'Read the briefing',
    text: 'The Briefing shows the goal and a list of requirements (R1, R2 and so on). Meeting every requirement is how you earn 3 stars.',
    done: () => false },
  { id: 'accept', screen: 'select', who: 'eng', dock: 'bottom', target: '[data-act="acceptMission"]',
    title: 'Accept the mission',
    text: 'Happy with your mission? Press ACCEPT MISSION to walk into the hangar.',
    done: (S) => S.screen !== 'select', act: { go: 'hangar' } },

  { id: 'gauges', screen: 'hangar', who: 'eng', dock: 'bottom', target: '.hud .gauges',
    title: 'Watch the four gauges',
    text: 'MASS is what the rocket must lift. POWER is what your parts use compared with what the solar panels make. CREDITS is your budget. DATA is what the instruments collect compared with what the radio can send home. Keep every gauge out of the red.',
    done: () => false },
  { id: 'tabs', screen: 'hangar', who: 'eng', dock: 'bottom', target: '[data-r="bay"] [role="group"]',
    title: 'Open the parts bay',
    text: 'Each icon is one system of your spacecraft: structure, solar array, battery, radio and more. Click an icon to see the choices. A red dot means that system needs attention.',
    done: (S) => S.tab !== 'bus' },
  { id: 'crew', screen: 'hangar', who: 'sci', dock: 'bottom', target: '[data-r="crew"]',
    title: 'Listen to your crew',
    text: 'Rio, Maya and Sam talk in this box. Amber and red messages explain what is wrong in plain words. Press NEXT in the message box to hear them all.',
    done: () => false },
  { id: 'radio', screen: 'hangar', who: 'ops', dock: 'bottom',
    target: (S) => {
      if (S.tab !== 'comms') return '[data-r="bay"] [data-act="tab"][data-arg="comms"]';
      const b = betterRadio(S);
      return b ? `[data-act="pickPart"][data-arg="comms:${b.id}"]` : '[data-r="bay"] .grow.scroll';
    },
    title: 'Send more data home',
    text: (S) => (S.tab !== 'comms'
      ? 'The crew warns that some of your data would be lost: the radio is too slow. Open the Radio tab.'
      : 'Pick a faster radio. It sends more data home, so more science reaches the ground.'),
    done: (S) => S.cfg.design.sel.comms !== def(S).sel.comms },
  { id: 'fixred', screen: 'hangar', who: 'eng', dock: 'bottom',
    target: '[data-r="bay"] [data-act="tab"]:has(.dot:not([style]))', fallback: '[data-r="bay"] [role="group"]',
    title: 'Fix the red problem',
    text: 'A red dot appeared! The new part uses more power or mass than we have. Read the red message from the crew, then fix it: pick a bigger battery or solar array, or remove an instrument.',
    done: (S) => isReady(S) },
  { id: 'tolaunch', screen: 'hangar', who: 'ops', dock: 'bottom', target: '[data-r="nav"] .btn.primary',
    title: 'On to the launch',
    text: (S) => (isReady(S)
      ? 'Every system is flight-ready. Press NEXT: LAUNCH & ORBIT.'
      : 'The button says FIX PROBLEMS. Clear the red messages first, then it will unlock.'),
    done: (S) => S.screen !== 'hangar', act: { go: 'launch', hint: 'Fix the red problems first.' } },

  { id: 'orbit', screen: 'launch', who: 'ops', dock: 'bottom', target: '[data-r="orbits"]',
    title: 'Choose your orbit',
    text: 'The orbit decides how often you see your target and how long the mission lasts. Read the chips on each card, then click the orbit that fits your goal.',
    done: (S) => S.cfg.orbitId !== def(S).orbit },
  { id: 'rocket', screen: 'launch', who: 'ops', dock: 'bottom', target: '[data-r="rockets"]',
    title: 'Choose your rocket',
    text: 'Now pick a rocket. The chips tell you if your spacecraft fits, how long you wait for liftoff and what it costs. Click one.',
    done: (S) => S.cfg.launcherId !== def(S).launcher },
  { id: 'objectives', screen: 'launch', who: 'sci', dock: 'mid', target: '[data-r="lv-obj"]',
    title: 'Check the objectives',
    text: 'This list shows the mission requirements. A tick means met, a cross means not met yet, and a clock means it depends on a choice still to come. Aim for all ticks.',
    done: () => false },
  { id: 'launch', screen: 'launch', who: 'ops', dock: 'mid', target: '[data-act="launch"]',
    title: 'Ready for liftoff?',
    text: (S) => (isReady(S) ? 'Press LAUNCH and watch the countdown. You can skip it if you are in a hurry.' : 'The button says FIX PROBLEMS. Clear the red messages first.'),
    done: (S) => S.screen !== 'launch', act: { hint: 'Press LAUNCH when you are ready.' } },

  { id: 'ground', screen: 'ops', who: 'ops', dock: 'top', overlay: true, target: '[data-act="startMission"]',
    title: 'Choose who listens',
    text: 'Ground stations receive your data. More antennas bring more data home but cost money every year. Pick one, then press START MISSION.',
    done: (S) => !!S.sim, act: { hint: 'Press START MISSION to begin flying.' } },
  { id: 'speed', screen: 'ops', who: 'sci', dock: 'bottom', target: '[data-r="ops-top"] [role="group"]',
    title: 'Control the clock',
    text: 'The mission runs in fast-forward. These buttons pause it or run it at 1×, 3× or 8× speed. You can also press Space to pause. Emergencies pop up by themselves.',
    done: (S) => pending(S) || !!S.outcome },
  { id: 'emergency', screen: 'ops', who: 'ops', dock: 'top', overlay: true, auto: true, target: '.modal .card',
    wait: (S) => !pending(S), waitText: 'Waiting for the first emergency. Speed up with 3× or 8×.',
    title: 'An emergency!',
    text: 'Something went wrong and you must decide. Read each option and what it does. The small crew icons show who voted for what. Pick the wise one, then press CHOOSE.',
    done: (S) => !!S.sim && S.sim.eventIdx > 0 && !pending(S) },
  { id: 'outcome', screen: 'ops', who: 'ops', dock: 'top', overlay: true, auto: true, target: '.modal .lesson',
    wait: (S) => !S.outcome, waitText: 'Waiting for the result of your decision.',
    title: 'Wise call or risky call?',
    text: 'Here is what happened. A wise call earns 300 points. The “Why it matters” box teaches the real space lesson behind it. Press CONTINUE MISSION.',
    done: (S) => !!S.sim && S.sim.eventIdx > 0 && !pending(S) && !S.outcome },
  { id: 'keepflying', screen: 'ops', who: 'sci', dock: (S, ov) => (ov ? 'top' : 'bottom'), overlay: true, target: '[data-act="go"][data-arg="debrief"]',
    title: 'Keep flying',
    text: 'More emergencies will come. Read, think, choose wise. Use 8× to hurry. When the mission ends, press SEE DEBRIEF.',
    done: () => false, act: { hint: 'The debrief opens when the mission ends.' } },

  { id: 'stars', screen: 'debrief', who: 'sci', dock: 'debrief', target: '.starpop',
    title: 'Your result',
    text: 'One star means flight-ready. Two stars mean almost every goal was met. Three stars mean every goal met with strong science. The bars show where your points came from.',
    done: () => false },
  { id: 'whatif', screen: 'debrief', who: 'eng', dock: 'debrief', target: 'section[aria-labelledby="sg-h"]',
    title: 'What would change the outcome?',
    text: 'The crew studied your flight and suggests changes. Real engineers do this after every mission.',
    done: () => false },
  { id: 'redesign', screen: 'debrief', who: 'eng', dock: 'debrief', target: '[data-act="redesign"]',
    title: 'Fly again, better',
    text: 'The best way to learn is to change one thing and fly again. Press REDESIGN & FLY AGAIN. Good luck, Commander!',
    done: (S) => S.screen !== 'debrief', act: { go: 'hangar' }, final: true }
];

// Where the panel sits, in 1440x810 stage pixels: x = horizontal centre, y = edge, from = which edge y refers to.
export const DOCKS = {
  title: { x: 1124, y: 104, from: 'top', w: 520 },
  bottom: { x: 720, y: 706, from: 'bottom', w: 620 },
  mid: { x: 720, y: 196, from: 'top', w: 620 },
  top: { x: 720, y: 10, from: 'top', w: 620 },
  debrief: { x: 720, y: 292, from: 'top', w: 540 }
};

// ---------- storage ----------
function readDone() {
  try { const v = localStorage.getItem(STORE_KEY); return v === 'done' || v === '"done"'; } catch { return false; }
}
function writeDone(done) {
  try { if (done) localStorage.setItem(STORE_KEY, 'done'); else localStorage.removeItem(STORE_KEY); } catch { /* storage blocked */ }
}

// ---------- guide logic (pure: no DOM) ----------
const sigOf = (S) => [S.screen, S.cfg.missionId, S.tab, S.cfg.orbitId, S.cfg.launcherId, S.cfg.groundId, JSON.stringify(S.cfg.design.sel), pending(S), !!S.outcome, !!S.sim].join('|');
const firstOn = (screen) => STEPS.findIndex((s) => s.screen === screen);

/** The guide state machine. `update(S)` moves the current step to match the game and reports what to show. */
export function createGuide(steps = STEPS, initialActive = true) {
  const g = {
    idx: 0, active: initialActive, finished: false, pinSig: null,
    update(S) {
      if (!g.active) return null;
      const here = RANK[S.screen];
      if (here === undefined) return null;
      const sig = sigOf(S);
      if (g.pinSig !== null && g.pinSig !== sig) g.pinSig = null;
      const last = steps.length - 1;
      // Finished: the last step is only shown on the debrief screen; leaving it completes the guide.
      if (g.idx === last && steps[last].final && steps[last].done(S)) { g.finish(); return null; }
      // Leaving the debrief screen after reaching it also completes the guide.
      if (steps[g.idx].screen === 'debrief' && S.screen !== 'debrief') { g.finish(); return null; }
      // The player went back to an earlier screen: restart from the first step of that screen.
      if (RANK[steps[g.idx].screen] > here) {
        const first = steps.findIndex((s) => s.screen === S.screen);
        if (first >= 0) g.idx = first;
        else return null;
      }
      // Skip steps the player has already passed or already done.
      let guard = 0;
      while (g.pinSig === null && guard++ < steps.length) {
        const st = steps[g.idx];
        const passed = RANK[st.screen] < here;
        if (!(passed || (RANK[st.screen] === here && st.done(S)))) break;
        if (g.idx >= last) { if (st.final && st.done(S)) { g.finish(); return null; } break; }
        g.idx++;
      }
      const step = steps[g.idx];
      if (RANK[step.screen] !== here) return null; // waiting for the player to reach that screen
      return { step, idx: g.idx, total: steps.length, waiting: !!(step.wait && step.wait(S)) };
    },
    next(S, api) {
      const step = steps[g.idx];
      if (!step) return;
      if (step.final) { g.finish(); return; }
      if (step.act) {
        if (step.act.go && api && api.go) {
          const before = S.screen;
          api.go(step.act.go);
          if (S.screen === before && step.act.hint && api.toast) api.toast(step.act.hint);
        } else if (step.act.hint && api && api.toast) api.toast(step.act.hint);
        return;
      }
      if (g.idx < steps.length - 1 && steps[g.idx + 1].screen === step.screen) { g.idx++; g.pinSig = null; }
    },
    back(S) {
      if (g.idx > 0 && steps[g.idx - 1].screen === steps[g.idx].screen) { g.idx--; g.pinSig = sigOf(S); }
    },
    canBack: () => g.idx > 0 && steps[g.idx - 1].screen === steps[g.idx].screen,
    finish() { g.active = false; g.finished = true; },
    restart() { g.idx = 0; g.active = true; g.finished = false; g.pinSig = null; }
  };
  return g;
}

// ---------- DOM layer ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const resolve = (v, ...args) => (typeof v === 'function' ? v(...args) : v);

let api = null;
let guide = null;
let el = null;
let stageEl = null;
let renderedKey = '';
let marked = [];
let collapsed = false; // the player can fold the panel away to see what is behind it

function ensureEl() {
  if (el || typeof document === 'undefined') return;
  el = document.createElement('section');
  el.id = 'coach';
  el.className = 'coach';
  el.hidden = true;
  el.setAttribute('role', 'region');
  el.addEventListener('click', onClick);
  document.body.appendChild(el);
  window.addEventListener('resize', () => place());
}

function clearMarks() {
  for (const m of marked) m.classList.remove('tut-target');
  marked = [];
}
function mark(S, step) {
  const stage = stageEl || document.getElementById('stage');
  if (!stage) return;
  const sel = resolve(step.target, S);
  let found = [];
  const q = (s) => { try { return [...stage.querySelectorAll(s)]; } catch { return []; } };
  if (sel) found = q(sel);
  if (!found.length && step.fallback) found = q(step.fallback);
  found = found.slice(0, 8);
  for (const m of marked) if (!found.includes(m)) m.classList.remove('tut-target');
  for (const f of found) f.classList.add('tut-target');
  marked = found;
}

function place(dockName) {
  if (!el || el.hidden) return;
  const stage = stageEl || document.getElementById('stage');
  if (!stage) return;
  const name = dockName || el.dataset.dock || 'bottom';
  const d = DOCKS[name] || DOCKS.bottom;
  const r = stage.getBoundingClientRect();
  const s = r.width / 1440 || 1;
  el.dataset.dock = name;
  el.style.width = `${d.w}px`;
  el.style.left = `${r.left + d.x * s}px`;
  el.style.top = `${r.top + d.y * s}px`;
  el.style.transformOrigin = d.from === 'bottom' ? '50% 100%' : '50% 0';
  el.style.transform = `translate(-50%, ${d.from === 'bottom' ? '-100%' : '0'}) scale(${s})`;
}

function dots(idx, total) {
  let h = '';
  for (let i = 0; i < total; i++) h += `<i class="${i < idx ? 'done' : i === idx ? 'now' : ''}"></i>`;
  return h;
}

function build(S, info) {
  const { step, idx, total, waiting } = info;
  const role = ROLES[step.who] || ROLES.eng;
  const who = `<span class="who" style="color:${role.color}">${esc(t(role.npc === 'You' ? 'YOU' : role.npc.toUpperCase()))} · ${esc(t('GUIDE'))}</span>`;
  if (collapsed) {
    return `<div class="coach-head">${who}<span class="coach-step">${esc(t('Step'))} ${idx + 1} / ${total}</span>
      <button type="button" class="coach-skip" data-ca="min">${esc(t('Show'))}</button><button type="button" class="coach-skip" data-ca="skip">${esc(t('Skip guide'))}</button></div>`;
  }
  const title = waiting ? t('Waiting…') : t(resolve(step.title, S));
  const text = waiting ? t(step.waitText) : t(resolve(step.text, S));
  const canBack = guide.canBack();
  const isAct = !!step.act;
  const nextLabel = isAct ? t('Go there') : t('Next');
  const last = step.final ? t('Finish') : null;
  const showNext = !waiting && !step.auto && !(isAct && !step.act.go);
  return `<div class="coach-head">${who}
    <span class="coach-step">${esc(t('Step'))} ${idx + 1} / ${total}</span>
    <button type="button" class="coach-skip" data-ca="min">${esc(t('Hide'))}</button><button type="button" class="coach-skip" data-ca="skip">${esc(t('Skip guide'))}</button></div>
    <h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="coach-foot"><span class="coach-dots" aria-hidden="true">${dots(idx, total)}</span>
    <span class="coach-nav"><button type="button" class="coach-btn" data-ca="back" ${canBack ? '' : 'disabled'}>${esc(t('Back'))}</button>
    ${showNext ? `<button type="button" class="coach-btn primary" data-ca="next">${esc(last || nextLabel)}</button>` : ''}</span></div>`;
}

function onClick(e) {
  const b = e.target.closest && e.target.closest('[data-ca]');
  if (!b || b.disabled || !guide || !api) return;
  const S = api.getState();
  const a = b.dataset.ca;
  if (a === 'skip') { skip(); return; }
  if (a === 'min') { collapsed = !collapsed; renderedKey = ''; syncTutorial(); const nb = el && el.querySelector('[data-ca="min"]'); if (nb) nb.focus({ preventScroll: true }); return; }
  if (a === 'back') guide.back(S);
  if (a === 'next') guide.next(S, api);
  if (!guide.active) { complete(); return; }
  const focus = a;
  syncTutorial();
  if (el && !el.hidden) { const nb = el.querySelector(`[data-ca="${focus}"]:not([disabled])`) || el.querySelector('[data-ca="next"]'); if (nb) nb.focus({ preventScroll: true }); }
}

function skip() {
  if (!guide) return;
  guide.finish();
  writeDone(true);
  hide();
  if (api && api.toast) api.toast('Guide off. You can turn it on again from the title screen.');
}

/** The guide just ended by itself (last step, or the player left the debrief): remember it and say so. */
function complete() {
  writeDone(true);
  hide();
  if (guide && guide.finished && api && api.toast) api.toast('Guide complete! You can turn it on again from the title screen.');
}

function hide() {
  if (el) { el.hidden = true; el.dataset.key = ''; }
  renderedKey = '';
  clearMarks();
}

/** The guide hides itself in modes it does not understand (co-op, online, versus, sandbox, replays). */
function shouldShow(S) {
  if (S.cfg.mode !== 'solo') return false;
  if (S.replay) return false;
  if (S.online && S.online.status === 'in') return false;
  return true;
}

/** Call after every render. Moves the guide along, draws the coach panel and the highlight. */
export function syncTutorial() {
  if (!api || !guide || typeof document === 'undefined') return;
  const S = api.getState();
  if (!guide.active) { hide(); return; }
  ensureEl();
  const info = shouldShow(S) ? guide.update(S) : null;
  if (!guide.active) { complete(); return; } // the update just finished the guide
  if (!info) { hide(); return; }
  const stage = stageEl || document.getElementById('stage');
  const overlay = !!(stage && stage.querySelector('.overlay, .launchpad'));
  const launching = !!S.launchSeq || !!(stage && stage.querySelector('.launchpad'));
  // Help / leaderboard / other pop-ups and the launch animation own the screen.
  if (launching || S.helpOpen || S.boardOpen || (overlay && !info.step.overlay)) { hide(); return; }
  const dockName = resolve(info.step.dock, S, overlay) || 'bottom';
  const key = [collapsed, info.idx, info.waiting, resolve(info.step.title, S), resolve(info.step.text, S), dockName, document.documentElement.lang].join('|');
  el.hidden = false;
  if (key !== renderedKey) {
    const hadFocus = el.contains(document.activeElement);
    const which = hadFocus && document.activeElement.dataset ? document.activeElement.dataset.ca : null;
    el.innerHTML = build(S, info);
    el.classList.toggle('min', collapsed);
    el.setAttribute('aria-label', t('Guide'));
    renderedKey = key;
    if (which) { const nb = el.querySelector(`[data-ca="${which}"]:not([disabled])`); if (nb) nb.focus({ preventScroll: true }); }
  }
  place(dockName);
  mark(S, info.step);
}

/** Set up the guide. `api = { getState: () => S, go, toast }`. */
export function initTutorial(a) {
  api = a;
  stageEl = typeof document !== 'undefined' ? document.getElementById('stage') : null;
  guide = createGuide(STEPS, !readDone());
  onLangChange(() => { renderedKey = ''; syncTutorial(); });
  return guide;
}

/** True while the guide is switched on. */
export function tutorialOn() { return !!(guide && guide.active); }

/** Title-screen toggle: switch the guide off (skip) or on again (restart from step 1). */
export function toggleTutorial() {
  if (!guide) return false;
  if (guide.active) { guide.finish(); writeDone(true); hide(); }
  else { guide.restart(); writeDone(false); renderedKey = ''; }
  return guide.active;
}

/** Markup for the title-screen guide toggle. Wired to the `toggleTutorial` action. */
export function tutorialToggleHTML() {
  const on = tutorialOn();
  const label = on ? 'Turn the guide off' : 'Turn the guide on';
  return `<button class="btn ghost guide-toggle ${on ? 'on' : ''}" data-act="toggleTutorial" aria-pressed="${on}" aria-label="${esc(label)}" title="${esc(label)}">${on ? 'GUIDE: ON' : 'GUIDE: OFF'}</button>`;
}
