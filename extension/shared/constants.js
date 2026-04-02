export const NATIVE_HOST_NAME = "com.christowiz.open_url_in_browser";

export const EXTENSION_ID = "jmgamfcdphkcadknmiekecdpdmgcgakk";

/**
 * @typedef {Object} BrowserDef
 * @property {string} id
 * @property {string} name
 * @property {string} bundleId
 */

/** @type {BrowserDef[]} */
export const KNOWN_BROWSERS = [
  { id: "safari",   name: "Safari",           bundleId: "com.apple.Safari" },
  { id: "chrome",   name: "Google Chrome",    bundleId: "com.google.Chrome" },
  { id: "brave",    name: "Brave",            bundleId: "com.brave.Browser" },
  { id: "firefox",  name: "Firefox",          bundleId: "org.mozilla.firefox" },
  { id: "edge",     name: "Microsoft Edge",   bundleId: "com.microsoft.edgemac" },
  { id: "helium",   name: "Helium",           bundleId: "net.imput.helium" },
  { id: "vivaldi",  name: "Vivaldi",          bundleId: "com.vivaldi.Vivaldi" },
  { id: "opera",    name: "Opera",            bundleId: "com.operasoftware.Opera" },
  { id: "zen",      name: "Zen Browser",      bundleId: "net.zen-browser.app" },
  { id: "canary",   name: "Chrome Canary",    bundleId: "com.google.Chrome.canary" },
];

export const MSG_TYPES = {
  // popup → service worker
  OPEN_URLS:          "OPEN_URLS",
  RETRY_FAILED:       "RETRY_FAILED",
  DISMISS_RECOVERY:   "DISMISS_RECOVERY",
  GET_STATE:          "GET_STATE",

  // options → service worker
  RELOAD_CONTEXT_MENU: "RELOAD_CONTEXT_MENU",
  PING_NATIVE:         "PING_NATIVE",
  INSPECT_APP:         "INSPECT_APP",

  // service worker → popup (responses)
  STATE_UPDATE:       "STATE_UPDATE",
};

/** URL schemes that cannot be opened in another browser — skip silently. */
export const UNSENDABLE_SCHEMES = ["chrome:", "chrome-extension:", "about:", "edge:"];
