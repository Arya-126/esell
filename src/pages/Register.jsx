
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/layout/AuthLayout'
import { Envelope, Lock, User } from 'phosphor-react'

const Register = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const { signUp } = useAuth()

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (password !== confirmPassword) {
            return setError('Passwords do not match')
        }
        try {
            setError('')
            setMessage('')
            setLoading(true)
            const { error, data } = await signUp(email, password)
            if (error) throw error
            if (data?.user?.identities?.length === 0) {
                setError('This email is already in use.')
            } else {
                setMessage('Account created! Please check your inbox to verify your email.')
            }
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout title="Create Account" subtitle="Join the eSell community">
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
            {message && (
                <div style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    color: '#6ee7b7',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.875rem'
                }}>
                    {message}
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
                        minLength={6}
                    />
                </div>
                <div style={{ position: 'relative' }}>
                    <Lock size={20} color="var(--text-muted)" style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)' }} />
                    <input
                        type="password"
                        placeholder="Confirm Password"
                        className="input-field"
                        style={{ paddingLeft: '40px' }}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>

                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Sign Up'}
                </button>
            </form>
            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Already have an account? <Link to="/login" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>Sign In</Link>
            </div>
        </AuthLayout>
    )
}

export default Register
