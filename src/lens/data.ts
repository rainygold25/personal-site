/** Site content. One place to edit; the role lens decides what to emphasize. */

export const LENSES = ['software', 'embedded', 'data'] as const;
export type Lens = (typeof LENSES)[number];
export type LensOrAll = Lens | 'all';

export interface LensInfo {
  label: string;
  headline: string;
  resume: string;
  skills: string[];
}

export const LENS_INFO: Record<Lens, LensInfo> = {
  software: {
    label: 'Software',
    headline: 'I build software from design through operation, and I test it before I trust it.',
    resume: 'resume/ranya-prasad-software.pdf',
    skills: ['Java', 'Python', 'C++', 'TypeScript', 'REST APIs', 'AWS', 'Terraform', 'GitHub Actions'],
  },
  embedded: {
    label: 'Embedded',
    headline:
      'I write the first layer of code on the device: firmware that stays safe when the network drops.',
    resume: 'resume/ranya-prasad-embedded.pdf',
    skills: ['C', 'C++', 'Arduino', 'Raspberry Pi', 'UART', 'PWM motor control', 'Sensor filtering'],
  },
  data: {
    label: 'Data',
    headline: 'I put correctness in the database, where application bugs cannot undo it.',
    resume: 'resume/ranya-prasad-data.pdf',
    skills: ['PostgreSQL', 'SQL', 'Data modeling', 'Firebase', 'Python', 'Tableau', 'Parallel pipelines'],
  },
};

export const ALL_INFO = {
  label: 'All',
  headline:
    'Electrical engineering student at Illinois building robots, data systems and the pipelines that ship them.',
  skills: ['C++', 'Python', 'Java', 'TypeScript', 'PostgreSQL', 'AWS', 'Arduino', 'GitHub Actions'],
};

export interface Project {
  id: string;
  title: string;
  when: string;
  stack: string[];
  lenses: Lens[];
  /** Default summary, used for "all" and for any lens without its own line. */
  summary: string;
  /** Lens-specific framing of the same work. */
  angle?: Partial<Record<Lens, string>>;
  link?: { href: string; label: string };
}

export const PROJECTS: Project[] = [
  {
    id: 'winniewheels',
    title: 'WinnieWheels autonomous delivery robot',
    when: 'Oct 2025 – Sep 2026 · Software Chair, Women in ECE',
    stack: ['C++', 'Arduino', 'Raspberry Pi', 'Node.js'],
    lenses: ['software', 'embedded'],
    summary:
      'Co-led software for a 50-person team. Obstacle avoidance runs in C++ firmware so the robot stays safe if Wi-Fi drops; a simulator on the same code path let everyone test without hardware.',
    angle: {
      embedded:
        'Two HC-SR04 sensors in, an L298N driver out over PWM. Fixed phantom braking with a three-sample validity filter and a saturated serial link with command deduplication. Try it in the sandbox above.',
      software:
        'Split the work into independent modules, ran code reviews, and built a hardware-free simulator so every member could run the full stack. Try it in the sandbox above.',
    },
    link: { href: '#sandbox', label: 'Open the sandbox' },
  },
  {
    id: 'nobe',
    title: 'Sub-account engine for an investment adviser',
    when: 'Sep 2026 – Present · Software Developer, NOBE',
    stack: ['Python', 'React', 'PostgreSQL'],
    lenses: ['software', 'data'],
    summary:
      'Building sub-account features for a paying client, with a return engine validated against the client’s 13-scenario workbook. Delivered the first navigation workflow for client review.',
    angle: {
      data: 'Holdings, cost basis and ledger history scoped per sub-account; time-weighted returns checked against 13 reference scenarios.',
    },
  },
  {
    id: 'fylm',
    title: 'Cloud infrastructure at Fylm TV',
    when: 'Aug 2026 – Present · Software Developer Intern',
    stack: ['AWS', 'Terraform', 'Docker', 'GitHub Actions'],
    lenses: ['software', 'embedded'],
    summary:
      'Own the Terraform module for the platform’s AWS authentication layer, hardened the pull-request pipeline, and am building a content-tagging service from video and audio tracks.',
  },
  {
    id: 'abbvie',
    title: 'Trustworthy AI output at AbbVie',
    when: 'Oct 2026 – Present · Jr. Applied AI Developer (IRAP)',
    stack: ['Python', 'CI/CD', 'LLM evaluation'],
    lenses: ['software', 'data'],
    summary:
      'Building evaluation frameworks that decide when AI-generated output can be trusted: golden test sets, LLM-as-judge scoring and regression detection, gated in CI/CD.',
  },
  {
    id: 'cafe-queues',
    title: 'Cafe Queues',
    when: '2022 – 2026',
    stack: ['PostgreSQL', 'Flask', 'React'],
    lenses: ['software', 'data'],
    summary:
      'Campus pre-order site used daily at peak lunch. A UNIQUE constraint and a transaction lock guarantee one ticket per order: 20 simultaneous orders issue 20 distinct tickets.',
    angle: {
      data: 'The no-duplicate-ticket rule lives in a normalized PostgreSQL schema (UNIQUE constraint + transaction lock), not in application code.',
    },
  },
  {
    id: 'skinsight',
    title: 'SkinSight',
    when: '2023 – 2025 · Technical Lead, corresponding author',
    stack: ['TensorFlow', 'TensorFlow Lite', 'Java', 'Android'],
    lenses: ['software', 'embedded', 'data'],
    summary:
      'Compared four neural networks for skin-cancer detection; transfer learning won (84.69% mean, p = 0.021). Runs on the phone itself with no server. Published and presented at ICBCB 2025.',
    angle: {
      embedded: 'The chosen model runs on-device through TensorFlow Lite, with no server round-trip.',
    },
  },
  {
    id: 'netwatch',
    title: 'NetWatch',
    when: '2026',
    stack: ['Python', 'pytest', 'GitHub Actions'],
    lenses: ['software', 'embedded', 'data'],
    summary:
      'Log-triage agent that flags link flaps and login storms. CI scores every change against a labeled test set and blocks it if accuracy drops.',
  },
  {
    id: 'genome',
    title: 'Parallel genome variant calling',
    when: 'Summer 2023 · UChicago',
    stack: ['Linux', 'Google Cloud', 'bwa', 'samtools'],
    lenses: ['data', 'embedded'],
    summary:
      'A head node dispatched multi-GB jobs to workers that aligned, sorted and annotated in parallel. Found the bottleneck stages and scaled from one chromosome to all 23.',
  },
  {
    id: 'forsys',
    title: 'Analytics SQL layer at Forsys',
    when: 'Summer 2022 · Data Analytics Intern',
    stack: ['SQL', 'Python', 'Tableau'],
    lenses: ['data'],
    summary:
      'Owned the SQL behind a client’s analytics pipeline: production schemas, query optimization and data cleaning, plus Tableau dashboards stakeholders used directly.',
  },
];
