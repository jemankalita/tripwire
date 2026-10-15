/**
 * In-page scripts, kept as plain JavaScript strings so no bundler/transpiler
 * helpers leak into the browser context.
 */

/** mulberry32: makes Math.random deterministic so "random" widgets render identically. */
export const SEED_RANDOM_SCRIPT = `(() => {
  let s = 0x2f6b1e3d;
  Math.random = function () {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

export const FREEZE_CSS = `
*, *::before, *::after {
  animation: none !important; transition: none !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}
video, audio { visibility: hidden !important; }
#onetrust-banner-sdk, #onetrust-consent-sdk, #CybotCookiebotDialog, .qc-cmp2-container,
#truste-consent-track, .osano-cm-window, .cc-window, .cookie-banner, #cookie-banner,
[id*="cookie-consent" i], [class*="cookie-consent" i], [id*="cookie-banner" i],
[class*="cookiebanner" i], [aria-label*="cookie" i][role="dialog"], #usercentrics-root,
.fc-consent-root, #didomi-host { display: none !important; }
`;

export const AUTO_SCROLL_SCRIPT = `(async () => {
  const step = window.innerHeight;
  for (let i = 0; i < 8; i++) {
    window.scrollBy(0, step);
    await new Promise((r) => setTimeout(r, 120));
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight) break;
  }
  window.scrollTo(0, 0);
})()`;

/**
 * Extracts, in one pass over the rendered DOM:
 *  - full visible text,
 *  - one text "view" per watch (its watched regions minus its ignored regions),
 *  - bounding boxes and raw text for requested selectors,
 *  - optionally a map of pickable elements with deterministic CSS selectors.
 */
export const EXTRACT_SCRIPT = String.raw`(args) => {
  const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","SVG","IFRAME","CANVAS","VIDEO","AUDIO","OBJECT","EMBED","HEAD","META","LINK","INPUT","SELECT","TEXTAREA"]);
  const BLOCKY = new Set(["block","flex","grid","list-item","table","table-row","flow-root","table-caption"]);
  const styleCache = new Map();
  const styleOf = (el) => {
    let s = styleCache.get(el);
    if (!s) {
      const cs = getComputedStyle(el);
      s = {
        hidden: cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0" || el.hasAttribute("hidden"),
        block: BLOCKY.has(cs.display) || el.tagName === "BR",
        cell: cs.display === "table-cell",
      };
      styleCache.set(el, s);
    }
    return s;
  };
  const safeAll = (sel) => { try { return Array.from(document.querySelectorAll(sel)); } catch (e) { return []; } };

  const textOf = (root, ignored) => {
    const lines = [];
    let buf = "";
    const flush = () => { const t = buf.replace(/\s+/g, " ").trim(); if (t) lines.push(t); buf = ""; };
    const walk = (node) => {
      if (node.nodeType === 3) { buf += node.nodeValue; return; }
      if (node.nodeType !== 1) return;
      const el = node;
      if (SKIP.has(el.tagName) || ignored.has(el)) return;
      const s = styleOf(el);
      if (s.hidden) return;
      if (el.tagName === "IMG") { const alt = el.getAttribute("alt"); if (alt) buf += " " + alt + " "; return; }
      if (s.block) flush();
      if (s.cell) buf += " ";
      if (el.shadowRoot) el.shadowRoot.childNodes.forEach(walk);
      el.childNodes.forEach(walk);
      if (s.cell) buf += " ";
      if (s.block) flush();
    };
    walk(root);
    flush();
    return lines.join("\n");
  };

  const absBox = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  };

  const stableToken = (t) => /^[A-Za-z][\w-]{1,40}$/.test(t) && !/\d{3,}/.test(t) && !/[A-Z].*[a-z].*[A-Z].*\d/.test(t);
  const STATE_CLASS = /^(is-|has-|js-)|^(active|hover|focus|focused|open|opened|selected|visible|hidden|show|shown|current|loaded|loading)$/;
  const uniqueId = (el) => el.id && stableToken(el.id) && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1;

  const selectorFor = (el) => {
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
  };

  const views = {};
  for (const v of args.views) {
    const ignored = new Set(v.ignore.flatMap(safeAll));
    const roots = v.watch.length ? v.watch.flatMap(safeAll) : [document.body];
    const top = roots.filter((r) => !roots.some((o) => o !== r && o.contains(r)));
    views[v.key] = top.map((r) => textOf(r, ignored)).join("\n");
  }

  const boxes = {};
  for (const sel of args.boxSelectors) { const el = safeAll(sel)[0]; if (el) boxes[sel] = absBox(el); }
  const regionTexts = {};
  for (const sel of args.textSelectors) { const el = safeAll(sel)[0]; if (el) regionTexts[sel] = (el.innerText || el.textContent || "").trim(); }

  const elements = [];
  if (args.collect) {
    for (const el of document.body.querySelectorAll("*")) {
      if (elements.length >= 3000) break;
      if (SKIP.has(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      if (styleOf(el).hidden) continue;
      const text = (el.innerText || "").trim();
      if (!text && el.tagName !== "IMG") continue;
      elements.push({ selector: selectorFor(el), tag: el.tagName.toLowerCase(), text: text.slice(0, 500), box: absBox(el) });
    }
  }

  return {
    title: document.title || "",
    text: textOf(document.body, new Set()),
    views,
    boxes,
    regionTexts,
    elements,
    docHeight: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
    html: document.documentElement.outerHTML.slice(0, 300000),
  };
}`;
