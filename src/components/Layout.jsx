import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Layout({ children }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="app">
      <nav className="navbar">
        <Link to="/" className="logo">
          <span className="logo-icon">💸</span>
          <span className="logo-text">SplitPal</span>
        </Link>
        {user && (
          <div className="nav-links">
            <Link to="/" className="nav-link">Groups</Link>
            <div className="nav-user">
              <span className="nav-avatar">
                {(profile?.display_name || 'U')[0].toUpperCase()}
              </span>
              <button onClick={handleSignOut} className="btn btn-ghost btn-sm">
                Log out
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
