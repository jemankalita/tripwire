"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api, useMe, type Me } from "@/lib/api";
import { Button, Field, Input, Skeleton } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { Channels } from "./Channels";

function Section({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-6 py-10 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">{title}</h2>
        <p className="mt-1.5 text-sm text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const selectClass =
  "h-10 w-full rounded-[6px] bg-panel-2 px-3 text-[15px] text-ink outline-none shadow-[inset_0_0_0_1px_var(--line-strong)] focus:shadow-[inset_0_0_0_2px_var(--accent)]";

function hourLabel(h: number): string {
  return new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" });
}

export function Settings() {
  const { data, isLoading, mutate } = useMe();
  if (isLoading || !data) return <Skeleton className="mt-10 h-96" />;
  return <SettingsBody data={data} mutate={() => mutate()} />;
}

function SettingsBody({ data, mutate }: { data: Me; mutate: () => Promise<unknown> }) {
  const toast = useToast();
  const [name, setName] = useState(data.user.name);
  const [digestHour, setDigestHour] = useState(data.user.digestHour);
  const [timezone, setTimezone] = useState(data.user.timezone);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["UTC"];
    }
  }, []);
  const browserZone = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/me", { method: "PATCH", body: { name, digestHour, timezone } });
      await mutate();
      toast({ tone: "success", title: "Saved" });
    } catch (err) {
      toast({ tone: "error", title: "Couldn’t save", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const issueToken = async () => {
    setIssuing(true);
    try {
      const res = await api<{ token: string }>("/api/me/token", { method: "POST" });
      setToken(res.token);
      await mutate();
    } catch (err) {
      toast({ tone: "error", title: "Couldn’t create a token", description: (err as Error).message });
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="pt-8">
      <h1 className="text-[32px] leading-none font-medium tracking-[-0.035em]">Settings</h1>

      <Section title="Alert channels" description="Every enabled channel gets each alert exactly once — retries never double-send.">
        <Channels features={data.features} />
      </Section>

      <Section title="Daily digest" description="Watches set to “daily digest” are batched into one message at this hour. Outages still alert immediately.">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Send at">
            {(p) => (
              <select {...p} className={selectClass} value={digestHour} onChange={(e) => setDigestHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Time zone"
            hint={
              browserZone !== timezone ? (
                <button type="button" className="text-accent hover:underline" onClick={() => setTimezone(browserZone)}>
                  Use {browserZone}
                </button>
              ) : undefined
            }
          >
            {(p) => (
              <select {...p} className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Section>

      <Section title="Profile" description={data.user.email}>
        <div className="flex max-w-xl flex-col gap-4">
          <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <div>
            <Button variant="primary" loading={saving} onClick={save}>
              Save profile and digest
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="Browser extension"
        description="Watch the page you’re on and pick regions right in the tab. Load the extension folder from the repo as an unpacked extension."
      >
        <div className="flex max-w-xl flex-col gap-3">
          {token ? (
            <div className="rounded-[10px] bg-accent-soft p-4">
              <p className="text-sm font-medium">Your API token — copy it now, it won’t be shown again.</p>
              <code className="mt-2 block font-mono text-[13px] break-all select-all">{token}</code>
              <Button size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(token).then(() => toast({ tone: "success", title: "Copied" }))}>
                Copy token
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">{data.user.hasApiToken ? "A token exists. Creating a new one revokes the old one." : "No token yet."}</p>
          )}
          <div>
            <Button loading={issuing} onClick={issueToken}>
              {data.user.hasApiToken ? "Replace API token" : "Create API token"}
            </Button>
          </div>
        </div>
      </Section>

      <Section title="This server" description="What this Tripwire instance has switched on.">
        <ul className="grid max-w-xl gap-2 text-sm">
          {[
            ["One-line AI summaries", data.features.ai],
            [
              data.features.email === "resend" ? "Email delivery (Resend)" : data.features.email === "smtp" ? "Email delivery (SMTP)" : "Email delivery (Inbox only)",
              data.features.email !== "inbox",
            ],
            ["Telegram bot", data.features.telegram],
          ].map(([label, on]) => (
            <li key={String(label)} className="flex items-center justify-between rounded-[8px] bg-panel px-3 py-2">
              {label}
              <span className={on ? "text-ok" : "text-muted"}>{on ? "On" : "Off"}</span>
            </li>
          ))}
          <li className="flex items-center justify-between rounded-[8px] bg-panel px-3 py-2">
            Confirmation re-render before alerting
            <span className="tabular text-muted">{Math.round(data.features.confirmDelayMs / 1000)}s later</span>
          </li>
        </ul>
      </Section>
    </div>
  );
}
