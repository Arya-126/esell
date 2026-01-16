
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Plus, SignOut, User, ChatCircle } from 'phosphor-react'

const Navbar = () => {
    const { user, signOut } = useAuth()
    const navigate = useNavigate()

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
    }

    return (
        <nav className="glass-panel" style={{
            position: 'sticky',
            top: '1rem',
            zIndex: 50,
            margin: '1rem',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    background: 'var(--gradient-primary)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    color: 'white'
                }}>
                    e
                </div>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    eSell
                </span>
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {user ? (
                    <>
                        <Link to="/sell" className="btn-primary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus weight="bold" />
                            Sell Item
                        </Link>
                        <Link to="/chats" style={{ textDecoration: 'none', color: 'var(--text-main)', display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '8px', transition: 'background 0.2s' }}>
                            <ChatCircle size={24} />
                        </Link>
                        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }}></div>
                        <Link to="/profile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', textDecoration: 'none' }}>
                            <User size={20} weight="fill" />
                            <span style={{ fontSize: '0.9rem' }}>{user.email.split('@')[0]}</span>
                        </Link>

                        {user.is_admin && (
                            <Link to="/admin" style={{ color: 'var(--secondary-color)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--secondary-color)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                                ADMIN
                            </Link>
                        )}

                        <button onClick={handleSignOut} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0.5rem', borderRadius: '8px', transition: 'background 0.2s' }}>
                            <SignOut size={20} />
                        </button>
                    </>
                ) : (
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link to="/login" style={{ textDecoration: 'none', color: 'var(--text-main)', fontWeight: 600 }}>
                            Login
                        </Link>
                        <Link to="/register" style={{ textDecoration: 'none', color: 'var(--primary-color)', fontWeight: 600 }}>
                            Register
                        </Link>
                    </div>
                )}
            </div>
        </nav>
    )
}

export default Navbar
