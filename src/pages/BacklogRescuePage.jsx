import React, { useState } from 'react';
import {
  loadBacklog,
  toggleBacklogItem,
  removeBacklogItem,
  addLectureItem,
  addOtherItem,
  bulkAddLectureItems,
  clearBacklog
} from '../utils/rescueStorage';
import { planRescue, calculateBacklogStats } from '../utils/rescuePlanner';
import {
  LifeBuoy,
  Plus,
  Trash2,
  Check,
  Calendar,
  AlertCircle,
  X,
  Sparkles
} from 'lucide-react';

export default function BacklogRescuePage() {
  const [items, setItems] = useState(() => loadBacklog());
  const [dailyMinutes, setDailyMinutes] = useState(120);
  const [rescueDays, setRescueDays] = useState(5);
  const [keepRegularStudy, setKeepRegularStudy] = useState(true);
  const [planResult, setPlanResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Ready to rescue your backlog.');

  // Modal dialog states
  const [showLectureModal, setShowLectureModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showOtherModal, setShowOtherModal] = useState(false);

  // Form input states
  const [lecName, setLecName] = useState('');
  const [lecSubject, setLecSubject] = useState('Physics');
  const [lecMin, setLecMin] = useState(60);
  const [lecNum, setLecNum] = useState(1);
  const [lecChapter, setLecChapter] = useState('');

  const [bulkText, setBulkText] = useState('');
  const [bulkSubject, setBulkSubject] = useState('Physics');
  const [bulkChapter, setBulkChapter] = useState('');

  const [otherName, setOtherName] = useState('');
  const [otherType, setOtherType] = useState('Revision');
  const [otherMin, setOtherMin] = useState(30);

  const stats = calculateBacklogStats(items);

  const handleToggle = (id) => {
    const updated = toggleBacklogItem(items, id);
    setItems(updated);
  };

  const handleRemove = (id) => {
    const updated = removeBacklogItem(items, id);
    setItems(updated);
  };

  const handleClear = () => {
    if (window.confirm('Clear all items from your backlog?')) {
      const updated = clearBacklog();
      setItems(updated);
      setPlanResult(null);
      setStatusMsg('Backlog cleared.');
    }
  };

  const handleAddLecture = (e) => {
    e.preventDefault();
    if (!lecName.trim()) return;
    const updated = addLectureItem(items, {
      name: lecName,
      subject: lecSubject,
      chapter: lecChapter,
      num: lecNum,
      min: lecMin
    });
    setItems(updated);
    setLecName('');
    setLecChapter('');
    setLecNum(1);
    setLecMin(60);
    setShowLectureModal(false);
  };

  const handleBulkAdd = (e) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    const updated = bulkAddLectureItems(items, {
      text: bulkText,
      subject: bulkSubject,
      chapter: bulkChapter
    });
    setItems(updated);
    setBulkText('');
    setBulkChapter('');
    setShowBulkModal(false);
  };

  const handleAddOther = (e) => {
    e.preventDefault();
    if (!otherName.trim()) return;
    const updated = addOtherItem(items, {
      name: otherName,
      type: otherType,
      min: otherMin
    });
    setItems(updated);
    setOtherName('');
    setOtherMin(30);
    setShowOtherModal(false);
  };

  const handleRunRescue = () => {
    try {
      const result = planRescue({
        items,
        dailyMinutes: Number(dailyMinutes),
        days: Number(rescueDays),
        keepRegularStudy
      });
      setPlanResult(result);
      if (result.remaining && result.remaining.length > 0) {
        setStatusMsg('Partial rescue plan — more days needed');
      } else {
        setStatusMsg('Rescue plan created successfully');
      }
    } catch (err) {
      alert(err.message || 'Failed to calculate rescue plan');
    }
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '16px 14px 70px' }}>
      {/* Top Hero Section */}
      <section style={{
        border: '1px solid #352243',
        borderRadius: 22,
        padding: '24px 22px',
        background: 'radial-gradient(circle at 12% 10%, rgba(130, 67, 220, 0.35), transparent 45%), linear-gradient(135deg, #240d3f, #0d0716)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
        marginBottom: 20
      }}>
        <div style={{
          fontSize: 11, color: '#c096ff', textTransform: 'uppercase',
          letterSpacing: '1.5px', fontWeight: 800, marginBottom: 6
        }}>
          Turn backlog into a realistic plan
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 800, margin: '4px 0 10px',
          color: '#ffffff', display: 'flex', alignItems: 'center', gap: 10
        }}>
          <LifeBuoy size={28} color="#a15eff" /> Backlog Rescue
        </h1>
        <p style={{ color: '#a59bb0', fontSize: 13, lineHeight: 1.6, maxWidth: 800, margin: 0 }}>
          Add lectures and other pending work. Then specify your available study hours.
          The rescue planner respects lecture order, daily capacity limits, and carry-forward to build an achievable schedule.
        </p>

        {/* Metric stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <div style={{
            padding: '10px 14px', background: '#170e21',
            border: '1px solid #30233b', borderRadius: 10, minWidth: 120
          }}>
            <b style={{ display: 'block', fontSize: 18, color: '#f8f4ff' }}>{stats.formattedTime}</b>
            <span style={{ fontSize: 10, color: '#81758b', fontWeight: 600, letterSpacing: '0.5px' }}>BACKLOG TIME</span>
          </div>
          <div style={{
            padding: '10px 14px', background: '#170e21',
            border: '1px solid #30233b', borderRadius: 10, minWidth: 120
          }}>
            <b style={{ display: 'block', fontSize: 18, color: '#f8f4ff' }}>{stats.pendingCount}</b>
            <span style={{ fontSize: 10, color: '#81758b', fontWeight: 600, letterSpacing: '0.5px' }}>PENDING ITEMS</span>
          </div>
          <div style={{
            padding: '10px 14px', background: '#170e21',
            border: '1px solid #30233b', borderRadius: 10, minWidth: 120
          }}>
            <b style={{ display: 'block', fontSize: 18, color: '#34d399' }}>{stats.doneCount}</b>
            <span style={{ fontSize: 10, color: '#81758b', fontWeight: 600, letterSpacing: '0.5px' }}>COMPLETED</span>
          </div>
        </div>
      </section>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          onClick={() => setShowLectureModal(true)}
          style={{
            border: 0, borderRadius: 10, padding: '10px 15px',
            background: '#7d40d7', color: '#fff', fontWeight: 700,
            cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Plus size={15} /> Add Lecture
        </button>
        <button
          onClick={() => setShowBulkModal(true)}
          style={{
            borderRadius: 10, padding: '10px 15px',
            background: '#171020', border: '1px solid #33263d',
            color: '#c7bdcf', fontWeight: 700, cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Plus size={15} /> Bulk Add Lectures
        </button>
        <button
          onClick={() => setShowOtherModal(true)}
          style={{
            borderRadius: 10, padding: '10px 15px',
            background: '#171020', border: '1px solid #33263d',
            color: '#c7bdcf', fontWeight: 700, cursor: 'pointer', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Plus size={15} /> Add Other Task
        </button>
      </div>

      {/* 2-Column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 16
      }}>
        {/* Left Column: Backlog Items List */}
        <section style={{
          border: '1px solid #2d2337',
          background: '#0f0917',
          borderRadius: 18,
          padding: 18,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <h2 style={{ fontSize: 16, margin: 0, color: '#f8f4ff' }}>Your backlog</h2>
              <div style={{ color: '#8d8196', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
                Enforces lecture prerequisites: earlier lectures in a chapter are always scheduled first.
              </div>
            </div>
            {items.length > 0 && (
              <button
                onClick={handleClear}
                style={{
                  borderRadius: 8, padding: '5px 10px', background: '#171020',
                  border: '1px solid #33263d', color: '#f87171', fontSize: 11,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0
                }}
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          {/* Items list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {items.length === 0 ? (
              <div style={{
                padding: 30, textAlign: 'center', color: '#81758c',
                border: '1px dashed #30243a', borderRadius: 12, fontSize: 13
              }}>
                No backlog items found. Click &quot;Add Lecture&quot; or &quot;Bulk Add Lectures&quot; above to get started.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: '1px solid #282031',
                    background: '#150e1e',
                    borderRadius: 11,
                    padding: '10px 12px',
                    opacity: item.done ? 0.55 : 1,
                    transition: 'opacity 0.2s'
                  }}
                >
                  {/* Done checkbox */}
                  <div
                    onClick={() => handleToggle(item.id)}
                    style={{
                      width: 20, height: 20,
                      borderRadius: 6,
                      border: item.done ? '1.5px solid #8146da' : '1.5px solid #6f6478',
                      background: item.done ? '#8146da' : 'transparent',
                      display: 'grid', placeItems: 'center',
                      cursor: 'pointer', flexShrink: 0
                    }}
                  >
                    {item.done && <Check size={13} color="#fff" strokeWidth={3} />}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 13, color: '#f8f4ff',
                      textDecoration: item.done ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#7f7489', marginTop: 2 }}>
                      {item.kind === 'lecture'
                        ? `${item.subject} • ${item.chapter} • Lecture ${item.num}`
                        : item.type}
                    </div>
                  </div>

                  {/* Badge */}
                  <span style={{
                    fontSize: 10, padding: '3px 7px', background: '#261633',
                    color: '#bd9ce1', borderRadius: 6, fontWeight: 600, flexShrink: 0
                  }}>
                    {item.min} min
                  </span>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemove(item.id)}
                    style={{
                      border: 0, background: 'none', color: '#6e6377',
                      fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1
                    }}
                    title="Remove item"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right Column: Rescue Planner */}
        <section style={{
          border: '1px solid #2d2337',
          background: 'linear-gradient(145deg, #160d22, #0d0814)',
          borderRadius: 18,
          padding: 18,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg, #a15eff, #5420a0)',
              boxShadow: '0 0 20px rgba(141, 75, 224, 0.4)',
              color: '#fff'
            }}>
              <Sparkles size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, margin: 0, color: '#f8f4ff' }}>Rescue Planner</h2>
              <div style={{ color: '#8d8196', fontSize: 11, marginTop: 2 }}>{statusMsg}</div>
            </div>
          </div>

          {/* Configuration controls */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 4,
            marginBottom: 10
          }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: '#8d8196', marginBottom: 4 }}>
                Time available per day
              </label>
              <select
                value={dailyMinutes}
                onChange={(e) => setDailyMinutes(Number(e.target.value))}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #372a43',
                  background: '#0b0710', color: '#fff', borderRadius: 9, outline: 0, fontSize: 13
                }}
              >
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
                <option value={240}>4 hours</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: '#8d8196', marginBottom: 4 }}>
                Rescue window
              </label>
              <select
                value={rescueDays}
                onChange={(e) => setRescueDays(Number(e.target.value))}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #372a43',
                  background: '#0b0710', color: '#fff', borderRadius: 9, outline: 0, fontSize: 13
                }}
              >
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
                <option value={10}>10 days</option>
                <option value={14}>14 days</option>
              </select>
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: '#aaa0b2', marginBottom: 14, cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={keepRegularStudy}
              onChange={(e) => setKeepRegularStudy(e.target.checked)}
              style={{ accentColor: '#8146da', width: 15, height: 15, margin: 0 }}
            />
            Keep 30 min/day for regular study & revision
          </label>

          <button
            onClick={handleRunRescue}
            style={{
              width: '100%', border: 0, borderRadius: 10, padding: '12px 16px',
              background: '#7d40d7', color: '#fff', fontWeight: 800,
              fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, transition: 'background 0.2s'
            }}
          >
            <LifeBuoy size={17} /> Rescue My Backlog
          </button>

          {/* Plan results display */}
          <div style={{ marginTop: 14 }}>
            {!planResult ? (
              <div style={{
                padding: 28, textAlign: 'center', color: '#81758c',
                border: '1px dashed #30243a', borderRadius: 12, fontSize: 13
              }}>
                Your rescue plan will appear here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {planResult.planned.map((p) => {
                  if (!p.items || p.items.length === 0) return null;
                  return (
                    <div
                      key={p.day}
                      style={{
                        border: '1px solid #2a2033', borderRadius: 12,
                        padding: 12, background: '#150e1e'
                      }}
                    >
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontWeight: 800, fontSize: 13, color: '#f8f4ff'
                      }}>
                        <span>Day {p.day}</span>
                        <span style={{ color: '#c096ff' }}>{p.used} min planned</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#82778d', marginTop: 2 }}>
                        Available backlog time: {p.used} min
                        {p.carry > 0 ? ` • ${p.carry} min spare` : ''}
                      </div>

                      <div style={{ marginTop: 8, borderTop: '1px solid #251b2d', paddingTop: 6 }}>
                        {p.items.map((x, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 0', fontSize: 12
                            }}
                          >
                            <span style={{
                              fontSize: 9, color: '#b58adf', fontWeight: 700,
                              minWidth: 50, letterSpacing: '0.5px'
                            }}>
                              {x.kind === 'lecture' ? 'LECTURE' : (x.type || 'TASK').toUpperCase()}
                            </span>
                            <span style={{ flex: 1, color: '#e2d9ee' }}>{x.name}</span>
                            <span style={{ color: '#a59bb0', fontSize: 11 }}>{x.min}m</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Status summary banner */}
                {planResult.remaining && planResult.remaining.length > 0 ? (
                  <div style={{
                    marginTop: 8, padding: 12, borderRadius: 10,
                    background: '#2e1925', border: '1px solid #4a243b',
                    color: '#fca5a5', fontSize: 11, lineHeight: 1.5
                  }}>
                    ⚠️ <b>{planResult.remaining.length} item(s) remain</b>. The planner did not overload your days.
                    Increase the rescue window or available daily hours.
                  </div>
                ) : (
                  <div style={{
                    marginTop: 8, padding: 12, borderRadius: 10,
                    background: '#162b21', border: '1px solid #234d3a',
                    color: '#86efac', fontSize: 11, lineHeight: 1.5
                  }}>
                    🎉 <b>Backlog fits inside the selected rescue window</b> without breaking lecture order.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Modal: Add Lecture */}
      {showLectureModal && (
        <div style={modalBackdropStyle} onClick={() => setShowLectureModal(false)}>
          <div style={modalDialogStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: '#fff' }}>Add lecture</h3>
              <button onClick={() => setShowLectureModal(false)} style={modalCloseBtnStyle}>×</button>
            </div>
            <div style={{ fontSize: 11, color: '#8d8196', marginBottom: 14 }}>
              Create a single lecture inside your backlog.
            </div>

            <form onSubmit={handleAddLecture}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Lecture title</label>
                <input
                  type="text"
                  placeholder="e.g. Current Electricity — Lecture 07"
                  value={lecName}
                  onChange={(e) => setLecName(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <select
                    value={lecSubject}
                    onChange={(e) => setLecSubject(e.target.value)}
                    style={inputStyle}
                  >
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Biology</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Duration (minutes)</label>
                  <input
                    type="number"
                    min="5"
                    value={lecMin}
                    onChange={(e) => setLecMin(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Lecture number</label>
                  <input
                    type="number"
                    min="1"
                    value={lecNum}
                    onChange={(e) => setLecNum(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Chapter</label>
                  <input
                    type="text"
                    placeholder="e.g. Current Electricity"
                    value={lecChapter}
                    onChange={(e) => setLecChapter(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setShowLectureModal(false)}
                  style={altBtnStyle}
                >
                  Cancel
                </button>
                <button type="submit" style={primaryBtnStyle}>
                  Add Lecture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk Add */}
      {showBulkModal && (
        <div style={modalBackdropStyle} onClick={() => setShowBulkModal(false)}>
          <div style={modalDialogStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: '#fff' }}>Bulk add lectures</h3>
              <button onClick={() => setShowBulkModal(false)} style={modalCloseBtnStyle}>×</button>
            </div>
            <div style={{ fontSize: 11, color: '#8d8196', marginBottom: 14 }}>
              One lecture per line. Format: Lecture name | minutes. Example: Lecture 01 | 75
            </div>

            <form onSubmit={handleBulkAdd}>
              <div style={{ marginBottom: 12 }}>
                <textarea
                  rows={7}
                  placeholder={'Lecture 01 | 75\nLecture 02 | 80\nLecture 03 | 60'}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  required
                />
              </div>

              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <select
                    value={bulkSubject}
                    onChange={(e) => setBulkSubject(e.target.value)}
                    style={inputStyle}
                  >
                    <option>Physics</option>
                    <option>Chemistry</option>
                    <option>Biology</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Chapter</label>
                  <input
                    type="text"
                    placeholder="e.g. Current Electricity"
                    value={bulkChapter}
                    onChange={(e) => setBulkChapter(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  style={altBtnStyle}
                >
                  Cancel
                </button>
                <button type="submit" style={primaryBtnStyle}>
                  Add All
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Other Task */}
      {showOtherModal && (
        <div style={modalBackdropStyle} onClick={() => setShowOtherModal(false)}>
          <div style={modalDialogStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: '#fff' }}>Add other backlog task</h3>
              <button onClick={() => setShowOtherModal(false)} style={modalCloseBtnStyle}>×</button>
            </div>
            <div style={{ fontSize: 11, color: '#8d8196', marginBottom: 14 }}>
              For DPP, test, revision, module, PYQ etc.
            </div>

            <form onSubmit={handleAddOther}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Task name</label>
                <input
                  type="text"
                  placeholder="e.g. Current Electricity — DPP 03"
                  value={otherName}
                  onChange={(e) => setOtherName(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select
                    value={otherType}
                    onChange={(e) => setOtherType(e.target.value)}
                    style={inputStyle}
                  >
                    <option>Revision</option>
                    <option>DPP</option>
                    <option>PYQ</option>
                    <option>Test</option>
                    <option>Module</option>
                    <option>CBT</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Minutes</label>
                  <input
                    type="number"
                    min="5"
                    value={otherMin}
                    onChange={(e) => setOtherMin(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setShowOtherModal(false)}
                  style={altBtnStyle}
                >
                  Cancel
                </button>
                <button type="submit" style={primaryBtnStyle}>
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const modalBackdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16
};

const modalDialogStyle = {
  width: 'min(480px, 100%)',
  background: '#130c20',
  color: '#fff',
  border: '1px solid #3c2c4b',
  borderRadius: 18,
  padding: 22,
  boxShadow: '0 25px 60px rgba(0,0,0,0.6)'
};

const modalCloseBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#8d8196',
  fontSize: 22,
  cursor: 'pointer',
  padding: '0 6px',
  lineHeight: 1
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #372a43',
  background: '#0b0710',
  color: '#fff',
  borderRadius: 9,
  outline: 0,
  fontSize: 13,
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: '#8d8196',
  marginBottom: 5
};

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginBottom: 12
};

const primaryBtnStyle = {
  border: 0,
  borderRadius: 9,
  padding: '10px 16px',
  background: '#7d40d7',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13
};

const altBtnStyle = {
  background: '#1a1226',
  border: '1px solid #33263d',
  color: '#c7bdcf',
  borderRadius: 9,
  padding: '10px 14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13
};
