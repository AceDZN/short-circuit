import type { LevelDef } from '../sim/types';

// Heist 6 — transfer, no hints: a mixed parallel network on one fused bus with a power budget (P = V·I) and a decoy loop.
export const L6: LevelDef = {
  id: 'l6',
  index: 6,
  title: 'הכספת',
  subtitle: 'שוד הגמר — בלי רמזים',
  concept: 'כל הענפים מחוברים במקביל לאותו מתח, והזרם הכולל הוא סכום הזרמים בענפים. הנתיך הראשי נשרף מעל 5A — במתח של 12V זה תקציב הספק של P = V·I = 60W. כדי שהמנוע יקבל את שלו צריך לנתק עומסים — אבל לא את לולאת האזעקה האמיתית, ולא את האור שהשומר רואה.',
  theme: 'vault',
  noHints: true,
  map: [
    '########################', // 0
    '#########..g...#########', // 1  crown (11,1)
    '#########......#########', // 2
    '#########......#########', // 3
    '###########DD###########', // 4  vault door (11,4)(12,4)
    '##########....##########', // 5  laser
    '##########....##########', // 6
    '##########....##########', // 7  laser
    '#......................#', // 8
    '#......................#', // 9
    '#.....#..........#......', // 10 exit (23,10)
    '#......................#', // 11
    '#......................#', // 12
    '########################', // 13
  ],
  start: [1, 8],
  exit: [23, 10],
  zones: [{ id: 'post', name: 'עמדת השומר', rect: [9, 10, 15, 12], investigate: [12, 11], watchers: ['g1'] }],
  circuits: [
    {
      id: 'cv',
      name: 'פס הכספת · נתיך ראשי 5A',
      color: 0x8fb8ff,
      panel: 'pv',
      showPower: true,
      nodes: {
        n: [0.8, 6.4], p: [0.8, 0.6], f: [2.2, 0.6],
        t1: [3.4, 0.6], t2: [4.9, 0.6], t3: [6.4, 0.6], t4: [7.9, 0.6], t5: [9.4, 0.6], t6: [10.9, 0.6],
        la: [3.4, 2], a1: [4.9, 1.8], a2: [4.9, 3], a3: [4.9, 4.2], b1: [6.4, 1.8], b2: [6.4, 3], b3: [6.4, 4.2], c1: [7.9, 2.4], g1: [9.4, 2.4], m1: [10.9, 2], m2: [10.9, 3.4],
        u1: [3.4, 6.4], u2: [4.9, 6.4], u3: [6.4, 6.4], u4: [7.9, 6.4], u5: [9.4, 6.4], u6: [10.9, 6.4],
      },
      terminals: ['m1', 'm2', 'u6'],
      slots: [{ a: 'm1', b: 'm2', label: 'חיבור המנוע' }],
      parts: [
        { id: 'cv_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללות 12V' },
        { id: 'cv_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 5, label: 'נתיך ראשי 5A' },
        { id: 'cv_main', kind: 'wire', a: 'f', b: 't1', r: 0.01, label: 'חוט ראשי', cuttable: true },
        { id: 'cv_t12', kind: 'wire', a: 't1', b: 't2', r: 0.01, label: 'פס' },
        { id: 'cv_t23', kind: 'wire', a: 't2', b: 't3', r: 0.01, label: 'פס' },
        { id: 'cv_t34', kind: 'wire', a: 't3', b: 't4', r: 0.01, label: 'פס' },
        { id: 'cv_t45', kind: 'wire', a: 't4', b: 't5', r: 0.01, label: 'פס' },
        { id: 'cv_t56', kind: 'wire', a: 't5', b: 't6', r: 0.01, label: 'פס' },
        { id: 'cv_wl', kind: 'wire', a: 't1', b: 'la', r: 0.01, label: 'ענף 1', cuttable: true },
        { id: 'cv_las', kind: 'laser', a: 'la', b: 'u1', r: 6, label: 'רשת לייזרים' },
        { id: 'cv_wa', kind: 'wire', a: 't2', b: 'a1', r: 0.01, label: 'ענף 2', cuttable: true },
        { id: 'cv_sa1', kind: 'sensor', a: 'a1', b: 'a2', r: 0.05, label: 'חיישן' },
        { id: 'cv_sa2', kind: 'sensor', a: 'a2', b: 'a3', r: 0.05, label: 'חיישן' },
        { id: 'cv_relay', kind: 'relay', a: 'a3', b: 'u2', r: 24, label: 'לולאה A' },
        { id: 'cv_wb', kind: 'wire', a: 't3', b: 'b1', r: 0.01, label: 'ענף 3', cuttable: true },
        { id: 'cv_sb1', kind: 'sensor', a: 'b1', b: 'b2', r: 0.05, label: 'חיישן' },
        { id: 'cv_sb2', kind: 'sensor', a: 'b2', b: 'b3', r: 0.05, label: 'חיישן' },
        { id: 'cv_buzz', kind: 'buzzer', a: 'b3', b: 'u3', r: 8, label: 'לולאה B' },
        { id: 'cv_wc', kind: 'wire', a: 't4', b: 'c1', r: 0.01, label: 'ענף 4', cuttable: true },
        { id: 'cv_cam', kind: 'camera', a: 'c1', b: 'u4', r: 24, label: 'מצלמה' },
        { id: 'cv_wg', kind: 'wire', a: 't5', b: 'g1', r: 0.01, label: 'ענף 5', cuttable: true },
        { id: 'cv_post', kind: 'lamp', a: 'g1', b: 'u5', r: 24, label: 'אור עמדת השומר' },
        { id: 'cv_wm', kind: 'wire', a: 't6', b: 'm1', r: 0.01, label: 'ענף 6' },
        { id: 'cv_motor', kind: 'motor', a: 'm2', b: 'u6', r: 4, label: 'מנוע הכספת 4Ω · צריך 2.5A' },
        { id: 'cv_u65', kind: 'wire', a: 'u6', b: 'u5', r: 0.01, label: 'חזרה' },
        { id: 'cv_u54', kind: 'wire', a: 'u5', b: 'u4', r: 0.01, label: 'חזרה' },
        { id: 'cv_u43', kind: 'wire', a: 'u4', b: 'u3', r: 0.01, label: 'חזרה' },
        { id: 'cv_u32', kind: 'wire', a: 'u3', b: 'u2', r: 0.01, label: 'חזרה' },
        { id: 'cv_u21', kind: 'wire', a: 'u2', b: 'u1', r: 0.01, label: 'חזרה' },
        { id: 'cv_ret', kind: 'wire', a: 'u1', b: 'n', r: 0.01, label: 'חזרה' },
      ],
    },
  ],
  panels: [{ id: 'pv', tile: [5, 7], front: [5, 8], label: 'לוח הכספת', circuits: ['cv'] }],
  devices: [
    { kind: 'laser', id: 'laserA', part: 'cv_las', from: [9, 5], to: [14, 5], threshold: 0.5 },
    { kind: 'laser', id: 'laserB', part: 'cv_las', from: [9, 7], to: [14, 7], threshold: 0.5 },
    { kind: 'alarm', id: 'siren', part: 'cv_relay', tile: [20, 7], threshold: 0.3 },
    { kind: 'lamp', id: 'sign', part: 'cv_buzz', tile: [2, 12], radius: 1.6, zone: 'deco', threshold: 0.3, style: 'display' },
    { kind: 'camera', id: 'cam', part: 'cv_cam', tile: [16, 7], facing: (3 * Math.PI) / 4, sweep: 0.5, period: 6, range: 8, threshold: 0.2 },
    { kind: 'door', id: 'vaultdoor', part: 'cv_motor', tiles: [[11, 4], [12, 4]], threshold: 2.5, label: 'דלת הכספת' },
    { kind: 'lamp', id: 'postlamp', part: 'cv_post', tile: [12, 13], radius: 3, zone: 'post', threshold: 0.3, style: 'wall' },
  ],
  guards: [
    {
      id: 'g1',
      speed: 1.4,
      route: [
        { x: 3, y: 11, wait: 2, face: 0 },
        { x: 21, y: 11, wait: 2, face: Math.PI },
      ],
    },
  ],
  exhibits: [{ id: 'crown', tile: [11, 1], name: 'כתר המלכה', model: 'crown' }],
  bag: ['wire', 'res6'],
  alwaysLit: [[9, 8, 14, 9]],
  hints: [],
  explain: {
    alarm: 'לולאת האזעקה האמיתית מחוברת לבקר שליד הסירנה. כשהזרם בה נעצר — מכל סיבה, גם כשהנתיך הראשי נשרף — האזעקה פועלת.',
    camera: 'גם המצלמה היא ענף על הפס. מנותקת — היא לא רואה.',
    trapped: 'כשהשומר תיקן את הלוח הוא הוציא את החוט של המנוע — הדלת איבדה זרם ונסגרה. כיבוי האור בעמדת השומר מזמין אותו ללוח.',
    laser: 'הלייזרים הם ענף על הפס. בלי זרם — אין קרן.',
    caught: 'השומר עובר לאורך האולם. מתחת לפתח המסדרון מואר.',
  },
  parSeconds: 110,
};
