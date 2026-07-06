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
