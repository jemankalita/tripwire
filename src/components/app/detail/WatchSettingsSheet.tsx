"use client";

import { useState } from "react";
import { api, ApiError, type WatchDetail } from "@/lib/api";
import { Button } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/toast";
import { WatchFields, type WatchFieldsValue } from "../WatchFields";

function SelectorList({ label, items, onRemove }: { label: string; items: string[]; onRemove: (s: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <li key={s} className="flex items-center gap-2 rounded-[6px] bg-panel px-2.5 py-1.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted" title={s}>
              {s}
            </code>
            <button type="button" onClick={() => onRemove(s)} className="text-[12.5px] text-error hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WatchSettingsSheet({ open, onClose, watch, onSaved }: { open: boolean; onClose: () => void; watch: WatchDetail; onSaved: () => void }) {
  const toast = useToast();
  const [fields, setFields] = useState<WatchFieldsValue | null>(null);
  const [selectors, setSelectors] = useState(watch.config);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof WatchFieldsValue, string>>>({});

  // Reload the form from the watch each time the sheet opens (adjusted during render).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFields({
      name: watch.name,
      intervalMin: watch.intervalMin,
      sensitivity: watch.sensitivity,
      keywordRules: watch.config.keywordRules,
      keywordOnly: watch.keywordOnly,
      numberRule: watch.config.numberRule,
        digest: watch.digest,
      });
      setSelectors(watch.config);
      setErrors({});
    }
  }

  const save = async () => {
    if (!fields) return;
    setSaving(true);
    try {
      await api(`/api/watches/${watch.id}`, {
        method: "PATCH",
        body: {
          ...fields,
          keywordRules: fields.keywordRules.filter((r) => r.text.trim()),
          numberRule: selectors.numberSelector ? fields.numberRule : null,
          watchSelectors: selectors.watchSelectors,
          ignoreSelectors: selectors.ignoreSelectors,
          autoIgnoreSelectors: selectors.autoIgnoreSelectors,
          numberSelector: selectors.numberSelector,
        },
      });
      toast({ tone: "success", title: "Settings saved" });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.path.split(".")[0], d.message])));
      toast({ tone: "error", title: "Couldn’t save", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const removeFrom = (key: "watchSelectors" | "ignoreSelectors" | "autoIgnoreSelectors") => (s: string) =>
    setSelectors((cur) => ({ ...cur, [key]: cur[key].filter((x) => x !== s) }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Watch settings"
      description="Changing regions starts a fresh baseline instead of alerting on the switch."
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      {fields && (
        <div className="flex flex-col gap-8 pt-1">
          <WatchFields value={fields} onChange={(p) => setFields((f) => (f ? { ...f, ...p } : f))} hasNumber={Boolean(selectors.numberSelector)} errors={errors} />
          <div className="flex flex-col gap-5">
            <SelectorList label="Watched regions" items={selectors.watchSelectors} onRemove={removeFrom("watchSelectors")} />
            <SelectorList label="Ignored regions" items={selectors.ignoreSelectors} onRemove={removeFrom("ignoreSelectors")} />
            <SelectorList label="Auto-ignored (changed during calibration)" items={selectors.autoIgnoreSelectors} onRemove={removeFrom("autoIgnoreSelectors")} />
            {selectors.numberSelector && (
              <SelectorList label="Tracked number" items={[selectors.numberSelector]} onRemove={() => setSelectors((c) => ({ ...c, numberSelector: null }))} />
            )}
            {watch.config.ignoreLines.length > 0 && (
              <p className="text-[13px] text-muted">{watch.config.ignoreLines.length} ignored line pattern(s) from “Ignore these lines”.</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
