
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ProductCard from '../components/common/ProductCard'
import { Funnel } from 'phosphor-react'

const CATEGORIES = [
    'All', 'Electronics', 'Furniture', 'Clothing', 'Books', 'Vehicles',
    'Sports', 'Beauty', 'Toys', 'Properties', 'Others'
]

const Home = () => {
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedCategory, setSelectedCategory] = useState('All')

    useEffect(() => {
        fetchProducts()
    }, [selectedCategory])

    const fetchProducts = async () => {
        setLoading(true)
        try {
            let query = supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false })

            if (selectedCategory !== 'All') {
                query = query.eq('category', selectedCategory)
            }

            const { data, error } = await query

            if (error) throw error
            setProducts(data)
        } catch (error) {
            console.error('Error fetching products:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            {/* Hero / Filter Section */}
            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '3rem', marginBottom: '1.5rem', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Discover Unique Items
                </h1>

                {/* Category Filter Scroll */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    overflowX: 'auto',
                    paddingBottom: '1rem',
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            style={{
                                background: selectedCategory === cat ? 'var(--primary-color)' : 'var(--bg-surface)',
                                color: selectedCategory === cat ? 'white' : 'var(--text-muted)',
                                padding: '0.5rem 1rem',
                                borderRadius: '2rem',
                                border: '1px solid var(--border-color)',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            {selectedCategory === cat && <Funnel weight="fill" />}
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Loading products...</div>
            ) : products.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    No products found in this category. Be the first to sell!
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
    )
}

export default Home
