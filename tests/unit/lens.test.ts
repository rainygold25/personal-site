import { describe, expect, it } from 'vitest';
import { LENSES, LENS_INFO, PROJECTS } from '../../src/lens/data';
import { headlineFor, parseLens, projectsFor, resumeFor, withLens } from '../../src/lens/lens';

describe('parseLens', () => {
  it('reads a valid lens from the query string', () => {
    expect(parseLens('?lens=embedded')).toBe('embedded');
    expect(parseLens('?x=1&lens=Data')).toBe('data');
  });

  it('falls back to all for missing, empty or unknown values (edge case)', () => {
    expect(parseLens('')).toBe('all');
    expect(parseLens('?lens=')).toBe('all');
    expect(parseLens('?lens=hardware')).toBe('all');
    expect(parseLens('?lens=<script>')).toBe('all');
  });
});

describe('withLens', () => {
  it('sets and clears the lens without dropping other params', () => {
    expect(withLens('?ref=nobe', 'data')).toBe('?ref=nobe&lens=data');
    expect(withLens('?ref=nobe&lens=data', 'all')).toBe('?ref=nobe');
    expect(withLens('?lens=data', 'all')).toBe('');
  });

  it('round-trips with parseLens', () => {
    for (const lens of LENSES) expect(parseLens(withLens('', lens))).toBe(lens);
  });
});

describe('projectsFor', () => {
  it('shows every project for all', () => {
    expect(projectsFor('all')).toHaveLength(PROJECTS.length);
  });

  it('only shows projects tagged with the lens, in original order', () => {
    for (const lens of LENSES) {
      const shown = projectsFor(lens);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.every((p) => p.lenses.includes(lens))).toBe(true);
      const order = PROJECTS.filter((p) => p.lenses.includes(lens)).map((p) => p.id);
      expect(shown.map((p) => p.id)).toEqual(order);
    }
  });

  it('uses the lens-specific framing when there is one', () => {
    const robot = projectsFor('embedded').find((p) => p.id === 'winniewheels');
    expect(robot?.summary).toMatch(/PWM/);
    const robotAll = projectsFor('all').find((p) => p.id === 'winniewheels');
    expect(robotAll?.summary).not.toMatch(/PWM/);
  });

  it('returns an empty list when nothing matches (edge case)', () => {
    expect(projectsFor('data', [{ ...PROJECTS[0], lenses: ['embedded'] }])).toEqual([]);
  });
});

describe('headline and resume', () => {
  it('maps each lens to its own resume', () => {
    const hrefs = LENSES.map((l) => resumeFor(l).href);
    expect(new Set(hrefs).size).toBe(LENSES.length);
    expect(resumeFor('embedded').href).toBe(LENS_INFO.embedded.resume);
  });

  it('never links a resume file with a job ID in its name', () => {
    for (const lens of LENSES) expect(resumeFor(lens).href).not.toMatch(/job|\d{6,}/i);
  });

  it('changes the headline per lens', () => {
    const lines = new Set(['all' as const, ...LENSES].map(headlineFor));
    expect(lines.size).toBe(LENSES.length + 1);
  });
});
