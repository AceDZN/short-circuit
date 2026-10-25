import type { LevelDef } from '../sim/types';

// Heist 3 — a series alarm loop: bridge before you open.
export const L3: LevelDef = {
  id: 'l3',
  index: 3,
  title: 'לולאת האזעקה',
  subtitle: 'מעגל טורי וגישור במקביל',
  concept: 'בלולאה טורית אותו זרם עובר בכל החיישנים. פתיחת חלון קוטעת את הלולאה כולה — אלא אם קודם מחברים מוליך במקביל לחיישן. גרפיט הוא אל-מתכת שמוליכה.',
  theme: 'courtyard',
  map: [
    '########################', // 0
    '######.....g.....#######', // 1
    '######...........#######', // 2
    '######...........#######', // 3
    '######...........#######', // 4
    '######...........#######', // 5
    '########W##W##W#########', // 6
    '#,,,,,,,,,,,,,,,,,,,,,,#', // 7
    '#,,,,,,,,,,,,,,,,,,,,,,#', // 8
    '#,,,,,,,,,,,,,,,,,,,,,,#', // 9
    '#,,,,,bb,,,,,,,bb,,,,,,,', // 10 exit (23,10)
    '#,,,,,,,,,,,,,,,,,,,,,,#', // 11
    '#,,,,,,,,,,,,,,,,,,,,,,#', // 12
    '#,,,,,,,,,,,,,,,,,,,,,,#', // 13
    '########################', // 14
  ],
  start: [2, 12],
  startFacing: -Math.PI / 2,
  exit: [23, 10],
  zones: [],
  circuits: [
    {
      id: 'ca',
      name: 'לולאת האזעקה (טור)',
      color: 0xff5a7a,
      panel: 'pa',
      nodes: {
        n: [1, 6.2], p: [1, 0.8], f: [2.6, 0.8],
        s1a: [3.8, 0.8], s1b: [5.2, 0.8], s2a: [6.4, 0.8], s2b: [7.8, 0.8], s3a: [9, 0.8], s3b: [10.4, 0.8],
        k: [11.5, 0.8], h: [11.5, 6.2], r: [6, 6.2],
      },
      parts: [
        { id: 'ca_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'ca_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 1, label: 'נתיך 1A' },
        { id: 'ca_w0', kind: 'wire', a: 'f', b: 's1a', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'ca_s1', kind: 'sensor', a: 's1a', b: 's1b', r: 0.05, label: 'חיישן חלון 1' },
        { id: 'ca_w1', kind: 'wire', a: 's1b', b: 's2a', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'ca_s2', kind: 'sensor', a: 's2a', b: 's2b', r: 0.05, label: 'חיישן חלון 2' },
        { id: 'ca_w2', kind: 'wire', a: 's2b', b: 's3a', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'ca_s3', kind: 'sensor', a: 's3a', b: 's3b', r: 0.05, label: 'חיישן חלון 3' },
        { id: 'ca_w3', kind: 'wire', a: 's3b', b: 'k', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'ca_w4', kind: 'wire', a: 'k', b: 'h', r: 0.01, label: 'חוט' },
        { id: 'ca_relay', kind: 'relay', a: 'h', b: 'r', r: 24, label: 'בקר אזעקה' },
        { id: 'ca_ret', kind: 'wire', a: 'r', b: 'n', r: 0.01, label: 'חוט חזרה' },
      ],
    },
    {
      id: 'cl',
      name: 'קרני הלייזר',
      color: 0xff3030,
      panel: 'pl',
      nodes: { n: [2, 5.5], p: [2, 1.5], f: [5, 1.5], l: [10, 1.5], r: [10, 5.5] },
      parts: [
        { id: 'cl_bat', kind: 'battery', a: 'n', b: 'p', v: 12, label: 'סוללה 12V' },
        { id: 'cl_fuse', kind: 'fuse', a: 'p', b: 'f', rating: 2, label: 'נתיך 2A' },
        { id: 'cl_w', kind: 'wire', a: 'f', b: 'l', r: 0.01, label: 'חוט', cuttable: true },
        { id: 'cl_laser', kind: 'laser', a: 'l', b: 'r', r: 12, label: 'לייזר' },
        { id: 'cl_ret', kind: 'wire', a: 'r', b: 'n', r: 0.01, label: 'חוט חזרה', cuttable: true },
      ],
    },
  ],
  panels: [
    { id: 'pa', tile: [4, 6], front: [4, 7], label: 'קופסת האזעקה', circuits: ['ca'] },
    { id: 'pl', tile: [5, 4], front: [6, 4], label: 'לוח הלייזרים', circuits: ['cl'] },
  ],
  devices: [
    { kind: 'window', id: 'w1', part: 'ca_s1', tile: [8, 6] },
    { kind: 'window', id: 'w2', part: 'ca_s2', tile: [11, 6] },
    { kind: 'window', id: 'w3', part: 'ca_s3', tile: [14, 6] },
    { kind: 'alarm', id: 'siren', part: 'ca_relay', tile: [17, 6], threshold: 0.3 },
    { kind: 'laser', id: 'laser1', part: 'cl_laser', from: [5, 3], to: [17, 3], threshold: 0.3 },
  ],
  guards: [
    {
      id: 'g1',
      speed: 1.3,
      route: [
        { x: 2, y: 9, wait: 2.5, face: 0 },
        { x: 21, y: 9, wait: 2.5, face: Math.PI },
      ],
    },
  ],
  exhibits: [{ id: 'coil', tile: [11, 1], name: 'סליל טסלה', model: 'coil' }],
  bag: ['rubberBand', 'ruler', 'pencil'],
  alwaysLit: [[19, 8, 22, 12]],
  checkpoints: [{ rect: [6, 4, 16, 5] }],
  hints: [
    { id: 'h1', when: 'inPanel', panel: 'pa', text: 'הלולאה מחוברת בטור: אותו זרם עובר בכל החיישנים ובבקר. פותחים חלון ← המגע נפרד ← הלולאה כולה נפתחת ← אזעקה.' },
    { id: 'h2', when: 'afterFail', fail: 'alarm', text: 'קודם תנו לזרם דרך עוקפת סביב החיישן של החלון — מוליך בין שני המחברים שלו, במקביל אליו. רק אחר כך פתחו את החלון.' },
    { id: 'h3', when: 'idle', text: 'גומי ועץ הם מבודדים. ומה עם העיפרון? הגרפיט שבו הוא אל-מתכת שמוליכה חשמל.' },
  ],
  explain: {
    alarm: 'חלון נפתח ← המגע בחיישן נפרד ← הלולאה הטורית נקטעה ← הזרם נעצר בכל הלולאה ← הבקר הפעיל אזעקה. מוליך שמחובר במקביל לחיישן שומר על הזרם גם כשהחלון פתוח. מבודד (גומי, עץ) לא יעזור.',
    laser: 'הלייזר פועל רק כשהמעגל שלו סגור. הלוח שלו נמצא בתוך החדר.',
    caught: 'בחצר חשוך — השומר רואה רק בקרן הפנס. ליד השער יש פנס רחוב. חכו שהשומר יתרחק.',
  },
  parSeconds: 90,
};
