import Link from "next/link";

/** The mark is a tripwire: a taut line with one spike where something crossed it. */
export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <path
        d="M5 19 H12.5 L15 9 L18.5 24 L20.5 19 H27"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 text-[17px] font-medium tracking-[-0.02em] ${className}`}>
      <Mark />
      Tripwire
    </Link>
  );
}
