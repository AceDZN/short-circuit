import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/hebrew-700.css';
import '@fontsource/rubik/hebrew-900.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-900.css';
import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sfx } from './audio';
import { LEVELS } from './levels';
import { PanelView, type PanelPick } from './render/panelView';
import { WorldView } from './render/world';
import { Game, type LogEntry } from './sim/game';
import { ITEMS } from './sim/items';
import type { FailReason, GameEvent, HintDef, ItemKind } from './sim/types';
import { ITEM_SVG } from './ui/icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

// ───────────────────────────── renderer

const canvas = $<HTMLCanvasElement>('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.78);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sfx = new Sfx();

// ───────────────────────────── persistent progress / settings / learning log

interface Progress {
  unlocked: number;
  stars: number[];
}
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  },
};
const progress = store.get<Progress>('short-circuit-progress', { unlocked: 1, stars: [] });
if (params.has('all')) progress.unlocked = LEVELS.length;
const settings = store.get('short-circuit-settings', { reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, muted: false });
sfx.setMuted(settings.muted);
const learningLog: (LogEntry & { attempt: number; hinted: boolean })[] = store.get('short-circuit-log', []);
function logEvent(e: LogEntry) {
  learningLog.push({ ...e, attempt: attempt, hinted: hintsUsedThisLevel > 0 });
  if (learningLog.length > 3000) learningLog.splice(0, learningLog.length - 3000);
  store.set('short-circuit-log', learningLog);
}

// ───────────────────────────── app state

type Screen = 'title' | 'brief' | 'play' | 'fail' | 'win' | 'pause';
let screen: Screen = 'title';
let levelIdx = Math.min(LEVELS.length - 1, Math.max(0, Number(params.get('level') ?? 1) - 1));
let game!: Game;
let world!: WorldView;
let panelView: PanelView | null = null;
let scan = 0;
let scannerHeld = false;
let scannerToggle = false;
let externalClock = false;
let attempt = 1;
let hintsUsedThisLevel = 0;
let pendingInteract: string | null = null;
let meterMode = false;
let introWasActive = true;
let hitStop = 0;
const keys = new Set<string>();
const labelsEl = $('labels');
const pvLabelsEl = $('pvlabels');
const hintsShown = new Set<string>();
let hintAvailable: HintDef | null = null;
let toastTimer = 0;
let lastBag = '';

function loadLevel(i: number) {
  levelIdx = i;
  closePanel();
  world?.dispose();
  game = new Game(LEVELS[i]);
  game.onLog = logEvent;
  world = new WorldView(game, labelsEl);
  renderPass.scene = world.scene;
  renderPass.camera = world.camera;
  hintsShown.clear();
  introWasActive = true;
  hintAvailable = null;
  hintsUsedThisLevel = 0;
  attempt = 1;
  lastBag = '';
  $('levelName').textContent = `שוד ${LEVELS[i].index} · ${LEVELS[i].title}`;
  hideToast();
}

function setScreen(s: Screen) {
  screen = s;
  for (const id of ['scrTitle', 'scrBrief', 'scrFail', 'scrWin', 'scrPause']) $(id).classList.add('hidden');
  const map: Partial<Record<Screen, string>> = { title: 'scrTitle', brief: 'scrBrief', fail: 'scrFail', win: 'scrWin', pause: 'scrPause' };
  if (map[s]) $(map[s]!).classList.remove('hidden');
  $('hud').classList.toggle('hidden', s === 'title' || s === 'brief');
  game.paused = s !== 'play';
  labelsEl.style.display = s === 'title' || s === 'brief' ? 'none' : '';
  if (s === 'title') renderTitle();
}

function renderTitle() {
  const grid = $('levelGrid');
  grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    const locked = i + 1 > progress.unlocked;
    b.className = `level-card ${locked ? 'locked' : ''} ${i === levelIdx ? 'sel' : ''}`;
    const st = progress.stars[i] ?? 0;
    const ico = ['💡', '✨', '🚨', '⚙️', '⚡', '👑'][i] ?? '⚡';
    b.innerHTML = `<span class="num">${L.index}</span><span class="ico">${ico}</span><b>${L.title}</b><small>${L.subtitle}</small><div class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</div>${locked ? '<span class="lock">🔒</span>' : ''}`;
    b.onclick = () => {
      if (locked) return;
      sfx.unlock();
      sfx.click();
      if (i !== levelIdx) loadLevel(i);
      renderTitle();
    };
    grid.appendChild(b);
  });
  ($('optReduced') as HTMLInputElement).checked = settings.reduced;
}

function showBrief() {
  const L = LEVELS[levelIdx];
  $('briefNum').textContent = L.noHints ? `שוד ${L.index} · ללא רמזים` : `שוד ${L.index} מתוך ${LEVELS.length}`;
  $('briefTitle').textContent = L.title;
  $('briefSub').textContent = L.subtitle;
  $('briefText').textContent = BRIEFS[L.id] ?? L.concept;
  $('briefGoal').innerHTML = `המטרה: <b>${L.exhibits.map((e) => e.name).join(', ')}</b> ← ואז ליציאה<div class="stars-goal"><span><b>★</b> לצאת עם המוצג</span><span><b>★</b> רוח רפאים: אף אחד לא שם לב אליכם</span><span><b>★</b> מהר: מתחת ל-<bdi dir="ltr">${fmtTime(L.parSeconds)}</bdi></span></div>`;
  setScreen('brief');
}

const BRIEFS: Record<string, string> = {
  l1: 'הלובי מואר כמו יום, השומר יושב מול הדלת ומצלמה סורקת את המסדרון. אבל כל אור וכל מצלמה הם רק עוד מעגל חשמלי בקיר. מצאו את הלוח.',
  l2: 'גלריית האורות: שרשרת נורות תצוגה סביב הנורה של אדיסון, ומסדרון מואר בשומר ערני. לא כל החוטים מחוברים באותה צורה — תסרקו לפני שאתם חותכים.',
  l3: 'אגף החלונות. כל חלון מחובר ללולאת אזעקה: כל עוד זרם זורם בה — שקט. אם הזרם נעצר אפילו לרגע — סירנה. איך פותחים חלון בלי לעצור את הזרם?',
  l4: 'דלת הכספת זזה רק עם מנוע חזק. יש לכם סוללות ונגדים בתיק. מעט מדי זרם — הדלת לא זזה. יותר מדי — הנתיך נשרף והשומר בא.',
  l5: 'האגף המערבי מחובר לרשת החשמל, ונתיך אחד שומר עליו בחדר השומרים. שלולית מתחת לכבל חשוף חוסמת את הדרך. קצר מתוכנן היטב יכול לכבות הכול. (רק במשחק! במציאות קצר ברשת החשמל מסוכן מאוד — קשת חשמלית, כוויות ושריפה.)',
  l6: 'הכספת. בניין חדש, בלי רמזים. מתח אחד, נתיך ראשי אחד, הרבה מעגלים. תסרקו, תחשבו, ותצאו עם הכתר.',
};

function startPlay() {
  sfx.unlock();
  setScreen('play');
  updateBag(true);
  if (!externalClock && !params.has('nointro')) world.startIntro();
  else maybeAutoHint('start');
}

// ───────────────────────────── hints

function maybeAutoHint(when: HintDef['when'], panel?: string) {
  const L = game.level;
  if (L.noHints) return;
  for (const h of L.hints) {
    if (hintsShown.has(h.id) || h.when !== when) continue;
    if (h.panel && h.panel !== panel) continue;
    // Controls tips show by themselves; science hints wait behind the 💡 button.
    if (when === 'start' || when === 'nearPanel') {
      hintsShown.add(h.id);
      showToast(h.text, false);
    } else if (!hintAvailable) {
      hintAvailable = h;
    }
    return;
  }
}

function useHint() {
  if (!hintAvailable) return;
  hintsShown.add(hintAvailable.id);
  hintsUsedThisLevel++;
  game.state.stats.hintsUsed++;
  game.addLog('hint', hintAvailable.id);
  showToast(hintAvailable.text, true);
  hintAvailable = null;
}

function showToast(text: string, concept: boolean, ms = 7000) {
  const t = $('toast');
  t.textContent = text;
  t.className = `toast ${concept ? 'concept' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, ms);
}
function hideToast() {
  $('toast').classList.add('hidden');
}

// ───────────────────────────── HUD

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const segs = $('eyeSegs');
for (let i = 0; i < 6; i++) segs.appendChild(document.createElement('i'));

function updateHud() {
  const st = game.state;
  const notice = Math.max(0, ...st.guards.map((g) => g.notice), ...Object.values(st.camMeter));
  const on = Math.ceil(notice * 6 - 0.01);
  [...segs.children].forEach((c, i) => c.classList.toggle('on', i < on));
  $('eyeMeter').classList.toggle('hot', notice > 0.5);
  $('timer').innerHTML = `<bdi dir="ltr">${fmtTime(st.time)}</bdi>`;
  const lit = game.isLit(st.thief.x, st.thief.y);
  const lc = $('lightState');
  lc.textContent = lit ? 'באור — רואים אתכם' : 'בצל';
  lc.classList.toggle('lit', lit);
  const done = game.objectiveDone();
  const missing = game.level.exhibits.filter((e) => e.required !== false && !st.stolen[e.id]).map((e) => e.name);
  $('objText').textContent = done ? 'ברחו ליציאה!' : `גנבו את ${missing.join(' ו')} וצאו`;
  $('objective').classList.toggle('done', done);
  const tgt = screen === 'play' && !st.panelOpen ? game.interactTarget() : null;
  const pr = $('prompt');
  if (tgt) {
    const verb = tgt.kind === 'panel' ? 'פתיחת לוח' : tgt.kind === 'exhibit' ? `לקחת: ${tgt.label}` : tgt.label;
    pr.innerHTML = `<kbd>E</kbd> ${verb}`;
    pr.classList.remove('hidden');
    if (tgt.kind === 'panel') maybeAutoHint('nearPanel', tgt.id);
  } else pr.classList.add('hidden');
  $('btnAct').style.visibility = tgt ? 'visible' : 'hidden';
  $('btnScanner').classList.toggle('on', scannerHeld || scannerToggle);
  $('btnHint').classList.toggle('hidden', !hintAvailable || !!game.level.noHints);
  if (st.time > 50 && !hintAvailable && screen === 'play') maybeAutoHint('idle');
  updateBag();
}

/** Bag slots keep a stable order (the level's starting bag); empty kinds stay as ghosts so nothing jumps under the cursor. */
function bagCounts() {
  const order: ItemKind[] = [];
  for (const it of [...game.level.bag, ...game.state.bag]) if (!order.includes(it)) order.push(it);
  const counts = new Map<ItemKind, number>(order.map((k) => [k, 0]));
  for (const it of game.state.bag) counts.set(it, (counts.get(it) ?? 0) + 1);
  return counts;
}

function updateBag(force = false) {
  const key = game.state.bag.join(',');
  if (!force && key === lastBag) return;
  lastBag = key;
  const counts = bagCounts();
  const bag = $('bag');
  bag.innerHTML = counts.size ? '' : '<span class="empty">התיק ריק</span>';
  for (const [it, n] of counts) {
    const d = document.createElement('div');
    d.className = `slot ${n ? '' : 'ghost'}`;
    d.title = ITEMS[it].name;
    d.innerHTML = ITEM_SVG[it] + (n > 1 ? `<span class="cnt">×${n}</span>` : '');
    bag.appendChild(d);
  }
  if (panelView) renderPanelBag();
}

// ───────────────────────────── panel close-up

function openPanelView(id: string) {
  panelView?.dispose();
  panelView = new PanelView(game, id, pvLabelsEl);
  meterMode = false;
  lastSnap = snapDevices();
  $('pvFeed').innerHTML = '';
  $('pvMeter').classList.remove('on');
  panelView.rebuild();
  $('panelui').classList.remove('hidden');
  document.body.classList.add('in-panel');
  labelsEl.style.display = 'none';
  pvLabelsEl.style.display = '';
  const p = game.panel(id);
  hideToast();
  $('pvTitle').textContent = p.label;
  setPanelHelp();
  renderPanelBag();
  renderInspector();
  sfx.click();
  maybeAutoHint('inPanel', id);
}

function closePanel() {
  if (!panelView) return;
  panelView.dispose();
  panelView = null;
  $('panelui').classList.add('hidden');
  document.body.classList.remove('in-panel');
  labelsEl.style.display = '';
  pvLabelsEl.style.display = 'none';
  if (game?.state.panelOpen) game.closePanel();
}

function setPanelHelp() {
  const pv = panelView!;
  let t = 'לחצו על רכיב או חוט כדי למדוד אותו. כדי לחבר: בחרו פריט מהתיק, ואז לחצו על חריץ או גררו בין שני מחברים.';
  if (pv.placingItem) {
    const spec = ITEMS[pv.placingItem];
    t = pv.pendingTerminal
      ? `עכשיו לחצו על המחבר השני כדי לחבר את ה${spec.name}.`
      : spec.element === 'battery'
        ? `לחצו על המחבר שיתחבר לקוטב השלילי (−) של ה${spec.name}.`
        : `לחצו על חריץ מסומן, או גררו מחבר נחושת אל מחבר אחר, כדי לחבר את ה${spec.name}.`;
  }
  $('pvHelp').textContent = t;
}

function renderPanelBag() {
  const pv = panelView;
  if (!pv) return;
  const wrap = $('pvBag');
  wrap.innerHTML = '';
  const counts = bagCounts();
  if (!counts.size) wrap.innerHTML = '<span class="empty" style="color:var(--dim);padding:10px">ריק</span>';
  for (const [it, n] of counts) {
    const d = document.createElement('button');
    d.className = `slot ${pv.placingItem === it ? 'sel' : ''} ${n ? '' : 'ghost'}`;
    d.disabled = n === 0;
    d.innerHTML = ITEM_SVG[it] + `<small>${ITEMS[it].name}</small>` + (n > 1 ? `<span class="cnt">×${n}</span>` : '');
    d.onclick = () => {
      sfx.click();
      if (it === 'fuse') {
        // spare fuses go straight into a blown fuse holder if one is selected
        const sel = pv.selection;
        if (sel?.type === 'part' && game.replaceFuse(sel.id)) afterPanelChange();
        else showToast('נתיך רזרבי מחליפים במקום נתיך שנשרף: בחרו קודם את הנתיך השרוף.', false, 4000);
        return;
      }
      pv.placingItem = pv.placingItem === it ? null : it;
      pv.pendingTerminal = null;
      pv.selection = null;
      setPanelHelp();
      renderPanelBag();
      renderInspector();
    };
    wrap.appendChild(d);
  }
}

function fmtA(i: number) {
  return i < 0.005 ? '0 A' : i >= 100 ? '>99 A' : `${i.toFixed(i < 1 ? 2 : 2)} A`;
}

function renderInspector() {
  const pv = panelView!;
  const el = $('pvInspector');
  const sel = pv.selection;
  const cutBtn = $<HTMLButtonElement>('pvCut');
  cutBtn.disabled = true;
  cutBtn.innerHTML = '<span>✂</span>חתוך';
  if (!sel || sel.type === 'terminal' || sel.type === 'slot') {
    const lines = game
      .panel(pv.panel.id)
      .circuits.map((cid) => {
        const c = game.circuit(cid);
        const src = c.parts.find((p) => p.kind === 'battery' || p.kind === 'mains');
        const I = src ? game.current(src.id) : 0;
        return `<div class="row"><span>${c.name}</span><bdi dir="ltr">${fmtA(I)}</bdi></div>`;
      })
      .join('');
    el.innerHTML = `<h4>מעגלים בלוח</h4>${lines}<div class="note">הזרם שיוצא מהסוללה בכל מעגל. לחצו על רכיב לפרטים.</div>`;
    return;
  }
  if (sel.type === 'placed') {
    const pl = game.state.placed.find((p) => p.id === sel.id);
    if (!pl) {
      pv.selection = null;
      return renderInspector();
    }
    const spec = ITEMS[pl.item];
    const r = game.partResult(pl.id);
    el.innerHTML = `<h4>${spec.name}</h4>
      <div class="row"><span>חומר</span><span>${spec.material === 'conductor' ? 'מוליך' : spec.material === 'insulator' ? 'מבודד' : 'רכיב'}</span></div>
      ${spec.element === 'battery' ? `<div class="row"><span>מתח</span><bdi dir="ltr">${spec.v} V</bdi></div>` : `<div class="row"><span>R</span><bdi dir="ltr">${spec.r >= 1e6 ? '∞ Ω' : spec.r + ' Ω'}</bdi></div>`}
      <div class="row"><span>V</span><bdi dir="ltr">${Math.abs(r.drop).toFixed(2)} V</bdi></div>
      <div class="row"><span>I</span><bdi dir="ltr">${fmtA(Math.abs(r.current))}</bdi></div>
      <div class="note">${spec.note}</div>
      <div class="acts"><button id="actPickup">הורדה מהלוח</button></div>`;
    $('actPickup').onclick = () => {
      if (game.pickupPlaced(pl.id)) {
        pv.selection = null;
        afterPanelChange();
      }
    };
    return;
  }
  const def = game.level.circuits.flatMap((c) => c.parts).find((p) => p.id === sel.id)!;
  const ps = game.state.parts[def.id];
  const r = game.partResult(def.id);
  const editable = game.canEditPart(def.id);
  const kindName: Record<string, string> = {
    battery: 'מקור מתח',
    mains: 'רשת החשמל',
    wire: 'חוט מוליך',
    lamp: 'נורה',
    camera: 'מצלמת אבטחה',
    laser: 'לייזר',
    motor: 'מנוע',
    sensor: 'חיישן חלון (מגע מגנטי)',
    relay: 'בקר אזעקה',
    buzzer: 'זמזם',
    fuse: 'נתיך',
    resistor: 'נגד',
    cable: 'כבל חשוף',
  };
  const rRow = def.kind === 'battery' || def.kind === 'mains' ? `<div class="row"><span>מתח</span><bdi dir="ltr">${def.v} V</bdi></div>` : def.r !== undefined && def.kind !== 'wire' ? `<div class="row"><span>R</span><bdi dir="ltr">${def.r} Ω</bdi></div>` : '';
  const rating = def.kind === 'fuse' ? `<div class="row"><span>נשרף מעל</span><bdi dir="ltr">${def.rating} A</bdi></div>` : '';
  const status = ps.blown ? '<div class="note" style="color:var(--red)">הנתיך נשרף — המעגל פתוח.</div>' : ps.open ? '<div class="note" style="color:var(--red)">חתוך — המעגל פתוח כאן.</div>' : '';
  const power = def.kind !== 'wire' && def.kind !== 'battery' && def.kind !== 'mains' ? `<div class="row"><span>P</span><bdi dir="ltr">${r.power.toFixed(1)} W</bdi></div>` : '';
  const acts: string[] = [];
  if (editable && def.cuttable) acts.push(`<button id="actCut" class="primary">${ps.open ? 'חיבור מחדש' : '✂ חיתוך'}</button>`);
  if (editable && def.removable && !ps.removed) acts.push('<button id="actRemove">הוצאה לתיק</button>');
  if (editable && def.kind === 'fuse' && ps.blown) acts.push(`<button id="actFuse" class="primary" ${game.state.bag.includes('fuse') ? '' : 'disabled'}>החלפת נתיך${game.state.bag.includes('fuse') ? '' : ' (אין רזרבי)'}</button>`);
  if (!editable) acts.push('<div class="note">הרכיב הזה לא נגיש מהלוח הזה.</div>');
  el.innerHTML = `<h4>${def.label}</h4><div class="note" style="margin:0 0 6px">${kindName[def.kind] ?? ''}</div>${rRow}${rating}
    <div class="row"><span>V</span><bdi dir="ltr">${Math.abs(def.kind === 'battery' || def.kind === 'mains' ? (def.v ?? 0) - Math.abs(r.drop) * 0 : r.drop).toFixed(2)} V</bdi></div>
    <div class="row"><span>I</span><bdi dir="ltr">${fmtA(Math.abs(r.current))}</bdi></div>${power}${status}<div class="acts">${acts.join('')}</div>`;
  if (editable && def.cuttable) {
    cutBtn.disabled = false;
    cutBtn.innerHTML = ps.open ? '<span>🔗</span>חבר' : '<span>✂</span>חתוך';
    $('actCut').onclick = doCut;
  }
  $('actRemove')?.addEventListener('click', () => {
    if (game.removePart(def.id)) afterPanelChange();
  });
  $('actFuse')?.addEventListener('click', () => {
    if (game.replaceFuse(def.id)) afterPanelChange();
  });
}

function doCut() {
  const sel = panelView?.selection;
  if (sel?.type !== 'part') return;
  if (game.toggleCut(sel.id)) afterPanelChange();
}

function afterPanelChange() {
  const pv = panelView;
  if (!pv) return;
  const evs = game.drainEvents();
  for (const e of evs) {
    if ((e.type === 'snip' || e.type === 'join' || e.type === 'place' || e.type === 'fuseReplaced') && e.id) pv.sparkAt(e.id);
    if (e.type === 'fuseBlown' && e.id) {
      pv.sparkAt(e.id);
      pv.sparkAt(e.id);
    }
  }
  processEvents(evs);
  reportEffects();
  if (!panelView) return;
  pv.rebuild();
  renderPanelBag();
  renderInspector();
  setPanelHelp();
}

function placeBetween(circuit: string, a: string, b: string) {
  const pv = panelView!;
  const id = game.placeItem(pv.placingItem!, circuit, a, b);
  pv.pendingTerminal = null;
  pv.placingItem = null;
  pv.setDrag(null);
  if (id) pv.selection = { type: 'placed', id, circuit };
  afterPanelChange();
}

function panelClick(ndcX: number, ndcY: number) {
  const pv = panelView!;
  const pick = pv.pick(ndcX, ndcY);
  if (pv.placingItem) {
    if (pick?.type === 'slot') return placeBetween(pick.circuit, pick.a, pick.b);
    if (pick?.type === 'terminal') {
      if (pv.pendingTerminal && pv.pendingTerminal.circuit === pick.circuit && pv.pendingTerminal.node !== pick.node) return placeBetween(pick.circuit, pv.pendingTerminal.node, pick.node);
      pv.pendingTerminal = { circuit: pick.circuit, node: pick.node };
      sfx.click();
      setPanelHelp();
      return;
    }
    pv.placingItem = null;
    pv.pendingTerminal = null;
    pv.setDrag(null);
    renderPanelBag();
    setPanelHelp();
  }
  if (pick?.type === 'terminal' || pick?.type === 'slot') {
    showToast('בחרו קודם פריט מהתיק — ואז לחצו על החריץ, או על שני מחברים.', false, 3000);
    return;
  }
  pv.selection = pick;
  sfx.click();
  pv.rebuild();
  renderInspector();
}

/** What changed in the building after a rewire — shown as a feed so every action has a visible payoff. */
type Snap = Map<string, { on: boolean; strain: boolean }>;
let lastSnap: Snap = new Map();
function snapDevices(): Snap {
  return new Map([...game.devices.values()].map((d) => [d.id, { on: d.on, strain: !!d.strain }]));
}
function partLabel(partId: string) {
  return game.level.circuits.flatMap((c) => c.parts).find((p) => p.id === partId)?.label ?? '';
}
function reportEffects() {
  const now = snapDevices();
  const lines: { icon: string; text: string; tone: 'good' | 'bad' | 'info' }[] = [];
  for (const d of game.level.devices) {
    const a = lastSnap.get(d.id);
    const b = now.get(d.id)!;
    if (!a) continue;
    const label = d.kind === 'door' ? d.label : partLabel(d.part);
    if (a.on !== b.on) {
      if (d.kind === 'lamp') lines.push({ icon: '💡', text: `${label} ${b.on ? 'נדלקה' : 'כבתה'}`, tone: 'info' });
      else if (d.kind === 'camera') lines.push({ icon: '📷', text: `${label}: ${b.on ? 'חזרה לפעול' : 'כבויה'}`, tone: b.on ? 'bad' : 'good' });
      else if (d.kind === 'laser') lines.push({ icon: '🔴', text: `${label}: ${b.on ? 'דולק' : 'כבה'}`, tone: b.on ? 'bad' : 'good' });
      else if (d.kind === 'door') lines.push({ icon: '🚪', text: `${label}: ${b.on ? 'נפתחת!' : 'נסגרת'}`, tone: b.on ? 'good' : 'info' });
      else if (d.kind === 'alarm') lines.push({ icon: '🚨', text: b.on ? 'לולאת האזעקה שלמה' : 'לולאת האזעקה נקטעה!', tone: b.on ? 'good' : 'bad' });
      else if (d.kind === 'hazard') lines.push({ icon: '⚡', text: b.on ? 'הכבל החשוף חי — מסוכן!' : 'הכבל החשוף בלי מתח', tone: b.on ? 'bad' : 'good' });
    }
    if (d.kind === 'door' && b.strain && !a.strain) lines.push({ icon: '🚪', text: `${label}: המנוע מזמזם — חסר זרם`, tone: 'bad' });
  }
  lastSnap = now;
  const feed = $('pvFeed');
  for (const l of lines) {
    const el = document.createElement('div');
    el.className = `feed ${l.tone}`;
    el.innerHTML = `<span>${l.icon}</span>${l.text}`;
    feed.prepend(el);
    window.setTimeout(() => el.classList.add('out'), 3600);
    window.setTimeout(() => el.remove(), 4200);
  }
  while (feed.children.length > 4) feed.lastElementChild!.remove();
}

// ───────────────────────────── events → sound, fx, screens

const FAIL_TEXT: Record<FailReason, { stamp: string; lines: string[]; explain: string }> = {
  caught: { stamp: 'נתפסת!', lines: ['השומר: "אהה! ידעתי ששמעתי משהו!"', 'השומר: "יופי, עוד מבקר לילי..."', 'השומר: "ידיים למעלה! ועכשיו תסבירו לי מה זה הסורק הזה."'], explain: 'באור השומר רואה רחוק. בחושך הוא רואה רק בקרן הפנס שלו.' },
  camera: { stamp: 'צולמת!', lines: ['המצלמה תפסה את הפרצוף הכי מביך שלך.', 'חייך! את/ה במצלמה נסתרת.'], explain: 'מצלמה עובדת רק כשעובר בה זרם. פתחו את המעגל שלה.' },
  laser: { stamp: 'לייזר!', lines: ['קרן הלייזר נקטעה. ביפ-ביפ-ביפ!', 'הלייזר אומר: "מצטער, זה לא אישי."'], explain: 'קרן לייזר פועלת רק כשהמעגל שלה סגור.' },
  alarm: { stamp: 'אזעקה!', lines: ['ווי-וו-ווי-וו! כל השכונה התעוררה.', 'הסירנה צועקת. גם החתול של השכן.'], explain: 'לולאת האזעקה מחוברת בטור: כשהזרם נעצר בנקודה אחת — הוא נעצר בכל הלולאה, והבקר מפעיל אזעקה.' },
  pedestal: { stamp: 'התגלית!', lines: ['השומר: "רגע... איפה המוצג?!"', 'השומר מסתכל על הכן הריק. הכן הריק מסתכל עליו בחזרה.'], explain: 'השומר בא לבדוק למה החדר החשיך — וראה שהמוצג חסר.' },
  shock: { stamp: 'התחשמלות!', lines: ['זזזזט! השיער שלך עכשיו בסגנון "טסלה".', 'אאוץ׳! לפחות זה היה רק משחק.'], explain: 'מים מורידים מאוד את ההתנגדות של הגוף. לפי חוק אוהם I = V ÷ R: עור יבש ≈ 100,000Ω → 220V ÷ 100,000Ω ≈ 2 mA. עור רטוב ≈ 1,000Ω → 220V ÷ 1,000Ω = 220 mA — מסוכן מאוד.' },
  trapped: { stamp: 'נלכדת!', lines: ['הדלת נסגרה מאחוריך. נוף יפה מבפנים, לא?', 'דלת סגורה, אין זרם במנוע — ואין יציאה.'], explain: 'דלת מנוע נשארת פתוחה רק כל עוד עובר במנוע מספיק זרם. כשהמעגל שלה נפתח, היא נסגרת.' },
  fire: { stamp: 'קצר!', lines: ['ריח של פלסטיק שרוף... והגלאי כבר מצפצף.', 'הכבלים התלהטו והעלו עשן. מכבי האש בדרך.'], explain: 'קצר = מסלול כמעט בלי התנגדות. הזרם עצום, החוטים מתחממים. בגלל זה שמים נתיך בטור.' },
};

let endTimer = 0;
function processEvents(events: GameEvent[]) {
  if (!events.length) return;
  world.onEvents(events);
  for (const e of events) {
    switch (e.type) {
      case 'snip':
        sfx.snip();
        break;
      case 'join':
      case 'fuseReplaced':
        sfx.join();
        break;
      case 'place':
        sfx.place();
        break;
      case 'pickup':
      case 'remove':
      case 'window':
        sfx.click();
        break;
      case 'fuseBlown':
        sfx.pop();
        showToast('פּוֹפּ! הנתיך נשרף — המעגל נפתח.', false, 3500);
        break;
      case 'doorOpen':
        sfx.door(true);
        break;
      case 'doorClose':
        sfx.door(false);
        break;
      case 'doorStrain':
        sfx.strain();
        showToast('המנוע מזמזם אבל לא מצליח להרים את הדלת — הזרם חלש מדי.', false, 4000);
        break;
      case 'bark':
        if (e.text === '?') sfx.huh();
        else if (e.text === '!' || e.text === '!!') sfx.hey();
        break;
      case 'repair':
        showToast(e.text === 'fuse' ? 'השומר החליף את הנתיך.' : e.text === 'items' ? 'השומר מצא את הפריטים שלכם בלוח ותיקן אותו.' : 'השומר תיקן את הלוח.', false, 3500);
        break;
      case 'steal':
        sfx.steal();
        hitStop = settings.reduced ? 0 : 0.18;
        showToast('יש! עכשיו לצאת בשקט ← היציאה מסומנת', false, 2600);
        break;
      case 'guardHunt':
        showToast('הנתיך החדש נשרף שוב — השומר יוצא לחפש את הקצר! עוד מעט החשמל יחזור.', false, 5000);
        break;
      case 'checkpoint':
        sfx.checkpoint();
        showToast('נקודת שמירה ✓', false, 1800);
        break;
      case 'fail': {
        const reason = e.id as FailReason;
        if (['alarm', 'camera', 'laser', 'pedestal'].includes(reason)) sfx.setSiren(true);
        else sfx.zap();
        sfx.trombone();
        clearTimeout(endTimer);
        endTimer = window.setTimeout(() => showFail(reason), panelView ? 900 : 1500);
        // afterFail hints become available
        for (const h of game.level.hints) if (h.when === 'afterFail' && h.fail === reason && !hintsShown.has(h.id)) hintAvailable = h;
        break;
      }
      case 'win':
        sfx.win();
        clearTimeout(endTimer);
        endTimer = window.setTimeout(showWin, 1600);
        break;
    }
  }
}

function showFail(reason: FailReason) {
  closePanel();
  const f = FAIL_TEXT[reason];
  $('failStamp').textContent = f.stamp;
  $('failLine').textContent = f.lines[Math.floor(Math.random() * f.lines.length)];
  let explain = game.level.explain[reason] ?? f.explain;
  const blow = game.lastBlow;
  if (blow && game.state.time - blow.t < 3) {
    const def = game.level.circuits.flatMap((c) => c.parts).find((p) => p.id === blow.part);
    if (def?.rating) explain += ` הנתיך (${def.rating}A) נשרף כשהזרם בו הגיע ל-${blow.current >= 100 ? 'יותר מ-99' : blow.current.toFixed(1)}A.`;
  }
  $('failExplain').textContent = explain;
  $('btnRetry').textContent = game.hasCheckpoint() ? '↻ מנקודת השמירה' : '↻ נסו שוב';
  setScreen('fail');
}

function showWin() {
  sfx.setSiren(false);
  const st = game.state;
  const L = game.level;
  const ghost = st.stats.spottedPeaks === 0 && st.stats.fails === 0;
  const fast = st.time <= L.parSeconds;
  const stars = 1 + (ghost ? 1 : 0) + (fast ? 1 : 0);
  progress.stars[levelIdx] = Math.max(progress.stars[levelIdx] ?? 0, stars);
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIdx + 2));
  store.set('short-circuit-progress', progress);
  $('winStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('');
  $('winStats').innerHTML = `<div>⏱ <bdi dir="ltr">${fmtTime(st.time)}</bdi> (יעד <bdi dir="ltr">${fmtTime(L.parSeconds)}</bdi>)</div><div>👁 נחשפת ${st.stats.spottedPeaks} פעמים</div><div>${ghost ? '👻 רוח רפאים!' : `נפילות: ${st.stats.fails}`}</div><div>💡 רמזים: ${st.stats.hintsUsed}</div>`;
  $('winLearn').textContent = L.concept;
  $('btnNext').classList.toggle('hidden', levelIdx >= LEVELS.length - 1);
  setScreen('win');
}

// ───────────────────────────── input

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

window.addEventListener('keydown', (e) => {
  if (e.repeat && !MOVE_KEYS[e.code]) return;
  sfx.unlock();
  keys.add(e.code);
  if (e.code === 'Tab') e.preventDefault();
  if (screen === 'play' && world.introActive) {
    world.skipIntro();
    return;
  }
  if (screen === 'play') {
    if (panelView) {
      if (e.code === 'Escape' || e.code === 'KeyE') closePanel();
      if (e.code === 'KeyC') doCut();
      return;
    }
    if (e.code === 'KeyE' || e.code === 'Enter') interact();
    if (e.code === 'Tab') {
      scannerToggle = !scannerToggle;
      sfx.scanner(scannerToggle);
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!scannerHeld) sfx.scanner(true);
      scannerHeld = true;
    }
    if (e.code === 'KeyZ') world.rotate(-1);
    if (e.code === 'KeyX') world.rotate(1);
    if (e.code === 'KeyH') useHint();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyP' || e.code === 'Escape') setScreen('pause');
  } else if (screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) setScreen('play');
  else if ((screen === 'title' || screen === 'brief') && e.code === 'Enter') screen === 'title' ? showBrief() : startPlay();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') scannerHeld = false;
});
window.addEventListener('blur', () => {
  keys.clear();
  scannerHeld = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play' && !externalClock) setScreen('pause');
});

function interact() {
  const tgt = game.interactTarget();
  if (!tgt) return;
  game.interact();
  if (tgt.kind === 'panel' && game.state.panelOpen) openPanelView(tgt.id);
  processEvents(game.drainEvents());
}

function toggleMute() {
  settings.muted = !settings.muted;
  sfx.setMuted(settings.muted);
  $('btnMute').textContent = settings.muted ? '🔇' : '🔊';
  store.set('short-circuit-settings', settings);
}

let downAt: { x: number; y: number; t: number } | null = null;
let dragFrom: { circuit: string; node: string } | null = null;
const ndcOf = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1] as const;
};
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  dragFrom = null;
  if (panelView?.placingItem) {
    const pk = panelView.pick(...ndcOf(e));
    if (pk?.type === 'terminal') dragFrom = { circuit: pk.circuit, node: pk.node };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!panelView) return;
  if (dragFrom && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) panelView.setDrag(dragFrom, ...ndcOf(e));
  const r = canvas.getBoundingClientRect();
  const h = panelView.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const key = (p: PanelPick | null) => JSON.stringify(p);
  if (key(h) !== key(panelView.hover)) {
    panelView.hover = h;
    canvas.style.cursor = h ? 'pointer' : 'default';
    if (h?.type !== 'terminal') panelView.rebuild();
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (panelView && dragFrom && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) {
    // finished dragging a wire from one terminal to another
    const pk = panelView.pick(...ndcOf(e));
    const from = dragFrom;
    dragFrom = null;
    downAt = null;
    panelView.setDrag(null);
    if (pk?.type === 'terminal' && pk.circuit === from.circuit && pk.node !== from.node) placeBetween(from.circuit, from.node, pk.node);
    return;
  }
  dragFrom = null;
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) return;
  downAt = null;
  if (screen !== 'play') return;
  if (world.introActive) return world.skipIntro();
  const r = canvas.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  if (panelView) return panelClick(nx, ny);
  const tile = world.pickTile(nx, ny);
  if (!tile) return;
  // Clicking on/near something usable walks there and uses it.
  pendingInteract = null;
  for (const p of game.level.panels) if (Math.hypot(p.tile[0] - tile[0], p.tile[1] - tile[1]) < 1.1 || (p.front[0] === tile[0] && p.front[1] === tile[1])) pendingInteract = p.id;
  for (const ex of game.level.exhibits) if (!game.state.stolen[ex.id] && Math.hypot(ex.tile[0] - tile[0], ex.tile[1] - tile[1]) < 0.9) pendingInteract = ex.id;
  for (const d of game.level.devices) if (d.kind === 'window' && d.tile[0] === tile[0] && d.tile[1] === tile[1]) pendingInteract = d.id;
  let dest = tile;
  if (pendingInteract) {
    const p = game.level.panels.find((x) => x.id === pendingInteract);
    const ex = game.level.exhibits.find((x) => x.id === pendingInteract);
    if (p) dest = p.front;
    else if (ex) dest = nearestWalkable(ex.tile);
    else dest = nearestWalkable(tile);
  }
  if (!game.grid.walkable(dest[0], dest[1])) dest = nearestWalkable(dest);
  game.moveTo(dest);
});
canvas.addEventListener('wheel', (e) => {
  if (screen === 'play' && !panelView) world.setZoom((world as unknown as { zoom: number }).zoom * (e.deltaY > 0 ? 1.08 : 0.93));
});

function nearestWalkable(t: [number, number]): [number, number] {
  const th = game.state.thief;
  let best: [number, number] = t;
  let bd = Infinity;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = t[0] + dx;
      const y = t[1] + dy;
      if (!game.grid.walkable(x, y)) continue;
      const d = Math.hypot(dx, dy) * 10 + Math.hypot(x - th.x, y - th.y) * 0.1;
      if (d < bd) {
        bd = d;
        best = [x, y];
      }
    }
  return best;
}

// HUD buttons
$('btnScanner').addEventListener('click', () => {
  scannerToggle = !scannerToggle;
  sfx.unlock();
  sfx.scanner(scannerToggle);
});
$('btnAct').addEventListener('click', interact);
$('btnPause').addEventListener('click', () => setScreen('pause'));
$('btnMute').addEventListener('click', toggleMute);
$('btnRotL').addEventListener('click', () => world.rotate(-1));
$('btnRotR').addEventListener('click', () => world.rotate(1));
$('btnHint').addEventListener('click', useHint);
$('toast').addEventListener('click', hideToast);
$('pvClose').addEventListener('click', closePanel);
$('pvCut').addEventListener('click', doCut);
$('pvMeter').addEventListener('click', () => {
  meterMode = !meterMode;
  $('pvMeter').classList.toggle('on', meterMode);
  if (panelView) {
    panelView.meter = meterMode;
    panelView.rebuild();
  }
  showToast(meterMode ? 'מד זרם: עכשיו רואים את הזרם בכל חוט. השוו את הזרם לפני רכיב ואחריו.' : 'מד זרם כבוי.', false, 3500);
});
$('btnStart').addEventListener('click', () => {
  sfx.unlock();
  showBrief();
});
$('btnGo').addEventListener('click', startPlay);
$('btnRetry').addEventListener('click', () => {
  sfx.setSiren(false);
  attempt++;
  game.retry(false);
  world.dispose();
  world = new WorldView(game, labelsEl);
  renderPass.scene = world.scene;
  renderPass.camera = world.camera;
  setScreen('play');
  updateBag(true);
});
const restart = () => {
  sfx.setSiren(false);
  const a = attempt + 1;
  const hs = hintsUsedThisLevel;
  loadLevel(levelIdx);
  attempt = a;
  hintsUsedThisLevel = hs;
  startPlay();
};
$('btnRestart').addEventListener('click', restart);
$('btnPauseRestart').addEventListener('click', restart);
$('btnReplay').addEventListener('click', restart);
$('btnNext').addEventListener('click', () => {
  loadLevel(Math.min(LEVELS.length - 1, levelIdx + 1));
  showBrief();
});
$('btnResume').addEventListener('click', () => setScreen('play'));
$('btnMenu').addEventListener('click', () => {
  sfx.setSiren(false);
  loadLevel(levelIdx);
  setScreen('title');
});
($('optReduced') as HTMLInputElement).addEventListener('change', (e) => {
  settings.reduced = (e.target as HTMLInputElement).checked;
  store.set('short-circuit-settings', settings);
});
$('btnMute').textContent = settings.muted ? '🔇' : '🔊';

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('glLost').classList.remove('hidden');
});
canvas.addEventListener('webglcontextrestored', () => {
  $('glLost').classList.add('hidden');
  const st = JSON.stringify(game.state);
  loadLevel(levelIdx);
  game.state = JSON.parse(st);
  game.refresh(true);
});

// ───────────────────────────── loop

function applyInput() {
  let ix = 0;
  let iy = 0;
  for (const [k, [x, y]] of Object.entries(MOVE_KEYS))
    if (keys.has(k)) {
      ix += x;
      iy += y;
    }
  const d = ix || iy ? world.screenToWorldDir(ix, iy) : { x: 0, y: 0 };
  game.moveIntent = { x: d.x, y: d.y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}

function tickSim(dt: number) {
  if (screen !== 'play') return;
  if (world.introActive) return;
  if (introWasActive) {
    introWasActive = false;
    maybeAutoHint('start');
  }
  applyInput();
  game.advance(dt);
  if (pendingInteract && !game.state.thief.path.length) {
    const tgt = game.interactTarget();
    if (tgt?.id === pendingInteract) interact();
    pendingInteract = null;
  }
  processEvents(game.drainEvents());
  if (game.state.panelOpen && !panelView) openPanelView(game.state.panelOpen);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
function draw(dt: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const want = screen === 'play' && !panelView && (scannerHeld || scannerToggle) ? 1 : 0;
  scan += (want - scan) * Math.min(1, dt * 8);
  if (Math.abs(want - scan) < 0.01) scan = want;
  sfx.setHum(scan);
  world.update(dt, { scanner: scan, reducedMotion: settings.reduced, attract: screen === 'title' || screen === 'brief' }, w, h);
  bloom.strength = panelView ? 0.3 : 0.55 + scan * 0.35;
  if (panelView) {
    panelView.update(dt, w, h, settings.reduced);
    renderPass.scene = panelView.scene;
    renderPass.camera = panelView.camera;
    composer.render();
    // live security-camera inset of the building, so every rewire shows its consequence
    const iw = Math.round(Math.min(380, w * 0.3));
    const ih = Math.round(iw * 0.62);
    renderer.setScissorTest(true);
    const narrow = w < 760;
    const ix = narrow ? 10 : w - 16 - iw;
    const iy = narrow ? h - 64 - ih : 122;
    renderer.setScissor(ix, iy, iw, ih);
    renderer.setViewport(ix, iy, iw, ih);
    const lab = $('pvInsetLabel');
    lab.style.left = `${ix}px`;
    lab.style.top = `${h - iy - ih - 20}px`;
    world.camera.aspect = iw / ih;
    world.camera.updateProjectionMatrix();
    renderer.render(world.scene, world.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderPass.scene = world.scene;
    renderPass.camera = world.camera;
  } else composer.render();
  updateHud();
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!externalClock) {
    if (hitStop > 0) {
      hitStop -= dt;
      tickSim(dt * 0.08);
    } else tickSim(dt);
  }
  draw(dt);
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 1) {
    fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
  requestAnimationFrame(frame);
}

// ───────────────────────────── automation hooks

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    __sc: unknown;
  }
}
window.render_game_to_text = () =>
  JSON.stringify({ screen, scanner: scan > 0.5, fps, hintAvailable: hintAvailable?.id ?? null, ...game.toText() });
window.advanceTime = (ms: number) => {
  externalClock = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) tickSim(1 / 60);
  draw(Math.min(0.5, ms / 1000));
};
// Debug handle for automated playtests (inputs only: same public actions a player has).
window.__sc = {
  get game() {
    return game;
  },
  get panel() {
    return panelView;
  },
  get world() {
    return world;
  },
  interact,
  closePanel,
  panelClickPart: (id: string) => {
    if (!panelView) return;
    panelView.selection = { type: 'part', id, circuit: '' };
    panelView.rebuild();
    renderInspector();
  },
  setScreen,
  startPlay,
  loadLevel,
};

loadLevel(levelIdx);
setScreen(params.has('play') ? 'play' : 'title');
if (params.has('play')) startPlay();
requestAnimationFrame(frame);
