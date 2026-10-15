// Tripwire extension service worker: receives picker results and keeps the
// toolbar badge showing how many watched pages changed since you last looked.

const UNSEEN_ALARM = "tripwire-unseen";
const UNSEEN_COLOR = "#a85f00";
const PICK_COLOR = "#2456d6";

async function refreshUnseen() {
  const { server, token } = await chrome.storage.local.get(["server", "token"]);
  if (!server || !token) return;
  try {
    const res = await fetch(`${server}/api/watches`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!json.ok) return;
    const unseen = json.data.watches.reduce((sum, w) => sum + (w.unseen || 0), 0);
    await chrome.action.setBadgeBackgroundColor({ color: UNSEEN_COLOR });
    await chrome.action.setBadgeText({ text: unseen ? String(unseen) : "" });
  } catch {
    // Server unreachable: leave the badge as it was rather than showing a false zero.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(UNSEEN_ALARM, { periodInMinutes: 5 });
  refreshUnseen();
});
chrome.runtime.onStartup.addListener(refreshUnseen);
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === UNSEEN_ALARM && refreshUnseen());

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "tripwire:refresh") {
    refreshUnseen();
    return;
  }
  if (message?.type !== "tripwire:picked" || sender.tab?.id == null) return;
  const tabId = sender.tab.id;
  const watch = Array.isArray(message.watch) ? message.watch.slice(0, 20) : [];
  const ignore = Array.isArray(message.ignore) ? message.ignore.slice(0, 50) : [];
  chrome.storage.session.set({ [`pick:${tabId}`]: { watch, ignore, url: String(message.url || "") } });
  chrome.action.setBadgeBackgroundColor({ tabId, color: PICK_COLOR });
  chrome.action.setBadgeText({ tabId, text: String(watch.length + ignore.length || "✓") });
});
