
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, ChatCircle, User } from 'phosphor-react'

const ProductDetails = () => {
    const { id } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()
    const [product, setProduct] = useState(null)
    const [loading, setLoading] = useState(true)
    const [creatingChat, setCreatingChat] = useState(false)

    useEffect(() => {
        fetchProduct()
    }, [id])

    const fetchProduct = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*, profiles:seller_id(*)') // Fetch seller profile
                .eq('id', id)
                .single()

            if (error) throw error
            setProduct(data)
        } catch (error) {
            console.error('Error fetching product:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleStartChat = async () => {
        if (!user) {
            navigate('/login')
            return
        }
        if (user.id === product.seller_id) {
            alert("You can't chat with yourself!")
            return
        }

        setCreatingChat(true)
        try {
            // Check if chat already exists
            const { data: existingChats, error: fetchError } = await supabase
                .from('chats')
                .select('*')
                .eq('product_id', product.id)
                .eq('buyer_id', user.id)
                .eq('seller_id', product.seller_id)

            if (fetchError) throw fetchError

            if (existingChats.length > 0) {
                // Chat exists, go to it (assuming we have a chat page, for now just go to /chats)
                navigate(`/chats?id=${existingChats[0].id}`)
            } else {
                // Create new chat
                const { data: newChat, error: createError } = await supabase
                    .from('chats')
                    .insert({
                        product_id: product.id,
                        buyer_id: user.id,
                        seller_id: product.seller_id
                    })
                    .select()
                    .single()

                if (createError) throw createError
                navigate(`/chats?id=${newChat.id}`)
            }
        } catch (error) {
            console.error('Error starting chat:', error)
            alert('Failed to start chat')
        } finally {
            setCreatingChat(false)
        }
    }

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
    if (!product) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Product not found</div>

    console.log('Product Data:', product) // Debug to see if profile is fetched

    const formatPrice = (price) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(price);
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '2rem auto', padding: '1rem' }}>
            <button
                onClick={() => navigate(-1)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}
            >
                <ArrowLeft size={20} /> Back
            </button>

            <div className="glass-panel" style={{ padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>

                {/* Images Section */}
                <div>
                    {product.images && product.images.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <img
                                src={product.images[0]}
                                alt={product.title}
                                style={{ width: '100%', borderRadius: 'var(--radius-md)', objectFit: 'cover', maxHeight: '400px' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
                                {product.images.map((img, idx) => (
                                    <img
                                        key={idx}
                                        src={img}
                                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', opacity: 0.7 }}
                                        onMouseOver={(e) => e.target.style.opacity = 1}
                                        onMouseOut={(e) => e.target.style.opacity = 0.7}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ height: '300px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            No Images
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div>
                    <div style={{ marginBottom: '0.5rem', color: 'var(--secondary-color)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.875rem' }}>
                        {product.category}
                    </div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', lineHeight: 1.1 }}>{product.title}</h1>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-color)', marginBottom: '2rem' }}>
                        {formatPrice(product.price)}
                    </p>

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Description</h3>
                        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{product.description}</p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '48px', height: '48px', background: 'var(--bg-surface)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={24} color="var(--text-muted)" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sold by</div>
                                    <div style={{ fontWeight: 600 }}>
                                        {/* Fallback if profile join fails */}
                                        Seller
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            className="btn-primary"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1.1rem' }}
                            onClick={handleStartChat}
                            disabled={creatingChat}
                        >
                            <ChatCircle size={24} weight="fill" />
                            {creatingChat ? 'Starting Chat...' : 'Chat with Seller'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProductDetails
