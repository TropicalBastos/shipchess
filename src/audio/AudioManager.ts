/**
 * All sound is SYNTHESIZED — no audio assets, matching the no-asset-pipeline
 * philosophy. The AudioContext is created lazily on the first user gesture
 * (autoplay policy); every method is a safe no-op headless or pre-unlock.
 * Cues per the plan: ambient waves, selection creak, move whoosh, cannon +
 * sinking on captures, sonar ping for the submarine, alarm on check.
 */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: { stop(): void } | null = null;
  private volume: number;

  constructor(volume = 0.8) {
    this.volume = volume;
  }

  /** Call on user gestures; idempotent, and resumes a suspended context
   * (Chrome may create contexts 'suspended' even post-gesture — P7-03). */
  unlock(): void {
    if (typeof AudioContext === "undefined") return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.startAmbient();
    } catch {
      this.ctx = null; // next gesture retries
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Brown-ish noise: integrate white noise for an ocean rumble.
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998;
      data[i] = last * 12;
    }
    return buf;
  }

  /** Endless low wash of filtered noise with a slow swell. */
  private startAmbient(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
    this.ambient = {
      stop: () => {
        src.stop();
        lfo.stop();
      },
    };
  }

  /** Short helper: an oscillator with a pitch/gain envelope. */
  private blip(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered-noise burst helper (whooshes, booms, bubbles). */
  private burst(
    filterType: BiquadFilterType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur + 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Rigging creak on ship selection. */
  creak(): void {
    this.blip("sawtooth", 90, 55, 0.12, 0.05);
  }

  /** Sail/engine whoosh for a normal move. */
  whoosh(): void {
    this.burst("bandpass", 300, 900, 0.5, 0.25);
  }

  /** Cannon report for a capture. */
  cannon(): void {
    this.blip("sine", 110, 36, 0.35, 0.5);
    this.burst("lowpass", 900, 120, 0.3, 0.5);
  }

  /** Bubbling descent for a sinking ship. */
  sink(): void {
    this.burst("bandpass", 700, 150, 0.9, 0.2);
    this.blip("sine", 220, 60, 0.9, 0.07);
  }

  /** Sonar ping for the submarine's dive. */
  sonar(): void {
    this.blip("sine", 780, 740, 0.5, 0.14);
    if (this.ctx) {
      setTimeout(() => this.blip("sine", 780, 740, 0.35, 0.05), 260);
    }
  }

  /** Two-tone alarm when a flagship comes under check. */
  alarm(): void {
    this.blip("square", 520, 520, 0.14, 0.06);
    if (this.ctx) {
      setTimeout(() => this.blip("square", 392, 392, 0.16, 0.06), 150);
    }
  }

  dispose(): void {
    this.ambient?.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
