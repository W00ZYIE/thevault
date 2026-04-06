/**
 * AuthView.jsx — Grape Financial Intelligence
 *
 * DESIGN PHILOSOPHY:
 * This is not a login form. It's the entrance to a financial system.
 * Inspired by Apple ID, Stripe Dashboard, and Linear's onboarding.
 *
 * KEY DECISIONS:
 * - No card/container — content floats on a pure canvas
 * - Progressive input: email → password (reduces cognitive load)
 * - Bottom-border-only inputs (editorial/fashion-house aesthetic)
 * - Centered text inputs feel intentional, not clinical
 * - All transitions are physics-based cubic-bezier, not linear
 * - Security signal present but invisible until noticed
 * - "Enter Grape" CTA — not "Submit" or "Login"
 */

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

/* ─────────────────────────────────────────────
   GLOBAL STYLES
   Injected via <style> to keep single-file DX.
   In production, move to auth.css or module.
───────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400&display=swap');

  /* ── Root canvas ── */
  .g-root {
    min-height: 100vh;
    background: #F8F8F6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    position: relative;
    overflow: hidden;
    padding: 40px 24px;
  }

  /* Faint center glow — depth without distraction */
  .g-root::before {
    content: '';
    position: fixed;
    top: 38%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 700px;
    height: 700px;
    background: radial-gradient(
      ellipse at center,
      rgba(24, 60, 180, 0.035) 0%,
      rgba(24, 60, 180, 0.01) 45%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  /* Noise texture overlay — Apple-grade material feel */
  .g-root::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.022'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
  }

  /* ── Inner content well ── */
  .g-well {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* ── Logo block ── */
  .g-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 64px;
    opacity: 0;
    animation: riseIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.05s forwards;
  }

  .g-brand-img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    opacity: 0.82;
    margin-bottom: 11px;
    /* Prevents jagged rendering on retina */
    image-rendering: -webkit-optimize-contrast;
  }

  .g-brand-name {
    font-size: 15px;
    font-weight: 500;
    letter-spacing: -0.015em;
    color: #141414;
  }

  /* ── Step wrapper — carries the entering content ── */
  .g-step {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0;
    animation: riseIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  /* ── Headline + subline ── */
  .g-headline {
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.035em;
    color: #111;
    text-align: center;
    margin-bottom: 9px;
    line-height: 1.18;
  }

  .g-subline {
    font-size: 14px;
    color: #999;
    text-align: center;
    margin-bottom: 48px;
    font-weight: 400;
    letter-spacing: -0.01em;
    line-height: 1.5;
  }

  /* Email breadcrumb — tap to go back */
  .g-crumb {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    transition: color 250ms;
    border: none;
    background: none;
    padding: 0;
    font-family: inherit;
    font-size: 14px;
    color: #999;
    margin-bottom: 48px;
    letter-spacing: -0.01em;
  }
  .g-crumb:hover {
    color: #555;
  }
  .g-crumb svg {
    transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .g-crumb:hover svg {
    transform: translateX(-2px);
  }

  /* ── Input field ── */
  .g-field {
    width: 100%;
    position: relative;
    margin-bottom: 36px;
  }

  .g-input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.13);
    padding: 6px 36px 14px 0;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 19px;
    font-weight: 300;
    color: #111;
    outline: none;
    letter-spacing: 0.01em;
    text-align: left;
    transition: border-color 300ms;
    /* Prevents iOS zoom-in on focus */
    touch-action: manipulation;
  }

  .g-input::placeholder {
    color: #D0D0D0;
    font-weight: 300;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    letter-spacing: 0.01em;
  }

  /* Animated underline expands on focus */
  .g-field-line {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 1.5px;
    width: 100%;
    background: #111;
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .g-input:focus ~ .g-field-line {
    transform: scaleX(1);
  }

  /* Show/hide toggle */
  .g-toggle {
    position: absolute;
    right: 0;
    bottom: 14px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
    font-size: 11px;
    font-weight: 400;
    color: #C0C0C0;
    padding: 0;
    letter-spacing: 0.03em;
    transition: color 250ms;
  }
  .g-toggle:hover { color: #555; }

  /* ── Checkboxes (Terms / Remember) ── */
  .g-check-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 28px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .g-check-row input[type='checkbox'] {
    width: 14px;
    height: 14px;
    accent-color: #111;
    cursor: pointer;
    flex-shrink: 0;
  }

  .g-check-row span {
    font-size: 12px;
    color: #999;
    line-height: 1.55;
    letter-spacing: -0.005em;
  }

  .g-check-row a {
    color: #444;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* ── Error message ── */
  .g-error {
    font-size: 13px;
    color: #B83232;
    text-align: center;
    margin-bottom: 20px;
    opacity: 0;
    animation: fadeIn 220ms ease forwards;
    font-weight: 400;
    letter-spacing: -0.01em;
    line-height: 1.45;
    width: 100%;
  }

  /* ── Primary CTA ── */
  .g-cta {
    width: 100%;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 15px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: -0.012em;
    cursor: pointer;
    transition: background 200ms ease, transform 80ms ease, opacity 200ms ease;
    -webkit-font-smoothing: antialiased;
    margin-bottom: 14px;
    position: relative;
    overflow: hidden;
  }

  .g-cta::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0);
    transition: background 200ms;
  }

  .g-cta:hover:not(:disabled)::after {
    background: rgba(255,255,255,0.06);
  }

  .g-cta:active:not(:disabled) {
    transform: scale(0.985);
  }

  .g-cta:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  /* Loading spinner inside button */
  .g-spinner {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 1.5px solid rgba(255,255,255,0.3);
    border-top-color: rgba(255,255,255,0.85);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
    margin-right: 7px;
    margin-top: -2px;
  }

  /* ── Secondary actions ── */
  .g-secondary {
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: #A0A0A0;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(0,0,0,0.18);
    padding: 6px 0;
    width: 100%;
    text-align: center;
    transition: color 250ms;
    letter-spacing: -0.008em;
  }
  .g-secondary:hover { color: #444; text-decoration-color: rgba(0,0,0,0.5); }
  .g-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Mode switch (Sign in / Sign up) ── */
  .g-mode-switch {
    margin-top: 44px;
    font-size: 13px;
    color: #B0B0B0;
    text-align: center;
    letter-spacing: -0.008em;
  }
  .g-mode-switch button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: #444;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 0;
    font-family: inherit;
    transition: color 200ms;
    letter-spacing: -0.008em;
  }
  .g-mode-switch button:hover { color: #111; }

  /* ── Security badge ── */
  .g-security {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 48px;
    font-size: 10.5px;
    color: #C8C8C8;
    letter-spacing: 0.02em;
    font-weight: 400;
    opacity: 0;
    animation: fadeIn 0.8s ease 1.1s forwards;
  }

  /* ── Back link ── */
  .g-back {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: #C0C0C0;
    font-family: inherit;
    margin-top: 20px;
    transition: color 250ms;
    padding: 4px;
  }
  .g-back:hover { color: #666; }

  /* ── Plan/calc hint banner ── */
  .g-hint {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.09em;
    color: #ABABAB;
    text-align: center;
    margin-bottom: 36px;
    text-transform: uppercase;
    opacity: 0;
    animation: fadeIn 0.7s ease 0.5s forwards;
  }

  /* ── Magic link success ── */
  .g-magic-sent {
    font-size: 13px;
    color: #3D8A5E;
    text-align: center;
    margin-top: 14px;
    font-weight: 400;
    letter-spacing: -0.01em;
    opacity: 0;
    animation: fadeIn 300ms ease forwards;
  }

  /* ── Keyframes ── */
  @keyframes riseIn {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0);    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Mobile safe zones ── */
  @media (max-width: 480px) {
    .g-headline { font-size: 25px; }
    .g-input    { font-size: 18px; }
    .g-root     { justify-content: flex-start; padding-top: 80px; }
    .g-brand    { margin-bottom: 52px; }
  }

  /* iOS safe area support */
  @supports (padding: max(0px)) {
    .g-root {
      padding-bottom: max(40px, env(safe-area-inset-bottom));
    }
  }
`;

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */
export default function AuthView({ onAuth, initialTab, planHint, calcContext, onBack }) {
  // Auth mode: 'signin' | 'signup'
  const [mode, setMode]         = useState(initialTab || 'signin');
  // Progressive step: 'email' | 'password'
  const [step, setStep]         = useState('email');
  // Step key forces re-mount → re-triggers enter animation
  const [stepKey, setStepKey]   = useState(0);

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [showCpw, setShowCpw]           = useState(false);
  const [agreeTerms, setAgreeTerms]     = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [magicSent, setMagicSent]       = useState(false);
  const [emailWasSaved, setEmailWasSaved] = useState(false);

  const inputRef = useRef(null);

  // Pre-fill returning user email and skip straight to password step
  useEffect(() => {
    if (mode !== 'signin') return;
    const saved = localStorage.getItem('vault:last_email');
    if (saved) {
      setEmail(saved);
      setEmailWasSaved(true);
      setStep('password');
      setStepKey(k => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus input on every step change
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [step, stepKey]);

  /* Switch auth mode */
  const switchMode = (m) => {
    setMode(m);
    setStep('email');
    setError('');
    setPassword('');
    setConfirmPw('');
    setMagicSent(false);
    setStepKey(k => k + 1);
  };

  /* Advance email → password step */
  const advance = () => {
    setError('');
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setStep('password');
    setStepKey(k => k + 1);
  };

  /* Go back to email step — clears stored email so user can switch accounts */
  const retreat = () => {
    localStorage.removeItem('vault:last_email');
    setEmailWasSaved(false);
    setEmail('');
    setStep('email');
    setError('');
    setPassword('');
    setStepKey(k => k + 1);
  };

  /* Final submit */
  const submit = async () => {
    setError('');

    if (mode === 'signin') {
      if (!password) { setError('Please enter your password.'); return; }
      setLoading(true);
      try {
        const { data, error: e } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (e) throw e;
        localStorage.setItem('vault:last_email', email.trim().toLowerCase());
        onAuth(data.session);
      } catch (e) {
        setError(e?.message || 'Incorrect email or password.');
      } finally { setLoading(false); }
      return;
    }

    // Sign up
    if (!password)           { setError('Please create a password.'); return; }
    if (password.length < 6) { setError('Minimum 6 characters required.'); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }
    if (!agreeTerms)         { setError('Please accept the terms to continue.'); return; }
    setLoading(true);
    try {
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(), password,
      });
      if (e) throw e;
      onAuth(data.session);
    } catch (e) {
      setError(e?.message || 'Could not create account. Please try again.');
    } finally { setLoading(false); }
  };

  /* Magic link */
  const sendMagic = async () => {
    setError('');
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setLoading(true);
    try {
      const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (e) throw e;
      setMagicSent(true);
    } catch (e) {
      setError(e?.message || 'Could not send sign-in link.');
    } finally { setLoading(false); }
  };

  const onEnter = (fn) => (e) => { if (e.key === 'Enter') fn(); };

  /* CTA label */
  const ctaLabel = () => {
    if (loading) return <><span className="g-spinner" />Authenticating…</>;
    if (step === 'email') return 'Continue';
    if (mode === 'signin') return 'Enter Grape';
    return 'Create Account';
  };

  const ctaAction = step === 'email' ? advance : submit;

  /* ── Render ── */
  return (
    <>
      <style>{CSS}</style>
      <div className="g-root">
        <div className="g-well">

          {/* ── Brand mark ── */}
          <div className="g-brand">
            {/* Low-opacity logo — this is identity, not marketing */}
            <img
              src="/Grape_Logo_Dark.png"
              className="g-brand-img"
              alt="Grape"
              draggable={false}
            />
            <div className="g-brand-name">Grape</div>
          </div>

          {/* ── Plan / snapshot context (rare case) ── */}
          {planHint && (
            <div className="g-hint">
              {planHint} plan · {
                planHint === 'solo' ? '$25'
                : planHint === 'operator' ? '$79'
                : '$149'
              }/mo
            </div>
          )}
          {!planHint && calcContext && (
            <div className="g-hint">
              Your snapshot · ${Number(calcContext.income).toLocaleString()} in · ${Number(calcContext.expenses).toLocaleString()} out
            </div>
          )}

          {/* ─────────── STEP: EMAIL ─────────── */}
          {step === 'email' && (
            <div key={`e-${stepKey}`} className="g-step">

              {/* Headline shifts based on mode */}
              <div className="g-headline">
                {mode === 'signin' ? 'Welcome back.' : 'Get started.'}
              </div>
              <div className="g-subline">
                {mode === 'signin'
                  ? 'Enter your email to continue.'
                  : 'Create your Grape account.'}
              </div>

              {/* Email input */}
              <div className="g-field">
                <input
                  ref={inputRef}
                  className="g-input"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={onEnter(advance)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  spellCheck={false}
                  autoCapitalize="off"
                />
                {/* Expanding underline on focus */}
                <div className="g-field-line" />
              </div>

              {error && <div className="g-error">{error}</div>}

              <button className="g-cta" onClick={advance}>
                {ctaLabel()}
              </button>

              {/* Auth mode switcher */}
              <div className="g-mode-switch">
                {mode === 'signin' ? (
                  <>No account?{' '}
                    <button onClick={() => switchMode('signup')}>Sign up free</button>
                  </>
                ) : (
                  <>Have an account?{' '}
                    <button onClick={() => switchMode('signin')}>Sign in</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─────────── STEP: PASSWORD ─────────── */}
          {step === 'password' && (
            <div key={`p-${stepKey}`} className="g-step">

              <div className="g-headline">
                {mode === 'signin' ? 'Enter password.' : 'Choose a password.'}
              </div>

              {/* Email breadcrumb — click to go back / switch account */}
              <button className="g-crumb" onClick={retreat} title="Change email">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M8 2.5L4.5 6.5L8 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {emailWasSaved ? `Not ${email}?` : email}
              </button>

              {/* Password field */}
              <div className="g-field">
                <input
                  ref={inputRef}
                  className="g-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  onKeyDown={onEnter(submit)}
                  placeholder="············"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                <div className="g-field-line" />
                <button className="g-toggle" onClick={() => setShowPw(p => !p)} tabIndex={-1}>
                  {showPw ? 'hide' : 'show'}
                </button>
              </div>

              {/* Confirm password — sign up only */}
              {mode === 'signup' && (
                <div className="g-field">
                  <input
                    className="g-input"
                    type={showCpw ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={e => { setConfirmPw(e.target.value); setError(''); }}
                    onKeyDown={onEnter(submit)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                  />
                  <div className="g-field-line" />
                  <button className="g-toggle" onClick={() => setShowCpw(p => !p)} tabIndex={-1}>
                    {showCpw ? 'hide' : 'show'}
                  </button>
                </div>
              )}

              {/* Terms — sign up only */}
              {mode === 'signup' && (
                <label className="g-check-row">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={e => { setAgreeTerms(e.target.checked); setError(''); }}
                  />
                  <span>
                    I agree to the{' '}
                    <a href="#" onClick={e => e.preventDefault()}>Terms</a>
                    {' '}and{' '}
                    <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>
                  </span>
                </label>
              )}

              {error && <div className="g-error">{error}</div>}

              {/* Primary CTA */}
              <button className="g-cta" onClick={submit} disabled={loading}>
                {ctaLabel()}
              </button>

              {/* Magic link — sign in only */}
              {mode === 'signin' && !magicSent && (
                <button className="g-secondary" onClick={sendMagic} disabled={loading}>
                  Send a sign-in link instead
                </button>
              )}
              {mode === 'signin' && magicSent && (
                <div className="g-magic-sent">
                  Check your inbox — link sent.
                </div>
              )}
            </div>
          )}

          {/* ── Security signal ── */}
          {/* Present but invisible until your eye finds it */}
          <div className="g-security">
            <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
              <path
                d="M4.5 0.5L8.5 2.3V5.5C8.5 7.8 6.8 9.9 4.5 10.5C2.2 9.9 0.5 7.8 0.5 5.5V2.3L4.5 0.5Z"
                stroke="currentColor"
                strokeWidth="0.9"
                strokeLinejoin="round"
              />
            </svg>
            Encrypted session
          </div>

          {/* Optional back nav */}
          {onBack && (
            <button className="g-back" onClick={onBack}>
              ← Back
            </button>
          )}

        </div>
      </div>
    </>
  );
}