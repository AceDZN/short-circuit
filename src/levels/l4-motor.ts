import type { LevelDef } from '../sim/types';

// Heist 4 — Ohm's law: pick the battery and resistance that give the motor enough current, but not too much.
export const L4: LevelDef = {
  id: 'l4',
  index: 4,
  title: 'דלת המנוע',
  subtitle: 'חוק אוהם',
  concept: 'I = V ÷ R. ההתנגדות הכוללת בטור היא סכום ההתנגדויות. יותר התנגדות = פחות זרם. מעט מדי זרם — המנוע לא מרים. יותר מדי — הנתיך נשרף.',
  theme: 'museum',
  map: [
    '######################', // 0
    '########..g...########', // 1  exhibit (10,1)
    '########......########', // 2
    '########......########', // 3
    '########......########', // 4
    '##########DD##########', // 5  vault door (10,5)(11,5)
    '#....................#', // 6
    '#....................#', // 7
    '#.....#........#......', // 8  exit (21,8)
    '#....................#', // 9
    '#....................#', // 10
    '#....................#', // 11
    '######################', // 12
  ],
  start: [1, 10],
  exit: [21, 8],
  zones: [{ id: 'hall', name: 'האולם', rect: [1, 6, 20, 11], investigate: [10, 8], watchers: ['g1'] }],
  circuits: [
    {
      id: 'cd',
      name: 'מנוע דלת הארכיון',
      color: 0xffc04a,
      panel: 'pd',
      nodes: { bp: [1.2, 5.6], bq: [1.2, 1.2], f: [4, 1.2], r1: [6, 1.2], r2: [8.6, 1.2], m: [11, 1.2], mr: [11, 5.6] },
      terminals: ['bp', 'bq', 'r1', 'r2'],
      slots: [
        { a: 'bp', b: 'bq', label: 'סוללה (− למטה)' },
        { a: 'r1', b: 'r2', label: 'חריץ לנגד' },
      ],
      parts: [
        { id: 'cd_fuse', kind: 'fuse', a: 'bq', b: 'f', rating: 4, label: 'נתיך 4A' },
        { id: 'cd_w1', kind: 'wire', a: 'f', b: 'r1', r: 0.01, label: 'חוט' },
        { id: 'cd_w2', kind: 'wire', a: 'r2', b: 'm', r: 0.01, label: 'חוט' },
        { id: 'cd_motor', kind: 'motor', a: 'm', b: 'mr', r: 2, label: 'מנוע 2Ω · צריך 2A לפחות' },
        { id: 'cd_ret', kind: 'wire', a: 'mr', b: 'bp', r: 0.01, label: 'חוט חזרה' },
      ],
    },
    {
      id: 'ch',
      name: 'תאורת האולם (מקביל)',
      color: 0x38e8ff,
      panel: 'ph',
      nodes: { n: [1, 6], p: [1, 1], f: [3.5, 1], t1: [6, 1], t2: [10, 1], a1: [6, 3], a2: [10, 3], u1: [6, 6], u2: [10, 6] },
      parts: [
        { id: 'ch_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'ch_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 3, label: 'נתיך 3A' },
        { id: 'ch_main', kind: 'wire', a: 'f', b: 't1', r: 0.01, label: 'חוט ראשי', cuttable: true },
        { id: 'ch_t12', kind: 'wire', a: 't1', b: 't2', r: 0.01, label: 'פס עליון' },
        { id: 'ch_w1', kind: 'wire', a: 't1', b: 'a1', r: 0.01, label: 'ענף מערבי', cuttable: true },
        { id: 'ch_w2', kind: 'wire', a: 't2', b: 'a2', r: 0.01, label: 'ענף מזרחי', cuttable: true },
        { id: 'ch_l1', kind: 'lamp', a: 'a1', b: 'u1', r: 12, label: 'מנורה מערבית' },
        { id: 'ch_l2', kind: 'lamp', a: 'a2', b: 'u2', r: 12, label: 'מנורה מזרחית' },
        { id: 'ch_u', kind: 'wire', a: 'u2', b: 'u1', r: 0.01, label: 'פס תחתון' },
        { id: 'ch_ret', kind: 'wire', a: 'u1', b: 'n', r: 0.01, label: 'חוט חזרה' },
      ],
    },
  ],
  panels: [
    { id: 'pd', tile: [9, 5], front: [9, 6], label: 'לוח מנוע הדלת', circuits: ['cd'] },
    { id: 'ph', tile: [0, 7], front: [1, 7], label: 'לוח תאורת האולם', circuits: ['ch'] },
  ],
  devices: [
    { kind: 'door', id: 'vault', part: 'cd_motor', tiles: [[10, 5], [11, 5]], threshold: 2, label: 'דלת הארכיון' },
    { kind: 'lamp', id: 'h1', part: 'ch_l1', tile: [5, 7], radius: 3.5, zone: 'hall', threshold: 0.3, style: 'ceiling' },
    { kind: 'lamp', id: 'h2', part: 'ch_l2', tile: [16, 7], radius: 3.5, zone: 'hall', threshold: 0.3, style: 'ceiling' },
  ],
  guards: [
    {
      id: 'g1',
      speed: 1.35,
      route: [
        { x: 3, y: 10, wait: 1.5, face: 0 },
        { x: 18, y: 10, wait: 1.5, face: -Math.PI / 2 },
        { x: 18, y: 7, wait: 1.5, face: Math.PI },
        { x: 3, y: 7, wait: 1.5, face: Math.PI / 2 },
      ],
    },
  ],
  exhibits: [{ id: 'dynamo', tile: [10, 1], name: 'הדינמו של פאראדיי', model: 'generator' }],
  bag: ['bat6', 'bat12', 'res3', 'res6', 'res12', 'coin', 'fuse'],
  checkpoints: [{ rect: [8, 1, 13, 4] }],
  hints: [
    { id: 'h1', when: 'inPanel', panel: 'pd', text: 'חוק אוהם: I = V ÷ R. בטור, R הכוללת = 2Ω של המנוע + מה שתשימו בחריץ הנגד. המנוע צריך לפחות 2A, והנתיך נשרף מעל 4A. חשבו לפני שמחברים — מנוע שמזמזם מושך את השומר.' },
    { id: 'h2', when: 'idle', text: 'נסו לחשב: 12V ÷ (2Ω + 3Ω) = ? ומה עם 6V ÷ (2Ω + 3Ω)?' },
  ],
  explain: {
    caught: 'השומר מקיף את האולם. מנוע חלש מזמזם ומושך אותו לדלת. חשבו את הזרם לפני שמחברים.',
    fire: 'בלי נתיך במסלול, זרם גדול מחמם את החוטים.',
  },
  parSeconds: 95,
};
