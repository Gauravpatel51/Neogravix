import React, { useState, useEffect, useRef } from 'react'
import { migrateStorageForUser } from './utils/storage'
import { AuthProvider, useAuth } from './utils/useAuth.jsx'
import { auth } from './utils/firebase'
import { isSignInWithEmailLink } from 'firebase/auth'
import AuthPage from './pages/AuthPage'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import UploadPage from './pages/UploadPage'
import PreTestPage from './pages/PreTestPage'
import ExamPage from './pages/ExamPage'
import AnalysisPage from './pages/AnalysisPage'
import BookmarksPage from './pages/BookmarksPage'
import BacklogRescuePage from './pages/BacklogRescuePage'
import LibraryPage from './pages/LibraryPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import AdminLibraryPage from './pages/AdminLibraryPage'
import { LogOut } from 'lucide-react'
import NotificationCenter from './components/NotificationCenter'
import LogoutConfirmModal from './components/LogoutConfirmModal'
import { SettingsProvider } from './utils/SettingsContext'
import { JobProvider } from './utils/JobContext'
import JobProgressWidget from './components/JobProgressWidget'

function AppContent() {
  const { user, profile, loading, signOut, completeEmailSignIn } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [activeTest, setActiveTest] = useState(null)
  const [isEmailLinkTab, setIsEmailLinkTab] = useState(() => isSignInWithEmailLink(auth, window.location.href))
  const [signInComplete, setSignInComplete] = useState(false)
  const [emailLinkError, setEmailLinkError] = useState('')
  const [forcePasswordScreen, setForcePasswordScreen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [pendingStartTestId, setPendingStartTestId] = useState(null)
  const prevUidRef = useRef(user?.uid)

  // Run one-time migration and reset state when user changes
  useEffect(() => {
    if (user?.uid) {
      migrateStorageForUser(user.uid)
    }
    // If user changed (login/logout/switch), reset page to dashboard
    if (prevUidRef.current !== user?.uid) {
      setPage('dashboard')
      setActiveTest(null)
      prevUidRef.current = user?.uid
    }
  }, [user?.uid])

  // Auto-complete sign-in when user clicks the Firebase email link
  useEffect(() => {
    if (!isEmailLinkTab) return
    const params = new URLSearchParams(window.location.search)
    let email = params.get('signinEmail') || sessionStorage.getItem('emailForSignIn')
    if (!email) {
      email = window.prompt('Please confirm your email address to complete sign-in:')
    }
    if (email) {
      const fullName = params.get('name') || sessionStorage.getItem('emailSignInName') || ''
      completeEmailSignIn(email, window.location.href, fullName).then(({ data, error }) => {
        if (error) {
          setEmailLinkError(error.message)
          setIsEmailLinkTab(false)
        } else {
          // Clean URL
          window.history.replaceState({}, document.title, '/')
          
          if (data.needsPassword) {
             // Don't close tab, let them set password
             setForcePasswordScreen(true)
             setIsEmailLinkTab(false)
          } else {
             // Broadcast to all open tabs so the original tab updates instantly
             try {
               const bc = new BroadcastChannel('neogravix_auth')
               bc.postMessage({ type: 'SIGN_IN_COMPLETE' })
               bc.close()
             } catch (_) {}
             
             setSignInComplete(true)
             setTimeout(() => { try { window.close() } catch (_) {} }, 300)
          }
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for sign-in broadcast from another tab
  useEffect(() => {
    const bc = new BroadcastChannel('neogravix_auth')
    bc.onmessage = (e) => {
      if (e.data?.type === 'SIGN_IN_COMPLETE') {
        // Firebase onAuthStateChanged will auto-update; just reload to be safe
        window.location.reload()
      }
    }
    return () => bc.close()
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(err => console.error('Service Worker registration failed:', err));
    }
  }, []);

  // Show sign-in complete screen in the new tab
  if (signInComplete) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 20, padding: 20 }}>
        <div style={{ width: 68, height: 68, borderRadius: 20, background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(59,130,246,0.2))', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 32 }}>✅</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Signed In Successfully!</h2>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>You can close this tab and go back to the original tab.<br />You are now logged in there too.</p>
        </div>
        <button onClick={() => window.close()} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', color: 'white', fontWeight: 600, fontSize: 14 }}>
          Close This Tab
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16 }}>
        <div style={{ color: 'var(--muted)', fontSize: 15 }}>
          {isEmailLinkTab ? '✉️ Completing sign-in...' : 'Loading...'}
        </div>
        {emailLinkError && (
          <div style={{ color: '#fca5a5', fontSize: 14, maxWidth: 360, textAlign: 'center', padding: '12px 20px', background: 'rgba(239,68,68,0.1)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
            {emailLinkError}<br />
            <button onClick={() => window.location.href = '/'} style={{ marginTop: 10, background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>← Go back and try again</button>
          </div>
        )}
      </div>
    )
  }

  if (!user || !user.emailVerified || forcePasswordScreen) return <AuthPage forceSetPassword={forcePasswordScreen} />

  const isExam = page === 'exam' || page === 'pretest'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div aria-live="polite" id="aria-live-region" className="sr-only"></div>
      
      {!isExam && <Navbar page={page} setPage={setPage} />}

      <main id="main-content" style={{
        flex: 1,
        marginLeft: isExam ? 0 : 220,
        padding: isExam ? 0 : '28px 28px 100px',
        minHeight: '100vh',
      }} className="main-content">

        {!isExam && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <NotificationCenter align="right" direction="down" />
            <button onClick={() => setIsLogoutModalOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
              color: '#94a3b8', cursor: 'pointer', fontSize: 13
            }}>
              <LogOut size={14} /> Logout ({profile?.full_name?.trim() ? profile.full_name : 'Student'})
            </button>
          </div>
        )}

        {page === 'dashboard' && <Dashboard setPage={setPage} setActiveTest={setActiveTest} pendingStartTestId={pendingStartTestId} setPendingStartTestId={setPendingStartTestId} />}
        {page === 'upload' && <UploadPage setPage={setPage} setActiveTest={setActiveTest} />}
        {page === 'pretest' && activeTest && <PreTestPage test={activeTest} setPage={setPage} />}
        {page === 'exam' && activeTest && <ExamPage test={activeTest} setPage={setPage} setActiveTest={setActiveTest} />}
        {page === 'analysis' && activeTest && <AnalysisPage test={activeTest} setPage={setPage} />}
        {page === 'bookmarks' && <BookmarksPage />}
        {page === 'rescue' && <BacklogRescuePage />}
        {page === 'library' && <LibraryPage />}
        {page === 'admin-library' && <AdminLibraryPage />}
        {page === 'profile' && <ProfilePage />}
        {page === 'settings' && <SettingsPage />}

        <JobProgressWidget setPage={setPage} setPendingStartTestId={setPendingStartTestId} />
      </main>

      <style>{`
        @media (max-width: 768px) {
          .main-content { margin-left: 0 !important; padding: ${isExam ? '0' : '20px 16px 90px'} !important; }
        }
      `}</style>

      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={() => {
          setIsLogoutModalOpen(false)
          signOut()
        }}
      />
    </div>
  )
}



import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsPage from './pages/TermsPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

import { getAppearanceSettings } from './api/appearance'

export default function App() {
  const isPrivacy = window.location.pathname === '/privacy-policy'
  const isTerms = window.location.pathname === '/terms-and-conditions'
  const isReset = window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery')

  useEffect(() => {
    let mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyAppearance = async (overrideSettings = null) => {
      let s = overrideSettings;
      if (!s) {
         // Load appearance from server (no unscoped cache — user scoping
         // is handled inside getAppearanceSettings / SettingsContext)
         s = await getAppearanceSettings();
      }

      document.body.className = '';
      
      // Theme
      if (s.theme === 'Light Mode') {
        document.body.classList.add('theme-light');
      } else if (s.theme === 'System Theme' || s.theme === 'System Default') {
        if (!mediaQuery.matches) {
          document.body.classList.add('theme-light');
        }
      }

      // Accent
      if (s.accentColor) document.body.classList.add('accent-' + s.accentColor);
      
      // Layout
      if (s.compactLayout) document.body.classList.add('layout-compact');
      
      // Animations
      if (s.animations === false) document.body.classList.add('motion-reduced');
    };
    
    applyAppearance();

    const handleSystemChange = () => {
      applyAppearance(); // Re-evaluate if system theme changes
    };
    
    const handleSettingsUpdate = (e) => {
      applyAppearance(e.detail);
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    window.addEventListener('appearanceUpdated', handleSettingsUpdate);
    
    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
      window.removeEventListener('appearanceUpdated', handleSettingsUpdate);
    };
  }, []);

  if (isPrivacy) {
    return <PrivacyPolicyPage />
  }

  if (isTerms) {
    return <TermsPage />
  }

  if (isReset) {
    return <ResetPasswordPage />
  }

  return (
    <AuthProvider>
      <SettingsProvider>
        <JobProvider>
          <AppContent />
        </JobProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
