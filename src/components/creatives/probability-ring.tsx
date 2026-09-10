"use client";

type ProbabilityRingProps = {
  value: number;
  size?: number;
};

function ringTone(value: number) {
  if (value >= 55) {
    return { stroke: "#059669", track: "#d1fae5", text: "text-emerald-700" };
  }

  if (value >= 35) {
    return { stroke: "#d97706", track: "#fef3c7", text: "text-amber-700" };
  }

  return { stroke: "#e11d48", track: "#ffe4e6", text: "text-rose-700" };
}

export function ProbabilityRing({ value, size = 88 }: ProbabilityRingProps) {
  const tone = ringTone(value);
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(value, 0), 100) / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-semibold leading-none ${tone.text}`}>
          %{Math.round(value)}
        </span>
        <span className="mt-1 text-[10px] font-medium tracking-wide text-slate-400">
          SATIŞ
        </span>
      </div>
    </div>
  );
}
