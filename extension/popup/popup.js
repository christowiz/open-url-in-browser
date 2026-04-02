import { MSG_TYPES } from "../shared/constants.js";
import { getBrowsers } from "../shared/storage.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let selectedTabs = [];   // highlighted tabs in the current window
let allTabs = [];        // all tabs in the current window
let currentTab = null;
let browsers = [];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("settings-btn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  [browsers, { selectedTabs, allTabs, currentTab }] = await Promise.all([
    getBrowsers(),
    getTabContext(),
  ]);

  await checkRecovery();

  if (browsers.length === 0) {
    showState("empty");
    document.getElementById("go-options").addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  renderMain();
});

// ---------------------------------------------------------------------------
// Tab context
// ---------------------------------------------------------------------------

async function getTabContext() {
  const [highlighted, all] = await Promise.all([
    chrome.tabs.query({ highlighted: true, currentWindow: true }),
    chrome.tabs.query({ currentWindow: true }),
  ]);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });

  return {
    selectedTabs: highlighted.length > 1 ? highlighted : [],
    allTabs: all,
    currentTab: active ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recovery banner
// ---------------------------------------------------------------------------

async function checkRecovery() {
  const { lastOperation } = await sendMessage({ type: MSG_TYPES.GET_STATE });
  if (!lastOperation || lastOperation.status !== "partial_failure") return;

  const { browser, failed } = lastOperation;
  const banner = document.getElementById("recovery-banner");
  document.getElementById("recovery-msg").textContent =
    `${failed.length} tab${failed.length === 1 ? "" : "s"} failed to open in ${browser.name}.`;

  banner.classList.remove("hidden");

  document.getElementById("retry-btn").addEventListener("click", async () => {
    banner.classList.add("hidden");
    const result = await sendMessage({ type: MSG_TYPES.RETRY_FAILED });
    if (!result.ok && result.failed?.length > 0) {
      // Still failing — show banner again with updated count.
      await checkRecovery();
    }
  });

  document.getElementById("dismiss-btn").addEventListener("click", async () => {
    banner.classList.add("hidden");
    await sendMessage({ type: MSG_TYPES.DISMISS_RECOVERY });
  });
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

function renderMain() {
  const main = document.getElementById("main");
  main.classList.remove("hidden");

  // Tab count badge
  const badge = document.getElementById("tab-count-badge");
  if (selectedTabs.length > 1) {
    badge.textContent = `${selectedTabs.length} tabs selected`;
    badge.classList.remove("hidden");
  }

  // Close tabs toggle
  const toggle = document.getElementById("close-tabs-toggle");
  toggle.checked = false;

  // Browser list
  const ul = document.getElementById("browser-list");
  ul.innerHTML = "";

  for (const browser of browsers) {
    ul.appendChild(buildBrowserRow(browser, toggle));
  }
}

function buildBrowserRow(browser, toggle) {
  const li = document.createElement("li");

  // Header
  const header = document.createElement("div");
  header.className = "browser-row-header";
  header.innerHTML = `
    <span class="browser-name">${esc(browser.name)}</span>
    ${browser.isDefault ? `<span class="default-tag">Default</span>` : ""}
  `;

  // Actions
  const actions = document.createElement("div");
  actions.className = "browser-actions";

  const flash = document.createElement("span");
  flash.className = "flash hidden";

  // "Open current tab"
  if (currentTab) {
    const btn = makeButton("Open current tab");
    btn.addEventListener("click", () =>
      doOpen(browser, [currentTab], toggle, btn, flash)
    );
    actions.appendChild(btn);
  }

  // "Open N selected tabs" — only shown when >1 highlighted
  if (selectedTabs.length > 1) {
    const btn = makeButton(`Open ${selectedTabs.length} selected`);
    btn.classList.add("primary");
    btn.addEventListener("click", () =>
      doOpen(browser, selectedTabs, toggle, btn, flash)
    );
    actions.appendChild(btn);
  }

  // "Open all tabs"
  if (allTabs.length > 1) {
    const btn = makeButton(`Open all ${allTabs.length} tabs`);
    btn.addEventListener("click", () =>
      doOpen(browser, allTabs, toggle, btn, flash)
    );
    actions.appendChild(btn);
  }

  li.appendChild(header);
  li.appendChild(actions);
  li.appendChild(flash);
  return li;
}

function makeButton(label) {
  const btn = document.createElement("button");
  btn.textContent = label;
  return btn;
}

// ---------------------------------------------------------------------------
// Open action
// ---------------------------------------------------------------------------

async function doOpen(browser, tabs, toggle, btn, flash) {
  const urls = tabs.map((t) => t.url).filter(Boolean);
  const tabIds = tabs.map((t) => t.id);
  const closeTabs = toggle.checked;
  const newWindow = true;

  btn.disabled = true;
  flash.classList.add("hidden");
  flash.className = "flash hidden";

  let result;
  try {
    result = await sendMessage({
      type: MSG_TYPES.OPEN_URLS,
      payload: { browser, urls, closeTabs, tabIds, newWindow },
    });
  } catch (err) {
    showFlash(flash, `Error: ${err.message}`, true);
    btn.disabled = false;
    return;
  }

  btn.disabled = false;

  if (result.error && !result.succeeded) {
    // Native host completely unreachable.
    showNativeHostError();
    return;
  }

  if (result.ok) {
    const skippedNote = result.skipped > 0 ? ` (${result.skipped} internal skipped)` : "";
    showFlash(flash, `Opened${skippedNote}`, false);
    if (closeTabs) window.close();
  } else {
    const failCount = result.failed?.length ?? 0;
    showFlash(flash, `${failCount} tab${failCount === 1 ? "" : "s"} failed — see banner`, true);
    await checkRecovery();
  }
}

// ---------------------------------------------------------------------------
// Error state (native host not found)
// ---------------------------------------------------------------------------

function showNativeHostError() {
  showState("error");
  const id = chrome.runtime.id;
  document.getElementById("install-cmd").textContent =
    `bash /usr/local/lib/open-url-in-browser/install.sh ${id}`;
  document.getElementById("copy-cmd-btn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(`bash /usr/local/lib/open-url-in-browser/install.sh ${id}`);
    document.getElementById("copy-cmd-btn").textContent = "Copied!";
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showState(name) {
  document.getElementById("empty-state").classList.add("hidden");
  document.getElementById("error-state").classList.add("hidden");
  document.getElementById("main").classList.add("hidden");
  document.getElementById(`${name}-state`).classList.remove("hidden");
}

function showFlash(el, msg, isError) {
  el.textContent = msg;
  el.className = `flash${isError ? " error" : ""}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
