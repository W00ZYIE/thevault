// ─── VaultOnboarding.jsx ──────────────────────────────────────────────────────
// Drop into: src/components/VaultOnboarding.jsx
// Triggered when: loaded === true && baseLiq === 0 && txs.length === 0
// Calls onComplete({ baseLiquidity, firstTx }) to hand control back to App.jsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";

const T = {
  bg:      "#090b0e",
  bgDeep:  "#060709",
  surface: "#0c0f13",
  border:  "rgba(107,155,192,0.08)",
  borderHi:"rgba(107,155,192,0.22)",
  text1:   "#edf2f6",
  text2:   "#b8c8d8",
  text3:   "#6e8099",
  textMid: "#c8d8e8",
  steel:   "rgba(107,155,192,0.55)",
  steelLo: "rgba(107,155,192,0.25)",
  steelDim:"rgba(107,155,192,0.08)",
  green:   "#46e7a9",
  red:     "#ff7f9f",
  gold:    "#e2c983",
};

const STEPS = [
  { id: "capital",     code: "INIT-01", label: "Capital Position" },
  { id: "firsttx",    code: "INIT-02", label: "First Entry"       },
  { id: "ready",       code: "INIT-03", label: "Vault Armed"       },
];

const EXPENSE_CATS = [
  "Operations","Payroll","Technology","Marketing",
  "Travel","Utilities","Transportation","Insurance","Taxes","Tools","Other",
];
const INCOME_CATS = [
  "Salary","Business Revenue","Investment Returns",
  "Dividends","Capital Gains","Partnership Distribution","Other Income",
];

// ── Inline CSS ────────────────────────────────────────────────────────────────
const CSS = `
@keyframes ob-fadein {
  from { opacity:0; transform:translateY(16px); }
  to   { opacity:1; transform:translateY(0);    }
}
@keyframes ob-scan {
  0%   { left:-40%; }
  100% { left:140%; }
}
@keyframes ob-pulse {
  0%,100% { opacity:0.35; }
  50%      { opacity:1;    }
}
.ob-scene {
  position:fixed; inset:0; z-index:999;
  background:#060709;
  display:flex; align-items:center; justify-content:center;
  font-family:'JetBrains Mono',monospace;
}
.ob-grid {
  position:absolute; inset:0; pointer-events:none;
  background-image:
    linear-gradient(rgba(107,155,192,0.025) 1px, transparent 1px),
    linear-gradient(90deg,rgba(107,155,192,0.025) 1px, transparent 1px);
  background-size:48px 48px;
}
.ob-vignette {
  position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse 70% 80% at 50% 50%, transparent 20%, rgba(0,0,0,0.96) 100%);
}
.ob-frame {
  position:absolute; inset:16px; pointer-events:none;
  border:1px solid rgba(107,155,192,0.08);
}
.ob-frame-inner {
  position:absolute; inset:24px; pointer-events:none;
  border:1px solid rgba(107,155,192,0.04);
}
.ob-corner {
  position:absolute; width:20px; height:20px;
  border-color:rgba(107,155,192,0.28); border-style:solid;
}
.ob-corner.tl { top:16px;    left:16px;  border-width:1px 0 0 1px; }
.ob-corner.tr { top:16px;    right:16px; border-width:1px 1px 0 0; }
.ob-corner.bl { bottom:16px; left:16px;  border-width:0 0 1px 1px; }
.ob-corner.br { bottom:16px; right:16px; border-width:0 1px 1px 0; }
.ob-scanline {
  position:absolute; left:16px; right:16px; height:1px;
  background:linear-gradient(to right, transparent, rgba(107,155,192,0.12), transparent);
  animation:none; top:0;
}
.ob-center {
  position:relative; z-index:10;
  width:100%; max-width:500px;
  padding:0 24px;
  animation:ob-fadein 0.6s cubic-bezier(0.16,1,0.3,1) forwards;
}
.ob-wordmark {
  text-align:center; margin-bottom:36px;
}
.ob-wordmark-title {
  font-family:'Cinzel',serif;
  font-size:11px; font-weight:500;
  letter-spacing:0.45em; color:rgba(107,155,192,0.45);
  margin-bottom:6px;
}
.ob-wordmark-sub {
  font-size:7px; letter-spacing:0.28em;
  color:rgba(107,155,192,0.22);
}
.ob-stepper {
  display:flex; align-items:center; gap:0;
  margin-bottom:28px;
}
.ob-step {
  display:flex; align-items:center; gap:8px; flex:1;
}
.ob-step-dot {
  width:6px; height:6px; border-radius:50%;
  border:1px solid rgba(107,155,192,0.25);
  flex-shrink:0; transition:all 0.3s;
}
.ob-step-dot.active  { background:rgba(107,155,192,0.8); border-color:rgba(107,155,192,0.8); }
.ob-step-dot.done    { background:rgba(70,231,169,0.6);  border-color:rgba(70,231,169,0.6);  }
.ob-step-dot.pending { background:transparent; }
.ob-step-label {
  font-size:7px; letter-spacing:0.22em; text-transform:uppercase;
  color:rgba(107,155,192,0.28); transition:color 0.3s;
}
.ob-step-label.active  { color:rgba(107,155,192,0.65); }
.ob-step-label.done    { color:rgba(70,231,169,0.5);   }
.ob-step-connector {
  flex:1; height:1px;
  background:rgba(107,155,192,0.08);
  margin:0 8px;
}
.ob-panel {
  background:rgba(8,10,12,0.98);
  border:1px solid rgba(107,155,192,0.12);
  border-top:1px solid rgba(107,155,192,0.25);
  padding:28px 28px 24px;
  position:relative; overflow:hidden;
}
.ob-panel::before {
  content:'';
  position:absolute; top:0; left:0; right:0; height:1px;
  background:linear-gradient(90deg, transparent, rgba(107,155,192,0.3), transparent);
}
.ob-panel-code {
  font-size:7px; letter-spacing:0.28em;
  color:rgba(107,155,192,0.28); margin-bottom:6px;
}
.ob-panel-title {
  font-family:'Cinzel',serif;
  font-size:17px; font-weight:500;
  letter-spacing:0.08em; color:#D4E0EA;
  margin-bottom:6px;
}
.ob-panel-desc {
  font-size:10px; line-height:1.8;
  color:rgba(107,155,192,0.45);
  letter-spacing:0.04em; margin-bottom:24px;
}
.ob-field { margin-bottom:18px; }
.ob-field-label {
  font-size:7px; letter-spacing:0.25em; text-transform:uppercase;
  color:rgba(107,155,192,0.4); margin-bottom:8px; display:block;
}
.ob-input {
  width:100%;
  background:rgba(107,155,192,0.04);
  border:1px solid rgba(107,155,192,0.12);
  padding:12px 14px;
  color:#edf2f6; font-family:'JetBrains Mono',monospace;
  font-size:13px; letter-spacing:0.02em;
  transition:border-color 150ms;
}
.ob-input:focus { border-color:rgba(107,155,192,0.35); }
.ob-input-amount {
  font-size:32px; font-weight:400;
  letter-spacing:-0.04em; text-align:center;
  padding:18px 14px 14px;
  caret-color:transparent;
}
.ob-input-hint {
  font-size:7px; letter-spacing:0.16em;
  color:rgba(107,155,192,0.22); margin-top:6px;
  text-align:center;
}
.ob-select {
  width:100%;
  background:rgba(107,155,192,0.04);
  border:1px solid rgba(107,155,192,0.12);
  padding:12px 14px;
  color:#edf2f6; font-family:'JetBrains Mono',monospace;
  font-size:12px; letter-spacing:0.02em;
  transition:border-color 150ms; cursor:pointer;
  appearance:none;
}
.ob-select:focus { border-color:rgba(107,155,192,0.35); }
.ob-type-toggle {
  display:flex; gap:0; margin-bottom:18px;
  border:1px solid rgba(107,155,192,0.12);
}
.ob-type-btn {
  flex:1; padding:10px;
  background:transparent; border:none;
  font-family:'JetBrains Mono',monospace;
  font-size:8px; letter-spacing:0.22em; text-transform:uppercase;
  color:rgba(107,155,192,0.35); transition:all 150ms;
}
.ob-type-btn.active-income  { background:rgba(70,231,169,0.08);  color:#46e7a9; }
.ob-type-btn.active-expense { background:rgba(255,127,159,0.08); color:#ff7f9f; }
.ob-actions {
  display:flex; gap:10px; margin-top:24px;
}
.ob-btn-primary {
  flex:1; padding:13px;
  background:rgba(107,155,192,0.10);
  border:1px solid rgba(107,155,192,0.30);
  color:#C2D0DC; font-family:'JetBrains Mono',monospace;
  font-size:8px; font-weight:400;
  letter-spacing:0.25em; text-transform:uppercase;
  transition:all 200ms; position:relative; overflow:hidden;
}
.ob-btn-primary:hover {
  background:rgba(107,155,192,0.18);
  border-color:rgba(107,155,192,0.5);
  color:#E4EBF0;
}
.ob-btn-primary:disabled {
  opacity:0.3; cursor:not-allowed;
}
.ob-btn-ghost {
  padding:13px 18px;
  background:transparent;
  border:1px solid rgba(107,155,192,0.08);
  color:rgba(107,155,192,0.3); font-family:'JetBrains Mono',monospace;
  font-size:8px; letter-spacing:0.18em; text-transform:uppercase;
  transition:all 150ms;
}
.ob-btn-ghost:hover { color:rgba(107,155,192,0.6); border-color:rgba(107,155,192,0.18); }
.ob-ready-check {
  width:52px; height:52px; border-radius:50%;
  border:1px solid rgba(70,231,169,0.3);
  display:flex; align-items:center; justify-content:center;
  margin:0 auto 20px;
  background:rgba(70,231,169,0.05);
}
.ob-ready-check svg {
  width:22px; height:22px;
  stroke:#46e7a9; stroke-width:1.5;
  fill:none; stroke-linecap:round; stroke-linejoin:round;
}
.ob-summary {
  background:rgba(107,155,192,0.03);
  border:1px solid rgba(107,155,192,0.08);
  padding:16px;
  margin-bottom:20px;
}
.ob-summary-row {
  display:flex; justify-content:space-between; align-items:baseline;
  padding:5px 0;
  border-bottom:1px solid rgba(107,155,192,0.05);
}
.ob-summary-row:last-child { border-bottom:none; }
.ob-summary-key {
  font-size:7.5px; letter-spacing:0.18em;
  color:rgba(107,155,192,0.38);
}
.ob-summary-val {
  font-size:11px; font-weight:500;
  color:#C2D0DC; letter-spacing:-0.01em;
}
`;

function fmt(n) {
  return new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD",
    minimumFractionDigits:2, maximumFractionDigits:2,
  }).format(typeof n === "number" && Number.isFinite(n) ? n : 0);
}

function parseAmount(digits) {
  const cents = parseInt(digits || "0", 10);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

// ── Step 1: Capital Position ──────────────────────────────────────────────────
function StepCapital({ onNext }) {
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
      <div className="ob-panel-code">INIT-01 · CAPITAL POSITION</div>
      <div className="ob-panel-title">Set Your Base Capital</div>
      <div className="ob-panel-desc">
        This is your current liquid cash on hand — the starting point Vault
        uses to calculate your runway, net position, and available capital.
        Enter what you have available right now.
      </div>

      <div className="ob-field">
        <input
          autoFocus
          readOnly
          className="ob-input ob-input-amount"
          value={digits.length === 0 ? "$0.00" : fmt(amount)}
          onKeyDown={handleKey}
          style={{
            color: amount === 0
              ? "rgba(107,155,192,0.22)"
              : "rgba(220,235,250,0.92)",
          }}
        />
        <div className="ob-input-hint">Type digits · Backspace to clear · Enter to continue</div>
      </div>

      <div className="ob-actions">
        <button
          className="ob-btn-primary"
          disabled={!valid}
          onClick={() => onNext(amount)}
        >
          Establish Position →
        </button>
      </div>
    </>
  );
}

// ── Step 2: First Transaction ─────────────────────────────────────────────────
function StepFirstTx({ onNext, onSkip }) {
  const [type,    setType]    = useState("expense");
  const [digits,  setDigits]  = useState("");
  const [cat,     setCat]     = useState("Operations");
  const [desc,    setDesc]    = useState("");
  const [date,    setDate]    = useState(new Date().toISOString().split("T")[0]);

  const amount = parseAmount(digits);
  const valid  = amount > 0;
  const cats   = type === "expense" ? EXPENSE_CATS : INCOME_CATS;

  // Reset category when type switches
  const switchType = t => {
    setType(t);
    setCat(t === "expense" ? EXPENSE_CATS[0] : INCOME_CATS[0]);
  };

  const handleKey = e => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      setDigits(d => (d + e.key).slice(0, 12));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setDigits(d => d.slice(0, -1));
    } else if (e.key === "Enter" && valid) {
      onNext({ type, amount, category:cat, description:desc, date,
               tags:"", recurring:false, recurringFreq:"monthly" });
    }
  };

  return (
    <>
      <div className="ob-panel-code">INIT-02 · FIRST ENTRY</div>
      <div className="ob-panel-title">Record Your First Entry</div>
      <div className="ob-panel-desc">
        Log a recent transaction to activate your ledger.
        This can be anything — a bill paid, revenue received, or a regular expense.
      </div>

      <div className="ob-type-toggle">
        {["expense","income"].map(t => (
          <button
            key={t}
            className={`ob-type-btn${type === t ? ` active-${t}` : ""}`}
            onClick={() => switchType(t)}
          >
            {t === "expense" ? "Burn" : "Income"}
          </button>
        ))}
      </div>

      <div className="ob-field">
        <label className="ob-field-label">Amount</label>
        <input
          autoFocus
          readOnly
          className="ob-input ob-input-amount"
          value={digits.length === 0 ? "$0.00" : fmt(amount)}
          onKeyDown={handleKey}
          style={{
            fontSize: 26,
            color: amount === 0
              ? "rgba(107,155,192,0.22)"
              : type === "income"
                ? "#46e7a9"
                : "#ff7f9f",
          }}
        />
      </div>

      <div className="ob-field">
        <label className="ob-field-label">Category</label>
        <select
          className="ob-select"
          value={cat}
          onChange={e => setCat(e.target.value)}
        >
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <div className="ob-field" style={{ flex:1 }}>
          <label className="ob-field-label">Description (optional)</label>
          <input
            className="ob-input"
            placeholder="Memo…"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => e.key === "Enter" && valid &&
              onNext({ type, amount, category:cat, description:desc, date,
                       tags:"", recurring:false, recurringFreq:"monthly" })}
          />
        </div>
        <div className="ob-field" style={{ flex:1 }}>
          <label className="ob-field-label">Date</label>
          <input
            type="date"
            className="ob-input"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ colorScheme:"dark" }}
          />
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn-ghost" onClick={onSkip}>
          Skip
        </button>
        <button
          className="ob-btn-primary"
          disabled={!valid}
          onClick={() => onNext({ type, amount, category:cat, description:desc,
                                  date, tags:"", recurring:false, recurringFreq:"monthly" })}
        >
          Record Entry →
        </button>
      </div>
    </>
  );
}

// ── Step 3: Ready ─────────────────────────────────────────────────────────────
function StepReady({ baseLiq, firstTx, onEnter }) {
  return (
    <>
      <div className="ob-panel-code">INIT-03 · VAULT ARMED</div>
      <div className="ob-ready-check">
        <svg viewBox="0 0 24 24">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div className="ob-panel-title" style={{ textAlign:"center", marginBottom:8 }}>
        Vault Is Ready
      </div>
      <div className="ob-panel-desc" style={{ textAlign:"center", marginBottom:20 }}>
        Your capital position has been established. Your command center is armed.
      </div>

      <div className="ob-summary">
        <div className="ob-summary-row">
          <span className="ob-summary-key">Base Capital</span>
          <span className="ob-summary-val" style={{ color:"#46e7a9" }}>{fmt(baseLiq)}</span>
        </div>
        {firstTx && (
          <>
            <div className="ob-summary-row">
              <span className="ob-summary-key">First Entry</span>
              <span className="ob-summary-val"
                style={{ color: firstTx.type === "income" ? "#46e7a9" : "#ff7f9f" }}>
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
            {fmt(baseLiq + (firstTx
              ? (firstTx.type === "income" ? firstTx.amount : -firstTx.amount)
              : 0))}
          </span>
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn-primary" onClick={onEnter}>
          Enter Vault →
        </button>
      </div>
    </>
  );
}

// ── Stepper Header ────────────────────────────────────────────────────────────
function Stepper({ current }) {
  return (
    <div className="ob-stepper">
      {STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "pending";
        return (
          <div key={s.id} className="ob-step" style={{ flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div className={`ob-step-dot ${state}`} />
            <span className={`ob-step-label ${state}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className="ob-step-connector" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function VaultOnboarding({ onComplete }) {
  const [step,    setStep]    = useState(0);
  const [baseLiq, setBaseLiq] = useState(0);
  const [firstTx, setFirstTx] = useState(null);

  const handleCapital = amount => {
    setBaseLiq(amount);
    setStep(1);
  };

  const handleFirstTx = tx => {
    setFirstTx(tx);
    setStep(2);
  };

  const handleSkip = () => {
    setFirstTx(null);
    setStep(2);
  };

  const handleEnter = () => {
    onComplete({ baseLiquidity: baseLiq, firstTx });
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ob-scene">
        <div className="ob-grid" />
        <div className="ob-vignette" />
        <div className="ob-frame" />
        <div className="ob-frame-inner" />
        <div className="ob-corner tl" />
        <div className="ob-corner tr" />
        <div className="ob-corner bl" />
        <div className="ob-corner br" />

        <div className="ob-center">
          <div className="ob-wordmark">
            <div className="ob-wordmark-title">VAULT</div>
            <div className="ob-wordmark-sub">Initial Configuration · Sequence {STEPS[step].code}</div>
          </div>

          <Stepper current={step} />

          <div className="ob-panel">
            {step === 0 && <StepCapital  onNext={handleCapital}  />}
            {step === 1 && <StepFirstTx  onNext={handleFirstTx} onSkip={handleSkip} />}
            {step === 2 && <StepReady    baseLiq={baseLiq} firstTx={firstTx} onEnter={handleEnter} />}
          </div>
        </div>
      </div>
    </>
  );
}
