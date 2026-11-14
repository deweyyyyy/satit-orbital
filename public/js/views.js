// SATIT Orbital — screen templates. Each view returns an HTML string for the 1440x810 stage.
// Regions marked data-r are patched independently so animations keep running.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool.
import { ROLES, ROLE_ORDER, LEVELS, CML, MISSIONS, INSTRUMENTS, ORBITS, LAUNCHERS, GROUNDS, SLOT_INFO, SLOT_OWNER } from './data.js';
import { fmtNum, fmtMoney, fmtMass, fmtData } from './engine.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = (d, w = 1.8) => `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
export const ICON = {
  bus: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>`,
  solar: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><rect x="3" y="6" width="18" height="12" rx="1"/><path d="M9 6v12M15 6v12M3 12h18"/></svg>`,
  battery: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M7 10v4M11 10v4"/></svg>`,
  comms: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><path d="M12 12v9M8 21h8"/><circle cx="12" cy="10" r="2"/><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4"/></svg>`,
  cpu: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>`,
  adcs: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
  prop: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><path d="M8 3h8v6l3 5H5l3-5zM9 14l-1 7M15 14l1 7M12 14v6"/></svg>`,
  inst: `<svg width="22" height="22" viewBox="0 0 24 24" ${P()}><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/></svg>`,
  mass: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><path d="M6 8h12l2 12H4z"/><circle cx="12" cy="5" r="2"/></svg>`,
  power: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
  credits: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/></svg>`,
  data: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a5.5 5.5 0 0 1 8 0"/><circle cx="12" cy="19" r="1.5"/></svg>`,
  dv: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><path d="M4 18c4-1 8-5 10-12M14 6l-4 .5M14 6l1 4"/><circle cx="18" cy="18" r="2"/></svg>`,
  battlvl: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4"/></svg>`,
  storage: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></svg>`,
  health: `<svg width="16" height="16" viewBox="0 0 24 24" ${P(2)}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
  star: `<svg width="24" height="24" viewBox="0 0 24 24" ${P()}><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/></svg>`,
  wrench: `<svg width="24" height="24" viewBox="0 0 24 24" ${P()}><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.6-.6-2.6z"/></svg>`,
  flask: `<svg width="24" height="24" viewBox="0 0 24 24" ${P()}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10"/></svg>`,
  antenna: `<svg width="24" height="24" viewBox="0 0 24 24" ${P()}><path d="M12 12v9M8 21h8"/><circle cx="12" cy="10" r="2"/><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14"/></svg>`,
  back: `<svg width="20" height="20" viewBox="0 0 24 24" ${P(2.2)}><path d="M15 5l-7 7 7 7"/></svg>`,
  play: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`,
  pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3DF5FF" stroke-width="2.6" role="img" aria-label="Met"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  cross: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6B9A" stroke-width="2.6" role="img" aria-label="Not met"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A5B0D0" stroke-width="2" role="img" aria-label="Later phase"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>`,
  sound: `<svg width="20" height="20" viewBox="0 0 24 24" ${P(2)}><path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8M19.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  mute: `<svg width="20" height="20" viewBox="0 0 24 24" ${P(2)}><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>`,
  help: `<svg width="20" height="20" viewBox="0 0 24 24" ${P(2)}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.01"/></svg>`,
  trophy: `<svg width="20" height="20" viewBox="0 0 24 24" ${P(2)}><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6"/></svg>`,
  share: `<svg width="18" height="18" viewBox="0 0 24 24" ${P(2)}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>`,
  download: `<svg width="18" height="18" viewBox="0 0 24 24" ${P(2)}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`,
  refresh: `<svg width="18" height="18" viewBox="0 0 24 24" ${P(2)}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" ${P(2.2)}><path d="M6 6l12 12M18 6L6 18"/></svg>`
};
const ROLE_ICON = { cmd: ICON.star, eng: ICON.wrench, sci: ICON.flask, ops: ICON.antenna };
const TIERS = [{ n: 'BASIC', c: '#A5B0D0' }, { n: 'ADVANCED', c: '#3DF5FF' }, { n: 'ELITE', c: '#FFC23D' }];
export const PHASES = [
  { key: 'select', name: 'Objective', seg: 'User segment' },
  { key: 'hangar', name: 'Spacecraft', seg: 'Space segment' },
  { key: 'launch', name: 'Launch & orbit', seg: 'Launch segment' },
  { key: 'ops', name: 'Operate', seg: 'Ground segment' },
  { key: 'debrief', name: 'Debrief', seg: 'Results' }
];

const act = (name, arg, extra = '') => `data-act="${name}"${arg !== undefined ? ` data-arg="${esc(arg)}"` : ''} ${extra}`;

// ---------- shared pieces ----------
function pips(idx) {
  return `<div class="pips" aria-hidden="true">${PHASES.map((_, i) => `<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}"></span>`).join('')}</div>`;
}
function phaseBlock(idx) {
  return `<div class="col" style="align-items:flex-end;gap:6px;width:150px;flex:none"><span class="kicker">Phase ${idx + 1} / 5</span>${pips(idx)}</div>`;
}
function dataPair(a, b) {
  if (a >= 1 && b >= 1) return `${fmtNum(a)}/${fmtNum(b)} Gb`;
  if (a < 1 && b < 1) return `${fmtNum(a * 1000)}/${fmtNum(b * 1000)} Mb`;
  return `${fmtData(a)}/${fmtData(b)}`;
}

export function gauge(label, icon, used, limit, text, opts = {}) {
  let pct;
  if (!Number.isFinite(limit)) pct = 0;
  else if (limit <= 0) pct = used > 0 ? 999 : 0;
  else pct = used / limit * 100;
  if (opts.level) pct = 100 - used * 100; // used is a 0..1 level where high is good
  const st = opts.level ? (used > 0.6 ? 'ok' : used > 0.35 ? 'tight' : 'over') : (pct > 100 ? 'over' : pct > 85 ? 'tight' : 'ok');
  const fillPct = opts.level ? used * 100 : Math.min(100, pct);
  const filled = Math.round(Math.max(0, Math.min(100, fillPct)) / 100 * 12);
  const segs = Array.from({ length: 12 }, (_, i) => `<i class="${i < filled ? st : ''}"></i>`).join('');
  return `<div class="gauge"><div class="top"><span>${icon}${esc(label)}</span><span class="val ${st} ${st === 'over' ? 'blink' : ''}">${esc(text)}</span></div><div class="segs">${segs}</div></div>`;
}

export function designGauges(ev) {
  const g = [
    gauge('MASS', ICON.mass, ev.mass, ev.massLimit, Number.isFinite(ev.massLimit) ? (ev.massLimit > 0 ? `${fmtNum(ev.mass)}/${fmtNum(ev.massLimit)} kg` : 'NO ROCKET') : `${fmtNum(ev.mass)} kg`),
    gauge('POWER', ICON.power, ev.draw, ev.gen, `${fmtNum(ev.draw)}/${fmtNum(ev.gen)} W`),
    gauge('CREDITS', ICON.credits, ev.totalCost, ev.budget, Number.isFinite(ev.budget) ? `${fmtMoney(ev.totalCost)}/${fmtMoney(ev.budget)}` : fmtMoney(ev.totalCost)),
    gauge('DATA', ICON.data, ev.data, ev.down, dataPair(ev.data, ev.down))
  ];
  if (ev.m.cls === 'std') g.push(gauge('ΔV', ICON.dv, ev.dvNeed, ev.dvHave, `${ev.dvNeed}/${ev.dvHave} m/s`));
  return `<div class="gauges">${g.join('')}</div>`;
}

export function starsHTML(n, size = 26, label = true) {
  const star = (on) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="${on ? '#FFC23D' : '#141B3A'}" stroke="${on ? '#FFE08A' : '#3A4670'}" stroke-width="1.2"/></svg>`;
  return `<div class="row" style="gap:6px;justify-content:center" ${label ? `role="img" aria-label="${n} of 3 stars"` : ''}>${[0, 1, 2].map((i) => star(i < n)).join('')}</div>`;
}

export function objectivesHTML(objs, compact = false) {
  return objs.map((o) => `<div class="obj ${compact ? 'compact' : ''}">${o.status === 'met' ? ICON.check : o.status === 'fail' ? ICON.cross : ICON.clock}<div><b>${esc(o.text)}</b>${compact ? '' : `<span>${esc(o.sub)}</span>`}</div></div>`).join('');
}

export function crewHTML(S, talking) {
  return `<div class="crew">${ROLE_ORDER.map((r) => {
    const role = ROLES[r];
    const seat = S.seatLabel(r);
    return `<div class="crewm"><span class="avatar ${talking === r ? 'talk' : ''} ${seat.empty ? 'empty' : ''}" style="color:${role.color}">${ROLE_ICON[r]}${seat.tag ? `<span class="tag">${esc(seat.tag)}</span>` : ''}</span>${esc(seat.name)}<small>${esc(role.name)}</small></div>`;
  }).join('')}</div>`;
}

export function dialogHTML(msg, idx, total, canNext) {
  const role = ROLES[msg.who];
  const tone = msg.k === 'bad' ? 'bad' : msg.k === 'warn' ? 'warn' : '';
  const label = msg.k === 'bad' ? 'PROBLEM' : msg.k === 'warn' ? 'HEADS-UP' : 'STATUS';
  return `<div class="dialog ${tone}" role="status"><span class="who" style="color:${role.color}">${esc(role.npc === 'You' ? 'YOU' : role.npc.toUpperCase())} · ${esc(role.name.toUpperCase())}</span><p>${esc(msg.t)}</p>
    <div class="row between"><span class="kicker">${label} ${idx + 1} / ${total}</span>${canNext && total > 1 ? `<button class="btn" ${act('nextMsg')}>NEXT</button>` : ''}</div></div>`;
}

// ---------- spacecraft & planets ----------
export function craftHTML(ev, scale = 1) {
  const s = (n) => Math.round(n * scale);
  const cube = ev.m.cls === 'cube';
  const busId = ev.eq.bus.id;
  let bw, bh, u = '';
  if (cube) {
    const dims = { u1: [44, 44, 100], u3: [44, 120, 33.33], u6: [80, 120, 33.33] }[busId];
    bw = s(dims[0]); bh = s(dims[1]); u = `--u:${dims[2]}%;`;
  } else { bw = bh = s({ s: 92, m: 120, l: 150 }[busId]); }
  const sol = ev.eq.solar.id;
  const wing = { body: null, cbody: null, wing: [140, 62], cdep: [70, 40], big: [190, 84], cbig: [110, 48], giant: [230, 110] }[sol];
  const com = ev.eq.comms.id;
  const dish = { uhf: [10, 10, true, 50], cuhf: [8, 8, true, 40], s: [36, 18, false, 22], cs: [22, 11, false, 14], x: [58, 29, false, 16], ka: [84, 42, false, 14] }[com];
  const wingDiv = wing ? `<div class="wing" style="width:${s(wing[0])}px;height:${s(wing[1])}px"></div><div class="boom" style="width:${s(26)}px"></div>` : '';
  const wingDivR = wing ? `<div class="boom" style="width:${s(26)}px"></div><div class="wing" style="width:${s(wing[0])}px;height:${s(wing[1])}px"></div>` : '';
  const dishDiv = `<div class="ant"><div class="dish" style="width:${s(dish[0])}px;height:${s(dish[1])}px;${dish[2] ? 'border-radius:999px;background:#5DF2B0;border:none' : ''}"></div><div class="mast" style="height:${s(dish[3])}px"></div></div>`;
  const prop = ev.eq.prop ? ev.eq.prop.id : 'none';
  const mods = ev.picked.map((i) => `<span class="mod" style="color:${i.color}"><i style="width:${s(34)}px;height:${s(30)}px"><b style="width:${s(14)}px;height:${s(14)}px;background:radial-gradient(circle at 35% 35%, #fff, ${i.color} 45%, #000 95%)"></b></i>${esc(i.code)}</span>`).join('');
  return `<div class="craft" role="img" aria-label="${esc(`Your spacecraft: ${ev.eq.bus.name}, ${ev.eq.solar.name}, ${ev.eq.comms.name}${ev.picked.length ? ', carrying ' + ev.picked.map((i) => i.name).join(', ') : ', no instruments'}`)}">
    ${wingDiv}<div class="bus ${cube ? 'cube' : ''}" style="width:${bw}px;height:${bh}px;${u}">${!wing ? '<div class="bodycells"></div>' : ''}${dishDiv}
      ${ev.eq.adcs.fine ? '<div class="wheels"><i></i><i></i><i></i></div>' : ''}${ev.eq.cpu.rad ? '<span class="chip-rad"></span>' : ''}
      ${prop !== 'none' && !cube ? `<span class="nozzle"></span>${prop === 'ion' ? '<span class="ionglow"></span>' : ''}` : ''}
      <div class="mods">${mods}</div></div>${wingDivR}</div>`;
}

const PLANETS = {
  earth: { bg: 'radial-gradient(circle at 35% 30%, #7CC3FF 0%, #2B6FD1 30%, #123E86 62%, #071C44 88%)', r: '999px' },
  moon: { bg: 'radial-gradient(circle at 35% 30%, #F1F1F4 0%, #B4B5BE 40%, #6A6C77 75%, #33343C 95%)', r: '999px', spots: [[30, 30, 22, 'rgba(70,72,82,.55)'], [60, 48, 30, 'rgba(70,72,82,.5)'], [38, 66, 16, 'rgba(70,72,82,.55)'], [70, 24, 12, 'rgba(70,72,82,.5)']] },
  mars: { bg: 'radial-gradient(circle at 35% 30%, #FFB48C 0%, #D8602F 38%, #8E2B14 72%, #3E1208 95%)', r: '999px', spots: [[26, 40, 40, 'rgba(240,200,150,.35)'], [60, 30, 30, 'rgba(240,200,150,.3)'], [48, 66, 22, 'rgba(90,30,15,.5)']] },
  asteroid: { bg: 'radial-gradient(circle at 35% 30%, #C9B9A2 0%, #8A7864 45%, #4A3D31 85%)', r: '46% 54% 42% 58% / 55% 40% 60% 45%', spots: [[30, 36, 18, 'rgba(50,40,30,.5)'], [62, 58, 24, 'rgba(50,40,30,.45)'], [50, 24, 10, 'rgba(50,40,30,.5)']] }
};
export function planetHTML(m, size, ringSize, label = true) {
  const p = PLANETS[m.target];
  let spots = p.spots || [];
  let glow = false;
  if (m.id === 'fire') { spots = [[30, 34, 12, '#FF8A3D'], [58, 26, 9, '#FFC23D'], [44, 60, 14, '#FF6B3D'], [68, 54, 8, '#FF8A3D'], [24, 62, 7, '#FFC23D']]; glow = true; }
  if (m.id === 'cube') spots = [[40, 40, 30, 'rgba(93,242,176,.35)'], [60, 62, 22, 'rgba(93,242,176,.3)']];
  const sp = spots.map((s) => `<span class="spot ${glow ? 'flicker' : ''}" style="left:${s[0]}%;top:${s[1]}%;width:${s[2] * size / 300}px;height:${s[2] * size / 300}px;background:${s[3]};${glow ? `box-shadow:0 0 14px 4px ${s[3]};` : ''}"></span>`).join('');
  const sz = m.target === 'asteroid' ? size * 0.7 : size;
  const ring = ringSize ? `<div class="ring orbitspin" aria-hidden="true" style="width:${ringSize}px;height:${ringSize}px;margin:-${ringSize / 2}px 0 0 -${ringSize / 2}px"><span class="minisat"><i class="w"></i><i class="b"></i><i class="w"></i></span></div>` : '';
  return `<div style="position:relative;display:flex;align-items:center;justify-content:center"><div class="planet" ${label ? `role="img" aria-label="${esc(m.name)} target"` : 'aria-hidden="true"'} style="width:${sz}px;height:${sz}px;border-radius:${p.r};background:${p.bg}"><div class="spinslow" style="position:absolute;inset:0">${sp}</div></div>${ring}</div>`;
}

// ---------- TITLE ----------
export function titleView(S) {
  const rank = CML[Math.max(0, Math.min(3, S.rank - 1))];
  return `<div class="stars2"></div>
  ${S.has3d ? `<div data-r="hero3d" data-static="1" data-key="hero3d" class="abs" style="inset:0"><div class="view3d" data-3d="hero"></div></div>` : `<div aria-hidden="true" style="position:absolute;left:-380px;top:560px;width:1500px;height:1500px;border-radius:999px;background:radial-gradient(circle at 60% 6%, #3E8CE0 0%, #1A4E93 18%, #0B2654 38%, #061433 60%);box-shadow:0 0 90px 10px rgba(70,160,255,.35), inset 0 18px 40px rgba(160,220,255,.35)"></div>
  <div class="float" aria-hidden="true" style="position:absolute;left:600px;top:96px;transform:rotate(-6deg)">${craftHTML(S.demoEv, 0.75)}</div>`}
  <div data-r="title-main" class="abs col slide-l" style="left:80px;top:92px;width:520px;gap:26px">
    <div class="col" style="gap:10px">
      <span class="kicker" style="color:var(--am);letter-spacing:.28em">NASA SPACE APPS CHALLENGE 2026</span>
      <h1 class="glow disp" style="margin:0;font-size:84px;font-weight:900;line-height:.95;letter-spacing:.02em">SATIT<br><span style="color:var(--cy)">ORBITAL</span></h1>
      <p style="margin:0;font-size:20px;line-height:1.4;color:var(--mut2)">Design a real space mission. Launch it. Live with every trade-off.</p>
    </div>
    <nav aria-label="Main menu" class="col" style="width:400px">
      <button class="btn primary ready" ${act('go', 'select')} style="justify-content:space-between">START MISSION ${ICON.play}</button>
      <button class="btn" ${act('openBoard')} style="justify-content:space-between;min-height:52px">LEADERBOARD ${ICON.trophy}</button>
      <button class="btn" ${act('openHelp')} style="justify-content:space-between;min-height:52px">HOW TO PLAY ${ICON.help}</button>
    </nav>
    <div class="row small mut">Callsign <b class="disp" style="color:var(--ink);letter-spacing:.06em">${esc(S.callsign)}</b><button class="btn link" ${act('reroll')}>NEW CALLSIGN</button></div>
  </div>
  <section class="panel abs slide-r" style="right:56px;top:92px;width:520px;padding:22px" aria-labelledby="seg-h">
    <div class="col" style="gap:4px"><h2 id="seg-h" class="label">Build all four mission segments</h2><p class="small mut" style="margin:0">The four segments NASA uses to design science missions, one game phase each.</p></div>
    ${[['User segment', 'Scientists who need the data. Sets the goal.', 'PHASE 1', '#B69CFF'], ['Space segment', 'The spacecraft and its instruments.', 'PHASE 2', '#FFC23D'], ['Launch segment', 'The rocket that puts it in the right orbit.', 'PHASE 3', '#FF8A3D'], ['Ground segment', 'Ground stations and mission control.', 'PHASE 4', '#5DF2B0']].map((x) => `<div class="row" style="gap:14px;padding:12px;border-radius:12px;background:var(--card)"><span style="flex:none;width:12px;height:44px;border-radius:4px;background:${x[3]}"></span><span class="grow col" style="gap:2px"><b style="font-size:16px">${x[0]}</b><span class="small mut">${x[1]}</span></span><span class="disp tiny" style="font-weight:800;letter-spacing:.12em;color:${x[3]}">${x[2]}</span></div>`).join('')}
  </section>
  <section class="panel abs slide-u" style="right:56px;bottom:40px;width:760px;padding:18px 22px" aria-labelledby="rank-h">
    <div class="row between"><h2 id="rank-h" class="label">Your rank · Concept Maturity Level</h2><span class="small mut">Earn 2+ stars to mature your concept</span></div>
    <ol style="margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
      ${CML.map((c) => { const on = c.lvl <= S.rank; const cur = c.lvl === S.rank; return `<li class="col" style="gap:6px;padding:12px;border-radius:12px;background:${cur ? 'rgba(61,245,255,.1)' : 'var(--card)'};border:2px solid ${cur ? 'var(--cy)' : on ? '#2E4A86' : 'var(--line)'};${cur ? 'box-shadow:0 0 18px rgba(61,245,255,.25)' : ''}"><span class="disp tiny" style="font-weight:800;letter-spacing:.14em;color:${on ? 'var(--cy)' : 'var(--mut)'}">CML ${c.lvl}${cur ? ' · YOU' : ''}</span><b style="font-size:15px">${c.name}</b><span class="tiny mut">${c.note}</span></li>`; }).join('')}
    </ol>
  </section>
  <span class="abs tiny mut" style="left:80px;bottom:40px;max-width:460px;line-height:1.5">By Team SATIT Orbital for the 2026 NASA Space Apps Challenge. Current rank: CML ${S.rank} · ${esc(rank.name)}. NASA does not endorse this game.</span>
  <div data-r="corner" class="abs row" style="right:24px;top:24px"><button class="iconbtn" ${act('toggleMute')} aria-label="${S.muted ? 'Turn sound on' : 'Turn sound off'}">${S.muted ? ICON.mute : ICON.sound}</button></div>`;
}

// ---------- SELECT ----------
export function selectView(S) {
  const m = MISSIONS.find((x) => x.id === S.cfg.missionId);
  const ev = S.ev;
  const guest = S.isGuest();
  const modes = [['solo', 'SOLO'], ['local', 'CO-OP'], ['online', 'ONLINE'], ['versus', 'VERSUS'], ['sandbox', 'SANDBOX']];
  const mode = S.cfg.mode;
  const missionList = MISSIONS.map((x) => {
    const on = x.id === m.id;
    const pipsH = [0, 1, 2, 3].map((i) => `<i style="display:block;width:8px;height:12px;border-radius:2px;transform:skewX(-14deg);background:${i < x.pips ? '#FFC23D' : '#1A2346'}"></i>`).join('');
    return `<button class="card amber ${on ? 'on' : ''}" ${act('pickMission', x.id)} aria-pressed="${on}" ${guest ? 'disabled' : ''} style="align-items:center;padding:10px 12px">
      <span class="ico" style="width:44px;height:44px;border-radius:999px;font-size:13px;color:${x.color}">${x.code}</span>
      <span class="grow col" style="gap:3px"><span class="name">${x.name}</span><span class="tiny mut">${x.where}</span></span>
      <span class="col" style="align-items:flex-end;gap:5px"><span class="row" style="gap:3px" aria-hidden="true">${pipsH}</span><span class="disp" style="font-size:9px;font-weight:800;letter-spacing:.14em;color:var(--mut)">${x.level}</span></span></button>`;
  }).join('');
  const ringMap = { cube: 330, fire: 430, relay: 380, rock: 330, mars: 410 };
  const budgetTxt = S.cfg.mode === 'sandbox' ? 'Unlimited' : fmtMoney(m.budget * LEVELS[S.cfg.level].budgetMult);
  return `<div class="stars2"></div>
  <header class="hud"><div class="row" style="gap:16px"><button class="iconbtn" ${act('go', 'title')} aria-label="Back to title screen" ${guest ? 'disabled' : ''}>${ICON.back}</button>
    <div class="col" style="gap:4px"><span class="kicker" style="color:var(--vi)">User segment · what do scientists need?</span><h1>MISSION SELECT</h1></div></div>${phaseBlock(0)}</header>
  ${S.has3d ? `<div data-r="sel3d" data-static="1" data-key="sel3d" class="abs" style="top:180px;left:384px;right:424px;bottom:150px"><div class="view3d" data-3d="planet"></div></div>` : ''}
  <section data-r="sel-left" class="panel abs slide-l" style="top:100px;left:24px;bottom:24px;width:360px;gap:9px" aria-label="Missions and settings">
    <h2 class="label">Missions</h2>${missionList}
    <h2 class="label" style="margin-top:4px">Mode</h2>
    <div class="seg-btns" role="group" aria-label="Game mode" style="grid-template-columns:repeat(5,minmax(0,1fr))">${modes.map(([id, n]) => `<button class="btn ${mode === id ? 'on' : ''}" ${act('pickMode', id)} aria-pressed="${mode === id}" ${guest || (id === 'online' && !S.netOk) ? 'disabled' : ''}>${n}</button>`).join('')}</div>
    <h2 class="label" style="margin-top:4px">Study level</h2>
    <div class="seg-btns amber" role="group" aria-label="Difficulty" style="grid-template-columns:repeat(3,minmax(0,1fr))">${Object.values(LEVELS).map((l) => `<button class="btn ${S.cfg.level === l.id ? 'on' : ''}" ${act('pickLevel', l.id)} aria-pressed="${S.cfg.level === l.id}" ${guest ? 'disabled' : ''}>${l.name.toUpperCase()}</button>`).join('')}</div>
    <p class="small" style="margin:0;line-height:1.4;color:var(--mut2)">${esc(LEVELS[S.cfg.level].note)}</p>
  </section>
  <div data-r="sel-center" class="abs col" style="top:84px;left:384px;right:424px;bottom:0;align-items:center;gap:0;pointer-events:none">
    <div class="col" style="margin-top:24px;align-items:center;gap:6px;text-align:center"><span class="disp" style="font-size:12px;font-weight:800;letter-spacing:.24em;color:${m.color}">${m.kind}</span><h2 class="disp" style="margin:0;font-size:40px;font-weight:900">${m.name}</h2><span style="font-size:15px;color:var(--mut2)">Destination: ${m.where}</span></div>
    <div class="grow" style="width:100%;display:flex;align-items:center;justify-content:center">${S.has3d ? '' : planetHTML(m, m.target === 'asteroid' ? 280 : 270, ringMap[m.id])}</div>
    <div class="col" style="margin-bottom:34px;align-items:center;gap:14px">
      <div class="row" style="flex-wrap:wrap;justify-content:center;gap:8px"><span class="chip" style="font-size:13px;padding:5px 12px">Budget <b class="disp" style="color:var(--am)">${budgetTxt}</b></span><span class="chip" style="font-size:13px;padding:5px 12px">Mission length <b>${m.years < 1 ? Math.round(m.years * 12) + ' months' : m.years + ' years'}</b></span></div>
      ${guest ? `<div class="btn" style="min-width:320px" aria-disabled="true">COMMANDER CHOOSES THE MISSION</div>` : `<button class="btn primary ready" ${act('acceptMission')} ${mode === 'online' && !S.online.code ? 'disabled' : ''} style="min-width:320px">ACCEPT MISSION ${ICON.play}</button>`}
    </div>
  </div>
  <aside data-r="sel-right" class="abs col slide-r" style="top:100px;right:24px;bottom:24px;width:400px;gap:14px">
    <section class="panel grow" aria-labelledby="brief-h" style="gap:10px">
      <h2 id="brief-h" class="label">Briefing</h2>
      <p style="margin:0;font-size:15px;line-height:1.45">${esc(m.goal)}</p>
      <ol class="col scroll" style="margin:0;padding:0;list-style:none;gap:6px">${m.reqs.map((r, i) => `<li class="row" style="align-items:baseline;padding:7px 10px;border-radius:8px;background:var(--card)"><span class="disp tiny" style="font-weight:800;color:var(--am)">R${i + 1}</span><span class="small" style="line-height:1.35">${esc(r.text)}</span></li>`).join('')}</ol>
      <div class="lesson" style="margin-top:auto"><span class="kicker">Real NASA missions like this</span><p>${esc(m.twin)}</p></div>
    </section>
    ${modePanel(S)}
  </aside>
  <div data-r="corner" class="abs row" style="right:24px;top:20px;display:none"></div>`;
}

function modePanel(S) {
  const mode = S.cfg.mode;
  let body = '';
  if (mode === 'solo') body = `<p class="small mut" style="margin:0">You are the Commander. AI crew members give advice and vote, but you make the final call.</p>`;
  if (mode === 'local') body = `<div class="row between"><span class="small">Players on this device</span><div class="seg-btns" style="grid-template-columns:repeat(3,48px)">${[2, 3, 4].map((n) => `<button class="btn ${S.players === n ? 'on' : ''}" ${act('pickPlayers', n)} aria-pressed="${S.players === n}">${n}</button>`).join('')}</div></div><p class="tiny mut" style="margin:0">Pass the device around. Each player owns different parts and votes on every emergency.</p>`;
  if (mode === 'versus') body = `<div class="row"><input class="input" id="challengeInput" maxlength="5" value="${esc(S.challenge)}" aria-label="Challenge code" ${act('typeChallenge', undefined, 'data-input="1"')}><button class="btn" ${act('newChallenge')}>NEW CODE</button></div><p class="tiny mut" style="margin:0">Two teams enter the same code to get the same mission and emergencies. Compare scores on the challenge leaderboard.</p>`;
  if (mode === 'sandbox') body = `<p class="small mut" style="margin:0">No budget, no mass limit, fewer emergencies. Try anything and see what breaks. Sandbox scores are not ranked.</p>`;
  if (mode === 'online') {
    const o = S.online;
    if (o.status === 'in') body = `<div class="row between"><span class="small">Room code</span><b class="disp" style="font-size:22px;letter-spacing:.3em;color:var(--am)">${esc(o.code)}</b></div><p class="tiny mut" style="margin:0">Share the code with up to 3 friends. You are the <b style="color:${ROLES[o.role].color}">${esc(ROLES[o.role].name)}</b>. ${o.role === 'cmd' ? 'You control the countdown.' : 'The Commander controls the countdown.'}</p><button class="btn ghost" ${act('leaveRoom')}>LEAVE ROOM</button>`;
    else body = `<div class="row"><button class="btn cyan" ${act('createRoom')}>CREATE ROOM</button><input class="input" id="roomInput" maxlength="5" placeholder="CODE" aria-label="Room code" value="${esc(S.roomInput)}" ${act('typeRoom', undefined, 'data-input="1"')}><button class="btn" ${act('joinRoom')}>JOIN</button></div><p class="tiny ${o.error ? '' : 'mut'}" style="margin:0;${o.error ? 'color:var(--pk)' : ''}">${esc(o.error || (o.status === 'connecting' ? 'Connecting…' : 'Play together from different devices. Up to 4 crew per room.'))}</p>`;
  }
  return `<section class="panel" aria-labelledby="crew-h" style="gap:10px"><h2 id="crew-h" class="label">Crew</h2>${crewHTML(S, null)}${body}</section>`;
}

// ---------- HANGAR ----------
export function hangarView(S) {
  const ev = S.ev;
  const m = ev.m;
  const tabs = [...ev.cat.slots, 'inst'];
  const tab = tabs.includes(S.tab) ? S.tab : tabs[0];
  const alerts = {};
  ev.issues.forEach((i) => { if (i.slot) alerts[i.slot] = alerts[i.slot] || i.k; });
  const owner = ROLES[SLOT_OWNER[tab]];
  const info = SLOT_INFO[tab];
  const msgs = S.messages(ev);
  const idx = S.msg % msgs.length;
  const msg = msgs[idx];
  const guest = S.isGuest();
  return `${S.has3d ? '' : '<div class="earthcurve"></div>'}<div class="stars2"></div>
  <header class="hud" data-r="hud"><div class="col" style="gap:4px;width:200px;flex:none"><span class="kicker" style="color:var(--am)">${esc(m.name)}</span><h1>HANGAR</h1></div>${designGauges(ev)}${phaseBlock(1)}</header>
  <section class="panel abs slide-l" data-r="bay" style="top:100px;left:24px;bottom:24px;width:380px;gap:12px" aria-labelledby="bay-h">
    <div class="row between"><h2 id="bay-h" class="label">Parts bay</h2><span class="tiny mut">Red dot = needs attention</span></div>
    <div class="row" role="group" aria-label="Part categories" style="gap:6px">${tabs.map((t) => `<button class="iconbtn ${t === tab ? 'on' : ''}" ${act('tab', t)} aria-pressed="${t === tab}" aria-label="${esc(SLOT_INFO[t].name)}">${ICON[SLOT_INFO[t].icon]}${alerts[t] === 'bad' ? '<span class="dot"></span>' : alerts[t] === 'warn' ? '<span class="dot" style="background:var(--am)"></span>' : ''}</button>`).join('')}</div>
    <div class="col" style="gap:4px"><div class="row between"><h3 class="disp" style="margin:0;font-size:20px;font-weight:800">${esc(info.name)}</h3><span class="tiny" style="color:${owner.color};font-weight:700">OWNER: ${esc(owner.name.toUpperCase())}</span></div><p class="small mut" style="margin:0;line-height:1.4">${esc(info.hint)}</p></div>
    <div class="grow scroll col" data-scroll="cards" style="gap:10px;padding-right:2px">${partCards(S, ev, tab)}</div>
  </section>
  <div class="abs col" style="top:84px;left:404px;right:364px;bottom:0;align-items:center">
    <div data-r="score" class="col" style="margin-top:22px;align-items:center;gap:6px">
      <span class="kicker" style="letter-spacing:.26em">Predicted science</span>
      <div class="row" style="align-items:baseline;gap:8px"><span class="disp" style="font-size:52px;font-weight:900;line-height:1;color:var(--cy);text-shadow:0 0 22px rgba(61,245,255,.55)">${fmtNum(ev.sciPredicted)}</span><span class="disp mut" style="font-size:18px;font-weight:600">target ${fmtNum(ev.sciTarget)}</span></div>
      ${starsHTML(ev.stars)}
      <span class="sr">${esc(`Your spacecraft: ${ev.eq.bus.name}, ${ev.eq.solar.name}, ${ev.eq.comms.name}${ev.picked.length ? ', carrying ' + ev.picked.map((i) => i.name).join(', ') : ', no instruments'}`)}</span><span class="small mut">${ev.ready ? (ev.stars === 3 ? 'Perfect design: every goal met with strong science' : ev.stars === 2 ? 'Almost there. Check the objectives for 3 stars' : 'Flight-ready, but goals are missed') : 'Not flight-ready yet'}</span>
    </div>
    ${S.has3d ? `<div data-r="craft" data-static="1" data-key="craft" class="grow" style="width:100%;position:relative"><div class="view3d" data-3d="craft"></div><span class="abs tiny mut" style="bottom:4px;left:0;right:0;text-align:center;pointer-events:none">Drag to spin \u00b7 scroll to zoom</span></div>` : `<div data-r="craft" class="grow" style="width:100%;position:relative;display:flex;align-items:center;justify-content:center">
      <div aria-hidden="true" style="position:absolute;left:50%;top:50%;width:600px;height:190px;margin:-95px 0 0 -300px;border:1px dashed rgba(61,245,255,.28);border-radius:50%;transform:rotate(-8deg)"></div>
      <div class="float" style="margin-top:-10px">${craftHTML(ev, ev.m.cls === 'cube' ? 1.3 : 1)}</div>
    </div>`}
    <div data-r="nav" class="row" style="margin-bottom:36px;gap:12px">
      ${guest ? `<span class="btn" aria-disabled="true">COMMANDER CONTROLS THE COUNTDOWN</span>` : `<button class="btn ghost" ${act('go', 'select')}>${ICON.back} BACK</button>
      <button class="btn primary ${ev.ready ? 'ready' : ''}" ${act('go', 'launch')} ${ev.ready ? '' : 'disabled'}>${ev.ready ? 'NEXT: LAUNCH & ORBIT' : `FIX ${ev.bad.length} PROBLEM${ev.bad.length > 1 ? 'S' : ''}`}</button>`}
    </div>
  </div>
  <aside class="abs col slide-r" style="top:100px;right:24px;bottom:24px;width:340px;gap:14px">
    <section data-r="crew" class="panel" aria-labelledby="crew-h"><h2 id="crew-h" class="label">Crew</h2>${crewHTML(S, msg.who)}${dialogHTML(msg, idx, msgs.length, true)}</section>
    <section data-r="obj" class="panel grow scroll" aria-labelledby="obj-h" style="gap:8px"><h2 id="obj-h" class="label">Objectives</h2>${objectivesHTML(ev.objectives)}</section>
  </aside>
  ${commonRegions(S)}`;
}

function chipsFor(on, o, cur) {
  const c = (t, k = '') => `<span class="chip ${k}">${esc(t)}</span>`;
  const out = [];
  if (on || !cur) {
    out.push(c(fmtMass(o.mass)));
    if (o.power) out.push(c(`${fmtNum(o.power)} W`));
    if (o.gen) out.push(c(`${fmtNum(o.gen)} W made`));
    if (o.cap) out.push(c(`${fmtNum(o.cap)} W backup`));
    if (o.down) out.push(c(`${fmtData(o.down)}/day link`));
    if (o.life) out.push(c(`${o.life} yr life`));
    if (o.dv !== undefined) out.push(c(`${o.dv} m/s Δv`));
    if (o.maxMass) out.push(c(`max ${fmtMass(o.maxMass)}`));
    out.push(c(fmtMoney(o.cost)));
    return out.join('');
  }
  const d = (k) => (o[k] || 0) - (cur[k] || 0);
  const sg = (n) => (n > 0 ? '+' : '−') + fmtNum(Math.abs(n));
  if (d('mass')) out.push(c(`${sg(d('mass'))} kg`, d('mass') > 0 ? 'bad' : 'good'));
  if (d('power')) out.push(c(`${sg(d('power'))} W`, d('power') > 0 ? 'bad' : 'good'));
  if (d('gen')) out.push(c(`${sg(d('gen'))} W made`, d('gen') > 0 ? 'good' : 'bad'));
  if (d('cap')) out.push(c(`${sg(d('cap'))} W backup`, d('cap') > 0 ? 'good' : 'bad'));
  if (d('down')) out.push(c(`${d('down') > 0 ? '+' : '−'}${fmtData(Math.abs(d('down')))}/day`, d('down') > 0 ? 'good' : 'bad'));
  if (d('life')) out.push(c(`${sg(d('life'))} yr life`, d('life') > 0 ? 'good' : 'bad'));
  if (d('dv')) out.push(c(`${sg(d('dv'))} m/s Δv`, d('dv') > 0 ? 'good' : 'bad'));
  if (d('maxMass')) out.push(c(`max ${fmtMass(o.maxMass)}`, d('maxMass') > 0 ? 'good' : 'bad'));
  if (d('cost')) out.push(c(`${d('cost') > 0 ? '+' : '−'}${fmtMoney(Math.abs(d('cost')))}`, d('cost') > 0 ? 'bad' : 'good'));
  if (o.rad !== cur.rad && o.rad !== undefined) out.push(c(o.rad ? 'storm-proof' : 'storm risk', o.rad ? 'good' : 'bad'));
  if (o.fine !== cur.fine && o.fine !== undefined) out.push(c(o.fine ? 'precise aim' : 'wobbly aim', o.fine ? 'good' : 'bad'));
  return out.join('');
}

function partCards(S, ev, tab) {
  const editable = S.canEdit(tab);
  if (tab === 'inst') {
    return ev.m.instruments.map((id) => {
      const i = INSTRUMENTS[id];
      const on = !!S.cfg.design.inst[id];
      const t = TIERS[i.tier];
      const chips = [`<span class="chip ${on ? '' : 'bad'}">${on ? '' : '+'}${fmtMass(i.mass)}</span>`, `<span class="chip ${on ? '' : 'bad'}">${on ? '' : '+'}${fmtNum(i.power)} W</span>`, `<span class="chip ${on ? '' : 'bad'}">${on ? '' : '+'}${fmtMoney(i.cost)}</span>`, `<span class="chip ${on ? '' : 'amber'}">${on ? '' : '+'}${fmtData(i.data)}/day</span>`, `<span class="chip good">+${i.sci} science</span>`];
      if (i.fine) chips.push('<span class="chip amber">needs precise aim</span>');
      if (i.rate) chips.push(`<span class="chip">${i.rate} Mb/s relay</span>`);
      return `<button class="card ${on ? 'on' : ''}" ${act('toggleInst', id)} aria-pressed="${on}">
        <span class="ico" style="color:${t.c}">${i.code}</span><span class="grow col" style="gap:4px"><span class="row between"><span class="tier" style="color:${t.c}">${t.n}</span>${on ? '<span class="badge">ON BOARD</span>' : editable ? '' : '<span class="badge amber">SUGGEST</span>'}</span>
        <span class="name">${esc(i.name)}</span><span class="note">${esc(i.note)}</span><span class="chips">${chips.join('')}</span></span></button>`;
    }).join('');
  }
  const cur = ev.eq[tab];
  return ev.cat[tab].map((o) => {
    const on = o.id === cur.id;
    const t = TIERS[o.tier];
    return `<button class="card ${on ? 'on' : ''}" ${act('pickPart', `${tab}:${o.id}`)} aria-pressed="${on}">
      <span class="ico" style="color:${t.c}">${esc(o.code)}</span><span class="grow col" style="gap:4px"><span class="row between"><span class="tier" style="color:${t.c}">${t.n}</span>${on ? '<span class="badge">EQUIPPED</span>' : editable ? '' : '<span class="badge amber">SUGGEST</span>'}</span>
      <span class="name">${esc(o.name)}</span><span class="note">${esc(o.note)}</span><span class="chips">${chipsFor(on, o, cur)}</span></span></button>`;
  }).join('');
}

// ---------- LAUNCH ----------
const ORBIT_RING = { sso: [330, 1], iss: [310, 1], geo: [480, 1], nrho: [300, 0.45], llo: [270, 1], l2: [420, 0.5], flyby: [0, 0], rdv: [250, 0.8], mlow: [320, 1], mell: [460, 0.5], issd: [310, 1], cubesso: [340, 1] };
export function launchView(S) {
  const ev = S.ev;
  const m = ev.m;
  const guest = S.isGuest();
  const msgs = S.messages(ev);
  const idx = S.msg % msgs.length;
  const msg = msgs[idx];
  const orbitCards = m.orbits.map((id) => {
    const o = ORBITS[id];
    const on = id === S.cfg.orbitId;
    const chips = [];
    if (o.revisitH !== undefined) chips.push(`<span class="chip">revisit ${fmtNum(o.revisitH)} h</span>`);
    if (o.coverage !== undefined) chips.push(`<span class="chip ${o.coverage >= 0.9 ? 'good' : 'bad'}">coverage ${Math.round(o.coverage * 100)}%</span>`);
    if (o.closestKm !== undefined) chips.push(`<span class="chip">closest ${fmtNum(o.closestKm)} km</span>`);
    if (o.resM !== undefined) chips.push(`<span class="chip">${fmtNum(o.resM)} m/pixel</span>`);
    if (m.cls === 'std') chips.push(`<span class="chip ${ev.dvHave >= o.dv ? 'good' : 'bad'}">needs ${o.dv} m/s Δv</span>`);
    chips.push(`<span class="chip ${o.lifeCap >= m.years ? '' : 'bad'}">lasts ~${fmtNum(o.lifeCap)} yr</span>`);
    if (o.link < 1) chips.push(`<span class="chip amber">signal ×${o.link}</span>`);
    if (o.sciMult !== 1) chips.push(`<span class="chip ${o.sciMult > 1 ? 'good' : 'bad'}">science ×${o.sciMult}</span>`);
    return `<button class="card ${on ? 'on' : ''}" ${act('pickOrbit', id)} aria-pressed="${on}" ${S.canEdit('orbit') ? '' : 'disabled'}>
      <span class="grow col" style="gap:4px"><span class="row between"><span class="tier" style="color:var(--mut)">${esc(o.family.toUpperCase())}</span>${on ? '<span class="badge">SELECTED</span>' : ''}</span>
      <span class="name">${esc(o.name)}</span><span class="tiny" style="color:var(--mut2)">${esc(o.alt)}</span><span class="note">${esc(o.explain)}</span><span class="chips">${chips.join('')}</span></span></button>`;
  }).join('');
  const rocketCards = m.launchers.map((id) => {
    const l = LAUNCHERS[id];
    const on = id === S.cfg.launcherId;
    const cost = m.cls === 'cube' ? (l.cubeRide ? ev.eq.bus.rideCost : l.cost) : l.cost;
    let fit;
    if (m.cls === 'cube') fit = `<span class="chip">launch in ~${l.delayMonths} months</span>`;
    else {
      const cap = l.cap[ev.dest] ?? 0;
      fit = cap === 0 ? `<span class="chip bad">can’t reach this orbit</span>` : ev.mass <= cap ? `<span class="chip good">fits · ${Math.round(ev.mass / cap * 100)}% of ${fmtMass(cap)}</span>` : `<span class="chip bad">too heavy · max ${fmtMass(cap)}</span>`;
    }
    const restrict = l.orbits ? `<span class="chip amber">only ${l.orbits.map((o) => ORBITS[o].name.toLowerCase()).join(', ')}</span>` : '';
    return `<button class="card amber ${on ? 'on' : ''}" ${act('pickLauncher', id)} aria-pressed="${on}" ${S.canEdit('launcher') ? '' : 'disabled'}>
      <span class="ico" style="color:var(--am)">${esc(l.code)}</span><span class="grow col" style="gap:4px"><span class="row between"><span class="name">${esc(l.name)}</span><b class="disp" style="color:var(--am);font-size:14px">${cost === 0 ? 'FREE' : fmtMoney(cost)}</b></span>
      <span class="note">${esc(l.note)}</span><span class="chips">${fit}${restrict}</span></span></button>`;
  }).join('');
  const ring = ORBIT_RING[S.cfg.orbitId] || [320, 1];
  const ringH = Math.round(ring[0] * ring[1]);
  const orbitVis = ring[0] ? `<div aria-hidden="true" style="position:absolute;left:50%;top:50%;width:${ring[0]}px;height:${ringH}px;margin:-${ringH / 2}px 0 0 -${ring[0] / 2}px;border:2px dashed rgba(255,194,61,.6);border-radius:50%;transform:rotate(-14deg)"></div>`
    : `<div aria-hidden="true" style="position:absolute;left:8%;right:8%;top:38%;height:2px;background:repeating-linear-gradient(90deg, rgba(255,194,61,.8) 0 10px, transparent 10px 18px);transform:rotate(-12deg)"></div>`;
  return `<div class="stars2"></div>
  <header class="hud" data-r="hud"><div class="col" style="gap:4px;width:200px;flex:none"><span class="kicker" style="color:var(--or)">Launch segment</span><h1>LAUNCH</h1></div>${designGauges(ev)}${phaseBlock(2)}</header>
  <section data-r="orbits" class="panel abs slide-l" style="top:100px;left:24px;bottom:24px;width:370px" aria-labelledby="orb-h">
    <div class="row between"><h2 id="orb-h" class="label">Choose your orbit</h2><span class="tiny" style="color:${ROLES.ops.color};font-weight:700">OWNER: OPS</span></div>
    <div class="grow scroll col" data-scroll="orbits" style="gap:10px">${orbitCards}</div>
  </section>
  <div class="abs col" style="top:84px;left:394px;right:394px;bottom:0;align-items:center">
    ${S.has3d ? `<div data-r="lv-vis" data-static="1" data-key="lv" class="grow" style="width:100%;position:relative;margin-top:10px"><div class="view3d" data-3d="orbit"></div></div>` : `<div data-r="lv-vis" class="grow" style="width:100%;position:relative;display:flex;align-items:center;justify-content:center;margin-top:10px">
      ${planetHTML(m, m.target === 'asteroid' ? 230 : 200, 0)}${orbitVis}
      
    </div>`}
    <div data-r="lv-label" class="abs col" style="top:22px;left:0;right:0;align-items:center;gap:2px;text-align:center;pointer-events:none"><span class="disp" style="font-size:22px;font-weight:900">${esc(ev.orbit.name)}</span><span class="small mut">${esc(ev.orbit.family)} · ${esc(ev.orbit.alt)}</span><span class="tiny mut">${S.has3d ? 'Drag to look around \u00b7 scroll to zoom' : ''}</span></div>
    <div data-r="lv-obj" class="col" style="width:100%;gap:5px">${objectivesHTML(ev.objectives, true)}</div>
    <div data-r="nav" class="row" style="margin:14px 0 26px;gap:12px">
      ${guest ? `<span class="btn" aria-disabled="true">COMMANDER CONTROLS THE COUNTDOWN</span>` : `<button class="btn ghost" ${act('go', 'hangar')}>${ICON.back} HANGAR</button>
      <button class="btn primary ${ev.ready ? 'ready' : ''}" ${act('launch')} ${ev.ready ? '' : 'disabled'}>${ev.ready ? 'LAUNCH' : `FIX ${ev.bad.length} PROBLEM${ev.bad.length > 1 ? 'S' : ''}`}</button>`}
    </div>
  </div>
  <aside class="abs col slide-r" style="top:100px;right:24px;bottom:24px;width:370px;gap:14px">
    <section data-r="rockets" class="panel grow" aria-labelledby="rk-h"><h2 id="rk-h" class="label">Choose your rocket</h2><div class="grow scroll col" data-scroll="rockets" style="gap:10px">${rocketCards}</div></section>
    <section data-r="crew" class="panel" aria-label="Crew advice">${dialogHTML(msg, idx, msgs.length, true)}</section>
  </aside>
  ${commonRegions(S)}`;
}

export function launchOverlay(S) {
  if (!S.launchSeq) return '';
  const m = S.ev.m;
  return `<div class="launchpad" role="dialog" aria-label="Launch sequence"><div class="smoke"></div><div class="pad"></div>
    <div class="rocket go"><div class="shake"><div class="nose"></div><div class="body"></div><div class="fins"><i></i><i></i></div><div class="fire"></div></div></div>
    <button class="btn ghost" ${act('skipLaunch')} style="position:absolute;right:24px;bottom:24px;z-index:2">SKIP ${ICON.play}</button>
    <span class="sr">Launching ${esc(m.name)}</span></div>`;
}
export function launchText(S) {
  if (!S.launchSeq) return '';
  const steps = S.launchSeq.steps;
  const i = Math.min(S.launchSeq.i, steps.length - 1);
  const big = steps[i];
  return `<div class="countdown" aria-live="assertive">${esc(big)}</div><div class="launchlog">${steps.slice(Math.max(0, i - 2), i).map(esc).join(' · ')}</div>`;
}

// ---------- OPS ----------
export function opsView(S, d) {
  const ev = S.ev;
  const m = ev.m;
  const guest = S.isGuest();
  if (!d) {
    return `<div class="stars2"></div><header class="hud"><div class="col" style="gap:4px"><span class="kicker" style="color:var(--gr)">Ground segment · mission control</span><h1>${esc(m.name.toUpperCase())}</h1></div>${phaseBlock(3)}</header>
      ${S.has3d ? `<div data-r="ops-vis" data-static="1" data-key="ops" class="abs" style="inset:84px 0 0 0"><div class="view3d" data-3d="ops"></div></div>` : `<div data-r="ops-vis" class="abs" style="inset:84px 0 0 0;display:flex;align-items:center;justify-content:center">${planetHTML(m, 260, 380, false)}</div>`}
      <div data-r="ops-left"></div><div data-r="ops-top"></div><div data-r="ops-right"></div>${commonRegions(S)}`;
  }
  const pct = Math.min(100, d.day / d.days * 100);
  const evMarks = d.events.map((e, i) => `<span class="ev ${i < d.eventIdx ? 'done' : ''}" style="left:${e.day / d.days * 100}%" title="Event"></span>`).join('');
  const speeds = [[0, ICON.pause, 'Pause'], [1, '1×', 'Normal speed'], [3, '3×', 'Fast'], [8, '8×', 'Very fast']];
  const frac = d.generated > 0 ? d.delivered / d.generated : 0;
  const hist = d.history;
  let chart = '<p class="tiny mut" style="margin:0">Science over time appears here.</p>';
  if (hist.length > 1) {
    const max = Math.max(1, ...hist.map((h) => h.sci));
    const pts = hist.map((h) => `${(h.day / d.days * 300).toFixed(1)},${(80 - h.sci / max * 76).toFixed(1)}`).join(' ');
    chart = `<svg width="100%" height="84" viewBox="0 0 300 84" preserveAspectRatio="none" role="img" aria-label="Science collected over time"><polyline points="${pts}" fill="none" stroke="#3DF5FF" stroke-width="2"/></svg>`;
  }
  const hudG = [
    gauge('POWER', ICON.power, d.today.load, d.today.power, `${fmtNum(d.today.load)}/${fmtNum(d.today.power)} W`),
    gauge('BATTERY', ICON.battlvl, d.battery, 1, `${Math.round(d.battery * 100)}%`, { level: true }),
    gauge('STORAGE', ICON.storage, d.stored, d.storage, `${Math.round(d.stored / d.storage * 100)}%`),
    gauge('BUDGET', ICON.credits, d.sandbox ? 1 : Math.max(0, Math.min(1, d.budgetLeft / d.opsStart)), 1, d.sandbox ? '∞' : fmtMoney(d.budgetLeft), { level: true }),
    gauge('HEALTH', ICON.health, Math.max(0, d.health) / 100, 1, `${Math.max(0, Math.round(d.health))}%`, { level: true })
  ].join('');
  const running = d.status === 'running';
  return `<div class="stars2"></div>
  <header class="hud" data-r="hud"><div class="col" style="gap:4px;width:230px"><span class="kicker" style="color:var(--gr)">Ground segment · ${esc(ev.ground.name)}</span><h1>${esc(m.name.toUpperCase())}</h1></div><div class="gauges">${hudG}</div>${phaseBlock(3)}</header>
  <section data-r="ops-left" class="panel abs slide-l" style="top:100px;left:24px;bottom:24px;width:340px" aria-labelledby="st-h">
    <h2 id="st-h" class="label">Mission stats</h2>
    <div class="stat"><span>Data collected</span><b>${fmtData(d.generated)}</b></div>
    <div class="stat"><span>Sent to the ground</span><b class="${frac >= 0.8 ? 'ok' : 'over'}">${fmtData(d.delivered)} · ${Math.round(frac * 100)}%</b></div>
    <div class="stat"><span>Lost (storage full)</span><b class="${d.lost > 0 ? 'over' : ''}">${fmtData(d.lost)}</b></div>
    <div class="stat"><span>Instruments running</span><b class="${d.today.duty >= 0.99 ? 'ok' : 'tight'}">${Math.round(d.today.duty * 100)}%</b></div>
    <div class="stat"><span>Days short of power</span><b class="${d.powerLimitedDays ? 'tight' : ''}">${d.powerLimitedDays}</b></div>
    <div class="stat"><span>Wise decisions</span><b>${d.wise} / ${d.eventIdx}</b></div>
    <h2 class="label" style="margin-top:6px">Science over time</h2>${chart}
  </section>
  <div data-r="ops-top" class="abs col" style="top:100px;left:388px;right:388px;align-items:center;gap:10px;z-index:1">
    <div class="row between" style="width:100%"><span class="disp" style="font-size:18px;font-weight:800">DAY ${d.day} <span class="mut" style="font-size:14px">/ ${d.days}</span></span>
      <div class="row" role="group" aria-label="Simulation speed" style="gap:6px">${speeds.map(([v, lbl, aria]) => `<button class="iconbtn ${S.speed === v ? 'on' : ''}" ${act('speed', v)} aria-label="${aria}" aria-pressed="${S.speed === v}" ${guest || !running ? 'disabled' : ''} style="font-family:var(--disp);font-weight:800;font-size:12px">${lbl}</button>`).join('')}</div></div>
    <div class="timeline" style="width:100%" role="progressbar" aria-label="Mission timeline" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><div class="fill" style="width:${pct}%"></div>${evMarks}</div>
    <div class="col" style="align-items:center;gap:0;margin-top:6px"><span class="kicker" style="letter-spacing:.26em">Science delivered</span><span class="disp" style="font-size:54px;font-weight:900;line-height:1.05;color:var(--cy);text-shadow:0 0 22px rgba(61,245,255,.55)">${fmtNum(Math.round(d.sci))}</span><span class="small mut">target ${fmtNum(ev.sciTarget)}</span></div>
  </div>
  ${S.has3d ? `<div data-r="ops-vis" data-static="1" data-key="ops" class="abs" style="top:290px;left:388px;right:388px;bottom:24px"><div class="view3d" data-3d="ops"></div></div>` : `<div data-r="ops-vis" class="abs" style="top:330px;left:388px;right:388px;bottom:24px;display:flex;align-items:center;justify-content:center">
    ${planetHTML(m, 230, 360, false)}
    ${d.today.sent > 0 && running ? `<span class="beam" style="left:50%;top:-10px;height:130px;transform:rotate(25deg)"></span>` : ''}
  </div>`}
  <aside data-r="ops-right" class="abs col slide-r" style="top:100px;right:24px;bottom:24px;width:340px;gap:14px">
    <section class="panel" aria-label="Crew">${crewHTML(S, d.pending ? d.pending.owner : null)}</section>
    <section class="panel grow scroll" aria-labelledby="log-h" style="gap:8px"><h2 id="log-h" class="label">Mission log</h2>
      ${d.log.length ? d.log.slice().reverse().slice(0, 8).map((l) => `<div class="logline"><b style="color:${l.kind === 'bad' ? 'var(--pk)' : l.kind === 'good' ? 'var(--cy)' : 'var(--am)'}">Day ${l.day} · ${esc(l.title)}</b>${l.choice ? `<span class="mut">Chose: ${esc(l.choice)}. </span>` : ''}${esc(l.text)}</div>`).join('') : '<p class="small mut" style="margin:0">Quiet so far. Emergencies will appear here.</p>'}
    </section>
  </aside>
  ${commonRegions(S)}`;
}

export function groundOverlay(S) {
  const ev = S.ev;
  const m = ev.m;
  const guest = S.isGuest();
  const cards = m.grounds.map((id) => {
    const g = GROUNDS[id];
    const on = id === S.cfg.groundId;
    const mult = g.mult[ev.dest];
    const down = ev.eq.comms.down * ev.orbit.link * (mult || 0);
    return `<button class="card ${on ? 'on' : ''}" ${act('pickGround', id)} aria-pressed="${on}" ${S.canEdit('ground') ? '' : 'disabled'} style="width:300px">
      <span class="grow col" style="gap:4px"><span class="row between"><span class="name">${esc(g.name)}</span>${on ? '<span class="badge">SELECTED</span>' : ''}</span><span class="note">${esc(g.note)}</span>
      <span class="chips">${mult ? `<span class="chip ${down >= ev.data ? 'good' : 'bad'}">${fmtData(down)}/day downlink</span>` : '<span class="chip bad">can’t hear you</span>'}<span class="chip">${g.costYr ? fmtMoney(g.costYr) + '/year' : 'free'}</span></span></span></button>`;
  }).join('');
  return `<div class="overlay"><div class="modal" role="dialog" aria-labelledby="gr-h" style="width:1020px">
    <span class="kicker" style="color:var(--gr)">Ground segment</span><h2 id="gr-h">Who will listen to your spacecraft?</h2>
    <p class="mut" style="margin:0;font-size:15px;line-height:1.45">Ground stations receive your data and send commands. More antennas mean more data delivered, but they cost money every year.</p>
    <div class="row" style="gap:12px;align-items:stretch">${cards}</div>
    <div class="row between"><span class="small">${ev.ready ? `Instruments make ${fmtData(ev.data)}/day · you can send ${fmtData(ev.down)}/day` : `<span style="color:var(--pk)">${esc(ev.bad[0] ? ev.bad[0].t : '')}</span>`}</span>
      ${guest ? '<span class="btn" aria-disabled="true">WAITING FOR COMMANDER</span>' : `<button class="btn primary ${ev.ready ? 'ready' : ''}" ${act('startMission')} ${ev.ready ? '' : 'disabled'}>START MISSION</button>`}</div>
  </div></div>`;
}

export function eventOverlay(S, d) {
  const p = d.pending;
  const owner = ROLES[p.owner];
  const humans = S.humanRoles();
  const votes = S.currentVotes(p);
  const mode = S.cfg.mode;
  const solo = mode === 'solo' || mode === 'versus' || mode === 'sandbox';
  const guest = S.isGuest();
  const myRole = S.myRole();
  const optHTML = p.options.map((o) => {
    const voters = ROLE_ORDER.filter((r) => votes[r] === o.id);
    const voteChips = voters.map((r) => `<span class="avatar" style="width:30px;height:30px;border-width:2px;color:${ROLES[r].color}" title="${esc(ROLES[r].name)}">${ROLE_ICON[r].replace(/width="24" height="24"/, 'width="14" height="14"')}</span>`).join('');
    let control = '';
    if (solo) control = `<button class="btn ${o.disabled ? '' : 'cyan'}" ${act('choose', o.id)} ${o.disabled ? 'disabled' : ''}>CHOOSE</button>`;
    else if (mode === 'local') control = `<div class="row" style="gap:6px;flex-wrap:wrap">${humans.map((r) => `<button class="btn ${votes[r] === o.id ? 'cyan' : ''}" ${act('vote', `${r}:${o.id}`)} ${o.disabled ? 'disabled' : ''} style="min-height:40px;padding:0 10px;font-size:11px;color:${ROLES[r].color}">${esc(ROLES[r].name.toUpperCase())}</button>`).join('')}</div>`;
    else if (mode === 'online') control = `<button class="btn ${votes[myRole] === o.id ? 'cyan' : ''}" ${act('vote', `${myRole}:${o.id}`)} ${o.disabled ? 'disabled' : ''}>VOTE</button>`;
    return `<div class="card" style="cursor:default;flex-direction:column;gap:8px;${o.disabled ? 'opacity:.6' : ''}"><div class="row between" style="width:100%"><span class="name">${esc(o.label)}</span><span class="row" style="gap:4px">${voteChips}</span></div><span class="note">${esc(o.effect)}${o.why ? ` <b style="color:var(--pk)">${esc(o.why)}</b>` : ''}</span>${control}</div>`;
  }).join('');
  const advice = ROLE_ORDER.filter((r) => !humans.includes(r) && votes[r]).map((r) => `${ROLES[r].npc} (${ROLES[r].name}) votes “${esc(p.options.find((o) => o.id === votes[r]).label)}”`).join(' · ');
  const allVoted = humans.every((r) => votes[r]);
  const resolve = !solo && !guest ? `<button class="btn primary ${allVoted ? 'ready' : ''}" ${act('resolve')} ${allVoted || mode === 'online' ? '' : 'disabled'} style="font-size:16px;min-height:52px">${allVoted ? 'CONFIRM CREW DECISION' : mode === 'online' ? 'DECIDE NOW (COMMANDER)' : 'WAITING FOR VOTES'}</button>` : '';
  return `<div class="overlay"><div class="modal pink" role="dialog" aria-labelledby="evt-h" style="width:880px">
    <div class="row between"><span class="kicker" style="color:var(--pk)">Day ${d.day} · emergency · ${esc(owner.name)} leads</span><span class="kicker">${d.eventIdx + 1} / ${d.events.length}</span></div>
    <h2 id="evt-h">${esc(p.title)}</h2><p style="margin:0;font-size:17px;line-height:1.45">${esc(p.text)}</p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">${optHTML}</div>
    ${advice ? `<p class="small mut" style="margin:0">${advice}</p>` : ''}
    ${mode === 'local' ? '<p class="tiny mut" style="margin:0">Every human player votes. Majority wins; the Commander breaks ties.</p>' : ''}
    ${guest ? '<p class="small" style="margin:0;color:var(--am)">Cast your vote. The Commander confirms the crew decision.</p>' : ''}
    ${resolve ? `<div class="row" style="justify-content:flex-end">${resolve}</div>` : ''}
  </div></div>`;
}

export function outcomeOverlay(S, entry) {
  const guest = S.isGuest();
  return `<div class="overlay"><div class="modal ${entry.wise ? '' : 'amber'}" role="dialog" aria-labelledby="out-h" style="width:720px">
    <span class="kicker" style="color:${entry.wise ? 'var(--cy)' : 'var(--am)'}">${entry.wise ? 'WISE CALL · +300' : 'RISKY CALL'}</span>
    <h2 id="out-h">${esc(entry.title)}</h2><p style="margin:0;font-size:16px"><span class="mut">You chose:</span> ${esc(entry.choice)}</p>
    <p style="margin:0;font-size:17px;line-height:1.45">${esc(entry.text)}</p>
    <div class="lesson"><span class="kicker">Why it matters</span><p>${esc(entry.lesson)}</p></div>
    <div class="row" style="justify-content:flex-end">${guest ? '<span class="btn" aria-disabled="true">WAITING FOR COMMANDER</span>' : `<button class="btn primary ready" ${act('continueOps')} style="font-size:16px;min-height:52px">CONTINUE MISSION</button>`}</div>
  </div></div>`;
}

export function endOverlay(S, d) {
  const last = d.log[d.log.length - 1] || { title: 'Mission over', text: '' };
  const guest = S.isGuest();
  return `<div class="overlay"><div class="modal ${d.status === 'lost' ? 'pink' : 'amber'}" role="dialog" aria-labelledby="end-h" style="width:620px;align-items:center;text-align:center">
    <span class="kicker">Day ${d.day}</span><h2 id="end-h">${esc(last.title.toUpperCase())}</h2><p style="margin:0;font-size:17px;line-height:1.45">${esc(last.text)}</p>
    ${guest ? '<span class="btn" aria-disabled="true">WAITING FOR COMMANDER</span>' : `<button class="btn primary ready" ${act('go', 'debrief')}>SEE DEBRIEF</button>`}
  </div></div>`;
}

// ---------- DEBRIEF ----------
export function debriefView(S) {
  const ev = S.ev;
  const r = S.result;
  const m = ev.m;
  const guest = S.isGuest();
  const bars = [['Science', r.science, 'var(--cy)'], ['Objectives', r.objectivesPts, 'var(--am)'], ['Efficiency', r.efficiency, 'var(--gr)'], ['Decisions', r.decisionsPts, 'var(--vi)']];
  const maxBar = Math.max(1, ...bars.map((b) => b[1]));
  const tone = r.stars === 0 ? 'var(--pk)' : r.stars === 3 ? 'var(--cy)' : 'var(--am)';
  const decisions = S.finalSim.log.filter((l) => l.choice);
  const canSubmit = S.netOk && S.cfg.mode !== 'sandbox' && !S.submitted && !guest;
  return `<div class="stars2"></div>
  <header class="hud"><div class="col" style="gap:4px;width:260px"><span class="kicker" style="color:var(--am)">${esc(m.name)} · ${esc(LEVELS[S.cfg.level].name)}</span><h1>DEBRIEF</h1></div><span class="small mut">Seed ${S.seed}${S.challenge ? ` · challenge ${esc(S.challenge)}` : ''}</span>${phaseBlock(4)}</header>
  <section class="panel abs slide-l" style="top:100px;left:24px;bottom:24px;width:400px" aria-labelledby="res-h">
    <span class="kicker" style="color:${tone}">${S.finalSim.day} days in space</span>
    <h2 id="res-h" class="disp" style="margin:0;font-size:30px;font-weight:900;color:${tone}">${esc(r.result)}</h2>
    <div class="starpop">${starsHTML(r.stars, 44)}</div>
    <div class="col" style="align-items:center;gap:0"><span class="kicker">Total score</span><span class="disp" style="font-size:48px;font-weight:900;line-height:1.1" data-count="${r.total}">${fmtNum(r.total)}</span></div>
    <div class="col" style="gap:8px">${bars.map((b) => `<div class="scorebar"><span>${b[0]}</span><div class="bar"><i style="width:${Math.max(2, b[1] / maxBar * 100)}%;background:${b[2]}"></i></div><b>${fmtNum(b[1])}</b></div>`).join('')}</div>
    ${S.rankUp ? `<div class="lesson" style="border-color:var(--cy)"><span class="kicker" style="color:var(--cy)">Concept matured!</span><p>You reached CML ${S.rank}: ${esc(CML[S.rank - 1].name)}.</p></div>` : ''}
    <div data-r="submit" class="col" style="margin-top:auto;gap:8px">
      ${S.submitted ? `<div class="lesson"><span class="kicker">Leaderboard</span><p>${esc(S.submitted.error ? S.submitted.error : `Ranked #${S.submitted.rank} as ${S.callsign} with ${fmtNum(S.submitted.score)} points.`)}</p></div>` : ''}
      ${canSubmit ? `<button class="btn cyan" ${act('submitScore')}>${ICON.trophy} SUBMIT AS ${esc(S.callsign)}</button>` : ''}
      ${!S.netOk ? '<p class="tiny mut" style="margin:0">Leaderboard available on the hosted version.</p>' : ''}
    </div>
  </section>
  <section class="panel abs slide-u" style="top:100px;left:440px;right:440px;bottom:24px" aria-labelledby="req-h">
    <h2 id="req-h" class="label">Requirements · ${r.met} of ${r.n} met</h2>
    <div class="col scroll" style="gap:6px;max-height:330px">${objectivesHTML(r.objectives)}</div>
    ${S.has3d ? `<div data-r="db3d" data-static="1" data-key="db" class="grow" style="position:relative;min-height:120px"><div class="view3d" data-3d="craft"></div></div>` : `<div class="grow" style="display:flex;align-items:center;justify-content:center;min-height:110px">${craftHTML(ev, ev.m.cls === 'cube' ? 0.8 : 0.55)}</div>`}
    <div class="row" style="flex-wrap:wrap;justify-content:center;gap:10px">
      ${guest ? '<span class="btn" aria-disabled="true">COMMANDER PICKS WHAT’S NEXT</span>' : `<button class="btn primary ready" ${act('redesign')} style="font-size:16px;min-height:52px">${ICON.refresh} REDESIGN &amp; FLY AGAIN</button><button class="btn" ${act('go', 'select')}>NEW MISSION</button>`}
    </div>
    <div class="row" style="flex-wrap:wrap;justify-content:center;gap:8px">
      <button class="btn ghost" ${act('share')}>${ICON.share} SHARE DESIGN</button><button class="btn ghost" ${act('report')}>${ICON.download} MISSION REPORT</button><button class="btn ghost" ${act('openBoard')}>${ICON.trophy} LEADERBOARD</button>
    </div>
  </section>
  <aside class="abs col slide-r" style="top:100px;right:24px;bottom:24px;width:400px;gap:14px">
    <section class="panel" aria-labelledby="sg-h"><h2 id="sg-h" class="label">What would change the outcome</h2>${S.sugg.map((s) => `<p class="small" style="margin:0;line-height:1.45;padding:8px 10px;border-radius:8px;background:var(--card)">${esc(s)}</p>`).join('')}</section>
    <section class="panel grow scroll" aria-labelledby="dc-h" style="gap:8px"><h2 id="dc-h" class="label">Your decisions</h2>${decisions.length ? decisions.map((l) => `<div class="logline"><b style="color:${l.wise ? 'var(--cy)' : 'var(--am)'}">${l.wise ? '✓' : '!'} ${esc(l.title)}</b>${esc(l.choice)}: ${esc(l.text)}</div>`).join('') : '<p class="small mut" style="margin:0">No emergencies this time.</p>'}
      <div class="lesson" style="margin-top:auto"><span class="kicker">Real NASA missions like yours</span><p>${esc(m.twin)}</p></div></section>
  </aside>
  ${commonRegions(S)}`;
}

// ---------- overlays shared by all screens ----------
export function boardOverlay(S) {
  const b = S.board;
  const rows = b && b.scores ? b.scores.map((s, i) => `<tr class="${s.callsign === S.callsign ? 'me' : ''}"><td>${i + 1}</td><td class="disp" style="letter-spacing:.04em">${esc(s.callsign)}</td><td>${'★'.repeat(Math.max(0, Math.min(3, Number(s.stars) || 0)))}</td><td style="text-align:right" class="disp">${fmtNum(Number(s.score) || 0)}</td></tr>`).join('') : '';
  return `<div class="overlay"><div class="modal" role="dialog" aria-labelledby="lb-h" style="width:820px;height:700px">
    <div class="row between"><h2 id="lb-h">LEADERBOARD</h2><button class="iconbtn" ${act('closeOverlay')} aria-label="Close">${ICON.close}</button></div>
    <div class="seg-btns" style="grid-template-columns:repeat(5,minmax(0,1fr))">${MISSIONS.map((x) => `<button class="btn ${S.boardQ.mission === x.id ? 'on' : ''}" ${act('boardMission', x.id)}>${esc(x.name.toUpperCase())}</button>`).join('')}</div>
    <div class="row between"><div class="seg-btns amber" style="grid-template-columns:repeat(3,140px)">${Object.values(LEVELS).map((l) => `<button class="btn ${S.boardQ.level === l.id ? 'on' : ''}" ${act('boardLevel', l.id)}>${l.name.toUpperCase()}</button>`).join('')}</div>${S.challenge ? `<button class="btn ${S.boardQ.challenge ? 'cyan' : ''}" ${act('boardChallenge')}>CHALLENGE ${esc(S.challenge)}</button>` : ''}</div>
    <div class="grow scroll">${!S.netOk ? '<p class="mut">The leaderboard needs the hosted version of the game.</p>' : !b ? '<p class="mut">Loading…</p>' : b.error ? `<p style="color:var(--pk)">${esc(b.error)}</p>` : rows ? `<table class="board"><thead><tr><th>#</th><th>Callsign</th><th>Stars</th><th style="text-align:right">Score</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="mut">No scores yet. Be the first!</p>'}</div>
    <p class="tiny mut" style="margin:0">Scores are verified: the server replays every mission from its design, seed and decisions. Only generated callsigns are stored.</p>
  </div></div>`;
}

export function helpOverlay() {
  const sec = (t, body) => `<div class="col" style="gap:6px"><h3 class="label" style="font-size:12px">${t}</h3>${body}</div>`;
  const li = (items) => `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:14px;line-height:1.45">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  return `<div class="overlay"><div class="modal" role="dialog" aria-labelledby="hp-h" style="width:1040px;height:720px">
    <div class="row between"><h2 id="hp-h">HOW TO PLAY</h2><button class="iconbtn" ${act('closeOverlay')} aria-label="Close">${ICON.close}</button></div>
    <div class="grow scroll" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-content:start">
      ${sec('The five phases', li(['<b>Objective</b> (user segment): pick a mission and read its requirements.', '<b>Hangar</b> (space segment): choose one part per system and your instruments.', '<b>Launch &amp; orbit</b> (launch segment): match the orbit to the goal and the rocket to your mass.', '<b>Operate</b> (ground segment): pick ground stations, then fly the mission and handle emergencies.', '<b>Debrief</b>: see which requirements you met, why, and what would change the result.']))}
      ${sec('The resources', li(['<b>Mass</b>: everything the rocket must lift.', '<b>Power</b>: solar panels must cover what you use. Panels make less far from the Sun.', '<b>Budget</b>: spacecraft + rocket + years of ground stations.', '<b>Data</b>: what instruments collect each day.', '<b>Comms</b>: how much data you can send home. Distance weakens the signal.', '<b>Time</b>: how long parts and orbits last, and how long you wait for launch.', '<b>Δv</b>: how much your engine can change your speed to reach your orbit.']))}
      ${sec('Teams', li(['<b>Solo</b>: you are the Commander, with an AI crew giving advice.', '<b>Co-op</b>: 2–4 players share a device and vote on emergencies.', '<b>Online</b>: up to 4 players on their own devices. Each owns different parts; others can suggest changes.', '<b>Versus</b>: teams share a challenge code and get identical emergencies.', '<b>Sandbox</b>: no budget or mass limits.']))}
      ${sec('Scoring', li(['<b>Science</b> counts only data that reaches the ground.', '<b>Objectives</b>: 600 points per requirement met.', '<b>Efficiency</b>: leftover budget, health and battery.', '<b>Decisions</b>: 300 points per wise emergency call.', 'Earn 2+ stars to raise your Concept Maturity Level (JPL’s CML scale).']))}
      ${sec('Controls', li(['Click or tap everything. <kbd>Tab</kbd> moves between buttons, <kbd>Enter</kbd> presses.', 'During operations: <kbd>Space</kbd> pauses and resumes.', '<kbd>Esc</kbd> closes windows.']))}
      ${sec('Credits', `<p class="small" style="margin:0;line-height:1.5">By Team SATIT Orbital.<br><span class="mut">Built for the 2026 NASA Space Apps Challenge with NASA mission-design resources. 3D graphics by Three.js (MIT). Fonts: Orbitron and Chakra Petch (SIL OFL). Code written with assistance from Claude, a Super Intelligence (SI) tool. NASA does not endorse this game.</span></p>`)}
      ${sec('About the numbers', `<p class="small mut" style="margin:0;line-height:1.5">Part masses, costs and rates are simplified for play. The trade-offs are real: more instruments mean more mass, power, cost and data; a weak radio wastes science; far from Earth you need bigger dishes and the Deep Space Network.</p>`)}
    </div></div></div>`;
}

export function commonRegions(S) {
  return `<div data-r="overlay">${S.overlayHTML()}</div><div data-r="launchtext">${launchText(S)}</div><div data-r="toast">${S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : ''}</div>`;
}
