import type { LevelDef } from '../sim/types';

// Heist 2 — parallel corridor lights vs a series display string.
export const L2: LevelDef = {
  id: 'l2',
  index: 2,
  title: 'גלריית האורות',
  subtitle: 'טור ומקביל',
  concept: 'במקביל לכל נורה ענף משלה — מכבים אחת והשאר דולקות. בטור יש מסלול אחד — נורה אחת יוצאת וכולן כבות, אלא אם נותנים לזרם דרך עוקפת.',
  theme: 'museum',
  map: [
    '#########################', // 0
    '#########################', // 1
    '#.................#######', // 2
    '#.................#######', // 3
    '###########..############', // 4
    '####................#####', // 5
    '####................#####', // 6
    '####................#####', // 7
    '####.......g........#####', // 8
    '####...g.......g....#####', // 9  decorative cases
    '####................#####', // 10
    '####....................#', // 11  exit (23,11)
    '####................#####', // 12
    '#########################', // 13
  ],
  start: [1, 3],
  exit: [23, 11],
  zones: [
    { id: 'corridor', name: 'המסדרון', rect: [1, 2, 17, 3], investigate: [10, 3], watchers: ['g1'] },
    { id: 'gallery', name: 'הגלריה', rect: [4, 5, 19, 12], investigate: [11, 7], watchers: ['g2'] },
  ],
  circuits: [
    {
      id: 'cc',
      name: 'תאורת המסדרון (מקביל)',
      color: 0x38e8ff,
      panel: 'pc',
      nodes: {
        n: [1, 6.2], p: [1, 0.8], f: [3, 0.8],
        t1: [5, 0.8], t2: [8, 0.8], t3: [11, 0.8],
        a1: [5, 2.6], a2: [8, 2.6], a3: [11, 2.6],
        u1: [5, 6.2], u2: [8, 6.2], u3: [11, 6.2],
      },
      parts: [
        { id: 'cc_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'cc_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 5, label: 'נתיך 5A' },
        { id: 'cc_main', kind: 'wire', a: 'f', b: 't1', r: 0.01, label: 'חוט ראשי', cuttable: true },
        { id: 'cc_t12', kind: 'wire', a: 't1', b: 't2', r: 0.01, label: 'פס עליון', cuttable: true },
        { id: 'cc_t23', kind: 'wire', a: 't2', b: 't3', r: 0.01, label: 'פס עליון', cuttable: true },
        { id: 'cc_w1', kind: 'wire', a: 't1', b: 'a1', r: 0.01, label: 'ענף 1', cuttable: true },
        { id: 'cc_w2', kind: 'wire', a: 't2', b: 'a2', r: 0.01, label: 'ענף 2', cuttable: true },
        { id: 'cc_w3', kind: 'wire', a: 't3', b: 'a3', r: 0.01, label: 'ענף 3', cuttable: true },
        { id: 'cc_l1', kind: 'lamp', a: 'a1', b: 'u1', r: 12, label: 'מנורה מערבית' },
        { id: 'cc_l2', kind: 'lamp', a: 'a2', b: 'u2', r: 12, label: 'מנורה ליד הגלריה' },
        { id: 'cc_l3', kind: 'lamp', a: 'a3', b: 'u3', r: 12, label: 'מנורה מזרחית' },
        { id: 'cc_u32', kind: 'wire', a: 'u3', b: 'u2', r: 0.01, label: 'פס תחתון' },
        { id: 'cc_u21', kind: 'wire', a: 'u2', b: 'u1', r: 0.01, label: 'פס תחתון' },
        { id: 'cc_ret', kind: 'wire', a: 'u1', b: 'n', r: 0.01, label: 'חוט חזרה' },
      ],
    },
    {
      id: 'cg',
      name: 'נורות התצוגה (טור)',
      color: 0xffc04a,
      panel: 'pg',
      nodes: { n: [1, 6.2], p: [1, 0.8], f: [3, 0.8], s0: [4.5, 0.8], s1: [7, 0.8], s2: [9.5, 0.8], s3: [11.5, 0.8], s4: [11.5, 6.2], s5: [6, 6.2] },
      parts: [
        { id: 'cg_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'cg_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 2, label: 'נתיך 2A' },
        { id: 'cg_w0', kind: 'wire', a: 'f', b: 's0', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'cg_d1', kind: 'lamp', a: 's0', b: 's1', r: 12, label: 'נורת תצוגה 1' },
        { id: 'cg_gem', kind: 'lamp', a: 's1', b: 's2', r: 12, label: 'הנורה של אדיסון' },
        { id: 'cg_d3', kind: 'lamp', a: 's2', b: 's3', r: 12, label: 'נורת תצוגה 2' },
        { id: 'cg_w3', kind: 'wire', a: 's3', b: 's4', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'cg_d4', kind: 'lamp', a: 's4', b: 's5', r: 12, label: 'נורת תצוגה 3' },
        { id: 'cg_ret', kind: 'wire', a: 's5', b: 'n', r: 0.01, label: 'חוט חזרה' },
      ],
    },
  ],
  panels: [
    { id: 'pc', tile: [0, 2], front: [1, 2], label: 'לוח המסדרון', circuits: ['cc'] },
    { id: 'pg', tile: [3, 8], front: [4, 8], label: 'לוח הגלריה', circuits: ['cg'] },
  ],
  devices: [
    { kind: 'lamp', id: 'c1', part: 'cc_l1', tile: [4, 2], radius: 3, zone: 'corridor', threshold: 0.3, style: 'ceiling' },
    { kind: 'lamp', id: 'c2', part: 'cc_l2', tile: [10, 2], radius: 3, zone: 'corridor', threshold: 0.3, style: 'ceiling' },
    { kind: 'lamp', id: 'c3', part: 'cc_l3', tile: [16, 2], radius: 2.8, zone: 'corridor', threshold: 0.3, style: 'ceiling' },
    { kind: 'lamp', id: 'd1', part: 'cg_d1', tile: [9, 7], radius: 3.2, zone: 'gallery', threshold: 0.12, style: 'display' },
    { kind: 'lamp', id: 'd3', part: 'cg_d3', tile: [13, 7], radius: 3.2, zone: 'gallery', threshold: 0.12, style: 'display' },
    { kind: 'lamp', id: 'd4', part: 'cg_d4', tile: [11, 10], radius: 3.2, zone: 'gallery', threshold: 0.12, style: 'display' },
  ],
  guards: [
    { id: 'g1', route: [{ x: 15, y: 2, wait: 1e9, face: Math.PI }] },
    {
      id: 'g2',
      route: [
        { x: 5, y: 6, wait: 1.2, face: 0 },
        { x: 18, y: 6, wait: 1.2, face: Math.PI / 2 },
        { x: 18, y: 11, wait: 1.2, face: Math.PI },
        { x: 5, y: 11, wait: 1.2, face: -Math.PI / 2 },
      ],
    },
  ],
  exhibits: [{ id: 'gem', tile: [11, 8], name: 'הנורה של אדיסון', model: 'bulb', part: 'cg_gem', zone: 'gallery' }],
  bag: ['wire'],
  checkpoints: [{ rect: [11, 5, 12, 5] }],
  props: [
    { tile: [7, 9], model: 'pile' },
    { tile: [15, 9], model: 'coil' },
  ],
  hints: [
    { id: 'h1', when: 'inPanel', panel: 'pc', text: 'הנורות במסדרון מחוברות במקביל: לכל נורה ענף משלה. אפשר לכבות רק את הנורה שמאירה את הכניסה לגלריה.' },
    { id: 'h2', when: 'afterFail', fail: 'caught', text: 'השומר בקצה המסדרון רואה רחוק כשמואר. סרקו: איזו נורה מאירה את הדלת לגלריה? חתכו רק את הענף שלה.' },
    { id: 'h3', when: 'inPanel', panel: 'pg', text: 'נורות התצוגה מחוברות בטור — לזרם יש מסלול אחד. אם מוציאים נורה אחת, כולן כבות. תנו לזרם דרך עוקפת לפני שלוקחים אותה.' },
    { id: 'h4', when: 'afterFail', fail: 'pedestal', text: 'חברו את החוט המגשר בין שני המחברים של הנורה של אדיסון (במקביל אליה). כך הזרם ימשיך לזרום גם בלעדיה.' },
  ],
  explain: {
    pedestal: 'בחיבור טורי יש לזרם מסלול אחד בלבד. הוצאתם נורה ← המסלול נקטע ← כל נורות התצוגה כבו, והשומר בא לבדוק למה חשוך.',
    caught: 'באור השומר רואה רחוק. הנורות במסדרון מחוברות במקביל, כך שאפשר לכבות רק את הנורה שמעל הדלת — בלי שהמסדרון כולו יחשיך.',
  },
  parSeconds: 100,
};
