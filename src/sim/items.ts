import { INSULATOR_R, WIRE_R } from './circuit';
import type { ItemKind } from './types';

export interface ItemSpec {
  kind: ItemKind;
  name: string;
  /** What it is made of / why it conducts or not (shown when inspected). */
  note: string;
  material: 'conductor' | 'insulator' | 'component';
  /** Element it becomes when attached between two terminals. */
  element: 'resistor' | 'battery' | 'fuse';
  r: number;
  v?: number;
  rating?: number;
  icon: string;
}

export const ITEMS: Record<ItemKind, ItemSpec> = {
  wire: { kind: 'wire', name: 'חוט מגשר', note: 'חוט נחושת עם קליפסים. נחושת היא מתכת — מוליך מצוין.', material: 'conductor', element: 'resistor', r: WIRE_R, icon: '〰' },
  coin: { kind: 'coin', name: 'מטבע', note: 'מטבע מתכת. מתכות מוליכות חשמל.', material: 'conductor', element: 'resistor', r: 0.02, icon: '🪙' },
  pencil: { kind: 'pencil', name: 'עיפרון גרפיט', note: 'גרפיט (פחמן) הוא אל-מתכת — ובכל זאת הוא מוליך חשמל.', material: 'conductor', element: 'resistor', r: 2, icon: '✏️' },
  glove: { kind: 'glove', name: 'כפפת גומי', note: 'גומי הוא מבודד — כמעט לא מעביר זרם.', material: 'insulator', element: 'resistor', r: INSULATOR_R, icon: '🧤' },
  rubberBand: { kind: 'rubberBand', name: 'גומייה', note: 'גומי הוא מבודד.', material: 'insulator', element: 'resistor', r: INSULATOR_R, icon: '➰' },
  ruler: { kind: 'ruler', name: 'סרגל עץ', note: 'עץ יבש הוא מבודד.', material: 'insulator', element: 'resistor', r: INSULATOR_R, icon: '📏' },
  sponge: { kind: 'sponge', name: 'ספוג רטוב במי מלח', note: 'מי מלח מוליכים, אבל ההתנגדות של הספוג גבוהה.', material: 'conductor', element: 'resistor', r: 60, icon: '🧽' },
  res3: { kind: 'res3', name: 'נגד 3Ω', note: 'נגד של 3 אוהם.', material: 'component', element: 'resistor', r: 3, icon: '▭' },
  res6: { kind: 'res6', name: 'נגד 6Ω', note: 'נגד של 6 אוהם.', material: 'component', element: 'resistor', r: 6, icon: '▭' },
  res12: { kind: 'res12', name: 'נגד 12Ω', note: 'נגד של 12 אוהם.', material: 'component', element: 'resistor', r: 12, icon: '▭' },
  bat6: { kind: 'bat6', name: 'סוללה 6V', note: 'מקור מתח של 6 וולט. הצד הראשון שבוחרים הוא הקוטב השלילי (−).', material: 'component', element: 'battery', r: 0.02, v: 6, icon: '🔋' },
  bat12: { kind: 'bat12', name: 'סוללה 12V', note: 'מקור מתח של 12 וולט. הצד הראשון שבוחרים הוא הקוטב השלילי (−).', material: 'component', element: 'battery', r: 0.02, v: 12, icon: '🔋' },
  fuse: { kind: 'fuse', name: 'נתיך רזרבי', note: 'מחליפים בו נתיך שנשרף.', material: 'component', element: 'fuse', r: WIRE_R, icon: '🧯' },
};
