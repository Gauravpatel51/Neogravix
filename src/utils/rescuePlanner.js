// Backlog Rescue — pure scheduling engine (no React, no DOM, no storage).
//
// Hard constraints enforced here (never left to an AI / UI layer):
//   1. A day never exceeds the daily capacity. Unused time is NOT carried into later days.
//   2. Lectures of the same subject+chapter are scheduled strictly in lecture-number order.
//      Lecture N+1 can start only after Lecture N is fully scheduled (same day is fine).
//   3. Only lectures / modules / revision blocks may be split across days. Tests, CBTs, DPPs
//      and PYQ sets stay in one piece. If one of those is longer than a whole day it is reported
//      as "too-long" instead of silently overloading a day.
//   4. Completed items are skipped. The caller's item objects are never mutated.

export const MIN_PART = 15 // never create a split part shorter than this
export const SUBJECTS = ['Physics', 'Chemistry', 'Biology']
export const TASK_TYPES = ['Revision', 'DPP', 'PYQ', 'Test', 'Module', 'CBT']
export const REGULAR_STUDY_MINUTES = 30
export const MAX_SIM_DAYS = 366

const SPLITTABLE_TASK_TYPES = new Set(['Module', 'Revision'])
const MAX_NAME_LEN = 120
const MIN_MINUTES = 5
const MAX_MINUTES = 600

let idCounter = 0
export const newId = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

const groupKey = (x) => `${x.subject}|${String(x.chapter || 'General').trim().toLowerCase()}`
const isSplittable = (x) => x.kind === 'lecture' || SPLITTABLE_TASK_TYPES.has(x.type)

// ─── Dates (local-time safe; no UTC off-by-one) ───────────────────────────────
export const toDateStr = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d + n))
}

// ─── Item validation / sanitising (also protects against corrupted localStorage) ─
const clampMinutes = (v, fallback) => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n))
}

export function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const name = String(r.name || '').trim().slice(0, MAX_NAME_LEN)
    if (!name) continue
    const id = r.id != null && !seen.has(String(r.id)) ? String(r.id) : newId()
    seen.add(id)
    const base = { id, name, min: clampMinutes(r.min, 60), done: !!r.done }
    if (r.kind === 'lecture') {
      out.push({
        ...base,
        kind: 'lecture',
        subject: SUBJECTS.includes(r.subject) ? r.subject : 'Physics',
        chapter: String(r.chapter || 'General').trim().slice(0, 80) || 'General',
        num: Math.max(1, Math.min(999, Math.round(Number(r.num)) || 1)),
      })
    } else {
      out.push({ ...base, kind: 'task', type: TASK_TYPES.includes(r.type) ? r.type : 'Revision', min: clampMinutes(r.min, 30) })
    }
  }
  return out
}

// ─── Bulk add parsing ─────────────────────────────────────────────────────────
// One lecture per line: "Lecture 06 | 75". The lecture number is read from the name when
// present, otherwise it continues after the highest number already in that chapter.
export function parseLectureNumber(name) {
  const m = /(?:lecture|lec\.?|lect\.?|l)\s*[-#:.]?\s*(\d{1,3})\b/i.exec(name) || /(\d{1,3})\s*$/.exec(name)
  return m ? Math.max(1, parseInt(m[1], 10)) : null
}

export function parseBulkLectures(text, existingItems, { subject, chapter }) {
  const subj = SUBJECTS.includes(subject) ? subject : 'Physics'
  const chap = String(chapter || '').trim().slice(0, 80) || 'General'
  const key = groupKey({ subject: subj, chapter: chap })
  const existingNames = new Set(existingItems.map((x) => x.name.trim().toLowerCase()))
  let maxNum = existingItems
    .filter((x) => x.kind === 'lecture' && groupKey(x) === key)
    .reduce((a, x) => Math.max(a, x.num), 0)

  const items = []
  const skipped = []
  let defaulted = 0
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const parts = line.split('|').map((s) => s.trim())
    const name = (parts[0] || '').slice(0, MAX_NAME_LEN)
    if (!name) { skipped.push({ line, reason: 'missing name' }); continue }
    let min = 60
    if (parts[1] !== undefined && parts[1] !== '') {
      if (!/^\d{1,3}$/.test(parts[1])) { skipped.push({ line, reason: 'minutes must be a number' }); continue }
      min = parseInt(parts[1], 10)
      if (min < MIN_MINUTES || min > MAX_MINUTES) { skipped.push({ line, reason: `minutes must be ${MIN_MINUTES}-${MAX_MINUTES}` }); continue }
    } else {
      defaulted++
    }
    const lower = name.toLowerCase()
    if (existingNames.has(lower)) { skipped.push({ line, reason: 'already in backlog' }); continue }
    existingNames.add(lower)
    let num = parseLectureNumber(name)
    if (num == null) num = maxNum + 1
    maxNum = Math.max(maxNum, num)
    items.push({ id: newId(), kind: 'lecture', name, subject: subj, chapter: chap, num, min, done: false })
  }
  return { items, skipped, defaulted }
}

// ─── Demo data ────────────────────────────────────────────────────────────────
export function makeDemoItems() {
  const L = (name, subject, chapter, num, min) => ({ id: newId(), kind: 'lecture', name, subject, chapter, num, min, done: false })
  const T = (name, type, min, done = false) => ({ id: newId(), kind: 'task', name, type, min, done })
  return [
    L('Current Electricity — Lecture 05', 'Physics', 'Current Electricity', 5, 70),
    L('Current Electricity — Lecture 06', 'Physics', 'Current Electricity', 6, 80),
    L('Current Electricity — Lecture 07', 'Physics', 'Current Electricity', 7, 75),
    L('Ionic Equilibrium — Lecture 03', 'Chemistry', 'Ionic Equilibrium', 3, 65),
    L('Ionic Equilibrium — Lecture 04', 'Chemistry', 'Ionic Equilibrium', 4, 80),
    T('Biological Classification — Revision', 'Revision', 35),
    T('Current Electricity — DPP 03', 'DPP', 40),
    T('Animal Kingdom — CBT', 'CBT', 35, true),
  ]
}

// ─── Core simulation ──────────────────────────────────────────────────────────
function simulate(pendingItems, cap, maxDays) {
  const state = pendingItems.map((x, order) => ({ ...x, order, left: x.min }))

  // Lecture queues per subject+chapter, ordered by lecture number (then by list order).
  const queues = new Map()
  for (const s of state) {
    if (s.kind !== 'lecture') continue
    const k = groupKey(s)
    if (!queues.has(k)) queues.set(k, [])
    queues.get(k).push(s)
  }
  for (const q of queues.values()) q.sort((a, b) => a.num - b.num || a.order - b.order)
  const head = (s) => queues.get(groupKey(s)).find((x) => x.left > 0)

  const segments = new Map() // id -> [{dayIndex, minutes, final}]
  const days = []

  const placeable = (s) => s.left > 0 && (isSplittable(s) || s.left <= cap)

  for (let d = 1; d <= maxDays; d++) {
    if (!state.some(placeable)) break
    let free = cap
    const entries = []
    for (;;) {
      let placed = false
      for (const s of state) {
        if (s.left <= 0) continue
        if (s.kind === 'lecture' && head(s) !== s) continue // earlier lecture still pending
        let minutes = 0
        if (s.left <= free) {
          minutes = s.left
        } else if (isSplittable(s) && free >= MIN_PART) {
          minutes = free
          if (s.left - minutes < MIN_PART) minutes = s.left - MIN_PART // avoid a tiny leftover sliver
          if (minutes < MIN_PART) minutes = 0
        }
        if (minutes <= 0) continue
        s.left -= minutes
        free -= minutes
        const final = s.left === 0
        entries.push({ itemId: s.id, minutes, final })
        if (!segments.has(s.id)) segments.set(s.id, [])
        segments.get(s.id).push({ day: d, minutes, final })
        placed = true
        break
      }
      if (!placed) break
    }
    if (!entries.length) break // safety: nothing could be placed on a fresh day
    days.push({ day: d, entries, used: cap - free, free })
  }

  return { state, days, segments }
}

/**
 * @param {Array} items            backlog items (not mutated)
 * @param {Object} opts
 * @param {number} opts.dailyMinutes   total study time per day
 * @param {number} opts.days           rescue window length
 * @param {boolean} opts.keepRegular   reserve REGULAR_STUDY_MINUTES per day for regular study
 * @param {string} opts.startDate      'YYYY-MM-DD' (local date) for Day 1
 */
export function buildPlan(items, { dailyMinutes, days, keepRegular = true, startDate }) {
  const reserve = keepRegular ? REGULAR_STUDY_MINUTES : 0
  const cap = Math.round(Number(dailyMinutes)) - reserve
  const windowDays = Math.max(1, Math.min(MAX_SIM_DAYS, Math.round(Number(days)) || 1))
  if (!Number.isFinite(cap) || cap < MIN_PART * 2) {
    return { ok: false, error: 'Increase the daily time — after the regular-study reserve there is not enough left for backlog.' }
  }

  const pending = sanitizeItems(items).filter((x) => !x.done)
  const pendingMin = pending.reduce((a, x) => a + x.min, 0)
  const byId = new Map(pending.map((x) => [x.id, x]))

  const shown = simulate(pending, cap, windowDays)
  const full = simulate(pending, cap, MAX_SIM_DAYS)

  // Part labelling: only items that are split (or continue beyond the window) get a part label.
  const segCount = new Map()
  const finishedInWindow = new Set()
  for (const [id, segs] of shown.segments) {
    segCount.set(id, segs.length)
    if (segs.some((sg) => sg.final)) finishedInWindow.add(id)
  }
  const segSeen = new Map()

  const outDays = shown.days.map((d) => ({
    day: d.day,
    date: addDays(startDate, d.day - 1),
    used: d.used,
    free: d.free,
    entries: d.entries.map((e) => {
      const it = byId.get(e.itemId)
      const idx = (segSeen.get(e.itemId) || 0) + 1
      segSeen.set(e.itemId, idx)
      const count = segCount.get(e.itemId)
      let part = null
      // total is known only when the item finishes inside the window; otherwise it "continues".
      if (count > 1 || !e.final) part = { index: idx, total: finishedInWindow.has(e.itemId) ? count : null }
      return {
        itemId: it.id, name: it.name, kind: it.kind, type: it.type || null,
        subject: it.subject || null, chapter: it.chapter || null,
        minutes: e.minutes, final: e.final, part,
      }
    }),
  }))

  const scheduledMin = shown.days.reduce((a, d) => a + d.used, 0)
  const unscheduled = []
  for (const s of shown.state) {
    if (s.left <= 0) continue
    const tooLong = !isSplittable(s) && s.min > cap
    unscheduled.push({
      id: s.id, name: s.name, kind: s.kind, type: s.type || null, subject: s.subject || null,
      minutes: s.left, total: s.min, reason: tooLong ? 'too-long' : 'no-time',
    })
  }

  const placeableLeft = unscheduled.filter((u) => u.reason === 'no-time')
  const daysNeeded = placeableLeft.length ? (full.days.length || null) : (shown.days.length || 0)

  return {
    ok: true,
    cap,
    reserve,
    dailyMinutes: cap + reserve,
    windowDays,
    startDate,
    days: outDays,
    unscheduled,
    totals: { pendingMin, scheduledMin, unscheduledMin: pendingMin - scheduledMin },
    fitsWindow: placeableLeft.length === 0,
    daysNeeded,
    pendingCount: pending.length,
  }
}

// Used to tell the user when a saved plan no longer matches the backlog / settings.
export function planSignature(items, settings, startDate) {
  const pending = sanitizeItems(items)
    .filter((x) => !x.done)
    .map((x) => [x.id, x.min, x.num || 0, x.chapter || '', x.subject || ''])
  return JSON.stringify([pending, settings.dailyMinutes, settings.days, !!settings.keepRegular, startDate])
}

export const formatMinutes = (m) => {
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${h}h ${r}m`
  if (h) return `${h}h`
  return `${r}m`
}
