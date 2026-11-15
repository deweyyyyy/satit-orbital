// SATIT Orbital — provenance: where this game came from, and what to show on a copy.
// Open source (MIT): anyone may copy this project. The badge and notice below just say who made it.
// Written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.

export const ORIGIN = {
  name: 'SATIT Orbital',
  repo: 'deweyyyyy/satit-orbital',
  repoUrl: 'https://github.com/deweyyyyy/satit-orbital',
  liveUrl: 'https://satit-orbital.deweytng.workers.dev',
  firstPublished: '2026-11-14',
  submittedTag: 'v1.0-submitted',
  officialHosts: ['satit-orbital.deweytng.workers.dev', 'satit-orbital-next.deweytng.workers.dev']
};

export function isOfficialHost(host = (typeof location !== 'undefined' ? location.hostname : '')) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost') || ORIGIN.officialHosts.includes(host);
}

// GitHub "mark" icon (Primer Octicons, MIT license).
const GH_MARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="vertical-align:-2px"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

/** HTML for the "Originally by SATIT Orbital: [GitHub logo]/deweyyyyy/satit-orbital" line. All values are constants (no user input). */
export function originalBadge() {
  return `<a class="origin-badge" href="${ORIGIN.repoUrl}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;white-space:nowrap">Originally by ${ORIGIN.name}: ${GH_MARK}<span style="text-decoration:underline">/${ORIGIN.repo}</span></a>`;
}

/** Plain text version (for canvas result cards and the console). */
export function originalText() {
  return `Originally by ${ORIGIN.name}: github.com/${ORIGIN.repo}`;
}

/** On any website other than the official ones, show a dismissible "this is a copy" notice. Safe DOM calls only. */
export function showCopyNotice() {
  if (typeof document === 'undefined' || isOfficialHost() || document.getElementById('copy-notice')) return;
  const bar = document.createElement('div');
  bar.id = 'copy-notice';
  bar.setAttribute('role', 'note');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:50;display:flex;gap:12px;align-items:center;justify-content:center;padding:8px 44px 8px 16px;background:#FFC23D;color:#1A1203;font:600 14px/1.35 "Chakra Petch",system-ui,sans-serif;text-align:center';
  bar.append(`This is a copy of ${ORIGIN.name}, an open-source project by Team ${ORIGIN.name} (first published ${ORIGIN.firstPublished}). `);
  const a = document.createElement('a');
  a.href = ORIGIN.repoUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'See the original project';
  a.style.cssText = 'color:#1A1203;text-decoration:underline;font-weight:700';
  bar.append(a);
  const x = document.createElement('button');
  x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Dismiss notice');
  x.style.cssText = 'position:absolute;right:8px;top:4px;min-width:32px;min-height:32px;border:0;background:transparent;color:#1A1203;font-size:22px;cursor:pointer';
  x.addEventListener('click', () => bar.remove());
  bar.append(x);
  document.body.prepend(bar);
}
