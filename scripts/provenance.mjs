// Fingerprints of the version submitted to the 2026 NASA Space Apps Challenge.
//   node scripts/provenance.mjs generate [git-ref]   write provenance.json from a git ref (default: v1.0-submitted)
//   node scripts/provenance.mjs verify [folder]      compare a checkout (default: this one) with provenance.json
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOTS = ['public', 'src', 'migrations', 'test', 'wrangler.jsonc', 'package.json'];
const SKIP = new Set(['node_modules', '.wrangler', '.git', 'dist', '.DS_Store']);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (...a) => execFileSync('git', a, { maxBuffer: 256 * 1024 * 1024 });
const inRoots = (p) => ROOTS.some((r) => p === r || p.startsWith(r + '/'));

function generate(ref = 'v1.0-submitted') {
  const names = git('ls-tree', '-r', '--name-only', ref).toString().split('\n').filter((p) => p && inRoots(p)).sort();
  const files = {};
  for (const p of names) files[p] = sha(git('show', `${ref}:${p}`));
  const commit = git('rev-parse', `${ref}^{commit}`).toString().trim();
  const committed = git('show', '-s', '--format=%cI', commit).toString().trim();
  const out = {
    project: 'SATIT Orbital',
    repo: 'https://github.com/deweyyyyy/satit-orbital',
    ref, commit, committed,
    submittedToSpaceApps: '2026-11-14T15:46:00Z',
    note: 'SHA-256 of every shipped file in the version submitted to NASA Space Apps 2026. Run `npm run verify` in any copy to compare it with this list.',
    fileCount: names.length, files
  };
  writeFileSync('provenance.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`provenance.json written: ${names.length} files from ${ref} (${commit.slice(0, 7)})`);
}

function walk(dir, base, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(base, full).split('\\').join('/');
    const st = statSync(full);
    if (st.isDirectory()) { if (inRoots(rel) || ROOTS.some((r) => r.startsWith(rel + '/'))) walk(full, base, acc); }
    else if (inRoots(rel)) acc[rel] = sha(readFileSync(full));
  }
  return acc;
}

function verify(folder = '.') {
  const base = resolve(folder);
  const manifestPath = existsSync(join(base, 'provenance.json')) ? join(base, 'provenance.json') : 'provenance.json';
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const have = walk(base, base, {});
  const same = [], changed = [], missing = [];
  for (const [p, h] of Object.entries(m.files)) {
    if (!(p in have)) missing.push(p);
    else if (have[p] === h) same.push(p);
    else changed.push(p);
  }
  const extra = Object.keys(have).filter((p) => !(p in m.files));
  const pct = Math.round((same.length / m.fileCount) * 100);
  console.log(`${m.project} provenance check against ${m.ref} (${m.commit.slice(0, 7)}, ${m.committed})`);
  console.log(`  identical to the submitted version: ${same.length} of ${m.fileCount} files (${pct}%)`);
  if (changed.length) console.log(`  changed (${changed.length}): ${changed.join(', ')}`);
  if (missing.length) console.log(`  missing (${missing.length}): ${missing.join(', ')}`);
  if (extra.length) console.log(`  new files (${extra.length}): ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ', \u2026' : ''}`);
  console.log('  Original project: https://github.com/deweyyyyy/satit-orbital');
  process.exit(changed.length || missing.length ? 1 : 0);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'generate') generate(arg);
else if (cmd === 'verify') verify(arg);
else { console.log('Usage: node scripts/provenance.mjs generate [git-ref] | verify [folder]'); process.exit(2); }
