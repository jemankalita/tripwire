"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useWatches, api } from "@/lib/api";
import { MorphIcon, STATUS_META } from "@/components/ui/status";
import { useAppActions } from "./AppShell";

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm text-ink data-[selected=true]:bg-ink/[0.07]";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { openAddWatch } = useAppActions();
  const { data } = useWatches();

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      overlayClassName="fixed inset-0 z-50 bg-black/35"
      contentClassName="fixed top-[16vh] left-1/2 z-50 w-[min(580px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[12px] bg-panel-2 shadow-float"
    >
      <Command.Input
        placeholder="Search watches or type a command…"
        className="h-14 w-full bg-transparent px-4 text-[16px] text-ink outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-[52vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</Command.Empty>
        <Command.Group heading="Actions" className="text-[12.5px] text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          <Command.Item className={itemClass} onSelect={() => run(() => openAddWatch())}>
            Add a page to watch
            <span className="ml-auto text-[12.5px] text-muted">N</span>
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => run(() => router.push("/app"))}>
            Go to watches
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => run(() => router.push("/app/inbox"))}>
            Open inbox
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => run(() => router.push("/app/settings"))}>
            Alert channels and digest
          </Command.Item>
          <Command.Item
            className={itemClass}
            onSelect={() =>
              run(async () => {
                await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                router.replace("/login");
              })
            }
          >
            Sign out
          </Command.Item>
        </Command.Group>
        {data?.watches.length ? (
          <Command.Group heading="Watches" className="text-[12.5px] text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
            {data.watches.map((w) => (
              <Command.Item
                key={w.id}
                value={`${w.name} ${w.displayUrl}`}
                className={itemClass}
                onSelect={() => run(() => router.push(`/app/w/${w.id}`))}
              >
                <span className={STATUS_META[w.status].text}>
                  <MorphIcon status={w.status} size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <span className="max-w-[40%] truncate font-mono text-[12px] text-muted">{w.displayUrl}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}
