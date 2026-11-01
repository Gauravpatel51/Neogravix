// Per-user persistence for Backlog Rescue. Same scoping rule as utils/storage.js:
// every key is namespaced by the signed-in user's UID so accounts on one browser never mix.
import { storage } from './storage'
import { sanitizeItems, makeDemoItems } from './rescuePlanner'

const KEY_BASE = 'ntp_rescue'
const key = (uid) => (uid ? `${KEY_BASE}_${uid}` : null)

export const DEFAULT_SETTINGS = { dailyMinutes: 120, days: 5, keepRegular: true, startOffset: 0 }

const DAILY_OPTIONS = [60, 90, 120, 180, 240, 300, 360]
const DAY_OPTIONS = [3, 5, 7, 10, 14, 21, 30]
export { DAILY_OPTIONS, DAY_OPTIONS }

function sanitizeSettings(s) {
  const o = s && typeof s === 'object' ? s : {}
  return {
    dailyMinutes: DAILY_OPTIONS.includes(Number(o.dailyMinutes)) ? Number(o.dailyMinutes) : DEFAULT_SETTINGS.dailyMinutes,
    days: DAY_OPTIONS.includes(Number(o.days)) ? Number(o.days) : DEFAULT_SETTINGS.days,
    keepRegular: o.keepRegular === undefined ? DEFAULT_SETTINGS.keepRegular : !!o.keepRegular,
    startOffset: Number(o.startOffset) === 1 ? 1 : 0,
  }
}

function sanitizePlan(p) {
  if (!p || typeof p !== 'object' || typeof p.signature !== 'string' || !p.result || p.result.ok !== true || !Array.isArray(p.result.days)) return null
  return p
}

// First visit (nothing stored yet) starts with an empty backlog, not demo data.
export function loadRescue(uid) {
  const raw = storage.get(key(uid))
  if (!raw || typeof raw !== 'object') return { items: [], settings: { ...DEFAULT_SETTINGS }, plan: null }
  return { items: sanitizeItems(raw.items), settings: sanitizeSettings(raw.settings), plan: sanitizePlan(raw.plan) }
}

export function saveRescue(uid, state) {
  if (!uid) return
  storage.set(key(uid), { items: state.items, settings: state.settings, plan: state.plan })
}

export { makeDemoItems }
