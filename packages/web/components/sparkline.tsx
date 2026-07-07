export function sparklinePath(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M0,${height / 2} L${width},${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y =
        span === 0
          ? height / 2
          : height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  className = "text-accent",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const first = values[0];
  const last = values[values.length - 1];
  const direction =
    values.length < 2 || first === last
      ? "flat"
      : last > first
        ? "rising"
        : "falling";
  const label =
    values.length === 0
      ? "No trend data"
      : `Trend ${direction}, ${first} to ${last}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={label}
    >
      <path
        d={sparklinePath(values, width, height)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface SparklineSeries {
  values: number[];
  label: string;
  /** A text color utility class, e.g. "text-accent" — strokes/fills use currentColor. */
  className: string;
}

export function multiSparklineCoords(
  values: number[],
  width: number,
  height: number,
  max: number,
): { x: number; y: number }[] {
  const pad = 3;
  const range = max || 1;
  return values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - (v / range) * (height - pad * 2) - pad,
  }));
}

/**
 * Multi-series area sparkline with a shared 0-based scale and a legend of
 * current values. Used by the dashboard server cards (players vs queue).
 */
export function MultiSparkline({
  series,
  width = 200,
  height = 64,
  fixedMax,
  className,
}: {
  series: SparklineSeries[];
  width?: number;
  height?: number;
  fixedMax?: number;
  className?: string;
}) {
  const drawable = series.filter((s) => s.values.length >= 2);
  if (drawable.length === 0) return null;

  const max = fixedMax ?? Math.max(...series.flatMap((s) => s.values), 1);
  const summary = series
    .map((s) => `${s.label} ${s.values[s.values.length - 1] ?? 0}`)
    .join(", ");

  return (
    <div className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        role="img"
        aria-label={`Trend: ${summary}`}
      >
        {drawable.map((s) => {
          const coords = multiSparklineCoords(s.values, width, height, max);
          const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
          const area = `${line} ${width},${height} 0,${height}`;
          return (
            <g key={s.label} className={s.className}>
              <polygon fill="currentColor" fillOpacity="0.2" points={area} />
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                points={line}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center gap-4">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full bg-current ${s.className}`}
              aria-hidden="true"
            />
            <span className="text-[10px] text-text-muted">
              {s.label}:{" "}
              <span className="text-text-secondary">
                {s.values.length > 0 ? s.values[s.values.length - 1] : 0}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
