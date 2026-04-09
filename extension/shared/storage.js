/**
 * Typed wrappers around chrome.storage.local.
 *
 * Storage schema
 * --------------
 * browsers: BrowserConfig[]
 *   { id, name, bundleId, appPath?, isDefault }
 *
 * lastOperation: OperationState | null
 *   { id, timestamp, browser: {id, name, bundleId}, attempted: string[],
 *     succeeded: string[], failed: string[], closedSourceTabs: bool,
 *     status: 'in_progress' | 'success' | 'partial_failure' }
 */

const KEYS = {
  BROWSERS: "browsers",
  LAST_OPERATION: "lastOperation",
  WINDOW_PREFERENCE: "windowPreference",
};

// ---------------------------------------------------------------------------
// browsers
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<BrowserConfig[]>}
 */
export async function getBrowsers() {
  const result = await chrome.storage.local.get(KEYS.BROWSERS);
  return result[KEYS.BROWSERS] ?? [];
}

/**
 * @param {BrowserConfig[]} browsers
 */
export async function setBrowsers(browsers) {
  await chrome.storage.local.set({ [KEYS.BROWSERS]: browsers });
}

// ---------------------------------------------------------------------------
// lastOperation
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<OperationState|null>}
 */
export async function getLastOperation() {
  const result = await chrome.storage.local.get(KEYS.LAST_OPERATION);
  return result[KEYS.LAST_OPERATION] ?? null;
}

/**
 * @param {OperationState|null} op
 */
export async function setLastOperation(op) {
  await chrome.storage.local.set({ [KEYS.LAST_OPERATION]: op });
}

export async function clearLastOperation() {
  await chrome.storage.local.remove(KEYS.LAST_OPERATION);
}

// ---------------------------------------------------------------------------
// windowPreference
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<'new' | 'active'>}
 */
export async function getWindowPreference() {
  const result = await chrome.storage.local.get(KEYS.WINDOW_PREFERENCE);
  return result[KEYS.WINDOW_PREFERENCE] ?? "new";
}

/**
 * @param {'new' | 'active'} preference
 */
export async function setWindowPreference(preference) {
  await chrome.storage.local.set({ [KEYS.WINDOW_PREFERENCE]: preference });
}
