// ─── LandingPage.jsx ─────────────────────────────────────────────────────────
// VaultIQ landing page — single-page, Apple/Stripe/Linear-level design.
// Props: onSignIn, onStartTrial(income?, expenses?), onSelectTier(tierId)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';

// ── Design tokens (mirrors dashboard LIGHT_T) ─────────────────────────────────
const LP = {
  bg:         '#F7F6F4',
  bgCard:     '#FFFFFF',
  bgSubtle:   '#F2F0EE',
  text1:      '#0A0A0A',
  text2:      '#3A3A3A',
  text3:      '#888888',
  text4:      '#BBBBBB',
  green:      '#059669',
  greenLight: '#F0FDF4',
  red:        '#DC2626',
  redLight:   '#FFF1F2',
  border:     'rgba(0,0,0,0.06)',
  borderMid:  'rgba(0,0,0,0.10)',
  font:       "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:       "'JetBrains Mono', monospace",
};

// ── Pricing tiers ─────────────────────────────────────────────────────────────
const TIERS = [
  { id: 'solo',     name: 'Solo',     price: '$25',  desc: 'Individual operators who need complete financial clarity.' },
  { id: 'operator', name: 'Operator', price: '$79',  desc: 'Multi-stream operators who demand total financial visibility.', featured: true },
  { id: 'studio',   name: 'Studio',   price: '$149', desc: 'Agencies and small teams with shared financial intelligence.' },
];

// ── Inline CSS ────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.lp2-root {
  background: #F7F6F4;
  color: #0A0A0A;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  overflow-x: hidden;
}

/* ── Nav ── */
.lp2-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  transition: background 220ms ease, border-color 220ms ease, backdrop-filter 220ms ease;
  border-bottom: 1px solid transparent;
}
.lp2-nav.scrolled {
  background: rgba(247,246,244,0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom-color: rgba(0,0,0,0.07);
}
.lp2-nav-inner {
  max-width: 1100px; margin: 0 auto; padding: 0 32px;
  height: 60px; display: flex; align-items: center; justify-content: space-between;
}
.lp2-wordmark {
  font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 700;
  letter-spacing: -0.03em; color: #0A0A0A; background: none; border: none; cursor: pointer;
}
.lp2-nav-actions { display: flex; align-items: center; gap: 10px; }

/* ── Buttons ── */
.lp2-btn {
  display: inline-flex; align-items: center; gap: 6px; border: none;
  font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer;
  transition: opacity 140ms ease, background 140ms ease, transform 120ms ease;
  -webkit-tap-highlight-color: transparent; white-space: nowrap;
  letter-spacing: -0.01em;
}
.lp2-btn:active { transform: scale(0.98); }
.lp2-btn-primary {
  background: #0A0A0A; color: #F7F6F4; font-size: 14px;
  padding: 10px 20px; border-radius: 8px;
}
.lp2-btn-primary:hover { opacity: 0.82; }
.lp2-btn-ghost {
  background: transparent; color: #888888; font-size: 14px;
  padding: 10px 16px; border-radius: 8px;
}
.lp2-btn-ghost:hover { color: #0A0A0A; }
.lp2-btn-lg { font-size: 15px !important; padding: 13px 28px !important; border-radius: 10px !important; }
.lp2-btn-outline {
  background: transparent; color: #0A0A0A; font-size: 14px;
  padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.16);
}
.lp2-btn-outline:hover { border-color: rgba(0,0,0,0.3); }

/* ── Layout ── */
.lp2-section { padding: 96px 32px; }
.lp2-inner { max-width: 1100px; margin: 0 auto; }

/* ── Scroll reveal ── */
.lp2-reveal { opacity: 0; transform: translateY(22px); }
.lp2-visible { animation: lp2-rise 0.55s cubic-bezier(0.16,1,0.3,1) forwards; }
@keyframes lp2-rise { to { opacity: 1; transform: translateY(0); } }
@keyframes lp2-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
@keyframes lp2-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

/* ── Hero ── */
.lp2-hero-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 72px; align-items: center;
}

/* ── System blocks ── */
.lp2-blocks-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 48px;
}
.lp2-block { padding-top: 28px; border-top: 3px solid rgba(0,0,0,0.07); }

/* ── Pricing ── */
.lp2-pricing-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

/* ── Intelligence strip ── */
.lp2-intel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 1px; background: rgba(255,255,255,0.06);
}
.lp2-intel-tile {
  padding: 40px 48px; background: #0A0A0A;
}

/* ── Footer ── */
.lp2-footer-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 48px;
}

/* ── Responsive ── */
@media (max-width: 860px) {
  .lp2-section { padding: 64px 20px; }
  .lp2-nav-inner { padding: 0 20px; }
  .lp2-hero-grid { grid-template-columns: 1fr; gap: 48px; }
  .lp2-preview-col { display: none; }
  .lp2-blocks-grid { grid-template-columns: 1fr; gap: 36px; }
  .lp2-pricing-grid { grid-template-columns: 1fr; }
  .lp2-intel-grid { grid-template-columns: 1fr; }
  .lp2-footer-grid { grid-template-columns: 1fr; gap: 32px; }
  .lp2-hero-h1 { font-size: clamp(38px, 10vw, 56px) !important; }
}

@media (max-width: 480px) {
  .lp2-nav-ghost { display: none; }
}
`;

// ── Dashboard Preview Component ───────────────────────────────────────────────
function DashboardPreview() {
  const txs = [
    { cat: 'Salary',         type: 'income',  amount: '+$5,000', date: 'Mar 28' },
    { cat: 'Rent',           type: 'expense', amount: '−$1,800', date: 'Mar 25' },
    { cat: 'AWS Services',   type: 'expense', amount: '−$312',   date: 'Mar 22' },
    { cat: 'Client Deposit', type: 'income',  amount: '+$2,500', date: 'Mar 20' },
    { cat: 'Groceries',      type: 'expense', amount: '−$184',   date: 'Mar 18' },
  ];

  const avatarStyle = (type) => ({
    width: 32, height: 32, borderRadius: 9,
    background: type === 'income' ? '#F0FDF4' : '#FFF1F2',
    color: type === 'income' ? '#059669' : '#DC2626',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
    flexShrink: 0,
  });

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,0.09), 0 4px 16px rgba(0,0,0,0.04)',
      transform: 'perspective(1200px) rotateX(2deg) rotateY(-4deg)',
      transformOrigin: 'center center',
      userSelect: 'none',
    }}>
      {/* Window chrome */}
      <div style={{
        background: '#F7F6F4', borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {['#FF6B7A','#F0C060','#00D68F'].map((c, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.7 }} />
        ))}
        <span style={{ fontFamily: LP.mono, fontSize: 10, color: LP.text4, marginLeft: 10 }}>vault — overview</span>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 28px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: LP.font, fontSize: 11, fontWeight: 500, color: LP.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Overview</span>
          <span style={{ fontFamily: LP.mono, fontSize: 10, color: LP.text4 }}>Mar 2026</span>
        </div>

        {/* Net value */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: LP.mono, fontSize: 32, fontWeight: 400, letterSpacing: '-0.04em', color: '#059669', lineHeight: 1, marginBottom: 4 }}>
            +$8,204
          </div>
          <div style={{ fontFamily: LP.mono, fontSize: 9, letterSpacing: '0.1em', color: LP.text4, textTransform: 'uppercase' }}>Net Position</div>
        </div>

        {/* Income / Expenses row */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          {[{ label: 'Income', val: '+$12,500', color: '#059669' }, { label: 'Expenses', val: '$4,296', color: '#DC2626' }].map(item => (
            <div key={item.label}>
              <div style={{ fontFamily: LP.mono, fontSize: 9, color: LP.text4, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontFamily: LP.mono, fontSize: 14, color: item.color, letterSpacing: '-0.03em' }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Transactions */}
        <div style={{ fontFamily: LP.mono, fontSize: 9, color: LP.text4, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Recent</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {txs.map((tx, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: i < txs.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
            }}>
              <div style={avatarStyle(tx.type)}>
                {tx.cat.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: LP.font, fontSize: 12, fontWeight: 400, color: LP.text1, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.cat}</div>
              </div>
              <div style={{ fontFamily: LP.mono, fontSize: 11, color: tx.type === 'income' ? '#059669' : '#DC2626', letterSpacing: '-0.03em', flexShrink: 0 }}>
                {tx.amount}
              </div>
              <div style={{ fontFamily: LP.mono, fontSize: 10, color: LP.text4, width: 38, textAlign: 'right', flexShrink: 0 }}>
                {tx.date}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function LandingNav({ scrolled, onSignIn, onStartTrial }) {
  return (
    <nav className={`lp2-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="lp2-nav-inner">
        <button className="lp2-wordmark" onClick={onSignIn} style={{ background: 'none', border: 'none' }}>
          Vault
        </button>
        <div className="lp2-nav-actions">
          <button className="lp2-btn lp2-btn-ghost lp2-nav-ghost" onClick={onSignIn}>Sign In</button>
          <button className="lp2-btn lp2-btn-primary" onClick={() => onStartTrial()}>Get started</button>
        </div>
      </div>
    </nav>
  );
}

// ── Hero Section ──────────────────────────────────────────────────────────────
function HeroSection({ onSignIn, onStartTrial }) {
  return (
    <section className="lp2-section" style={{ paddingTop: 148, paddingBottom: 80, background: LP.bg }}>
      <div className="lp2-inner">
        <div className="lp2-hero-grid">
          {/* Left: copy */}
          <div>
            <div style={{ fontFamily: LP.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: LP.text4, marginBottom: 28 }}>
              Vault
            </div>
            <h1 className="lp2-hero-h1" style={{
              fontFamily: LP.font, fontSize: 'clamp(42px, 5vw, 62px)',
              fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.04,
              color: LP.text1, marginBottom: 24,
            }}>
              Your capital.<br />Understood.
            </h1>
            <p style={{
              fontFamily: LP.font, fontSize: 17, lineHeight: 1.65,
              color: LP.text3, maxWidth: 420, marginBottom: 40,
            }}>
              Vault automatically tracks every transaction, computes your runway, and surfaces what matters — without the manual work.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <button className="lp2-btn lp2-btn-primary lp2-btn-lg" onClick={() => onStartTrial()}>
                  Start Free Trial
                </button>
                <span style={{ fontFamily: LP.mono, fontSize: 10, color: LP.text4, letterSpacing: '0.08em' }}>
                  No credit card required
                </span>
              </div>
              <button className="lp2-btn lp2-btn-ghost" onClick={onSignIn} style={{ color: LP.text3 }}>
                Sign in →
              </button>
            </div>
          </div>
          {/* Right: product preview */}
          <div className="lp2-preview-col" style={{ position: 'relative' }}>
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trust Strip ───────────────────────────────────────────────────────────────
function TrustStrip() {
  return (
    <div style={{
      borderTop: `1px solid ${LP.border}`, borderBottom: `1px solid ${LP.border}`,
      background: LP.bgSubtle, padding: '18px 32px',
      textAlign: 'center',
    }}>
      <span style={{ fontFamily: LP.mono, fontSize: 11, color: LP.text4, letterSpacing: '0.06em' }}>
        Built for operators who track reality, not estimates.
      </span>
    </div>
  );
}

// ── System Blocks ─────────────────────────────────────────────────────────────
function SystemBlocks() {
  const blocks = [
    {
      label: '01',
      heading: 'Track everything.',
      body: 'Every transaction categorized the moment it\'s entered. No sorting required, no manual work, no catching up.',
    },
    {
      label: '02',
      heading: 'Understand instantly.',
      body: 'Runway, burn rate, and net position computed in real time. Always current. Always accurate.',
    },
    {
      label: '03',
      heading: 'Act with clarity.',
      body: 'Know exactly where you stand, what to cut, and when to move. No guesswork left.',
    },
  ];

  return (
    <section className="lp2-section lp2-reveal" style={{ background: LP.bg }}>
      <div className="lp2-inner">
        <div className="lp2-blocks-grid">
          {blocks.map(b => (
            <div key={b.label} className="lp2-block">
              <div style={{ fontFamily: LP.mono, fontSize: 10, color: LP.text4, letterSpacing: '0.1em', marginBottom: 20 }}>{b.label}</div>
              <h3 style={{ fontFamily: LP.font, fontSize: 22, fontWeight: 600, letterSpacing: '-0.025em', color: LP.text1, marginBottom: 14 }}>
                {b.heading}
              </h3>
              <p style={{ fontFamily: LP.font, fontSize: 15, lineHeight: 1.65, color: LP.text3 }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Intelligence Strip ────────────────────────────────────────────────────────
function IntelligenceStrip() {
  const tiles = [
    {
      label: 'BURN RATE',
      value: '$187',
      unit: '/day',
      sub: 'Current monthly burn: $5,688',
      pulse: true,
      color: '#FF6B7A',
    },
    {
      label: 'RUNWAY',
      value: '8.2',
      unit: ' mo',
      sub: 'At current cash position',
      color: '#00D68F',
    },
    {
      label: 'WATCH',
      value: '↑ 12%',
      unit: '',
      sub: 'Expenses vs. last month',
      color: '#F0C060',
    },
  ];

  return (
    <section className="lp2-reveal" style={{ background: '#0A0A0A', padding: '0' }}>
      <div className="lp2-intel-grid">
        {tiles.map((t, i) => (
          <div key={i} className="lp2-intel-tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {t.pulse && (
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', background: t.color,
                  animation: 'lp2-pulse 2.2s ease infinite',
                }} />
              )}
              <span style={{ fontFamily: LP.mono, fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.14em' }}>
                {t.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 12 }}>
              <span style={{ fontFamily: LP.mono, fontSize: 40, fontWeight: 400, letterSpacing: '-0.04em', color: t.color, lineHeight: 1 }}>
                {t.value}
              </span>
              {t.unit && (
                <span style={{ fontFamily: LP.mono, fontSize: 16, color: 'rgba(255,255,255,0.3)', letterSpacing: '-0.02em' }}>
                  {t.unit}
                </span>
              )}
            </div>
            <div style={{ fontFamily: LP.mono, fontSize: 11, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.02em' }}>
              {t.sub}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Pricing Section ───────────────────────────────────────────────────────────
function PricingSection({ onStartTrial }) {
  return (
    <section className="lp2-section lp2-reveal" style={{ background: LP.bgSubtle }}>
      <div className="lp2-inner">
        <div style={{ marginBottom: 56 }}>
          <div style={{ fontFamily: LP.mono, fontSize: 10, color: LP.text4, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Pricing</div>
          <h2 style={{ fontFamily: LP.font, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.035em', color: LP.text1 }}>
            Simple. No surprises.
          </h2>
        </div>

        <div className="lp2-pricing-grid">
          {TIERS.map(tier => (
            <div key={tier.id} style={{
              background: LP.bgCard,
              border: tier.featured ? `1.5px solid ${LP.text1}` : `1px solid ${LP.border}`,
              borderRadius: 14,
              padding: '32px 28px',
              display: 'flex', flexDirection: 'column',
              position: 'relative', overflow: 'hidden',
            }}>
              {tier.featured && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: LP.text1,
                }} />
              )}
              <div style={{ fontFamily: LP.font, fontSize: 13, fontWeight: 600, color: LP.text2, letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: 20 }}>
                {tier.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 12 }}>
                <span style={{ fontFamily: LP.mono, fontSize: 36, fontWeight: 500, letterSpacing: '-0.04em', color: LP.text1 }}>{tier.price}</span>
                <span style={{ fontFamily: LP.font, fontSize: 13, color: LP.text3 }}>/mo</span>
              </div>
              <p style={{ fontFamily: LP.font, fontSize: 14, lineHeight: 1.6, color: LP.text3, marginBottom: 32, flex: 1 }}>
                {tier.desc}
              </p>
              <button
                className={`lp2-btn ${tier.featured ? 'lp2-btn-primary' : 'lp2-btn-outline'}`}
                style={{ justifyContent: 'center', width: '100%' }}
                onClick={() => onStartTrial()}
              >
                Start free · Upgrade later
              </button>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <span style={{ fontFamily: LP.mono, fontSize: 11, color: LP.text4 }}>
            14-day free trial · No setup fees · Cancel anytime
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCta({ onStartTrial }) {
  return (
    <section className="lp2-section lp2-reveal" style={{ background: LP.bg, textAlign: 'center' }}>
      <div className="lp2-inner" style={{ maxWidth: 560 }}>
        <h2 style={{
          fontFamily: LP.font, fontSize: 'clamp(32px, 4vw, 46px)',
          fontWeight: 700, letterSpacing: '-0.04em', color: LP.text1, marginBottom: 16,
        }}>
          Enter the Vault.
        </h2>
        <p style={{ fontFamily: LP.font, fontSize: 16, color: LP.text3, marginBottom: 40 }}>
          Your first transaction takes 30 seconds.
        </p>
        <button className="lp2-btn lp2-btn-primary lp2-btn-lg" onClick={() => onStartTrial()}>
          Start tracking
        </button>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function LandingFooter({ onSignIn, onStartTrial }) {
  return (
    <footer style={{
      background: LP.bgSubtle,
      borderTop: `1px solid ${LP.border}`,
      padding: '48px 32px',
    }}>
      <div className="lp2-inner">
        <div className="lp2-footer-grid">
          {/* Left */}
          <div>
            <div style={{ fontFamily: LP.font, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: LP.text1, marginBottom: 10 }}>
              Vault
            </div>
            <p style={{ fontFamily: LP.font, fontSize: 13, color: LP.text3, lineHeight: 1.6, maxWidth: 280, marginBottom: 20 }}>
              Automated financial intelligence for operators, freelancers, and studios.
            </p>
            <span style={{ fontFamily: LP.mono, fontSize: 11, color: LP.text4 }}>
              © 2025 VaultIQ. All rights reserved.
            </span>
          </div>
          {/* Right */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Sign In', fn: onSignIn },
                { label: 'Get started', fn: () => onStartTrial() },
              ].map(item => (
                <button key={item.label} onClick={item.fn} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: LP.font, fontSize: 13, color: LP.text3,
                  textAlign: 'left', padding: 0, transition: 'color 140ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = LP.text1}
                  onMouseLeave={e => e.currentTarget.style.color = LP.text3}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: LP.mono, fontSize: 11, color: LP.text4, lineHeight: 2.2 }}>
              <div>AES-256 Encrypted</div>
              <div>TLS 1.3 in Transit</div>
              <div>SOC 2 Type II</div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────
export default function LandingPage({ onSignIn, onStartTrial, onSelectTier }) {
  const [scrolled, setScrolled] = useState(false);

  // Nav scroll state
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-reveal via IntersectionObserver
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(el => {
        if (el.isIntersecting) {
          el.target.classList.add('lp2-visible');
          io.unobserve(el.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.lp2-reveal').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp2-root">
      <style>{CSS}</style>

      <LandingNav scrolled={scrolled} onSignIn={onSignIn} onStartTrial={onStartTrial} />

      <main>
        <HeroSection onSignIn={onSignIn} onStartTrial={onStartTrial} />
        <TrustStrip />
        <SystemBlocks />
        <IntelligenceStrip />
        <PricingSection onStartTrial={onStartTrial} />
        <FinalCta onStartTrial={onStartTrial} />
      </main>

      <LandingFooter onSignIn={onSignIn} onStartTrial={onStartTrial} />
    </div>
  );
}
