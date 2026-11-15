// SATIT Orbital — classroom helpers: class codes, the remembered class, cleaning server data, the print report.
// No free text and no personal data anywhere: a class is a 5-character code and students are generated callsigns.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { CODE_RE, isMission } from './engine.js';
import { MISSION_BY_ID } from './data.js';

const KEY = 'satit.class';
export const KEY_RE = /^[A-Z0-9]{16}$/;

/** Upper-case and strip to the characters codes may use, up to `max` long. */
export function cleanInput(v, max = 5) {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
}
export const isClassCode = (v) => CODE_RE.test(String(v ?? ''));

// The class this device has joined (a plain code in localStorage; storage may be blocked, so every access is guarded).
export function getStoredClass() {
  try { const v = localStorage.getItem(KEY); return v && isClassCode(v) ? v : ''; } catch { return ''; }
}
export function setStoredClass(code) {
  try { if (code && isClassCode(code)) localStorage.setItem(KEY, code); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Rebuild a GET /api/class/:code response from plain values only (it is rendered and printed). */
export function cleanClass(raw) {
  if (!raw || typeof raw !== 'object' || !isClassCode(raw.code)) return null;
  const students = (Array.isArray(raw.students) ? raw.students : []).slice(0, 200).map((s) => {
    if (!s || typeof s !== 'object') return null;
    const callsign = String(s.callsign ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
    if (!callsign) return null;
    const missions = [...new Set((Array.isArray(s.missions) ? s.missions : []).map(String).filter((id) => isMission(id)))];
    return { callsign, runs: Math.max(0, Math.round(num(s.runs))), best: Math.max(0, Math.round(num(s.best))), bestStars: Math.max(0, Math.min(3, Math.round(num(s.bestStars)))), missions };
  }).filter(Boolean);
  return { code: raw.code, createdAt: String(raw.createdAt ?? '').slice(0, 32), students, total: Math.max(students.length, Math.round(num(raw.total))) };
}

export const missionNames = (ids) => ids.map((id) => MISSION_BY_ID[id].name).join(', ');

/** Plain rows for the on-screen table and the printed report. */
export function reportRows(data) {
  return data.students.map((s) => ({ callsign: s.callsign, best: s.best, stars: s.bestStars, runs: s.runs, missions: missionNames(s.missions) }));
}

/** The print-only region: black on white. Built with DOM calls (textContent), never HTML strings. */
export function buildReport(data, when = new Date()) {
  const root = document.createElement('div');
  root.id = 'print-report';
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  root.append(el('h1', 'SATIT Orbital: class report'));
  root.append(el('p', `Class ${data.code} · ${data.total} student${data.total === 1 ? '' : 's'} · printed ${when.toISOString().slice(0, 10)}`));
  const table = el('table');
  const head = el('tr');
  for (const h of ['#', 'Callsign', 'Best score', 'Stars', 'Runs', 'Missions flown']) head.append(el('th', h));
  table.append(el('thead')); table.firstChild.append(head);
  const body = el('tbody');
  reportRows(data).forEach((r, i) => {
    const tr = el('tr');
    for (const v of [String(i + 1), r.callsign, String(r.best), '★'.repeat(r.stars) || '-', String(r.runs), r.missions || '-']) tr.append(el('td', v));
    body.append(tr);
  });
  if (!data.students.length) { const tr = el('tr'); const td = el('td', 'No runs yet.'); td.colSpan = 6; tr.append(td); body.append(tr); }
  table.append(body);
  root.append(table);
  root.append(el('p', 'Students are listed by generated callsign only. No names or emails are collected. Game: SATIT Orbital, open source.', 'note'));
  return root;
}

/** Print the report: add the region, print, remove it again. */
export function printReport(data) {
  const old = document.getElementById('print-report');
  if (old) old.remove();
  const node = buildReport(data);
  document.body.append(node);
  const done = () => { node.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch { done(); }
}
