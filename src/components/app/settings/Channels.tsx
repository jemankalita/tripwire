"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api, ApiError, useChannels, type ChannelView, type Me } from "@/lib/api";
import { Button, Field, Input, Segmented, Skeleton, Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";

type ChannelType = ChannelView["type"];

const TYPE_LABEL: Record<ChannelType, string> = { email: "Email", discord: "Discord", telegram: "Telegram" };

function ChannelRow({ channel, onChange }: { channel: ChannelView; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"test" | "delete" | null>(null);

  const test = async () => {
    setBusy("test");
    try {
      await api(`/api/channels/${channel.id}/test`, { method: "POST" });
      toast({ tone: "success", title: `Test sent to ${channel.label}`, description: channel.type === "email" ? "Check your Inbox tab." : undefined });
    } catch (err) {
      toast({ tone: "error", title: "Test failed", description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (enabled: boolean) => {
    await api(`/api/channels/${channel.id}`, { method: "PATCH", body: { enabled } }).catch((err) => toast({ tone: "error", title: (err as Error).message }));
    onChange();
  };
  const remove = async () => {
    setBusy("delete");
    try {
      await api(`/api/channels/${channel.id}`, { method: "DELETE" });
      onChange();
    } catch (err) {
      toast({ tone: "error", title: "Couldn’t remove", description: (err as Error).message });
      setBusy(null);
    }
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }} className="flex flex-wrap items-center gap-4 rounded-[10px] bg-panel px-4 py-3">
      <span className="w-20 text-[12.5px] font-medium text-muted">{TYPE_LABEL[channel.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{channel.label}</p>
        <p className="truncate text-[12.5px] text-muted">{channel.target}</p>
      </div>
      <div className="w-24">
        <Switch checked={channel.enabled} onChange={toggle} label={channel.enabled ? "On" : "Off"} />
      </div>
      <Button size="sm" loading={busy === "test"} onClick={test}>
        Send test
      </Button>
      <Button size="sm" variant="danger" loading={busy === "delete"} onClick={remove}>
        Remove
      </Button>
    </motion.li>
  );
}

export function Channels({ features }: { features?: Me["features"] }) {
  const { data, isLoading, mutate } = useChannels();
  const toast = useToast();
  const [type, setType] = useState<ChannelType>("discord");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const key = type === "email" ? "email" : type === "discord" ? "webhookUrl" : "chatId";
    try {
      await api("/api/channels", { method: "POST", body: { type, label: label || undefined, [key]: value } });
      setValue("");
      setLabel("");
      await mutate();
      toast({ tone: "success", title: `${TYPE_LABEL[type]} channel added`, description: "Send a test to make sure it arrives." });
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : "Couldn’t add the channel");
    } finally {
      setSaving(false);
    }
  };

  const fieldCopy: Record<ChannelType, { label: string; placeholder: string; hint: string }> = {
    email: { label: "Email address", placeholder: "alerts@example.com", hint: features?.smtp ? "Sent via your SMTP server and copied to the Inbox tab." : "SMTP isn’t configured, so emails land in the Inbox tab." },
    discord: { label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…", hint: "Server Settings → Integrations → Webhooks → New Webhook → Copy URL." },
    telegram: {
      label: "Chat ID",
      placeholder: "123456789",
      hint: features?.telegram ? "Message the bot first, then paste your numeric chat ID." : "The server needs TELEGRAM_BOT_TOKEN set before Telegram alerts can be sent.",
    },
  };

  return (
    <div className="flex flex-col gap-5">
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {data?.channels.map((c) => <ChannelRow key={c.id} channel={c} onChange={() => mutate()} />)}
          </AnimatePresence>
          {data?.channels.length === 0 && <p className="text-sm text-muted">No channels yet — alerts will only show in the app.</p>}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-col gap-4 rounded-[10px] bg-surface p-4">
        <Segmented
          name="channel-type"
          label="Channel type"
          size="sm"
          value={type}
          onChange={(t) => {
            setType(t);
            setError(null);
          }}
          options={[
            { value: "discord", label: "Discord" },
            { value: "telegram", label: "Telegram" },
            { value: "email", label: "Email" },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label={fieldCopy[type].label} hint={fieldCopy[type].hint} error={error}>
            {(p) => <Input {...p} value={value} onChange={(e) => setValue(e.target.value)} placeholder={fieldCopy[type].placeholder} />}
          </Field>
          <Field label="Label (optional)">{(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="#price-watch" />}</Field>
        </div>
        <div>
          <Button type="submit" variant="primary" loading={saving} disabled={!value.trim()}>
            Add channel
          </Button>
        </div>
      </form>
    </div>
  );
}
