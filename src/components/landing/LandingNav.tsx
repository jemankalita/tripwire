import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

export function LandingNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="flex h-16 items-center gap-8 px-4 sm:px-8">
        <Wordmark />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-[15px]">
          <a href="#how" className="hidden rounded-[4px] px-3 py-1.5 text-muted transition-colors hover:text-ink md:block">
            How it works
          </a>
          <a href="#ignores" className="hidden rounded-[4px] px-3 py-1.5 text-muted transition-colors hover:text-ink md:block">
            What it ignores
          </a>
          <Link href="/login" className="rounded-[4px] px-3 py-1.5 text-muted transition-colors hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="ml-1 rounded-[4px] bg-accent px-3.5 py-1.5 font-medium text-accent-ink transition-[transform,background-color] hover:bg-accent-hover active:scale-[0.97]">
            Start watching
          </Link>
        </nav>
      </div>
    </header>
  );
}
