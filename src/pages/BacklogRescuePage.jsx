import React, { useState, useEffect, useMemo, useRef } from 'react'
import { LifeBuoy, Plus, List, Trash2, Check, AlertTriangle, X, RotateCcw, Calendar } from 'lucide-react'
import { useAuth } from '../utils/useAuth'
import { loadRescue, saveRescue, DAILY_OPTIONS, DAY_OPTIONS } from '../utils/rescueStorage'
import {
  buildPlan, planSignature, parseBulkLectures, makeDemoItems, newId, toDateStr, addDays,
  formatMinutes, SUBJECTS, TASK_TYPES, REGULAR_STUDY_MINUTES,
} from '../utils/rescuePlanner'

const SUB_COLORS = { Physics: 'var(--accent)', Chemistry: 'var(--green)', Biology: 'var(--yellow)' }
const FILTERS = ['All', ...SUBJECTS, 'Tasks']

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }
const inputStyle = {
  width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 10, fontSize: 14, outline: 'none',
}
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
  border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'white',
  background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
}
const btnAlt = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
  border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 500, fontSize: 13, color: 'var(--text)', background: 'var(--surface2)',
}

const formatDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function Modal({ title, hint, onClose, children }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose // keep latest handler without re-running the effect (which would steal focus)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    const first = ref.current?.querySelector('input, textarea, select')
    if (first) first.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} style={{ ...card, width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: 700 }}>{title}</h3>
            {hint && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>
  )
}

const FormError = ({ children }) => children ? <div role="alert" style={{ color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{children}</div> : null

function LectureForm({ items, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('Physics')
  const [chapter, setChapter] = useState('')
  const [min, setMin] = useState('60')
  const [num, setNum] = useState('')
  const [error, setError] = useState('')

  const chap = chapter.trim() || 'General'
  const suggested = useMemo(() => items
    .filter((x) => x.kind === 'lecture' && x.subject === subject && x.chapter.trim().toLowerCase() === chap.toLowerCase())
    .reduce((a, x) => Math.max(a, x.num), 0) + 1, [items, subject, chap])

  const submit = (e) => {
    e.preventDefault()
    const n = name.trim()
    const m = Number(min)
    const ln = num === '' ? suggested : Number(num)
    if (!n) return setError('Enter a lecture name.')
    if (n.length > 120) return setError('Name is too long (max 120 characters).')
    if (!Number.isInteger(m) || m < 5 || m > 600) return setError('Duration must be a whole number between 5 and 600 minutes.')
    if (!Number.isInteger(ln) || ln < 1 || ln > 999) return setError('Lecture number must be between 1 and 999.')
    if (items.some((x) => x.name.trim().toLowerCase() === n.toLowerCase())) return setError('A backlog item with this name already exists.')
    onSubmit({ id: newId(), kind: 'lecture', name: n, subject, chapter: chap.slice(0, 80), num: ln, min: m, done: false })
  }

  return (
    <form onSubmit={submit}>
      <label style={labelStyle} htmlFor="rs-lname">Lecture name</label>
      <input id="rs-lname" style={{ ...inputStyle, marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Current Electricity — Lecture 07" maxLength={120} />
      <div className="rescue-row2" style={{ marginBottom: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="rs-lsub">Subject</label>
          <select id="rs-lsub" style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="rs-lmin">Duration (minutes)</label>
          <input id="rs-lmin" style={inputStyle} type="number" min="5" max="600" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
      </div>
      <div className="rescue-row2" style={{ marginBottom: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="rs-lchap">Chapter</label>
          <input id="rs-lchap" style={inputStyle} value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Current Electricity" maxLength={80} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rs-lnum">Lecture number</label>
          <input id="rs-lnum" style={inputStyle} type="number" min="1" max="999" value={num === '' ? suggested : num} onChange={(e) => setNum(e.target.value)} />
        </div>
      </div>
      <FormError>{error}</FormError>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" style={btnAlt} onClick={onClose}>Cancel</button>
        <button type="submit" style={btnPrimary}>Add Lecture</button>
      </div>
    </form>
  )
}

function BulkForm({ items, onSubmit, onClose }) {
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('Physics')
  const [chapter, setChapter] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return setError('Paste at least one lecture, one per line.')
    const result = parseBulkLectures(text, items, { subject, chapter })
    if (!result.items.length) {
      const why = result.skipped.slice(0, 3).map((s) => `"${s.line.slice(0, 30)}" (${s.reason})`).join(', ')
      return setError(`Nothing could be added. ${why}`)
    }
    onSubmit(result)
  }

  return (
    <form onSubmit={submit}>
      <label style={labelStyle} htmlFor="rs-bulk">Lectures</label>
      <textarea id="rs-bulk" rows={8} style={{ ...inputStyle, resize: 'vertical', marginBottom: 12, fontFamily: 'inherit' }} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'Lecture 05 | 70\nLecture 06 | 80\nLecture 07 | 75'} />
      <div className="rescue-row2" style={{ marginBottom: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="rs-bsub">Subject</label>
          <select id="rs-bsub" style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="rs-bchap">Chapter</label>
          <input id="rs-bchap" style={inputStyle} value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="Current Electricity" maxLength={80} />
        </div>
      </div>
      <FormError>{error}</FormError>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" style={btnAlt} onClick={onClose}>Cancel</button>
        <button type="submit" style={btnPrimary}>Add All</button>
      </div>
    </form>
  )
}

function TaskForm({ items, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('Revision')
  const [min, setMin] = useState('30')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const n = name.trim()
    const m = Number(min)
    if (!n) return setError('Enter a task name.')
    if (n.length > 120) return setError('Name is too long (max 120 characters).')
    if (!Number.isInteger(m) || m < 5 || m > 600) return setError('Minutes must be a whole number between 5 and 600.')
    if (items.some((x) => x.name.trim().toLowerCase() === n.toLowerCase())) return setError('A backlog item with this name already exists.')
    onSubmit({ id: newId(), kind: 'task', name: n, type, min: m, done: false })
  }

  return (
    <form onSubmit={submit}>
      <label style={labelStyle} htmlFor="rs-oname">Task name</label>
      <input id="rs-oname" style={{ ...inputStyle, marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Current Electricity — DPP 03" maxLength={120} />
      <div className="rescue-row2" style={{ marginBottom: 12 }}>
        <div>
          <label style={labelStyle} htmlFor="rs-otype">Type</label>
          <select id="rs-otype" style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="rs-omin">Minutes</label>
          <input id="rs-omin" style={inputStyle} type="number" min="5" max="600" value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
      </div>
      <FormError>{error}</FormError>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" style={btnAlt} onClick={onClose}>Cancel</button>
        <button type="submit" style={btnPrimary}>Add Task</button>
      </div>
    </form>
  )
}

function RescueInner({ uid }) {
  const [state, setState] = useState(() => loadRescue(uid))
  const { items, settings, plan } = state
  const [dialog, setDialog] = useState(null) // 'lecture' | 'bulk' | 'task' | null
  const [filter, setFilter] = useState('All')
  const [showDone, setShowDone] = useState(true)
  const [notice, setNotice] = useState(null) // { type: 'ok' | 'info' | 'error', text }

  useEffect(() => { saveRescue(uid, state) }, [uid, state])
  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(null), 7000)
    return () => clearTimeout(t)
  }, [notice])

  const setItems = (fn) => setState((s) => ({ ...s, items: fn(s.items) }))
  const setSettings = (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const closeDialog = () => setDialog(null)

  const todayStr = toDateStr(new Date())
  const startDate = addDays(todayStr, settings.startOffset)
  const itemsById = useMemo(() => new Map(items.map((x) => [x.id, x])), [items])
  const pending = items.filter((x) => !x.done)
  const pendingMin = pending.reduce((a, x) => a + x.min, 0)
  const doneCount = items.length - pending.length

  const stale = useMemo(() => plan && plan.signature !== planSignature(items, settings, startDate), [plan, items, settings, startDate])

  const visible = items.filter((x) => {
    if (!showDone && x.done) return false
    if (filter === 'All') return true
    if (filter === 'Tasks') return x.kind === 'task'
    return x.kind === 'lecture' && x.subject === filter
  })

  const toggle = (id) => setItems((list) => list.map((x) => (x.id === id ? { ...x, done: !x.done } : x)))
  const remove = (id) => setItems((list) => list.filter((x) => x.id !== id))

  const addOne = (item) => { setItems((list) => [...list, item]); closeDialog(); setNotice({ type: 'ok', text: `Added "${item.name}".` }) }
  const addBulk = ({ items: added, skipped, defaulted }) => {
    setItems((list) => [...list, ...added])
    closeDialog()
    const extra = []
    if (skipped.length) extra.push(`${skipped.length} line(s) skipped (${[...new Set(skipped.map((s) => s.reason))].join(', ')})`)
    if (defaulted) extra.push(`${defaulted} without minutes were set to 60`)
    setNotice({ type: skipped.length || defaulted ? 'info' : 'ok', text: `Added ${added.length} lecture(s).${extra.length ? ' ' + extra.join('; ') + '.' : ''}` })
  }

  const loadDemo = () => {
    if (items.length && !window.confirm('Replace your current backlog with the demo backlog?')) return
    setState((s) => ({ ...s, items: makeDemoItems(), plan: null }))
    setNotice({ type: 'info', text: 'Demo backlog loaded. Your own items are replaced — use Clear to start fresh.' })
  }
  const clearAll = () => {
    if (!items.length) return
    if (!window.confirm('Clear the whole backlog and the saved plan?')) return
    setState((s) => ({ ...s, items: [], plan: null }))
  }

  const generate = () => {
    const result = buildPlan(items, { ...settings, startDate })
    if (!result.ok) { setNotice({ type: 'error', text: result.error }); return }
    setState((s) => ({ ...s, plan: { signature: planSignature(items, settings, startDate), generatedAt: Date.now(), result } }))
  }

  const result = plan?.result
  const sel = { ...inputStyle, padding: '9px 10px' }

  return (
    <div>
      <style>{`
        .rescue-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; align-items: start; }
        .rescue-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        @media (max-width: 900px) { .rescue-grid { grid-template-columns: 1fr; } }
        @media (max-width: 520px) { .rescue-row2 { grid-template-columns: 1fr; } }
      `}</style>

      {/* Header */}
      <div style={{ ...card, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--surface)), var(--surface))', padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LifeBuoy size={26} color="var(--accent2)" />
          <h1 style={{ fontFamily: 'Space Grotesk', fontSize: 26, fontWeight: 700 }}>Backlog Rescue</h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8, lineHeight: 1.6, maxWidth: 680 }}>
          Add the lectures and tasks you are behind on, tell us how much time you really have, and get a day-by-day plan that never
          exceeds your daily time and never puts Lecture 6 before Lecture 5.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {[['Backlog time', formatMinutes(pendingMin)], ['Pending items', pending.length], ['Completed', doneCount]].map(([k, v]) => (
            <div key={k} style={{ padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, minWidth: 110 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
            </div>
          ))}
        </div>
      </div>

      {notice && (
        <div role="status" style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10,
          background: notice.type === 'error' ? 'rgba(239,68,68,0.12)' : notice.type === 'ok' ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.12)',
          border: `1px solid ${notice.type === 'error' ? 'rgba(239,68,68,0.3)' : notice.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`,
          color: notice.type === 'error' ? '#fca5a5' : 'var(--text)',
        }}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" style={btnPrimary} onClick={() => setDialog('lecture')}><Plus size={16} /> Add Lecture</button>
        <button type="button" style={btnAlt} onClick={() => setDialog('bulk')}><List size={16} /> Bulk Add Lectures</button>
        <button type="button" style={btnAlt} onClick={() => setDialog('task')}><Plus size={16} /> Add Other Task</button>
      </div>

      <div className="rescue-grid">
        {/* Backlog */}
        <section style={card} aria-label="Your backlog">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, fontWeight: 700 }}>Your backlog</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btnAlt} onClick={loadDemo}><RotateCcw size={14} /> Load demo</button>
              <button type="button" style={btnAlt} onClick={clearAll} disabled={!items.length}>Clear</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
            {FILTERS.map((f) => (
              <button type="button" key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                background: filter === f ? (SUB_COLORS[f] || 'var(--accent)') : 'var(--surface2)',
                color: filter === f ? 'white' : 'var(--muted)', fontWeight: filter === f ? 600 : 400,
              }}>{f}</button>
            ))}
            <label style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed
            </label>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '34px 12px', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 12, fontSize: 13, lineHeight: 1.6 }}>
                {items.length === 0 ? 'Your backlog is empty. Add a lecture or task, or load the demo backlog to try it out.' : 'Nothing matches this filter.'}
              </div>
            ) : visible.map((x) => (
              <div key={x.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12,
                background: 'var(--surface2)', border: '1px solid var(--border)', opacity: x.done ? 0.55 : 1,
              }}>
                <button type="button" onClick={() => toggle(x.id)} aria-pressed={x.done} aria-label={`${x.done ? 'Mark pending' : 'Mark complete'}: ${x.name}`} style={{
                  width: 22, height: 22, flex: 'none', borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center',
                  border: `1.5px solid ${x.done ? 'var(--accent)' : 'var(--muted)'}`, background: x.done ? 'var(--accent)' : 'transparent', color: 'white', padding: 0,
                }}>{x.done && <Check size={14} />}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, textDecoration: x.done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{x.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {x.kind === 'lecture'
                      ? <><span style={{ color: SUB_COLORS[x.subject] }}>{x.subject}</span> • {x.chapter} • Lecture {x.num}</>
                      : x.type}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'var(--bg)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{x.min} min</span>
                <button type="button" onClick={() => remove(x.id)} aria-label={`Delete ${x.name}`} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </section>

        {/* Planner */}
        <section style={card} aria-label="Rescue planner">
          <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 16, fontWeight: 700 }}>Rescue Planner</h2>
          <div className="rescue-row2" style={{ marginTop: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="rs-daily">Time available per day</label>
              <select id="rs-daily" style={sel} value={settings.dailyMinutes} onChange={(e) => setSettings({ dailyMinutes: Number(e.target.value) })}>
                {DAILY_OPTIONS.map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="rs-days">Rescue window</label>
              <select id="rs-days" style={sel} value={settings.days} onChange={(e) => setSettings({ days: Number(e.target.value) })}>
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </div>
          <div className="rescue-row2" style={{ marginTop: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="rs-start">Start</label>
              <select id="rs-start" style={sel} value={settings.startOffset} onChange={(e) => setSettings({ startOffset: Number(e.target.value) })}>
                <option value={0}>Today</option>
                <option value={1}>Tomorrow</option>
              </select>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-end', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', paddingBottom: 10, lineHeight: 1.4 }}>
              <input type="checkbox" checked={settings.keepRegular} onChange={(e) => setSettings({ keepRegular: e.target.checked })} style={{ marginBottom: 2 }} />
              Keep {REGULAR_STUDY_MINUTES} min/day for regular study
            </label>
          </div>
          <button type="button" style={{ ...btnPrimary, width: '100%', marginTop: 14, opacity: pending.length ? 1 : 0.5 }} onClick={generate} disabled={!pending.length}>
            <LifeBuoy size={16} /> {plan ? 'Rebuild My Plan' : 'Rescue My Backlog'}
          </button>
          {!pending.length && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{items.length ? 'Everything is complete. 🎉' : 'Add something to your backlog first.'}</p>}

          {stale && (
            <div role="status" style={{ marginTop: 12, padding: '9px 12px', borderRadius: 10, fontSize: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--text)' }}>
              Your backlog, settings or date changed since this plan was made. Press <b>Rebuild My Plan</b> to refresh it.
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                {formatMinutes(result.totals.scheduledMin)} of backlog scheduled over {result.days.length} day(s) —
                up to {formatMinutes(result.cap)} per day{result.reserve ? ` + ${result.reserve} min regular study` : ''}.
              </div>

              {result.days.map((d) => (
                <div key={d.day} style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700, fontSize: 14, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} color="var(--accent2)" /> Day {d.day} · {formatDate(d.date)}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{formatMinutes(d.used)} / {formatMinutes(result.cap)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--bg)', marginTop: 8 }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, Math.round((d.used / result.cap) * 100))}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent2))' }} />
                  </div>
                  {d.entries.map((e, i) => {
                    const it = itemsById.get(e.itemId)
                    const isDone = !it || it.done
                    return (
                      <div key={`${e.itemId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', marginTop: i ? 0 : 8, opacity: isDone ? 0.5 : 1 }}>
                        {e.final ? (
                          <button type="button" onClick={() => it && toggle(e.itemId)} disabled={!it} aria-pressed={!!it?.done} aria-label={`${it?.done ? 'Mark pending' : 'Mark complete'}: ${e.name}`} style={{
                            width: 20, height: 20, flex: 'none', borderRadius: 6, cursor: it ? 'pointer' : 'default', display: 'grid', placeItems: 'center', padding: 0, color: 'white',
                            border: `1.5px solid ${it?.done ? 'var(--accent)' : 'var(--muted)'}`, background: it?.done ? 'var(--accent)' : 'transparent',
                          }}>{it?.done && <Check size={13} />}</button>
                        ) : <span style={{ width: 20, flex: 'none' }} />}
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--accent2)', minWidth: 54 }}>{e.kind === 'lecture' ? 'LECTURE' : String(e.type).toUpperCase()}</span>
                        <span style={{ flex: 1, fontSize: 13, overflowWrap: 'anywhere', textDecoration: isDone ? 'line-through' : 'none' }}>
                          {e.name}
                          {e.part && <span style={{ color: 'var(--muted)', fontSize: 11 }}> · Part {e.part.index}{e.part.total ? `/${e.part.total}` : ' (continues)'}</span>}
                          {!it && <span style={{ color: 'var(--muted)', fontSize: 11 }}> · removed</span>}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.minutes}m</span>
                      </div>
                    )
                  })}
                </div>
              ))}

              {result.unscheduled.length > 0 && (
                <div role="status" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}><AlertTriangle size={14} color="var(--yellow)" /> Not scheduled ({result.unscheduled.length})</div>
                  {!result.fitsWindow && (
                    <div style={{ marginTop: 4 }}>
                      We did not overload your days. Finishing everything at this pace takes about <b>{result.daysNeeded} days</b> — extend the window or add daily time.
                    </div>
                  )}
                  <ul style={{ margin: '8px 0 0 16px' }}>
                    {result.unscheduled.map((u) => (
                      <li key={u.id}>
                        {u.name} — {formatMinutes(u.minutes)}{u.reason === 'too-long' ? ` (a single ${u.type || 'task'} longer than one day's ${formatMinutes(result.cap)} — raise daily time or split it)` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.unscheduled.length === 0 && result.days.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Check size={16} color="var(--green)" /> Your whole backlog fits inside the window, in lecture order.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {dialog === 'lecture' && <Modal title="Add lecture" hint="Create a single lecture in your backlog." onClose={closeDialog}><LectureForm items={items} onSubmit={addOne} onClose={closeDialog} /></Modal>}
      {dialog === 'bulk' && <Modal title="Bulk add lectures" hint="One lecture per line: Lecture name | minutes. The lecture number is read from the name (e.g. “Lecture 07 | 75”); minutes default to 60." onClose={closeDialog}><BulkForm items={items} onSubmit={addBulk} onClose={closeDialog} /></Modal>}
      {dialog === 'task' && <Modal title="Add other task" hint="DPP, test, revision, module, PYQ, CBT…" onClose={closeDialog}><TaskForm items={items} onSubmit={addOne} onClose={closeDialog} /></Modal>}
    </div>
  )
}

// Keyed by uid so switching accounts remounts with that user's own data (and can never write
// one user's backlog into another user's storage key).
export default function BacklogRescuePage() {
  const { user } = useAuth()
  return <RescueInner key={user?.uid || 'anon'} uid={user?.uid} />
}
