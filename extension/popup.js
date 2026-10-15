// Tripwire popup: connect to a server, pick regions on the current tab, and
// create a watch (with the same three-render noise calibration as the web app).

const $ = (id) => document.getElementById(id);
const TOKEN_PATTERN = /^tw_[A-Za-z0-9_-]{16,}$/;

function setStatus(text, tone = "") {
  const el = $("status");
  el.className = tone;
  el.textContent = text;
}

async function getSettings() {
  return chrome.storage.local.get(["server", "token"]);
}

async function api(path, { method = "GET", body } = {}) {
  const { server, token } = await getSettings();
  let res;
  try {
    res = await fetch(`${server}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Can't reach ${server}. Is Tripwire running?`);
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("Unexpected response from the server");
  }
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data;
}

function show(view) {
  $("settings").hidden = view !== "settings";
  $("main").hidden = view !== "main";
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function saveSettings() {
  const raw = $("server").value.trim();
  const token = $("token").value.trim();
  let origin;
  try {
    origin = new URL(raw).origin;
  } catch {
    return setStatus("Enter the full server address, like http://localhost:3000", "error");
  }
  if (!TOKEN_PATTERN.test(token)) return setStatus("That doesn't look like a Tripwire API token (it starts with tw_).", "error");

  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return setStatus("The extension needs permission to talk to your server.", "error");

  await chrome.storage.local.set({ server: origin, token });
  try {
    const me = await api("/api/me");
    setStatus(`Connected as ${me.user.email}.`, "ok");
    chrome.runtime.sendMessage({ type: "tripwire:refresh" });
    await showMain();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function showMain() {
  const tab = await activeTab();
  show("main");
  const isWebPage = tab?.url && /^https?:/.test(tab.url);
  $("page-url").textContent = isWebPage ? tab.url : "Open a public web page to watch it.";
  $("name").value = tab?.title?.slice(0, 120) || "";
  $("pick").disabled = !isWebPage;
  $("watch").disabled = !isWebPage;
  if (!isWebPage) return;

  const key = `pick:${tab.id}`;
  const stored = (await chrome.storage.session.get(key))[key];
  const pick = stored && stored.url === tab.url ? stored : { watch: [], ignore: [] };
  $("selection").textContent =
    pick.watch.length || pick.ignore.length
      ? `Watching ${pick.watch.length || "the whole page"} region(s), ignoring ${pick.ignore.length}.`
      : "Watching the whole page. Pick regions to narrow it down.";
}

async function startPicker() {
  const tab = await activeTab();
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
  window.close();
}

async function createWatch() {
  const tab = await activeTab();
  const key = `pick:${tab.id}`;
  const stored = (await chrome.storage.session.get(key))[key];
  const pick = stored && stored.url === tab.url ? stored : { watch: [], ignore: [] };
  $("watch").disabled = true;
  $("pick").disabled = true;
  try {
    setStatus("Rendering the page three times to learn what changes on every load…");
    const { preview } = await api("/api/preview", { method: "POST", body: { url: tab.url } });
    setStatus("Creating the watch…");
    const { watch } = await api("/api/watches", {
      method: "POST",
      body: {
        url: preview.url,
        previewId: preview.id,
        name: $("name").value.trim() || undefined,
        intervalMin: Number($("interval").value),
        watchSelectors: pick.watch,
        ignoreSelectors: pick.ignore,
        autoIgnoreSelectors: preview.volatileSelectors,
      },
    });
    await chrome.storage.session.remove(key);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    const { server } = await getSettings();
    const status = $("status");
    status.className = "ok";
    status.textContent = `Watching. ${preview.volatileSelectors.length} noisy region(s) auto-ignored. `;
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "Open in Tripwire";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${server}/app/w/${watch.id}` });
    });
    status.append(link);
  } catch (error) {
    setStatus(error.message, "error");
    $("watch").disabled = false;
    $("pick").disabled = false;
  }
}

async function init() {
  const { server, token } = await getSettings();
  $("server").value = server || "http://localhost:3000";
  $("token").value = token || "";
  if (server && token) await showMain();
  else show("settings");

  $("open-settings").addEventListener("click", () => show("settings"));
  $("save-settings").addEventListener("click", saveSettings);
  $("pick").addEventListener("click", startPicker);
  $("watch").addEventListener("click", createWatch);
}

init().catch((error) => setStatus(error.message, "error"));
