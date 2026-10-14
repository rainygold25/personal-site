import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  SerialLink,
  decide,
  filterSamples,
  firstSample,
  isValid,
} from '../../src/sim/controller';

describe('isValid', () => {
  it('accepts readings inside the HC-SR04 range', () => {
    expect(isValid(2)).toBe(true);
    expect(isValid(150)).toBe(true);
    expect(isValid(400)).toBe(true);
  });

  it('rejects timeouts, out-of-range and non-finite values', () => {
    for (const bad of [null, 0, 1.9, 400.1, -5, NaN, Infinity]) {
      expect(isValid(bad)).toBe(false);
    }
  });
});

describe('filterSamples (three-sample validity filter)', () => {
  it('returns the median of three good readings', () => {
    expect(filterSamples([50, 48, 52])).toBe(50);
  });

  it('ignores a single phantom short echo', () => {
    // The original bug: one 4 cm glitch made the robot brake for nothing.
    expect(filterSamples([4, 80, 82])).toBe(80);
    expect(firstSample([4, 80, 82])).toBe(4);
  });

  it('with two survivors, keeps the larger so one glitch cannot cause a brake', () => {
    expect(filterSamples([null, 5, 90])).toBe(90);
  });

  it('returns null when every sample fails (edge case: total sensor failure)', () => {
    expect(filterSamples([null, null, null])).toBeNull();
    expect(filterSamples([0, 999, null])).toBeNull();
    expect(filterSamples([])).toBeNull();
  });
});

describe('decide', () => {
  it('drives forward when both sides are clear', () => {
    expect(decide([100, 100, 100], [120, 120, 120], 'STOP').command).toBe('FORWARD');
  });

  it('turns toward the side with more room', () => {
    expect(decide([90, 90, 90], [20, 20, 20], 'FORWARD').command).toBe('LEFT');
    expect(decide([20, 20, 20], [90, 90, 90], 'FORWARD').command).toBe('RIGHT');
  });

  it('reverses when boxed in on both sides', () => {
    expect(decide([8, 8, 8], [9, 9, 9], 'LEFT').command).toBe('REVERSE');
  });

  it('stops and retries when a sensor has totally failed', () => {
    const d = decide([null, null, null], [100, 100, 100], 'FORWARD');
    expect(d.command).toBe('STOP');
    expect(d.reason).toMatch(/stop and retry/);
  });

  it('holds the current turn when the sides are within the threshold (no oscillation)', () => {
    // 30 vs 25: right is slightly better, but not by the 15 cm threshold.
    expect(decide([25, 25, 25], [30, 30, 30], 'LEFT').command).toBe('LEFT');
    expect(decide([30, 30, 30], [25, 25, 25], 'RIGHT').command).toBe('RIGHT');
  });

  it('still switches sides when the difference clears the threshold', () => {
    expect(decide([15, 15, 15], [35, 35, 35], 'LEFT').command).toBe('RIGHT');
    expect(decide([35, 35, 35], [15, 15, 15], 'RIGHT').command).toBe('LEFT');
  });

  it('treats the safe distance boundary as clear', () => {
    const s = DEFAULT_CONFIG.safeDistance;
    expect(decide([s, s, s], [s, s, s], 'STOP').command).toBe('FORWARD');
    expect(decide([s - 1, s - 1, s - 1], [s, s, s], 'STOP').command).not.toBe('FORWARD');
  });

  it('brakes on a glitch only when the filter is turned off', () => {
    const left = [4, 100, 100];
    const right = [100, 100, 100];
    expect(decide(left, right, 'FORWARD').command).toBe('FORWARD');
    expect(decide(left, right, 'FORWARD', { ...DEFAULT_CONFIG, validityFilter: false }).command).not.toBe(
      'FORWARD',
    );
  });
});

describe('SerialLink', () => {
  it('sends newline-delimited JSON frames', () => {
    const link = new SerialLink();
    expect(link.send('FORWARD', 0)).toBe('{"t":0,"cmd":"FORWARD"}\n');
  });

  it('deduplicates repeated commands', () => {
    const link = new SerialLink(true, 0);
    for (let t = 0; t < 10; t++) link.send('FORWARD', t);
    expect(link.stats).toEqual({ sent: 1, suppressed: 9 });
  });

  it('throttles rapid changes but lets STOP through immediately', () => {
    const link = new SerialLink(true, 3);
    expect(link.send('FORWARD', 0)).not.toBeNull();
    expect(link.send('LEFT', 1)).toBeNull();
    expect(link.send('STOP', 1)).not.toBeNull();
    expect(link.send('LEFT', 4)).not.toBeNull();
  });

  it('sends every tick when dedupe is off (the saturated-link bug)', () => {
    const link = new SerialLink(false);
    for (let t = 0; t < 10; t++) link.send('FORWARD', t);
    expect(link.stats).toEqual({ sent: 10, suppressed: 0 });
  });

  it('keeps only the most recent frames', () => {
    const link = new SerialLink(false, 0, 5);
    for (let t = 0; t < 20; t++) link.send(t % 2 ? 'LEFT' : 'RIGHT', t);
    expect(link.frames).toHaveLength(5);
    expect(link.frames[4]).toContain('"t":19');
  });
});
