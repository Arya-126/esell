
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProductCard from '../components/common/ProductCard'
import { User, Package } from 'phosphor-react'

const Profile = () => {
    const { user } = useAuth()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (user) {
            fetchMyProducts()
        }
    }, [user])

    const fetchMyProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('seller_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setProducts(data)
        } catch (error) {
            console.error('Error fetching my products:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: '1200px', margin: '2rem auto', padding: '1rem' }}>

            {/* Profile Header */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '2rem' }}>
                <div style={{ width: '100px', height: '100px', background: 'var(--bg-surface)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={64} color="var(--text-muted)" />
                </div>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>{user?.email?.split('@')[0]}</h1>
                    <p style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                </div>
            </div>

            {/* My Listings */}
            <div>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={24} color="var(--primary-color)" weight="fill" />
                    My Listings
                </h2>

                {loading ? (
                    <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
                ) : products.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        You haven't listed any items yet.
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '2rem'
                    }}>
                        {products.map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </div>

        </div>
    )
}

export default Profile
