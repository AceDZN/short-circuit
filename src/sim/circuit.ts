// Authoritative DC circuit solver for small resistive networks.
// Nodal analysis (Kirchhoff's current law at every node) on a graph of
// two-terminal elements. Batteries are ideal EMFs with a small internal
// resistance (Norton form), wires are ~0.01 Ω so a short circuit gives a
// huge but finite current, and fuses are conductors that open above a rating.
// No Three.js and no gameplay special cases live here.

export const WIRE_R = 0.01;
export const BATTERY_R = 0.02;
export const INSULATOR_R = 1e9;
/** Tiny leak from every node to ground so floating sub-networks stay solvable. */
const GMIN = 1e-9;

export type ElementKind = 'resistor' | 'battery' | 'fuse';

export interface Element {
  id: string;
  kind: ElementKind;
  /** Terminal node ids. For a battery, `a` is − and `b` is +. */
  a: string;
  b: string;
  /** Resistance in Ω (resistor, fuse). Batteries use BATTERY_R unless given. */
  r?: number;
  /** EMF in volts (battery). */
  v?: number;
  /** Current rating in A (fuse). The fuse melts when |I| exceeds it. */
  rating?: number;
  /** A blown fuse or an open element carries no current. */
  open?: boolean;
}

export interface ElementResult {
  /** Current in A flowing through the element from a to b (inside the element). */
  current: number;
  /** Potential difference V(a) − V(b) across the element terminals. */
  drop: number;
  /** Power dissipated in the element's resistance, W. */
  power: number;
}

export interface Solution {
  nodeVoltage: Map<string, number>;
  results: Map<string, ElementResult>;
  /** Fuses that melted during this solve, in the order they blew. */
  blown: string[];
  /** Current (A, magnitude) through each melted fuse just before it opened. */
  blownCurrent: Record<string, number>;
}

function elementR(e: Element): number {
  if (e.kind === 'battery') return e.r ?? BATTERY_R;
  if (e.kind === 'fuse') return e.r ?? WIRE_R;
  return e.r ?? WIRE_R;
}

/** Solve once with the given set of open elements. */
function solveLinear(elements: Element[], openSet: Set<string>) {
  const nodes = new Map<string, number>();
  const idx = (n: string) => {
    let i = nodes.get(n);
    if (i === undefined) {
      i = nodes.size;
      nodes.set(n, i);
    }
    return i;
  };
  for (const e of elements) {
    idx(e.a);
    idx(e.b);
  }
  const n = nodes.size;
  // Node 0 is ground. Unknowns are V1..V(n-1).
  const m = Math.max(n - 1, 0);
  const G: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const J: number[] = new Array(m).fill(0);
  const stamp = (i: number, j: number, g: number) => {
    if (i > 0) G[i - 1][i - 1] += g;
    if (j > 0) G[j - 1][j - 1] += g;
    if (i > 0 && j > 0) {
      G[i - 1][j - 1] -= g;
      G[j - 1][i - 1] -= g;
    }
  };
  for (let k = 1; k < n; k++) G[k - 1][k - 1] += GMIN;
  for (const e of elements) {
    if (e.open || openSet.has(e.id)) continue;
    const ia = nodes.get(e.a)!;
    const ib = nodes.get(e.b)!;
    if (ia === ib) continue;
    const g = 1 / elementR(e);
    stamp(ia, ib, g);
    if (e.kind === 'battery') {
      // Norton source: current V/r pushed from a (−) into b (+).
      const is = (e.v ?? 0) * g;
      if (ib > 0) J[ib - 1] += is;
      if (ia > 0) J[ia - 1] -= is;
    }
  }
  const x = gaussSolve(G, J);
  const volt = (name: string) => {
    const i = nodes.get(name)!;
    return i === 0 ? 0 : x[i - 1];
  };
  const results = new Map<string, ElementResult>();
  for (const e of elements) {
    const drop = volt(e.a) - volt(e.b);
    if (e.open || openSet.has(e.id) || e.a === e.b) {
      results.set(e.id, { current: 0, drop, power: 0 });
      continue;
    }
    const r = elementR(e);
    // Battery: internal current a→b is (V(a) − V(b) + emf) / r.
    const current = e.kind === 'battery' ? (drop + (e.v ?? 0)) / r : drop / r;
    results.set(e.id, { current, drop, power: current * current * r });
  }
  const nodeVoltage = new Map<string, number>();
  for (const name of nodes.keys()) nodeVoltage.set(name, volt(name));
  return { nodeVoltage, results };
}

/**
 * Solve the network. Fuses carrying more than their rating melt (one at a
 * time, the most overloaded first, re-solving after each) until stable.
 * Elements already marked open are respected; blown fuses are reported so
 * the caller can persist them.
 */
export function solve(elements: Element[]): Solution {
  const openSet = new Set<string>();
  const blown: string[] = [];
  const blownCurrent: Record<string, number> = {};
  for (let guard = 0; guard < elements.length + 1; guard++) {
    const sol = solveLinear(elements, openSet);
    let worst: Element | null = null;
    let worstRatio = 1;
    for (const e of elements) {
      if (e.kind !== 'fuse' || e.open || openSet.has(e.id) || e.rating === undefined) continue;
      const ratio = Math.abs(sol.results.get(e.id)!.current) / e.rating;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worst = e;
      }
    }
    if (!worst) return { ...sol, blown, blownCurrent };
    blownCurrent[worst.id] = Math.abs(sol.results.get(worst.id)!.current);
    openSet.add(worst.id);
    blown.push(worst.id);
  }
  return { ...solveLinear(elements, openSet), blown, blownCurrent };
}

/** Gaussian elimination with partial pivoting. Mutates copies only. */
export function gaussSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) continue;
    if (p !== c) [M[p], M[c]] = [M[c], M[p]];
    const piv = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = Math.abs(M[r][r]) < 1e-300 ? 0 : s / M[r][r];
  }
  return x;
}
