/**
 * Storage management for Backlog Rescue.
 * Uses localStorage key 'ngBacklog'.
 */

export const STORAGE_KEY = 'ngBacklog';

export const DEFAULT_BACKLOG_ITEMS = [
  { id: 1, kind: 'lecture', name: 'Current Electricity — Lecture 05', subject: 'Physics', chapter: 'Current Electricity', num: 5, min: 70, done: false },
  { id: 2, kind: 'lecture', name: 'Current Electricity — Lecture 06', subject: 'Physics', chapter: 'Current Electricity', num: 6, min: 80, done: false },
  { id: 3, kind: 'lecture', name: 'Current Electricity — Lecture 07', subject: 'Physics', chapter: 'Current Electricity', num: 7, min: 75, done: false },
  { id: 4, kind: 'lecture', name: 'Ionic Equilibrium — Lecture 03', subject: 'Chemistry', chapter: 'Ionic Equilibrium', num: 3, min: 65, done: false },
  { id: 5, kind: 'lecture', name: 'Ionic Equilibrium — Lecture 04', subject: 'Chemistry', chapter: 'Ionic Equilibrium', num: 4, min: 80, done: false },
  { id: 6, kind: 'task', name: 'Biological Classification — Revision', type: 'Revision', min: 35, done: false },
  { id: 7, kind: 'task', name: 'Current Electricity — DPP 03', type: 'DPP', min: 40, done: false },
  { id: 8, kind: 'task', name: 'Animal Kingdom — CBT', type: 'CBT', min: 35, done: true },
];

/**
 * Loads backlog items from localStorage or returns default items.
 * @returns {Array}
 */
export function loadBacklog() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_BACKLOG_ITEMS;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BACKLOG_ITEMS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_BACKLOG_ITEMS;
  } catch (e) {
    console.error('Error loading backlog from storage:', e);
    return DEFAULT_BACKLOG_ITEMS;
  }
}

/**
 * Saves backlog items to localStorage.
 * @param {Array} items
 */
export function saveBacklog(items) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving backlog to storage:', e);
  }
}

/**
 * Resets backlog items to the default demo set.
 * @returns {Array}
 */
export function resetBacklog() {
  saveBacklog(DEFAULT_BACKLOG_ITEMS);
  return DEFAULT_BACKLOG_ITEMS;
}

/**
 * Clears all backlog items.
 * @returns {Array}
 */
export function clearBacklog() {
  saveBacklog([]);
  return [];
}

/**
 * Toggles an item's done state.
 * @param {Array} items
 * @param {number|string} id
 * @returns {Array}
 */
export function toggleBacklogItem(items, id) {
  const updated = items.map(item =>
    item.id === id ? { ...item, done: !item.done } : item
  );
  saveBacklog(updated);
  return updated;
}

/**
 * Removes an item from the backlog.
 * @param {Array} items
 * @param {number|string} id
 * @returns {Array}
 */
export function removeBacklogItem(items, id) {
  const updated = items.filter(item => item.id !== id);
  saveBacklog(updated);
  return updated;
}

/**
 * Adds a new lecture item.
 * @param {Array} items
 * @param {Object} param1
 * @returns {Array}
 */
export function addLectureItem(items, { name, subject = 'Physics', chapter = 'General', num = 1, min = 60 }) {
  const newItem = {
    id: Date.now(),
    kind: 'lecture',
    name: name.trim(),
    subject,
    chapter: chapter.trim() || 'General',
    num: Number(num) || 1,
    min: Number(min) || 60,
    done: false
  };
  const updated = [...items, newItem];
  saveBacklog(updated);
  return updated;
}

/**
 * Adds a new non-lecture task (DPP, Revision, Test, etc.).
 * @param {Array} items
 * @param {Object} param1
 * @returns {Array}
 */
export function addOtherItem(items, { name, type = 'Revision', min = 30 }) {
  const newItem = {
    id: Date.now(),
    kind: 'task',
    name: name.trim(),
    type,
    min: Number(min) || 30,
    done: false
  };
  const updated = [...items, newItem];
  saveBacklog(updated);
  return updated;
}

/**
 * Bulk adds lectures from multiline text format:
 * "Lecture Name | minutes"
 * @param {Array} items
 * @param {Object} param1
 * @returns {Array}
 */
export function bulkAddLectureItems(items, { text = '', subject = 'Physics', chapter = 'General' }) {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  let n = 1;
  const newItems = [];
  const baseTime = Date.now();

  for (const line of lines) {
    const parts = line.split('|').map(x => x.trim());
    const name = parts[0] || `Lecture ${n}`;
    const min = Number(parts[1]) || 60;

    newItems.push({
      id: baseTime + n,
      kind: 'lecture',
      name,
      subject,
      chapter: chapter.trim() || 'General',
      num: n,
      min,
      done: false
    });
    n++;
  }

  const updated = [...items, ...newItems];
  saveBacklog(updated);
  return updated;
}
