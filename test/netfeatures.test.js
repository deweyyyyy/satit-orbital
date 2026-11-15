// Pure-helper tests for the browser network features: replay stepping, classroom data cleaning, result card text.
// Run with: npm test
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, encodeDesign, runMission, scoreMission } from '../public/js/engine.js';
import { parseReplay, advance, fastForward, DIALOG_MS, OUTCOME_MS } from '../public/js/replay.js';
import { cleanInput, cleanClass, reportRows, isClassCode, buildReport } from '../public/js/classroom.js';
import { summaryLines, wrapText } from '../public/js/card.js';

const goodFire = () => {
  const c = defaultConfig('fire', 'eng');
  c.design.sel = { bus: 'm', solar: 'wing', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'cold' };
  c.design.inst = { tir: true, msi: true };
  return c;
};
const raw = (cfg, seed, decisions) => ({ id: 3, mission: cfg.missionId, level: cfg.level, callsign: 'Calm-Otter-12', score: 1, stars: 1, design: encodeDesign(cfg), seed, decisions });

test('replay reproduces the exact score the server would compute', () => {
  const cfg = goodFire();
  for (const seed of [1, 777, 123456789]) {
    const live = runMission(cfg, seed, []);
    const parsed = parseReplay(raw(cfg, seed, live.decisions));
    assert.ok(parsed.ok, parsed.error);
    const R = fastForward(parsed.replay);
    assert.equal(R.phase, 'end');
    assert.equal(R.final.total, scoreMission(cfg, live).total, `seed ${seed}`);
    assert.deepEqual(R.sim.decisions, live.decisions);
  }
});

test('replay pauses ~2 s on each emergency and ~2 s on its outcome, and speed 0 holds it still', () => {
  const cfg = goodFire();
  const R = parseReplay(raw(cfg, 777, runMission(cfg, 777, []).decisions)).replay;
  let guard = 0;
  while (R.phase !== 'dialog' && guard++ < 10000) advance(R, 100, 1);
  assert.equal(R.phase, 'dialog');
  assert.ok(R.choice, 'the stored choice is lined up');
  assert.equal(advance(R, 5000, 0), false, 'paused');
  assert.equal(R.phase, 'dialog');
  const before = R.sim.eventIdx;
  for (let t = 0; t < DIALOG_MS - 100; t += 100) advance(R, 100, 1);
  assert.equal(R.phase, 'dialog', 'still showing the emergency');
  advance(R, 200, 1);
  assert.equal(R.phase, 'outcome');
  assert.equal(R.sim.eventIdx, before + 1, 'decision applied');
  assert.ok(R.outcome && R.outcome.title, 'outcome entry shown');
  for (let t = 0; t < OUTCOME_MS - 100; t += 100) advance(R, 100, 1);
  assert.equal(R.phase, 'outcome');
  advance(R, 200, 1);
  assert.equal(R.phase, 'run');
  assert.equal(R.outcome, null);
});

test('replay survives bad or missing decisions by falling back to the first option', () => {
  const cfg = goodFire();
  const R = fastForward(parseReplay(raw(cfg, 777, ['nonsense', 42, null])).replay);
  assert.equal(R.phase, 'end');
  assert.ok(Number.isFinite(R.final.total));
});

test('parseReplay rejects unusable replay data', () => {
  const cfg = goodFire();
  assert.equal(parseReplay(null).ok, false);
  assert.equal(parseReplay({}).ok, false);
  assert.equal(parseReplay({ ...raw(cfg, 1, []), design: '%%%not-a-design' }).ok, false);
  assert.equal(parseReplay({ ...raw(cfg, 1, []), seed: 'abc' }).ok, false);
  const long = parseReplay({ ...raw(cfg, 1, Array(50).fill('x'.repeat(40))), callsign: '<b>Bad</b>-Name-01' });
  assert.ok(long.ok);
  assert.equal(long.replay.decisions.length, 12);
  assert.ok(long.replay.decisions.every((d) => d.length <= 16));
  assert.equal(long.replay.callsign, 'bBadb-Name-01', 'markup characters are stripped from callsigns');
});

test('class code and key inputs are cleaned', () => {
  assert.equal(cleanInput('ab-c d2e!xyz'), 'ABCD2');
  assert.equal(cleanInput('abcdefgh23456789xx', 16), 'ABCDEFGH23456789');
  assert.ok(isClassCode('ABCDE') && !isClassCode('ABCD0') && !isClassCode('abcde'));
});

test('cleanClass keeps only known, plain values', () => {
  const c = cleanClass({
    code: 'ABCDE', createdAt: '2026-11-15 10:00:00', total: 'x',
    students: [
      { callsign: 'Calm-Otter-12', runs: 3, best: 9100.6, bestStars: 9, missions: ['fire', 'fire', 'nope', 'cube'] },
      { callsign: '<script>', runs: -4, best: 'x', bestStars: 1, missions: 'fire' },
      null, { callsign: '' }
    ]
  });
  assert.equal(c.code, 'ABCDE');
  assert.equal(c.students.length, 2);
  assert.deepEqual(c.students[0], { callsign: 'Calm-Otter-12', runs: 3, best: 9101, bestStars: 3, missions: ['fire', 'cube'] });
  assert.equal(c.students[1].callsign, 'script');
  assert.equal(c.students[1].runs, 0);
  assert.equal(c.students[1].best, 0);
  assert.equal(c.total, 2);
  assert.equal(cleanClass({ code: 'bad', students: [] }), null);
  assert.equal(cleanClass(null), null);
  const rows = reportRows(c);
  assert.equal(rows[0].missions, 'Wildfire Watch, CubeSat Classroom');
});

test('print report is built with text nodes (no HTML from the network)', () => {
  const els = [];
  globalThis.document = {
    createElement(tag) {
      const e = { tag, children: [], className: '', textContent: '', append(...k) { e.children.push(...k); }, get firstChild() { return e.children[0]; } };
      els.push(e); return e;
    }
  };
  try {
    const data = cleanClass({ code: 'ABCDE', total: 1, students: [{ callsign: 'Calm-Otter-12', runs: 1, best: 500, bestStars: 2, missions: ['fire'] }] });
    const root = buildReport(data, new Date('2026-11-15T00:00:00Z'));
    assert.equal(root.id, 'print-report');
    const text = els.map((e) => e.textContent).join('|');
    assert.match(text, /Class ABCDE · 1 student · printed 2026-11-15/);
    assert.match(text, /Calm-Otter-12/);
    assert.match(text, /★★/);
  } finally { delete globalThis.document; }
});

test('result card summary lines and wrapping', () => {
  const d = { parts: ['Medium bus', 'Solar wings'], instruments: [], orbit: 'Sun-synchronous orbit', launcher: 'Rideshare rocket', ground: 'x' };
  const lines = summaryLines(d);
  assert.equal(lines.length, 4);
  assert.equal(lines[1], 'Instruments: none');
  assert.match(lines[0], /^Parts: Medium bus · Solar wings$/);
  const measure = (s) => s.length * 10;
  assert.deepEqual(wrapText(measure, 'aaa bbb ccc ddd', 70, 3), ['aaa bbb', 'ccc ddd']);
  const cut = wrapText(measure, 'one two three four five six seven', 80, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…') && measure(cut[1]) <= 80);
  assert.deepEqual(wrapText(measure, '', 80, 2), []);
});
