
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Trash, User, ShoppingBag, ChatCircle } from 'phosphor-react'

const AdminDashboard = () => {
    const [stats, setStats] = useState({ users: 0, products: 0, chats: 0 })
    const [users, setUsers] = useState([])
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('products') // 'products' or 'users'

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
            const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true })
            const { count: chatCount } = await supabase.from('chats').select('*', { count: 'exact', head: true })

            setStats({ users: userCount, products: productCount, chats: chatCount })

            if (activeTab === 'users') {
                const { data: usersData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
                setUsers(usersData || [])
            } else {
                const { data: productsData } = await supabase.from('products').select('*, profiles(email)').order('created_at', { ascending: false })
                setProducts(productsData || [])
            }

        } catch (error) {
            console.error('Error fetching admin data:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [activeTab])

    const handleDeleteProduct = async (id) => {
        if (!confirm('Are you sure you want to delete this product?')) return
        try {
            const { error } = await supabase.from('products').delete().eq('id', id)
            if (error) throw error
            setProducts(prev => prev.filter(p => p.id !== id))
            setStats(prev => ({ ...prev, products: prev.products - 1 }))
        } catch (error) {
            alert('Error deleting product: ' + error.message)
        }
    }

    // Deleting users is risky with FK constraints, usually just ban/mark inactive. 
    // For this simple app we won't implement hard user delete from UI to avoid hanging references error unless we cascade.
    // We'll stick to product moderation.

    return (
        <div style={{ maxWidth: '1200px', margin: '2rem auto', padding: '1rem' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>Admin Dashboard</h1>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '1rem', borderRadius: '12px', color: 'var(--primary-color)' }}>
                        <User size={32} />
                    </div>
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.users}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Total Users</div>
                    </div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'rgba(236, 72, 153, 0.2)', padding: '1rem', borderRadius: '12px', color: 'var(--secondary-color)' }}>
                        <ShoppingBag size={32} />
                    </div>
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.products}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Active Listings</div>
                    </div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '1rem', borderRadius: '12px', color: 'var(--accent-color)' }}>
                        <ChatCircle size={32} />
                    </div>
                    <div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.chats}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Active Chats</div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                <button
                    onClick={() => setActiveTab('products')}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: '1rem',
                        color: activeTab === 'products' ? 'var(--primary-color)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'products' ? 600 : 400,
                        borderBottom: activeTab === 'products' ? '2px solid var(--primary-color)' : 'none',
                        cursor: 'pointer'
                    }}
                >
                    Products
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: '1rem',
                        color: activeTab === 'users' ? 'var(--primary-color)' : 'var(--text-muted)',
                        fontWeight: activeTab === 'users' ? 600 : 400,
                        borderBottom: activeTab === 'users' ? '2px solid var(--primary-color)' : 'none',
                        cursor: 'pointer'
                    }}
                >
                    Users
                </button>
            </div>

            {/* Content */}
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                ) : activeTab === 'products' ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>Item</th>
                                <th style={{ padding: '1rem' }}>Price</th>
                                <th style={{ padding: '1rem' }}>Seller</th>
                                <th style={{ padding: '1rem' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.map(product => (
                                <tr key={product.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        {product.images?.[0] && <img src={product.images[0]} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />}
                                        {product.title}
                                    </td>
                                    <td style={{ padding: '1rem' }}>${product.price}</td>
                                    <td style={{ padding: '1rem' }}>{product.profiles?.email}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <button
                                            onClick={() => handleDeleteProduct(product.id)}
                                            style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: 'none', padding: '0.5rem', borderRadius: '4px' }}
                                        >
                                            <Trash size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>User</th>
                                <th style={{ padding: '1rem' }}>Email</th>
                                <th style={{ padding: '1rem' }}>Joined</th>
                                <th style={{ padding: '1rem' }}>Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <User size={16} />
                                        </div>
                                        {u.username || 'User'}
                                    </td>
                                    <td style={{ padding: '1rem' }}>{u.email}</td>
                                    <td style={{ padding: '1rem' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{
                                            background: u.is_admin ? 'rgba(99, 102, 241, 0.2)' : 'rgba(148, 163, 184, 0.1)',
                                            color: u.is_admin ? 'var(--primary-color)' : 'var(--text-muted)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem'
                                        }}>
                                            {u.is_admin ? 'Admin' : 'User'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

        </div>
    )
}

export default AdminDashboard
