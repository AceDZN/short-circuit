// Level and state types. Pure data; no rendering.

export type Tile = [number, number];

export type ItemKind =
  | 'wire'
  | 'coin'
  | 'pencil'
  | 'glove'
  | 'rubberBand'
  | 'ruler'
  | 'sponge'
  | 'res3'
  | 'res6'
  | 'res12'
  | 'bat6'
  | 'bat12'
  | 'fuse';

export type PartKind =
  | 'battery'
  | 'mains'
  | 'wire'
  | 'lamp'
  | 'camera'
  | 'laser'
  | 'motor'
  | 'sensor'
  | 'relay'
  | 'buzzer'
  | 'fuse'
  | 'resistor'
  | 'cable'
  | 'item';

export interface PartDef {
  id: string;
  kind: PartKind;
  /** Terminal nodes. Batteries: a = − , b = +. */
  a: string;
  b: string;
  r?: number;
  v?: number;
  rating?: number;
  /** Short Hebrew label drawn on the panel board. */
  label: string;
  /** Wires the player may snip and re-join at the panel. */
  cuttable?: boolean;
  /** Components the player may pull out into the bag. */
  removable?: boolean;
  /** Item the part becomes when removed. */
  itemKind?: ItemKind;
  /** Panel where this part can be edited (defaults to the circuit's panel). */
  panel?: string;
}

export interface CircuitDef {
  id: string;
  name: string;
  /** Wire colour in the scanner (hex). */
  color: number;
  /** The panel where this circuit's terminals are reachable. */
  panel: string;
  /** Node positions on the panel board, in board units (x 0..12 right→left is irrelevant; y 0..7 top→bottom). */
  nodes: Record<string, [number, number]>;
  parts: PartDef[];
  /** Nodes where the player may attach items. Defaults to every node. */
  terminals?: string[];
  /** Show the power budget (P = V·I) of the source on the board. */
  showPower?: boolean;
}

export type DeviceDef =
  | { kind: 'lamp'; id: string; part: string; tile: Tile; radius: number; zone: string; threshold: number; style?: 'ceiling' | 'display' | 'chandelier' | 'wall' }
  | { kind: 'camera'; id: string; part: string; tile: Tile; facing: number; sweep: number; period: number; range: number; threshold: number }
  | { kind: 'laser'; id: string; part: string; from: Tile; to: Tile; threshold: number }
  | { kind: 'door'; id: string; part: string; tiles: Tile[]; threshold: number; label: string }
  | { kind: 'window'; id: string; part: string; tile: Tile }
  | { kind: 'alarm'; id: string; part: string; tile: Tile; threshold: number }
  | { kind: 'hazard'; id: string; part: string; tiles: Tile[]; threshold: number };

export interface PanelDef {
  id: string;
  /** The wall tile the panel is mounted on. */
  tile: Tile;
  /** The floor tile the thief stands on to use it. */
  front: Tile;
  label: string;
  /** Circuits drawn on this panel's board. */
  circuits: string[];
  style?: 'panel' | 'fusebox';
}

export interface GuardWaypoint {
  x: number;
  y: number;
  /** Seconds to wait here. */
  wait?: number;
  /** Heading (radians, 0 = +x, π/2 = +y) to look at while waiting. */
  face?: number;
}

export interface GuardDef {
  id: string;
  route: GuardWaypoint[];
  speed?: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  rect: [number, number, number, number];
  /** Where a guard walks to look around when this zone goes dark. */
  investigate: Tile;
  /** Guards who notice when this zone goes completely dark. */
  watchers: string[];
}

export interface ExhibitDef {
  id: string;
  tile: Tile;
  name: string;
  model: 'pile' | 'bulb' | 'coil' | 'generator' | 'crown';
  /** If the exhibit is itself a circuit part (e.g. the gem bulb), taking it opens that part. */
  part?: string;
  zone?: string;
  required?: boolean;
}

export interface HintDef {
  id: string;
  text: string;
  /** When the hint becomes relevant. */
  when: 'start' | 'nearPanel' | 'inPanel' | 'afterFail' | 'idle';
  panel?: string;
  fail?: FailReason;
}

export interface LevelDef {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  concept: string;
  /** Rows of tiles. '#' wall, '.' floor, ' ' outside/void (walkable courtyard uses ','), '~' puddle, 'g' glass case, 'w' window frame wall. */
  map: string[];
  start: Tile;
  startFacing?: number;
  exit: Tile;
  theme: 'museum' | 'courtyard' | 'vault';
  zones: ZoneDef[];
  circuits: CircuitDef[];
  panels: PanelDef[];
  devices: DeviceDef[];
  guards: GuardDef[];
  exhibits: ExhibitDef[];
  bag: ItemKind[];
  hints: HintDef[];
  checkpoints?: { rect: [number, number, number, number] }[];
  noHints?: boolean;
  parSeconds: number;
  /** Short worked explanation per failure type, shown after the funny consequence. */
  explain: Partial<Record<FailReason, string>>;
  /** Purely decorative exhibits (on 'g' pedestal tiles); never part of the heist. */
  props?: { tile: Tile; model: ExhibitDef['model'] }[];
  /** Moonlit floor tiles stay dark; "ambient" lit areas (e.g. a lit hallway not on any circuit). */
  alwaysLit?: [number, number, number, number][];
}

export type FailReason = 'caught' | 'camera' | 'laser' | 'alarm' | 'pedestal' | 'shock' | 'fire';

export interface PlacedPart {
  id: string;
  item: ItemKind;
  circuit: string;
  a: string;
  b: string;
}

export type GuardMode = 'patrol' | 'suspicious' | 'investigate' | 'look' | 'toPanel' | 'repair' | 'return' | 'busted';

export interface GuardTask {
  kind: 'zone' | 'fuse' | 'noise';
  zone?: string;
  panel?: string;
  fusePart?: string;
  point: Tile;
  attempt: number;
}

export interface GuardState {
  id: string;
  x: number;
  y: number;
  heading: number;
  routeIdx: number;
  wait: number;
  mode: GuardMode;
  timer: number;
  path: Tile[];
  task: GuardTask | null;
  bark: '' | '?' | '!' | '!!' | 'zzz' | 'fix';
  barkTimer: number;
  /** 0..1 how sure this guard is that he sees someone. */
  notice: number;
  moving: boolean;
}

export interface PartState {
  open: boolean;
  removed: boolean;
  blown: boolean;
}

export interface GameEvent {
  type:
    | 'snip'
    | 'join'
    | 'place'
    | 'pickup'
    | 'remove'
    | 'fuseBlown'
    | 'fuseReplaced'
    | 'doorOpen'
    | 'doorClose'
    | 'doorStrain'
    | 'zoneDark'
    | 'zoneLit'
    | 'bark'
    | 'repair'
    | 'window'
    | 'steal'
    | 'fail'
    | 'win'
    | 'checkpoint'
    | 'spark'
    | 'noise'
    | 'hint';
  id?: string;
  x?: number;
  y?: number;
  text?: string;
}
