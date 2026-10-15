"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { NumberRule } from "@/core/numbers";
import { shortTime } from "@/lib/format";
import { useElementWidth } from "@/lib/useElementWidth";

type Point = { value: number; at: number };

const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

/**
 * Single-series line (no legend: the heading names it). 2px line, recessive
 * axes, crosshair + tooltip on hover, and a table view for accessibility.
 */
export function NumberChart({ points, rule, label }: { points: Point[]; rule: NumberRule | null; label: string }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(640);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const threshold = rule?.op !== "any" ? rule?.value : undefined;
    const lo = Math.min(...values, threshold ?? Infinity);
    const hi = Math.max(...values, threshold ?? -Infinity);
    const span = hi - lo || Math.abs(hi) || 1;
    const yMin = lo - span * 0.12;
    const yMax = hi + span * 0.12;
    const t0 = points[0].at;
    const t1 = points[points.length - 1].at;
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW);
    const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    // Step line: the value holds until the next observation.
    const d = points.map((p, i) => (i === 0 ? `M${x(p.at)} ${y(p.value)}` : `H${x(p.at)} V${y(p.value)}`)).join(" ") + ` H${PAD.left + innerW}`;
    return { x, y, d, yMin, yMax, threshold };
  }, [points, rule, width]);

  if (!geo) return <p className="text-sm text-muted">No readings yet — the first check will record one.</p>;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(geo.x(p.at) - mx) < Math.abs(geo.x(points[best].at) - mx)) best = i;
    });
    setHover(best);
  };

  const latest = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span>
          <span className="text-[13px] text-muted">{label}</span>
          <span className="ml-3 text-[28px] leading-none font-medium tracking-[-0.03em] tabular">{fmt(latest.value)}</span>
        </span>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-[13px] text-accent hover:underline">
          {table ? "Show chart" : "Show as table"}
        </button>
      </figcaption>
      {table ? (
        <div className="max-h-72 overflow-y-auto rounded-[8px] bg-panel">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left text-[12.5px] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.at} className="odd:bg-panel-2/60">
                  <td className="px-3 py-1.5">{shortTime(p.at)}</td>
                  <td className="px-3 py-1.5 text-right tabular">{fmt(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative">
          <svg width={width} height={HEIGHT} role="img" aria-label={`${label}: latest ${fmt(latest.value)}, ${points.length} readings`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
            {[geo.yMin, (geo.yMin + geo.yMax) / 2, geo.yMax].map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" />
                <text x={PAD.left - 8} y={geo.y(v) + 4} textAnchor="end" className="fill-[var(--muted)] text-[11.5px] tabular">
                  {fmt(v)}
                </text>
              </g>
            ))}
            {geo.threshold !== undefined && (
              <g>
                <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(geo.threshold)} y2={geo.y(geo.threshold)} stroke="var(--changed)" strokeDasharray="4 4" strokeWidth={1.5} />
                <text x={width - PAD.right} y={geo.y(geo.threshold) - 6} textAnchor="end" className="fill-[var(--changed)] text-[11.5px]">
                  alert {rule?.op} {fmt(geo.threshold)}
                </text>
              </g>
            )}
            <path d={geo.d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
            <text x={PAD.left} y={HEIGHT - 8} className="fill-[var(--muted)] text-[11.5px]">
              {shortTime(points[0].at)}
            </text>
            <text x={width - PAD.right} y={HEIGHT - 8} textAnchor="end" className="fill-[var(--muted)] text-[11.5px]">
              {shortTime(latest.at)}
            </text>
            {hp && (
              <g>
                <line x1={geo.x(hp.at)} x2={geo.x(hp.at)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--line-strong)" />
                <circle cx={geo.x(hp.at)} cy={geo.y(hp.value)} r={5} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
              </g>
            )}
          </svg>
          {hp && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-[6px] bg-ink px-2.5 py-1.5 text-[12px] whitespace-nowrap text-bg shadow-float"
              style={{ left: Math.min(Math.max(geo.x(hp.at) - 60, 0), width - 140) }}
            >
              <b className="font-medium tabular">{fmt(hp.value)}</b> · {shortTime(hp.at)}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
