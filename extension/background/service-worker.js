import { NATIVE_HOST_NAME, MSG_TYPES, UNSENDABLE_SCHEMES } from "../shared/constants.js";
import {
  getBrowsers,
  getLastOperation,
  setLastOperation,
  clearLastOperation,
} from "../shared/storage.js";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await registerContextMenu();
});

// Re-register context menu on browser startup (service workers don't persist).
chrome.runtime.onStartup.addListener(async () => {
  await registerContextMenu();
});

async function registerContextMenu() {
  chrome.contextMenus.removeAll();
  const browsers = await getBrowsers();
  const defaultBrowser = browsers.find((b) => b.isDefault);
  if (!defaultBrowser) return;

  chrome.contextMenus.create({
    id: "open-in-default",
    title: `Open in ${defaultBrowser.name}`,
    contexts: ["page", "link"],
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const browsers = await getBrowsers();
  const defaultBrowser = browsers.find((b) => b.isDefault);
  if (!defaultBrowser || !tab) return;

  const url = info.linkUrl ?? info.pageUrl;
  if (!url || isUnsendable(url)) return;

  await executeOpen({
    browser: defaultBrowser,
    urls: [url],
    closeTabs: false,
    tabIds: [],
  });
});

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case MSG_TYPES.OPEN_URLS:
      return executeOpen(msg.payload);

    case MSG_TYPES.RETRY_FAILED:
      return retryFailed();

    case MSG_TYPES.DISMISS_RECOVERY:
      await clearLastOperation();
      return { ok: true };

    case MSG_TYPES.GET_STATE:
      return { lastOperation: await getLastOperation() };

    case MSG_TYPES.RELOAD_CONTEXT_MENU:
      await registerContextMenu();
      return { ok: true };

    case MSG_TYPES.PING_NATIVE:
      return sendNativeMessage({ action: "ping" });

    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

// ---------------------------------------------------------------------------
// Core open flow
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   browser: {id:string, name:string, bundleId:string},
 *   urls: string[],
 *   closeTabs: boolean,
 *   tabIds: number[],
 * }} params
 */
async function executeOpen({ browser, urls, closeTabs, tabIds }) {
  const sendable = urls.filter((u) => !isUnsendable(u));
  const skipped = urls.length - sendable.length;

  if (sendable.length === 0) {
    return { ok: false, error: "All tabs are internal URLs and cannot be opened in another browser.", skipped };
  }

  const operationId = crypto.randomUUID();

  // Write in-progress state before calling native host.
  await setLastOperation({
    id: operationId,
    timestamp: Date.now(),
    browser,
    attempted: sendable,
    succeeded: [],
    failed: [],
    closedSourceTabs: false,
    status: "in_progress",
  });

  let results;
  try {
    const response = await sendNativeMessage({
      action: "open_urls",
      bundleId: browser.bundleId,
      urls: sendable,
    });
    results = response.results ?? sendable.map((url) => ({ url, success: false, error: "no results" }));
  } catch (err) {
    // Native host not reachable.
    await setLastOperation({
      id: operationId,
      timestamp: Date.now(),
      browser,
      attempted: sendable,
      succeeded: [],
      failed: sendable,
      closedSourceTabs: false,
      status: "partial_failure",
      nativeHostError: err.message,
    });
    return { ok: false, error: err.message, skipped };
  }

  const succeeded = results.filter((r) => r.success).map((r) => r.url);
  const failed = results.filter((r) => !r.success).map((r) => r.url);
  const allSucceeded = failed.length === 0;
  const status = allSucceeded ? "success" : "partial_failure";

  let closedSourceTabs = false;
  if (closeTabs && allSucceeded && tabIds.length > 0) {
    try {
      await chrome.tabs.remove(tabIds);
      closedSourceTabs = true;
    } catch {
      // Non-fatal — tabs may already be closed.
    }
  }

  await setLastOperation({
    id: operationId,
    timestamp: Date.now(),
    browser,
    attempted: sendable,
    succeeded,
    failed,
    closedSourceTabs,
    status,
  });

  return { ok: allSucceeded, succeeded, failed, skipped, status };
}

// ---------------------------------------------------------------------------
// Retry flow
// ---------------------------------------------------------------------------

async function retryFailed() {
  const op = await getLastOperation();
  if (!op || op.status !== "partial_failure" || op.failed.length === 0) {
    return { ok: false, error: "Nothing to retry." };
  }

  return executeOpen({
    browser: op.browser,
    urls: op.failed,
    closeTabs: false,
    tabIds: [],
  });
}

// ---------------------------------------------------------------------------
// Native messaging
// ---------------------------------------------------------------------------

function sendNativeMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnsendable(url) {
  return UNSENDABLE_SCHEMES.some((scheme) => url.startsWith(scheme));
}
