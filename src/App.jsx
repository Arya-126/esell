
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/layout/Navbar'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import UpdatePassword from './pages/UpdatePassword'
import Home from './pages/Home'
import Sell from './pages/Sell'
import ProductDetails from './pages/ProductDetails'
import Chat from './pages/Chat'
import Profile from './pages/Profile'
import AdminDashboard from './pages/AdminDashboard'
import AdminRoute from './components/layout/AdminRoute'

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return null // Or a loading spinner
  return user ? children : <Navigate to="/login" />
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="app-container">
          <Navbar />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />

            <Route path="/" element={<Home />} />

            <Route path="/sell" element={
              <ProtectedRoute>
                <Sell />
              </ProtectedRoute>
            } />
            <Route path="/product/:id" element={<ProductDetails />} />

            <Route path="/chats" element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            } />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  )
}

export default App
