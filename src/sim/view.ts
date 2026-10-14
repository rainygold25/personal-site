import { ARENA, ROBOT_RADIUS, SENSOR_ANGLE, Simulation, type SimOptions } from './world';

const TICK_MS = 70;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Palette {
  floor: string;
  grid: string;
  box: string;
  robot: string;
  beam: string;
  beamDead: string;
  trail: string;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    floor: v('--arena-floor'),
    grid: v('--arena-grid'),
    box: v('--arena-box'),
    robot: v('--accent'),
    beam: v('--arena-beam'),
    beamDead: v('--danger'),
    trail: v('--arena-trail'),
  };
}

export function mountSandbox(): void {
  const canvas = $<HTMLCanvasElement>('arena');
  const ctx = canvas.getContext('2d');
  const seed = Number(new URLSearchParams(location.search).get('seed')) || 1;

  const noise = $<HTMLInputElement>('noise');
  const filter = $<HTMLInputElement>('filter');
  const dedupe = $<HTMLInputElement>('dedupe');
  const faultL = $<HTMLInputElement>('fault-left');
  const faultR = $<HTMLInputElement>('fault-right');
  const runBtn = $<HTMLButtonElement>('run');
  const status = $('sim-status');

  let sim: Simulation;
  let trail: { x: number; y: number }[] = [];
  let running = false;
  let lastTick = 0;
  let palette = readPalette();

  const options = (): SimOptions => ({
    seed,
    noise: Number(noise.value) / 100,
    dedupe: dedupe.checked,
    config: { validityFilter: filter.checked },
    faults: { left: faultL.checked, right: faultR.checked },
  });

  function reset(): void {
    const boxes = sim?.boxes;
    sim = new Simulation({ ...options(), boxes });
    trail = [{ x: sim.pose.x, y: sim.pose.y }];
    render();
  }

  function setRunning(on: boolean): void {
    running = on;
    runBtn.textContent = on ? 'Pause' : 'Run';
    runBtn.setAttribute('aria-pressed', String(on));
    status.textContent = on ? 'Simulation running.' : 'Simulation paused.';
    if (on) {
      lastTick = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function tick(): void {
    const prev = sim.lastDecision?.command;
    sim.step();
    trail.push({ x: sim.pose.x, y: sim.pose.y });
    if (trail.length > 400) trail.shift();
    const cmd = sim.lastDecision?.command;
    if (cmd === 'STOP' && prev !== 'STOP') status.textContent = `Robot stopped: ${sim.lastDecision?.reason}.`;
  }

  function loop(now: number): void {
    if (!running) return;
    // Cap catch-up so a background tab doesn't fast-forward hundreds of ticks.
    let steps = Math.min(5, Math.floor((now - lastTick) / TICK_MS));
    if (steps > 0) lastTick = now;
    while (steps-- > 0) tick();
    render();
    requestAnimationFrame(loop);
  }

  function render(): void {
    drawArena();
    const d = sim.lastDecision;
    const fmt = (n: number | null | undefined) => (n == null ? 'no echo' : `${Math.round(n)} cm`);
    $('r-left').textContent = d ? fmt(d.left) : '–';
    $('r-right').textContent = d ? fmt(d.right) : '–';
    $('r-cmd').textContent = sim.active;
    $('r-cmd').dataset.cmd = sim.active;
    $('r-why').textContent = d?.reason ?? 'waiting to start';
    $('s-ticks').textContent = String(sim.stats.ticks);
    $('s-dist').textContent = `${Math.round(sim.stats.distance)} cm`;
    $('s-sent').textContent = String(sim.link.stats.sent);
    $('s-suppressed').textContent = String(sim.link.stats.suppressed);
    $('s-phantom').textContent = String(sim.stats.phantomReactions);
    $('s-bumps').textContent = String(sim.stats.bumps);
    $('serial-log').textContent = sim.link.frames.slice(-8).join('');
  }

  function drawArena(): void {
    if (!ctx) return;
    const s = canvas.width / ARENA.width;
    const X = (x: number) => x * s;
    const Y = (y: number) => (ARENA.height - y) * s;

    ctx.fillStyle = palette.floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (let gx = 20; gx < ARENA.width; gx += 20) {
      ctx.beginPath();
      ctx.moveTo(X(gx), 0);
      ctx.lineTo(X(gx), canvas.height);
      ctx.stroke();
    }
    for (let gy = 20; gy < ARENA.height; gy += 20) {
      ctx.beginPath();
      ctx.moveTo(0, Y(gy));
      ctx.lineTo(canvas.width, Y(gy));
      ctx.stroke();
    }

    ctx.fillStyle = palette.box;
    for (const b of sim.boxes) ctx.fillRect(X(b.x), Y(b.y + b.h), b.w * s, b.h * s);

    if (trail.length > 1) {
      ctx.strokeStyle = palette.trail;
      ctx.lineWidth = 3;
      ctx.beginPath();
      trail.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.stroke();
    }

    const { x, y, heading } = sim.pose;
    const dist = sim.trueDistances();
    const beams: [number, number, boolean][] = [
      [heading + SENSOR_ANGLE, dist.left, sim.faults.left],
      [heading - SENSOR_ANGLE, dist.right, sim.faults.right],
    ];
    for (const [angle, len, dead] of beams) {
      const r = (angle * Math.PI) / 180;
      const reach = dead ? ROBOT_RADIUS * 2 : len;
      ctx.strokeStyle = dead ? palette.beamDead : palette.beam;
      ctx.lineWidth = 2;
      ctx.setLineDash(dead ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y));
      ctx.lineTo(X(x + reach * Math.cos(r)), Y(y + reach * Math.sin(r)));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = palette.robot;
    ctx.beginPath();
    ctx.arc(X(x), Y(y), ROBOT_RADIUS * s, 0, Math.PI * 2);
    ctx.fill();
    // Nose marker shows heading.
    const hr = (heading * Math.PI) / 180;
    ctx.strokeStyle = palette.floor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(x), Y(y));
    ctx.lineTo(X(x + ROBOT_RADIUS * Math.cos(hr)), Y(y + ROBOT_RADIUS * Math.sin(hr)));
    ctx.stroke();
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * ARENA.width;
    const y = ARENA.height - ((e.clientY - rect.top) / rect.height) * ARENA.height;
    const result = sim.toggleBox(x, y);
    status.textContent =
      result === 'blocked'
        ? 'Can’t place a box on the robot.'
        : `Box ${result}. ${sim.boxes.length} boxes in the arena.`;
    render();
  });

  $('add-box').addEventListener('click', () => {
    for (let i = 0; i < 20; i++) {
      const x = 20 + Math.random() * (ARENA.width - 40);
      const y = 20 + Math.random() * (ARENA.height - 40);
      const inside = sim.boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (!inside && sim.toggleBox(x, y) === 'added') break;
    }
    status.textContent = `${sim.boxes.length} boxes in the arena.`;
    render();
  });

  $('clear-boxes').addEventListener('click', () => {
    sim.boxes.length = 0;
    status.textContent = 'Arena cleared.';
    render();
  });

  runBtn.addEventListener('click', () => setRunning(!running));
  $('step').addEventListener('click', () => {
    if (running) setRunning(false);
    tick();
    render();
  });
  $('reset').addEventListener('click', () => {
    setRunning(false);
    reset();
    status.textContent = 'Simulation reset.';
  });

  // Live tweaks apply to the running sim without losing position.
  noise.addEventListener('input', () => {
    sim.noise = Number(noise.value) / 100;
    $('noise-out').textContent = `${noise.value}%`;
  });
  filter.addEventListener('change', () => (sim.config.validityFilter = filter.checked));
  dedupe.addEventListener('change', () => sim.link.setDedupe(dedupe.checked));
  faultL.addEventListener('change', () => {
    sim.faults.left = faultL.checked;
    render();
  });
  faultR.addEventListener('change', () => {
    sim.faults.right = faultR.checked;
    render();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    palette = readPalette();
    render();
  });

  reset();
}
