
import React from 'react';

const AuthLayout = ({ children, title, subtitle }) => {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'radial-gradient(circle at top right, #312e81, transparent), radial-gradient(circle at bottom left, #831843, transparent)'
        }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{title}</h2>
                    {subtitle && <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>{subtitle}</p>}
                </div>
                {children}
            </div>
        </div>
    );
};

export default AuthLayout;
