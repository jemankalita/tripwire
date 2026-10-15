"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SWRConfig } from "swr";
import { api, ApiError, type PublicUser } from "@/lib/api";
import { cn, Kbd } from "@/components/ui/controls";
import { ThemeToggle } from "@/components/ui/theme";
import { ToastProvider } from "@/components/ui/toast";
import { Wordmark } from "@/components/ui/Wordmark";
import { AddWatch } from "./AddWatch";
import { AlertsBell } from "./AlertsBell";
import { CommandPalette } from "./CommandPalette";

type AppActions = {
  openAddWatch: (url?: string) => void;
  openPalette: () => void;
};

const ActionsContext = createContext<AppActions | null>(null);

export function useAppActions(): AppActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useAppActions must be used inside <AppShell>");
  return ctx;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
}

const NAV = [
  { href: "/app", label: "Watches", match: (p: string) => p === "/app" || p.startsWith("/app/w") },
  { href: "/app/inbox", label: "Inbox", match: (p: string) => p.startsWith("/app/inbox") },
  { href: "/app/settings", label: "Settings", match: (p: string) => p.startsWith("/app/settings") },
];

function UserMenu({ user }: { user: PublicUser }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-medium text-bg transition-transform active:scale-95"
      >
        {user.name.slice(0, 1).toUpperCase()}
        <span className="sr-only">Account menu</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-10 right-0 z-50 w-60 origin-top-right rounded-[10px] bg-panel-2 p-1.5 shadow-float"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-[13px] text-muted">{user.email}</p>
            </div>
            <Link role="menuitem" href="/app/settings" onClick={() => setOpen(false)} className="block rounded-[6px] px-2.5 py-2 text-sm hover:bg-ink/[0.06]">
              Settings
            </Link>
            <button role="menuitem" type="button" onClick={signOut} className="block w-full rounded-[6px] px-2.5 py-2 text-left text-sm hover:bg-ink/[0.06]">
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppShell({ user, children }: { user: PublicUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openAddWatch = useCallback((url = "") => {
    setAddUrl(url);
    setAddOpen(true);
  }, []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const actions = useMemo(() => ({ openAddWatch, openPalette }), [openAddWatch, openPalette]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" && !addOpen) {
        e.preventDefault();
        openAddWatch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, openAddWatch]);

  return (
    <SWRConfig value={{ onError: (err) => err instanceof ApiError && err.status === 401 && router.replace(`/login?next=${encodeURIComponent(pathname)}`) }}>
    <ToastProvider>
      <ActionsContext value={actions}>
        <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-[70] rounded-[6px] bg-accent px-3 py-2 text-sm text-accent-ink">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 bg-bg" inert={addOpen}>
          <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6">
            <Wordmark href="/app" />
            <nav aria-label="Main" className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors",
                      active ? "text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {active && (
                      <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[6px] bg-surface" transition={{ type: "spring", bounce: 0.15, duration: 0.35 }} />
                    )}
                    <span className="relative">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={openPalette}
                className="hidden h-8 items-center gap-2 rounded-[6px] bg-surface px-2.5 text-[13px] text-muted transition-colors hover:text-ink sm:flex"
              >
                Search or jump to…
                <span className="flex gap-0.5">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
              <AlertsBell popupsDefault={user.inAppPopups} />
              <ThemeToggle />
              <UserMenu user={user} />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-6" inert={addOpen}>
          {children}
        </main>
        <AddWatch open={addOpen} initialUrl={addUrl} onClose={() => setAddOpen(false)} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </ActionsContext>
    </ToastProvider>
    </SWRConfig>
  );
}
