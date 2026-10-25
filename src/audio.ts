// Tiny WebAudio synth: every sound and every note of music is generated in code, nothing is fetched.
//
// Graph:  one-shots -> sfxBus ----------------------------\
//         music layers (faders) -> musicBus ---------------+-> master (mute) -> limiter -> out
//         sends -> reverb (generated impulse) -> revOut --/

export type MusicMode = 'off' | 'menu' | 'sneak' | 'tension' | 'alarm' | 'win';

type LayerName = 'pad' | 'arp' | 'bass' | 'hat' | 'hat16' | 'vib' | 'drone' | 'alarm' | 'win';

interface Layer {
  input: AudioNode; // notes connect here
  fader: GainNode; // crossfaded per mode
  target: number;
  until: number; // keep scheduling notes until this time while fading out
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  musicSend: GainNode;
  rev: GainNode;
  noise: AudioBuffer;
  layers: Record<LayerName, Layer>;
}

interface ToneOpts {
  t?: number; // absolute start time (default: now)
  to?: number; // exponential pitch glide target (Hz) over the duration
  attack?: number;
  rev?: number; // reverb send amount
  lp?: number; // lowpass cutoff
  q?: number;
  bus?: AudioNode;
  detune?: number;
  pan?: number | [number, number];
  vib?: [number, number]; // vibrato [rate Hz, depth Hz]
}

interface NoiseOpts {
  t?: number;
  type?: BiquadFilterType;
  f?: number;
  q?: number;
  to?: number; // filter sweep target
  attack?: number;
  rev?: number;
  bus?: AudioNode;
  pan?: number | [number, number];
}

const BPM = 96;
const STEP = 60 / BPM / 4; // a sixteenth note
const BAR = STEP * 16;
const LOOKAHEAD = 0.12;
const MASTER = 0.6;
const MUSIC_LEVEL = 0.45; // music sits under the SFX
const NOISE_LEN = 2;

const LAYER_NAMES: LayerName[] = ['pad', 'arp', 'bass', 'hat', 'hat16', 'vib', 'drone', 'alarm', 'win'];
const LAYER_REV: Record<LayerName, number> = {
  pad: 0.5,
  arp: 0.6,
  bass: 0.06,
  hat: 0.1,
  hat16: 0.04,
  vib: 0.55,
  drone: 0.12,
  alarm: 0.08,
  win: 0.4,
};
const MIX: Record<MusicMode, Partial<Record<LayerName, number>>> = {
  off: {},
  menu: { pad: 1, arp: 0.8 },
  sneak: { bass: 1, hat: 1, vib: 1 },
  tension: { bass: 1, hat: 1, vib: 0.5, hat16: 1, drone: 1 },
  alarm: { alarm: 1 },
  win: { win: 1 },
};

// D minor, i - bVI - iv - V: Dm9, Bbmaj7, Gm7, A7b9. Pads are rootless 3-note voicings (the bass has the root);
// bass is a walking line with chromatic approaches into the next bar.
const CHORDS = [
  { pad: [53, 57, 64], bass: [38, 41, 45, 35] },
  { pad: [50, 53, 57], bass: [34, 38, 41, 44] },
  { pad: [50, 53, 58], bass: [43, 46, 41, 44] },
  { pad: [49, 55, 58], bass: [45, 49, 40, 39] },
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
const VIB_HITS: number[][] = [[6], [10], [6, 14], [3]];
const ALARM_ROOT = [38, 38, 39, 39];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const jit = (x: number, amt = 0.04) => x * (1 + (Math.random() * 2 - 1) * amt);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class Sfx {
  private g: Graph | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private musicMode: MusicMode = 'off';
  private appliedMode: MusicMode = 'off';
  private musicVolume = 0.7;
  private timer: number | null = null;
  private stepIdx = 0;
  private nextTime = 0;
  private tensionBars = 0;
  muted = false;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.g) {
      if (this.g.ctx.state === 'suspended') void this.g.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const gain = (v: number) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    const master = gain(this.muted ? 0 : MASTER);
    master.connect(limiter).connect(ctx.destination);

    const sfx = gain(1);
    sfx.connect(master);
    const musicLevel = this.musicVolume * MUSIC_LEVEL;
    const music = gain(musicLevel);
    music.connect(master);

    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(ctx, 1.8, 3);
    const rev = gain(1);
    const revOut = gain(0.3);
    rev.connect(conv).connect(revOut).connect(master);
    const musicSend = gain(musicLevel);
    musicSend.connect(rev);

    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_LEN), ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const layers = {} as Record<LayerName, Layer>;
    for (const name of LAYER_NAMES) {
      const fader = gain(0);
      fader.connect(music);
      const send = gain(LAYER_REV[name]);
      fader.connect(send).connect(musicSend);
      let input: AudioNode = fader;
      if (name === 'alarm') {
        // gritty: soft-clip the whole alarm layer, then tame the fizz
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 3);
        shaper.curve = curve;
        shaper.oversample = '2x';
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3200;
        shaper.connect(lp).connect(fader);
        input = shaper;
      }
      layers[name] = { input, fader, target: 0, until: 0 };
    }

    this.g = { ctx, master, sfx, music, musicSend, rev, noise, layers };
    if (this.musicMode !== 'off') this.applyMusic();
  }

  setMuted(m: boolean) {
    this.muted = m;
    const g = this.g;
    if (g) g.master.gain.setTargetAtTime(m ? 0 : MASTER, g.ctx.currentTime, 0.015);
  }

  // ---------------------------------------------------------------- primitives

  /** The graph, or null when muted / not unlocked (one-shots are skipped entirely then). */
  private live(): Graph | null {
    return this.g && !this.muted ? this.g : null;
  }

  private at(delay: number) {
    return (this.g ? this.g.ctx.currentTime : 0) + delay;
  }

  private impulse(ctx: AudioContext, dur: number, decay: number) {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Connects an envelope output to its bus (+ optional pan and reverb send). Returns extra nodes to clean up. */
  private route(g: Graph, out: AudioNode, t: number, dur: number, bus: AudioNode | undefined, rev: number | undefined, pan: number | [number, number] | undefined) {
    const extra: AudioNode[] = [];
    let node = out;
    if (pan !== undefined) {
      const p = g.ctx.createStereoPanner();
      if (Array.isArray(pan)) {
        p.pan.setValueAtTime(pan[0], t);
        p.pan.linearRampToValueAtTime(pan[1], t + dur);
      } else p.pan.value = pan;
      node.connect(p);
      node = p;
      extra.push(p);
    }
    node.connect(bus ?? g.sfx);
    if (rev) {
      const s = g.ctx.createGain();
      s.gain.value = rev;
      node.connect(s).connect(g.rev);
      extra.push(s);
    }
    return extra;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, o: ToneOpts = {}) {
    const g = this.live();
    if (!g) return;
    const c = g.ctx;
    const t = o.t ?? c.currentTime;
    const a = o.attack ?? 0.005;
    const end = t + Math.max(dur, a + 0.02);
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), end);
    if (o.detune) osc.detune.value = o.detune;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    const nodes: AudioNode[] = [osc, env];
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      f.Q.value = o.q ?? 0.7;
      osc.connect(f).connect(env);
      nodes.push(f);
    } else osc.connect(env);
    if (o.vib) {
      const lfo = c.createOscillator();
      lfo.frequency.value = o.vib[0];
      const depth = c.createGain();
      depth.gain.value = o.vib[1];
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end + 0.05);
      nodes.push(lfo, depth);
    }
    nodes.push(...this.route(g, env, t, end - t, o.bus, o.rev, o.pan));
    osc.start(t);
    osc.stop(end + 0.05);
    osc.onended = () => nodes.forEach((n) => n.disconnect());
  }

  private noise(dur: number, vol: number, o: NoiseOpts = {}) {
    const g = this.live();
    if (!g) return;
    const c = g.ctx;
    const t = o.t ?? c.currentTime;
    dur = Math.min(dur, NOISE_LEN - 0.2);
    const a = o.attack ?? 0.003;
    const end = t + Math.max(dur, a + 0.01);
    const src = c.createBufferSource();
    src.buffer = g.noise;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f ?? 2000, t);
    if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), end);
    f.Q.value = o.q ?? 1;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f).connect(env);
    const nodes: AudioNode[] = [src, f, env, ...this.route(g, env, t, end - t, o.bus, o.rev, o.pan)];
    src.start(t, Math.random() * (NOISE_LEN - (end - t) - 0.1), end - t + 0.05);
    src.onended = () => nodes.forEach((n) => n.disconnect());
  }

  /** Random tiny electric ticks scattered over `span` seconds. */
  private crackle(span: number, count: number, vol: number, t0 = this.at(0)) {
    for (let i = 0; i < count; i++) {
      this.noise(0.004 + Math.random() * 0.012, vol * (0.4 + Math.random() * 0.6), {
        t: t0 + Math.random() * span,
        type: 'highpass',
        f: 2500 + Math.random() * 5000,
        q: 0.7,
      });
    }
  }

  // ---------------------------------------------------------------- game SFX (existing API)

  snip() {
    this.noise(0.05, 0.45, { type: 'highpass', f: jit(4500, 0.1), q: 2 });
    this.tone(jit(2400), 0.05, 'square', 0.06, { to: 1100, lp: 5000 });
    this.tone(jit(3300, 0.06), 0.12, 'sine', 0.03, { rev: 0.2 });
  }
  join() {
    const p = jit(1, 0.03);
    this.tone(500 * p, 0.09, 'triangle', 0.2, { to: 800 * p });
    this.tone(900 * p, 0.14, 'triangle', 0.15, { to: 1100 * p, t: this.at(0.06), rev: 0.25 });
    this.noise(0.03, 0.12, { type: 'highpass', f: 6000, t: this.at(0.06) });
  }
  click() {
    this.tone(jit(900, 0.05), 0.04, 'square', 0.1, { lp: 3500 });
    this.noise(0.012, 0.08, { type: 'highpass', f: 5000 });
  }
  place() {
    this.tone(jit(190), 0.09, 'sine', 0.25, { to: 80 });
    this.tone(jit(320), 0.05, 'square', 0.06, { lp: 1500 });
    this.noise(0.04, 0.25, { f: 2800, q: 3, t: this.at(0.01) });
  }
  zap() {
    this.noise(0.28, 0.4, { f: jit(3500, 0.15), q: 2, to: 1800 });
    this.tone(jit(120), 0.28, 'sawtooth', 0.14, { to: 190, lp: 1800, q: 4 });
    this.crackle(0.25, 6, 0.25);
  }
  pop() {
    this.noise(0.35, 0.9, { type: 'lowpass', f: 1400, q: 0.8, rev: 0.35 });
    this.tone(jit(180), 0.3, 'square', 0.22, { to: 30, lp: 1200 });
    this.tone(60, 0.5, 'sine', 0.35, { to: 30 });
    this.noise(0.8, 0.15, { f: 600, q: 0.5, t: this.at(0.15) });
    this.crackle(0.4, 5, 0.2, this.at(0.05));
  }
  door(open: boolean) {
    const d = 0.9;
    this.tone(open ? 70 : 90, d, 'sawtooth', 0.1, { to: open ? 110 : 60, lp: 500, q: 3, attack: 0.08 });
    this.tone(open ? 140 : 180, d, 'sawtooth', 0.04, { to: open ? 220 : 120, lp: 700, detune: 7, attack: 0.08 });
    this.noise(d, 0.08, { f: 400, q: 0.8, attack: 0.1 });
    this.tone(95, 0.18, 'sine', 0.3, { to: 45, t: this.at(d - 0.05) });
    this.noise(0.06, 0.3, { type: 'lowpass', f: 900, t: this.at(d - 0.05), rev: 0.3 });
  }
  strain() {
    this.tone(55, 0.7, 'sawtooth', 0.1, { to: 65, lp: 350, q: 5, attack: 0.1 });
    this.tone(55.6, 0.7, 'sawtooth', 0.08, { to: 66, lp: 350, detune: -10, attack: 0.1 });
    this.noise(0.6, 0.04, { type: 'lowpass', f: 300, attack: 0.2 });
  }
  huh() {
    const p = jit(1, 0.06);
    this.tone(320 * p, 0.12, 'triangle', 0.18, { to: 440 * p, lp: 1600 });
    this.tone(440 * p, 0.2, 'triangle', 0.16, { to: 600 * p, t: this.at(0.13), lp: 1800 });
  }
  hey() {
    const p = jit(1, 0.05);
    this.tone(600 * p, 0.08, 'square', 0.16, { to: 900 * p, lp: 2500 });
    this.tone(900 * p, 0.25, 'square', 0.16, { to: 700 * p, t: this.at(0.09), lp: 2500, rev: 0.15 });
    this.tone(450 * p, 0.25, 'sawtooth', 0.06, { to: 350 * p, t: this.at(0.09), lp: 1200 });
  }
  steal() {
    [660, 880, 1320, 1760].forEach((f, i) => {
      this.tone(f, 0.22, 'triangle', 0.18, { t: this.at(i * 0.07), rev: 0.35 });
      this.tone(f * 2, 0.12, 'sine', 0.03, { t: this.at(i * 0.07) });
    });
    this.noise(0.5, 0.05, { type: 'highpass', f: 7000, attack: 0.15, t: this.at(0.1), rev: 0.3 });
  }
  win() {
    // D major so it leads into the 'win' music jingle
    [587, 740, 880, 1175, 880, 1175].forEach((f, i) => {
      const last = i === 5;
      this.tone(f, last ? 0.5 : 0.22, 'triangle', 0.2, { t: this.at(i * 0.11), rev: 0.3 });
      this.tone(f / 2, last ? 0.5 : 0.2, 'sine', 0.06, { t: this.at(i * 0.11) });
    });
  }
  trombone() {
    [392, 370, 349, 294].forEach((f, i) => {
      const last = i === 3;
      this.tone(f, last ? 0.8 : 0.32, 'sawtooth', 0.12, {
        t: this.at(i * 0.33),
        to: last ? f - 40 : undefined,
        lp: 1400,
        attack: 0.03,
        vib: last ? [6, 7] : undefined,
      });
    });
  }
  scanner(on: boolean) {
    this.tone(on ? 300 : 700, 0.18, 'sine', 0.12, { to: on ? 800 : 300 });
    this.noise(0.15, 0.05, { f: on ? 2000 : 1200, to: on ? 5000 : 600 });
  }
  step() {
    this.noise(0.04, 0.12, { f: jit(900, 0.1), q: 2 });
  }
  checkpoint() {
    this.tone(784, 0.15, 'sine', 0.15, { rev: 0.3 });
    this.tone(1175, 0.35, 'sine', 0.15, { t: this.at(0.1), rev: 0.4 });
    this.tone(2350, 0.2, 'sine', 0.03, { t: this.at(0.1) });
  }

  // ---------------------------------------------------------------- new SFX

  /** Soft shoe pad; louder and brighter when running. */
  footstep(run: boolean) {
    const v = run ? 0.11 : 0.06;
    this.noise(run ? 0.07 : 0.06, v, { type: 'lowpass', f: jit(run ? 1500 : 800, 0.12), q: 0.9 });
    this.tone(jit(run ? 95 : 80, 0.08), 0.07, 'sine', v * 1.4, { to: 50 });
    if (run) this.noise(0.02, v * 0.5, { type: 'highpass', f: 3500 });
  }

  /** Heavier, lower guard boot. */
  guardStep() {
    this.noise(0.09, 0.13, { type: 'lowpass', f: jit(450, 0.1), q: 1 });
    this.tone(jit(65, 0.06), 0.12, 'sine', 0.22, { to: 38 });
    this.noise(0.015, 0.05, { f: jit(2200, 0.1), q: 3, t: this.at(0.005) });
  }

  /** Rising electric "whoomp" with a sizzle tail (X-ray scanner opens). */
  scanSweep() {
    this.tone(80, 0.4, 'sawtooth', 0.12, { to: 900, lp: 2500, q: 6, attack: 0.05 });
    this.tone(55, 0.45, 'sine', 0.25, { to: 180, attack: 0.04 });
    this.noise(0.35, 0.08, { f: 400, to: 5000, q: 2, attack: 0.2 });
    this.noise(0.5, 0.08, { type: 'highpass', f: 6000, t: this.at(0.32), rev: 0.3 });
    this.crackle(0.5, 7, 0.12, this.at(0.3));
  }

  /** Short crackle. */
  spark() {
    this.crackle(0.12, 5, 0.3);
    this.tone(jit(4000, 0.2), 0.05, 'sine', 0.04);
    this.noise(0.08, 0.12, { type: 'highpass', f: 5000 });
  }

  uiHover() {
    this.tone(jit(1800, 0.02), 0.03, 'sine', 0.05);
  }

  uiSelect() {
    this.tone(1200, 0.05, 'triangle', 0.07);
    this.tone(1800, 0.08, 'triangle', 0.06, { t: this.at(0.045), rev: 0.15 });
    this.noise(0.01, 0.06, { type: 'highpass', f: 6000 });
  }

  /** Ascending results-screen chime, i = 0, 1, 2. */
  star(i: number) {
    const k = Math.max(0, Math.min(2, Math.round(i)));
    const f = midi([78, 81, 86][k]); // F#5, A5, D6
    this.tone(f, 1.0, 'sine', 0.16, { rev: 0.45 });
    this.tone(f * 2.76, 0.3, 'sine', 0.04); // bell partials
    this.tone(f * 5.4, 0.12, 'sine', 0.02);
    this.tone(f / 2, 0.5, 'triangle', 0.05);
    if (k === 2) {
      [2, 3, 4].forEach((m, j) => this.tone(f * m, 0.25, 'sine', 0.025, { t: this.at(0.06 + j * 0.05), rev: 0.4 }));
      this.noise(0.6, 0.04, { type: 'highpass', f: 7000, attack: 0.05, rev: 0.3 });
    }
  }

  /** Camera / intro swoosh. */
  whoosh() {
    this.noise(0.7, 0.3, { f: 250, to: 2200, q: 1.2, attack: 0.35, pan: [-0.6, 0.6] });
    this.tone(120, 0.6, 'sine', 0.06, { to: 60, attack: 0.3 });
  }

  /** The "!" moment: a sharp, dramatic stinger. */
  alertSting() {
    this.noise(0.08, 0.5, { type: 'highpass', f: 2000 });
    this.tone(130, 0.5, 'sine', 0.4, { to: 40 });
    // D + G# tritone stab with a high ping on top
    [74, 80, 86].forEach((n) => this.tone(midi(n), 0.6, 'sawtooth', 0.07, { lp: 3500, rev: 0.4 }));
    this.tone(midi(98), 0.7, 'sine', 0.08, { rev: 0.5 });
  }

  // ---------------------------------------------------------------- loops

  /** Low mains hum while near live wires (scanner on). */
  setHum(level: number) {
    const g = this.g;
    if (!g) return;
    const c = g.ctx;
    if (!this.hum) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 50;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc.connect(f).connect(gain).connect(g.sfx);
      osc.start();
      this.hum = { osc, gain };
    }
    this.hum.gain.gain.setTargetAtTime(level * 0.05, c.currentTime, 0.1);
  }

  setSiren(on: boolean) {
    const g = this.g;
    if (!g) return;
    const c = g.ctx;
    if (on && !this.siren) {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 700;
      const lfo = c.createOscillator();
      lfo.frequency.value = 2.2;
      const lg = c.createGain();
      lg.gain.value = 260;
      lfo.connect(lg).connect(osc.frequency);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      const gain = c.createGain();
      gain.gain.value = 0.06;
      osc.connect(f).connect(gain).connect(g.sfx);
      osc.start();
      lfo.start();
      osc.onended = () => [osc, lfo, lg, f, gain].forEach((n) => n.disconnect());
      this.siren = { osc, gain, lfo };
    } else if (!on && this.siren) {
      const t = c.currentTime;
      this.siren.gain.gain.setTargetAtTime(0, t, 0.02);
      this.siren.osc.stop(t + 0.12);
      this.siren.lfo.stop(t + 0.12);
      this.siren = null;
    }
  }

  // ---------------------------------------------------------------- adaptive music

  /** Switch music mode with ~0.6 s crossfades. The groove keeps its bar position between sneak/tension. */
  setMusic(mode: MusicMode) {
    this.musicMode = mode;
    if (this.g) this.applyMusic();
  }

  /** Music volume 0..1 (already mixed under the SFX). */
  setMusicVolume(v: number) {
    this.musicVolume = clamp01(v);
    const g = this.g;
    if (!g) return;
    const lvl = this.musicVolume * MUSIC_LEVEL;
    g.music.gain.setTargetAtTime(lvl, g.ctx.currentTime, 0.05);
    g.musicSend.gain.setTargetAtTime(lvl, g.ctx.currentTime, 0.05);
  }

  private applyMusic() {
    const g = this.g;
    if (!g) return;
    const mode = this.musicMode;
    if (mode === this.appliedMode) return;
    const prev = this.appliedMode;
    this.appliedMode = mode;
    const now = g.ctx.currentTime;
    const fromSilence = this.timer === null;
    const mix = MIX[mode];
    for (const name of LAYER_NAMES) {
      const L = g.layers[name];
      const target = mix[name] ?? 0;
      if (target === L.target) continue;
      if (target === 0) L.until = now + 1.5;
      L.target = target;
      const tau = name === 'win' ? 0.02 : fromSilence && target > 0 ? 0.08 : 0.2;
      L.fader.gain.setTargetAtTime(target, now, tau);
    }
    if (mode === 'tension' && prev !== 'tension') this.tensionBars = 0;
    if (mode === 'win') this.winJingle(now + 0.8);
    if (fromSilence && this.gridActive(now)) {
      this.stepIdx = 0;
      this.nextTime = now + 0.05;
      this.timer = window.setInterval(this.tick, 25);
      this.tick();
    }
  }

  /** Any step-driven layer audible or fading out? */
  private gridActive(now: number) {
    const g = this.g;
    if (!g) return false;
    return LAYER_NAMES.some((n) => n !== 'win' && (g.layers[n].target > 0 || now < g.layers[n].until));
  }

  private tick = () => {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (this.nextTime < now - 0.05) {
      // fell behind (background tab): jump ahead on the grid instead of bursting notes
      const skip = Math.ceil((now - this.nextTime) / STEP);
      this.stepIdx += skip;
      this.nextTime += skip * STEP;
    }
    while (this.nextTime < now + LOOKAHEAD) {
      this.playStep(this.stepIdx, this.nextTime);
      this.stepIdx++;
      this.nextTime += STEP;
    }
    if (!this.gridActive(now) && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  private playStep(s: number, t: number) {
    const g = this.g;
    if (!g || this.muted) return;
    const now = g.ctx.currentTime;
    const L = g.layers;
    const on = (n: LayerName) => L[n].target > 0 || now < L[n].until;
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const ch = CHORDS[bar];
    const swing = i % 4 === 2 ? STEP * 0.28 : 0;

    if (on('pad') && i === 0) this.padChord(ch.pad, t, L.pad.input);
    if (on('arp') && i % 2 === 0) {
      const notes = [...ch.pad.map((n) => n + 12), ch.pad[0] + 24];
      this.tone(midi(notes[ARP[i / 2]]), 0.5, 'triangle', 0.09, { t: t + swing, bus: L.arp.input, lp: 2200 });
    }
    if (on('bass') && i % 4 === 0) this.bassPluck(midi(ch.bass[i / 4]), t, L.bass.input);
    if (on('hat') && i % 2 === 0) {
      const off = i % 4 === 2; // brushed swish on the swung offbeat
      this.noise(off ? 0.12 : 0.035, off ? 0.18 : 0.1, {
        t: t + swing,
        f: off ? 7000 : 9000,
        q: 0.8,
        attack: off ? 0.02 : 0.002,
        bus: L.hat.input,
      });
    }
    if (on('hat16') && i % 2 === 1) this.noise(0.025, 0.08, { t, type: 'highpass', f: 8000, bus: L.hat16.input });
    if (on('vib') && VIB_HITS[bar].includes(i)) this.vibStab([ch.pad[1] + 12, ch.pad[2] + 12], t + swing, L.vib.input);
    if (on('drone') && i === 0) this.droneBar(midi(ch.bass[0]), t, L.drone.input);
    if (on('alarm')) this.alarmStep(i, bar, t, L.alarm.input);
  }

  private padChord(notes: number[], t: number, bus: AudioNode) {
    const g = this.live();
    if (!g) return;
    const c = g.ctx;
    const dur = BAR + 0.6;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.5;
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(1100, t + BAR / 2);
    f.frequency.linearRampToValueAtTime(700, t + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.07, t + 0.9);
    env.gain.setValueAtTime(0.07, t + BAR - 0.2);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(env).connect(bus);
    const oscs = notes.map((n, k) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = k % 2 ? 7 : -7;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    });
    oscs[0].onended = () => [...oscs, f, env].forEach((n) => n.disconnect());
  }

  private bassPluck(freq: number, t: number, bus: AudioNode) {
    const g = this.live();
    if (!g) return;
    const c = g.ctx;
    const end = t + 0.42;
    const saw = c.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = freq;
    const sub = c.createOscillator();
    sub.frequency.value = freq;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.15);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.3, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    saw.connect(lp);
    sub.connect(lp);
    lp.connect(env).connect(bus);
    saw.start(t);
    sub.start(t);
    saw.stop(end + 0.05);
    sub.stop(end + 0.05);
    saw.onended = () => [saw, sub, lp, env].forEach((n) => n.disconnect());
  }

  private vibStab(notes: number[], t: number, bus: AudioNode) {
    for (const n of notes) {
      this.tone(midi(n), 1.1, 'sine', 0.1, { t, bus });
      this.tone(midi(n) * 4, 0.18, 'sine', 0.025, { t, bus }); // tine
    }
  }

  /** Tension: pulsing low saw drone with a filter that opens over the bar, and further each bar. */
  private droneBar(freq: number, t: number, bus: AudioNode) {
    const g = this.live();
    if (!g) return;
    const c = g.ctx;
    const end = t + BAR;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = freq * 2;
    o2.detune.value = 8;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    const base = 250 + this.tensionBars * 120;
    lp.frequency.setValueAtTime(base, t);
    lp.frequency.exponentialRampToValueAtTime(base * 3.2, end);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    const e = STEP * 2;
    for (let k = 0; k < 8; k++) {
      const tk = t + k * e;
      env.gain.linearRampToValueAtTime(0.09, tk + 0.015);
      env.gain.exponentialRampToValueAtTime(0.015, tk + e * 0.95);
    }
    env.gain.linearRampToValueAtTime(0.0001, end + 0.02);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(env).connect(bus);
    o1.start(t);
    o2.start(t);
    o1.stop(end + 0.05);
    o2.stop(end + 0.05);
    o1.onended = () => [o1, o2, lp, env].forEach((n) => n.disconnect());
    if (g.layers.drone.target > 0) this.tensionBars = Math.min(this.tensionBars + 1, 4);
  }

  /** Alarm: driven 16th-note pulse, kick on the beat, tritone stab each bar (through the layer's distortion). */
  private alarmStep(i: number, bar: number, t: number, bus: AudioNode) {
    const root = midi(ALARM_ROOT[bar]);
    const accent = i % 4 === 0;
    this.tone(root, 0.11, 'sawtooth', accent ? 0.22 : 0.12, { t, bus, lp: accent ? 1800 : 1100, q: 4 });
    if (accent) this.tone(150, 0.2, 'sine', 0.5, { t, to: 42, bus });
    if (i === 0) [root * 4, root * 4 * Math.SQRT2].forEach((f) => this.tone(f, 0.35, 'square', 0.06, { t, bus, lp: 3000 }));
    if (i === 8) this.tone(root * 2, 0.1, 'sawtooth', 0.15, { t, bus, lp: 2000 });
    if (i === 4 || i === 12) this.noise(0.1, 0.25, { t, f: 1800, q: 0.8, bus });
  }

  /** Short D-major fanfare, then silence. */
  private winJingle(t0: number) {
    const g = this.live();
    if (!g) return;
    const bus = g.layers.win.input;
    const u = 0.11;
    const lead: [number, number, number][] = [
      [69, 0, 1],
      [74, 1, 1],
      [78, 2, 1],
      [81, 3, 2],
      [79, 5, 1],
      [81, 6, 1],
      [86, 7, 10],
    ];
    for (const [n, at, len] of lead) {
      const last = len > 2;
      this.tone(midi(n), len * u, 'square', 0.08, { t: t0 + at * u, bus, lp: 2600, vib: last ? [5.5, 4] : undefined });
      this.tone(midi(n - 12), len * u, 'triangle', 0.08, { t: t0 + at * u, bus });
    }
    const hit = t0 + 7 * u;
    [62, 66, 69, 74].forEach((n) => this.tone(midi(n), 1.6, 'sawtooth', 0.045, { t: hit, bus, lp: 1500, attack: 0.02 }));
    this.bassPluck(midi(45), t0 + 3 * u, bus);
    this.bassPluck(midi(38), hit, bus);
    this.noise(0.08, 0.2, { t: t0 + 5 * u, f: 1800, q: 0.8, bus });
    this.noise(0.08, 0.25, { t: t0 + 6 * u, f: 1800, q: 0.8, bus });
    this.tone(150, 0.25, 'sine', 0.45, { t: hit, to: 42, bus });
    this.tone(midi(98), 0.9, 'sine', 0.05, { t: hit, bus });
    this.noise(1.2, 0.05, { t: hit, type: 'highpass', f: 7000, attack: 0.05, bus });
  }
}
