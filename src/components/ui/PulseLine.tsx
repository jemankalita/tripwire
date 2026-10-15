"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const BUCKET_HOURS = 12;

/**
 * The signature mark: a seismograph trace of a page's last 14 days.
 * Flat = stable, a spike = a meaningful change, a dotted segment = the page
 * was down or blocked. Single series, so no legend: the label says what it is.
 */
export function PulseLine({
  changes,
  failures,
  width = 148,
  height = 30,
  className,
}: {
  changes: number[];
  failures: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(changes.length, 1);
  const step = width / n;
  const mid = height * 0.6;
  const maxAmp = height * 0.52;

  let base = `M0 ${mid}`;
  const spikes: string[] = [];
  changes.forEach((count, i) => {
    const x = i * step;
    if (count > 0) {
      const amp = (Math.min(count, 3) / 3) * maxAmp + maxAmp * 0.25;
      const peak = `L${x + step * 0.35} ${mid} L${x + step * 0.5} ${mid - amp} L${x + step * 0.65} ${mid + amp * 0.45} L${x + step * 0.8} ${mid}`;
      base += ` ${peak}`;
      spikes.push(`M${x + step * 0.35} ${mid} ${peak}`);
    }
    base += ` L${x + step} ${mid}`;
  });

  const totalChanges = changes.reduce((a, b) => a + b, 0);
  const totalFailures = failures.reduce((a, b) => a + b, 0);
  const label = `${totalChanges} change${totalChanges === 1 ? "" : "s"} and ${totalFailures} failed check${totalFailures === 1 ? "" : "s"} in the last 14 days`;
  const hoverText =
    hover === null
      ? null
      : `${Math.round(((n - hover) * BUCKET_HOURS) / 24)}d ago · ${changes[hover]} change${changes[hover] === 1 ? "" : "s"}${failures[hover] ? ` · ${failures[hover]} failed` : ""}`;

  return (
    <div className={`relative inline-block ${className ?? ""}`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block h-auto max-w-full overflow-visible">
        <motion.path
          d={base}
          fill="none"
          stroke="var(--faint)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
        {spikes.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--changed)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {failures.map((count, i) =>
          count > 0 ? (
            <line
              key={`f${i}`}
              x1={i * step + 1}
              x2={(i + 1) * step - 1}
              y1={height - 2}
              y2={height - 2}
              stroke="var(--error)"
              strokeWidth={2}
              strokeDasharray="2 2"
            />
          ) : null,
        )}
        {hover !== null && <line x1={(hover + 0.5) * step} x2={(hover + 0.5) * step} y1={0} y2={height} stroke="var(--line-strong)" />}
        {changes.map((_, i) => (
          <rect
            key={`h${i}`}
            x={i * step}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hoverText && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-[6px] bg-ink px-2 py-1 text-[12px] whitespace-nowrap text-bg shadow-float">
          {hoverText}
        </span>
      )}
    </div>
  );
}
