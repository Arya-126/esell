
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/layout/AuthLayout'
import { Lock } from 'phosphor-react'

const UpdatePassword = () => {
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const { updatePassword } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            setError('')
            setMessage('')
            setLoading(true)
            const { error } = await updatePassword(password)
            if (error) throw error
            setMessage('Password updated successfully! Redirecting...')
            setTimeout(() => navigate('/'), 2000)
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout title="Update Password" subtitle="Enter your new password">
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
                    <Lock size={20} color="var(--text-muted)" style={{ position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)' }} />
                    <input
                        type="password"
                        placeholder="New Password"
                        className="input-field"
                        style={{ paddingLeft: '40px' }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Updating...' : 'Update Password'}
                </button>
            </form>
        </AuthLayout>
    )
}

export default UpdatePassword
