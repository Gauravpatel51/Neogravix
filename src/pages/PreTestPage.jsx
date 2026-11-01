import React, { useState, useEffect } from 'react'
import { AlertTriangle, Info, CheckCircle2, FileText, Settings, Play, X, Camera, Eye } from 'lucide-react'
import { CAMERA_PROCTORING_ENABLED } from '../config/proctoring'
import { useAuth } from '../utils/useAuth'

export default function PreTestPage({ test, setPage }) {
  const { profile } = useAuth()
  const [agreed1, setAgreed1] = useState(false)
  const [agreed2, setAgreed2] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [proctoringMode, setProctoringMode] = useState(CAMERA_PROCTORING_ENABLED ? 'camera' : 'none')

  // Dynamic calculations based on test data
  const questions = test?.questions || []
  const totalQuestions = questions.length
  
  // Group by subjects
  const subjectMap = {}
  questions.forEach(q => {
    const sub = q.subject || 'Other'
    const key = sub.charAt(0).toUpperCase() + sub.slice(1)
    if (!subjectMap[key]) {
      subjectMap[key] = { count: 0, marks: 0 }
    }
    subjectMap[key].count += 1
    subjectMap[key].marks += 4 // Default +4 marks per question for NEET
  })

  const subjectRows = Object.keys(subjectMap).map(key => ({
    name: key,
    questions: subjectMap[key].count,
    marks: subjectMap[key].marks
  }))

  const totalMarks = subjectRows.reduce((acc, row) => acc + row.marks, 0)
  const duration = test?.duration || 3 * 3600 // default 3 hours
  const formatTime = (secs) => `${Math.floor(secs / 3600)} Hours ${Math.floor((secs % 3600) / 60)} Minutes`
  
  const allSubjects = subjectRows.map(r => r.name).join(', ') || 'General'

  const handleStartExam = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen(); // Safari
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen(); // IE11
      }
    } catch (err) {
      console.error("Failed to enter fullscreen:", err);
    }
    if (test) {
      test.proctoringMode = proctoringMode;
    }
    try {
      localStorage.setItem('neogravix_proctoring_mode', proctoringMode);
    } catch (e) {}
    setPage('exam')
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ 
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, 
          padding: '24px 32px', marginBottom: 24, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 20
        }}>
          <div>
            <h1 style={{ fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              {test?.name || 'NEET Mock Test'}
            </h1>
            <div style={{ fontSize: 14, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>Candidate: <strong style={{ color: '#e2e8f0' }}>{profile?.full_name || 'Student'}</strong></span>
              <span>ID: <strong style={{ color: '#e2e8f0' }}>{profile?.id?.slice(0, 8) || 'N/A'}</strong></span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <img src="/logo.jpg" alt="Neogravix" style={{ height: 40, borderRadius: 8, opacity: 0.9 }} onError={(e) => e.target.style.display = 'none'} />
          </div>
        </div>

        {/* Test Summary & Subject Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 24 }}>
          
          {/* Summary Card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={18} color="var(--accent)" /> Exam Summary
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Exam Type:</span>
                <span style={{ fontWeight: 600 }}>Computer Based Test (NEET)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Subjects:</span>
                <span style={{ fontWeight: 600 }}>{allSubjects}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Total Questions:</span>
                <span style={{ fontWeight: 600 }}>{totalQuestions}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Total Marks:</span>
                <span style={{ fontWeight: 600 }}>{totalMarks}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Duration:</span>
                <span style={{ fontWeight: 600 }}>{formatTime(duration)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Language:</span>
                <span style={{ fontWeight: 600 }}>English</span>
              </div>
            </div>
          </div>

          {/* Subject Breakdown Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} color="var(--accent)" /> Subject Breakdown
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Subject</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Questions</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectRows.map(row => (
                    <tr key={row.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', color: '#e2e8f0', fontWeight: 500 }}>{row.name}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#e2e8f0' }}>{row.questions}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#e2e8f0' }}>{row.marks}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td style={{ padding: '12px', color: 'var(--text)' }}>Total</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{totalQuestions}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text)' }}>{totalMarks}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Instructions & Marking Scheme */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 24 }}>
          {/* Instructions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
             <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Test Instructions</h2>
             <ul style={{ paddingLeft: 20, color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
               <li>Read each question carefully before answering.</li>
               <li>The timer starts immediately after clicking <strong>Start Test</strong>.</li>
               <li>Every question carries equal marks unless specified otherwise.</li>
               <li>You can navigate freely between questions using the Question Palette.</li>
               <li>You can mark questions for review.</li>
               <li>Answers are automatically saved.</li>
               <li>Question Palette colors indicate the status of each question.</li>
               <li>The test is automatically submitted when the timer reaches zero.</li>
             </ul>
          </div>
          {/* Marking Scheme */}
          <div style={{ background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent) 20%, var(--border))', borderRadius: 16, padding: 24 }}>
             <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', marginBottom: 16 }}>Marking Scheme</h2>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'color-mix(in srgb, var(--green) 20%, transparent)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✓</span>
                  <span style={{ flex: 1, color: '#e2e8f0' }}>Correct Answer</span>
                  <strong style={{ color: 'var(--green)' }}>+4 Marks</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 20%, transparent)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✗</span>
                  <span style={{ flex: 1, color: '#e2e8f0' }}>Incorrect Answer</span>
                  <strong style={{ color: 'var(--red)' }}>-1 Mark</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>○</span>
                  <span style={{ flex: 1, color: '#e2e8f0' }}>Unanswered</span>
                  <strong style={{ color: 'var(--muted)' }}>0 Marks</strong>
                </div>
             </div>
             
             <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--border)', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                <strong>Marked for Review with Answer</strong> → Evaluated Normally<br/>
                <strong>Marked for Review without Answer</strong> → Not Evaluated
             </div>
          </div>
        </div>

        {/* Rules & Anti-Cheating */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 24 }}>
          {/* Rules */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
             <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}>Rules & Regulations</h2>
             <ul style={{ paddingLeft: 20, color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 8, margin: 0 }}>
               <li>Browser tab switching is considered a violation.</li>
               <li>Leaving fullscreen is considered a violation.</li>
               <li>Opening Developer Tools is prohibited.</li>
               <li>Copy, Cut and Paste are disabled.</li>
               <li>Right-click is disabled.</li>
               <li>Multiple login sessions are prohibited.</li>
               <li>Webcam & Microphone monitoring may be enabled.</li>
               <li>The timer continues even if the internet disconnects temporarily.</li>
             </ul>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             {/* Anti-Cheating Box */}
             <div style={{ background: 'color-mix(in srgb, var(--yellow) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--yellow) 30%, transparent)', borderRadius: 16, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--yellow)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={18} /> Examination Monitoring Enabled
                </h2>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>Violation Counter</span>
                  <strong style={{ fontSize: 18, color: 'var(--yellow)', fontFamily: 'Space Grotesk' }}>0 / 5</strong>
                </div>
                <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                  After <strong>5 violations</strong>, you will exceed the maximum allowed violations. Your test will be <strong>submitted automatically</strong>.
                </p>
             </div>

             {/* Important Notice */}
             <div style={{ background: 'color-mix(in srgb, var(--accent2) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--accent2) 30%, transparent)', borderRadius: 16, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent2)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info size={18} /> Important Notice
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: '#e2e8f0' }}>
                  <div style={{ display: 'flex', gap: 6 }}><CheckCircle2 size={16} color="var(--accent2)"/> Stable Internet Connection</div>
                  <div style={{ display: 'flex', gap: 6 }}><CheckCircle2 size={16} color="var(--accent2)"/> Laptop Battery Charged</div>
                  <div style={{ display: 'flex', gap: 6 }}><CheckCircle2 size={16} color="var(--accent2)"/> Close Background Apps</div>
                  <div style={{ display: 'flex', gap: 6 }}><CheckCircle2 size={16} color="var(--accent2)"/> Disable VPN</div>
                </div>
             </div>
          </div>
        </div>

        {/* Proctoring Mode Selection */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Camera size={18} color="var(--accent)" /> Proctoring & Monitoring Mode
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: CAMERA_PROCTORING_ENABLED ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: 14 }}>
            {CAMERA_PROCTORING_ENABLED && (
              <div 
                onClick={() => setProctoringMode('camera')}
                style={{
                  border: proctoringMode === 'camera' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: proctoringMode === 'camera' ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
                  borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#fff', fontSize: 14 }}>
                    <Camera size={18} color={proctoringMode === 'camera' ? 'var(--accent)' : 'var(--muted)'} />
                    With camera detection
                  </div>
                  <span style={{ fontSize: 10, background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: '#c7d2fe', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                    Recommended
                  </span>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                  Active webcam monitoring continuously checks attentiveness, detecting multiple people, face absence, or looking away.
                </p>
              </div>
            )}

            <div 
              onClick={() => setProctoringMode('none')}
              style={{
                border: proctoringMode === 'none' ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: proctoringMode === 'none' ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
                borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 6 }}>
                <Eye size={18} color={proctoringMode === 'none' ? 'var(--accent)' : 'var(--muted)'} />
                Without camera detection
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                Standard browser monitoring only. Tracks full-screen focus and tab switches without accessing your webcam or microphone.
              </p>
            </div>
          </div>
        </div>

        {/* Candidate Declaration */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 20 }}>Candidate Declaration</h2>
          
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={agreed1} 
              onChange={e => setAgreed1(e.target.checked)}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
              I have read and understood all the instructions.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={agreed2} 
              onChange={e => setAgreed2(e.target.checked)}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5 }}>
              I agree to follow the examination rules and understand that violating them may result in automatic submission of my test.
            </span>
          </label>
        </div>

        {/* Start Button */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <button 
            disabled={!agreed1 || !agreed2}
            onClick={() => setShowConfirm(true)}
            style={{
              background: (!agreed1 || !agreed2) ? 'var(--surface2)' : 'linear-gradient(135deg, var(--accent), var(--accent2))',
              color: (!agreed1 || !agreed2) ? '#64748b' : 'white',
              border: (!agreed1 || !agreed2) ? '1px solid var(--border)' : 'none',
              padding: '16px 48px',
              borderRadius: 30,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: 'Space Grotesk',
              letterSpacing: 1,
              cursor: (!agreed1 || !agreed2) ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: (!agreed1 || !agreed2) ? 'none' : '0 10px 30px rgba(99, 102, 241, 0.4)'
            }}
          >
            START NEET TEST
          </button>
        </div>

      </div>

      {/* Start Confirmation Modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: 40, maxWidth: 420, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
               <Play size={28} color="var(--accent)" style={{ transform: 'translateX(2px)' }} />
            </div>
            
            <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              Start Examination
            </h2>
            
            <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
              The examination timer will begin immediately after you click "Start Now". You cannot pause the exam.
            </p>
            
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: '#94a3b8', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleStartExam} style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(99, 102, 241, 0.3)' }}>
                Start Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
