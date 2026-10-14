/**
 * A small 2D arena that stands in for the hardware: it produces ultrasonic
 * echoes (with optional noise) and applies motor commands to the robot pose.
 * Units are centimetres and degrees. Seeded, so every run is reproducible.
 */
import {
  type Command,
  type ControllerConfig,
  type Decision,
  type RawReading,
  DEFAULT_CONFIG,
  SENSOR_MAX_CM,
  SerialLink,
  decide,
} from './controller';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pose {
  x: number;
  y: number;
  /** Heading in degrees, 0 = +x, counter-clockwise positive (y up). */
  heading: number;
}

export const ARENA = { width: 300, height: 200 } as const;
export const ROBOT_RADIUS = 8;
/** Sensors are mounted angled out from the nose, like the real chassis. */
export const SENSOR_ANGLE = 25;
export const SAMPLES_PER_READ = 3;

const FORWARD_STEP = 4;
const REVERSE_STEP = 3;
const TURN_STEP = 12;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distance from (x, y) along `angle` to the first wall or box, capped at sensor range. */
export function castRay(x: number, y: number, angle: number, boxes: readonly Box[]): number {
  const dx = Math.cos(rad(angle));
  const dy = Math.sin(rad(angle));
  let best = SENSOR_MAX_CM + 1;

  // Arena walls.
  if (dx > 1e-9) best = Math.min(best, (ARENA.width - x) / dx);
  if (dx < -1e-9) best = Math.min(best, -x / dx);
  if (dy > 1e-9) best = Math.min(best, (ARENA.height - y) / dy);
  if (dy < -1e-9) best = Math.min(best, -y / dy);

  // Slab test against each axis-aligned box.
  for (const b of boxes) {
    let tmin = -Infinity;
    let tmax = Infinity;
    for (const [o, d, lo, hi] of [
      [x, dx, b.x, b.x + b.w],
      [y, dy, b.y, b.y + b.h],
    ] as const) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          tmin = Infinity;
          break;
        }
      } else {
        const t1 = (lo - o) / d;
        const t2 = (hi - o) / d;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
      }
    }
    if (tmin <= tmax && tmax >= 0) best = Math.min(best, Math.max(0, tmin));
  }
  return best;
}

export function collides(x: number, y: number, boxes: readonly Box[]): boolean {
  const r = ROBOT_RADIUS;
  if (x - r < 0 || y - r < 0 || x + r > ARENA.width || y + r > ARENA.height) return true;
  return boxes.some((b) => {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  });
}

export function applyCommand(
  pose: Pose,
  command: Command,
  boxes: readonly Box[],
): { pose: Pose; bumped: boolean } {
  let { x, y, heading } = pose;
  switch (command) {
    case 'LEFT':
      heading += TURN_STEP;
      break;
    case 'RIGHT':
      heading -= TURN_STEP;
      break;
    case 'FORWARD':
    case 'REVERSE': {
      const step = command === 'FORWARD' ? FORWARD_STEP : -REVERSE_STEP;
      const nx = x + step * Math.cos(rad(heading));
      const ny = y + step * Math.sin(rad(heading));
      if (collides(nx, ny, boxes)) return { pose, bumped: true };
      x = nx;
      y = ny;
      break;
    }
    case 'STOP':
      break;
  }
  heading = ((heading % 360) + 360) % 360;
  return { pose: { x, y, heading }, bumped: false };
}

export interface SimOptions {
  seed?: number;
  /** Probability (0..1) that any single echo is a glitch. */
  noise?: number;
  config?: Partial<ControllerConfig>;
  dedupe?: boolean;
  boxes?: Box[];
  start?: Pose;
  /** Simulate an unplugged sensor: every echo on that side times out. */
  faults?: Partial<SensorFaults>;
}

export interface SensorFaults {
  left: boolean;
  right: boolean;
}

export interface SimStats {
  ticks: number;
  distance: number;
  bumps: number;
  /** Ticks where noise made the robot do something other than what clean sensors called for. */
  phantomReactions: number;
  /** Times the command flipped LEFT<->RIGHT on consecutive decisions. */
  oscillations: number;
}

export const DEFAULT_BOXES: Box[] = [
  { x: 120, y: 60, w: 30, h: 80 },
  { x: 220, y: 20, w: 40, h: 40 },
  { x: 60, y: 140, w: 40, h: 25 },
];

export const DEFAULT_START: Pose = { x: 30, y: 40, heading: 0 };

export class Simulation {
  pose: Pose;
  boxes: Box[];
  noise: number;
  config: ControllerConfig;
  faults: SensorFaults;
  readonly link: SerialLink;
  readonly stats: SimStats = { ticks: 0, distance: 0, bumps: 0, phantomReactions: 0, oscillations: 0 };
  lastDecision: Decision | null = null;
  /** The command the motors are executing: the last one that made it over the link. */
  active: Command = 'STOP';
  private decided: Command = 'STOP';
  private cleanDecided: Command = 'STOP';
  private rng: () => number;

  constructor(opts: SimOptions = {}) {
    this.rng = mulberry32(opts.seed ?? 1);
    this.noise = opts.noise ?? 0;
    this.faults = { left: false, right: false, ...opts.faults };
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
    this.boxes = (opts.boxes ?? DEFAULT_BOXES).map((b) => ({ ...b }));
    this.pose = { ...(opts.start ?? DEFAULT_START) };
    this.link = new SerialLink(opts.dedupe ?? true);
  }

  /** Clean distance from each sensor, before noise. */
  trueDistances(): { left: number; right: number } {
    const { x, y, heading } = this.pose;
    return {
      left: castRay(x, y, heading + SENSOR_ANGLE, this.boxes),
      right: castRay(x, y, heading - SENSOR_ANGLE, this.boxes),
    };
  }

  private sample(distance: number, faulted: boolean): RawReading {
    if (faulted) return null;
    const echo = distance > SENSOR_MAX_CM ? null : distance;
    if (this.noise > 0 && this.rng() < this.noise) {
      // Half the glitches are timeouts, half are short phantom echoes.
      return this.rng() < 0.5 ? null : 3 + this.rng() * 5;
    }
    return echo;
  }

  step(): Decision {
    const { left, right } = this.trueDistances();
    const ls = Array.from({ length: SAMPLES_PER_READ }, () => this.sample(left, this.faults.left));
    const rs = Array.from({ length: SAMPLES_PER_READ }, () => this.sample(right, this.faults.right));

    const decision = decide(ls, rs, this.decided, this.config);
    const clean = decide([left], [right], this.cleanDecided, { ...this.config, validityFilter: false });
    if (decision.command !== clean.command) this.stats.phantomReactions++;
    if (
      (decision.command === 'LEFT' && this.decided === 'RIGHT') ||
      (decision.command === 'RIGHT' && this.decided === 'LEFT')
    ) {
      this.stats.oscillations++;
    }
    this.decided = decision.command;
    this.cleanDecided = clean.command;

    if (this.link.send(decision.command, this.stats.ticks) !== null) this.active = decision.command;

    const before = this.pose;
    const { pose, bumped } = applyCommand(this.pose, this.active, this.boxes);
    this.pose = pose;
    this.stats.distance += Math.hypot(pose.x - before.x, pose.y - before.y);
    if (bumped) this.stats.bumps++;
    this.stats.ticks++;
    this.lastDecision = decision;
    return decision;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step();
  }

  /** Toggle a 20 cm box centred on (x, y): removes one there if present, else adds one. */
  toggleBox(x: number, y: number): 'added' | 'removed' | 'blocked' {
    const hit = this.boxes.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit >= 0) {
      this.boxes.splice(hit, 1);
      return 'removed';
    }
    const box = { x: x - 10, y: y - 10, w: 20, h: 20 };
    if (collides(this.pose.x, this.pose.y, [box])) return 'blocked';
    this.boxes.push(box);
    return 'added';
  }
}
