export function WeekdayChart({ data }: { data: number[] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(...data, 1);
  return (
    <div className="rounded-sm border border-border bg-bg-card p-5">
      <div className="mb-3 text-xs font-semibold tracking-[0.15em] uppercase text-text-muted">
        Day of Week
      </div>
      <div className="flex items-end gap-2" style={{ height: 100 }}>
        {data.map((count, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm bg-accent/70"
              style={{ height: `${(count / max) * 80}px` }}
            />
            <span className="text-[10px] text-text-muted">{days[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
