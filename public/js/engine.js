// SATIT Orbital — game engine. Pure and deterministic: no DOM, no Date, no Math.random.
// Shared by the browser and the Cloudflare Worker (which re-runs missions to verify leaderboard scores).
// Code written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { CATALOG, INSTRUMENTS, ORBITS, LAUNCHERS, GROUNDS, MISSION_BY_ID, LEVELS, EVENTS, OPPORTUNITY_TEXT, ROLES, revisitHours } from './data.js';
export { revisitHours, orbitPeriodMin, orbitsPerDay, REF_SWATH_KM } from './data.js';

// ---------- helpers ----------
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (n) => Math.round(n * 10) / 10;

export function fmtNum(n) {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a >= 100) return String(Math.round(n));
  if (a >= 10) return String(round1(n)).replace(/\.0$/, '');
  if (a >= 1) return (Math.round(n * 100) / 100).toString();
  return (Math.round(n * 1000) / 1000).toString();
}
export function fmtMoney(m) {
  if (!Number.isFinite(m)) return 'Unlimited';
  const neg = m < 0 ? '−' : '';
  const a = Math.abs(m);
  if (a >= 1) return neg + '$' + fmtNum(a) + 'M';
  return neg + '$' + Math.round(a * 1000) + 'K';
}
export function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function fmtMass(kg) {
  if (!Number.isFinite(kg)) return '∞ kg';
  return fmtNum(kg) + ' kg';
}
export function fmtData(gb) {
  if (gb >= 1) return fmtNum(gb) + ' Gb';
  if (gb >= 0.001) return fmtNum(gb * 1000) + ' Mb';
  return fmtNum(gb * 1e6) + ' kb';
}

// ---------- configuration ----------
const own = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
export function getMission(id) { return own(MISSION_BY_ID, id) ? MISSION_BY_ID[id] : MISSION_BY_ID.fire; }
export function isLevel(l) { return own(LEVELS, l); }
export function isMission(id) { return own(MISSION_BY_ID, id); }
export function catalogFor(m) { return CATALOG[m.cls]; }

export function defaultConfig(missionId, level = 'cadet', mode = 'solo') {
  const m = getMission(missionId);
  return {
    missionId: m.id, level: own(LEVELS, level) ? level : 'cadet', mode,
    design: { sel: { ...m.defaults.sel }, inst: { ...m.defaults.inst } },
    orbitId: m.defaults.orbit, launcherId: m.defaults.launcher, groundId: m.defaults.ground
  };
}

// Make any (possibly untrusted) config valid. Unknown ids fall back to mission defaults.
export function normalizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const m = getMission(String(r.missionId || ''));
  const base = defaultConfig(m.id, String(r.level || ''), String(r.mode || 'solo'));
  const cat = catalogFor(m);
  const sel = {};
  for (const slot of cat.slots) {
    const want = r.design && r.design.sel ? r.design.sel[slot] : undefined;
    sel[slot] = cat[slot].some((o) => o.id === want) ? want : base.design.sel[slot];
  }
  const inst = {};
  for (const id of m.instruments) inst[id] = !!(r.design && r.design.inst && r.design.inst[id]);
  const pick = (list, want, def) => (list.includes(want) ? want : def);
  return {
    missionId: m.id, level: base.level,
    mode: ['solo', 'local', 'online', 'versus', 'sandbox'].includes(r.mode) ? r.mode : 'solo',
    design: { sel, inst },
    orbitId: pick(m.orbits, r.orbitId, base.orbitId),
    launcherId: pick(m.launchers, r.launcherId, base.launcherId),
    groundId: pick(m.grounds, r.groundId, base.groundId)
  };
}

// Revisit time for a design: LEO orbits use the widest swath among the imaging instruments on board.
// Other orbit families (and designs with no imager) keep the orbit's fixed nominal value.
export function designRevisit(orbit, picked) {
  const swaths = picked.map((i) => i.swathKm || 0).filter((v) => v > 0);
  if (orbit.altKm && swaths.length) {
    const swathKm = Math.max(...swaths);
    return { revisitH: revisitHours(orbit.altKm, swathKm), swathKm };
  }
  return { revisitH: orbit.revisitH ?? null, swathKm: null };
}
const revisitSub = (h, swathKm, lead) => `${lead} about every ${fmtNum(h)} h${swathKm ? ` with a ${fmtInt(swathKm)} km swath` : ''}`;

// ---------- evaluation ----------
export function evaluate(cfg, phase = 'hangar') {
  const m = getMission(cfg.missionId);
  const cat = catalogFor(m);
  const lvl = own(LEVELS, cfg.level) ? LEVELS[cfg.level] : LEVELS.cadet;
  const sandbox = cfg.mode === 'sandbox';
  const eq = {};
  for (const slot of cat.slots) eq[slot] = cat[slot].find((o) => o.id === cfg.design.sel[slot]) || cat[slot][0];
  const picked = m.instruments.filter((id) => cfg.design.inst[id]).map((id) => ({ id, ...INSTRUMENTS[id] }));
  const orbit = ORBITS[cfg.orbitId] || ORBITS[m.defaults.orbit];
  const launcher = LAUNCHERS[cfg.launcherId] || LAUNCHERS[m.defaults.launcher];
  const ground = GROUNDS[cfg.groundId] || GROUNDS[m.defaults.ground];
  const dest = orbit.dest;
  const nearEarth = dest === 'leo' || dest === 'gto';

  let mass = 0, busDraw = 0, instDraw = 0, scCost = 0, data = 0;
  for (const slot of cat.slots) { const o = eq[slot]; mass += o.mass; busDraw += o.power || 0; scCost += o.cost; }
  for (const i of picked) { mass += i.mass; instDraw += i.power; scCost += i.cost; data += i.data; }
  const draw = busDraw + instDraw;
  const gen = eq.solar.gen * m.sun;
  const cap = eq.battery.cap;
  const fine = !!eq.adcs.fine;
  const magFar = !fine && !nearEarth;
  const dvHave = eq.prop ? eq.prop.dv : 0;
  const dvNeed = orbit.dv;
  const groundMult = ground.mult[dest] ?? 0;
  const down = eq.comms.down * orbit.link * groundMult;
  const massLimit = sandbox ? Infinity : (m.cls === 'cube' ? eq.bus.maxMass : (launcher.cap[dest] ?? 0));
  const launchCost = m.cls === 'cube' ? (launcher.cubeRide ? eq.bus.rideCost : launcher.cost) : launcher.cost;
  const opsCostYr = ground.costYr;
  const opsCost = opsCostYr * m.years;
  const budget = sandbox ? Infinity : m.budget * lvl.budgetMult;
  const totalCost = scCost + launchCost + opsCost;
  const life = Math.min(eq.bus.life, orbit.lifeCap);
  const storage = eq.bus.storage;
  const days = Math.round(m.years * 365);

  // effective science per instrument per day (before duty cycle and data delivery)
  const instruments = picked.map((i) => {
    let mult = orbit.sciMult;
    if (i.fine && !fine) mult *= 0.5;
    if (magFar) mult *= 0.6;
    if (i.tags && i.tags.includes('relay')) mult *= (orbit.coverage ?? 1);
    return { ...i, sciEff: i.sci * mult };
  });
  const sciPotential = picked.reduce((s, i) => s + i.sci, 0);
  const sciEff = instruments.reduce((s, i) => s + i.sciEff, 0);
  const duty = instDraw > 0 ? clamp((gen - busDraw) / instDraw, 0, 1) : 1;
  const deliveredFrac = data > 0 ? Math.min(1, down / (data * duty || data)) : 1;
  const sciPerDay = sciEff * duty * deliveredFrac;
  const sciPredicted = Math.round(sciPerDay * days / 10);
  const sciTarget = Math.round(m.sciRef * days / 10 * 0.7);

  const { revisitH, swathKm } = designRevisit(orbit, picked);
  const ctx = { m, cat, eq, picked, orbit, launcher, ground, dest, mass, massLimit, draw, gen, data, down, deliveredFrac, totalCost, budget, life, fine, dvHave, dvNeed, revisitH, swathKm };

  // ----- issues voiced by crew -----
  const issues = [];
  const add = (k, who, slot, t) => issues.push({ k, who, slot, t });
  const lName = launcher.name.toLowerCase();
  if (picked.length === 0) add('bad', 'sci', 'inst', 'Commander, we have no instruments! Without them there is nothing to discover. Open the instruments tab and pick at least one.');
  if (draw > gen) add('bad', 'eng', 'solar', `We need ${fmtNum(draw)} W but the panels only make ${fmtNum(gen)} W${m.sun < 1 ? ' this far from the Sun' : ''}. Bigger solar wings, or switch something off.`);
  if (draw > cap) add('bad', 'eng', 'battery', `In shadow the ${eq.battery.name} can’t carry ${fmtNum(draw)} W. We’d black out every orbit!`);
  if (mass > massLimit) {
    if (m.cls === 'cube') add('bad', 'eng', 'bus', `We’re ${fmtMass(mass - massLimit)} over the ${eq.bus.name} limit of ${fmtMass(massLimit)}. Pick a bigger CubeSat or lighter parts.`);
    else if (massLimit === 0) add('bad', 'ops', null, `The ${lName} can’t reach a ${orbit.name.toLowerCase()} at all. We need a bigger rocket.`);
    else add('bad', 'eng', 'bus', `We’re ${fmtMass(mass - massLimit)} too heavy for the ${lName}, which lifts ${fmtMass(massLimit)} to this orbit. Slim down, or buy a bigger rocket in Phase 3.`);
  }
  if (totalCost > budget) add('bad', 'cmd', null, `The whole mission costs ${fmtMoney(totalCost)}: spacecraft ${fmtMoney(scCost)}, launch ${fmtMoney(launchCost)}, operations ${fmtMoney(opsCost)}. That’s ${fmtMoney(totalCost - budget)} over our ${fmtMoney(budget)} budget.`);
  if (eq.prop !== undefined && dvHave < dvNeed) add('bad', 'ops', 'prop', `Reaching our ${orbit.name.toLowerCase()} takes ${dvNeed} m/s of Δv, but the ${eq.prop.name.toLowerCase()} only gives ${dvHave}. We need a stronger engine.`);
  if (magFar) add('bad', 'sci', 'adcs', 'Magnetorquers push against Earth’s magnetic field, and there isn’t one out here. We need reaction wheels to point at all.');
  if (groundMult === 0) add('bad', 'ops', null, `The ${ground.name.toLowerCase()} can’t hear a spacecraft this far away. We need the Deep Space Network.`);
  if (launcher.orbits && !launcher.orbits.includes(cfg.orbitId)) add('bad', 'ops', null, `The ${lName} only goes to ${launcher.orbits.map((o) => ORBITS[o].name.toLowerCase()).join(' or ')}. Pick that orbit or another rocket.`);
  if (picked.length && data > 0 && deliveredFrac < 0.999) {
    const lostPct = Math.round((1 - deliveredFrac) * 100);
    add(deliveredFrac < 0.8 ? 'warn' : 'warn', 'ops', 'comms', `Instruments collect ${fmtData(data)} a day but we can only send home ${fmtData(down)}. We’d lose about ${lostPct}% of the data. A stronger radio, or fewer data-hungry instruments?`);
  }
  for (const i of picked) if (i.fine && !fine && !magFar) add('warn', 'sci', 'adcs', `The ${i.name.toLowerCase()} needs a steady aim. Magnetorquers wobble, so half its images will blur.`);
  if (eq.cpu && !eq.cpu.rad) add('warn', 'eng', 'cpu', `The ${eq.cpu.name.toLowerCase()} computer saves money, but a solar storm could crash it mid-mission.`);
  if (Number.isFinite(massLimit) && mass <= massLimit && mass > massLimit * 0.9) add('warn', 'eng', null, 'Less than 10% mass to spare. Real spacecraft always gain weight while they are being built.');
  if (life < m.years) add('warn', 'eng', life === orbit.lifeCap && orbit.lifeCap < eq.bus.life ? null : 'bus', life === orbit.lifeCap && orbit.lifeCap < eq.bus.life
    ? `This orbit only lasts about ${fmtNum(life)} years before air drag or gravity ends it, but the mission needs ${fmtNum(m.years)}.`
    : `The ${eq.bus.name.toLowerCase()} is built for ${fmtNum(life)} years, but the mission needs ${fmtNum(m.years)}.`);
  if (Number.isFinite(budget) && totalCost <= budget && budget - totalCost < budget * 0.05) add('warn', 'cmd', null, `Only ${fmtMoney(budget - totalCost)} left in reserve. Real missions keep money aside for emergencies after launch.`);
  if (eq.prop && eq.prop.id === 'none' && dest === 'leo' && m.cls !== 'cube') add('warn', 'ops', 'prop', 'With no engine we can’t dodge space debris. Even cold-gas thrusters would help.');

  const objectives = m.reqs.map((r) => checkReq(r, ctx, phase, null));
  const bad = issues.filter((i) => i.k === 'bad');
  const warns = issues.filter((i) => i.k === 'warn');
  const ready = bad.length === 0;

  let stars = 0;
  if (ready) {
    stars = 1;
    const fails = objectives.filter((o) => o.status === 'fail').length;
    if (fails <= 1 && sciPredicted >= sciTarget * 0.6) stars = 2;
    if (fails === 0 && sciPredicted >= sciTarget) stars = 3;
  }

  return {
    m, cat, eq, picked, instruments, orbit, launcher, ground, dest, lvl, sandbox,
    mass, massLimit, busDraw, instDraw, draw, gen, cap, data, down, deliveredFrac, duty,
    scCost, launchCost, opsCost, opsCostYr, totalCost, budget, life, storage, days,
    dvHave, dvNeed, fine, sciPotential, sciEff, sciPredicted, sciTarget, revisitH, swathKm,
    issues, bad, warns, ready, objectives, stars
  };
}

function hasTag(picked, tag) { return picked.some((i) => i.tags && i.tags.includes(tag)); }

// status: met | fail | pend
export function checkReq(r, ctx, phase, sim) {
  const { m, eq, picked, orbit, launcher, mass, deliveredFrac, totalCost, budget, life, fine } = ctx;
  const revisitH = ctx.revisitH ?? orbit.revisitH;
  const swathKm = ctx.swathKm ?? null;
  const orbitPend = phase === 'hangar';
  const res = (ok, sub) => ({ text: r.text, kind: r.kind, status: ok ? 'met' : 'fail', sub });
  const pend = (sub) => ({ text: r.text, kind: r.kind, status: 'pend', sub });
  switch (r.kind) {
    case 'formFactor': return res(mass <= eq.bus.maxMass, `${fmtMass(mass)} of ${fmtMass(eq.bus.maxMass)} allowed`);
    case 'dailyPhoto': {
      if (!hasTag(picked, 'photo')) return res(false, 'Needs a camera');
      if (orbitPend) return pend('Camera ready · orbit chosen in Phase 3');
      return res(revisitH <= (r.hours ?? 24), revisitSub(revisitH, swathKm, 'Revisits'));
    }
    case 'data80': {
      if (sim) {
        const f = sim.generated > 0 ? sim.delivered / sim.generated : 0;
        return res(sim.generated > 0 && f >= 0.8, `${Math.round(f * 100)}% of data reached the ground`);
      }
      if (!picked.length) return res(false, 'No instruments collecting data');
      return res(deliveredFrac >= 0.8, `${Math.round(deliveredFrac * 100)}% of data reaches the ground`);
    }
    case 'life': {
      if (sim) {
        const yrs = sim.day / 365;
        return res(sim.status !== 'lost' && sim.day >= sim.days - 1, `Operated ${fmtNum(yrs)} of ${fmtNum(m.years)} years`);
      }
      if (orbitPend && orbit.lifeCap < eq.bus.life && orbit.lifeCap < m.years) return res(eq.bus.life >= m.years, `Structure lasts ${eq.bus.life} yr · check orbit in Phase 3`);
      return res(life >= m.years, `Lasts about ${fmtNum(life)} years`);
    }
    case 'launchTime': {
      if (orbitPend) return pend('Rocket chosen in Phase 3');
      return res((launcher.delayMonths ?? 6) <= r.months, `Launch in about ${launcher.delayMonths ?? 6} months`);
    }
    case 'budget': {
      if (sim) return res(sim.budgetLeft >= 0, sim.sandbox ? 'Sandbox: no budget' : `${fmtMoney(sim.budgetLeft)} left at the end`);
      return res(totalCost <= budget, `${fmtMoney(totalCost)} of ${fmtMoney(budget)}`);
    }
    case 'revisit':
      if (orbitPend) return pend('Decided by your orbit in Phase 3');
      return res(revisitH <= r.hours, revisitSub(revisitH, swathKm, 'Revisits'));
    case 'fire50': {
      const tir = picked.some((i) => i.id === 'tir');
      if (!tir) return res(false, 'Needs a thermal imager');
      if (!fine) return res(false, 'Thermal imager needs reaction wheels');
      if (sim && sim.flags.limp) return res(false, 'Pointing failed during the mission');
      if (orbitPend) return pend('Thermal imager ready · orbit chosen in Phase 3');
      return res(orbit.sharp, orbit.sharp ? 'Sharp enough from this orbit' : 'Too far away to pick out 50 m fires');
    }
    case 'coverage':
      if (orbitPend) return pend('Decided by your orbit in Phase 3');
      return res((orbit.coverage ?? 0) >= r.min, `Landing zone in view ${Math.round((orbit.coverage ?? 0) * 100)}% of the day`);
    case 'relayRate': {
      const rate = Math.max(0, ...picked.map((i) => i.rate || 0));
      return res(rate >= r.min, rate ? `Relay radio runs at ${rate} Mb/s` : 'Needs a relay radio');
    }
    case 'closeApproach':
      if (orbitPend) return pend('Decided by your trajectory in Phase 3');
      return res(orbit.closestKm <= r.km, `Closest approach ${fmtNum(orbit.closestKm)} km`);
    case 'imageRes': {
      if (!hasTag(picked, 'imager')) return res(false, 'Needs a narrow-angle camera');
      if (!fine) return res(false, 'Camera needs precise pointing');
      if (sim && sim.flags.limp) return res(false, 'Pointing failed during the mission');
      if (orbitPend) return pend('Camera ready · trajectory chosen in Phase 3');
      return res(orbit.resM <= r.m, `Best images ${fmtNum(orbit.resM)} m per pixel`);
    }
    case 'composition': {
      const ok = picked.some((i) => i.id === 'irspec' || i.id === 'xrs');
      return res(ok, ok ? 'Spectrometer on board' : 'Needs a spectrometer');
    }
    case 'globalMap': {
      if (!hasTag(picked, 'globalmap')) return res(false, 'Needs a wide-angle weather camera');
      if (orbitPend) return pend('Camera ready · orbit chosen in Phase 3');
      return res(!!orbit.globalMap, 'Sees the whole planet daily');
    }
    case 'arrival': {
      const mo = eq.prop && eq.prop.cruiseMonths;
      if (!mo) return res(false, 'Engine too weak to reach Mars quickly');
      return res(mo <= r.months, `Cruise takes about ${mo} months`);
    }
    default: return res(false, '');
  }
}

// ---------- simulation ----------
function applicableEvents(ev) {
  const out = ['storm', 'mmod', 'outage', 'opportunity', 'budget'];
  if (ev.fine) out.push('wheel');
  if (ev.dest === 'leo') out.push('debris');
  return out;
}

export function createSim(cfg, seed) {
  const ev = evaluate(cfg, 'ops');
  const rand = makeRng(seed);
  const days = ev.days;
  const pool = applicableEvents(ev);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const count = Math.min(ev.sandbox ? 2 : ev.lvl.events, pool.length);
  const slots = [];
  const lo = Math.floor(days * 0.08), hi = Math.floor(days * 0.92);
  const span = Math.max(1, hi - lo);
  for (let k = 0; k < count; k++) {
    // spread events across the timeline with a little jitter
    const base = lo + Math.floor(span * (k + 0.5) / count);
    const jitter = Math.floor((rand() - 0.5) * span / (count * 2));
    slots.push(clamp(base + jitter, 1, days - 2));
  }
  slots.sort((a, b) => a - b);
  const events = slots.map((day, k) => ({ day, type: pool[k] }));
  const budgetLeft = ev.sandbox ? 1e9 : ev.budget - ev.scCost - ev.launchCost;
  const sim = {
    v: 1, missionId: ev.m.id, seed: seed >>> 0, days, day: 0, sandbox: ev.sandbox,
    health: 100, battery: 1, stored: 0, storedSci: 0, generated: 0, delivered: 0, lost: 0, sci: 0,
    budgetLeft, budgetStart: ev.sandbox ? 1e9 : ev.budget, opsStart: Math.max(budgetLeft, 0.001), dvLeft: ev.dvHave - ev.dvNeed,
    flags: { trim: false, limp: false, cutground: false, powerLoss: 0, brownout: false },
    mods: [], powerLimitedDays: 0, events, eventIdx: 0, pending: null, decisions: [], wise: 0,
    log: [], history: [], status: 'running', endReason: null,
    today: { gen: 0, sent: 0, duty: 1, power: ev.gen, load: ev.draw }
  };
  Object.defineProperty(sim, '_rand', { value: rand, enumerable: false });
  Object.defineProperty(sim, '_ev', { value: ev, enumerable: false });
  return sim;
}

function modValue(sim, kind) {
  let v = 1;
  for (const md of sim.mods) if (md.kind === kind && sim.day < md.until) v *= md.value;
  return v;
}
function modActive(sim, kind) { return sim.mods.some((md) => md.kind === kind && sim.day < md.until); }

export function stepDay(sim) {
  if (sim.status !== 'running' || sim.pending) return sim;
  const ev = sim._ev;
  if (sim.eventIdx < sim.events.length && sim.day >= sim.events[sim.eventIdx].day) {
    sim.pending = buildPending(sim, sim.events[sim.eventIdx].type);
    return sim;
  }
  const years = sim.day / 365;
  const powerMult = (1 - 0.02 * years) * (1 - sim.flags.powerLoss) * modValue(sim, 'power');
  const genNow = ev.gen * powerMult;
  let duty = ev.instDraw > 0 ? clamp((genNow - ev.busDraw) / ev.instDraw, 0, 1) : 1;
  const paused = modActive(sim, 'pause');
  if (!paused && duty < 0.999) sim.powerLimitedDays++; // short of power (a chosen 80% trim does not count)
  if (sim.flags.trim) duty = Math.min(duty, 0.8);
  if (paused) duty = 0;
  const load = ev.busDraw + ev.instDraw * duty;
  sim.battery -= load > ev.cap ? 0.003 : 0.00005;
  if (sim.battery < 0.4) {
    duty *= 0.6;
    if (!sim.flags.brownout) { sim.flags.brownout = true; sim.log.push({ day: sim.day, kind: 'warn', title: 'Battery worn out', text: 'The battery can no longer hold a full charge. Instruments now brown out during every eclipse.' }); }
  }
  sim.battery = Math.max(0, sim.battery);
  const degraded = sim.flags.limp || modActive(sim, 'pointing');
  const dataMult = modValue(sim, 'data');
  const sciMult = modValue(sim, 'sci');
  let gen = 0, potSci = 0;
  for (const i of ev.instruments) {
    gen += i.data * duty * dataMult;
    potSci += i.sciEff * duty * sciMult * (degraded && i.fine ? 0.5 : 1);
  }
  const downCap = ev.down * (sim.flags.cutground ? 0.6 : 1) * (modActive(sim, 'outage') ? 0 : 1);
  sim.stored += gen; sim.storedSci += potSci; sim.generated += gen;
  const sent = Math.min(sim.stored, downCap);
  const credit = sim.stored > 0 ? sim.storedSci * (sent / sim.stored) : 0;
  sim.stored -= sent; sim.storedSci -= credit; sim.delivered += sent; sim.sci += credit / 10;
  if (sim.stored > ev.storage) {
    const over = sim.stored - ev.storage;
    sim.storedSci *= 1 - over / sim.stored;
    sim.lost += over;
    sim.stored = ev.storage;
  }
  if (!sim.sandbox) sim.budgetLeft -= ev.opsCostYr / 365;
  sim.today = { gen, sent, duty, power: genNow, load };
  sim.day++;
  sim.mods = sim.mods.filter((md) => sim.day < md.until);
  const every = Math.max(1, Math.floor(sim.days / 60));
  if (sim.day % every === 0) sim.history.push({ day: sim.day, sci: Math.round(sim.sci), battery: Math.round(sim.battery * 100), stored: Math.round(sim.stored / ev.storage * 100) });

  if (sim.health <= 0) end(sim, 'lost', 'destroyed');
  else if (!sim.sandbox && sim.budgetLeft < 0) end(sim, 'done', 'funding');
  else if (sim.day >= Math.round(ev.life * 365) && ev.life < ev.m.years) end(sim, 'done', ev.orbit.lifeCap < ev.eq.bus.life ? 'orbit' : 'aged');
  else if (sim.day >= sim.days) end(sim, 'done', 'complete');
  return sim;
}

function end(sim, status, reason) {
  sim.status = status;
  sim.endReason = reason;
  const text = {
    complete: 'Mission complete! The spacecraft finished its planned mission.',
    funding: 'Funding ran out. Mission control had to switch the spacecraft off early.',
    orbit: 'The orbit decayed and the mission ended early.',
    aged: 'The spacecraft wore out before the mission was finished.',
    destroyed: 'Contact lost. The spacecraft was destroyed.'
  }[reason];
  sim.log.push({ day: sim.day, kind: status === 'lost' ? 'bad' : reason === 'complete' ? 'good' : 'warn', title: status === 'lost' ? 'Mission lost' : 'Mission over', text });
}

function optionCost(type, optId, ev, sim) {
  if (sim.sandbox) return 0;
  const cube = ev.m.cls === 'cube';
  if (type === 'outage' && optId === 'buy') return cube ? 0.02 : 1.5;
  if (type === 'wheel' && optId === 'patch') return cube ? 0.02 : 2;
  if (type === 'budget' && optId === 'absorb') return ev.budget * 0.08;
  return 0;
}

function buildPending(sim, type) {
  const ev = sim._ev;
  const def = EVENTS[type];
  const hasProp = ev.dvHave > 0;
  const remainingOps = ev.opsCostYr * (sim.days - sim.day) / 365;
  const options = def.options.map((o) => {
    const cost = optionCost(type, o.id, ev, sim);
    const broke = cost > 0 && sim.budgetLeft - cost < remainingOps;
    const noProp = !!(o.needsProp && !hasProp);
    return { id: o.id, label: o.label, effect: o.effect, cost, disabled: noProp || broke, why: noProp ? 'No engine on board' : broke ? `Not enough money left (needs ${fmtMoney(cost)})` : '' };
  });
  let text = def.text;
  if (type === 'opportunity') text = OPPORTUNITY_TEXT[ev.m.id] || text;
  if (type === 'mmod') sim.flags.powerLoss = Math.min(0.6, sim.flags.powerLoss + 0.2);
  if (type === 'opportunity' && ev.m.id === 'mars') sim.mods.push({ kind: 'power', value: 0.5, until: sim.day + 25 });
  return { type, title: def.title, text, owner: def.owner, lesson: def.lesson, options, votes: aiVotes(def, options) };
}

export function aiVotes(def, options) {
  const votes = {};
  for (const role of Object.keys(ROLES)) {
    let best = null, bestW = -1;
    for (const o of def.options) {
      const opt = options.find((x) => x.id === o.id);
      if (opt && opt.disabled) continue;
      const w = o.pref[role] ?? 0;
      if (w > bestW) { bestW = w; best = o.id; }
    }
    votes[role] = best;
  }
  return votes;
}

export function decide(sim, optionId) {
  if (!sim.pending) return sim;
  const ev = sim._ev;
  const rand = sim._rand;
  const p = sim.pending;
  let opt = p.options.find((o) => o.id === optionId && !o.disabled);
  if (!opt) opt = p.options.find((o) => !o.disabled);
  const cube = ev.m.cls === 'cube';
  let wise = false, outcome = '';
  switch (p.type) {
    case 'storm':
      if (opt.id === 'safe') { sim.mods.push({ kind: 'pause', value: 0, until: sim.day + 3 }); wise = true; outcome = 'The storm passed. Three quiet days, no damage.'; }
      else {
        const rad = ev.eq.cpu && ev.eq.cpu.rad;
        if (rand() < (rad ? 0.05 : 0.45)) { sim.mods.push({ kind: 'pause', value: 0, until: sim.day + 8 }); sim.health -= 15; outcome = 'The computer crashed! Rebooting and checking every system took 8 days.'; }
        else outcome = rad ? 'Your radiation-hardened computer rode it out. Science never stopped.' : 'Lucky: the computer survived this time.';
        wise = !!rad;
      }
      break;
    case 'mmod':
      if (opt.id === 'trim') { sim.flags.trim = true; outcome = 'Instruments now run at 80% to protect the battery.'; wise = true; }
      else { sim.battery = Math.max(0, sim.battery - 0.2); outcome = 'Everything stays on, but the battery lost 20% of its health.'; wise = ev.gen * (1 - sim.flags.powerLoss) >= ev.draw; }
      break;
    case 'outage': {
      const cost = opt.cost || 0;
      if (opt.id === 'buy') { sim.budgetLeft -= cost; outcome = `Backup antennas rented for ${fmtMoney(cost)}. No data lost.`; wise = ev.storage < ev.data * 5; }
      else { sim.mods.push({ kind: 'outage', value: 0, until: sim.day + 5 }); outcome = 'Data piles up onboard for five days.'; wise = ev.storage >= ev.data * 5; }
      break;
    }
    case 'wheel': {
      const cost = opt.cost || 0;
      if (opt.id === 'patch') { sim.budgetLeft -= cost; sim.mods.push({ kind: 'pointing', value: 0.5, until: sim.day + 10 }); outcome = `Engineers uploaded a fix for ${fmtMoney(cost)}. Pointing recovers in 10 days.`; wise = true; }
      else { sim.flags.limp = true; outcome = 'Sharp-image instruments are blurry for the rest of the mission.'; wise = !ev.picked.some((i) => i.fine); }
      break;
    }
    case 'debris':
      if (opt.id === 'dodge') { sim.dvLeft -= 10; outcome = 'Thrusters fired. The debris passed safely, 5 km away.'; wise = true; }
      else {
        if (rand() < 0.08) { sim.health = 0; outcome = 'Impact! The debris hit the spacecraft.'; }
        else outcome = 'Phew. It missed by 300 meters.';
        wise = ev.dvHave <= 0;
      }
      break;
    case 'opportunity': {
      const spare = ev.down >= ev.data * 1.2 * Math.max(ev.duty, 0.01);
      if (opt.id === 'extra') { sim.mods.push({ kind: 'sci', value: 1.5, until: sim.day + 20 }, { kind: 'data', value: 1.5, until: sim.day + 20 }); outcome = spare ? 'Extra observations captured, and the radio kept up!' : 'Extra observations captured, but much of the extra data never reached the ground.'; wise = spare; }
      else { outcome = 'You stuck to the plan.'; wise = !spare; }
      break;
    }
    case 'budget': {
      const cost = opt.cost || 0;
      const remainingOps = ev.opsCostYr * (sim.days - sim.day) / 365;
      if (opt.id === 'absorb') { sim.budgetLeft -= cost; outcome = `Paid ${fmtMoney(cost)} from reserves.`; wise = sim.budgetLeft >= remainingOps; }
      else { sim.flags.cutground = true; outcome = 'Fewer ground passes booked. Downlink is down 40%.'; wise = ev.down * 0.6 >= ev.data * ev.duty; }
      break;
    }
  }
  if (sim.health <= 0) end(sim, 'lost', 'destroyed');
  sim.decisions.push(opt.id);
  if (wise) sim.wise++;
  sim.log.push({ day: sim.day, kind: wise ? 'good' : 'warn', title: p.title, choice: opt.label, text: outcome, lesson: p.lesson, wise });
  sim.pending = null;
  sim.eventIdx++;
  return sim;
}

export function firstOption(sim) {
  return sim.pending ? (sim.pending.options.find((o) => !o.disabled) || sim.pending.options[0]).id : null;
}

// Run a whole mission without UI (used by the server to verify scores).
export function runMission(cfg, seed, decisions = []) {
  const sim = createSim(cfg, seed);
  let i = 0, guard = 0;
  while (sim.status === 'running' && guard++ < 100000) {
    if (sim.pending) decide(sim, decisions[i++] ?? firstOption(sim));
    else stepDay(sim);
  }
  return sim;
}

// ---------- scoring & debrief ----------
export function scoreMission(cfg, sim) {
  const ev = evaluate(cfg, 'ops');
  const ctx = { m: ev.m, eq: ev.eq, picked: ev.picked, orbit: ev.orbit, launcher: ev.launcher, mass: ev.mass, deliveredFrac: ev.deliveredFrac, totalCost: ev.totalCost, budget: ev.budget, life: ev.life, fine: ev.fine, revisitH: ev.revisitH, swathKm: ev.swathKm };
  const objectives = ev.m.reqs.map((r) => checkReq(r, ctx, 'final', sim));
  const met = objectives.filter((o) => o.status === 'met').length;
  const n = objectives.length;
  const lost = sim.status === 'lost';
  const science = Math.round(sim.sci);
  const objectivesPts = met * 600;
  const efficiency = lost || sim.sandbox ? 0 : Math.round(Math.max(0, sim.budgetLeft) / sim.budgetStart * 1500 + Math.max(0, sim.health) * 5 + sim.battery * 300);
  const decisionsPts = sim.wise * 300;
  const total = science + objectivesPts + efficiency + decisionsPts;
  const sciTarget = ev.sciTarget;
  let stars = 0;
  if (!lost) {
    stars = 1;
    if (met >= n - 1 && science >= sciTarget * 0.6) stars = 2;
    if (met === n && science >= sciTarget) stars = 3;
  }
  const result = lost ? 'MISSION LOST' : met === n ? 'MISSION SUCCESS' : met >= n - 1 ? 'PARTIAL SUCCESS' : 'MISSION COMPLETE, GOALS MISSED';
  return { total, science, objectivesPts, efficiency, decisionsPts, stars, met, n, objectives, sciTarget, result };
}

export function suggestions(cfg, sim) {
  const ev = evaluate(cfg, 'ops');
  const out = [];
  const frac = sim.generated > 0 ? sim.delivered / sim.generated : 1;
  const cat = ev.cat;
  if (frac < 0.8) {
    const better = cat.comms.find((c) => c.down > ev.eq.comms.down);
    out.push(better
      ? `Only ${Math.round(frac * 100)}% of your data reached the ground. A ${better.name} (+${fmtMass(better.mass - ev.eq.comms.mass)}, +${fmtNum((better.power || 0) - (ev.eq.comms.power || 0))} W, +${fmtMoney(better.cost - ev.eq.comms.cost)}) would send ${fmtNum(better.down / ev.eq.comms.down)}× more.`
      : `Only ${Math.round(frac * 100)}% of your data reached the ground. Carry fewer data-hungry instruments or book a better ground network.`);
  }
  if (sim.powerLimitedDays > sim.days * 0.1) out.push(`Instruments were starved of power on ${sim.powerLimitedDays} days. Bigger solar wings add margin for aging and damage.`);
  if (sim.flags.brownout) out.push('The battery wore out from being overloaded in shadow. A bigger battery would have lasted the whole mission.');
  if (sim.endReason === 'orbit') out.push('Your orbit decayed before the mission ended. A higher orbit, or an engine to boost it, would have lasted longer.');
  if (sim.endReason === 'aged') out.push('The structure wore out early. A bigger bus is built to last longer.');
  if (sim.endReason === 'funding') out.push('You ran out of money. Leave reserves for surprises and pick cheaper ground stations or parts.');
  if (sim.endReason === 'destroyed') out.push(ev.dvHave > 0 ? 'The spacecraft was lost. Safer choices during emergencies would have saved it.' : 'The spacecraft was lost. An engine lets you dodge debris instead of hoping it misses.');
  if (ev.picked.some((i) => i.fine) && !ev.fine) out.push('Sharp-image instruments blurred without reaction wheels. Precise pointing doubles their science.');
  if (ev.eq.cpu && !ev.eq.cpu.rad && sim.log.some((l) => /crashed/.test(l.text))) out.push('A solar storm crashed your commercial computer. Radiation-hardened electronics cost more but keep working.');
  if (!out.length) out.push('Strong design! Try a harder study level, or see if you can reach the same goals for less money.');
  return out;
}

export function designSummary(cfg) {
  const ev = evaluate(cfg, 'ops');
  const parts = ev.cat.slots.map((s) => ev.eq[s].name);
  return { parts, instruments: ev.picked.map((i) => i.name), orbit: ev.orbit.name, launcher: ev.launcher.name, ground: ev.ground.name };
}

export function encodeDesign(cfg) {
  const c = { m: cfg.missionId, l: cfg.level, s: cfg.design.sel, i: Object.keys(cfg.design.inst).filter((k) => cfg.design.inst[k]), o: cfg.orbitId, r: cfg.launcherId, g: cfg.groundId };
  return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeDesign(code) {
  try {
    const json = decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))));
    const c = JSON.parse(json);
    const inst = {};
    (c.i || []).forEach((k) => { inst[k] = true; });
    return normalizeConfig({ missionId: c.m, level: c.l, mode: 'solo', design: { sel: c.s || {}, inst }, orbitId: c.o, launcherId: c.r, groundId: c.g });
  } catch (e) { return null; }
}

// Versus challenges: every team with the same code, mission and level gets the same emergencies.
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
export function challengeSeed(code, missionId, level) { return hashString(`${code}:${missionId}:${level}`); }
