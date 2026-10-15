"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui/controls";
import { MorphIcon } from "@/components/ui/status";
import { PulseLine } from "@/components/ui/PulseLine";
import { Wordmark } from "@/components/ui/Wordmark";

type Mode = "login" | "signup";

const SAMPLE_PULSE = {
  changes: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  failures: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isSignup = mode === "signup";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setFormError(null);
    try {
      await api(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: isSignup ? form : { email: form.email, password: form.password },
      });
      router.replace(safeNext());
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      } else {
        setFormError(err instanceof Error ? err.message : "Something went wrong");
      }
      setLoading(false);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <Wordmark />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="my-auto w-full max-w-[400px] py-16">
          <h1 className="text-[36px] leading-[1.05] font-medium tracking-[-0.04em]">{isSignup ? "Start watching pages." : "Welcome back."}</h1>
          <p className="mt-3 text-muted">{isSignup ? "Free while we build it. No card, no tracking pixels." : "Sign in to see what changed while you were away."}</p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
            {isSignup && (
              <Field label="Your name" error={errors.name}>
                {(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set("name")} required />}
              </Field>
            )}
            <Field label="Email" error={errors.email}>
              {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set("email")} required />}
            </Field>
            <Field label="Password" error={errors.password} hint={isSignup ? "At least 8 characters." : undefined}>
              {(p) => (
                <Input {...p} type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={form.password} onChange={set("password")} required />
              )}
            </Field>
            {formError && (
              <p role="alert" className="rounded-[8px] bg-error-soft px-3 py-2 text-sm text-error">
                {formError}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-1 w-full">
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>
          <p className="mt-6 text-sm text-muted">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link href={isSignup ? "/login" : "/signup"} className="font-medium text-accent hover:underline">
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </motion.div>
      </div>

      <aside className="relative hidden overflow-hidden bg-field lg:flex lg:items-center lg:justify-center" aria-hidden>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-[440px] rounded-[14px] bg-[#f6f5f3] p-6 text-[#26251e]"
          data-ui
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-[rgb(232_150_30/0.2)] text-[#a85f00]">
              <MorphIcon status="changed" size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Trail Runner 2 changed</p>
              <p className="font-mono text-[12px] text-[#5f5d55]">acmegear.example/trail-runner-2</p>
            </div>
          </div>
          <p className="mt-5 text-[22px] leading-snug tracking-[-0.02em]">Price dropped from $29.00 to $24.00 and it’s back in stock.</p>
          <div className="mt-6 flex items-end justify-between">
            <div className="text-[12.5px] text-[#5f5d55]">
              <p>+2 / −2 lines · 1.8% of pixels</p>
              <p>Ignored: clock, promo banner, view counter</p>
            </div>
            <div className="[--changed:#a85f00] [--error:#c2362f] [--faint:#85837a]">
              <PulseLine {...SAMPLE_PULSE} width={150} height={32} />
            </div>
          </div>
        </motion.div>
      </aside>
    </div>
  );
}
