"use client";

import type { Sensitivity } from "@/core/decide";
import type { KeywordRule } from "@/core/keywords";
import type { NumberRule } from "@/core/numbers";
import { INTERVAL_PRESETS_MIN } from "@/core/schedule";
import { formatInterval } from "@/lib/format";
import { Button, Field, IconButton, Input, Segmented, Switch } from "@/components/ui/controls";

export type WatchFieldsValue = {
  name: string;
  intervalMin: number;
  sensitivity: Sensitivity;
  keywordRules: KeywordRule[];
  keywordOnly: boolean;
  numberRule: NumberRule | null;
  digest: boolean;
};

export const DEFAULT_FIELDS: WatchFieldsValue = {
  name: "",
  intervalMin: 60,
  sensitivity: "medium",
  keywordRules: [],
  keywordOnly: false,
  numberRule: null,
  digest: false,
};

const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  high: "Any word that changes",
  medium: "Two or more words — recommended",
  low: "Only substantial rewrites",
};

export function WatchFields({
  value,
  onChange,
  hasNumber,
  sensitivityPreview,
  errors = {},
}: {
  value: WatchFieldsValue;
  onChange: (patch: Partial<WatchFieldsValue>) => void;
  hasNumber: boolean;
  sensitivityPreview?: Record<Sensitivity, number>;
  errors?: Partial<Record<keyof WatchFieldsValue, string>>;
}) {
  const setRule = (i: number, patch: Partial<KeywordRule>) =>
    onChange({ keywordRules: value.keywordRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-7">
      <Field label="Name" error={errors.name}>
        {(p) => <Input {...p} value={value.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} placeholder="Competitor pricing" />}
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Check every</span>
        <div className="overflow-x-auto">
          <Segmented
            name="interval"
            label="Check interval"
            size="sm"
            value={String(value.intervalMin)}
            onChange={(v) => onChange({ intervalMin: Number(v) })}
            options={INTERVAL_PRESETS_MIN.map((m) => ({ value: String(m), label: formatInterval(m) }))}
          />
        </div>
        <p className="text-[13px] text-muted">If others watch the same page, it’s checked at the most frequent interval anyone chose — and fetched only once.</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Sensitivity</span>
        <Segmented
          name="sensitivity"
          label="Sensitivity"
          value={value.sensitivity}
          onChange={(v) => onChange({ sensitivity: v })}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
        />
        <p className="text-[13px] text-muted">
          {SENSITIVITY_HINT[value.sensitivity]}.
          {sensitivityPreview && (
            <>
              {" "}
              In our three test renders this would have alerted{" "}
              <b className="font-medium text-ink">
                {sensitivityPreview[value.sensitivity] === 0 ? "zero times" : `${sensitivityPreview[value.sensitivity]} time${sensitivityPreview[value.sensitivity] === 1 ? "" : "s"}`}
              </b>
              .
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Keyword alerts</span>
        {value.keywordRules.map((rule, i) => (
          <div key={i} className="flex items-center gap-2">
            <Segmented
              name={`kw-${i}`}
              label="Rule type"
              size="sm"
              value={rule.mode}
              onChange={(mode) => setRule(i, { mode })}
              options={[
                { value: "appears", label: "Appears" },
                { value: "disappears", label: "Disappears" },
              ]}
            />
            <Input value={rule.text} onChange={(e) => setRule(i, { text: e.target.value })} placeholder="In stock" aria-label="Keyword" className="h-9" />
            <IconButton label="Remove rule" onClick={() => onChange({ keywordRules: value.keywordRules.filter((_, j) => j !== i) })}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </IconButton>
          </div>
        ))}
        <div>
          <Button size="sm" onClick={() => onChange({ keywordRules: [...value.keywordRules, { mode: "appears", text: "" }] })}>
            Add keyword rule
          </Button>
        </div>
        {value.keywordRules.length > 0 && (
          <Switch
            checked={value.keywordOnly}
            onChange={(keywordOnly) => onChange({ keywordOnly })}
            label="Only alert on these keywords"
            description="Other changes still appear in the timeline, silently."
          />
        )}
      </div>

      {hasNumber && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Tracked number</span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              name="number-op"
              label="Number alert"
              size="sm"
              value={value.numberRule?.op ?? "none"}
              onChange={(op) => onChange({ numberRule: op === "none" ? null : { op, value: value.numberRule?.value } })}
              options={[
                { value: "none", label: "Chart only" },
                { value: "any", label: "Any change" },
                { value: "below", label: "Drops below" },
                { value: "above", label: "Rises above" },
              ]}
            />
            {(value.numberRule?.op === "below" || value.numberRule?.op === "above") && (
              <Input
                type="number"
                inputMode="decimal"
                className="h-9 w-32"
                aria-label="Threshold"
                value={value.numberRule.value ?? ""}
                onChange={(e) => onChange({ numberRule: { op: value.numberRule!.op, value: e.target.value === "" ? undefined : Number(e.target.value) } })}
              />
            )}
          </div>
          {errors.numberRule && <p className="text-[13px] text-error">{errors.numberRule}</p>}
        </div>
      )}

      <Switch
        checked={value.digest}
        onChange={(digest) => onChange({ digest })}
        label="Send in the daily digest instead"
        description="One email a day with everything that changed. Outages still alert right away."
      />
    </div>
  );
}
