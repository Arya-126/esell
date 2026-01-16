
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth()
    if (loading) return null

    // Check if user is logged in AND is admin
    // Note: user object in our AuthContext now includes profile data (is_admin) merged in
    if (user && user.is_admin) {
        return children
    }

    return <Navigate to="/" />
}

export default AdminRoute
