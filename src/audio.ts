// Tiny WebAudio synth: every sound is generated, nothing is fetched.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  private env(freq: number, dur: number, type: OscillatorType, vol = 0.3, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol = 0.3, filter = 2000, delay = 0, q = 1) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filter;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  snip() {
    this.noise(0.05, 0.5, 5000, 0, 4);
    this.env(1800, 0.06, 'square', 0.08, -900);
  }
  join() {
    this.env(500, 0.08, 'triangle', 0.2, 300);
    this.env(900, 0.08, 'triangle', 0.15, 200, 0.06);
  }
  click() {
    this.env(900, 0.04, 'square', 0.08);
  }
  place() {
    this.env(300, 0.06, 'square', 0.15);
    this.noise(0.04, 0.3, 3000, 0.02, 3);
  }
  zap() {
    this.noise(0.25, 0.4, 3500, 0, 2);
    this.env(120, 0.25, 'sawtooth', 0.15, 60);
  }
  pop() {
    this.noise(0.35, 0.9, 1200, 0, 0.8);
    this.env(180, 0.3, 'square', 0.25, -150);
    this.noise(0.8, 0.15, 600, 0.15, 0.5);
  }
  door(open: boolean) {
    this.env(open ? 70 : 90, 0.9, 'sawtooth', 0.12, open ? 40 : -30);
    this.noise(0.9, 0.08, 400);
  }
  strain() {
    this.env(55, 0.7, 'sawtooth', 0.12, 10);
  }
  huh() {
    this.env(320, 0.12, 'triangle', 0.18, 120);
    this.env(440, 0.18, 'triangle', 0.16, 160, 0.13);
  }
  hey() {
    this.env(600, 0.08, 'square', 0.2, 300);
    this.env(900, 0.25, 'square', 0.2, -200, 0.09);
  }
  steal() {
    [660, 880, 1320].forEach((f, i) => this.env(f, 0.18, 'triangle', 0.2, 0, i * 0.07));
  }
  win() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.env(f, 0.22, 'triangle', 0.22, 0, i * 0.11));
  }
  trombone() {
    [392, 370, 349, 294].forEach((f, i) => this.env(f, i === 3 ? 0.8 : 0.32, 'sawtooth', 0.12, i === 3 ? -40 : 0, i * 0.33));
  }
  scanner(on: boolean) {
    this.env(on ? 300 : 700, 0.18, 'sine', 0.12, on ? 500 : -400);
  }
  step() {
    this.noise(0.04, 0.06, 900, 0, 2);
  }
  checkpoint() {
    this.env(784, 0.12, 'sine', 0.15);
    this.env(1175, 0.2, 'sine', 0.15, 0, 0.1);
  }

  /** Low mains hum while near live wires (scanner on). */
  setHum(level: number) {
    const c = this.ctx;
    if (!c || !this.master) return;
    if (!this.hum) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 50;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc.connect(f).connect(gain).connect(this.master);
      osc.start();
      this.hum = { osc, gain };
    }
    this.hum.gain.gain.setTargetAtTime(level * 0.05, c.currentTime, 0.1);
  }

  setSiren(on: boolean) {
    const c = this.ctx;
    if (!c || !this.master) return;
    if (on && !this.siren) {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 700;
      const lfo = c.createOscillator();
      lfo.frequency.value = 2.2;
      const lg = c.createGain();
      lg.gain.value = 260;
      lfo.connect(lg).connect(osc.frequency);
      const gain = c.createGain();
      gain.gain.value = 0.06;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, gain, lfo };
    } else if (!on && this.siren) {
      this.siren.osc.stop();
      this.siren.lfo.stop();
      this.siren = null;
    }
  }
}
