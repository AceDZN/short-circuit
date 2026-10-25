import type { LevelDef } from '../sim/types';

// Heist 5 — a deliberate short circuit melts the series fuse; wet skin and live wires don't mix.
export const L5: LevelDef = {
  id: 'l5',
  index: 5,
  title: 'האפלה',
  subtitle: 'קצר, נתיך ובטיחות',
  concept: 'קצר הוא מסלול כמעט בלי התנגדות: הזרם עצום, והנתיך שמחובר בטור נשרף ופותח את המעגל. בלי נתיך — החוטים מתלהטים. ומים מורידים את ההתנגדות של הגוף — לכן מים וחשמל לא הולכים יחד. ובעולם האמיתי: לעולם לא יוצרים קצר ברשת החשמל — זה גורם לקשת חשמלית, כוויות ושריפה.',
  theme: 'museum',
  map: [
    '##########################', // 0
    '###################......#', // 1
    '###################..bb..#', // 2  monitor desk
    '###################......#', // 3
    '###################......#', // 4
    '#.g..###############.#####', // 5  exhibit (2,5), guard room door (20,5)
    '#....#########...........#', // 6
    '#......~~................#', // 7  puddle (7..8, 7..8)
    '#......~~.................', // 8  exit (25,8)
    '#....#########...........#', // 9
    '#....#########...........#', // 10
    '##########################', // 11
  ],
  start: [23, 9],
  startFacing: Math.PI,
  exit: [25, 8],
  zones: [
    { id: 'wing', name: 'האגף המערבי', rect: [5, 7, 13, 8], investigate: [10, 7], watchers: [] },
    { id: 'room', name: 'חדר התצוגה', rect: [1, 5, 4, 10], investigate: [2, 7], watchers: [] },
  ],
  circuits: [
    {
      id: 'cw',
      name: 'רשת החשמל — האגף המערבי',
      color: 0xffe04a,
      panel: 'pw',
      nodes: {
        n: [1, 3.9], p: [1, 0.6], f: [2.6, 0.6], c: [4.2, 0.6],
        b1: [5.6, 0.6], b2: [7, 0.6], b3: [8.4, 0.6], b4: [9.8, 0.6], b5: [11.2, 0.6],
        d1: [5.6, 3.9], d2: [7, 3.9], d3: [8.4, 3.9], d4: [9.8, 3.9], d5: [11.2, 3.9],
      },
      terminals: ['b1', 'd1'],
      parts: [
        { id: 'cw_mains', kind: 'mains', a: 'n', b: 'p', v: 220, label: 'רשת 220V' },
        { id: 'cw_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 10, label: 'נתיך 10A', panel: 'fb' },
        { id: 'cw_cable', kind: 'cable', a: 'f', b: 'c', r: 0.02, label: 'כבל חשוף (מעל השלולית)' },
        { id: 'cw_bus', kind: 'wire', a: 'c', b: 'b1', r: 0.01, label: 'חוט הזינה' },
        { id: 'cw_b12', kind: 'wire', a: 'b1', b: 'b2', r: 0.01, label: 'חוט הזינה' },
        { id: 'cw_b23', kind: 'wire', a: 'b2', b: 'b3', r: 0.01, label: 'חוט הזינה' },
        { id: 'cw_b34', kind: 'wire', a: 'b3', b: 'b4', r: 0.01, label: 'חוט הזינה' },
        { id: 'cw_b45', kind: 'wire', a: 'b4', b: 'b5', r: 0.01, label: 'חוט הזינה' },
        { id: 'cw_l1', kind: 'lamp', a: 'b1', b: 'd1', r: 484, label: 'מנורה 1' },
        { id: 'cw_l2', kind: 'lamp', a: 'b2', b: 'd2', r: 484, label: 'מנורה 2' },
        { id: 'cw_l3', kind: 'lamp', a: 'b3', b: 'd3', r: 484, label: 'מנורת החדר' },
        { id: 'cw_cam1', kind: 'camera', a: 'b4', b: 'd4', r: 1100, label: 'מצלמת מסדרון' },
        { id: 'cw_cam2', kind: 'camera', a: 'b5', b: 'd5', r: 1100, label: 'מצלמת חדר' },
        { id: 'cw_d54', kind: 'wire', a: 'd5', b: 'd4', r: 0.01, label: 'חוט החזרה' },
        { id: 'cw_d43', kind: 'wire', a: 'd4', b: 'd3', r: 0.01, label: 'חוט החזרה' },
        { id: 'cw_d32', kind: 'wire', a: 'd3', b: 'd2', r: 0.01, label: 'חוט החזרה' },
        { id: 'cw_d21', kind: 'wire', a: 'd2', b: 'd1', r: 0.01, label: 'חוט החזרה' },
        { id: 'cw_ret', kind: 'wire', a: 'd1', b: 'n', r: 0.01, label: 'חוט החזרה' },
      ],
    },
    {
      id: 'ce',
      name: 'תאורת חירום (בלי נתיך!)',
      color: 0x7dffb0,
      panel: 'pw',
      nodes: { en: [1, 6.8], ep: [1, 5], el: [8, 5], er: [8, 6.8] },
      terminals: ['ep', 'en'],
      parts: [
        { id: 'ce_bat', kind: 'battery', a: 'en', b: 'ep', v: 12, label: 'סוללה 12V' },
        { id: 'ce_w', kind: 'wire', a: 'ep', b: 'el', r: 0.01, label: 'חוט' },
        { id: 'ce_lamp', kind: 'lamp', a: 'el', b: 'er', r: 24, label: 'מנורת חירום' },
        { id: 'ce_ret', kind: 'wire', a: 'er', b: 'en', r: 0.01, label: 'חוט חזרה' },
      ],
    },
  ],
  panels: [
    { id: 'pw', tile: [12, 6], front: [12, 7], label: 'קופסת החיבורים של האגף', circuits: ['cw', 'ce'] },
    { id: 'fb', tile: [18, 2], front: [19, 2], label: 'ארון הנתיכים', circuits: ['cw'], style: 'fusebox' },
  ],
  devices: [
    { kind: 'lamp', id: 'w1', part: 'cw_l1', tile: [11, 7], radius: 3, zone: 'wing', threshold: 0.1, style: 'ceiling' },
    { kind: 'lamp', id: 'w2', part: 'cw_l2', tile: [5, 7], radius: 3, zone: 'wing', threshold: 0.1, style: 'ceiling' },
    { kind: 'lamp', id: 'w3', part: 'cw_l3', tile: [3, 8], radius: 3, zone: 'room', threshold: 0.1, style: 'ceiling' },
    { kind: 'lamp', id: 'e1', part: 'ce_lamp', tile: [0, 6], radius: 2.2, zone: 'room', threshold: 0.2, style: 'wall' },
    { kind: 'camera', id: 'cam1', part: 'cw_cam1', tile: [9, 6], facing: Math.PI, sweep: 0.22, period: 6, range: 8, threshold: 0.1 },
    { kind: 'camera', id: 'cam2', part: 'cw_cam2', tile: [3, 4], facing: Math.PI / 2, sweep: 0.55, period: 5, range: 6.5, threshold: 0.1 },
    { kind: 'hazard', id: 'puddle', part: 'cw_cable', tiles: [[7, 7], [8, 7], [7, 8], [8, 8]], threshold: 30, liveNode: 'c', refNode: 'n' },
  ],
  guards: [{ id: 'g1', route: [{ x: 22, y: 3, wait: 1e9, face: -Math.PI / 2 }] }],
  exhibits: [{ id: 'arc', tile: [2, 5], name: 'נורת הקשת', model: 'bulb', zone: 'room' }],
  bag: ['wire', 'ruler'],
  hints: [
    { id: 'h1', when: 'inPanel', panel: 'pw', text: 'קצר = מוליך שמחבר ישירות בין חוט הזינה לחוט החזרה. ההתנגדות כמעט אפס ← הזרם עצום ← הנתיך שבטור נשרף ומנתק את כל האגף: מנורות, מצלמות וגם הכבל החשוף.' },
    { id: 'h2', when: 'afterFail', fail: 'shock', text: 'לפני שעוברים בשלולית — חייבים לנתק את הזרם מהכבל החשוף.' },
    { id: 'h3', when: 'afterFail', fail: 'fire', text: 'במעגל תאורת החירום אין נתיך. קצר שם רק מחמם את החוטים. במעגל הרשת יש נתיך שנשרף ומגן.' },
    { id: 'h4', when: 'afterFail', fail: 'camera', text: 'כשהשומר מחליף את הנתיך הכול חוזר לפעול. אם הקצר נשאר במקומו, הנתיך החדש נשרף שוב והשומר צריך ללכת לחפש אותו — עוד זמן בשבילכם.' },
  ],
  explain: {
    shock: 'מים מורידים מאוד את ההתנגדות של הגוף. לפי חוק אוהם I = V ÷ R: עור יבש ≈ 100,000Ω ← 220V ÷ 100,000Ω ≈ 2 mA. עור רטוב ≈ 1,000Ω ← 220V ÷ 1,000Ω = 220 mA — מסוכן מאוד. לעולם לא נוגעים בחשמל בידיים רטובות.',
    fire: 'קצר במעגל בלי נתיך: ההתנגדות כמעט אפס, הזרם עצום, והחוטים מתלהטים. בדיוק בשביל זה מחברים נתיך בטור — הוא נשרף ראשון ופותח את המעגל.',
    camera: 'המצלמות פועלות על רשת החשמל של האגף. כשהנתיך תקין — הן רואות.',
  },
  parSeconds: 80,
};
