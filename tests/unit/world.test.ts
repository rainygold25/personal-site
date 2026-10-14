import { describe, expect, it } from 'vitest';
import {
  ARENA,
  ROBOT_RADIUS,
  Simulation,
  applyCommand,
  castRay,
  collides,
  mulberry32,
} from '../../src/sim/world';

describe('castRay', () => {
  it('measures distance to the arena wall', () => {
    expect(castRay(100, 100, 0, [])).toBeCloseTo(ARENA.width - 100);
    expect(castRay(100, 100, 180, [])).toBeCloseTo(100);
  });

  it('hits the nearest box in the beam', () => {
    const boxes = [{ x: 150, y: 90, w: 10, h: 20 }];
    expect(castRay(100, 100, 0, boxes)).toBeCloseTo(50);
    expect(castRay(100, 100, 90, boxes)).toBeCloseTo(ARENA.height - 100);
  });
});

describe('collides', () => {
  it('detects walls and boxes', () => {
    expect(collides(ROBOT_RADIUS - 1, 50, [])).toBe(true);
    expect(collides(50, 50, [])).toBe(false);
    expect(collides(50, 50, [{ x: 55, y: 45, w: 10, h: 10 }])).toBe(true);
  });
});

describe('applyCommand', () => {
  it('moves forward along the heading', () => {
    const { pose } = applyCommand({ x: 50, y: 50, heading: 0 }, 'FORWARD', []);
    expect(pose.x).toBeGreaterThan(50);
    expect(pose.y).toBeCloseTo(50);
  });

  it('wraps heading into [0, 360)', () => {
    expect(applyCommand({ x: 50, y: 50, heading: 5 }, 'RIGHT', []).pose.heading).toBe(353);
  });

  it('refuses to drive into a wall', () => {
    const start = { x: ARENA.width - ROBOT_RADIUS - 1, y: 50, heading: 0 };
    const { pose, bumped } = applyCommand(start, 'FORWARD', []);
    expect(bumped).toBe(true);
    expect(pose).toEqual(start);
  });
});

describe('Simulation', () => {
  it('is deterministic for a given seed', () => {
    const a = new Simulation({ seed: 7, noise: 0.2 });
    const b = new Simulation({ seed: 7, noise: 0.2 });
    a.run(200);
    b.run(200);
    expect(a.pose).toEqual(b.pose);
    expect(a.stats).toEqual(b.stats);
    expect(mulberry32(3)()).toBe(mulberry32(3)());
  });

  it('explores the default arena without ever hitting anything', () => {
    const sim = new Simulation({ seed: 1 });
    sim.run(500);
    expect(sim.stats.bumps).toBe(0);
    expect(sim.stats.distance).toBeGreaterThan(200);
  });

  it('the validity filter cuts phantom reactions under noise', () => {
    const run = (validityFilter: boolean) => {
      const sim = new Simulation({ seed: 42, noise: 0.15, config: { validityFilter } });
      sim.run(400);
      return sim.stats.phantomReactions;
    };
    expect(run(true)).toBeLessThan(run(false) / 3);
  });

  it('dedupe keeps serial traffic far below one frame per tick', () => {
    const sim = new Simulation({ seed: 5 });
    sim.run(300);
    expect(sim.link.stats.sent).toBeLessThan(300 / 3);
    const noisy = new Simulation({ seed: 5, dedupe: false });
    noisy.run(300);
    expect(noisy.link.stats.sent).toBe(300);
  });

  it('stops in place when a sensor is unplugged (edge case: total sensor failure)', () => {
    const sim = new Simulation({ seed: 3 });
    sim.run(10);
    sim.faults.left = true;
    sim.step();
    const stoppedAt = { ...sim.pose };
    sim.run(20);
    expect(sim.lastDecision?.command).toBe('STOP');
    expect(sim.active).toBe('STOP');
    expect(sim.pose).toEqual(stoppedAt);
    expect(sim.link.frames.at(-1)).toContain('"cmd":"STOP"');
  });

  it('resumes once the sensor is reconnected', () => {
    const sim = new Simulation({ seed: 3, faults: { left: true } });
    sim.run(5);
    expect(sim.stats.distance).toBe(0);
    sim.faults.left = false;
    sim.run(20);
    expect(sim.stats.distance).toBeGreaterThan(0);
  });

  it('toggles obstacles but never drops one on the robot', () => {
    const sim = new Simulation({ boxes: [] });
    expect(sim.toggleBox(200, 150)).toBe('added');
    expect(sim.boxes).toHaveLength(1);
    expect(sim.toggleBox(205, 155)).toBe('removed');
    expect(sim.boxes).toHaveLength(0);
    expect(sim.toggleBox(sim.pose.x, sim.pose.y)).toBe('blocked');
    expect(sim.boxes).toHaveLength(0);
  });
});
