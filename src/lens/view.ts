import { LENSES, LENS_INFO, type LensOrAll } from './data';
import { headlineFor, parseLens, projectsFor, resumeFor, skillsFor, withLens } from './lens';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountLens(): void {
  const buttons = $('lens-buttons');
  const options: LensOrAll[] = ['all', ...LENSES];

  for (const lens of options) {
    const b = el('button', 'lens-button', lens === 'all' ? 'All' : LENS_INFO[lens].label);
    b.type = 'button';
    b.dataset.lens = lens;
    b.addEventListener('click', () => apply(lens, true));
    buttons.append(b);
  }

  $('show-all').addEventListener('click', () => apply('all', true));
  window.addEventListener('popstate', () => apply(parseLens(location.search), false));
  apply(parseLens(location.search), false);
}

function apply(lens: LensOrAll, push: boolean): void {
  if (push) {
    const url = location.pathname + withLens(location.search, lens) + location.hash;
    history.pushState(null, '', url);
  }
  document.documentElement.dataset.lens = lens;

  for (const b of document.querySelectorAll<HTMLButtonElement>('.lens-button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lens === lens));
  }

  $('headline').textContent = headlineFor(lens);

  const skills = $('skills');
  skills.replaceChildren(...skillsFor(lens).map((s) => el('li', undefined, s)));

  const resume = resumeFor(lens);
  const link = $<HTMLAnchorElement>('resume-link');
  link.href = resume.href;
  link.textContent = resume.label;

  $('work-lens-label').textContent = lens === 'all' ? 'All work' : `${LENS_INFO[lens].label} lens`;

  const projects = projectsFor(lens);
  const list = $('projects');
  list.replaceChildren(
    ...projects.map((p) => {
      const li = el('li', 'project');
      li.dataset.id = p.id;
      const h = el('h3', undefined, p.title);
      const when = el('p', 'when', p.when);
      const summary = el('p', 'summary', p.summary);
      const stack = el('ul', 'stack');
      stack.setAttribute('aria-label', 'Tools');
      stack.append(...p.stack.map((s) => el('li', undefined, s)));
      li.append(h, when, summary, stack);
      if (p.link) {
        const a = el('a', 'project-link', p.link.label);
        a.href = p.link.href;
        li.append(a);
      }
      return li;
    }),
  );
  $('projects-empty').hidden = projects.length > 0;
}
