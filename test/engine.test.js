// Engine tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, LEVELS, EVENTS } from '../public/js/data.js';
import {
  defaultConfig, normalizeConfig, evaluate, createSim, stepDay, decide, runMission,
  scoreMission, suggestions, encodeDesign, decodeDesign, firstOption, fmtMoney, fmtData
} from '../public/js/engine.js';

const fireGood = () => {
  const c = defaultConfig('fire', 'eng');
  c.design.sel = { bus: 'm', solar: 'wing', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'cold' };
  c.design.inst = { tir: true, msi: true };
  return c;
};

test('every mission and level evaluates with its defaults', () => {
  for (const m of MISSIONS) for (const lvl of Object.keys(LEVELS)) {
    const ev = evaluate(defaultConfig(m.id, lvl), 'hangar');
    assert.ok(Number.isFinite(ev.mass) && ev.mass > 0, `${m.id} mass`);
    assert.equal(ev.objectives.length, m.reqs.length);
  }
});

test('default Wildfire design flags the radio bottleneck but can fly', () => {
  const ev = evaluate(defaultConfig('fire', 'eng'), 'hangar');
  assert.ok(ev.issues.some((i) => i.slot === 'comms'), 'data warning expected');
  assert.equal(ev.ready, true);
  assert.ok(ev.deliveredFrac < 0.2);
});

test('a balanced Wildfire design predicts 3 stars', () => {
  const ev = evaluate(fireGood(), 'launch');
  assert.equal(ev.ready, true, JSON.stringify(ev.bad));
  assert.equal(ev.stars, 3);
});

test('overloading power and mass blocks launch', () => {
  const c = fireGood();
  c.design.inst = { tir: true, msi: true, hsi: true, lidar: true };
  c.design.sel.solar = 'body';
  const ev = evaluate(c, 'launch');
  assert.equal(ev.ready, false);
  assert.ok(ev.bad.some((i) => i.slot === 'solar'));
});

test('deep-space missions reject magnetorquers and need the DSN', () => {
  const c = defaultConfig('mars', 'eng');
  c.design.sel.adcs = 'mag';
  c.groundId = 'uni';
  const n = normalizeConfig(c);
  assert.equal(n.groundId, 'dsn', 'uni is not offered for Mars');
  const ev = evaluate(n, 'launch');
  assert.ok(ev.bad.some((i) => i.slot === 'adcs'));
});

test('normalizeConfig survives garbage input', () => {
  const n = normalizeConfig({ missionId: '<script>', design: { sel: { bus: 'zzz' }, inst: { nope: true } }, orbitId: 42 });
  assert.equal(n.missionId, 'fire');
  assert.equal(n.design.sel.bus, 'm');
  assert.equal(n.design.inst.nope, undefined);
  assert.doesNotThrow(() => evaluate(n));
});

test('missions are deterministic for the same seed and decisions', () => {
  const c = fireGood();
  const a = runMission(c, 12345, ['push', 'trim', 'extra']);
  const b = runMission(c, 12345, ['push', 'trim', 'extra']);
  assert.deepEqual(scoreMission(c, a), scoreMission(c, b));
  assert.equal(a.sci, b.sci);
  assert.notEqual(a.status, 'running');
});

test('stepping by hand matches runMission', () => {
  const c = fireGood();
  const sim = createSim(c, 777);
  const picks = [];
  let guard = 0;
  while (sim.status === 'running' && guard++ < 100000) {
    if (sim.pending) { const id = firstOption(sim); picks.push(id); decide(sim, id); } else stepDay(sim);
  }
  const auto = runMission(c, 777, picks);
  assert.equal(Math.round(sim.sci), Math.round(auto.sci));
  assert.equal(sim.day, auto.day);
});

test('event count follows the study level', () => {
  for (const [id, lvl] of Object.entries(LEVELS)) {
    const sim = createSim({ ...fireGood(), level: id }, 99);
    assert.equal(sim.events.length, Math.min(lvl.events, 7));
    for (const e of sim.events) assert.ok(EVENTS[e.type], e.type);
  }
});

test('every mission default plays to the end and scores', () => {
  for (const m of MISSIONS) {
    const c = defaultConfig(m.id, 'cadet');
    const sim = runMission(c, 4242);
    assert.notEqual(sim.status, 'running', m.id);
    const s = scoreMission(c, sim);
    assert.ok(s.total >= 0 && s.stars >= 0 && s.stars <= 3, m.id);
    assert.ok(suggestions(c, sim).length > 0);
  }
});

test('good design outscores the default design over many seeds', () => {
  let better = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = fireGood(); const d = defaultConfig('fire', 'eng');
    if (scoreMission(g, runMission(g, seed)).total > scoreMission(d, runMission(d, seed)).total) better++;
  }
  assert.ok(better >= 18, `good design won ${better}/20`);
});

test('design share codes round-trip', () => {
  const c = fireGood();
  const back = decodeDesign(encodeDesign(c));
  assert.deepEqual(back.design, normalizeConfig(c).design);
  assert.equal(decodeDesign('%%%'), null);
});

test('formatters', () => {
  assert.equal(fmtMoney(0.15), '$150K');
  assert.equal(fmtMoney(120), '$120M');
  assert.equal(fmtData(0.05), '50 Mb');
});

test('prototype keys are not valid missions or levels', async () => {
  const { isLevel, isMission } = await import('../public/js/engine.js');
  for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(isLevel(k), false);
    assert.equal(isMission(k), false);
    const n = normalizeConfig({ missionId: k, level: k });
    assert.equal(n.missionId, 'fire');
    assert.equal(n.level, 'cadet');
    assert.ok(Number.isFinite(scoreMission(n, runMission(n, 1)).total));
  }
});

test('challenge seeds are shared and level-specific', async () => {
  const { challengeSeed, CODE_RE } = await import('../public/js/engine.js');
  assert.equal(challengeSeed('ABCDE', 'fire', 'eng'), challengeSeed('ABCDE', 'fire', 'eng'));
  assert.notEqual(challengeSeed('ABCDE', 'fire', 'eng'), challengeSeed('ABCDE', 'fire', 'fd'));
  assert.ok(CODE_RE.test('AB2CD'));
  assert.ok(!CODE_RE.test('ABC'));
  assert.ok(!CODE_RE.test('ABCD0'));
});
