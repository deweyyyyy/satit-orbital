// SATIT Orbital — synthesized sound effects and ambience (Web Audio, no audio files).
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool.
let ctx = null;
let master = null;
let muted = false;
let ambient = null;

export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : 1;
  if (muted) stopAmbient();
}

function ac() {
  if (muted) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 1;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, dur, { type = 'sine', vol = 0.05, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur, { vol = 0.08, from = 500, to = 500, delay = 0, type = 'lowpass', q = 0.7 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.08, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

let lastHover = 0;
export const sfx = {
  click() { tone(720, 0.05, { type: 'square', vol: 0.02 }); tone(1080, 0.04, { type: 'sine', vol: 0.02, delay: 0.02 }); },
  hover() { const now = performance.now(); if (now - lastHover < 70) return; lastHover = now; tone(1400, 0.025, { type: 'sine', vol: 0.008 }); },
  equip() { tone(520, 0.07, { type: 'triangle' }); tone(780, 0.09, { type: 'triangle', delay: 0.05 }); noise(0.08, { vol: 0.02, from: 3000, to: 1500, type: 'bandpass', q: 2 }); },
  error() { tone(180, 0.22, { type: 'sawtooth', vol: 0.03 }); tone(150, 0.22, { type: 'sawtooth', vol: 0.025, delay: 0.08 }); },
  warn() { tone(440, 0.09, { type: 'square', vol: 0.02 }); tone(330, 0.12, { type: 'square', vol: 0.02, delay: 0.1 }); },
  whoosh() { noise(0.35, { vol: 0.05, from: 300, to: 3200, type: 'bandpass', q: 1.2 }); },
  warp() { noise(0.9, { vol: 0.08, from: 200, to: 6000, type: 'bandpass', q: 0.8 }); tone(110, 0.9, { type: 'sawtooth', vol: 0.03, slide: 800 }); },
  type(n = 8) { for (let i = 0; i < Math.min(n, 10); i++) tone(900 + Math.random() * 500, 0.025, { type: 'square', vol: 0.007, delay: i * 0.045 }); },
  alert() { for (let i = 0; i < 3; i++) { tone(880, 0.16, { type: 'square', vol: 0.028, slide: -220, delay: i * 0.32 }); tone(660, 0.14, { type: 'square', vol: 0.02, delay: i * 0.32 + 0.16 }); } },
  success() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.045, delay: i * 0.09 })); },
  fanfare() { [392, 523, 659, 784, 659, 1046].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.045, delay: i * 0.12 })); },
  fail() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.025, delay: i * 0.16 })); },
  ding(i = 0) { tone(1046 + i * 262, 0.5, { type: 'sine', vol: 0.05, delay: 0 }); tone(2093 + i * 524, 0.4, { type: 'sine', vol: 0.015 }); },
  beep() { tone(1200, 0.07, { type: 'sine', vol: 0.03 }); },
  count() { tone(660, 0.12, { type: 'sine', vol: 0.04 }); },
  go() { tone(1320, 0.4, { type: 'sine', vol: 0.05 }); },
  launch() {
    noise(5.5, { vol: 0.16, from: 120, to: 900, type: 'lowpass' });
    noise(5.5, { vol: 0.05, from: 2000, to: 400, type: 'bandpass', q: 0.5, delay: 0.3 });
    tone(55, 5, { type: 'sawtooth', vol: 0.035, slide: 70, attack: 0.6 });
  }
};

// Low space-station hum during mission operations.
export function startAmbient() {
  const a = ac();
  if (!a || ambient) return;
  const g = a.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.03, a.currentTime + 2);
  const f = a.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 420;
  const oscs = [55, 82.5, 110.3].map((fr, i) => { const o = a.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
  const lfo = a.createOscillator(); const lg = a.createGain();
  lfo.frequency.value = 0.08; lg.gain.value = 140; lfo.connect(lg).connect(f.frequency); lfo.start();
  f.connect(g).connect(master);
  ambient = { g, oscs: [...oscs, lfo] };
}
export function stopAmbient() {
  if (!ambient || !ctx) { ambient = null; return; }
  const { g, oscs } = ambient;
  ambient = null;
  try {
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    oscs.forEach((o) => o.stop(ctx.currentTime + 0.9));
  } catch { /* already stopped */ }
}
