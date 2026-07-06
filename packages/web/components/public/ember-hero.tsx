"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  createMotes,
  stepMote,
  swayOffset,
  flicker,
  parallax,
  shouldAnimateEmbers,
  type Mote,
} from "@/lib/ember-field";
import { getChartTokens } from "@/lib/chart-tokens";
import { cn } from "@/lib/utils";

/** Lion emblem in a drifting gold ember field with depth parallax.
 * Decorative only. Degrades to the static lion under reduced motion, on
 * touch devices, or when canvas 2d is unavailable; pauses offscreen. */
export function EmberHero({
  motes = 70,
  size = 340,
  className,
}: {
  motes?: number;
  size?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const lion = lionRef.current;
    if (!canvas || !wrap || !lion) return;

    const ctx = canvas.getContext("2d");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (
      !shouldAnimateEmbers({
        reducedMotion,
        coarsePointer,
        hasCanvas2d: !!ctx,
      }) ||
      !ctx
    ) {
      return; // static lion, empty canvas
    }

    const gold = getChartTokens().series[1];
    let field: Mote[] = createMotes(motes);
    const mouse = { x: 0, y: 0 };
    let visible = true;
    let raf = 0;
    let last = performance.now();

    function onMouseMove(e: MouseEvent) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("mousemove", onMouseMove);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          visible = entries.some((e) => e.isIntersecting);
          if (visible) {
            cancelAnimationFrame(raf);
            last = performance.now();
            raf = requestAnimationFrame(frame);
          }
        },
        { threshold: 0 },
      );
      observer.observe(wrap);
    }

    function frame(now: number) {
      if (!visible || !ctx) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      field = field.map((m) => stepMote(m, dt));
      for (const m of field) {
        const p = parallax(m.depth, mouse);
        const x = (m.x + swayOffset(m, t)) * canvas!.width + p.dx;
        const y = m.y * canvas!.height + p.dy;
        ctx.globalAlpha = flicker(m.phase, t) * (0.35 + m.depth * 0.65);
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const breath = 1 + 0.015 * Math.sin(t * 0.5);
      const lp = parallax(0.5, mouse);
      lion!.style.transform = `translate(${lp.dx * 0.4}px, ${lp.dy * 0.4}px) scale(${breath})`;

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      observer?.disconnect();
    };
  }, [motes]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="absolute inset-0"
      />
      <div ref={lionRef} className="absolute inset-0 grid place-items-center">
        <Image
          src="/img/rb_newlion2024_4_RS.png"
          alt=""
          width={Math.round(size * 0.62)}
          height={Math.round(size * 0.62)}
          className="ember-lion-glow"
          priority
        />
      </div>
    </div>
  );
}
