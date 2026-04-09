import { MSG_TYPES } from "../shared/constants.js";
import { getBrowsers, getWindowPreference, setWindowPreference } from "../shared/storage.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let selectedTabs = [];   // highlighted tabs in the current window
let allTabs = [];        // all tabs in the current window
let currentTab = null;
let browsers = [];
let ctrlPressed = false; // track if Control key is held

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

  // Handle Option key for button text toggling
  document.addEventListener("keydown", (e) => {
    if (e.altKey) {
      ctrlPressed = true;
      updateButtonTextForCtrl(true);
    }
  });

  document.addEventListener("keyup", (e) => {
    if (!e.altKey) {
      ctrlPressed = false;
      updateButtonTextForCtrl(false);
    }
  });
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

async function renderMain() {
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

  // Window preference radio buttons
  const windowPref = await getWindowPreference();
  document.querySelector(`input[name="window-preference"][value="${windowPref}"]`).checked = true;

  document.querySelectorAll('input[name="window-preference"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      setWindowPreference(e.target.value);
      // Update button text if Control is currently pressed
      if (ctrlPressed) {
        updateButtonTextForCtrl(true);
      }
    });
  });

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
    btn.dataset.originalText = "Open current tab";
    btn.addEventListener("click", (e) =>
      doOpen(browser, [currentTab], toggle, btn, flash, e.altKey)
    );
    actions.appendChild(btn);
  }

  // "Open N selected tabs" — only shown when >1 highlighted
  if (selectedTabs.length > 1) {
    const btn = makeButton(`Open ${selectedTabs.length} selected`);
    btn.classList.add("primary");
    btn.dataset.originalText = `Open ${selectedTabs.length} selected`;
    btn.addEventListener("click", (e) =>
      doOpen(browser, selectedTabs, toggle, btn, flash, e.altKey)
    );
    actions.appendChild(btn);
  }

  // "Open all tabs"
  if (allTabs.length > 1) {
    const btn = makeButton(`Open all ${allTabs.length} tabs`);
    btn.dataset.originalText = `Open all ${allTabs.length} tabs`;
    btn.addEventListener("click", (e) =>
      doOpen(browser, allTabs, toggle, btn, flash, e.altKey)
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
// Control key toggling
// ---------------------------------------------------------------------------

async function updateButtonTextForCtrl(isPressed) {
  const buttons = document.querySelectorAll(".browser-actions button");
  const windowPref = document.querySelector('input[name="window-preference"]:checked')?.value || "new";
  const oppositeAction = windowPref === "new" ? "in topmost window" : "in new window";

  buttons.forEach((btn) => {
    if (isPressed) {
      const originalText = btn.dataset.originalText || btn.textContent;
      btn.textContent = `${originalText} ${oppositeAction}`;
    } else {
      btn.textContent = btn.dataset.originalText || btn.textContent;
    }
  });
}

// ---------------------------------------------------------------------------
// Open action
// ---------------------------------------------------------------------------

async function doOpen(browser, tabs, toggle, btn, flash, ctrlHeld = false) {
  const urls = tabs.map((t) => t.url).filter(Boolean);
  const tabIds = tabs.map((t) => t.id);
  const closeTabs = toggle.checked;
  const windowPref = document.querySelector('input[name="window-preference"]:checked')?.value || "new";
  let newWindow = windowPref === "new";

  // Invert if Control was held during click
  if (ctrlHeld) {
    newWindow = !newWindow;
  }

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
