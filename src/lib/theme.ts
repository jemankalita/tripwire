export const THEME_STORAGE_KEY = "tw-theme";

/** Inline, pre-hydration: resolves the saved preference and sets data-theme. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
