// Test driver: plays the game only through public inputs (walk, interact, panel actions, time).
import { Game } from '../src/sim/game';
import type { ItemKind, LevelDef, Tile } from '../src/sim/types';

export class Bot {
  g: Game;
  constructor(level: LevelDef) {
    this.g = new Game(level);
  }
  get s() {
    return this.g.state;
  }
  get ok() {
    return this.s.status === 'playing';
  }
  wait(seconds: number) {
    for (let t = 0; t < seconds && this.s.status === 'playing'; t += 0.05) this.g.advance(0.05);
    return this;
  }
  /** Click-to-move to a tile and walk until arrived (or the heist ends). */
  walk(tile: Tile, maxSeconds = 40) {
    this.g.moveTo(tile);
    if (!this.s.thief.path.length && (Math.floor(this.s.thief.x) !== tile[0] || Math.floor(this.s.thief.y) !== tile[1]))
      throw new Error(`no path to ${tile} from ${this.s.thief.x},${this.s.thief.y}`);
    for (let t = 0; t < maxSeconds && this.s.status === 'playing'; t += 0.05) {
      this.g.advance(0.05);
      if (!this.s.thief.path.length) break;
    }
    return this;
  }
  /** Walk a sequence of tiles. */
  route(...tiles: Tile[]) {
    for (const t of tiles) if (this.ok) this.walk(t);
    return this;
  }
  /** Walk to a panel, open it, run the edits, close it. */
  panel(id: string, edits: (b: Bot) => void) {
    const p = this.g.panel(id);
    this.walk(p.front);
    if (!this.ok) return this;
    if (!this.g.interact() || this.s.panelOpen !== id) throw new Error(`could not open ${id}`);
    edits(this);
    this.g.closePanel();
    return this;
  }
  cut(part: string) {
    if (!this.g.toggleCut(part)) throw new Error(`cannot cut ${part}`);
    return this;
  }
  place(item: ItemKind, circuit: string, a: string, b: string) {
    const id = this.g.placeItem(item, circuit, a, b);
    if (!id) throw new Error(`cannot place ${item} on ${circuit}:${a}-${b}`);
    return id;
  }
  use() {
    if (!this.g.interact()) throw new Error(`nothing to interact with at ${this.s.thief.x},${this.s.thief.y}`);
    return this;
  }
  /** Wait until a guard reaches a mode (or time runs out). */
  waitGuard(id: string, mode: string, maxSeconds = 30) {
    for (let t = 0; t < maxSeconds && this.ok; t += 0.05) {
      if (this.s.guards.find((g) => g.id === id)!.mode === mode) break;
      this.g.advance(0.05);
    }
    return this;
  }
}
