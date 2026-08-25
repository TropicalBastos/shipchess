/**
 * Minimal promise-based tween engine. The render loop calls tick(dt) with the
 * CLAMPED frame delta (backgrounded tabs resume without a burst); sequencing
 * is plain async/await, parallelism is Promise.all — no timeline library.
 */

export type Ease = (t: number) => number;

export const easeInOut: Ease = (t) => t * t * (3 - 2 * t);
export const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t);
export const linear: Ease = (t) => t;

interface Tween {
  elapsed: number;
  duration: number;
  ease: Ease;
  onUpdate: (v: number) => void;
  resolve: () => void;
}

export class Animator {
  private tweens: Tween[] = [];

  /**
   * Instant mode: every tween completes synchronously. Enabled while the
   * document is hidden — rAF stops firing there, so a timed tween would dangle
   * until the tab is visible again; instant mode degrades to teleport moves.
   */
  instantMode = false;

  /** Animate v from 0→1 (eased) over `duration` seconds. */
  tween(
    duration: number,
    onUpdate: (v: number) => void,
    ease: Ease = easeInOut,
  ): Promise<void> {
    if (this.instantMode) {
      onUpdate(ease(1));
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tweens.push({ elapsed: 0, duration, ease, onUpdate, resolve });
    });
  }

  /** Resolve after `seconds` of animation time (not wall-clock). */
  delay(seconds: number): Promise<void> {
    return this.tween(seconds, () => {}, linear);
  }

  tick(dt: number): void {
    if (this.tweens.length === 0) return;
    const done: Tween[] = [];
    // Snapshot: a tween's onUpdate may register NEW tweens (wake puffs);
    // those start on the NEXT tick instead of double-advancing now (P4-05).
    for (const t of this.tweens.slice()) {
      t.elapsed = Math.min(t.elapsed + dt, t.duration);
      t.onUpdate(t.ease(t.duration === 0 ? 1 : t.elapsed / t.duration));
      if (t.elapsed >= t.duration) done.push(t);
    }
    if (done.length) {
      this.tweens = this.tweens.filter((t) => !done.includes(t));
      for (const t of done) t.resolve();
    }
  }

  /** Jump every active tween to its final state and resolve it. */
  fastForward(): void {
    const all = this.tweens;
    this.tweens = [];
    for (const t of all) {
      t.onUpdate(1);
      t.resolve();
    }
  }

  get active(): boolean {
    return this.tweens.length > 0;
  }
}
