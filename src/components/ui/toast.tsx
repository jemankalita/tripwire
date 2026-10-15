"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { MorphIcon, type Status } from "./status";

type ToastTone = "success" | "error" | "info";
type ToastInput = { title: string; description?: string; tone?: ToastTone; action?: { label: string; onClick: () => void } };
type Toast = ToastInput & { id: number };

const TONE_ICON: Record<ToastTone, Status> = { success: "ok", error: "error", info: "pending" };
const TONE_TEXT: Record<ToastTone, string> = { success: "text-ok", error: "text-error", info: "text-accent" };
const DISMISS_MS = 4500;

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...input, id }]);
      setTimeout(() => dismiss(id), input.action ? DISMISS_MS * 1.5 : DISMISS_MS);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              className="pointer-events-auto flex items-start gap-3 rounded-[10px] bg-panel-2 p-3.5 shadow-float"
            >
              <span className={`mt-0.5 ${TONE_TEXT[t.tone ?? "info"]}`}>
                <MorphIcon status={TONE_ICON[t.tone ?? "info"]} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] text-muted">{t.description}</p>}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="rounded-[6px] px-2 py-1 text-[13px] font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}
