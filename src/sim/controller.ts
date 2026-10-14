/**
 * WinnieWheels control logic, ported from the robot's firmware/host split.
 *
 * Everything here is pure: no DOM, no timers, no randomness. The browser
 * sandbox and the unit tests drive the exact same functions, the same idea
 * as the team's hardware-free simulator ("identical code path").
 */

/** HC-SR04 datasheet range in centimetres. Anything outside is a bad echo. */
export const SENSOR_MIN_CM = 2;
export const SENSOR_MAX_CM = 400;

/** A raw echo: distance in cm, or null when the sensor timed out. */
export type RawReading = number | null;

export type Command = 'FORWARD' | 'LEFT' | 'RIGHT' | 'REVERSE' | 'STOP';

export interface ControllerConfig {
  /** Closer than this (cm) on either side means "obstacle ahead". */
  safeDistance: number;
  /** Closer than this on both sides means "boxed in": back up. */
  reverseDistance: number;
  /** Left/right must differ by at least this much (cm) before we pick a new turn side. */
  turnThreshold: number;
  /** Apply the three-sample validity filter. Off = trust the first sample (the original bug). */
  validityFilter: boolean;
}

export const DEFAULT_CONFIG: ControllerConfig = {
  safeDistance: 40,
  reverseDistance: 12,
  turnThreshold: 15,
  validityFilter: true,
};

export function isValid(reading: RawReading): reading is number {
  return reading !== null && Number.isFinite(reading) && reading >= SENSOR_MIN_CM && reading <= SENSOR_MAX_CM;
}

/**
 * Three-sample read with validity filtering.
 * Drops timed-out and out-of-range echoes, then takes the median of what is
 * left (with two survivors, the larger: a single short glitch must not cause
 * a brake). Returns null when every sample failed: the caller stops and retries.
 */
export function filterSamples(samples: readonly RawReading[]): number | null {
  const valid = samples.filter(isValid).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  if (valid.length === 2) return valid[1];
  return valid[Math.floor(valid.length / 2)];
}

/** Unfiltered read: what the firmware did before the fix. */
export function firstSample(samples: readonly RawReading[]): number | null {
  const first = samples[0];
  return isValid(first) ? first : null;
}

export interface Decision {
  command: Command;
  left: number | null;
  right: number | null;
  reason: string;
}

/**
 * Obstacle-avoidance policy.
 *
 * The difference-threshold rule is what ended left/right oscillation: when
 * the two sides are within `turnThreshold` of each other the robot keeps
 * turning the way it already was instead of flipping on sensor noise.
 */
export function decide(
  leftSamples: readonly RawReading[],
  rightSamples: readonly RawReading[],
  previous: Command,
  config: ControllerConfig = DEFAULT_CONFIG,
): Decision {
  const read = config.validityFilter ? filterSamples : firstSample;
  const left = read(leftSamples);
  const right = read(rightSamples);

  if (left === null || right === null) {
    return { command: 'STOP', left, right, reason: 'sensor failure: stop and retry' };
  }

  const nearest = Math.min(left, right);
  if (nearest >= config.safeDistance) {
    return { command: 'FORWARD', left, right, reason: 'path clear' };
  }
  if (left < config.reverseDistance && right < config.reverseDistance) {
    return { command: 'REVERSE', left, right, reason: 'boxed in' };
  }

  const diff = left - right;
  if (Math.abs(diff) < config.turnThreshold && (previous === 'LEFT' || previous === 'RIGHT')) {
    return { command: previous, left, right, reason: 'sides similar: hold turn' };
  }
  // Turn toward the side with more room. Ties go left, deterministically.
  const command: Command = diff >= 0 ? 'LEFT' : 'RIGHT';
  return { command, left, right, reason: `more room ${command.toLowerCase()}` };
}

export interface LinkStats {
  sent: number;
  suppressed: number;
}

/**
 * Host-to-firmware serial link with last-action deduplication and throttling.
 * A command goes over the wire only when it differs from the last one sent,
 * and never more often than once every `minInterval` ticks.
 */
export class SerialLink {
  private last: Command | null = null;
  private lastTick = -Infinity;
  readonly stats: LinkStats = { sent: 0, suppressed: 0 };
  readonly frames: string[] = [];

  constructor(
    private dedupe = true,
    private minInterval = 2,
    private maxFrames = 50,
  ) {}

  /** Returns the newline-delimited JSON frame that was sent, or null if suppressed. */
  send(command: Command, tick: number): string | null {
    const unchanged = command === this.last;
    const tooSoon = tick - this.lastTick < this.minInterval;
    // A STOP is safety-critical, so it bypasses the throttle (but not dedupe).
    if (this.dedupe && (unchanged || (tooSoon && command !== 'STOP'))) {
      this.stats.suppressed++;
      return null;
    }
    this.last = command;
    this.lastTick = tick;
    this.stats.sent++;
    const frame = JSON.stringify({ t: tick, cmd: command }) + '\n';
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) this.frames.shift();
    return frame;
  }

  setDedupe(on: boolean): void {
    this.dedupe = on;
  }
}
