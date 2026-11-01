import React from 'react'
import { BookOpen, LayoutDashboard, Bookmark, User, Settings, FlaskConical, HelpCircle, Library, Database, LifeBuoy } from 'lucide-react'
import logoImg from '../assets/logo.jpg'
import { useAuth } from '../utils/useAuth.jsx'


export default function Navbar({ page, setPage }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'upload', label: 'New Test', icon: BookOpen },
    { id: 'rescue', label: 'Rescue', icon: LifeBuoy },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  const { user } = useAuth();
  if (user?.email === 'gauravpatel5876@gmail.com') {
      navItems.push({ id: 'admin-library', label: 'Admin Library', icon: Database });
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside style={{
        width: 220, minHeight: '100vh', background: 'var(--bg)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        padding: '24px 0', position: 'fixed', left: 0, top: 0, zIndex: 100,
      }} className="desktop-sidebar">
        <div style={{ padding: '0 20px 28px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoImg} alt="Neogravix" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
            <div>
              <div style={{ fontFamily: 'Space Grotesk', fontWeight: 800, fontSize: 22, color: 'var(--text)', letterSpacing: '-0.5px' }}>Neogravix</div>
            </div>
          </div>

        </div>

        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setPage(id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
              marginBottom: 4,
              background: page === id ? 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 13%, transparent), color-mix(in srgb, var(--accent2) 13%, transparent))' : 'transparent',
              color: page === id ? '#a5b4fc' : 'var(--muted)',
              fontWeight: page === id ? 600 : 400,
              fontSize: 14, transition: 'all 0.2s',
              borderLeft: page === id ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '0 12px' }}>
          <a href="mailto:Neogravix@gmail.com?subject=Support%20Request%3A%20Neogravix&body=Please%20describe%20your%20issue%20below%3A%0A%0A" style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10,
            textDecoration: 'none', color: '#93c5fd', background: 'rgba(59,130,246,0.1)',
            fontWeight: 500, fontSize: 14, border: '1px solid rgba(59,130,246,0.2)'
          }}>
            <HelpCircle size={17} /> Help & Support
          </a>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav style={{
        display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg)', borderTop: '1px solid var(--border)',
        padding: '8px 0', zIndex: 100,
      }} className="mobile-nav">
        {navItems.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setPage(id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 4px', border: 'none', background: 'transparent',
            color: page === id ? '#a5b4fc' : 'var(--muted)', cursor: 'pointer', fontSize: 10,
          }}>
            <Icon size={20} />
            {label}
          </button>
        ))}

      </nav>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-nav { display: flex !important; }
        }
      `}</style>
    </>
  )
}
