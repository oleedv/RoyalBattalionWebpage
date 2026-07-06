/** Pure math for the hero ember field. Rendering lives in
 * components/public/ember-hero.tsx; everything here is deterministic given
 * an injected rng, so it is unit-testable. Positions are normalized [0,1]. */

export type Mote = {
  x: number;
  y: number;
  depth: number;
  r: number;
  phase: number;
  vy: number;
  sway: number;
};

export function createMotes(
  count: number,
  rng: () => number = Math.random,
): Mote[] {
  return Array.from({ length: count }, () => {
    const depth = 0.25 + rng() * 0.75;
    return {
      x: rng(),
      y: rng(),
      depth,
      r: 0.6 + depth * 1.6,
      phase: rng() * Math.PI * 2,
      vy: 0.015 + depth * 0.035,
      sway: 0.004 + rng() * 0.01,
    };
  });
}

export function stepMote(
  m: Mote,
  dt: number,
  rng: () => number = Math.random,
): Mote {
  let y = m.y - m.vy * dt;
  let x = m.x;
  if (y < -0.05) {
    y = 1.05;
    x = rng();
  }
  return { ...m, x, y };
}

export function swayOffset(m: Mote, t: number): number {
  return Math.sin(t * 0.8 + m.phase) * m.sway;
}

export function flicker(phase: number, t: number): number {
  return 0.675 + 0.325 * Math.sin(t * 2 + phase);
}

export function parallax(
  depth: number,
  mouse: { x: number; y: number },
  max = 18,
): { dx: number; dy: number } {
  return { dx: mouse.x * max * depth, dy: mouse.y * max * depth };
}

export function shouldAnimateEmbers(env: {
  reducedMotion: boolean;
  coarsePointer: boolean;
  hasCanvas2d: boolean;
}): boolean {
  return !env.reducedMotion && !env.coarsePointer && env.hasCanvas2d;
}
