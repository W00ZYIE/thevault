import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AuthView({ onAuth }) {
  const [activeTab, setActiveTab]           = useState('signin');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass]             = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [rememberMe, setRememberMe]         = useState(false);
  const [agreeTerms, setAgreeTerms]         = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [magicLinkSent, setMagicLinkSent]   = useState(false);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setMagicLinkSent(false);
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }

    if (activeTab === 'signin') {
      if (!password) { setError('Please enter your password.'); return; }
      setLoading(true);
      try {
        const { data, error: e } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (e) throw e;
        onAuth(data.session);
      } catch (e) {
        setError(e?.message || 'Incorrect email or password.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // signup
    if (!password) { setError('Please create a password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!agreeTerms) { setError('Please accept the Terms of Service to continue.'); return; }
    setLoading(true);
    try {
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (e) throw e;
      onAuth(data.session);
    } catch (e) {
      setError(e?.message || 'Could not create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setError('');
    setMagicLinkSent(false);
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setLoading(true);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (e) throw e;
      setMagicLinkSent(true);
    } catch (e) {
      setError(e?.message || 'Could not send sign-in link.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit(); };

  const inputBase = {
    width: '100%',
    padding: '12px 14px',
    boxSizing: 'border-box',
    background: '#FFFFFF',
    border: '1.5px solid rgba(0,0,0,0.12)',
    borderRadius: 8,
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    fontWeight: 400,
    color: '#0A0C10',
    outline: 'none',
    transition: 'border-color 180ms, box-shadow 180ms',
  };

  const inputFocus = (e) => {
    e.target.style.borderColor = '#1A6FD4';
    e.target.style.boxShadow = '0 0 0 3px rgba(26,111,212,0.12)';
  };
  const inputBlur = (e) => {
    e.target.style.borderColor = 'rgba(0,0,0,0.12)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div style={{
      background: 'linear-gradient(180deg, #F0F5FF 0%, #FFFFFF 65%)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '40px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background radial accent */}
      <div style={{
        position: 'absolute',
        top: -300,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 900,
        height: 900,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(26,111,212,0.05) 0%, transparent 65%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Card */}
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: '#FFFFFF',
        borderRadius: 28,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 16px 64px rgba(0,0,0,0.11)',
        padding: '48px 44px',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* 1. Logo block */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/TheVaultShield.png"
            alt="VaultIQ"
            style={{
              width: 52,
              height: 52,
              objectFit: 'contain',
              marginBottom: 14,
              filter: 'drop-shadow(0 4px 16px rgba(26,111,212,0.2))',
            }}
          />
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#0A0C10',
          }}>
            VAULT<span style={{ color: '#1A6FD4' }}>IQ</span>
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: '#6B7280',
            marginTop: 6,
          }}>
            Financial Intelligence Platform
          </div>
        </div>

        {/* 2. Tab switcher */}
        <div style={{
          display: 'flex',
          background: '#F7F9FC',
          borderRadius: 10,
          padding: 4,
          gap: 4,
          marginBottom: 28,
        }}>
          {['signin', 'signup'].map(tab => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                background: activeTab === tab ? '#FFFFFF' : 'transparent',
                color: activeTab === tab ? '#1A6FD4' : '#6B7280',
                boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 150ms',
              }}
            >
              {tab === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* 3. Form fields */}
        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: '#3D4452',
            marginBottom: 6,
          }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="your@email.com"
            autoComplete="email"
            style={inputBase}
            onFocus={inputFocus}
            onBlur={inputBlur}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: '#3D4452',
            marginBottom: 6,
          }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="············"
              autoComplete={activeTab === 'signup' ? 'new-password' : 'current-password'}
              style={{ ...inputBase, paddingRight: 56 }}
              onFocus={inputFocus}
              onBlur={inputBlur}
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                fontSize: 12,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
              }}
            >
              {showPass ? 'hide' : 'show'}
            </button>
          </div>
        </div>

        {/* Sign Up extras */}
        {activeTab === 'signup' && (
          <>
            {/* Confirm Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: '#3D4452',
                marginBottom: 6,
              }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="············"
                  autoComplete="new-password"
                  style={{ ...inputBase, paddingRight: 56 }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(p => !p)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    fontSize: 12,
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {showConfirmPass ? 'hide' : 'show'}
                </button>
              </div>
            </div>

            {/* Terms checkbox */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                  style={{
                    width: 15,
                    height: 15,
                    accentColor: '#1A6FD4',
                    flexShrink: 0,
                    marginTop: 2,
                    cursor: 'pointer',
                  }}
                />
                <span style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#6B7280',
                  lineHeight: 1.6,
                }}>
                  I agree to the{' '}
                  <a href="#" onClick={e => e.preventDefault()} style={{ color: '#1A6FD4', textDecoration: 'none', fontWeight: 600 }}>
                    Terms of Service
                  </a>
                  {' '}and{' '}
                  <a href="#" onClick={e => e.preventDefault()} style={{ color: '#1A6FD4', textDecoration: 'none', fontWeight: 600 }}>
                    Privacy Policy
                  </a>
                </span>
              </label>
            </div>
          </>
        )}

        {/* Sign In extras */}
        {activeTab === 'signin' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: '#1A6FD4', cursor: 'pointer' }}
              />
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#6B7280',
              }}>
                Remember me
              </span>
            </label>
          </div>
        )}

        {/* 4. Error message */}
        {error && (
          <div style={{
            background: '#FFF0F3',
            border: '1px solid rgba(229,57,53,0.2)',
            borderRadius: 8,
            padding: '10px 14px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            color: '#E53935',
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* 5. Primary CTA button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '13px 20px',
            background: loading ? '#9CA3AF' : '#1A6FD4',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontFamily: "'Inter', sans-serif",
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 2px 16px rgba(26,111,212,0.28)',
            transition: 'all 200ms',
            marginBottom: 14,
          }}
          onMouseEnter={e => {
            if (!loading) {
              e.target.style.background = '#1254A8';
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 24px rgba(26,111,212,0.38)';
            }
          }}
          onMouseLeave={e => {
            e.target.style.background = loading ? '#9CA3AF' : '#1A6FD4';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = loading ? 'none' : '0 2px 16px rgba(26,111,212,0.28)';
          }}
        >
          {loading ? 'Authenticating...' : activeTab === 'signin' ? 'Enter the Vault →' : 'Create Your Vault →'}
        </button>

        {/* 6. Magic link option */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {magicLinkSent ? (
            <span style={{
              color: '#00B876',
              fontSize: 13,
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
            }}>
              ✓ Check your inbox — link sent!
            </span>
          ) : (
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#1A6FD4',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                opacity: loading ? 0.5 : 1,
              }}
            >
              Or send a sign-in link →
            </button>
          )}
        </div>

        {/* 7. Footer trust line */}
        <div style={{
          textAlign: 'center',
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 500,
          color: '#9CA3AF',
        }}>
          14-day free trial · No credit card required
        </div>

      </div>
    </div>
  );
}
