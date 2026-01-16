
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchProfile = async (user) => {
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            return data || {}
        }

        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchProfile(session.user).then(profile => {
                    setUser({ ...session.user, ...profile })
                    setLoading(false)
                })
            } else {
                setUser(null)
                setLoading(false)
            }
        })

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchProfile(session.user).then(profile => {
                    setUser({ ...session.user, ...profile })
                    setLoading(false)
                })
            } else {
                setUser(null)
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const signUp = async (email, password) => {
        return supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/login`
            }
        })
    }

    const signIn = async (email, password) => {
        return supabase.auth.signInWithPassword({ email, password })
    }

    const signOut = async () => {
        return supabase.auth.signOut()
    }

    const resetPassword = async (email) => {
        return supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/update-password`,
        })
    }

    const updatePassword = async (newPassword) => {
        return supabase.auth.updateUser({ password: newPassword })
    }

    const value = {
        signUp,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        user,
        loading
    }

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
