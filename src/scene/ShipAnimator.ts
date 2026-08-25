/**
 * The real MoveAnimator (replaces Phase 3's teleport). Beats per move type:
 *  - sail: turn toward heading → glide (rest-anchor tween ⇒ live buoyancy) →
 *    turn back, dropping wake puffs
 *  - knight/submarine: dive → travel submerged as a surface disturbance →
 *    resurface with foam
 *  - capture: muzzle flash + tracer → victim lists & sinks → attacker moves in
 *  - castling: king and rook sail simultaneously (Promise.all)
 *  - promotion: pawn submerges; after reconcile the chosen ship rises
 * After the beats, fleet.syncTo(move.fenAfter) reconciles — the rules position
 * stays authoritative no matter what the animation did.
 * Timing budget (plan): moves ≤ ~1.2s, captures ≤ ~2.5s.
 */
import type { Animator } from "../animation/Animator";
import { easeInOut, easeOut } from "../animation/Animator";
import type { AppliedMove } from "../game/ChessGame";
import type { MoveAnimator } from "../game/GameController";
import type { Fleet, ShipHandle } from "./Fleet";
import { squareToWorld } from "./Fleet";
import type { Effects } from "./effects/sprites";

const SAIL_TIME = 0.85;
const TURN_TIME = 0.18;
const SINK_TIME = 0.7;
const DIVE_DEPTH = 0.35;
const SINK_DEPTH = 0.8;

function lerpAngle(a: number, b: number, v: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * v;
}

export class ShipAnimator implements MoveAnimator {
  private readonly fleet: Fleet;
  private readonly animator: Animator;
  private readonly effects: Effects;
  private readonly now: () => number;
  private captured: Array<{ type: AppliedMove["piece"]; color: "w" | "b" }> = [];

  constructor(
    fleet: Fleet,
    animator: Animator,
    effects: Effects,
    now: () => number,
  ) {
    this.fleet = fleet;
    this.animator = animator;
    this.effects = effects;
    this.now = now;
  }

  async play(move: AppliedMove): Promise<void> {
    const mover = this.fleet.handleAt(move.from);
    if (!mover) {
      this.fleet.syncTo(move.fenAfter); // defensive: never desync the board
      return;
    }

    const jobs: Promise<void>[] = [];

    // Victim goes down while (or before) the attacker arrives.
    if (move.capturedSquare) {
      const victim = this.fleet.handleAt(move.capturedSquare);
      if (victim) {
        jobs.push(this.bombardAndSink(mover, victim));
      }
    }

    // The mover's leg — submarine dives, everything else sails.
    const leg =
      move.piece === "n"
        ? this.dive(mover, move.to)
        : this.sail(mover, move.to, move.capturedSquare ? 0.35 : 0);
    jobs.push(leg);

    // Castling: the rook's leg runs simultaneously.
    if (move.rookFrom && move.rookTo) {
      const rook = this.fleet.handleAt(move.rookFrom);
      if (rook) jobs.push(this.sail(rook, move.rookTo, 0));
    }

    // Promotion: the pawn slips under as it arrives.
    if (move.promotedTo) {
      jobs.push(
        (async () => {
          await this.animator.delay(SAIL_TIME * 0.7);
          await this.animator.tween(0.35, (v) =>
            mover.setSink(v * DIVE_DEPTH),
          );
          void this.effects.splash(...this.restOf(move.to), this.now(), 0.8);
        })(),
      );
    }

    await Promise.all(jobs);

    // Reconcile with the authoritative position; update the tally.
    if (move.capturedPiece) {
      this.captured.push({
        type: move.capturedPiece,
        color: move.color === "w" ? "b" : "w",
      });
    }
    this.fleet.syncTo(move.fenAfter);
    this.fleet.setCaptured(this.captured);

    // Promoted ship rises from the depths.
    if (move.promotedTo) {
      const risen = this.fleet.handleAt(move.to);
      if (risen) {
        risen.setSink(DIVE_DEPTH);
        void this.effects.splash(...this.restOf(move.to), this.now(), 1);
        await this.animator.tween(0.5, (v) =>
          risen.setSink(DIVE_DEPTH * (1 - v)),
        );
      }
    }
  }

  private restOf(square: string): [number, number] {
    const { x, z } = squareToWorld(square);
    return [x, z];
  }

  private async sail(
    handle: ShipHandle,
    to: string,
    departDelay: number,
  ): Promise<void> {
    if (departDelay > 0) await this.animator.delay(departDelay);
    const [tx, tz] = this.restOf(to);
    const fx = handle.restX;
    const fz = handle.restZ;
    const homeYaw = handle.yaw;
    // Ship-forward is -Z: heading yaw so that forward points along (dx, dz).
    const heading = Math.atan2(-(tx - fx), -(tz - fz));
    await this.animator.tween(TURN_TIME, (v) =>
      handle.setYaw(lerpAngle(homeYaw, heading, v)),
    );
    let lastPuff = 0;
    await this.animator.tween(
      SAIL_TIME,
      (v) => {
        handle.setRest(fx + (tx - fx) * v, fz + (tz - fz) * v);
        if (v - lastPuff > 0.18) {
          lastPuff = v;
          this.effects.puff(handle.restX, handle.restZ, this.now(), 0.45);
        }
      },
      easeInOut,
    );
    await this.animator.tween(TURN_TIME, (v) =>
      handle.setYaw(lerpAngle(heading, homeYaw, v)),
    );
  }

  private async dive(handle: ShipHandle, to: string): Promise<void> {
    const [tx, tz] = this.restOf(to);
    const fx = handle.restX;
    const fz = handle.restZ;
    void this.effects.splash(fx, fz, this.now(), 0.7);
    await this.animator.tween(0.3, (v) => handle.setSink(v * DIVE_DEPTH));
    let lastPuff = 0;
    await this.animator.tween(
      SAIL_TIME * 0.8,
      (v) => {
        handle.setRest(fx + (tx - fx) * v, fz + (tz - fz) * v);
        // The surface disturbance that explains the jump (plan: opaque water).
        if (v - lastPuff > 0.12) {
          lastPuff = v;
          this.effects.puff(handle.restX, handle.restZ, this.now(), 0.6);
        }
      },
      easeInOut,
    );
    await this.animator.tween(0.3, (v) =>
      handle.setSink(DIVE_DEPTH * (1 - v)),
    );
    void this.effects.splash(tx, tz, this.now(), 1);
  }

  private async bombardAndSink(
    attacker: ShipHandle,
    victim: ShipHandle,
  ): Promise<void> {
    const p = attacker.worldPosition();
    void this.effects.flash(p.x, p.y + 0.12, p.z);
    await this.animator.delay(0.15);
    void this.effects.splash(victim.restX, victim.restZ, this.now(), 1.2);
    const roll = (victim.color === "w" ? 1 : -1) * 0.5;
    await Promise.all([
      this.animator.tween(SINK_TIME, (v) => victim.setList(roll * v), easeOut),
      this.animator.tween(SINK_TIME, (v) => victim.setSink(v * SINK_DEPTH)),
    ]);
  }
}
