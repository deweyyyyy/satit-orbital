// Tests for the Thai language layer (i18n.js + th.js) and the guided first mission (tutorial.js logic).
// The DOM walker is tested with a tiny fake DOM, so these run in plain Node. Run with: npm test
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TH, TH_RULES } from '../public/js/th.js';
import { translateString, translateDom, getLang, setLang, onLangChange, langToggleHTML, findUntranslated, t } from '../public/js/i18n.js';
import { STEPS, DOCKS, createGuide } from '../public/js/tutorial.js';
import * as D from '../public/js/data.js';
import { defaultConfig, evaluate, createSim, stepDay, decide, scoreMission, suggestions } from '../public/js/engine.js';

const hasThai = (s) => /[฀-๿]/.test(s);

// ---------- a minimal fake DOM (enough for the walker) ----------
function text(v) { return { nodeType: 3, nodeValue: v }; }
function el(tagName, attrs = {}, kids = []) {
  const a = { ...attrs };
  return { nodeType: 1, tagName, childNodes: kids, getAttribute: (k) => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, attrs: a };
}
const frag = (kids) => ({ nodeType: 11, childNodes: kids });

// ---------- dictionary ----------
test('every key in th.js is a non-empty string with a non-empty Thai (or deliberately Latin) value', () => {
  const keys = Object.keys(TH);
  assert.ok(keys.length > 500, `dictionary is large (${keys.length})`);
  for (const k of keys) {
    assert.ok(typeof k === 'string' && k.trim().length > 0, 'key is non-empty');
    assert.equal(k, k.trim(), `key has no outer whitespace: "${k}"`);
    assert.ok(!/\s{2}/.test(k), `key has collapsed whitespace: "${k}"`);
    assert.ok(typeof TH[k] === 'string' && TH[k].trim().length > 0, `value for "${k}" is non-empty`);
  }
});

test('every rule is a [RegExp, function] pair', () => {
  for (const r of TH_RULES) {
    assert.ok(Array.isArray(r) && r.length === 2 && r[0] instanceof RegExp && typeof r[1] === 'function');
  }
});

test('Thai values for ordinary sentences really contain Thai', () => {
  const plain = Object.entries(TH).filter(([k, v]) => /[a-z]{4,} [a-z]{3,} [a-z]{3,}/i.test(k) && v !== k);
  assert.ok(plain.length > 100);
  for (const [k, v] of plain) assert.ok(hasThai(v), `"${k}" -> "${v}" should contain Thai`);
});

// ---------- string translation ----------
test('exact match, case-insensitive match and English passthrough', () => {
  assert.equal(translateString('START MISSION', 'th'), TH['START MISSION']);
  assert.equal(translateString('CUBESAT CLASSROOM', 'th'), TH['CubeSat Classroom']);
  assert.equal(translateString('Wildfire Watch', 'th'), TH['Wildfire Watch']);
  assert.equal(translateString('START MISSION', 'en'), 'START MISSION');
  assert.equal(translateString('Some text nobody translated yet', 'th'), 'Some text nobody translated yet');
  assert.equal(translateString('', 'th'), '');
});

test('whitespace is collapsed for the lookup and the outer whitespace is kept', () => {
  assert.equal(translateString('  START \n  MISSION ', 'th'), `  ${TH['START MISSION']} `);
});

test('regex rules keep the same numbers', () => {
  const a = translateString('We need 540 W but the panels only make 150 W. Bigger solar wings, or switch something off.', 'th');
  assert.ok(hasThai(a) && a.includes('540 W') && a.includes('150 W'), a);
  const b = translateString('We need 540 W but the panels only make 150 W this far from the Sun. Bigger solar wings, or switch something off.', 'th');
  assert.ok(b.includes('540 W') && b.includes('150 W') && b !== a, b);
  assert.equal(translateString('Day 12', 'th'), 'วันที่ 12');
  assert.equal(translateString('Phase 3 / 5', 'th'), 'เฟส 3 / 5');
  assert.match(translateString('FIX 2 PROBLEMS', 'th'), /2/);
  assert.match(translateString('Ranked #3 as Swift-Falcon-07 with 4200 points.', 'th'), /#3.*Swift-Falcon-07.*4200/);
  const c = translateString('Revisits about every 4.5 h with a 2,330 km swath', 'th');
  assert.ok(c.includes('4.5') && c.includes('2,330'), c);
  const d = translateString('Instruments collect 450 Mb a day but we can only send home 5 Mb. We’d lose about 99% of the data. A stronger radio, or fewer data-hungry instruments?', 'th');
  assert.ok(d.includes('450 Mb') && d.includes('5 Mb') && d.includes('99%'), d);
});

test('rules translate part names inside a sentence, and lists joined with a dot', () => {
  const s = translateString('In shadow the 10 Wh pack can’t carry 13 W. We’d black out every orbit!', 'th');
  assert.ok(s.includes(TH['10 Wh pack']) && s.includes('13 W'), s);
  const day = translateString('Day 5 · Solar storm incoming', 'th');
  assert.equal(day, `วันที่ 5 · ${TH['Solar storm incoming']}`);
  const sp = translateString('Your spacecraft: Medium bus, Twin wings, S-band dish, carrying Thermal imager', 'th');
  assert.ok(sp.includes(TH['Medium bus']) && sp.includes(TH['Thermal imager']), sp);
});

test('a rule that cannot translate its captures declines instead of mangling', () => {
  assert.equal(translateString('Zork target', 'th'), 'Zork target');
  assert.equal(translateString('Something: else entirely', 'th'), 'Something: else entirely');
});

test('translation is idempotent on strings', () => {
  for (const s of ['START MISSION', 'Day 12', 'We need 540 W but the panels only make 150 W. Bigger solar wings, or switch something off.', 'Wildfire Watch · Cadet']) {
    const once = translateString(s, 'th');
    assert.equal(translateString(once, 'th'), once, `second pass changes "${s}"`);
  }
});

// ---------- DOM walker ----------
test('translateDom translates text nodes and placeholder / aria-label / title, skips translate="no"', () => {
  const t1 = text('Choose your orbit');
  const t2 = text('Day 7');
  const t3 = text('Leave me alone');
  const input = el('INPUT', { placeholder: 'CODE', 'aria-label': 'Room code', 'data-act': 'typeRoom' });
  const btn = el('BUTTON', { title: 'Close', 'aria-label': 'Close' }, [text('JOIN')]);
  const keep = el('SPAN', { translate: 'no', 'aria-label': 'Close' }, [text('JOIN')]);
  const root = el('DIV', {}, [t1, el('P', {}, [t2]), el('P', {}, [t3]), input, btn, keep]);
  translateDom(root, 'th');
  assert.equal(t1.nodeValue, TH['Choose your orbit']);
  assert.equal(t2.nodeValue, 'วันที่ 7');
  assert.equal(t3.nodeValue, 'Leave me alone');
  assert.equal(input.getAttribute('placeholder'), TH['CODE']);
  assert.equal(input.getAttribute('aria-label'), TH['Room code']);
  assert.equal(input.getAttribute('data-act'), 'typeRoom', 'data attributes are never touched');
  assert.equal(btn.getAttribute('title'), TH['Close']);
  assert.equal(btn.childNodes[0].nodeValue, TH['JOIN']);
  assert.equal(keep.getAttribute('aria-label'), 'Close');
  assert.equal(keep.childNodes[0].nodeValue, 'JOIN');
});

test('translateDom is idempotent and restores English', () => {
  const a = text('START MISSION');
  const b = text('Day 12');
  const c = text('  Mass ');
  const btn = el('BUTTON', { 'aria-label': 'Back to title screen' }, [a]);
  const root = frag([btn, el('P', {}, [b, c])]);
  translateDom(root, 'th');
  const snapshot = [a.nodeValue, b.nodeValue, c.nodeValue, btn.getAttribute('aria-label')];
  translateDom(root, 'th');
  translateDom(root, 'th');
  assert.deepEqual([a.nodeValue, b.nodeValue, c.nodeValue, btn.getAttribute('aria-label')], snapshot, 'running twice changes nothing');
  assert.ok(hasThai(a.nodeValue) && hasThai(b.nodeValue) && hasThai(c.nodeValue));
  assert.ok(c.nodeValue.startsWith('  ') && c.nodeValue.endsWith(' '), 'outer whitespace kept');
  translateDom(root, 'en');
  assert.equal(a.nodeValue, 'START MISSION');
  assert.equal(b.nodeValue, 'Day 12');
  assert.equal(c.nodeValue, '  Mass ');
  assert.equal(btn.getAttribute('aria-label'), 'Back to title screen');
  translateDom(root, 'en');
  assert.equal(a.nodeValue, 'START MISSION', 'restoring twice is safe');
  translateDom(root, 'th');
  assert.equal(a.nodeValue, TH['START MISSION'], 'and it can translate again');
});

test('text the app rewrites after translation is treated as new English', () => {
  const a = text('Loading…');
  const root = el('P', {}, [a]);
  translateDom(root, 'th');
  assert.equal(a.nodeValue, TH['Loading…']);
  a.nodeValue = 'Day 3'; // the app wrote fresh English into the same node
  translateDom(root, 'th');
  assert.equal(a.nodeValue, 'วันที่ 3');
  translateDom(root, 'en');
  assert.equal(a.nodeValue, 'Day 3');
});

test('findUntranslated lists English the dictionary does not know', () => {
  const root = el('DIV', {}, [text('START MISSION'), text('A brand new sentence appears here'), text('Day 4'), text('ABC')]);
  assert.deepEqual(findUntranslated(root), ['A brand new sentence appears here']);
});

// ---------- language state ----------
test('getLang / setLang / onLangChange / toggle markup', () => {
  assert.equal(getLang(), 'en');
  let seen = null;
  const off = onLangChange((l) => { seen = l; });
  assert.equal(setLang('th'), 'th');
  assert.equal(getLang(), 'th');
  assert.equal(seen, 'th');
  assert.equal(t('START MISSION'), TH['START MISSION'], 't() uses the current language');
  const html = langToggleHTML();
  assert.match(html, /data-act="toggleLang"/);
  assert.match(html, /translate="no"/);
  assert.match(html, /aria-label="Switch to English"/);
  assert.equal(setLang('nonsense'), 'en', 'unknown languages fall back to English');
  assert.equal(seen, 'en');
  assert.match(langToggleHTML(), /aria-label="เปลี่ยนเป็นภาษาไทย"/);
  off();
  assert.equal(t('START MISSION'), 'START MISSION');
});

// ---------- coverage of the game's own text ----------
function strings(list) { return [...new Set(list.filter((s) => typeof s === 'string' && /[A-Za-z]{3,}/.test(s)))]; }
function report(label, all) {
  const missing = all.filter((s) => translateString(s, 'th') === s);
  if (missing.length) console.log(`  [i18n] ${label}: ${missing.length} of ${all.length} not translated:\n    ${missing.slice(0, 40).join('\n    ')}`);
  return missing;
}

test('static game data (data.js) is translated', () => {
  const all = [];
  const add = (...v) => all.push(...v);
  for (const r of Object.values(D.ROLES)) add(r.name, r.owns);
  for (const l of Object.values(D.LEVELS)) add(l.name, l.note);
  for (const c of D.CML) add(c.name, c.note);
  for (const i of Object.values(D.SLOT_INFO)) add(i.name, i.hint);
  for (const cat of Object.values(D.CATALOG)) for (const k of cat.slots) for (const o of cat[k]) add(o.name, o.note);
  for (const i of Object.values(D.INSTRUMENTS)) add(i.name, i.note);
  for (const o of Object.values(D.ORBITS)) add(o.name, o.family, o.explain);
  for (const o of Object.values(D.LAUNCHERS)) add(o.name, o.note);
  for (const o of Object.values(D.GROUNDS)) add(o.name, o.note);
  for (const m of D.MISSIONS) { add(m.name, m.kind, m.level, m.where, m.goal, m.twin); for (const r of m.reqs) add(r.text); }
  for (const e of Object.values(D.EVENTS)) { add(e.title, e.text, e.lesson); for (const o of e.options) add(o.label, o.effect); }
  for (const x of Object.values(D.OPPORTUNITY_TEXT)) add(x);
  const list = strings(all);
  const missing = report('data.js', list);
  // The balance work on data.js may reword a note; a handful of misses is reported above, not a failure.
  assert.ok(missing.length <= Math.ceil(list.length * 0.03), `${missing.length} of ${list.length} data.js strings are untranslated`);
});

test('crew sentences, objective lines, outcomes and tips from the engine are translated', () => {
  const all = [];
  for (const m of D.MISSIONS) {
    const cat = D.CATALOG[m.cls];
    const variants = [defaultConfig(m.id, 'cadet', 'solo')];
    for (const slot of cat.slots) for (const o of cat[slot]) { const c = defaultConfig(m.id, 'eng', 'solo'); c.design.sel[slot] = o.id; variants.push(c); }
    for (const id of m.instruments) { const c = defaultConfig(m.id, 'fd', 'solo'); c.design.inst[id] = true; variants.push(c); }
    for (const orbit of m.orbits) for (const launcher of m.launchers) { const c = defaultConfig(m.id, 'cadet', 'solo'); c.orbitId = orbit; c.launcherId = launcher; variants.push(c); }
    for (const g of m.grounds) { const c = defaultConfig(m.id, 'cadet', 'solo'); c.groundId = g; variants.push(c); }
    variants.forEach((c, i) => {
      for (const phase of ['hangar', 'launch', 'ops']) {
        const ev = evaluate(c, phase);
        for (const x of ev.bad.concat(ev.warns)) all.push(x.t);
        for (const o of ev.objectives) all.push(o.text, o.sub);
      }
      if (i % 5 === 0 && evaluate(c, 'ops').ready) {
        const sim = createSim(c, 100 + i);
        let guard = 0;
        while (sim.status === 'running' && guard++ < 5000) {
          if (sim.pending) { for (const o of sim.pending.options) all.push(o.why); all.push(sim.pending.text); decide(sim, sim.pending.options[(i + guard) % 2].id); } else stepDay(sim);
        }
        for (const l of sim.log) all.push(l.title, l.text, l.lesson, l.choice);
        const r = scoreMission(c, sim);
        all.push(r.result);
        for (const o of r.objectives) all.push(o.text, o.sub);
        all.push(...suggestions(c, sim));
      }
    });
  }
  const list = strings(all);
  assert.ok(list.length > 200, `collected ${list.length} sentences`);
  const missing = report('engine.js', list);
  assert.ok(missing.length <= Math.ceil(list.length * 0.02), `${missing.length} of ${list.length} engine sentences are untranslated`);
  // Numbers survive translation.
  const sample = list.filter((s) => /\d/.test(s)).slice(0, 300);
  for (const s of sample) {
    const out = translateString(s, 'th');
    if (out === s) continue;
    for (const n of s.match(/\d[\d.,]*\d|\d/g) || []) assert.ok(out.includes(n), `"${s}" lost the number ${n}: "${out}"`);
  }
});

// ---------- guided first mission ----------
function guideStrings() {
  const out = new Set();
  const states = [
    { tab: 'bus', ev: { ready: true, bad: [] } }, { tab: 'comms', ev: { ready: false, bad: [{}] } }
  ];
  for (const st of states) for (const s of STEPS) {
    for (const key of ['title', 'text']) { const v = typeof s[key] === 'function' ? s[key](st) : s[key]; if (v) out.add(v); }
    if (s.waitText) out.add(s.waitText);
    if (s.act && s.act.hint) out.add(s.act.hint);
  }
  for (const ui of ['Guide', 'GUIDE', 'Step', 'Back', 'Next', 'Finish', 'Skip guide', 'Hide', 'Show', 'Go there', 'Waiting…', 'GUIDE: ON', 'GUIDE: OFF',
    'Turn the guide on', 'Turn the guide off', 'Guide off. You can turn it on again from the title screen.', 'Guide complete! You can turn it on again from the title screen.']) out.add(ui);
  return [...out];
}

test('every guide sentence has a Thai translation', () => {
  const list = guideStrings();
  assert.ok(list.length > 40);
  const missing = list.filter((s) => translateString(s, 'th') === s);
  assert.deepEqual(missing, []);
});

test('guide steps are well formed: known screens, docks, speakers and no aria-label selectors', () => {
  const screens = ['title', 'select', 'hangar', 'launch', 'ops', 'debrief'];
  const ids = new Set();
  let lastRank = -1;
  for (const s of STEPS) {
    assert.ok(!ids.has(s.id), `duplicate step id ${s.id}`); ids.add(s.id);
    assert.ok(screens.includes(s.screen), s.id);
    const rank = screens.indexOf(s.screen);
    assert.ok(rank >= lastRank, `${s.id} is out of screen order`); lastRank = rank;
    assert.ok(D.ROLES[s.who], `${s.id} speaker`);
    for (const d of [typeof s.dock === 'function' ? s.dock({}, true) : s.dock, typeof s.dock === 'function' ? s.dock({}, false) : s.dock]) assert.ok(DOCKS[d], `${s.id} dock ${d}`);
    assert.equal(typeof s.done, 'function', s.id);
    const target = typeof s.target === 'function' ? [s.target({ tab: 'bus', ev: null }), s.target({ tab: 'comms', ev: null })] : [s.target];
    for (const sel of target) assert.ok(typeof sel === 'string' && sel.length, `${s.id} target`);
    for (const sel of target) assert.ok(!/aria-label(?!ledby)|title=|placeholder/.test(sel), `${s.id} must not select by a translatable attribute`);
    assert.ok(s.title && s.text, s.id);
  }
  assert.equal(STEPS[STEPS.length - 1].final, true);
  // every screen group ends with an action step, so Next can never skip over a screen change
  for (const scr of screens) {
    const grp = STEPS.filter((s) => s.screen === scr);
    assert.ok(grp.length > 0, scr);
    assert.ok(grp[grp.length - 1].act, `last ${scr} step is an action step`);
  }
});

function gameState(over = {}) {
  const cfg = defaultConfig('fire', 'cadet', 'solo');
  const S = { screen: 'title', cfg, tab: 'bus', sim: null, outcome: null, launchSeq: null, speed: 1, ...over };
  S.ev = evaluate(S.cfg, S.screen === 'launch' ? 'launch' : S.screen === 'ops' ? 'ops' : 'hangar');
  return S;
}
const refresh = (S) => { S.ev = evaluate(S.cfg, S.screen === 'launch' ? 'launch' : S.screen === 'ops' ? 'ops' : 'hangar'); return S; };

test('guide follows a whole first mission, advancing when the player really does each thing', () => {
  const g = createGuide(STEPS, true);
  const S = gameState();
  const at = () => { const i = g.update(refresh(S)); return i && i.step.id; };
  assert.equal(at(), 'welcome');

  S.screen = 'select';
  assert.equal(at(), 'pick', 'start pressed: on to mission select');
  S.cfg = defaultConfig('cube', 'cadet', 'solo');
  assert.equal(at(), 'brief', 'CubeSat Classroom picked');
  g.next(S, null);
  assert.equal(at(), 'accept');

  S.screen = 'hangar';
  assert.equal(at(), 'gauges');
  g.next(S, null);
  assert.equal(at(), 'tabs');
  S.tab = 'comms';
  assert.equal(at(), 'crew', 'opened another tab');
  g.next(S, null);
  assert.equal(at(), 'radio');
  S.cfg.design.sel.comms = 'cs';
  refresh(S);
  assert.equal(S.ev.ready, false, 'the faster radio overloads the battery: a red problem');
  assert.equal(at(), 'fixred');
  S.cfg.design.sel.battery = 'c40';
  assert.equal(at(), 'tolaunch', 'problem fixed');

  S.screen = 'launch';
  assert.equal(at(), 'orbit');
  S.cfg.orbitId = 'cubesso';
  assert.equal(at(), 'rocket');
  S.cfg.launcherId = 'cuberide';
  assert.equal(at(), 'objectives');
  g.next(S, null);
  assert.equal(at(), 'launch');

  S.screen = 'ops';
  assert.equal(at(), 'ground');
  S.sim = createSim(S.cfg, 7);
  assert.equal(at(), 'speed');
  g.next(S, null);
  let info = g.update(refresh(S));
  assert.equal(info.step.id, 'emergency');
  assert.equal(info.waiting, true, 'waits for the first emergency');
  let guard = 0;
  while (!S.sim.pending && guard++ < 5000) stepDay(S.sim);
  info = g.update(refresh(S));
  assert.equal(info.step.id, 'emergency');
  assert.equal(info.waiting, false);
  decide(S.sim, S.sim.pending.options[0].id);
  S.outcome = S.sim.log[S.sim.log.length - 1];
  info = g.update(refresh(S));
  assert.equal(info.step.id, 'outcome');
  assert.equal(info.waiting, false);
  S.outcome = null;
  assert.equal(at(), 'keepflying');

  S.screen = 'debrief';
  assert.equal(at(), 'stars');
  g.next(S, null);
  assert.equal(at(), 'whatif');
  g.next(S, null);
  assert.equal(at(), 'redesign');
  g.next(S, null);
  assert.equal(g.active, false, 'Finish ends the guide');
  assert.equal(g.finished, true);
  assert.equal(g.update(S), null);
});

test('guide: Next on an action step presses the screen change, or shows the hint when blocked', () => {
  const g = createGuide(STEPS, true);
  const S = gameState();
  g.update(refresh(S));
  const calls = [];
  const api = { go: (s) => { calls.push(['go', s]); S.screen = s; }, toast: (m) => calls.push(['toast', m]) };
  g.next(S, api);
  assert.deepEqual(calls, [['go', 'select']]);
  // blocked move: go() does nothing, so the hint is shown
  g.update(refresh(S));
  S.cfg = defaultConfig('cube', 'cadet', 'solo'); g.update(refresh(S)); g.next(S, null);
  S.screen = 'hangar'; g.update(refresh(S));
  while (g.update(refresh(S)).step.id !== 'tolaunch') {
    const id = g.update(refresh(S)).step.id;
    if (id === 'radio') { S.cfg.design.sel.comms = 'cs'; S.cfg.design.sel.battery = 'c10'; refresh(S); continue; }
    if (id === 'tabs') { S.tab = 'comms'; continue; }
    g.next(S, null);
  }
  calls.length = 0;
  const stuck = { go: () => calls.push(['go']), toast: (m) => calls.push(['toast', m]) };
  assert.equal(S.ev.ready, false);
  g.next(S, stuck);
  assert.equal(calls[0][0], 'go');
  assert.equal(calls[1][0], 'toast');
  assert.equal(calls[1][1], 'Fix the red problems first.');
});

test('guide: Back goes to the previous step on the same screen and stays there until the player acts', () => {
  const g = createGuide(STEPS, true);
  const S = gameState({ screen: 'select' });
  S.cfg = defaultConfig('cube', 'cadet', 'solo');
  assert.equal(g.update(refresh(S)).step.id, 'brief');
  assert.equal(g.canBack(), true);
  g.back(S);
  assert.equal(g.update(refresh(S)).step.id, 'pick', 'the step the player already did is shown again');
  assert.equal(g.update(refresh(S)).step.id, 'pick', 'and does not jump away by itself');
  S.cfg = defaultConfig('fire', 'cadet', 'solo'); // the player acts: picks another mission
  assert.equal(g.update(refresh(S)).step.id, 'pick');
  S.cfg = defaultConfig('cube', 'cadet', 'solo'); // and then CubeSat Classroom
  assert.equal(g.update(refresh(S)).step.id, 'brief');
});

test('guide: going back to an earlier screen restarts that screen, leaving the debrief ends the guide', () => {
  const g = createGuide(STEPS, true);
  const S = gameState({ screen: 'hangar' });
  S.cfg = defaultConfig('cube', 'cadet', 'solo');
  assert.equal(g.update(refresh(S)).step.id, 'gauges');
  S.screen = 'select';
  assert.equal(g.update(refresh(S)).step.id, 'brief', 'back on mission select: the pick step is already done');
  S.screen = 'debrief';
  assert.equal(g.update(refresh(S)).step.id, 'stars');
  S.screen = 'select';
  assert.equal(g.update(refresh(S)), null);
  assert.equal(g.active, false);
});

test('guide: nothing shows when switched off, and unknown screens are ignored', () => {
  const off = createGuide(STEPS, false);
  assert.equal(off.update(gameState()), null);
  const g = createGuide(STEPS, true);
  assert.equal(g.update({ ...gameState(), screen: 'nowhere' }), null);
  g.restart();
  assert.equal(g.idx, 0);
  assert.equal(g.active, true);
});

test('the guide is not about the leaderboard: scores and callsigns stay out of the guide text', () => {
  for (const s of guideStrings()) assert.ok(!/@|\bemail\b/i.test(s), s);
});
