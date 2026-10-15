"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { api, ApiError, type Preview, type WatchSummary } from "@/lib/api";
import { Button, cn, Field, Input } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/toast";
import { Picker, type Selection } from "./Picker";
import { DEFAULT_FIELDS, WatchFields, type WatchFieldsValue } from "./WatchFields";

type Step = "url" | "regions" | "alerts";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "url", label: "Page" },
  { id: "regions", label: "Regions" },
  { id: "alerts", label: "Alerts" },
];

const STAGES = [
  "Opening the page in a headless browser",
  "Rendering it again to spot what changes on every load",
  "Third render — comparing all three",
  "Mapping clickable regions",
];

function Loading() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 3200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="mt-6" aria-live="polite">
      <div className="relative h-72 overflow-hidden rounded-[10px] bg-surface p-5" aria-hidden>
        <div className="space-y-3 opacity-60">
          <div className="h-5 w-1/3 rounded bg-line-strong" />
          <div className="h-10 w-2/3 rounded bg-line-strong" />
          <div className="h-4 w-1/2 rounded bg-line" />
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded bg-line" />
            ))}
          </div>
        </div>
        <motion.div
          className="absolute inset-x-0 h-16 bg-accent/15 shadow-[0_2px_0_var(--accent)]"
          initial={{ y: -64 }}
          animate={{ y: 300 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <ul className="mt-5 flex flex-col gap-2 text-sm">
        {STAGES.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 transition-colors", i < stage ? "text-muted" : i === stage ? "text-ink" : "text-faint")}>
            <span className={cn("size-1.5 rounded-full", i < stage ? "bg-ok" : i === stage ? "breathe bg-accent" : "bg-line-strong")} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

const EMPTY_SELECTION: Selection = { watch: [], ignore: [], auto: [], number: null };

export function AddWatch({ open, initialUrl, onClose }: { open: boolean; initialUrl: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [fields, setFields] = useState<WatchFieldsValue>(DEFAULT_FIELDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof WatchFieldsValue, string>>>({});

  // Start fresh each time the sheet opens (state adjusted during render, not in an effect).
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  const session = open ? initialUrl : null;
  if (session !== openedWith) {
    setOpenedWith(session);
    if (open) {
      setStep("url");
      setUrl(initialUrl);
      setPreview(null);
      setSelection(EMPTY_SELECTION);
      setFields(DEFAULT_FIELDS);
      setError(null);
      setFieldErrors({});
    }
  }

  const loadPreview = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return setError("Enter the address of a public page");
    setLoading(true);
    setError(null);
    try {
      const { preview: p } = await api<{ preview: Preview }>("/api/preview", { method: "POST", body: { url } });
      setPreview(p);
      setSelection({ ...EMPTY_SELECTION, auto: p.volatileSelectors });
      setFields((f) => ({ ...f, name: p.title?.slice(0, 120) || new URL(p.url).hostname }));
      setStep("regions");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong loading that page");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!preview) return;
    setLoading(true);
    setFieldErrors({});
    try {
      const { watch } = await api<{ watch: WatchSummary }>("/api/watches", {
        method: "POST",
        body: {
          url: preview.url,
          previewId: preview.id,
          ...fields,
          keywordRules: fields.keywordRules.filter((r) => r.text.trim()),
          watchSelectors: selection.watch,
          ignoreSelectors: selection.ignore,
          autoIgnoreSelectors: selection.auto,
          numberSelector: selection.number,
          numberRule: selection.number ? fields.numberRule : null,
        },
      });
      await mutate("/api/watches");
      toast({ tone: "success", title: `Watching ${watch.name}`, description: "The first snapshot is being taken now." });
      onClose();
      router.push(`/app/w/${watch.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path.split(".")[0], d.message])));
      }
      toast({ tone: "error", title: "Couldn’t create the watch", description: err instanceof Error ? err.message : undefined });
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const footer =
    step === "url" ? (
      <>
        <span className="text-[13px] text-muted">Public pages only — no logins, no stored credentials.</span>
        <Button variant="primary" loading={loading} onClick={() => loadPreview()}>
          Load page
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setStep(step === "alerts" ? "regions" : "url")}>
          Back
        </Button>
        {step === "regions" ? (
          <Button variant="primary" onClick={() => setStep("alerts")}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" loading={loading} onClick={create}>
            Start watching
          </Button>
        )}
      </>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Watch a page"
      width={820}
      description={
        <ol className="flex items-center gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.id} aria-current={s.id === step ? "step" : undefined} className={cn("flex items-center gap-1.5", i <= stepIndex ? "text-ink" : "text-faint")}>
              {s.label}
              {i < STEPS.length - 1 && <span className="text-faint">›</span>}
            </li>
          ))}
        </ol>
      }
      footer={footer}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          {step === "url" && (
            <form onSubmit={loadPreview} className="pt-2">
              <Field label="Page address" error={error} hint="We’ll render it in a real browser three times to learn what’s noise.">
                {(p) => (
                  <Input {...p} type="text" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://store.example.com/product/123" disabled={loading} />
                )}
              </Field>
              {loading && <Loading />}
            </form>
          )}
          {step === "regions" && preview && (
            <div className="pt-1">
              {preview.existingWatchers > 0 && (
                <p className="mb-4 rounded-[8px] bg-accent-soft px-3 py-2 text-[13px] text-ink">
                  {preview.existingWatchers === 1 ? "Someone else already watches" : `${preview.existingWatchers} other people already watch`} this page. It’s fetched once for everyone — adding yours costs the site nothing.
                </p>
              )}
              <Picker preview={preview} value={selection} onChange={setSelection} />
            </div>
          )}
          {step === "alerts" && preview && (
            <div className="pt-1">
              <WatchFields
                value={fields}
                onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
                hasNumber={Boolean(selection.number)}
                sensitivityPreview={preview.sensitivityPreview}
                errors={fieldErrors}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}
