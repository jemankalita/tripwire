// Tripwire in-page region picker. Injected on demand into the active tab.
// Selectors are generated with the same algorithm the server uses when it
// renders the page, so what you pick here resolves there.
(() => {
  if (window.__tripwirePicker) return;
  window.__tripwirePicker = true;

  const ACCENT = "#2456d6";
  const IGNORE = "#5d6270";
  const watch = new Map();
  const ignore = new Map();

  const stableToken = (t) => /^[A-Za-z][\w-]{1,40}$/.test(t) && !/\d{3,}/.test(t) && !/[A-Z].*[a-z].*[A-Z].*\d/.test(t);
  const STATE_CLASS = /^(is-|has-|js-)|^(active|hover|focus|focused|open|opened|selected|visible|hidden|show|shown|current|loaded|loading)$/;
  const uniqueId = (el) => el.id && stableToken(el.id) && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1;

  function selectorFor(el) {
    if (uniqueId(el)) return "#" + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.tagName === "BODY") { parts.unshift("body"); break; }
      if (uniqueId(cur)) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      let part = cur.tagName.toLowerCase();
      const classes = Array.from(cur.classList).filter((c) => stableToken(c) && !STATE_CLASS.test(c)).slice(0, 2);
      if (classes.length) part += "." + classes.map((c) => CSS.escape(c)).join(".");
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  // UI lives in a shadow root so the page's CSS can't restyle it.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .box { position: fixed; pointer-events: none; border-radius: 3px; transition: all 60ms linear; }
      .hover { box-shadow: inset 0 0 0 2px #26251e; background: rgb(38 37 30 / 0.06); }
      .watch { box-shadow: inset 0 0 0 2px ${ACCENT}; background: rgb(36 86 214 / 0.14); }
      .ignore { box-shadow: inset 0 0 0 2px ${IGNORE}; background: repeating-linear-gradient(135deg, rgb(93 98 112 / 0.3) 0 6px, transparent 6px 12px); }
      .bar { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); pointer-events: auto;
        display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; border-radius: 10px;
        background: #26251e; color: #f6f5f3; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 18px 40px -16px rgb(0 0 0 / 0.5); }
      .bar b { font-weight: 600; }
      button { height: 32px; padding: 0 12px; border: 0; border-radius: 6px; font: inherit; font-weight: 500; cursor: pointer; }
      .done { background: ${ACCENT}; color: #fff; }
      .cancel { background: transparent; color: #c9c7bf; }
    </style>
    <div class="box hover" hidden></div>
    <div class="marks"></div>
    <div class="bar" role="toolbar" aria-label="Tripwire picker">
      <span class="count"></span>
      <button class="cancel" type="button">Cancel</button>
      <button class="done" type="button">Done</button>
    </div>`;
  document.documentElement.appendChild(host);

  const hoverBox = root.querySelector(".hover");
  const marks = root.querySelector(".marks");
  const count = root.querySelector(".count");
  let hovered = null;

  function place(box, el) {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }

  function renderMarks() {
    marks.textContent = "";
    for (const [map, cls] of [[watch, "watch"], [ignore, "ignore"]]) {
      for (const el of map.values()) {
        if (!el.isConnected) continue;
        const box = document.createElement("div");
        box.className = `box ${cls}`;
        place(box, el);
        marks.appendChild(box);
      }
    }
    count.innerHTML = `Click to watch · <b>Alt</b>+click to ignore · ${watch.size} watched, ${ignore.size} ignored`;
  }

  const isOurs = (el) => el === host || host.contains(el);

  function onMove(e) {
    const el = e.target;
    if (!(el instanceof Element) || isOurs(el)) return;
    hovered = el;
    hoverBox.hidden = false;
    place(hoverBox, el);
  }

  function onClick(e) {
    if (isOurs(e.target) || !hovered) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = selectorFor(hovered);
    const [target, other] = e.altKey ? [ignore, watch] : [watch, ignore];
    other.delete(sel);
    if (target.has(sel)) target.delete(sel);
    else target.set(sel, hovered);
    renderMarks();
  }

  let frame = 0;
  const onViewportChange = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      renderMarks();
      if (hovered) place(hoverBox, hovered);
    });
  };

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
    host.remove();
    window.__tripwirePicker = false;
  }

  function finish() {
    chrome.runtime.sendMessage({ type: "tripwire:picked", watch: [...watch.keys()], ignore: [...ignore.keys()], url: location.href });
    cleanup();
  }

  function onKey(e) {
    if (e.key === "Escape") cleanup();
    if (e.key === "Enter") finish();
  }

  root.querySelector(".done").addEventListener("click", finish);
  root.querySelector(".cancel").addEventListener("click", cleanup);
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
  renderMarks();
})();
