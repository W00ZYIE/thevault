// ─── VaultTrial.jsx ───────────────────────────────────────────────────────────
// Trial gate system for Vault — Stripe-wired version.
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


// ─── useTrialState hook ───────────────────────────────────────────────────────
export function useTrialState(accountEmail, session) {
  const [trialStart, setTrialStart] = useState(null);
  const [trialReady, setTrialReady] = useState(false);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { tier, daysRemaining, trialExpired, isPaid } = useMemo(() => {
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
    price: "$25",
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
export function TrialExpiredWall({ accountEmail, T }) {
  const [activating, setActivating] = useState(null);

  const handleActivate = (tierId) => {
    setActivating(tierId);
    const email = encodeURIComponent(accountEmail || "");
    window.location.href = `/api/checkout?tier=${tierId}&email=${email}`;
  };

  const wallCSS = buildWallCSS(T);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: wallCSS }} />

      <div className="vw-scene">
        <div className="vw-center">

          <div className="vw-emblem">
            <div className="vw-wordmark">VAULT<span style={{ color: '#1B4FCC' }}>IQ</span></div>
            <div className="vw-sub">Your 14-day trial has ended</div>
          </div>

          <div className="vw-status-panel">
            <div className="vw-status-inner">
              <div className="vw-status-msg">
                Your capital data is secure and intact. Select a plan to restore access instantly.
                {accountEmail && <span style={{ color: T.text3, marginLeft: 8 }}>— {accountEmail}</span>}
              </div>
            </div>
          </div>

          <div className="vw-tiers">
            {TIERS.map(tier => (
              <div key={tier.id} className={`vw-tier${tier.featured ? " vw-tier-featured" : ""}`}>
                {tier.featured && <div className="vw-tier-badge">Primary</div>}
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
                    ? "Redirecting to Stripe..."
                    : activating
                    ? "..."
                    : `Activate · ${tier.price}/mo`}
                </button>
              </div>
            ))}
          </div>

          <div className="vw-footnote">
            No contracts. Cancel anytime. Your data syncs immediately upon activation.
            <br />
            <span style={{ opacity: 0.5 }}>
              Powered by Stripe · Payments are secure and encrypted
            </span>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── TrialBanner ─────────────────────────────────────────────────────────────
export function TrialBanner({ daysRemaining, isPaid, T }) {
  if (isPaid) return null;

  return (
    <div style={{
      margin: "8px 12px 0",
      padding: "10px 12px",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 6,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: daysRemaining <= 3 ? "#DC2626" : "#B8891A",
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.40)",
        }}>
          {daysRemaining <= 3 ? "Trial Expiring" : "Free Trial"}
        </span>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 500,
        color: "rgba(255,255,255,0.75)",
        lineHeight: 1, marginBottom: 6,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "-0.01em",
      }}>
        {daysRemaining}
        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4, color: "rgba(255,255,255,0.35)", fontFamily: "'Inter', sans-serif", letterSpacing: 0 }}>
          {daysRemaining === 1 ? "day left" : "days left"}
        </span>
      </div>
      <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 6 }}>
        <div style={{
          height: "100%",
          width: `${(daysRemaining / TRIAL_DAYS) * 100}%`,
          background: daysRemaining <= 3 ? "#DC2626" : "#B8891A",
          borderRadius: 2,
          transition: "width 600ms ease",
        }} />
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", letterSpacing: "0.01em" }}>
        {daysRemaining <= 3 ? "Upgrade to keep access" : "Upgrade anytime"}
      </div>
    </div>
  );
}

// ─── Wall CSS builder ─────────────────────────────────────────────────────────
function buildWallCSS(T) {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

.vw-scene {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(11,22,41,0.75);
  overflow-y: auto; overflow-x: hidden;
  font-family: 'Inter', sans-serif;
}
.vw-center {
  position: relative; z-index: 10;
  display: flex; flex-direction: column; align-items: center;
  width: 100%; max-width: 900px;
  padding: 56px 28px 44px;
  background: ${T.bgCard};
  border-radius: 16px;
  border: 1px solid ${T.border};
  box-shadow: ${T.shadowLg};
  margin: 24px;
}
.vw-emblem {
  display: flex; flex-direction: column; align-items: center;
  margin-bottom: 10px;
}
.vw-wordmark {
  font-family: 'Inter', sans-serif;
  font-size: 22px; font-weight: 600; letter-spacing: 0.06em;
  color: ${T.text1};
  margin-bottom: 6px;
}
.vw-sub {
  font-family: 'Inter', sans-serif;
  font-size: 14px; font-weight: 400;
  color: ${T.text3}; margin-bottom: 0;
}
.vw-status-panel {
  width: 100%; max-width: 520px;
  background: ${T.bgSubtle};
  border: 1px solid ${T.border};
  border-radius: 8px;
  margin-bottom: 36px;
}
.vw-status-inner { padding: 14px 18px; }
.vw-status-msg {
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 400;
  color: ${T.text3}; line-height: 1.6;
  text-align: center;
}
.vw-tiers {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  width: 100%;
  margin-bottom: 24px;
  align-items: start;
}
.vw-tier {
  background: ${T.bgCard}; padding: 26px 20px;
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
  border-radius: 12px;
  border: 1px solid ${T.border};
  transition: box-shadow 200ms;
}
.vw-tier:hover { box-shadow: ${T.shadowMd}; }
.vw-tier-featured {
  border: 2px solid ${T.blue};
  background: ${T.blueFaint};
}
.vw-tier-badge {
  display: inline-block;
  margin-bottom: 14px;
  font-family: 'Inter', sans-serif;
  font-size: 9px; font-weight: 600; letter-spacing: 0.10em; text-transform: uppercase;
  color: ${T.gold};
  align-self: flex-start;
}
.vw-tier-name {
  font-family: 'Inter', sans-serif;
  font-size: 14px; font-weight: 600;
  color: ${T.text1}; margin-bottom: 10px; letter-spacing: -0.01em;
}
.vw-tier-price {
  font-family: 'JetBrains Mono', monospace;
  font-size: 36px; font-weight: 600;
  color: ${T.text1}; line-height: 1; margin-bottom: 10px;
  letter-spacing: -0.03em;
}
.vw-tier-period {
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 400; color: ${T.text4};
  margin-left: 3px; vertical-align: baseline;
}
.vw-tier-desc {
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 400;
  color: ${T.text3}; line-height: 1.6; margin-bottom: 16px;
}
.vw-tier-divider { height: 1px; background: ${T.border}; margin-bottom: 14px; }
.vw-tier-features { list-style: none; flex: 1; margin-bottom: 22px; padding: 0; }
.vw-tier-features li {
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 400;
  color: ${T.text2}; line-height: 1.5;
  margin-bottom: 7px; padding-left: 18px; position: relative;
}
.vw-tier-features li::before {
  content: '✓'; position: absolute; left: 0;
  color: ${T.green}; font-weight: 600; font-size: 12px;
}
.vw-tier-btn {
  width: 100%; padding: 11px 18px;
  background: transparent;
  border: 1px solid ${T.borderMid}; color: ${T.text2};
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 600;
  border-radius: 6px;
  cursor: pointer; transition: all 200ms;
}
.vw-tier-btn:hover:not(:disabled) {
  border-color: ${T.text3}; background: ${T.bgSubtle};
}
.vw-tier-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.vw-tier-btn-featured {
  background: ${T.blue};
  border-color: ${T.blue}; color: #FFFFFF;
}
.vw-tier-btn-featured:hover:not(:disabled) {
  background: ${T.blueDark};
  border-color: ${T.blueDark};
}
.vw-footnote {
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 400;
  color: ${T.text4}; text-align: center; line-height: 2;
}
@media (max-width: 700px) {
  .vw-tiers { grid-template-columns: 1fr; }
  .vw-wordmark { font-size: 18px; }
  .vw-center { padding: 36px 16px 28px; margin: 12px; }
}
`;
}
