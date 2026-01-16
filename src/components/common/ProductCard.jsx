
import React from 'react';
import { Link } from 'react-router-dom';
import { ChatCircle, Tag } from 'phosphor-react';

const ProductCard = ({ product }) => {
    const formatPrice = (price) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(price);
    };

    return (
        <div className="glass-panel" style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 0.2s',
            height: '100%'
        }}>
            {/* Image Area */}
            <div style={{ height: '200px', width: '100%', position: 'relative', overflow: 'hidden' }}>
                {product.images && product.images.length > 0 ? (
                    <img
                        src={product.images[0]}
                        alt={product.title}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        No Image
                    </div>
                )}
                <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                }}>
                    <Tag size={12} weight="fill" />
                    {product.category}
                </div>
            </div>

            {/* Content Area */}
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {product.title}
                </h3>
                <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary-color)', marginBottom: '0.5rem' }}>
                    {formatPrice(product.price)}
                </p>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>
                    {product.description}
                </p>

                <div style={{ marginTop: 'auto' }}>
                    <Link
                        to={`/product/${product.id}`}
                        className="btn-primary"
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textDecoration: 'none',
                            gap: '0.5rem'
                        }}
                    >
                        <ChatCircle size={20} weight="fill" />
                        View & Chat
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
