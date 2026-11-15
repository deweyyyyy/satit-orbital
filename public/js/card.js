// SATIT Orbital — result card: a 1200x630 PNG a player can save or share after a mission.
// Drawn on a canvas from the game state only: no external images, no NASA logos, no personal data
// (the only name on it is the generated callsign).
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { designSummary, makeRng } from './engine.js';
import { LEVELS, MISSION_BY_ID } from './data.js';
import { ORIGIN, originalText } from './provenance.js';

export const CARD_W = 1200;
export const CARD_H = 630;

/** The 3-4 lines that summarize a design (parts, instruments, orbit, rocket). Pure. */
export function summaryLines(d) {
  return [
    `Parts: ${d.parts.join(' · ')}`,
    `Instruments: ${d.instruments.length ? d.instruments.join(' · ') : 'none'}`,
    `Orbit: ${d.orbit}`,
    `Rocket: ${d.launcher}`
  ];
}

/** Word-wrap `text` into at most `maxLines` lines no wider than `maxW`, using measure(str) -> width. The last line gets an ellipsis if cut. */
export function wrapText(measure, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (measure(next) <= maxW || !cur) { cur = next; continue; }
    if (lines.length === maxLines - 1) break;
    lines.push(cur);
    cur = words[i];
  }
  if (i < words.length) { // out of lines: cut the rest
    let t = [cur, ...words.slice(i)].join(' ');
    while (t.length > 1 && measure(`${t}…`) > maxW) t = t.slice(0, -1);
    cur = `${t.trimEnd()}…`;
  } else {
    while (cur.length > 1 && measure(cur) > maxW) cur = cur.slice(0, -1);
  }
  if (cur) lines.push(cur);
  return lines;
}

async function loadFonts() {
  try {
    if (!document.fonts || !document.fonts.load) return;
    await Promise.all([
      document.fonts.load('900 60px Orbitron'), document.fonts.load('800 24px Orbitron'),
      document.fonts.load('600 22px "Chakra Petch"'), document.fonts.load('700 22px "Chakra Petch"')
    ]);
  } catch { /* fall back to system fonts */ }
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const fmtInt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function spaced(ctx, px) { try { ctx.letterSpacing = `${px}px`; } catch { /* older browsers */ } }

/** Draw the card for the finished run in S (needs S.result, S.cfg, S.callsign). Resolves to the canvas. */
export async function drawCard(S) {
  await loadFonts();
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  const DISP = 'Orbitron, "Chakra Petch", system-ui, sans-serif';
  const BODY = '"Chakra Petch", system-ui, sans-serif';
  const r = S.result;
  const cfg = S.cfg;
  const m = MISSION_BY_ID[cfg.missionId];
  const level = (LEVELS[cfg.level] || { name: cfg.level }).name;

  // background and starfield (seeded, so the same run always gets the same sky)
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#050816'); bg.addColorStop(1, '#0B1636');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CARD_W, CARD_H);
  const rnd = makeRng((Number(S.seed) >>> 0) || 7);
  for (let i = 0; i < 170; i++) {
    const x = rnd() * CARD_W, y = rnd() * CARD_H, s = rnd();
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    ctx.fillStyle = s > 0.9 ? '#FFD9A0' : s > 0.7 ? '#9FC0FF' : '#FFFFFF';
    ctx.fillRect(x, y, s > 0.92 ? 3 : s > 0.6 ? 2 : 1, s > 0.92 ? 3 : s > 0.6 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
  // a planet limb and an orbit ring, bottom right
  const pg = ctx.createRadialGradient(1010, 760, 40, 1010, 760, 360);
  pg.addColorStop(0, '#3E8CE0'); pg.addColorStop(0.55, '#123E86'); pg.addColorStop(1, 'rgba(5,8,22,0)');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(1010, 760, 360, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(61,245,255,.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(1010, 560, 330, 70, -0.35, Math.PI, Math.PI * 2); ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  // title block
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3DF5FF'; ctx.font = `900 56px ${DISP}`; spaced(ctx, 2);
  ctx.fillText('SATIT ORBITAL', 60, 90);
  spaced(ctx, 0);
  ctx.fillStyle = '#A5B0D0'; ctx.font = `500 19px ${BODY}`;
  ctx.fillText('A space mission design game · 2026 NASA Space Apps Challenge', 60, 122);

  // mission name (shrinks to fit)
  let px = 46;
  const maxName = 680;
  ctx.font = `800 ${px}px ${DISP}`;
  while (ctx.measureText(m.name.toUpperCase()).width > maxName && px > 24) { px -= 2; ctx.font = `800 ${px}px ${DISP}`; }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(m.name.toUpperCase(), 60, 205);
  ctx.fillStyle = '#FFC23D'; ctx.font = `700 20px ${DISP}`; spaced(ctx, 3);
  ctx.fillText(`STUDY LEVEL · ${level.toUpperCase()}`, 60, 244);
  if (S.runDaily) { ctx.fillStyle = '#5DF2B0'; ctx.fillText(`DAILY CHALLENGE · ${S.runDaily}`, 60, 276); }
  spaced(ctx, 0);

  // design summary
  const d = designSummary(cfg);
  ctx.fillStyle = '#3DF5FF'; ctx.font = `800 15px ${DISP}`; spaced(ctx, 4);
  ctx.fillText('THE DESIGN', 60, 330);
  spaced(ctx, 0);
  ctx.fillStyle = '#E9EEFF'; ctx.font = `500 22px ${BODY}`;
  const measure = (t) => ctx.measureText(t).width;
  let y = 366;
  const budget = [2, 2, 1, 1]; // lines allowed per summary row
  summaryLines(d).forEach((line, i) => {
    for (const l of wrapText(measure, line, 690, budget[i])) { ctx.fillText(l, 60, y); y += 29; }
  });

  // score panel
  const px0 = 790, pw = 350, py = 70, ph = 400;
  ctx.fillStyle = 'rgba(8,13,36,.82)';
  ctx.strokeStyle = r.stars === 3 ? '#3DF5FF' : '#FFC23D'; ctx.lineWidth = 3;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px0, py, pw, ph, 22); else ctx.rect(px0, py, pw, ph); ctx.fill(); ctx.stroke();
  const cx = px0 + pw / 2;
  for (let i = 0; i < 3; i++) {
    starPath(ctx, cx + (i - 1) * 78, py + 70, 34);
    ctx.fillStyle = i < r.stars ? '#FFC23D' : '#141B3A';
    ctx.strokeStyle = i < r.stars ? '#FFE08A' : '#3A4670'; ctx.lineWidth = 3;
    ctx.fill(); ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#A5B0D0'; ctx.font = `700 15px ${DISP}`; spaced(ctx, 4);
  ctx.fillText('TOTAL SCORE', cx, py + 150);
  spaced(ctx, 0);
  const scoreTxt = fmtInt(r.total);
  let sp = 92;
  ctx.font = `900 ${sp}px ${DISP}`;
  while (ctx.measureText(scoreTxt).width > pw - 40 && sp > 40) { sp -= 4; ctx.font = `900 ${sp}px ${DISP}`; }
  ctx.fillStyle = '#3DF5FF'; ctx.shadowColor = 'rgba(61,245,255,.6)'; ctx.shadowBlur = 24;
  ctx.fillText(scoreTxt, cx, py + 150 + 20 + sp * 0.8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = r.stars === 0 ? '#FF6B9A' : '#FFC23D'; ctx.font = `800 17px ${DISP}`; spaced(ctx, 2);
  ctx.fillText(r.result, cx, py + 300, pw - 30);
  spaced(ctx, 0);
  ctx.fillStyle = '#A5B0D0'; ctx.font = `500 16px ${BODY}`;
  ctx.fillText('Flown by', cx, py + 340);
  ctx.fillStyle = '#E9EEFF'; ctx.font = `800 22px ${DISP}`;
  ctx.fillText(String(S.callsign || ''), cx, py + 374, pw - 30);

  // footer
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(5,8,22,.7)'; ctx.fillRect(0, 520, CARD_W, 110);
  ctx.fillStyle = '#FFC23D'; ctx.font = `700 28px ${BODY}`;
  ctx.fillText(`Play it: ${ORIGIN.liveUrl.replace(/^https?:\/\//, '')}`, 60, 566);
  ctx.fillStyle = '#A5B0D0'; ctx.font = `500 16px ${BODY}`;
  ctx.fillText(originalText(), 60, 600);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFC23D'; ctx.font = `600 15px ${BODY}`;
  ctx.fillText('SI-assisted image', CARD_W - 40, 600);
  return cv;
}

/** Can this browser share image files? (Used to decide whether to show the SHARE button.) */
export function canShareFiles() {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'card.png', { type: 'image/png' })] });
  } catch { return false; }
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png'));
}
