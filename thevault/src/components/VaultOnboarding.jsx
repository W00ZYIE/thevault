// ─── VaultOnboarding.jsx ──────────────────────────────────────────────────────
// Triggered when: loaded === true && baseLiq === 0 && txs.length === 0
// Calls onComplete({ baseLiquidity, firstTx }) to hand control back to App.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

const LIGHT_T = {
  bg:      "#F8FAFC",
  surface: "#FFFFFF",
  border:  "rgba(0,0,0,0.07)",
  borderMid:"rgba(0,0,0,0.12)",
  text1:   "#0D1117",
  text2:   "#374151",
  text3:   "#6B7280",
  text4:   "#9CA3AF",
  inputBg: "#F1F4F9",
  green:   "#059669",
  red:     "#DC2626",
  gold:    "#B8891A",
  blue:    "#1B4FCC",
  blueDark:"#1340A8",
  blueLight:"#F0F4FF",
  panelShadow: "0 8px 32px rgba(0,0,0,0.10)",
  summaryBg:   "#F8FAFC",
  summaryBorder:"rgba(0,0,0,0.07)",
  summaryRowDivider:"rgba(0,0,0,0.05)",
};

const DARK_T = {
  bg:      "#080C14",
  surface: "#111827",
  border:  "rgba(255,255,255,0.07)",
  borderMid:"rgba(255,255,255,0.12)",
  text1:   "#E5EAF3",
  text2:   "#9CA3AF",
  text3:   "#6B7280",
  text4:   "#4B5563",
  inputBg: "#0F1520",
  green:   "#059669",
  red:     "#DC2626",
  gold:    "#B8891A",
  blue:    "#3B6FE8",
  blueDark:"#2E5CC7",
  blueLight:"rgba(59,111,232,0.10)",
  panelShadow: "0 8px 40px rgba(0,0,0,0.50)",
  summaryBg:   "#0F1520",
  summaryBorder:"rgba(255,255,255,0.06)",
  summaryRowDivider:"rgba(255,255,255,0.04)",
};

const STEPS = [
  { id: "capital", label: "Capital Position" },
  { id: "firsttx", label: "First Entry"       },
  { id: "ready",   label: "Review"            },
];

const EXPENSE_CATS = [
  "Operations","Payroll","Technology","Marketing",
  "Travel","Utilities","Transportation","Insurance","Taxes","Tools","Other",
];
const INCOME_CATS = [
  "Salary","Business Revenue","Investment Returns",
  "Dividends","Capital Gains","Partnership Distribution","Other Income",
];

function buildCSS(t) {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

@keyframes ob-fadein {
  from { opacity:0; transform:translateY(12px); }
  to   { opacity:1; transform:translateY(0);    }
}
.ob-scene {
  position:fixed; inset:0; z-index:999;
  background:rgba(11,22,41,0.70);
  display:flex; align-items:center; justify-content:center;
  font-family:'Inter',sans-serif;
}
.ob-center {
  position:relative; z-index:10;
  width:100%; max-width:480px;
  padding:0 24px;
  animation:ob-fadein 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
}
.ob-wordmark {
  text-align:center; margin-bottom:20px;
}
.ob-wordmark-title {
  font-family:'Inter',sans-serif;
  font-size:18px; font-weight:600;
  letter-spacing:0.06em; color:#FFFFFF;
  margin-bottom:3px;
}
.ob-wordmark-sub {
  font-size:12px; font-weight:400; letter-spacing:0.01em;
  color:rgba(255,255,255,0.40);
}
.ob-stepper {
  display:flex; align-items:center;
  margin-bottom:18px;
  padding:0 4px;
}
.ob-step-item {
  display:flex; align-items:center; gap:8px;
}
.ob-step-circle {
  width:22px; height:22px; border-radius:50%;
  border:1.5px solid rgba(255,255,255,0.20);
  display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',monospace;
  font-size:10px; font-weight:500;
  color:rgba(255,255,255,0.35);
  flex-shrink:0; transition:all 200ms;
  background:transparent;
}
.ob-step-circle.active {
  border-color:#1B4FCC;
  color:#FFFFFF;
  background:rgba(27,79,204,0.20);
}
.ob-step-circle.done {
  border-color:#059669;
  color:#059669;
  background:rgba(5,150,105,0.10);
}
.ob-step-label {
  font-family:'Inter',sans-serif;
  font-size:11px; font-weight:500; letter-spacing:0.02em;
  color:rgba(255,255,255,0.25); transition:color 200ms;
  white-space:nowrap;
}
.ob-step-label.active { color:rgba(255,255,255,0.80); }
.ob-step-label.done   { color:rgba(255,255,255,0.45); }
.ob-step-line {
  flex:1; height:1px;
  background:rgba(255,255,255,0.10);
  margin:0 10px;
}
.ob-step-line.done { background:rgba(5,150,105,0.35); }
.ob-panel {
  background:${t.surface};
  border:1px solid ${t.border};
  border-radius:12px;
  box-shadow:${t.panelShadow};
  padding:28px 28px 24px;
  position:relative;
}
.ob-step-counter {
  font-family:'Inter',sans-serif;
  font-size:10px; font-weight:600; letter-spacing:0.10em; text-transform:uppercase;
  color:${t.text4}; margin-bottom:6px;
}
.ob-panel-title {
  font-family:'Inter',sans-serif;
  font-size:20px; font-weight:600;
  color:${t.text1};
  margin-bottom:6px; letter-spacing:-0.01em;
}
.ob-panel-desc {
  font-family:'Inter',sans-serif;
  font-size:13px; font-weight:400; line-height:1.6;
  color:${t.text3};
  margin-bottom:24px;
}
.ob-field { margin-bottom:16px; }
.ob-field-label {
  font-family:'Inter',sans-serif;
  font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase;
  color:${t.text3}; margin-bottom:6px; display:block;
}
.ob-input {
  width:100%;
  background:${t.inputBg};
  border:1px solid ${t.border};
  border-radius:6px;
  padding:10px 12px;
  color:${t.text1}; font-family:'JetBrains Mono',monospace;
  font-size:13px; letter-spacing:0.02em;
  transition:border-color 200ms, box-shadow 200ms;
  outline:none;
  box-sizing:border-box;
}
.ob-input:focus {
  border-color:${t.blue};
  box-shadow:0 0 0 3px ${t.blueLight};
}
.ob-input-amount {
  font-size:32px; font-weight:500;
  letter-spacing:-0.03em; text-align:center;
  padding:18px 14px 14px;
  caret-color:transparent;
  background:${t.inputBg};
  border:1px solid ${t.border};
}
.ob-input-hint {
  font-family:'Inter',sans-serif;
  font-size:11px; font-weight:400;
  color:${t.text4}; margin-top:6px;
  text-align:center;
}
.ob-select {
  width:100%;
  background:${t.inputBg};
  border:1px solid ${t.border};
  border-radius:6px;
  padding:10px 12px;
  color:${t.text1}; font-family:'Inter',sans-serif;
  font-size:13px; font-weight:400;
  transition:border-color 200ms; cursor:pointer;
  appearance:none; outline:none;
  box-sizing:border-box;
}
.ob-select:focus {
  border-color:${t.blue};
  box-shadow:0 0 0 3px ${t.blueLight};
}
.ob-select option { background:${t.surface}; color:${t.text1}; }
.ob-type-toggle {
  display:flex; gap:0; margin-bottom:16px;
  border:1px solid ${t.borderMid};
  border-radius:6px; overflow:hidden;
  background:${t.inputBg};
  padding:3px; gap:3px;
}
.ob-type-btn {
  flex:1; padding:8px 10px;
  background:transparent; border:none; border-radius:4px;
  font-family:'Inter',sans-serif;
  font-size:12px; font-weight:600; letter-spacing:0.02em;
  color:${t.text3}; transition:all 200ms; cursor:pointer;
}
.ob-type-btn.active-income  { background:${t.surface}; color:${t.green}; }
.ob-type-btn.active-expense { background:${t.surface}; color:${t.red}; }
.ob-actions {
  display:flex; gap:8px; margin-top:22px;
}
.ob-btn-primary {
  flex:1; padding:12px 20px;
  background:${t.blue};
  border:none;
  border-radius:6px;
  color:#FFFFFF; font-family:'Inter',sans-serif;
  font-size:14px; font-weight:600;
  transition:background 200ms; cursor:pointer;
}
.ob-btn-primary:hover { background:${t.blueDark}; }
.ob-btn-primary:disabled { opacity:0.35; cursor:not-allowed; }
.ob-btn-ghost {
  padding:12px 16px;
  background:transparent;
  border:none;
  color:${t.text3}; font-family:'Inter',sans-serif;
  font-size:13px; font-weight:500;
  transition:color 200ms; cursor:pointer;
}
.ob-btn-ghost:hover { color:${t.text2}; }
.ob-ready-icon {
  width:44px; height:44px; border-radius:50%;
  border:1.5px solid rgba(5,150,105,0.25);
  display:flex; align-items:center; justify-content:center;
  margin:0 auto 18px;
}
.ob-summary {
  background:${t.summaryBg};
  border:1px solid ${t.summaryBorder};
  border-radius:8px;
  padding:14px 16px;
  margin-bottom:18px;
}
.ob-summary-row {
  display:flex; justify-content:space-between; align-items:baseline;
  padding:7px 0;
  border-bottom:1px solid ${t.summaryRowDivider};
}
.ob-summary-row:last-child { border-bottom:none; }
.ob-summary-key {
  font-family:'Inter',sans-serif;
  font-size:12px; font-weight:500;
  color:${t.text3};
}
.ob-summary-val {
  font-family:'JetBrains Mono',monospace;
  font-size:12px; font-weight:500;
  color:${t.text1}; letter-spacing:-0.01em;
}
`;
}

function fmt(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(typeof n === "number" && Number.isFinite(n) ? n : 0);
}

function parseAmount(digits) {
  const cents = parseInt(digits || "0", 10);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

// ── Step 1: Capital Position ──────────────────────────────────────────────────
function StepCapital({ onNext, t }) {
  const [digits, setDigits] = useState("");
  const amount = parseAmount(digits);
  const valid  = amount > 0;

  const handleKey = e => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      setDigits(d => (d + e.key).slice(0, 12));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setDigits(d => d.slice(0, -1));
    } else if (e.key === "Enter" && valid) {
      onNext(amount);
    }
  };

  return (
    <>
      <div className="ob-step-counter">Step 1 of 3</div>
      <div className="ob-panel-title">Set Your Base Capital</div>
      <div className="ob-panel-desc">
        Your current liquid cash on hand — the starting point for calculating
        runway, net position, and available capital. Enter what you have right now.
      </div>
      <div className="ob-field">
        <input
          autoFocus
          readOnly
          className="ob-input ob-input-amount"
          value={digits.length === 0 ? "$0.00" : fmt(amount)}
          onKeyDown={handleKey}
          style={{ color: amount === 0 ? t.text4 : t.text1 }}
        />
        <div className="ob-input-hint">Type digits · Backspace to clear · Enter to continue</div>
      </div>
      <div className="ob-actions">
        <button className="ob-btn-primary" disabled={!valid} onClick={() => onNext(amount)}>
          Continue
        </button>
      </div>
    </>
  );
}

// ── Step 2: First Transaction ─────────────────────────────────────────────────
function StepFirstTx({ onNext, onSkip, t }) {
  const [type,   setType]   = useState("expense");
  const [digits, setDigits] = useState("");
  const [cat,    setCat]    = useState("Operations");
  const [desc,   setDesc]   = useState("");
  const [date,   setDate]   = useState(new Date().toISOString().split("T")[0]);

  const amount = parseAmount(digits);
  const valid  = amount > 0;
  const cats   = type === "expense" ? EXPENSE_CATS : INCOME_CATS;

  const switchType = newType => {
    setType(newType);
    setCat(newType === "expense" ? EXPENSE_CATS[0] : INCOME_CATS[0]);
  };

  const handleKey = e => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      setDigits(d => (d + e.key).slice(0, 12));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setDigits(d => d.slice(0, -1));
    } else if (e.key === "Enter" && valid) {
      onNext({ type, amount, category: cat, description: desc, date, tags: "", recurring: false, recurringFreq: "monthly" });
    }
  };

  return (
    <>
      <div className="ob-step-counter">Step 2 of 3</div>
      <div className="ob-panel-title">Record Your First Entry</div>
      <div className="ob-panel-desc">
        Log a recent transaction to activate your ledger — a bill paid, revenue received, or a regular expense.
      </div>
      <div className="ob-type-toggle">
        {["expense","income"].map(tp => (
          <button key={tp} className={`ob-type-btn${type === tp ? ` active-${tp}` : ""}`} onClick={() => switchType(tp)}>
            {tp === "expense" ? "Expense" : "Income"}
          </button>
        ))}
      </div>
      <div className="ob-field">
        <label className="ob-field-label">Amount</label>
        <input
          autoFocus readOnly
          className="ob-input ob-input-amount"
          value={digits.length === 0 ? "$0.00" : fmt(amount)}
          onKeyDown={handleKey}
          style={{ fontSize: 26, color: amount === 0 ? t.text4 : type === "income" ? t.green : t.red }}
        />
      </div>
      <div className="ob-field">
        <label className="ob-field-label">Category</label>
        <select className="ob-select" value={cat} onChange={e => setCat(e.target.value)}>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="ob-field" style={{ flex: 1 }}>
          <label className="ob-field-label">Description</label>
          <input className="ob-input" placeholder="Memo (optional)" value={desc} onChange={e => setDesc(e.target.value)}
            onKeyDown={e => e.key === "Enter" && valid && onNext({ type, amount, category: cat, description: desc, date, tags: "", recurring: false, recurringFreq: "monthly" })} />
        </div>
        <div className="ob-field" style={{ flex: 1 }}>
          <label className="ob-field-label">Date</label>
          <input type="date" className="ob-input" value={date} onChange={e => setDate(e.target.value)}
            style={{ colorScheme: "light dark" }} />
        </div>
      </div>
      <div className="ob-actions">
        <button className="ob-btn-ghost" onClick={onSkip}>Skip</button>
        <button className="ob-btn-primary" disabled={!valid}
          onClick={() => onNext({ type, amount, category: cat, description: desc, date, tags: "", recurring: false, recurringFreq: "monthly" })}>
          Continue
        </button>
      </div>
    </>
  );
}

// ── Step 3: Ready ─────────────────────────────────────────────────────────────
function StepReady({ baseLiq, firstTx, onEnter, t }) {
  return (
    <>
      <div className="ob-step-counter">Step 3 of 3</div>
      <div className="ob-ready-icon">
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div className="ob-panel-title" style={{ textAlign: "center", marginBottom: 6 }}>You're all set.</div>
      <div className="ob-panel-desc" style={{ textAlign: "center", marginBottom: 18 }}>
        Your capital position is established. Review your entries below before entering the dashboard.
      </div>
      <div className="ob-summary">
        <div className="ob-summary-row">
          <span className="ob-summary-key">Base Capital</span>
          <span className="ob-summary-val" style={{ color: t.green }}>{fmt(baseLiq)}</span>
        </div>
        {firstTx && (
          <>
            <div className="ob-summary-row">
              <span className="ob-summary-key">First Entry</span>
              <span className="ob-summary-val" style={{ color: firstTx.type === "income" ? t.green : t.red }}>
                {firstTx.type === "income" ? "+" : "−"}{fmt(firstTx.amount)}
              </span>
            </div>
            <div className="ob-summary-row">
              <span className="ob-summary-key">Category</span>
              <span className="ob-summary-val">{firstTx.category}</span>
            </div>
          </>
        )}
        <div className="ob-summary-row">
          <span className="ob-summary-key">Net Position</span>
          <span className="ob-summary-val">
            {fmt(baseLiq + (firstTx ? (firstTx.type === "income" ? firstTx.amount : -firstTx.amount) : 0))}
          </span>
        </div>
      </div>
      <div className="ob-actions">
        <button className="ob-btn-primary" onClick={onEnter}>Open Dashboard</button>
      </div>
    </>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ current }) {
  return (
    <div className="ob-stepper">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "pending";
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div className={`ob-step-circle ${state}`}>
                {state === "done" ? (
                  <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="8 2.5 4 7.5 2 5.5" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className={`ob-step-label ${state}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`ob-step-line ${state === "done" ? "done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function VaultOnboarding({ onComplete, theme, initialCapital }) {
  const [step,    setStep]    = useState(0);
  const [baseLiq, setBaseLiq] = useState(initialCapital || 0);
  const [firstTx, setFirstTx] = useState(null);

  const t = theme === 'dark' ? DARK_T : LIGHT_T;
  const css = buildCSS(t);

  const handleCapital = amount => { setBaseLiq(amount); setStep(1); };
  const handleFirstTx = tx => { setFirstTx(tx); setStep(2); };
  const handleSkip    = () => { setFirstTx(null); setStep(2); };
  const handleEnter   = () => { onComplete({ baseLiquidity: baseLiq, firstTx }); };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="ob-scene">
        <div className="ob-center" style={{ position:'relative' }}>
          <button
            onClick={() => onComplete({ baseLiquidity: 0, firstTx: null })}
            style={{
              position:'absolute', top:0, right:0,
              background:'none', border:'none', cursor:'pointer',
              fontFamily:"'Inter',sans-serif", fontSize:12,
              color: theme === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)',
              letterSpacing:'0.02em', padding:'4px 0',
            }}
          >
            Skip setup →
          </button>
          <div className="ob-wordmark">
            <div className="ob-wordmark-title">VAULT<span style={{ color: '#3B7FFF' }}>IQ</span></div>
            <div className="ob-wordmark-sub">Initial Setup</div>
          </div>
          <Stepper current={step} />
          <div className="ob-panel">
            {step === 0 && <StepCapital onNext={handleCapital} t={t} />}
            {step === 1 && <StepFirstTx onNext={handleFirstTx} onSkip={handleSkip} t={t} />}
            {step === 2 && <StepReady baseLiq={baseLiq} firstTx={firstTx} onEnter={handleEnter} t={t} />}
          </div>
        </div>
      </div>
    </>
  );
}
