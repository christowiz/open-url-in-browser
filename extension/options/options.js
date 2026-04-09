import { KNOWN_BROWSERS, MSG_TYPES } from "../shared/constants.js";
import { getBrowsers, setBrowsers, getWindowPreference, setWindowPreference } from "../shared/storage.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let browsers = [];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("extension-id").textContent = chrome.runtime.id;

  browsers = await getBrowsers();
  renderBrowserList();
  renderKnownBrowserList();

  const windowPref = await getWindowPreference();
  document.querySelector(`input[name="window-preference"][value="${windowPref}"]`).checked = true;

  document.querySelectorAll('input[name="window-preference"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      setWindowPreference(e.target.value);
    });
  });

  document.getElementById("verify-btn").addEventListener("click", verifyConnection);
  document.getElementById("copy-install-btn").addEventListener("click", copyInstallCommand);
  document.getElementById("custom-form").addEventListener("submit", onAddCustom);
  document.getElementById("detect-btn").addEventListener("click", onDetectApp);
  document.getElementById("confirm-detected-btn").addEventListener("click", onConfirmDetected);
  document.getElementById("reset-btn").addEventListener("click", onReset);
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderBrowserList() {
  const ul = document.getElementById("browser-list");
  ul.innerHTML = "";

  if (browsers.length === 0) {
    ul.innerHTML = "<li style='color:#888;font-size:13px;padding:6px 0'>No browsers added yet.</li>";
    return;
  }

  for (const b of browsers) {
    const li = document.createElement("li");
    if (b.isDefault) li.classList.add("is-default");

    li.innerHTML = `
      <span class="browser-name">${esc(b.name)}</span>
      <span class="browser-bundle">${esc(b.bundleId)}</span>
      ${b.isDefault
        ? `<span class="set-default-badge">Default</span>`
        : `<button class="set-default-btn" data-id="${esc(b.id)}">Set default</button>`
      }
      <button class="danger" data-remove="${esc(b.id)}">Remove</button>
    `;

    li.querySelector("[data-remove]")?.addEventListener("click", () => removeBrowser(b.id));
    li.querySelector("[data-id]")?.addEventListener("click", () => setDefault(b.id));

    ul.appendChild(li);
  }
}

function renderKnownBrowserList() {
  const ul = document.getElementById("known-browser-list");
  ul.innerHTML = "";

  const addedIds = new Set(browsers.map((b) => b.id));

  for (const kb of KNOWN_BROWSERS) {
    if (addedIds.has(kb.id)) continue;

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="browser-name">${esc(kb.name)}</span>
      <span class="browser-bundle">${esc(kb.bundleId)}</span>
      <button data-known="${esc(kb.id)}">Add</button>
    `;
    li.querySelector("button").addEventListener("click", () => addKnownBrowser(kb.id));
    ul.appendChild(li);
  }

  if (ul.children.length === 0) {
    ul.innerHTML = "<li style='color:#888;font-size:13px'>All known browsers are already added.</li>";
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function addKnownBrowser(id) {
  const kb = KNOWN_BROWSERS.find((b) => b.id === id);
  if (!kb) return;

  browsers.push({ ...kb, isDefault: browsers.length === 0 });
  await saveBrowsers();
}

async function removeBrowser(id) {
  const wasDefault = browsers.find((b) => b.id === id)?.isDefault;
  browsers = browsers.filter((b) => b.id !== id);
  if (wasDefault && browsers.length > 0) browsers[0].isDefault = true;
  await saveBrowsers();
}

async function setDefault(id) {
  browsers = browsers.map((b) => ({ ...b, isDefault: b.id === id }));
  await saveBrowsers();
}

async function onAddCustom(e) {
  e.preventDefault();
  const errorEl = document.getElementById("custom-error");
  errorEl.textContent = "";

  const name = document.getElementById("custom-name").value.trim();
  const bundleId = document.getElementById("custom-bundle").value.trim();

  if (!name || !bundleId) {
    errorEl.textContent = "Both fields are required.";
    return;
  }
  if (browsers.some((b) => b.bundleId === bundleId)) {
    errorEl.textContent = "A browser with that bundle ID already exists.";
    return;
  }

  const id = `custom-${bundleId}`;
  browsers.push({ id, name, bundleId, isDefault: browsers.length === 0 });
  document.getElementById("custom-form").reset();
  await saveBrowsers();
}

async function saveBrowsers() {
  await setBrowsers(browsers);
  renderBrowserList();
  renderKnownBrowserList();
  // Ask the service worker to re-register the context menu with the new default.
  chrome.runtime.sendMessage({ type: MSG_TYPES.RELOAD_CONTEXT_MENU }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Add by app path
// ---------------------------------------------------------------------------

async function onDetectApp() {
  const errorEl = document.getElementById("detect-error");
  const resultEl = document.getElementById("detected-result");
  const detectBtn = document.getElementById("detect-btn");

  errorEl.textContent = "";
  resultEl.classList.add("hidden");

  const appPath = document.getElementById("app-path-input").value.trim();
  if (!appPath) {
    errorEl.textContent = "Enter an app path first.";
    return;
  }

  detectBtn.disabled = true;
  detectBtn.textContent = "Detecting…";

  try {
    const result = await sendMessage({
      type: MSG_TYPES.INSPECT_APP,
      payload: { appPath },
    });

    if (result.error) {
      errorEl.textContent = result.error;
      return;
    }

    document.getElementById("detected-name").value = result.appName || "";
    document.getElementById("detected-bundle").value = result.bundleId;
    document.getElementById("detected-nmh").textContent =
      `~/Library/Application Support/${result.nmhSubdir}/NativeMessagingHosts`;

    resultEl.classList.remove("hidden");
  } catch (err) {
    errorEl.textContent = `Could not reach native host: ${err.message}`;
  } finally {
    detectBtn.disabled = false;
    detectBtn.textContent = "Detect";
  }
}

async function onConfirmDetected() {
  const errorEl = document.getElementById("detect-error");
  errorEl.textContent = "";

  const name = document.getElementById("detected-name").value.trim();
  const bundleId = document.getElementById("detected-bundle").value.trim();

  if (!name) {
    errorEl.textContent = "Please enter a name for the browser.";
    return;
  }
  if (browsers.some((b) => b.bundleId === bundleId)) {
    errorEl.textContent = "A browser with that bundle ID is already added.";
    return;
  }

  const id = `detected-${bundleId}`;
  browsers.push({ id, name, bundleId, isDefault: browsers.length === 0 });

  document.getElementById("app-path-input").value = "";
  document.getElementById("detected-result").classList.add("hidden");
  document.getElementById("add-by-path").removeAttribute("open");

  await saveBrowsers();
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function onReset() {
  if (!confirm("Remove all configured browsers and clear all settings? This cannot be undone.")) return;
  await chrome.storage.local.clear();
  browsers = [];
  renderBrowserList();
  renderKnownBrowserList();
  chrome.runtime.sendMessage({ type: MSG_TYPES.RELOAD_CONTEXT_MENU }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Connection verify
// ---------------------------------------------------------------------------

async function verifyConnection() {
  const badge = document.getElementById("connection-status");
  badge.textContent = "Checking…";
  badge.className = "status-badge";

  try {
    const response = await sendMessage({ type: MSG_TYPES.PING_NATIVE });
    if (response?.status === "ok") {
      badge.textContent = `Connected (v${response.version})`;
      badge.className = "status-badge ok";
    } else {
      throw new Error("unexpected response");
    }
  } catch (err) {
    badge.textContent = "Not connected";
    badge.className = "status-badge error";
  }
}

async function copyInstallCommand() {
  const id = chrome.runtime.id;
  const cmd = `bash /usr/local/lib/open-url-in-browser/install.sh ${id}`;
  await navigator.clipboard.writeText(cmd);

  const btn = document.getElementById("copy-install-btn");
  const orig = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = orig), 1500);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
