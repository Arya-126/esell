
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/layout/AuthLayout'
import { Envelope, Lock } from 'phosphor-react'

const Login = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            setError('')
            setLoading(true)
            const { error } = await signIn(email, password)
            if (error) throw error
            navigate('/')
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout title="Welcome Back" subtitle="Sign in to your account">
            {error && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#fca5a5',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.875rem'
                }}>
                    {error}
                </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ position: 'relative' }}>
                    <Envelope size={20} color="var(--text-muted)" style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)' }} />
                    <input
                        type="email"
                        placeholder="Email Address"
                        className="input-field"
                        style={{ paddingLeft: '40px' }}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div style={{ position: 'relative' }}>
                    <Lock size={20} color="var(--text-muted)" style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)' }} />
                    <input
                        type="password"
                        placeholder="Password"
                        className="input-field"
                        style={{ paddingLeft: '40px' }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <div style={{ textAlign: 'right' }}>
                    <Link to="/forgot-password" style={{ color: 'var(--primary-color)', fontSize: '0.875rem', textDecoration: 'none' }}>
                        Forgot Password?
                    </Link>
                </div>
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In'}
                </button>
            </form>
            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Don't have an account? <Link to="/register" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>Sign Up</Link>
            </div>
        </AuthLayout>
    )
}

export default Login
