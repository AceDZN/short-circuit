import type { ItemKind } from '../sim/types';

const res = (bands: string[]) =>
  `<svg viewBox="0 0 48 48"><line x1="2" y1="24" x2="46" y2="24" stroke="#bbb" stroke-width="3"/><rect x="11" y="15" width="26" height="18" rx="7" fill="#d8c39a"/>${bands
    .map((c, i) => `<rect x="${16 + i * 6}" y="15" width="3.5" height="18" fill="${c}"/>`)
    .join('')}</svg>`;

const bat = (v: string) =>
  `<svg viewBox="0 0 48 48"><rect x="6" y="12" width="32" height="24" rx="3" fill="#1d2026" stroke="#c89b4a" stroke-width="2"/><rect x="38" y="19" width="5" height="10" fill="#c87a3a"/><text x="22" y="29" font-size="11" font-weight="800" fill="#ffd04a" text-anchor="middle" font-family="Rubik,sans-serif">${v}</text></svg>`;

export const ITEM_SVG: Record<ItemKind, string> = {
  wire: `<svg viewBox="0 0 48 48"><path d="M6 34 C 14 6, 34 42, 42 14" stroke="#ff4a4a" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="2" y="31" width="8" height="8" fill="#c0c0c0"/><rect x="38" y="10" width="8" height="8" fill="#c0c0c0"/></svg>`,
  coin: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="#e2b847" stroke="#a87d1e" stroke-width="3"/><circle cx="24" cy="24" r="10" fill="none" stroke="#a87d1e" stroke-width="1.5"/></svg>`,
  pencil: `<svg viewBox="0 0 48 48"><g transform="rotate(-40 24 24)"><rect x="6" y="20" width="28" height="8" fill="#f2c230"/><rect x="6" y="20" width="5" height="8" fill="#e47fa0"/><polygon points="34,20 44,24 34,28" fill="#e8c9a0"/><polygon points="40,22.4 44,24 40,25.6" fill="#333"/></g></svg>`,
  glove: `<svg viewBox="0 0 48 48"><path d="M14 42 L14 22 C14 18 18 18 18 22 L18 12 C18 8 22 8 22 12 L22 10 C22 6 26 6 26 10 L26 12 C26 8 30 8 30 12 L30 20 L33 16 C36 13 39 16 37 19 L32 30 L32 42 Z" fill="#f0d040" stroke="#b39a20" stroke-width="1.5"/></svg>`,
  rubberBand: `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="16" ry="10" fill="none" stroke="#c04060" stroke-width="4"/></svg>`,
  ruler: `<svg viewBox="0 0 48 48"><g transform="rotate(-30 24 24)"><rect x="4" y="18" width="40" height="12" fill="#c89a5a" rx="2"/>${[8, 14, 20, 26, 32, 38].map((x) => `<line x1="${x}" y1="18" x2="${x}" y2="23" stroke="#5a3a1a" stroke-width="1.5"/>`).join('')}</g></svg>`,
  sponge: `<svg viewBox="0 0 48 48"><rect x="8" y="14" width="32" height="20" rx="4" fill="#e8d040"/><circle cx="16" cy="20" r="2" fill="#b8a020"/><circle cx="28" cy="26" r="2.5" fill="#b8a020"/><circle cx="34" cy="19" r="1.5" fill="#b8a020"/><path d="M14 38 q2 4 4 0" stroke="#5aa0ff" stroke-width="2" fill="none"/></svg>`,
  res3: res(['#ff8c00', '#000', '#ffd700']),
  res6: res(['#0000ff', '#000', '#ffd700']),
  res12: res(['#8b4513', '#ff0000', '#000']),
  bat6: bat('6V'),
  bat12: bat('12V'),
  fuse: `<svg viewBox="0 0 48 48"><rect x="10" y="17" width="28" height="14" rx="7" fill="#cfe9ff" fill-opacity="0.5" stroke="#9ab" stroke-width="2"/><rect x="5" y="17" width="7" height="14" fill="#aab"/><rect x="36" y="17" width="7" height="14" fill="#aab"/><line x1="12" y1="24" x2="36" y2="24" stroke="#ffb050" stroke-width="1.5"/></svg>`,
};
