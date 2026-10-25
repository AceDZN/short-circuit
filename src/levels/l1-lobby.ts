import type { LevelDef } from '../sim/types';

// Heist 1 — closed vs open circuits, conductors vs insulators.
export const L1: LevelDef = {
  id: 'l1',
  index: 1,
  title: 'הלובי',
  subtitle: 'מעגל סגור, מעגל פתוח',
  concept: 'נורה ומצלמה עובדות רק במעגל סגור. מוליך סוגר פער, מבודד לא.',
  theme: 'museum',
  map: [
    '########################', // 0
    '########################', // 1
    '######..........#..#...#', // 2
    '######..........#..#....', // 3  exit (23,3)
    '######..bbbbb...#..D...#', // 4  desk, door (19,4)
    '######..........#..#.g.#', // 5  exhibit (21,5)
    '#....#..........#..#####', // 6
    '#..................#####', // 7
    '#..................#####', // 8
    '#....#..........#..#####', // 9
    '########################', // 10
  ],
  start: [2, 8],
  startFacing: 0,
  exit: [23, 3],
  zones: [
    { id: 'lobby', name: 'הלובי', rect: [6, 2, 15, 9], investigate: [9, 7], watchers: ['g1'] },
    { id: 'exroom', name: 'חדר התצוגה', rect: [20, 2, 22, 5], investigate: [21, 3], watchers: [] },
  ],
  circuits: [
    {
      id: 'c1',
      name: 'תאורת הלובי',
      color: 0x38e8ff,
      panel: 'p1',
      nodes: { n: [1, 3.2], p: [1, 0.8], f: [4, 0.8], l: [10, 0.8], r: [10, 3.2] },
      parts: [
        { id: 'c1_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'c1_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 3, label: 'נתיך 3A' },
        { id: 'c1_w', kind: 'wire', a: 'f', b: 'l', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'c1_lamp', kind: 'lamp', a: 'l', b: 'r', r: 12, label: 'נברשת הלובי' },
        { id: 'c1_ret', kind: 'wire', a: 'r', b: 'n', r: 0.01, label: 'חוט חזרה', cuttable: true },
      ],
    },
    {
      id: 'c2',
      name: 'מצלמת המסדרון',
      color: 0x7dffb0,
      panel: 'p1',
      nodes: { n: [1, 6.2], p: [1, 4.2], f: [4, 4.2], l: [10, 4.2], r: [10, 6.2] },
      parts: [
        { id: 'c2_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'c2_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 2, label: 'נתיך 2A' },
        { id: 'c2_w', kind: 'wire', a: 'f', b: 'l', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'c2_cam', kind: 'camera', a: 'l', b: 'r', r: 24, label: 'מצלמה' },
        { id: 'c2_ret', kind: 'wire', a: 'r', b: 'n', r: 0.01, label: 'חוט חזרה', cuttable: true },
      ],
    },
    {
      id: 'c3',
      name: 'מנוע הדלת',
      color: 0xffc04a,
      panel: 'p2',
      nodes: { n: [1, 5.5], p: [1, 1.5], f: [3.5, 1.5], g1: [6, 1.5], g2: [8, 1.5], m: [10.5, 1.5], r: [10.5, 5.5] },
      terminals: ['g1', 'g2', 'n'],
      parts: [
        { id: 'c3_bat', kind: 'battery', a: 'n', b: 'p', v: 6, label: 'סוללה 6V' },
        { id: 'c3_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 3, label: 'נתיך 3A' },
        { id: 'c3_w', kind: 'wire', a: 'f', b: 'g1', r: 0.01, label: 'חוט' },
        { id: 'c3_w2', kind: 'wire', a: 'g2', b: 'm', r: 0.01, label: 'חוט' },
        { id: 'c3_motor', kind: 'motor', a: 'm', b: 'r', r: 4, label: 'מנוע הדלת' },
        { id: 'c3_ret', kind: 'wire', a: 'r', b: 'n', r: 0.01, label: 'חוט חזרה' },
      ],
    },
  ],
  panels: [
    { id: 'p1', tile: [0, 7], front: [1, 7], label: 'לוח החשמל של הלובי', circuits: ['c1', 'c2'] },
    { id: 'p2', tile: [19, 6], front: [18, 6], label: 'לוח הדלת', circuits: ['c3'] },
  ],
  devices: [
    { kind: 'lamp', id: 'lamp_lobby', part: 'c1_lamp', tile: [10, 6], radius: 6.5, zone: 'lobby', threshold: 0.3, style: 'chandelier' },
    { kind: 'camera', id: 'cam1', part: 'c2_cam', tile: [17, 1], facing: Math.PI / 2, sweep: 0.35, period: 5, range: 9, threshold: 0.2 },
    { kind: 'door', id: 'door1', part: 'c3_motor', tiles: [[19, 4]], threshold: 1, label: 'דלת חדר התצוגה' },
  ],
  guards: [{ id: 'g1', route: [{ x: 10, y: 3, wait: 1e9, face: Math.PI / 2 }] }],
  exhibits: [{ id: 'volta', tile: [21, 5], name: 'ערמת וולטה', model: 'pile', zone: 'exroom' }],
  bag: ['glove', 'coin'],
  alwaysLit: [[20, 2, 22, 5]],
  checkpoints: [{ rect: [17, 2, 18, 9] }],
  hints: [
    { id: 'h1', when: 'start', text: 'החזיקו רווח (או כפתור הסורק) כדי לראות את החוטים בתוך הקירות.' },
    { id: 'h2', when: 'nearPanel', panel: 'p1', text: 'לוח חשמל! לחצו E כדי לפתוח אותו.' },
    { id: 'h3', when: 'inPanel', panel: 'p1', text: 'נורה דולקת רק כשהמעגל סגור. חתכו חוט במעגל של הנברשת — המעגל נפתח והלובי מחשיך.' },
    { id: 'h4', when: 'afterFail', fail: 'camera', text: 'גם המצלמה היא מעגל בלוח שבכניסה. בלי מעגל סגור אין זרם, ובלי זרם היא לא רואה.' },
    { id: 'h5', when: 'inPanel', panel: 'p2', text: 'במעגל של הדלת יש פער. מה יסגור אותו: גומי או מתכת?' },
    { id: 'h6', when: 'afterFail', fail: 'caught', text: 'כשהאור כבה, השומר בא לתקן את הלוח. בחושך הוא רואה רק בקרן הפנס שלו. עקפו אותו.' },
  ],
  explain: {
    caught: 'באור השומר רואה רחוק. בחושך הוא רואה רק מה שהפנס מאיר. כבו את האור: פתחו את המעגל של הנברשת.',
    camera: 'המצלמה פועלת רק כשעובר בה זרם. חתכו חוט במעגל שלה. מעגל פתוח = אין זרם.',
    fire: 'מוליך שמחובר ישר בין שני קוטבי הסוללה יוצר קצר: ההתנגדות כמעט אפס, הזרם עצום והחוטים מתלהטים.',
  },
  parSeconds: 75,
};
