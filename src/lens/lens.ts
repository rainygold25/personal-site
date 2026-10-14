import { ALL_INFO, LENSES, LENS_INFO, PROJECTS, type Lens, type LensOrAll, type Project } from './data';

export function isLens(value: unknown): value is Lens {
  return typeof value === 'string' && (LENSES as readonly string[]).includes(value);
}

/** Reads `?lens=` from a query string. Unknown or missing values fall back to "all". */
export function parseLens(search: string): LensOrAll {
  const raw = new URLSearchParams(search).get('lens')?.trim().toLowerCase();
  return isLens(raw) ? raw : 'all';
}

/** Returns `search` with the lens set (or removed for "all"), keeping other params. */
export function withLens(search: string, lens: LensOrAll): string {
  const params = new URLSearchParams(search);
  if (lens === 'all') params.delete('lens');
  else params.set('lens', lens);
  const out = params.toString();
  return out ? `?${out}` : '';
}

export interface LensedProject extends Omit<Project, 'angle' | 'lenses'> {
  lenses: Lens[];
}

/** Projects relevant to a lens, with that lens's framing applied. */
export function projectsFor(lens: LensOrAll, projects: readonly Project[] = PROJECTS): LensedProject[] {
  return projects
    .filter((p) => lens === 'all' || p.lenses.includes(lens))
    .map(({ angle, ...p }) => ({
      ...p,
      summary: (lens !== 'all' && angle?.[lens]) || p.summary,
    }));
}

export function headlineFor(lens: LensOrAll): string {
  return lens === 'all' ? ALL_INFO.headline : LENS_INFO[lens].headline;
}

export function skillsFor(lens: LensOrAll): string[] {
  return lens === 'all' ? ALL_INFO.skills : LENS_INFO[lens].skills;
}

export function resumeFor(lens: LensOrAll): { href: string; label: string } {
  if (lens === 'all') return { href: LENS_INFO.software.resume, label: 'Download resume' };
  return { href: LENS_INFO[lens].resume, label: `Download ${LENS_INFO[lens].label.toLowerCase()} resume` };
}
