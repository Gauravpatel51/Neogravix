// Run with:  node --test src/utils/rescuePlanner.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPlan, makeDemoItems, parseBulkLectures, parseLectureNumber, sanitizeItems,
  planSignature, addDays, MIN_PART, REGULAR_STUDY_MINUTES,
} from './rescuePlanner.js'

const START = '2026-11-02'
const L = (id, subject, chapter, num, min, done = false) => ({ id, kind: 'lecture', name: `${chapter} L${num}`, subject, chapter, num, min, done })
const T = (id, type, min, done = false) => ({ id, kind: 'task', name: `${type} ${id}`, type, min, done })
const deepFreeze = (o) => { Object.values(o).forEach((v) => typeof v === 'object' && v && deepFreeze(v)); return Object.freeze(o) }

// Invariants every plan must satisfy.
function checkInvariants(items, plan) {
  assert.ok(plan.ok)
  const pending = items.filter((x) => !x.done)
  const perItem = new Map()
  const order = [] // flat sequence of entries in schedule order
  for (const d of plan.days) {
    const sum = d.entries.reduce((a, e) => a + e.minutes, 0)
    assert.equal(sum, d.used, 'day.used matches entries')
    assert.ok(d.used <= plan.cap, `day ${d.day} used ${d.used} exceeds cap ${plan.cap}`)
    for (const e of d.entries) {
      assert.ok(e.minutes > 0)
      perItem.set(e.itemId, (perItem.get(e.itemId) || 0) + e.minutes)
      order.push({ ...e, day: d.day })
    }
  }
  // Nothing scheduled twice beyond its length; scheduled + unscheduled == total.
  const unsched = new Map(plan.unscheduled.map((u) => [u.id, u.minutes]))
  for (const it of pending) {
    const got = perItem.get(it.id) || 0
    assert.equal(got + (unsched.get(it.id) || 0), it.min, `minutes conserved for ${it.id}`)
  }
  // Lecture order inside each subject+chapter.
  const groups = new Map()
  for (const it of pending.filter((x) => x.kind === 'lecture')) {
    const k = `${it.subject}|${it.chapter.toLowerCase()}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(it)
  }
  for (const lectures of groups.values()) {
    lectures.sort((a, b) => a.num - b.num)
    for (let i = 1; i < lectures.length; i++) {
      const prevId = lectures[i - 1].id
      const curId = lectures[i].id
      const prevLastIdx = order.map((e) => e.itemId).lastIndexOf(prevId)
      const curFirstIdx = order.findIndex((e) => e.itemId === curId)
      if (curFirstIdx !== -1) {
        assert.ok(prevLastIdx !== -1 && prevLastIdx < curFirstIdx, `lecture ${curId} scheduled before ${prevId} finished`)
        const prevFinal = order[prevLastIdx]
        assert.ok(prevFinal.final, `previous lecture ${prevId} must be complete before ${curId} starts`)
      }
    }
  }
  // Dates are consecutive from the start date.
  plan.days.forEach((d) => assert.equal(d.date, addDays(plan.startDate, d.day - 1)))
}

test('demo backlog: capacity, order, conservation', () => {
  const items = deepFreeze(makeDemoItems())
  const plan = buildPlan(items, { dailyMinutes: 120, days: 5, keepRegular: true, startDate: START })
  checkInvariants(items, plan)
  assert.equal(plan.cap, 120 - REGULAR_STUDY_MINUTES)
  assert.equal(plan.fitsWindow, true)
  assert.equal(plan.unscheduled.length, 0)
})

test('does not mutate the caller\'s items (the old demo shrank lecture minutes in place)', () => {
  const items = makeDemoItems()
  const snapshot = JSON.stringify(items)
  buildPlan(items, { dailyMinutes: 60, days: 3, keepRegular: true, startDate: START })
  assert.equal(JSON.stringify(items), snapshot)
})

test('spare time is NOT carried into the next day (old demo inflated later days)', () => {
  // cap = 90-30 = 60. Day 1 gets a 50-min atomic test, leaving 10 spare. Day 2 must still be <= 60.
  const items = [T('a', 'Test', 50), T('b', 'Test', 55), T('c', 'Test', 58)]
  const plan = buildPlan(items, { dailyMinutes: 90, days: 5, keepRegular: true, startDate: START })
  checkInvariants(items, plan)
  assert.ok(plan.days.every((d) => d.used <= 60))
  assert.equal(plan.days.length, 3)
})

test('lecture N+1 never before lecture N, even when N is split', () => {
  const items = [L('l7', 'Physics', 'CE', 7, 75), L('l5', 'Physics', 'CE', 5, 70), L('l6', 'Physics', 'CE', 6, 80)]
  const plan = buildPlan(items, { dailyMinutes: 90, days: 10, keepRegular: true, startDate: START })
  checkInvariants(items, plan)
  const seq = plan.days.flatMap((d) => d.entries.map((e) => e.itemId))
  assert.ok(seq.indexOf('l5') < seq.indexOf('l6'))
  assert.ok(seq.indexOf('l6') < seq.indexOf('l7'))
})

test('same chapter name in different subjects is independent', () => {
  const items = [L('p3', 'Physics', 'Waves', 3, 40), L('c1', 'Chemistry', 'Waves', 1, 40)]
  const plan = buildPlan(items, { dailyMinutes: 180, days: 1, keepRegular: true, startDate: START })
  checkInvariants(items, plan)
  assert.equal(plan.days[0].entries.length, 2)
})

test('already-completed earlier lectures do not block later ones', () => {
  const items = [L('l5', 'Physics', 'CE', 5, 60, true), L('l6', 'Physics', 'CE', 6, 60)]
  const plan = buildPlan(items, { dailyMinutes: 120, days: 1, keepRegular: true, startDate: START })
  checkInvariants(items, plan)
  assert.equal(plan.days[0].entries[0].itemId, 'l6')
})

test('splits lectures into parts; no sliver shorter than MIN_PART', () => {
  const items = [L('a', 'Physics', 'X', 1, 130)]
  const plan = buildPlan(items, { dailyMinutes: 90, days: 5, keepRegular: true, startDate: START }) // cap 60
  checkInvariants(items, plan)
  for (const d of plan.days) for (const e of d.entries) assert.ok(e.minutes >= MIN_PART)
  assert.equal(plan.days.length, 3)
  const parts = plan.days.flatMap((d) => d.entries.map((e) => e.part))
  assert.deepEqual(parts.map((p) => p.index), [1, 2, 3])
  assert.ok(parts.every((p) => p.total === 3))
})

test('atomic task longer than a whole day is reported, not forced in', () => {
  const items = [T('big', 'Test', 200), L('a', 'Physics', 'X', 1, 40)]
  const plan = buildPlan(items, { dailyMinutes: 120, days: 3, keepRegular: true, startDate: START }) // cap 90
  checkInvariants(items, plan)
  const big = plan.unscheduled.find((u) => u.id === 'big')
  assert.equal(big.reason, 'too-long')
  assert.equal(plan.fitsWindow, true) // too-long items don't make the window "too short"
})

test('window too short: reports leftovers and how many days are really needed', () => {
  const items = [L('a', 'Physics', 'X', 1, 180), L('b', 'Physics', 'X', 2, 180), T('c', 'DPP', 60)]
  const plan = buildPlan(items, { dailyMinutes: 90, days: 3, keepRegular: true, startDate: START }) // cap 60 -> 420 min = 7 days
  checkInvariants(items, plan)
  assert.equal(plan.fitsWindow, false)
  assert.equal(plan.daysNeeded, 7)
  assert.ok(plan.unscheduled.length > 0 && plan.unscheduled.every((u) => u.reason === 'no-time'))
  assert.equal(plan.totals.scheduledMin + plan.totals.unscheduledMin, plan.totals.pendingMin)
})

test('fills gaps: a later small task can use time a long atomic item could not', () => {
  const items = [T('t1', 'Test', 50), T('t2', 'Test', 50), T('d', 'DPP', 10)]
  const plan = buildPlan(items, { dailyMinutes: 90, days: 2, keepRegular: true, startDate: START }) // cap 60
  checkInvariants(items, plan)
  assert.deepEqual(plan.days[0].entries.map((e) => e.itemId), ['t1', 'd'])
})

test('empty / all done / bad settings', () => {
  const none = buildPlan([], { dailyMinutes: 120, days: 5, keepRegular: true, startDate: START })
  assert.ok(none.ok && none.days.length === 0 && none.pendingCount === 0)
  const done = buildPlan([T('x', 'DPP', 30, true)], { dailyMinutes: 120, days: 5, keepRegular: true, startDate: START })
  assert.ok(done.ok && done.days.length === 0)
  const bad = buildPlan([T('x', 'DPP', 30)], { dailyMinutes: 30, days: 5, keepRegular: true, startDate: START })
  assert.equal(bad.ok, false)
})

test('keepRegular=false uses the full day', () => {
  const plan = buildPlan([T('x', 'Test', 100)], { dailyMinutes: 120, days: 1, keepRegular: false, startDate: START })
  assert.equal(plan.cap, 120)
  assert.equal(plan.days[0].used, 100)
})

test('fuzz: invariants hold on 500 random backlogs', () => {
  let seed = 12345
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  for (let n = 0; n < 500; n++) {
    const items = []
    const count = 1 + Math.floor(rnd() * 14)
    for (let i = 0; i < count; i++) {
      if (rnd() < 0.6) items.push(L(`l${i}`, pick(['Physics', 'Chemistry', 'Biology']), pick(['A', 'B', 'a']), 1 + Math.floor(rnd() * 8), 5 + Math.floor(rnd() * 200), rnd() < 0.15))
      else items.push(T(`t${i}`, pick(['Revision', 'DPP', 'PYQ', 'Test', 'Module', 'CBT']), 5 + Math.floor(rnd() * 240), rnd() < 0.15))
    }
    const settings = { dailyMinutes: pick([60, 90, 120, 180, 240, 300]), days: pick([1, 3, 5, 7, 14, 30]), keepRegular: rnd() < 0.7, startDate: START }
    const plan = buildPlan(items, settings)
    if (!plan.ok) { assert.ok(settings.dailyMinutes - (settings.keepRegular ? 30 : 0) < MIN_PART * 2); continue }
    checkInvariants(items, plan)
  }
})

test('parseLectureNumber', () => {
  assert.equal(parseLectureNumber('Lecture 01'), 1)
  assert.equal(parseLectureNumber('Current Electricity — Lecture 07'), 7)
  assert.equal(parseLectureNumber('Lec-12 Kinematics'), 12)
  assert.equal(parseLectureNumber('DPP'), null)
})

test('bulk add: numbers continue after existing lectures, duplicates and bad lines are reported', () => {
  const existing = [L('e1', 'Physics', 'CE', 6, 60)]
  const text = 'Lecture 07 | 75\nCE intro | 50\nLecture 09 | abc\n | 30\nCE L6 | 60\nLecture 08'
  const { items, skipped, defaulted } = parseBulkLectures(text, existing, { subject: 'Physics', chapter: 'CE' })
  assert.deepEqual(items.map((x) => [x.name, x.num, x.min]), [['Lecture 07', 7, 75], ['CE intro', 8, 50], ['Lecture 08', 8, 60]])
  assert.equal(skipped.length, 3)
  assert.equal(defaulted, 1)
  assert.equal(new Set(items.map((x) => x.id)).size, items.length)
})

test('sanitizeItems drops junk and clamps values', () => {
  const out = sanitizeItems([null, 5, { name: '' }, { name: 'ok', kind: 'task', type: 'weird', min: 99999 }, { name: 'L', kind: 'lecture', subject: 'Math', num: -3, min: 1, chapter: '  ' }])
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'Revision'); assert.equal(out[0].min, 600)
  assert.equal(out[1].subject, 'Physics'); assert.equal(out[1].num, 1); assert.equal(out[1].min, 5); assert.equal(out[1].chapter, 'General')
})

test('planSignature changes when backlog or settings change', () => {
  const items = makeDemoItems()
  const s = { dailyMinutes: 120, days: 5, keepRegular: true }
  const a = planSignature(items, s, START)
  assert.equal(a, planSignature(items, s, START))
  assert.notEqual(a, planSignature(items, { ...s, days: 7 }, START))
  assert.notEqual(a, planSignature(items.map((x, i) => (i === 0 ? { ...x, done: true } : x)), s, START))
  assert.notEqual(a, planSignature(items, s, '2026-11-03'))
})
