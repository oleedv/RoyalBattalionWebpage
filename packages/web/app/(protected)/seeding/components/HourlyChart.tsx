export function HourlyChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const barWidth = 100 / 24;
  return (
    <div className="rounded-sm border border-border bg-bg-card p-5">
      <div className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
        Time of Day
      </div>
      <svg viewBox="0 0 100 40" className="w-full" preserveAspectRatio="none">
        {data.map((count, hour) => {
          const height = (count / max) * 35;
          return (
            <rect
              key={hour}
              x={hour * barWidth + barWidth * 0.15}
              y={40 - height}
              width={barWidth * 0.7}
              height={height}
              className="fill-accent/70"
              rx="0.5"
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[9px] text-text-muted">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
}
