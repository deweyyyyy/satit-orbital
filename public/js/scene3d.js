// SATIT Orbital — real-time 3D views (Three.js, MIT). Everything is procedural: planet textures,
// spacecraft model built from the player's parts, and orbit paths shaped like the real orbit types.
// One WebGL renderer is reused across screens. Falls back to the CSS art when WebGL is unavailable.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool.
import * as THREE from '../vendor/three.module.min.js';

let ok = null;
export function supported() {
  if (ok !== null) return ok;
  try {
    const c = document.createElement('canvas');
    // Three.js r170 needs WebGL 2; older devices get the 2D art instead.
    ok = !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { ok = false; }
  return ok;
}

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- procedural textures ----------
const texCache = {};
function canvasTex(w, h, draw, key) {
  if (key && texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (key) texCache[key] = t;
  return t;
}
function blobs(ctx, r, n, w, h, colors, minR, maxR, spread) {
  for (let k = 0; k < n; k++) {
    const cx = r() * w, cy = h * 0.15 + r() * h * 0.7;
    const col = colors[Math.floor(r() * colors.length)];
    for (let j = 0; j < 70; j++) {
      const x = cx + (r() - 0.5) * spread, y = cy + (r() - 0.5) * spread * 0.6;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(((x % w) + w) % w, y, minR + r() * (maxR - minR), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function planetTexture(kind) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const r = rng({ earth: 7, moon: 11, mars: 13, asteroid: 17 }[kind] || 3);
    if (kind === 'earth') {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b2f66'); g.addColorStop(0.5, '#1a5fb4'); g.addColorStop(1, '#0b2f66');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      blobs(ctx, r, 16, w, h, ['#1d6b2c', '#25793a', '#2f8a3c', '#3f7f2f'], 3, 13, 170);
      blobs(ctx, r, 4, w, h, ['#8f7a46', '#a08a55'], 2, 8, 70);
      for (let i = 0; i < 4000; i++) { ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'; ctx.fillRect(r() * w, r() * h, 2, 2); }
      ctx.fillStyle = 'rgba(240,248,255,0.95)'; ctx.fillRect(0, 0, w, 26); ctx.fillRect(0, h - 30, w, 30);
    } else if (kind === 'moon') {
      ctx.fillStyle = '#9a9ba3'; ctx.fillRect(0, 0, w, h);
      blobs(ctx, r, 6, w, h, ['#6f7079', '#7b7c85'], 10, 40, 260);
      for (let i = 0; i < 260; i++) {
        const x = r() * w, y = r() * h, rad = 2 + r() * r() * 26;
        ctx.fillStyle = 'rgba(70,70,78,0.55)'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(210,210,220,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    } else if (kind === 'mars') {
      ctx.fillStyle = '#b5532c'; ctx.fillRect(0, 0, w, h);
      blobs(ctx, r, 8, w, h, ['#7a3018', '#8e3a1c', '#c8693a'], 8, 34, 240);
      ctx.fillStyle = 'rgba(250,240,230,0.9)'; ctx.fillRect(0, 0, w, 16); ctx.fillRect(0, h - 18, w, 18);
    } else {
      ctx.fillStyle = '#7a6a58'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { ctx.fillStyle = r() > 0.5 ? 'rgba(40,32,24,0.35)' : 'rgba(200,185,160,0.25)'; ctx.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    }
  }, 'planet-' + kind);
}
function cloudTexture() {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const r = rng(23);
    for (let i = 0; i < 1100; i++) {
      const x = r() * w, y = h * 0.1 + r() * h * 0.8, rad = 3 + r() * r() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }, 'clouds');
}
function panelTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#163a8a'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(160,195,255,0.65)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo((i * w) / 4, 0); ctx.lineTo((i * w) / 4, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, (i * h) / 4); ctx.lineTo(w, (i * h) / 4); ctx.stroke(); }
  }, 'panel');
}
function foilTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    for (let i = -h; i < w; i += 12) { ctx.fillStyle = (i / 12) % 2 ? '#e2b04a' : '#f5d06a'; ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 12, 0); ctx.lineTo(i + 12 + h, h); ctx.lineTo(i + h, h); ctx.fill(); }
  }, 'foil');
}
function glowTexture(color) {
  return canvasTex(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, color); g.addColorStop(0.3, color.replace('1)', '0.5)')); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }, 'glow-' + color);
}

function atmosphere(radius, color, strength = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, s: { value: strength } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float s; varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0) * s; gl_FragColor = vec4(c, 1.0) * i; }',
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
}

// ---------- orbits (planet radius = 1) ----------
const deg = Math.PI / 180;
function circle(r, inc, raan) {
  const m = new THREE.Matrix4().makeRotationY(raan * deg).multiply(new THREE.Matrix4().makeRotationX(inc * deg));
  return (t) => new THREE.Vector3(r * Math.cos(t * 2 * Math.PI), 0, r * Math.sin(t * 2 * Math.PI)).applyMatrix4(m);
}
function ellipse(a, e, inc, raan) {
  const m = new THREE.Matrix4().makeRotationY(raan * deg).multiply(new THREE.Matrix4().makeRotationX(inc * deg));
  return (t) => { const th = t * 2 * Math.PI; const rr = (a * (1 - e * e)) / (1 + e * Math.cos(th)); return new THREE.Vector3(rr * Math.cos(th), 0, rr * Math.sin(th)).applyMatrix4(m); };
}
const ORBIT_FN = {
  sso: circle(1.32, 98, 30), iss: circle(1.22, 51.6, -20), issd: circle(1.22, 51.6, -20), cubesso: circle(1.32, 97, 50),
  geo: circle(3.0, 0.1, 0), nrho: ellipse(3.0, 0.6, 85, 20), llo: circle(1.12, 88, 0),
  l2: (t) => new THREE.Vector3(-3.4, 0.9 * Math.sin(t * 2 * Math.PI), 0.55 * Math.cos(t * 2 * Math.PI)),
  flyby: (t) => new THREE.Vector3(-7 + 14 * t, 0.35, 1.5), rdv: circle(1.25, 30, 0),
  mlow: circle(1.18, 92, 10), mell: ellipse(2.6, 0.55, 80, 0)
};
const ORBIT_RATE = { geo: 0.03, nrho: 0.035, l2: 0.04, flyby: 0.025, mell: 0.04 };
const EARTH_MARKER = new THREE.Vector3(9, 2.5, -7);

// ---------- spacecraft model ----------
function disposeTree(o) {
  o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) { (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => { if (!Object.values(texCache).includes(m.map)) m.map && m.map.dispose(); m.dispose(); }); } });
}
function buildCraft(ev) {
  const g = new THREE.Group();
  const cube = ev.m.cls === 'cube';
  const bus = ev.eq.bus.id;
  const dims = cube ? { u1: [0.42, 0.42, 0.42], u3: [0.42, 1.15, 0.42], u6: [0.75, 1.15, 0.42] }[bus] : { s: [0.78, 0.78, 0.78], m: [1, 1, 1], l: [1.25, 1.25, 1.25] }[bus];
  const busMat = cube
    ? new THREE.MeshStandardMaterial({ color: '#2b3557', metalness: 0.35, roughness: 0.35 })
    : new THREE.MeshStandardMaterial({ map: foilTexture(), metalness: 0.3, roughness: 0.32, emissive: '#3a2a08', emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), busMat);
  g.add(body);
  if (cube) {
    const rail = new THREE.MeshStandardMaterial({ color: '#c9d2e6', metalness: 0.4, roughness: 0.25 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, dims[1] + 0.04, 0.05), rail); m.position.set((sx * dims[0]) / 2, 0, (sz * dims[2]) / 2); g.add(m); }
  }
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), metalness: 0.4, roughness: 0.5, emissive: '#0a1a44', emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const wing = { body: null, cbody: null, wing: [1.4, 0.62], cdep: [0.7, 0.4], big: [1.9, 0.84], cbig: [1.1, 0.48], giant: [2.4, 1.1] }[ev.eq.solar.id];
  if (wing) {
    const boomMat = new THREE.MeshStandardMaterial({ color: '#8a93a8', metalness: 0.35, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 8), boomMat);
      boom.rotation.z = Math.PI / 2; boom.position.x = s * (dims[0] / 2 + 0.14); g.add(boom);
      const p = new THREE.Mesh(new THREE.BoxGeometry(wing[0], 0.02, wing[1]), panelMat);
      p.position.x = s * (dims[0] / 2 + 0.28 + wing[0] / 2); g.add(p);
    }
  } else {
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.01, dims[1] * 0.7, dims[2] * 0.7), panelMat); p.position.x = s * (dims[0] / 2 + 0.006); g.add(p); }
  }
  const white = new THREE.MeshStandardMaterial({ color: '#e6ecf7', metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
  const com = ev.eq.comms.id;
  const dish = { s: 0.2, cs: 0.12, x: 0.32, ka: 0.48 }[com];
  if (dish) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), white);
    mast.position.y = dims[1] / 2 + 0.09; g.add(mast);
    const d = new THREE.Mesh(new THREE.SphereGeometry(dish, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.8), white);
    d.rotation.x = Math.PI; d.position.y = dims[1] / 2 + 0.18 + dish * 0.55; g.add(d);
  } else {
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), white);
    whip.position.y = dims[1] / 2 + 0.35; g.add(whip);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: '#5DF2B0' }));
    tip.position.y = dims[1] / 2 + 0.72; g.add(tip);
  }
  const n = ev.picked.length;
  ev.picked.forEach((i, k) => {
    const x = (k - (n - 1) / 2) * 0.22;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#2a3350', metalness: 0.3, roughness: 0.4 }));
    housing.position.set(x * (cube ? 0.6 : 1), -dims[1] / 2 - 0.07, 0); g.add(housing);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: i.color }));
    lens.rotation.x = Math.PI / 2; lens.position.set(housing.position.x, -dims[1] / 2 - 0.145, 0); g.add(lens);
  });
  const prop = ev.eq.prop ? ev.eq.prop.id : 'none';
  if (prop !== 'none' && !cube) {
    const noz = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#6a7088', metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }));
    noz.rotation.x = Math.PI / 2; noz.position.z = -dims[2] / 2 - 0.12; g.add(noz);
    if (prop === 'ion') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(120,200,255,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.set(0.6, 0.6, 1); s.position.z = -dims[2] / 2 - 0.35; s.userData.pulse = true; g.add(s);
    }
  }
  return g;
}

// ---------- the shared renderer ----------
const S = {
  renderer: null, canvas: null, scene: null, camera: null, raf: 0, last: 0, host: null,
  sceneKey: '', craftKey: '', cfg: {}, t: 0, yaw: 0.6, pitch: 0.25, dist: 5, auto: true,
  drag: null, objects: {}, shake: 0
};

function init() {
  if (S.renderer) return true;
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { ok = false; return false; }
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.35;
  r.setClearColor(0x000000, 0);
  S.renderer = r;
  S.canvas = r.domElement;
  S.canvas.setAttribute('aria-hidden', 'true');
  S.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  S.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
  S.canvas.addEventListener('pointerdown', (e) => { if (!S.cfg.interactive) return; S.drag = { x: e.clientX, y: e.clientY }; S.auto = false; S.canvas.setPointerCapture(e.pointerId); });
  S.canvas.addEventListener('pointermove', (e) => {
    if (!S.drag) return;
    if (e.buttons === 0) { S.drag = null; return; }
    S.yaw -= (e.clientX - S.drag.x) * 0.008; S.pitch = Math.max(-1.3, Math.min(1.3, S.pitch + (e.clientY - S.drag.y) * 0.006));
    S.drag = { x: e.clientX, y: e.clientY };
  });
  const up = () => { S.drag = null; };
  S.canvas.addEventListener('pointerup', up); S.canvas.addEventListener('pointercancel', up); S.canvas.addEventListener('lostpointercapture', up);
  S.canvas.addEventListener('wheel', (e) => { if (!S.cfg.interactive) return; e.preventDefault(); S.dist = Math.max(S.minDist || 2, Math.min(S.maxDist || 40, S.dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
  return true;
}

function buildScene(cfg) {
  if (S.scene) disposeTree(S.scene);
  const scene = new THREE.Scene();
  const O = {};
  // stars
  const r = rng(99);
  const pos = [];
  for (let i = 0; i < 1500; i++) { const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(300 + r() * 200); pos.push(v.x, v.y, v.z); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfe0ff', size: 1.2, sizeAttenuation: false, transparent: true, opacity: cfg.mode === 'hero' ? 0.0 : 0.8 })));
  // light
  const sunDir = new THREE.Vector3(5, 2, 4).normalize();
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.position.copy(sunDir.clone().multiplyScalar(20)); scene.add(sun);
  scene.add(new THREE.AmbientLight('#5070b0', 0.7));
  const fill = new THREE.DirectionalLight('#9fc0ff', 0.9); fill.position.set(-6, 2, 5); scene.add(fill);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,230,180,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunSprite.position.copy(sunDir.clone().multiplyScalar(160)); sunSprite.scale.set(40, 40, 1); scene.add(sunSprite);
  const alarm = new THREE.PointLight('#ff3366', 0, 30); alarm.position.set(0, 3, 3); scene.add(alarm); O.alarm = alarm;

  const target = cfg.target || 'earth';
  if (cfg.mode !== 'craft') {
    let planet;
    if (target === 'asteroid') {
      const geo = new THREE.IcosahedronGeometry(0.65, 5);
      const p = geo.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.18 * Math.sin(v.x * 5.1) * Math.cos(v.y * 4.3) + 0.08 * Math.sin(v.z * 9.7 + v.x * 3); v.multiplyScalar(n); v.y *= 0.78; p.setXYZ(i, v.x, v.y, v.z); }
      geo.computeVertexNormals();
      planet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: planetTexture('asteroid'), roughness: 1, metalness: 0 }));
    } else {
      planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshStandardMaterial({ map: planetTexture(target), roughness: target === 'earth' ? 0.7 : 1, metalness: 0 }));
    }
    scene.add(planet); O.planet = planet;
    if (target === 'earth') {
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), new THREE.MeshStandardMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, roughness: 1 }));
      scene.add(clouds); O.clouds = clouds;
      scene.add(atmosphere(1.15, '#4aa8ff', 1.1));
    }
    if (target === 'mars') scene.add(atmosphere(1.1, '#ff9a6a', 0.6));
    if (target !== 'earth' && cfg.mode !== 'hero') {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), new THREE.MeshStandardMaterial({ map: planetTexture('earth') }));
      e.position.copy(EARTH_MARKER); scene.add(e); O.earth = e;
      const ea = atmosphere(0.33, '#4aa8ff', 1.0); ea.position.copy(EARTH_MARKER); scene.add(ea);
    }
    // orbit path
    const fn = ORBIT_FN[cfg.orbitId] || ORBIT_FN.sso;
    const pts = []; for (let i = 0; i <= 256; i++) pts.push(fn(cfg.orbitId === 'flyby' ? i / 256 : (i % 256) / 256));
    const ext = Math.max(...pts.map((p) => p.length()));
    const curve = new THREE.CatmullRomCurve3(pts.slice(0, cfg.orbitId === 'flyby' ? 257 : 256), cfg.orbitId !== 'flyby');
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.006 + ext * 0.0025, 6, cfg.orbitId !== 'flyby'),
      new THREE.MeshBasicMaterial({ color: '#FFC23D', transparent: true, opacity: cfg.mode === 'hero' ? 0.25 : 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(tube); O.path = tube; O.fn = fn;
    S.minDist = 1.8; S.maxDist = 40;
    if (cfg.mode === 'hero') { S.dist = 2.55; S.yaw = 0.9; S.pitch = 0.1; }
    else { S.dist = Math.max(4.8, Math.min(cfg.mode === 'planet' ? 8 : 12, ext * 3.0)); S.yaw = 0.7; S.pitch = 0.32; }
    // downlink beam
    const bg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const beam = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: '#5DF2B0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
    scene.add(beam); O.beam = beam;
    O.station = new THREE.Vector3(0.35, 0.55, 0.76).normalize();
  } else {
    // hangar: big Earth limb below the spacecraft
    const limb = new THREE.Mesh(new THREE.SphereGeometry(30, 96, 64), new THREE.MeshStandardMaterial({ map: planetTexture('earth'), roughness: 0.8 }));
    limb.position.set(0, -34.6, -9); limb.rotation.z = Math.PI / 2; scene.add(limb); O.limb = limb;
    const la = atmosphere(31.5, '#4aa8ff', 0.9); la.position.copy(limb.position); scene.add(la);
    S.dist = 6.6; S.yaw = 0.7; S.pitch = 0.16; S.minDist = 3; S.maxDist = 11;
  }
  S.scene = scene; S.objects = O; S.auto = true;
}

function setCraft(ev) {
  const O = S.objects;
  if (O.craft) { S.scene.remove(O.craft); disposeTree(O.craft); O.craft = null; }
  if (!ev) return;
  const c = buildCraft(ev);
  if (S.cfg.mode === 'craft') c.scale.setScalar(ev.m.cls === 'cube' ? 1.5 : 1);
  else c.scale.setScalar(S.cfg.mode === 'hero' ? 0.09 : 0.06 * (ev.m.cls === 'cube' ? 1.4 : 1) * (S.cfg.orbitId === 'geo' ? 2.2 : 1));
  S.scene.add(c); O.craft = c;
}

function frame(now) {
  S.raf = requestAnimationFrame(frame);
  if (!S.host || !S.host.isConnected) { stop(); return; }
  const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
  const still = reduceMotion();
  // size
  const w = S.host.offsetWidth, h = S.host.offsetHeight;
  if (!w || !h) return;
  const scale = S.cfg.stageScale || 1;
  const pr = Math.min(2, (window.devicePixelRatio || 1) * scale);
  if (S.canvas.width !== Math.round(w * pr) || S.canvas.height !== Math.round(h * pr)) { S.renderer.setPixelRatio(pr); S.renderer.setSize(w, h, false); S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); }
  const O = S.objects;
  const cfg = S.cfg;
  if (O.planet && !still) O.planet.rotation.y += dt * 0.05;
  if (O.clouds && !still) O.clouds.rotation.y += dt * 0.065;
  if (O.earth && !still) O.earth.rotation.y += dt * 0.2;
  if (O.limb && !still) O.limb.rotation.y += dt * 0.01;
  if (S.auto && !S.drag && !still) S.yaw += dt * (cfg.mode === 'craft' ? 0.25 : 0.04);
  // spacecraft motion
  if (O.craft) {
    if (cfg.mode === 'craft') {
      O.craft.position.set(0, 0.35 + (still ? 0 : Math.sin(now / 900) * 0.06), 0);
      O.craft.rotation.set(0.12, still ? 0.6 : now / 6000, 0.05);
    } else if (O.fn) {
      const rate = (ORBIT_RATE[cfg.orbitId] || 0.07) * (cfg.timeScale ?? 1);
      if (!still) S.t = (S.t + dt * rate) % 1;
      const p = O.fn(S.t);
      O.craft.position.copy(p);
      const toPlanet = p.clone().negate().normalize();
      O.craft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toPlanet);
      O.craft.traverse((n) => { if (n.userData.pulse) n.material.opacity = 0.6 + 0.4 * Math.sin(now / 120); });
      // downlink beam
      let show = false; let to = null;
      if (cfg.sending) {
        if (O.earth) { to = EARTH_MARKER; show = true; }
        else if (O.planet && cfg.target === 'earth') {
          to = O.station.clone().applyQuaternion(O.planet.quaternion);
          show = p.clone().normalize().dot(to) > 0.45;
        }
      }
      const bm = O.beam;
      if (show && to) {
        const a = bm.geometry.attributes.position; a.setXYZ(0, p.x, p.y, p.z); a.setXYZ(1, to.x, to.y, to.z); a.needsUpdate = true;
        bm.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(now / 160));
      } else bm.material.opacity = 0;
    }
  }
  // alarm pulse and camera shake during emergencies
  if (O.alarm) O.alarm.intensity = cfg.alert && !still ? 6 + 6 * Math.sin(now / 110) : 0;
  const shake = cfg.alert && !still ? 0.02 : 0;
  // camera
  const center = cfg.mode === 'hero' ? new THREE.Vector3(0, 1.22, 0) : cfg.mode === 'craft' ? new THREE.Vector3(0, 0.25, 0) : new THREE.Vector3(0, 0, 0);
  const cp = new THREE.Vector3(Math.cos(S.pitch) * Math.sin(S.yaw), Math.sin(S.pitch), Math.cos(S.pitch) * Math.cos(S.yaw)).multiplyScalar(S.dist).add(cfg.mode === 'hero' ? new THREE.Vector3(0, 0.95, 0) : center);
  S.camera.position.set(cp.x + (Math.random() - 0.5) * shake, cp.y + (Math.random() - 0.5) * shake, cp.z);
  S.camera.lookAt(center);
  S.renderer.render(S.scene, S.camera);
}

function stop() {
  cancelAnimationFrame(S.raf); S.raf = 0; S.last = 0; S.drag = null;
  if (S.canvas && S.canvas.parentNode) S.canvas.parentNode.removeChild(S.canvas);
  S.host = null;
}

/**
 * Attach the 3D view to the placeholder on screen (or stop when there is none) and update its inputs.
 * cfg: { mode: 'hero'|'planet'|'craft'|'orbit'|'ops', target, orbitId, ev, designKey, interactive, timeScale, sending, alert, stageScale }
 */
export function sync(host, cfg) {
  if (!supported()) return false;
  if (!host) { if (S.host) stop(); return false; }
  if (!init()) return false;
  S.cfg = cfg;
  const sceneKey = `${cfg.mode}|${cfg.target}|${cfg.orbitId}`;
  if (sceneKey !== S.sceneKey) { buildScene(cfg); S.sceneKey = sceneKey; S.craftKey = ''; }
  const craftKey = cfg.ev ? `${cfg.designKey}|${cfg.mode}|${cfg.orbitId}` : '';
  if (craftKey !== S.craftKey) { setCraft(cfg.ev); S.craftKey = craftKey; }
  if (S.canvas.parentNode !== host) { host.appendChild(S.canvas); S.host = host; }
  if (!S.raf) { S.last = 0; S.raf = requestAnimationFrame(frame); }
  return true;
}

export function resetView() { S.auto = true; }
