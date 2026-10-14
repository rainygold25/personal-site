# Ranya Prasad — personal site

[![CI](https://github.com/rainygold25/personal-site/actions/workflows/ci.yml/badge.svg)](https://github.com/rainygold25/personal-site/actions/workflows/ci.yml)

**Live site:** https://ranya-prasad.vercel.app

My personal website for the NOBE Fall 2026 capstone. It has two interactive features:

1. **WinnieWheels robot sandbox (headline feature).** The obstacle-avoidance logic I wrote as Software
   Chair for the WinnieWheels delivery robot, ported to TypeScript and driven by a simulated arena.
   Visitors can add sensor noise, unplug a sensor, place obstacles, and switch off the two fixes I shipped
   on the real robot (the three-sample validity filter and serial-command dedupe) to see why they matter.
2. **Role lens.** Software / Embedded / Data buttons re-frame the page: headline, skills, which projects
   show and how they're described, and which tailored resume downloads. The lens is in the URL
   (`?lens=embedded`), so a recruiter link opens in the right view.

## Stack

Vite + TypeScript (no framework), Vitest for unit tests, Playwright + axe-core for browser and
accessibility tests, ESLint + Prettier, GitHub Actions for CI/CD, Vercel Hobby for hosting.

```
src/
  sim/controller.ts   pure control logic: validity filter, decision policy, serial link
  sim/world.ts        seeded 2D arena: ray-cast ultrasonic sensors, noise, motion, faults
  sim/view.ts         canvas rendering and controls
  lens/data.ts        all site content (projects, skills, resumes) in one place
  lens/lens.ts        pure lens logic: URL parsing, filtering, framing
  lens/view.ts        DOM rendering for the lens
tests/unit/           Vitest: controller, world, lens
tests/e2e/            Playwright: user flows, edge cases, axe scans (desktop + mobile)
.github/workflows/    ci.yml: checks on every PR; deploy on main after checks pass
```

The simulator and the tests call the **same** `decide()` and `SerialLink` code the page uses. That mirrors
how the real team tested without hardware: a simulator feeding synthetic sensor frames through the
identical code path.

## Setup

Requires Node 22+.

```bash
git clone https://github.com/rainygold25/personal-site.git
cd personal-site
npm ci
npm run dev          # http://localhost:5173
```

## Tests

```bash
npm test             # unit tests (Vitest)
npx playwright install chromium   # first time only
npm run test:e2e     # builds, serves, runs browser + accessibility tests
npm run lint
npm run format:check
npm run typecheck
```

What the tests cover, normal use and edge cases:

| Area            | Normal use                                                                  | Edge cases                                                                                                 |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Validity filter | median of three readings; ignores one phantom echo                          | all samples timed out or out of range returns no reading; empty input                                      |
| Decision policy | forward when clear, turn toward open side, reverse when boxed in            | sensor failure stops and retries; exact safe-distance boundary; no left/right oscillation within threshold |
| Serial link     | newline-delimited JSON frames; dedupe and throttle                          | STOP bypasses throttle; dedupe off sends every tick; frame buffer cap                                      |
| Simulation      | deterministic per seed; explores default arena with zero collisions         | unplugged sensor stops the robot in place and it resumes when reconnected; can't drop a box on the robot   |
| Role lens       | filters projects, swaps resume and headline, updates URL, back button works | unknown / empty `?lens=` falls back to All; empty result shows an empty state                              |
| Accessibility   | axe WCAG 2.1 AA scan, light and dark; keyboard operation                    | no horizontal scroll at phone width                                                                        |

## CI/CD and deployment

`.github/workflows/ci.yml` runs four jobs on every pull request and every push to `main`:
**lint/format/types**, **unit tests**, **browser + accessibility tests**, and **build**.

- **Merge gate:** `main` is protected by a branch ruleset that requires a pull request and all four checks
  to pass before merging.
- **Deploy:** on a push to `main`, the `deploy` job runs only after all four checks pass. It builds with
  the Vercel CLI and deploys to production, then writes the live URL to the run summary. Vercel's own Git
  integration is turned off in `vercel.json`, so nothing reaches production without passing CI.

One-time setup (already done for this repo):

1. Create a Vercel project (`npx vercel link`), then add three repository secrets in GitHub:
   `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (the IDs are in `.vercel/project.json`).
2. In GitHub, Settings → Rules → add a ruleset for `main`: require a pull request and require the four
   status checks above.

## Pipeline evidence

- Failed check and its fix: _link the failed PR run and the passing run here_
- Main deployment: _link the deploy run here_

## Privacy

The site leaves out my phone number. The resume PDFs were redacted with PyMuPDF (the text is removed, not
covered) and renamed without job-application IDs.

## AI use and limitations

I used Claude Code (Anthropic) as a coding assistant on this project. It scaffolded the Vite/TypeScript
setup, drafted the simulator, tests, CI workflow and styling from my description of how the WinnieWheels
firmware works, and redacted my phone number from the resume PDFs. I reviewed the code, checked the robot
behavior against what the real robot did, and every change had to pass the same CI checks as hand-written
code.

Limitations to know about:

- The sandbox is a simplified 2D model, not a physics simulation. Real HC-SR04 sensors have a beam cone,
  multipath echoes and timing jitter; here each sensor is a single ray, and noise is either a timeout or a
  short phantom echo.
- The decision logic is a TypeScript port of the robot's behavior, not the actual Arduino C++ source, and
  the thresholds are tuned for the sandbox.
- Project descriptions were condensed from my resumes with AI help; I checked them for accuracy.
