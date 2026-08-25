import { describe, expect, it } from "vitest";
import { Animator, easeInOut, linear } from "./Animator";

describe("Animator", () => {
  it("accumulates ticks and applies easing to completion", async () => {
    const a = new Animator();
    const values: number[] = [];
    const p = a.tween(1, (v) => values.push(v), linear);
    a.tick(0.25);
    a.tick(0.25);
    expect(values.at(-1)).toBeCloseTo(0.5, 6);
    a.tick(0.6); // overshoot clamps to 1
    await p;
    expect(values.at(-1)).toBe(1);
    expect(a.active).toBe(false);
  });

  it("eased tweens still end exactly at 1", async () => {
    const a = new Animator();
    let last = 0;
    const p = a.tween(0.3, (v) => (last = v), easeInOut);
    a.tick(0.3);
    await p;
    expect(last).toBe(1);
  });

  it("fastForward finalizes and resolves every active tween", async () => {
    const a = new Animator();
    let v1 = 0;
    let v2 = 0;
    const p = Promise.all([a.tween(5, (v) => (v1 = v)), a.tween(9, (v) => (v2 = v))]);
    a.tick(0.1);
    a.fastForward();
    await p;
    expect(v1).toBe(1);
    expect(v2).toBe(1);
    expect(a.active).toBe(false);
  });

  it("instantMode completes tweens synchronously — chains need no ticks", async () => {
    const a = new Animator();
    a.instantMode = true;
    let done = false;
    const chain = (async () => {
      await a.tween(1, () => {});
      await a.delay(2);
      await a.tween(3, () => {});
      done = true;
    })();
    // No tick() calls at all — the hidden-tab degradation contract.
    await chain;
    expect(done).toBe(true);
    expect(a.active).toBe(false);
  });

  it("tweens registered during a tick start on the NEXT tick", () => {
    const a = new Animator();
    const childValues: number[] = [];
    void a.tween(0.1, () => {
      void a.tween(0.1, (v) => childValues.push(v), linear);
    });
    a.tick(0.1); // parent completes; child registered mid-tick
    // Child must NOT have been advanced by this same tick.
    expect(childValues.length).toBe(0);
    a.tick(0.05);
    expect(childValues.at(-1)).toBeCloseTo(0.5, 6);
  });
});
