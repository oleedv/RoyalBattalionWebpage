interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  fixedMax?: number;
}

export function Sparkline({ data, color, height = 48, fixedMax }: SparklineProps) {
  if (data.length < 2) return null;
  const width = 120;
  const max = fixedMax ?? Math.max(...data, 1);
  const min = 0;
  const range = max - min || 1;
  const coords = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return { x, y };
  });
  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  // Closed polygon for area fill: line points + bottom-right + bottom-left
  const areaPoints = `${linePoints} ${width},${height} 0,${height}`;

  return (
    <svg width={width} height={height} className="h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <polygon fill={color} fillOpacity="0.15" points={areaPoints} />
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={linePoints} />
    </svg>
  );
}
