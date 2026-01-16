
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/layout/AuthLayout'
import { Envelope } from 'phosphor-react'

const ForgotPassword = () => {
    const [email, setEmail] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { resetPassword } = useAuth()

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            setMessage('')
            setError('')
            setLoading(true)
            const { error } = await resetPassword(email)
            if (error) throw error
            setMessage('Check your inbox for password reset instructions')
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout title="Reset Password" subtitle="Enter your email to receive a reset link">
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
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Sending Link...' : 'Send Reset Link'}
                </button>
            </form>
            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Remember your password? <Link to="/login" style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}>Back to Login</Link>
            </div>
        </AuthLayout>
    )
}

export default ForgotPassword
