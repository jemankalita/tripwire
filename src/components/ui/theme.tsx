"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme";
import { IconButton } from "./controls";

type ThemePref = "system" | "light" | "dark";

function apply(pref: ThemePref): void {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function readPref(): ThemePref {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemePref, string> = { system: "Theme: match system", light: "Theme: light", dark: "Theme: dark" };

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readPref() === "system" && apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const cycle = () => {
    const next = NEXT[pref];
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: preference just isn't remembered */
    }
    listeners.forEach((notify) => notify());
  };

  return (
    <IconButton label={LABEL[pref]} onClick={cycle}>
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {pref === "dark" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        ) : pref === "light" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </>
        ) : (
          <>
            <rect x="3" y="4.5" width="18" height="12" rx="2" />
            <path d="M8.5 20h7M12 16.5V20" />
          </>
        )}
      </svg>
    </IconButton>
  );
}
