// SATIT Orbital — "Watch top runs": replay a stored run on the operations screen.
// Pure logic, no DOM. A replay re-creates the same simulation (design + seed) and feeds it the stored
// decisions in order, pausing on each emergency so a viewer can read it. The engine is untouched.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { createSim, stepDay, decide, firstOption, scoreMission, decodeDesign, isMission } from './engine.js';

export const DIALOG_MS = 2000; // how long an emergency is shown before the stored choice is applied
export const OUTCOME_MS = 2000; // how long the outcome is shown afterwards
const MAX_DECISIONS = 12;

/** Turn the (untrusted) /api/replay JSON into a ready-to-run replay, or { ok:false, error }. */
export function parseReplay(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'That replay could not be read.' };
  if (typeof raw.design !== 'string' || raw.design.length > 4000) return { ok: false, error: 'That replay has no design.' };
  const cfg = decodeDesign(raw.design);
  if (!cfg || !isMission(cfg.missionId)) return { ok: false, error: 'That replay uses a design this version cannot read.' };
  const seed = Number(raw.seed);
  if (!Number.isFinite(seed)) return { ok: false, error: 'That run has no replay data.' };
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : []).slice(0, MAX_DECISIONS).map((d) => String(d).slice(0, 16));
  const callsign = String(raw.callsign ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 32) || 'Unknown';
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const R = {
    id: num(raw.id), cfg, seed: seed >>> 0, decisions, callsign,
    storedScore: num(raw.score), storedStars: Math.max(0, Math.min(3, Math.round(num(raw.stars)))),
    daily: typeof raw.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily) ? raw.daily : '',
    phase: 'run', t: 0, acc: 0, di: 0, choice: null, outcome: null, final: null,
    sim: null
  };
  R.sim = createSim(cfg, R.seed);
  return { ok: true, replay: R };
}

function finish(R) {
  R.phase = 'end';
  R.outcome = null;
  R.final = scoreMission(R.cfg, R.sim);
}

/**
 * Move a replay forward by dtMs of real time at the given speed (0 = paused, 1, 3 or 8).
 * Returns true when something visible changed (a new emergency, an outcome, the end).
 */
export function advance(R, dtMs, speed) {
  if (R.phase === 'end' || speed === 0) return false;
  const sim = R.sim;
  const quick = speed >= 3 ? 2 : 1; // dialogs and outcomes pass faster at high speed
  if (R.phase === 'dialog') {
    R.t += dtMs * quick;
    if (R.t < DIALOG_MS) return false;
    decide(sim, R.choice);
    R.di++;
    R.outcome = sim.log[sim.log.length - 1] || null;
    R.choice = null;
    R.phase = 'outcome';
    R.t = 0;
    return true;
  }
  if (R.phase === 'outcome') {
    R.t += dtMs * quick;
    if (R.t < OUTCOME_MS) return false;
    R.outcome = null;
    R.phase = 'run';
    R.t = 0;
    if (sim.status !== 'running') finish(R);
    return true;
  }
  // phase 'run': same pacing as the live loop (about 250 ticks of 100 ms for the whole mission at 1x)
  if (sim.status !== 'running') { finish(R); return true; }
  R.acc += sim.days / 250 * speed * (dtMs / 100);
  let changed = false;
  while (R.acc >= 1) {
    stepDay(sim);
    R.acc -= 1;
    changed = true;
    if (sim.pending || sim.status !== 'running') { R.acc = 0; break; }
  }
  if (sim.pending) {
    R.phase = 'dialog';
    R.t = 0;
    const want = R.decisions[R.di];
    const ok = sim.pending.options.find((o) => o.id === want && !o.disabled);
    R.choice = ok ? ok.id : firstOption(sim); // same fallback the engine uses
    return true;
  }
  if (sim.status !== 'running') finish(R);
  return changed;
}

/** Run a replay to the end with no pauses (used by tests; mirrors what the viewer sees). */
export function fastForward(R) {
  let guard = 0;
  while (R.phase !== 'end' && guard++ < 100000) advance(R, 100000, 8);
  return R;
}
