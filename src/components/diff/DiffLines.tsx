import type { DiffLine, Hunk, WordPart } from "@/core/diff";
import type { ReactNode } from "react";

/**
 * Presentational diff rendering with no hooks, so it works in both the client
 * diff viewer and the server-rendered public share page.
 */

function Words({ words, fallback }: { words?: WordPart[]; fallback: string }) {
  if (!words) return <>{fallback}</>;
  return (
    <>
      {words.map((w, i) =>
        w.type === "same" ? (
          <span key={i}>{w.text}</span>
        ) : (
          <mark key={i} className={w.type === "add" ? "rounded-[3px] bg-add-strong text-add-ink" : "rounded-[3px] bg-del-strong text-del-ink line-through decoration-del-ink/50"}>
            {w.text}
          </mark>
        ),
      )}
    </>
  );
}

const ROW_TONE: Record<DiffLine["type"], string> = {
  add: "bg-add-bg text-add-ink",
  del: "bg-del-bg text-del-ink",
  ctx: "text-ink",
};

const SIGN: Record<DiffLine["type"], string> = { add: "+", del: "−", ctx: "" };

function Gutter({ n }: { n?: number }) {
  return <td className="w-10 px-2 py-1 text-right align-top text-[12px] text-faint tabular select-none">{n ?? ""}</td>;
}

function InlineRows({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <tr key={i} className={ROW_TONE[l.type]}>
          <Gutter n={l.oldNo} />
          <Gutter n={l.newNo} />
          <td className="w-5 py-1 text-center align-top font-medium select-none" aria-label={l.type === "add" ? "added" : l.type === "del" ? "removed" : undefined}>
            {SIGN[l.type]}
          </td>
          <td className="py-1 pr-4 break-words whitespace-pre-wrap">
            <Words words={l.words} fallback={l.text} />
          </td>
        </tr>
      ))}
    </>
  );
}

type SplitRow = { left?: DiffLine; right?: DiffLine };

function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "ctx") {
      rows.push({ left: lines[i], right: lines[i] });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "del") dels.push(lines[i++]);
    while (i < lines.length && lines[i].type === "add") adds.push(lines[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] });
  }
  return rows;
}

function SplitCell({ line, side }: { line?: DiffLine; side: "left" | "right" }) {
  if (!line) return <td colSpan={2} className="bg-surface/60" />;
  return (
    <>
      <Gutter n={side === "left" ? line.oldNo : line.newNo} />
      <td className={`w-1/2 py-1 pr-4 align-top break-words whitespace-pre-wrap ${ROW_TONE[line.type]}`}>
        <Words words={line.words} fallback={line.text} />
      </td>
    </>
  );
}

function SplitRows({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {toSplitRows(lines).map((row, i) => (
        <tr key={i}>
          <SplitCell line={row.left} side="left" />
          <SplitCell line={row.right} side="right" />
        </tr>
      ))}
    </>
  );
}

export function HunkTable({ hunk, layout = "inline", actions }: { hunk: Hunk; layout?: "inline" | "split"; actions?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[8px] bg-panel-2">
      <div className="flex items-center justify-between gap-3 bg-surface px-3 py-1.5 text-[12.5px] text-muted">
        <span>
          {hunk.noise ? "Noise only — " : ""}
          <span className="text-add-ink dark:text-ok">+{hunk.added}</span> <span className="text-del-ink dark:text-error">−{hunk.removed}</span>
        </span>
        {actions}
      </div>
      <table className="w-full table-fixed border-collapse text-[14px] leading-[1.5]">
        <tbody>{layout === "split" ? <SplitRows lines={hunk.lines} /> : <InlineRows lines={hunk.lines} />}</tbody>
      </table>
    </div>
  );
}
