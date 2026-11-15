// SATIT Orbital — language switch (English / Thai) done at the DOM level.
// The game's screens are written in English. When Thai is on, every visible text node and the
// placeholder / aria-label / title attributes are looked up in the dictionary in th.js (exact match, then
// ordered regex rules for sentences with numbers). Unknown text is simply left in English.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { TH, TH_RULES } from './th.js';

const STORE_KEY = 'satit.lang';
const LANGS = ['en', 'th'];
const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

// ---------- language state ----------
let lang = null;
const listeners = new Set();

function readStored() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'th' || v === '"th"') return 'th';
  } catch { /* storage blocked */ }
  return 'en';
}
function applyDocLang() {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
}

export function getLang() {
  if (lang === null) { lang = readStored(); applyDocLang(); }
  return lang;
}
export function setLang(next) {
  const v = LANGS.includes(next) ? next : 'en';
  const changed = v !== getLang();
  lang = v;
  try { localStorage.setItem(STORE_KEY, v); } catch { /* storage blocked */ }
  applyDocLang();
  clearCache();
  if (changed) for (const fn of [...listeners]) { try { fn(v); } catch { /* a listener must not break the switch */ } }
  return v;
}
/** Call `fn(lang)` after the language changes. Returns an unsubscribe function. */
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- string translation ----------
const lcIndex = new Map();
for (const k of Object.keys(TH)) { const l = k.toLowerCase(); if (!lcIndex.has(l)) lcIndex.set(l, TH[k]); }
const own = (k) => Object.prototype.hasOwnProperty.call(TH, k);

let cache = new Map();
function clearCache() { cache = new Map(); }

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
// Rule output glues Thai to part names and numbers; put a space where Latin script meets Thai script.
const tidy = (s) => s.replace(/([A-Za-z0-9)%°])(?=[\u0E01-\u0E4E])/g, '$1 ').replace(/([\u0E01-\u0E4E])(?=[A-Za-z(])/g, '$1 ');

// Translate one already-collapsed string. Returns undefined when nothing matches.
function lookup(core, depth = 0) {
  if (!core) return undefined;
  if (own(core)) return TH[core];
  const lc = lcIndex.get(core.toLowerCase());
  if (lc !== undefined) return lc;
  if (depth > 4) return undefined;
  const tr = (s) => { const r = lookup(collapse(String(s)), depth + 1); return r === undefined ? s : r; };
  for (const [re, fn] of TH_RULES) {
    const m = re.exec(core);
    if (m) {
      const out = fn(m, tr);
      if (typeof out === 'string' && out) return tidy(out);
    }
  }
  // "A · B · C" lists: translate each piece we know and keep the rest.
  if (core.includes(' · ')) {
    const parts = core.split(' · ');
    let hit = 0;
    const out = parts.map((p) => { const r = lookup(p, depth + 1); if (r !== undefined) { hit++; return r; } return p; });
    if (hit) return out.join(' · ');
  }
  return undefined;
}

/** Translate a string to the current language. Keeps surrounding whitespace. Returns the input when unknown. */
export function translateString(s, to = getLang()) {
  if (to !== 'th' || typeof s !== 'string' || !s) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const core = collapse(s);
  let out = s;
  if (core) {
    const r = lookup(core);
    if (r !== undefined && r !== core) {
      const lead = /^\s*/.exec(s)[0];
      const trail = /\s*$/.exec(s)[0];
      out = lead + r + trail;
    }
  }
  if (cache.size > 6000) cache = new Map();
  cache.set(s, out);
  return out;
}
/** Short alias for UI code: t('Skip guide'). */
export const t = (s) => translateString(s);

// ---------- DOM walker ----------
const textMemo = new WeakMap(); // text node -> { src, out }
const attrMemo = new WeakMap(); // element -> { [attr]: { src, out } }

function doText(node, to) {
  const cur = node.nodeValue;
  const memo = textMemo.get(node);
  if (to === 'th') {
    if (memo && cur === memo.out) return; // already translated: idempotent
    const src = cur;
    const out = translateString(src, 'th');
    if (out !== src) { node.nodeValue = out; textMemo.set(node, { src, out }); } else if (memo) textMemo.delete(node);
  } else if (memo && cur === memo.out) {
    node.nodeValue = memo.src;
    textMemo.delete(node);
  }
}

function doAttrs(el, to) {
  if (typeof el.getAttribute !== 'function') return;
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur === null) continue;
    let memos = attrMemo.get(el);
    const memo = memos && memos[a];
    if (to === 'th') {
      if (memo && cur === memo.out) continue;
      const out = translateString(cur, 'th');
      if (out !== cur) {
        el.setAttribute(a, out);
        if (!memos) { memos = {}; attrMemo.set(el, memos); }
        memos[a] = { src: cur, out };
      } else if (memo) delete memos[a];
    } else if (memo && cur === memo.out) {
      el.setAttribute(a, memo.src);
      delete memos[a];
    }
  }
}

function walk(node, to) {
  const type = node.nodeType;
  if (type === 3) { doText(node, to); return; }
  if (type === 1) {
    const tag = String(node.tagName || '').toUpperCase();
    if (SKIP_TAGS.has(tag)) return;
    if (typeof node.getAttribute === 'function' && node.getAttribute('translate') === 'no') return;
    doAttrs(node, to);
  } else if (type !== 9 && type !== 11) return;
  const kids = node.childNodes;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) walk(kids[i], to);
}

/** Translate every text node and placeholder / aria-label / title under `root` to the current language
 *  (or restore the English originals when the language is English). Safe to call repeatedly. */
export function translateDom(root, to = getLang()) {
  if (!root) return root;
  walk(root, to);
  return root;
}

/** Translate an HTML string (used before the app diffs and inserts it). English: returned unchanged. */
export function translateHTML(html) {
  if (getLang() !== 'th' || typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  walk(tpl.content, 'th');
  return tpl.innerHTML;
}

// ---------- toggle button ----------
/** Markup for the title-screen language button. Wired to the `toggleLang` action. */
export function langToggleHTML() {
  const th = getLang() === 'th';
  const label = th ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย';
  return `<button class="iconbtn lang-toggle" data-act="toggleLang" translate="no" lang="${th ? 'en' : 'th'}" aria-label="${label}" title="${label}"><span aria-hidden="true">${th ? 'EN' : 'ไทย'}</span></button>`;
}
/** The ready-made action for the button: `A.toggleLang = toggleLang`. */
export function toggleLang() { return setLang(getLang() === 'th' ? 'en' : 'th'); }

// Worth reporting when missing: has real words, is not already Thai, and is not a single all-caps code (TIR, ABCDE, 2U).
const wantsTranslation = (core) => /[A-Za-z]{3,}/.test(core) && !/[\u0E00-\u0E7F]/.test(core) && !/^[A-Z0-9-]+$/.test(core);

/** Development helper: list the visible strings under `root` that Thai mode could not translate. */
export function findUntranslated(root) {
  const out = new Set();
  const visit = (node) => {
    const type = node.nodeType;
    if (type === 3) {
      const core = collapse(node.nodeValue || '');
      if (core && wantsTranslation(core) && lookup(core) === undefined) out.add(core);
      return;
    }
    if (type === 1) {
      const tag = String(node.tagName || '').toUpperCase();
      if (SKIP_TAGS.has(tag) || node.getAttribute('translate') === 'no') return;
      for (const a of ATTRS) { const v = node.getAttribute(a); const core = v && collapse(v); if (core && wantsTranslation(core) && lookup(core) === undefined) out.add(core); }
    }
    const kids = node.childNodes;
    if (kids) for (let i = 0; i < kids.length; i++) visit(kids[i]);
  };
  visit(root);
  return [...out];
}

getLang(); // apply <html lang> as soon as the module loads
