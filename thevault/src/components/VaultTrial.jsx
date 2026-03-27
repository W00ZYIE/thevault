// ─── VaultTrial.jsx ───────────────────────────────────────────────────────────
// Trial gate system for Vault — Stripe-wired version.
//
// HOW ENTITLEMENT WORKS (production):
//   1. User clicks "Activate" → redirected to /api/checkout?tier=X&email=Y
//   2. Stripe Checkout completes → webhook writes tier to Supabase user_metadata
//   3. On next app load, useTrialState() reads tier from Supabase session
//   4. isPaid = true → TrialExpiredWall is not rendered
//
// EXPORTS:
//   useTrialState(accountEmail, session)  — hook, call inside Vault()
//   TrialExpiredWall                      — full-screen block when trial ends
//   TrialBanner                           — sidebar strip showing days remaining
//   TRIAL_DAYS                            — 14
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";

export const TRIAL_DAYS = 14;
const STORAGE_KEY_START = "vault_trial_start";

const VAULT_CSS_TRIAL = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=JetBrains+Mono:wght@200;300;400;500&display=swap');
`;

// ─── useTrialState hook ───────────────────────────────────────────────────────
// Pass the Supabase session object from App.jsx so we can read user_metadata.
export function useTrialState(accountEmail, session) {
  const [trialStart, setTrialStart] = useState(null);
  const [trialReady, setTrialReady] = useState(false);

  // Seed trial start timestamp on first load
  useEffect(() => {
    try {
      let start = localStorage.getItem(STORAGE_KEY_START);
      if (!start) {
        start = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY_START, start);
      }
      setTrialStart(new Date(start));
    } catch {
      setTrialStart(new Date());
    }
    setTrialReady(true);
  }, []);

  // Handle ?payment=success redirect from Stripe — show a toast-friendly flag
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      // Clean the URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { tier, daysRemaining, trialExpired, isPaid } = useMemo(() => {
    // Read tier from Supabase user_metadata (written by webhook)
    const tier = session?.user?.user_metadata?.tier || null;
    const paid = !!tier;

    if (paid) {
      return { tier, daysRemaining: TRIAL_DAYS, trialExpired: false, isPaid: true };
    }
    if (!trialStart) {
      return { tier: null, daysRemaining: TRIAL_DAYS, trialExpired: false, isPaid: false };
    }

    const msElapsed   = Date.now() - trialStart.getTime();
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
    const remaining   = Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));

    return {
      tier:          null,
      daysRemaining: remaining,
      trialExpired:  remaining === 0,
      isPaid:        false,
    };
  }, [session, trialStart]);

  return { tier, daysRemaining, trialExpired, isPaid, trialReady };
}

// ─── Pricing tiers ────────────────────────────────────────────────────────────
const TIERS = [
  {
    id:    "solo",
    name:  "Solo",
    price: "$29",
    desc:  "Individual operator. One operation, full clarity.",
    features: [
      "Full dashboard access",
      "Cloud sync & encryption",
      "Runway calculator",
      "Budget alert engine",
      "Recurring transactions",
      "CSV & JSON export",
    ],
  },
  {
    id:       "operator",
    name:     "Operator",
    price:    "$79",
    featured: true,
    desc:     "Multi-stream operators who demand complete financial visibility.",
    features: [
      "Everything in Solo",
      "Multi-entity support",
      "PDF statement export",
      "Anomaly detection",
      "Accountant read access",
      "Advanced category control",
    ],
  },
  {
    id:    "studio",
    name:  "Studio",
    price: "$149",
    desc:  "Agencies and small teams with shared financial intelligence.",
    features: [
      "Everything in Operator",
      "Up to 3 team seats",
      "Shared ledger view",
      "Role-based permissions",
      "White-label exports",
      "Dedicated support",
    ],
  },
];

// ─── TrialExpiredWall ─────────────────────────────────────────────────────────
export function TrialExpiredWall({ accountEmail }) {
  const [activating, setActivating] = useState(null);

  const handleActivate = (tierId) => {
    setActivating(tierId);
    // Redirect to the Vercel serverless checkout function.
    // The function creates a Stripe Checkout session and redirects to Stripe.
    const email  = encodeURIComponent(accountEmail || "");
    window.location.href = `/api/checkout?tier=${tierId}&email=${email}`;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: VAULT_CSS_TRIAL }} />
      <style dangerouslySetInnerHTML={{ __html: WALL_CSS }} />

      <div className="vw-scene">
        <div className="vw-grid" />
        <div className="vw-vignette" />

        <div className="vw-frame">
          <div className="vw-border" />
          <div className="vw-corner vw-tl" /><div className="vw-corner vw-tr" />
          <div className="vw-corner vw-bl" /><div className="vw-corner vw-br" />
          <span className="vw-coord vw-ctla">VAULT · ACCESS SUSPENDED</span>
          <span className="vw-coord vw-ctrb">TRIAL PERIOD CONCLUDED</span>
          <span className="vw-coord vw-cbla">AUTH-GATE-04</span>
          <span className="vw-coord vw-cbrb">UPGRADE REQUIRED</span>
        </div>

        <div className="vw-center">

          <div className="vw-emblem">
            <div className="vw-wordmark">VAULT</div>
            <div className="vw-rule">
              <div className="vw-rule-line" />
              <div className="vw-rule-diamond" />
              <div className="vw-rule-line vw-rule-line-r" />
            </div>
            <div className="vw-sub">Your 14-day trial has ended</div>
          </div>

          <div className="vw-status-panel">
            <div className="vw-status-topline" />
            <div className="vw-status-corner vw-stl" />
            <div className="vw-status-corner vw-str" />
            <div className="vw-status-corner vw-sbl" />
            <div className="vw-status-corner vw-sbr" />
            <div className="vw-status-inner">
              <div className="vw-status-code">
                <span className="vw-status-dot" />
                <span>SESSION SUSPENDED</span>
                <span className="vw-status-divider">·</span>
                <span>{accountEmail || "operator"}</span>
              </div>
              <div className="vw-status-msg">
                Your capital data is secure and intact. Select a plan to restore access instantly.
              </div>
            </div>
          </div>

          <div className="vw-tiers">
            {TIERS.map(tier => (
              <div key={tier.id} className={`vw-tier${tier.featured ? " vw-tier-featured" : ""}`}>
                {tier.featured && <div className="vw-tier-badge">MOST CHOSEN</div>}
                {tier.featured && <div className="vw-tier-topline" />}
                <div className="vw-tier-name">{tier.name}</div>
                <div className="vw-tier-price">
                  {tier.price}
                  <span className="vw-tier-period">/ mo</span>
                </div>
                <p className="vw-tier-desc">{tier.desc}</p>
                <div className="vw-tier-divider" />
                <ul className="vw-tier-features">
                  {tier.features.map(f => <li key={f}>{f}</li>)}
                </ul>
                <button
                  className={`vw-tier-btn${tier.featured ? " vw-tier-btn-featured" : ""}`}
                  onClick={() => handleActivate(tier.id)}
                  disabled={!!activating}
                >
                  {activating === tier.id
                    ? "REDIRECTING TO STRIPE..."
                    : activating
                    ? "..."
                    : `ACTIVATE · ${tier.price}/MO`}
                </button>
              </div>
            ))}
          </div>

          <div className="vw-footnote">
            No contracts. Cancel anytime. Your data syncs immediately upon activation.
            <br />
            <span style={{ opacity: 0.4 }}>
              Powered by Stripe · Payments are secure and encrypted
            </span>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── TrialBanner ─────────────────────────────────────────────────────────────
export function TrialBanner({ daysRemaining, isPaid }) {
  if (isPaid) return null;

  const urgent      = daysRemaining <= 3;
  const accentColor = urgent
    ? "rgba(255,127,159,0.7)"
    : daysRemaining <= 7
    ? "rgba(226,201,131,0.7)"
    : "rgba(107,155,192,0.5)";
  const bgColor     = urgent ? "rgba(255,127,159,0.04)" : "rgba(107,155,192,0.025)";
  const borderColor = urgent ? "rgba(255,127,159,0.14)" : "rgba(107,155,192,0.08)";

  return (
    <div style={{
      margin: "8px 12px 0",
      padding: "10px 12px",
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderLeft: `2px solid ${accentColor}`,
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        opacity: 0.5,
      }} />
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 7, fontWeight: 300, letterSpacing: "0.28em",
        textTransform: "uppercase", color: accentColor, marginBottom: 5,
      }}>
        {urgent ? "Trial Expiring" : "Free Trial"}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13, fontWeight: 500, letterSpacing: "-0.02em",
        color: urgent ? "rgba(255,127,159,0.9)" : "rgba(194,208,220,0.9)",
        lineHeight: 1, marginBottom: 4,
      }}>
        {daysRemaining}
        <span style={{ fontSize: 9, fontWeight: 300, letterSpacing: "0.12em", marginLeft: 4, opacity: 0.7 }}>
          {daysRemaining === 1 ? "DAY LEFT" : "DAYS LEFT"}
        </span>
      </div>
      <div style={{ height: 1, background: "rgba(107,155,192,0.08)", marginTop: 6, marginBottom: 6 }}>
        <div style={{
          height: "100%",
          width: `${(daysRemaining / TRIAL_DAYS) * 100}%`,
          background: accentColor,
          transition: "width 600ms ease",
        }} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 7, color: "rgba(107,155,192,0.3)", letterSpacing: "0.1em",
      }}>
        {urgent ? "Upgrade to keep access" : "Upgrade anytime"}
      </div>
    </div>
  );
}

// ─── Wall CSS ─────────────────────────────────────────────────────────────────
const WALL_CSS = `
.vw-scene {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: #060708;
  overflow-y: auto; overflow-x: hidden;
}
.vw-grid {
  position: fixed; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(107,155,192,0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(107,155,192,0.018) 1px, transparent 1px);
  background-size: 48px 48px;
}
.vw-vignette {
  position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.88) 100%);
}
.vw-frame { position: fixed; inset: 0; pointer-events: none; z-index: 2; }
.vw-border {
  position: absolute;
  top: 14px; left: 14px; right: 14px; bottom: 14px;
  border: 1px solid rgba(180,200,220,0.08);
}
.vw-corner {
  position: absolute; width: 20px; height: 20px;
  border-color: rgba(180,200,220,0.28); border-style: solid;
}
.vw-tl { top: 14px;    left: 14px;   border-width: 2px 0 0 2px; }
.vw-tr { top: 14px;    right: 14px;  border-width: 2px 2px 0 0; }
.vw-bl { bottom: 14px; left: 14px;   border-width: 0 0 2px 2px; }
.vw-br { bottom: 14px; right: 14px;  border-width: 0 2px 2px 0; }
.vw-coord {
  position: absolute;
  font-family: 'JetBrains Mono', monospace;
  font-size: 6.5px; font-weight: 300; letter-spacing: 0.14em;
  color: rgba(107,155,192,0.12);
}
.vw-ctla { top: 18px; left: 28px; }
.vw-ctrb { top: 18px; right: 28px; }
.vw-cbla { bottom: 18px; left: 28px; }
.vw-cbrb { bottom: 18px; right: 28px; }
.vw-center {
  position: relative; z-index: 10;
  display: flex; flex-direction: column; align-items: center;
  width: 100%; max-width: 860px;
  padding: 80px 24px 60px;
}
.vw-emblem {
  display: flex; flex-direction: column; align-items: center;
  margin-bottom: 28px;
  animation: vwReveal 1.2s cubic-bezier(0.16,1,0.3,1) forwards;
}
@keyframes vwReveal {
  0%   { opacity: 0; transform: translateY(16px); filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}
.vw-wordmark {
  font-family: 'Cinzel', serif;
  font-size: 36px; font-weight: 700; letter-spacing: 0.38em;
  color: #EDF2F6;
  text-shadow: 0 0 60px rgba(107,155,192,0.1);
  margin-bottom: 10px;
}
.vw-rule { display: flex; align-items: center; gap: 10px; width: 200px; margin-bottom: 10px; }
.vw-rule-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(180,200,220,0.18)); }
.vw-rule-line-r { background: linear-gradient(to left, transparent, rgba(180,200,220,0.18)); }
.vw-rule-diamond { width: 3px; height: 3px; background: #8BAFC8; transform: rotate(45deg); opacity: 0.5; }
.vw-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px; font-weight: 300; letter-spacing: 0.4em;
  text-transform: uppercase; color: rgba(140,165,185,0.5);
}
.vw-status-panel {
  width: 100%; max-width: 560px;
  background: #111418;
  border: 1px solid rgba(180,200,220,0.10);
  position: relative; overflow: hidden;
  margin-bottom: 40px;
  animation: vwReveal 1.2s cubic-bezier(0.16,1,0.3,1) 0.1s both;
}
.vw-status-topline {
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(107,155,192,0.35) 50%, transparent 90%);
}
.vw-status-corner { position: absolute; width: 10px; height: 10px; border-color: rgba(180,200,220,0.22); border-style: solid; }
.vw-stl { top: -1px;    left: -1px;  border-width: 1.5px 0 0 1.5px; }
.vw-str { top: -1px;    right: -1px; border-width: 1.5px 1.5px 0 0; }
.vw-sbl { bottom: -1px; left: -1px;  border-width: 0 0 1.5px 1.5px; }
.vw-sbr { bottom: -1px; right: -1px; border-width: 0 1.5px 1.5px 0; }
.vw-status-inner { padding: 18px 22px; }
.vw-status-code {
  display: flex; align-items: center; gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 7.5px; font-weight: 300; letter-spacing: 0.28em;
  text-transform: uppercase; color: rgba(107,155,192,0.5);
  margin-bottom: 10px;
}
.vw-status-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,127,159,0.7);
  box-shadow: 0 0 6px rgba(255,127,159,0.4);
  animation: vwBlink 2s ease-in-out infinite;
}
@keyframes vwBlink { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.vw-status-divider { opacity: 0.3; }
.vw-status-msg {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; font-weight: 300; letter-spacing: 0.04em;
  color: rgba(165,190,210,0.65); line-height: 1.8;
}
.vw-tiers {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 1px; background: rgba(180,200,220,0.06);
  border: 1px solid rgba(180,200,220,0.06);
  width: 100%;
  animation: vwReveal 1.2s cubic-bezier(0.16,1,0.3,1) 0.2s both;
  margin-bottom: 28px;
}
.vw-tier {
  background: #0B0D10; padding: 32px 26px;
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
  transition: background 250ms;
}
.vw-tier:hover { background: #111418; }
.vw-tier-featured { background: #111418; }
.vw-tier-topline {
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, rgba(107,155,192,0.55), transparent);
}
.vw-tier-badge {
  position: absolute; top: 14px; right: 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 6px; font-weight: 300; letter-spacing: 0.28em;
  text-transform: uppercase; color: rgba(107,155,192,0.7);
  border: 1px solid rgba(107,155,192,0.2);
  background: rgba(107,155,192,0.05); padding: 3px 8px;
}
.vw-tier-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 7px; font-weight: 300; letter-spacing: 0.42em;
  text-transform: uppercase; color: rgba(107,155,192,0.5); margin-bottom: 12px;
}
.vw-tier-price {
  font-family: 'Cinzel', serif;
  font-size: 36px; font-weight: 600; letter-spacing: 0.04em;
  color: #EDF2F6; line-height: 1; margin-bottom: 10px;
}
.vw-tier-period {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; font-weight: 300; color: rgba(140,165,185,0.5);
  margin-left: 4px; vertical-align: baseline;
}
.vw-tier-desc {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 300; letter-spacing: 0.04em;
  color: rgba(140,165,185,0.5); line-height: 1.8; margin-bottom: 20px;
}
.vw-tier-divider { height: 1px; background: rgba(180,200,220,0.06); margin-bottom: 18px; }
.vw-tier-features { list-style: none; flex: 1; margin-bottom: 28px; }
.vw-tier-features li {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 300; letter-spacing: 0.04em;
  color: rgba(194,208,220,0.8); line-height: 1.6;
  margin-bottom: 8px; padding-left: 14px; position: relative;
}
.vw-tier-features li::before {
  content: ''; position: absolute; left: 0; top: 5px;
  width: 5px; height: 5px;
  border: 1px solid rgba(70,231,169,0.4); background: rgba(70,231,169,0.1);
}
.vw-tier-btn {
  width: 100%; padding: 12px; background: transparent;
  border: 1px solid rgba(180,200,220,0.12); color: rgba(165,190,210,0.5);
  font-family: 'JetBrains Mono', monospace;
  font-size: 7.5px; font-weight: 300; letter-spacing: 0.26em;
  text-transform: uppercase; cursor: pointer; transition: all 200ms;
}
.vw-tier-btn:hover:not(:disabled) { border-color: rgba(180,200,220,0.28); color: #C2D0DC; }
.vw-tier-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.vw-tier-btn-featured {
  background: rgba(107,155,192,0.1);
  border-color: rgba(107,155,192,0.32); color: #C2D0DC;
}
.vw-tier-btn-featured:hover:not(:disabled) {
  background: rgba(107,155,192,0.18);
  border-color: rgba(107,155,192,0.5); color: #E4EBF0;
}
.vw-footnote {
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px; font-weight: 300; letter-spacing: 0.1em;
  color: rgba(107,155,192,0.3); text-align: center; line-height: 2;
  animation: vwReveal 1.2s cubic-bezier(0.16,1,0.3,1) 0.35s both;
}
@media (max-width: 700px) {
  .vw-tiers { grid-template-columns: 1fr; }
  .vw-wordmark { font-size: 26px; }
  .vw-center { padding: 60px 16px 40px; }
}
`;
