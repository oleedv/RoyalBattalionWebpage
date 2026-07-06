import { test, expect } from "bun:test";
import {
  createMotes,
  stepMote,
  flicker,
  parallax,
  shouldAnimateEmbers,
} from "@/lib/ember-field";

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

test("createMotes produces count motes within normalized bounds", () => {
  const motes = createMotes(70, seq(0.1, 0.5, 0.9));
  expect(motes).toHaveLength(70);
  for (const m of motes) {
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(1);
    expect(m.depth).toBeGreaterThanOrEqual(0.25);
    expect(m.depth).toBeLessThanOrEqual(1);
    expect(m.vy).toBeGreaterThan(0);
  }
});

test("stepMote drifts upward and wraps to the bottom", () => {
  const m = createMotes(1, seq(0.5))[0];
  const up = stepMote(m, 1);
  expect(up.y).toBeLessThan(m.y);
  const wrapped = stepMote({ ...m, y: -0.06 }, 0.016, seq(0.25));
  expect(wrapped.y).toBeGreaterThan(1);
  expect(wrapped.x).toBe(0.25);
});

test("flicker stays within its alpha band", () => {
  for (const t of [0, 0.5, 1, 2, 9.7]) {
    const a = flicker(1.3, t);
    expect(a).toBeGreaterThanOrEqual(0.35);
    expect(a).toBeLessThanOrEqual(1);
  }
});

test("parallax scales with depth", () => {
  const deep = parallax(1, { x: 1, y: 0 });
  const shallow = parallax(0.25, { x: 1, y: 0 });
  expect(deep.dx).toBe(18);
  expect(shallow.dx).toBeCloseTo(4.5);
});

test("degradation matrix", () => {
  expect(shouldAnimateEmbers({ reducedMotion: false, coarsePointer: false, hasCanvas2d: true })).toBe(true);
  expect(shouldAnimateEmbers({ reducedMotion: true, coarsePointer: false, hasCanvas2d: true })).toBe(false);
  expect(shouldAnimateEmbers({ reducedMotion: false, coarsePointer: true, hasCanvas2d: true })).toBe(false);
  expect(shouldAnimateEmbers({ reducedMotion: false, coarsePointer: false, hasCanvas2d: false })).toBe(false);
});
