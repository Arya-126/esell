
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Image, X } from 'phosphor-react'

const CATEGORIES = [
    'Electronics', 'Furniture', 'Clothing', 'Books', 'Vehicles',
    'Sports', 'Beauty', 'Toys', 'Properties', 'Others'
]

const Sell = () => {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [images, setImages] = useState([])
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        price: '',
        category: 'Electronics'
    })

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files)
        setImages(prev => [...prev, ...files])
    }

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)

        try {
            const imageUrls = []

            // Upload images to Supabase Storage
            for (const image of images) {
                const fileExt = image.name.split('.').pop()
                const fileName = `${Math.random()}.${fileExt}`
                const filePath = `${user.id}/${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(filePath, image)

                if (uploadError) throw uploadError

                const { data: { publicUrl } } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(filePath)

                imageUrls.push(publicUrl)
            }

            // Insert product into database
            const { error: insertError } = await supabase
                .from('products')
                .insert({
                    title: formData.title,
                    description: formData.description,
                    price: parseFloat(formData.price),
                    category: formData.category,
                    images: imageUrls,
                    seller_id: user.id
                })

            if (insertError) throw insertError

            navigate('/')
        } catch (error) {
            console.error('Error posting product:', error)
            alert(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>Sell an Item</h1>

            <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Title */}
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Title</label>
                    <input
                        type="text"
                        className="input-field"
                        placeholder="What are you selling?"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        required
                    />
                </div>

                {/* Category & Price */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Category</label>
                        <select
                            className="input-field"
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                        >
                            {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Price ($)</label>
                        <input
                            type="number"
                            className="input-field"
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            value={formData.price}
                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                            required
                        />
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Description</label>
                    <textarea
                        className="input-field"
                        rows="5"
                        placeholder="Describe your item..."
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                        required
                    />
                </div>

                {/* Image Upload */}
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Photos</label>
                    <div style={{
                        border: '2px dashed var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '2rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'rgba(0,0,0,0.2)'
                    }} onClick={() => document.getElementById('file-upload').click()}>
                        <Image size={32} color="var(--text-muted)" />
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Click to upload images</p>
                        <input
                            id="file-upload"
                            type="file"
                            multiple
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                            required={images.length === 0}
                        />
                    </div>

                    {/* Image Previews */}
                    {images.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                            {images.map((file, idx) => (
                                <div key={idx} style={{ position: 'relative', width: '80px', height: '80px' }}>
                                    <img
                                        src={URL.createObjectURL(file)}
                                        alt="preview"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(idx)}
                                        style={{
                                            position: 'absolute',
                                            top: -5,
                                            right: -5,
                                            background: 'var(--secondary-color)',
                                            borderRadius: '50%',
                                            border: 'none',
                                            color: 'white',
                                            width: '20px',
                                            height: '20px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <X size={12} weight="bold" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
                    {loading ? 'Posting...' : 'Post Item'}
                </button>

            </form>
        </div>
    )
}

export default Sell
