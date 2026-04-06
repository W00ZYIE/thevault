import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Area, AreaChart, ReferenceDot,
  PieChart, Pie, Cell, Tooltip as PieTooltip,
} from "recharts";
import AuthView from "./components/AuthView.jsx";
import LandingPage from "./components/LandingPage.jsx";
import { supabase, hasSupabaseConfig } from "./lib/supabaseClient.js";
import VaultOnboarding from "./components/VaultOnboarding.jsx";
import { exportStatement } from "./components/VaultStatementExport";
import VaultExportButton from "./components/VaultStatementExport";
import { useTrialState, TrialExpiredWall, TrialBanner } from "./components/VaultTrial"
import VaultInsights from "./components/VaultInsights.jsx";
// VaultGoals replaced by inline VaultInvestments (Phase 3)
import VaultCommandPalette from "./components/VaultCommandPalette.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { useTheme } from "./lib/ThemeContext.jsx";
import "./styles/vault.css";
import VaultInvestments from "./components/VaultInvestments.jsx";
import TransactionDrawer from "./components/TransactionDrawer.jsx";

// Plaid imports
import { usePlaidAccounts } from "./lib/usePlaidAccounts.js";
import VaultBankConnect from "./components/VaultBankConnect.jsx";
import VaultConnectedAccounts from "./components/VaultConnectedAccounts.jsx";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS   = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const getToday    = () => new Date();
const getTodayStr = () => new Date().toISOString().split("T")[0];
const SEC_PER_MONTH = 30.4375 * 24 * 3600;

const DEFAULT_CATS = {
  income:  ["Salary","Business Revenue","Investment Returns","Dividends","Capital Gains","Partnership Distribution","Other Income"],
  expense: ["Operations","Payroll","Technology","Marketing","Travel","Utilities","Transportation","Insurance","Taxes","Tools","Other"],
};

const CURRENCIES = [
  { code:"USD", symbol:"$",   name:"US Dollar" },
];

// ─── Design System ─────────────────────────────────────────────────────────────
const LIGHT_T = {
  bg:          '#FAFAFA',
  bgSubtle:    '#F5F5F5',
  bgCard:      '#FFFFFF',
  sidebar:     '#FFFFFF',
  text1:       '#0A0A0A',
  text2:       '#3A3A3A',
  text3:       '#888888',
  text4:       '#BBBBBB',
  blue:        '#1B4FCC',
  blueDark:    '#1340A8',
  blueLight:   '#F0F4FF',
  blueFaint:   '#F7F9FF',
  gold:        '#B8891A',
  goldLight:   '#FBF6E8',
  green:       '#059669',
  greenLight:  '#F0FDF4',
  red:         '#DC2626',
  redLight:    '#FFF1F2',
  border:      'rgba(0,0,0,0.06)',
  borderMid:   'rgba(0,0,0,0.10)',
  shadow:      'none',
  shadowMd:    'none',
  shadowLg:    '0 8px 32px rgba(0,0,0,0.06)',
  radius:      '8px',
  radiusSm:    '4px',
  radiusLg:    '12px',
  font:        "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:        "'JetBrains Mono', monospace",
};
const DARK_T = {
  bg:          '#111111',
  bgSubtle:    '#161616',
  bgCard:      '#1A1A1A',
  sidebar:     '#111111',
  text1:       '#F0F0F0',
  text2:       '#909090',
  text3:       '#555555',
  text4:       '#333333',
  blue:        '#4D7FE8',
  blueDark:    '#3666CC',
  blueLight:   'rgba(77,127,232,0.10)',
  blueFaint:   'rgba(77,127,232,0.05)',
  gold:        '#D4A034',
  goldLight:   'rgba(212,160,52,0.10)',
  green:       '#10B981',
  greenLight:  'rgba(16,185,129,0.10)',
  red:         '#EF4444',
  redLight:    'rgba(239,68,68,0.10)',
  border:      'rgba(255,255,255,0.06)',
  borderMid:   'rgba(255,255,255,0.10)',
  shadow:      'none',
  shadowMd:    'none',
  shadowLg:    '0 8px 64px rgba(0,0,0,0.5)',
  radius:      '8px',
  radiusSm:    '4px',
  radiusLg:    '12px',
  font:        "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:        "'JetBrains Mono', monospace",
};
let T = { ...LIGHT_T };

// ─── Utilities ─────────────────────────────────────────────────────────────────
const parseDate    = s  => new Date(s + "T12:00:00");
const txMonth      = t  => parseDate(t.date).getMonth();
const txYear       = t  => parseDate(t.date).getFullYear();
const txDay        = t  => parseDate(t.date).getDate();
const daysInMonth  = (y, m) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m, 1).getDay();
const clampDay     = (y, m, d) => Math.min(Math.max(1, d), daysInMonth(y, m));
const precise      = n  => Number(Number(n).toFixed(2));

function recurringInstancesForMonth(tx, y, m) {
  if (!tx.recurring || !tx.recurringFreq) return [];
  const origin = parseDate(tx.date);
  const monthStart = new Date(y, m, 1, 12);
  const monthEnd   = new Date(y, m + 1, 0, 12);
  if (monthEnd < origin) return [];
  if (tx.recurringFreq === "monthly") {
    const isOriginMonth = origin.getFullYear() === y && origin.getMonth() === m;
    if (isOriginMonth) return [];
    const day  = clampDay(y, m, origin.getDate());
    const date = new Date(y, m, day, 12).toISOString().split("T")[0];
    return [{ ...tx, id: `${tx.id}_p_${y}-${String(m+1).padStart(2,"0")}`, date, isRecurringInstance: true, recurringParentId: tx.id }];
  }
  const instances = [];
  const cur = new Date(origin);
  while (cur < monthStart) cur.setDate(cur.getDate() + 7);
  while (cur <= monthEnd) {
    const date = cur.toISOString().split("T")[0];
    instances.push({ ...tx, id: `${tx.id}_p_${date}`, date, isRecurringInstance: true, recurringParentId: tx.id });
    cur.setDate(cur.getDate() + 7);
  }
  const originInMonth = origin >= monthStart && origin <= monthEnd;
  return originInMonth ? instances.filter(t => t.date !== tx.date) : instances;
}

function txsForMonth(allTxs, y, m) {
  const base = allTxs.filter(t => txYear(t) === y && txMonth(t) === m);
  const proj = allTxs.flatMap(t => recurringInstancesForMonth(t, y, m));
  return [...base, ...proj];
}

function makeFmt(code = "USD") {
  const info = CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
  const fmt = n =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2, maximumFractionDigits:2 })
      .format(typeof n === "number" && Number.isFinite(n) ? n : 0);
  const fSign = n => {
    const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return (v >= 0 ? "+" : "−") + fmt(Math.abs(v));
  };
  return { fmt, fSign, symbol: "$", code: "USD" };
}

function formatRunway(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const months = seconds / SEC_PER_MONTH;
  const days   = Math.max(0, Math.floor(seconds / 86400));
  const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits:1, maximumFractionDigits:1 });
  const f0 = new Intl.NumberFormat("en-US", { maximumFractionDigits:0 });
  const sub = `${f0.format(days)} days at current burn`;
  if (months >= 24) return { primary: `${f1.format(months/12)}y`, secondary: sub };
  if (months >= 1)  return { primary: `${f1.format(months)}mo`,  secondary: sub };
  if (days >= 1)    return { primary: `${f0.format(days)}d`,     secondary: "At current burn" };
  return { primary: `${Math.max(1, Math.floor(seconds/3600))}h`, secondary: "At current burn" };
}

// ─── Calendar Day Formatter ────────────────────────────────────────────────────
function fmtCalDay(amount, currencyCode) {
  const abs = Math.abs(amount);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const number = hasCents
    ? new Intl.NumberFormat("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 }).format(abs)
    : new Intl.NumberFormat("en-US", { minimumFractionDigits:0, maximumFractionDigits:0 }).format(abs);
  const sign = amount >= 0 ? "+" : "−";
  return `${sign}$${number}`;
}

// ─── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = "vault:v3";
const CLOUD_TABLE = "profiles_data";

function normalizePayload(d) {
  return {
    txs: (Array.isArray(d?.txs) ? d.txs : []).filter(Boolean)
      .map(t => ({ ...t, amount: precise(t.amount) }))
      .filter(t => Number.isFinite(t.amount)),
    baseLiquidity: Number.isFinite(parseFloat(d?.baseLiquidity)) ? precise(d.baseLiquidity) : 0,
    budgets: d?.budgets && typeof d.budgets === "object" ? d.budgets : {},
    customCats: d?.customCats && typeof d.customCats === "object" ? d.customCats : { income:[], expense:[] },
    currency: "USD",
  };
}

function emptyPayload() {
  return { txs:[], baseLiquidity:0, budgets:{}, customCats:{ income:[], expense:[] }, currency:"USD" };
}

function hasAnyData(p) {
  return p.baseLiquidity !== 0 || p.txs.length > 0 || Object.keys(p.budgets||{}).length > 0;
}

async function loadLocalData() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw) return normalizePayload(JSON.parse(raw));
  } catch {}
  return emptyPayload();
}

async function saveLocalData(payload) {
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (err) {
    console.warn("[Vault] localStorage save failed:", err);
  }
}

async function loadCloudData(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from(CLOUD_TABLE).select("payload").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data?.payload) return null;
  return normalizePayload(data.payload);
}

async function saveCloudData(userId, payload) {
  if (!supabase || !userId) throw new Error("Cloud sync unavailable.");
  const { error } = await supabase.from(CLOUD_TABLE).upsert({ user_id:userId, payload, updated_at:new Date().toISOString() }, { onConflict:"user_id" });
  if (error) throw error;
}

// ─── Mock Data Generator ───────────────────────────────────────────────────────
function generateMockData() {
  const txs = [];
  let id = 1;
  const now = new Date();

  // 12 months back from current month
  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();

    const rDay = (min = 1) => Math.floor(Math.random() * (dim - min + 1)) + min;
    const rAmt = (lo, hi) => precise(lo + Math.random() * (hi - lo));
    const pad = n => String(n).padStart(2, "0");
    const dateStr = (day) => `${y}-${pad(m + 1)}-${pad(day)}`;

    // Monthly salary (income)
    txs.push({ id: String(id++), type:"income", amount: rAmt(8500, 12000), category:"Salary", date: dateStr(1), description:"Monthly salary deposit", tags:"salary,recurring", recurring:false, recurringFreq:"monthly" });

    // Occasional investment income
    if (Math.random() > 0.4) {
      txs.push({ id: String(id++), type:"income", amount: rAmt(300, 2500), category:"Investment Returns", date: dateStr(rDay(5)), description:"Portfolio dividend / return", tags:"investments", recurring:false, recurringFreq:"monthly" });
    }

    // Rent / mortgage (large expense early in month)
    txs.push({ id: String(id++), type:"expense", amount: rAmt(1800, 2400), category:"Operations", date: dateStr(rDay(1)), description:"Rent / mortgage payment", tags:"housing,fixed", recurring:false, recurringFreq:"monthly" });

    // Payroll (if business)
    if (Math.random() > 0.5) {
      txs.push({ id: String(id++), type:"expense", amount: rAmt(2000, 5000), category:"Payroll", date: dateStr(rDay()), description:"Staff payroll run", tags:"payroll,staff", recurring:false, recurringFreq:"monthly" });
    }

    // Tech subscriptions
    txs.push({ id: String(id++), type:"expense", amount: rAmt(80, 350), category:"Technology", date: dateStr(rDay()), description:"SaaS subscriptions", tags:"software,saas", recurring:false, recurringFreq:"monthly" });

    // Utilities
    txs.push({ id: String(id++), type:"expense", amount: rAmt(120, 280), category:"Utilities", date: dateStr(rDay()), description:"Electricity & internet", tags:"utilities", recurring:false, recurringFreq:"monthly" });

    // Marketing
    if (Math.random() > 0.3) {
      txs.push({ id: String(id++), type:"expense", amount: rAmt(200, 1200), category:"Marketing", date: dateStr(rDay()), description:"Digital ads & content", tags:"marketing,ads", recurring:false, recurringFreq:"monthly" });
    }

    // Travel
    if (Math.random() > 0.55) {
      txs.push({ id: String(id++), type:"expense", amount: rAmt(150, 900), category:"Travel", date: dateStr(rDay()), description:"Business travel expenses", tags:"travel,business", recurring:false, recurringFreq:"monthly" });
    }

    // Insurance
    txs.push({ id: String(id++), type:"expense", amount: rAmt(180, 320), category:"Insurance", date: dateStr(rDay()), description:"Health & liability insurance", tags:"insurance,fixed", recurring:false, recurringFreq:"monthly" });

    // Taxes (quarterly spike)
    if ([2, 5, 8, 11].includes(m)) {
      txs.push({ id: String(id++), type:"expense", amount: rAmt(800, 2200), category:"Taxes", date: dateStr(rDay(10)), description:"Quarterly estimated taxes", tags:"taxes,quarterly", recurring:false, recurringFreq:"monthly" });
    }

    // Tools
    if (Math.random() > 0.6) {
      txs.push({ id: String(id++), type:"expense", amount: rAmt(40, 200), category:"Tools", date: dateStr(rDay()), description:"Equipment & tools", tags:"tools,equipment", recurring:false, recurringFreq:"monthly" });
    }

    // Transportation
    txs.push({ id: String(id++), type:"expense", amount: rAmt(60, 250), category:"Transportation", date: dateStr(rDay()), description:"Gas & commuting", tags:"transport", recurring:false, recurringFreq:"monthly" });
  }

  return {
    txs,
    baseLiquidity: 15000,
    budgets: {
      Operations: 2500,
      Payroll: 5000,
      Marketing: 1000,
      Technology: 400,
      Travel: 800,
      Utilities: 300,
      Insurance: 400,
      Taxes: 2500,
    },
    customCats: { income:[], expense:[] },
    currency: "USD",
  };
}

// ─── Form helpers ──────────────────────────────────────────────────────────────
function amountToCentDigits(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const cents = Math.round(n * 100);
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return String(cents);
}

const blankForm = cats => ({
  type:"expense", amount:"", category:cats?.expense?.[0]||"Operations",
  date:getTodayStr(), description:"", tags:"", recurring:false, recurringFreq:"monthly",
});
const formFromTx = tx => ({
  type:tx.type, amount:amountToCentDigits(tx.amount), category:tx.category,
  date:tx.date, description:tx.description||"", tags:tx.tags||"",
  recurring:tx.recurring||false, recurringFreq:tx.recurringFreq||"monthly",
});

// ─── Toast hook ────────────────────────────────────────────────────────────────
let _toastId = 0;
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((text, type = 'ok') => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);
  const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, add, remove };
}

// ─── Intelligence System ───────────────────────────────────────────────────────
function buildIntelligenceMessages(monthIncome, monthExpenses, liquidity, runwayDisplay, monthTxs, budgetAlerts) {
  const msgs = [];
  if (monthIncome === 0 && monthTxs.length > 0)
    msgs.push({ text: "No income recorded this cycle", color: T.gold, severity: "warn" });
  if (monthExpenses > monthIncome * 1.25 && monthIncome > 0)
    msgs.push({ text: "Spending exceeds income by 25%+", color: T.red, severity: "critical" });
  if (runwayDisplay && runwayDisplay.primary?.includes("d") && parseInt(runwayDisplay.primary) < 90)
    msgs.push({ text: "Runway critically low", color: T.red, severity: "critical" });
  if (budgetAlerts.some(a => a.over))
    msgs.push({ text: `Budget exceeded: ${budgetAlerts.filter(a=>a.over).map(a=>a.cat).join(", ")}`, color: T.red, severity: "critical" });
  if (liquidity < 0)
    msgs.push({ text: "Negative liquidity position", color: T.red, severity: "critical" });
  if (msgs.length === 0 && monthIncome > 0)
    msgs.push({ text: "All systems nominal", color: T.green, severity: "ok" });
  return msgs;
}

// ─── Anomaly detection ─────────────────────────────────────────────────────────
function detectAnomalies(chartData) {
  if (chartData.length < 6) return [];
  const anomalies = [];
  const expValues = chartData.map(d => d.Expenses).filter(v => v > 0);
  if (expValues.length < 2) return anomalies;
  const mean = expValues.reduce((a,b) => a+b, 0) / expValues.length;
  const std  = Math.sqrt(expValues.map(v => Math.pow(v - mean, 2)).reduce((a,b) => a+b, 0) / expValues.length);
  chartData.forEach((d, i) => {
    if (d.Expenses > mean + 1.5 * std) anomalies.push({ index:i, name:d.name, type:"spike", value:d.Expenses });
    if (d.Income === 0 && i > 0) anomalies.push({ index:i, name:d.name, type:"no-income" });
  });
  return anomalies;
}

// ─── Date Range Filter ────────────────────────────────────────────────────────
function DateRangeFilter({ from, to, onFrom, onTo, onClear }) {
  const [focusedField, setFocusedField] = useState(null);
  const inputStyle = field => ({
    background: T.bgCard,
    border: `1.5px solid ${focusedField === field ? T.blue : T.border}`,
    padding: "8px 10px",
    color: T.text2,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10.5,
    letterSpacing: "0.04em",
    colorScheme: T === DARK_T ? "dark" : "light",
    transition: "border-color 150ms",
    cursor: "pointer",
    borderRadius: "5px",
    outline: "none",
  });

  return (
    <div className="v-date-range">
      <input
        type="date"
        value={from || ""}
        onChange={e => onFrom(e.target.value)}
        style={inputStyle("from")}
        onFocus={() => setFocusedField("from")}
        onBlur={() => setFocusedField(null)}
      />
      <span style={{ color: T.text3, fontSize: 11, fontFamily:"'JetBrains Mono',monospace" }}>—</span>
      <input
        type="date"
        value={to || ""}
        onChange={e => onTo(e.target.value)}
        style={inputStyle("to")}
        onFocus={() => setFocusedField("to")}
        onBlur={() => setFocusedField(null)}
      />
      {(from || to) && (
        <>
          <button
            onClick={onClear}
            className="v-btn-secondary"
            style={{ padding:"8px 10px", fontSize:8, letterSpacing:"0.18em" }}
          >
            CLEAR
          </button>
          <span style={{ fontSize:7.5, color:T.gold, letterSpacing:"0.18em", fontWeight:400, fontFamily:"'JetBrains Mono',monospace" }}>
            FILTERED
          </span>
        </>
      )}
    </div>
  );
}

// ─── Chart Tooltip ─────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, fmt, fSign, anomalies }) {
  if (!active || !payload?.length) return null;
  const anom = anomalies?.find(a => a.name === label);
  return (
    <div className="v-tip">
      <div style={{ color:T.text2, marginBottom:8, fontSize:8, letterSpacing:"0.18em" }}>{label}</div>
      {anom && (
        <div style={{ fontSize:7.5, color:T.red, letterSpacing:"0.12em", marginBottom:8, borderLeft:`2px solid ${T.red}`, paddingLeft:6 }}>
          {anom.type === "spike" ? "SPENDING SPIKE DETECTED" : "NO INCOME RECORDED"}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:20, marginBottom:3 }}>
          <span style={{ color:T.text2 }}>{p.name}</span>
          <span style={{ fontWeight:500, color:p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div style={{ borderTop:`1px solid rgba(0,0,0,0.06)`, marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:T.text3 }}>Net</span>
          <span style={{ fontWeight:500, color:payload[0].value-payload[1].value>=0 ? T.green : T.red }}>
            {fSign(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Budget Bar ────────────────────────────────────────────────────────────────
function BudgetBar({ cat, spent, limit, fmt }) {
  const pct  = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const over = spent > limit;
  const warn = pct >= 80 && !over;
  const color = over ? T.red : warn ? T.gold : T.green;
  return (
    <div className="v-budget-bar">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <span style={{ fontSize:11.5, color:T.text2 }}>{cat}</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:10.5, fontFamily:"'JetBrains Mono',monospace", color:T.text2 }}>{fmt(spent)}</span>
          <span style={{ fontSize:9, color:T.text3 }}>/</span>
          <span style={{ fontSize:10.5, fontFamily:"'JetBrains Mono',monospace", color:T.text2 }}>{fmt(limit)}</span>
          {over && <span className="v-anomaly-badge">OVER</span>}
          {warn && <span style={{ fontSize:7, letterSpacing:"0.18em", color:T.gold, fontWeight:400, fontFamily:"'JetBrains Mono',monospace", border:`1px solid rgba(226,201,131,0.2)`, padding:"2px 5px" }}>ALERT</span>}
        </div>
      </div>
      <div className="v-budget-bar-track">
        <div className="v-budget-bar-fill" style={{ width:`${pct}%`, background:color, opacity:0.7 }} />
      </div>
    </div>
  );
}

// ─── Transaction Feed ──────────────────────────────────────────────────────────
// ─── Transaction Feed (Apple Wallet style) ─────────────────────────────────
function TxFeed({ txs, onEdit, onDelete, fmt }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!txs.length) return <div className="v-empty">No records found</div>;

  const grouped = {};
  txs.forEach(tx => {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  });
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function dayLabel(dateStr) {
    const d = parseDate(dateStr);
    const today     = new Date(); today.setHours(12,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const target    = new Date(d);    target.setHours(12,0,0,0);
    if (target.getTime() === today.getTime())     return "Today";
    if (target.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  }

  return (
    <div className="ldg-feed">
      {dates.map(date => {
        const dayTxs = grouped[date];
        const dayInc = dayTxs.filter(t=>t.type==="income"&&!t.transfer).reduce((s,t)=>s+t.amount,0);
        const dayExp = dayTxs.filter(t=>t.type==="expense"&&!t.transfer).reduce((s,t)=>s+t.amount,0);
        const dayNet = dayInc - dayExp;
        return (
          <div key={date} className="ldg-group">
            <div className="ldg-date-header">
              <span className="ldg-date-label">{dayLabel(date)}</span>
              <span className="ldg-date-net" style={{ color: dayNet >= 0 ? T.green : T.red }}>
                {dayNet >= 0 ? "+" : "−"}{fmt(Math.abs(dayNet))}
              </span>
            </div>
            {dayTxs.map(tx => {
              const isInc      = tx.type === "income";
              const isTransfer = tx.transfer === true;
              const isExpanded = expandedId === tx.id;
              const tags       = tx.tags ? tx.tags.split(",").map(t=>t.trim()).filter(Boolean) : [];
              const avatarChar = isTransfer ? "⇄" : (tx.category || "?").charAt(0).toUpperCase();
              const amtColor   = isTransfer ? T.text3 : isInc ? T.green : T.red;
              const avatarBg   = isTransfer ? T.bgSubtle : isInc ? T.greenLight : T.redLight;
              const avatarClr  = isTransfer ? T.text3   : isInc ? T.green      : T.red;
              return (
                <div key={tx.id} className={`ldg-row${isExpanded ? " expanded" : ""}`}
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}>
                  <div className="ldg-row-main">
                    <div className="ldg-avatar" style={{ background: avatarBg, color: avatarClr }}>
                      {avatarChar}
                    </div>
                    <div className="ldg-meta">
                      <span className="ldg-category">{isTransfer ? "Transfer" : tx.category}</span>
                      {tx.description && <span className="ldg-desc">{tx.description}</span>}
                    </div>
                    <div className="ldg-amount" style={{ color: amtColor }}>
                      {isTransfer ? "" : isInc ? "+" : "−"}{fmt(tx.amount)}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="ldg-expand-panel" onClick={e => e.stopPropagation()}>
                      {tags.length > 0 && (
                        <div className="ldg-expand-tags">
                          {tags.map((tag, i) => <span key={i} className="v-tag">{tag}</span>)}
                        </div>
                      )}
                      {tx.recurring && !tx.isRecurringInstance && (
                        <span className="ldg-rec-badge">REC</span>
                      )}
                      <div className="ldg-expand-actions">
                        {!tx.isRecurringInstance && (
                          <button className="v-btn-secondary ldg-action-btn"
                            onClick={() => { setExpandedId(null); onEdit(tx); }}>Edit</button>
                        )}
                        <button className="v-btn-ghost ldg-delete-btn"
                          onClick={() => { setExpandedId(null); onDelete(tx); }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ onClose, width=420, children }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="v-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="v-modal" style={{ width }}>{children}</div>
    </div>
  );
}

// ─── Recurring Scope Modal ─────────────────────────────────────────────────────
function RecurringScopeModal({ action, tx, onThis, onAll, onClose }) {
  const label = parseDate(tx.date).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  return (
    <Modal onClose={onClose} width={380}>
      <div className="v-label" style={{ marginBottom:4 }}>Recurring Series</div>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>{action==="delete"?"Delete":"Edit"} — scope</div>
      <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:22 }}>
        This entry belongs to a recurring series. Choose the scope of change.
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {[
          { fn:onThis, title:"This occurrence only", sub:`Affects only ${label}` },
          { fn:onAll,  title:"All future entries",   sub:"Modifies the full series" },
        ].map(({ fn, title, sub }) => (
          <button key={title} onClick={fn} className="v-scope-btn">
            <div style={{ fontWeight:600, marginBottom:3 }}>{title}</div>
            <div style={{ fontSize:10.5, color:T.text2 }}>{sub}</div>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="v-btn-secondary" style={{ width:"100%", marginTop:12, padding:"10px" }}>Cancel</button>
    </Modal>
  );
}

// ─── Settings Card ─────────────────────────────────────────────────────────────
function SettingsCard({ title, desc, children }) {
  return (
    <div className="v-settings-card">
      <div className="v-label" style={{ marginBottom:5 }}>{title}</div>
      <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:20 }}>{desc}</div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>{children}</div>
    </div>
  );
}

// ─── Trend Pill ────────────────────────────────────────────────────────────────
function TrendPill({ pct, invert = false }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const isGood  = invert ? pct <= 0 : pct >= 0;
  const color   = isGood ? T.green : T.red;
  const bg      = isGood ? T.greenLight : T.redLight;
  const border  = isGood ? "rgba(0,184,118,0.22)" : "rgba(229,57,53,0.22)";
  const arrow   = pct > 0.05 ? "↑" : pct < -0.05 ? "↓" : "→";
  return (
    <span style={{
      display:"inline-flex", alignItems:"center",
      fontFamily:"'JetBrains Mono',monospace",
      fontSize:9, fontWeight:600,
      color, background:bg,
      padding:"2px 7px", borderRadius:4,
      letterSpacing:"0.02em", flexShrink:0,
      border:`1px solid ${border}`,
    }}>
      {arrow}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── Health Ring ───────────────────────────────────────────────────────────────
function HealthRing({ score, onInfoClick }) {
  const color  = score >= 70 ? T.green : score >= 45 ? T.gold : T.red;
  const label  = score >= 70 ? "Strong" : score >= 45 ? "Stable" : "At Risk";
  const r = 30, circ = 2 * Math.PI * r, filled = (score / 100) * circ;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ position:"relative", width:76, height:76, flexShrink:0 }}>
        <svg width={76} height={76} style={{ transform:"rotate(-90deg)", display:"block" }}>
          <circle cx={38} cy={38} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={6} />
          <circle cx={38} cy={38} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
            style={{ transition:"stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)" }} />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:17, fontWeight:500, color, lineHeight:1 }}>{score}</span>
        </div>
      </div>
      <div>
        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:T.text3, marginBottom:5 }}>Health Score</div>
        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:700, color, letterSpacing:"-0.01em" }}>{label}</div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text4, marginTop:3 }}>{score} / 100</div>
        {onInfoClick && (
          <button onClick={onInfoClick}
            style={{ background:"none", border:"none", color:T.text3, fontSize:10, cursor:"pointer", padding:0, marginTop:4, textDecoration:"underline", fontFamily:"'Inter',sans-serif" }}>
            How is this calculated?
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data = [], color = '#1B4FCC', height = 40, width = 80, fmt }) {
  const [hovered, setHovered] = useState(null);
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 3;
  const w = width, h = height;
  const coords = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: h - pad - ((v - min) / range) * (h - pad * 2),
    v,
  }));
  const pts = coords.map(c => `${c.x},${c.y}`).join(' ');

  const handleMouseMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.round((mx / w) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHovered({ ...coords[clamped], idx: clamped });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg width={w} height={h} style={{ display:'block', overflow:'visible', cursor:'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        {/* Last point dot (when not hovering) */}
        {!hovered && (() => {
          const last = coords[coords.length - 1];
          return <circle cx={last.x} cy={last.y} r={2.5} fill={color} />;
        })()}
        {/* Hover marker */}
        {hovered && (
          <circle cx={hovered.x} cy={hovered.y} r={3} fill={color} opacity={1} />
        )}
      </svg>
      {hovered && (
        <div style={{
          position: 'absolute', bottom: h + 6, left: Math.max(0, hovered.x - 28),
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: '3px 7px', pointerEvents: 'none',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: T.text1,
          whiteSpace: 'nowrap', boxShadow: T.shadowSm,
          zIndex: 10,
        }}>
          {fmt ? fmt(hovered.v) : hovered.v}
        </div>
      )}
    </div>
  );
}

// ─── Grade helper ──────────────────────────────────────────────────────────────
function getGrade(type, value) {
  if (value === null || value === undefined) return { grade:'—', color:'#9CA3AF', bg:'#F8FAFC', border:'rgba(0,0,0,0.08)', tip:'No data yet' };
  const grades = {
    incomeGrowth: [
      { check: v => v >= 10,  grade:'A+', color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'Income growing strongly' },
      { check: v => v >= 3,   grade:'A',  color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'Income trending up' },
      { check: v => v >= -3,  grade:'B',  color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.20)', tip:'Income holding steady' },
      { check: v => v >= -10, grade:'C',  color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.20)', tip:'Income slightly declining' },
      { check: () => true,    grade:'D',  color:'#DC2626', bg:'#FFF1F2', border:'rgba(220,38,38,0.20)', tip:'Income falling — investigate causes' },
    ],
    spendControl: [
      { check: v => v <= -5,  grade:'A+', color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'Expenses dropping — excellent discipline' },
      { check: v => v <= 5,   grade:'A',  color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'Expenses stable' },
      { check: v => v <= 15,  grade:'B',  color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.20)', tip:'Minor spend increase' },
      { check: v => v <= 25,  grade:'C',  color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.20)', tip:'Spend accelerating — review categories' },
      { check: () => true,    grade:'D',  color:'#DC2626', bg:'#FFF1F2', border:'rgba(220,38,38,0.20)', tip:'Spend surge — immediate review needed' },
    ],
    savingsRate: [
      { check: v => v >= 25,  grade:'A+', color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'Excellent — saving >$1 of every $4' },
      { check: v => v >= 15,  grade:'A',  color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'Strong savings discipline' },
      { check: v => v >= 5,   grade:'B',  color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.20)', tip:'Room to improve — target 15%+' },
      { check: v => v >= 0,   grade:'C',  color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.20)', tip:'Barely breaking even this month' },
      { check: () => true,    grade:'F',  color:'#DC2626', bg:'#FFF1F2', border:'rgba(220,38,38,0.20)', tip:'Spending more than earning — critical' },
    ],
    runway: [
      { check: v => v >= 365, grade:'A+', color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'12+ months — highly secure position' },
      { check: v => v >= 180, grade:'A',  color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'6–12 months — healthy buffer' },
      { check: v => v >= 90,  grade:'B',  color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.20)', tip:'3–6 months — watch spending' },
      { check: v => v >= 30,  grade:'C',  color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.20)', tip:'1–3 months — reduce burn urgently' },
      { check: () => true,    grade:'F',  color:'#DC2626', bg:'#FFF1F2', border:'rgba(220,38,38,0.20)', tip:'Under 30 days — critical action needed' },
    ],
    budgetAdherence: [
      { check: v => v === 0,  grade:'A+', color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.20)', tip:'All budgets under control' },
      { check: v => v === 1,  grade:'B',  color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.20)', tip:'1 category needs attention' },
      { check: v => v <= 3,   grade:'C',  color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.20)', tip:'Multiple categories over budget' },
      { check: () => true,    grade:'D',  color:'#DC2626', bg:'#FFF1F2', border:'rgba(220,38,38,0.20)', tip:'Budget discipline breakdown' },
    ],
  };
  const list = grades[type] || [];
  return list.find(g => g.check(value)) ?? list[list.length - 1];
}

// ─── Priority actions ──────────────────────────────────────────────────────────
function getPriorityActions({ monthIncome, monthExpenses, savingsRate, runwayDays, catBreakdown, budgetAlerts, momExpensePct, fmt }) {
  const actions = [];
  // 1. No income recorded
  if (monthIncome === 0) {
    actions.push({ icon:'📥', text:'Record your income to unlock savings rate and runway metrics', impact: null, type:'info' });
  }
  // 2. Runway critical
  if (runwayDays !== null && runwayDays < 90 && monthExpenses > 0) {
    const topCat = catBreakdown[0];
    if (topCat) {
      const cut15 = topCat[1] * 0.15;
      const daysAdded = monthExpenses > 0 ? Math.round((cut15 / monthExpenses) * 30) : 0;
      actions.push({ icon:'⚠️', text:`Cut ${topCat[0]} by 15% (${fmt(cut15)}/mo) → adds ${daysAdded} days of runway`, impact: fmt(cut15), type:'warn' });
    }
  }
  // 3. Top category >35% of spend
  if (catBreakdown.length > 0 && monthExpenses > 0) {
    const [cat, amt] = catBreakdown[0];
    const pct = (amt / monthExpenses) * 100;
    if (pct > 35) {
      const target = Math.round(monthExpenses * 0.3);
      actions.push({ icon:'🎯', text:`${cat} is ${pct.toFixed(0)}% of spend — consider capping at ${fmt(target)}/mo`, impact: fmt(amt - target), type:'warn' });
    }
  }
  // 4. Savings rate low
  if (savingsRate !== null && savingsRate < 10 && monthIncome > 0) {
    const targetSave = monthIncome * 0.15;
    const needToCut = monthExpenses - (monthIncome - targetSave);
    if (needToCut > 0) {
      actions.push({ icon:'💡', text:`Reduce monthly spend by ${fmt(needToCut)} to reach 15% savings rate`, impact: fmt(needToCut), type:'tip' });
    }
  }
  // 5. Budget alerts
  const overBudgetCats = budgetAlerts.filter(a => a.over);
  if (overBudgetCats.length > 0) {
    actions.push({ icon:'⚡', text:`${overBudgetCats[0].cat} exceeded budget by ${fmt(overBudgetCats[0].spent - overBudgetCats[0].limit)} — review transactions`, impact: null, type:'alert' });
  }
  // 6. Spend acceleration
  if (momExpensePct !== null && momExpensePct > 15 && catBreakdown.length > 0) {
    const increase = monthExpenses - (monthExpenses / (1 + momExpensePct / 100));
    actions.push({ icon:'📊', text:`Spend up ${momExpensePct.toFixed(0)}% MoM (+${fmt(increase)}) — identify what changed`, impact: null, type:'info' });
  }
  // Default if nothing notable
  if (actions.length === 0) {
    actions.push({ icon:'✅', text:'Finances look healthy — keep tracking to maintain this momentum', impact: null, type:'good' });
  }
  return actions.slice(0, 3);
}

// ─── Toast Stack ───────────────────────────────────────────────────────────────
function ToastStack({ toasts = [], remove }) {
  if (!toasts.length) return null;
  const colors = { err: '#DC2626', warn: '#B8891A', info: '#3A3A3A', ok: '#1B4FCC' };
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, display:'flex', flexDirection:'column', gap:8, pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          padding:'10px 16px', background: colors[t.type] || colors.ok,
          color:'#fff', borderRadius:8, fontSize:13, lineHeight:1.4,
          fontFamily:"'Inter',sans-serif", cursor:'pointer',
          boxShadow:'0 4px 16px rgba(0,0,0,0.18)', maxWidth:320, pointerEvents:'all',
          animation:'toastIn 0.2s ease',
        }}>
          {t.text}
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ─── Animated Number Hook (Phase 2) ──────────────────────────────────────────
function useAnimatedNumber(value, duration = 600) {
  const [displayed, setDisplayed] = useState(value);
  const [animating, setAnimating] = useState(false);
  const prevRef = useRef(value);
  const rafRef  = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to   = value;
    if (from === to) return;
    prevRef.current = to;

    const start = performance.now();
    setAnimating(true);

    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        setAnimating(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return { displayed, animating };
}

// ─── New Transaction View (Phase 1) ───────────────────────────────────────────
function NewTransactionView({ cats, form, setForm, onCommit, onCancel, editId, fmt, amountDisplay, theme }) {
  const isIncome  = form.type === "income";
  const amountVal = parseInt(form.amount || "0", 10);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      background: T.bg,
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter', sans-serif",
      animation: "ntv-in 200ms cubic-bezier(0.16,1,0.3,1) both",
    }}>
      <style>{`
        @keyframes ntv-in {
          from { opacity:0; transform: translateY(12px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .ntv-type-btn {
          flex:1; padding:10px 0; border:1px solid ${T.border};
          background: none; color: ${T.text3};
          font-family:'Inter',sans-serif; font-size:11px;
          font-weight:600; letter-spacing:0.08em; text-transform:uppercase;
          cursor:pointer; transition: all 150ms ease;
        }
        .ntv-type-btn.active-income {
          background: ${T.greenLight}; color: ${T.green};
          border-color: ${T.green}; z-index:1;
        }
        .ntv-type-btn.active-expense {
          background: ${T.redLight}; color: ${T.red};
          border-color: ${T.red}; z-index:1;
        }
        .ntv-type-btn:first-child { border-radius: 6px 0 0 6px; }
        .ntv-type-btn:last-child  { border-radius: 0 6px 6px 0; margin-left:-1px; }
        .ntv-field-label {
          display:block; font-size:10px; font-weight:500;
          letter-spacing:0.06em; text-transform:uppercase;
          color:${T.text4}; margin-bottom:7px;
        }
        .ntv-input {
          width:100%; background:${T.bgSubtle};
          border:1.5px solid ${T.border};
          border-radius:6px; padding:10px 13px;
          color:${T.text1}; font-size:13px;
          font-family:inherit; outline:none;
          transition:border-color 150ms;
          box-sizing:border-box;
        }
        .ntv-input:focus { border-color:${T.borderMid}; background:${T.bgCard}; }
        .ntv-select { appearance:none; cursor:pointer; }
        .ntv-amount-display {
          width:100%; background:${T.bgSubtle};
          border:1.5px solid transparent;
          border-radius:6px; padding:22px 16px 18px;
          font-family:'JetBrains Mono',monospace;
          font-size:52px; font-weight:400; letter-spacing:-0.05em;
          text-align:center; outline:none; box-sizing:border-box;
          caret-color:transparent; transition:border-color 150ms, color 150ms;
          display:block;
        }
        .ntv-amount-display:focus { background:${T.bgCard}; border-color:${T.borderMid}; }
        .ntv-hint {
          font-family:'JetBrains Mono',monospace;
          font-size:9px; letter-spacing:0.08em;
          text-transform:uppercase; color:${T.text4};
          text-align:center; margin-top:7px;
        }
        .ntv-toggle-row {
          display:flex; align-items:center;
          justify-content:space-between; padding:14px 0;
          border-top:1px solid ${T.border};
        }
        .ntv-toggle {
          position:relative; width:38px; height:20px;
          background:none; border:1px solid ${T.border};
          border-radius:12px; cursor:pointer; padding:0;
          transition:border-color 150ms;
        }
        .ntv-toggle-thumb {
          position:absolute; top:2px; width:14px; height:14px;
          border-radius:50%; transition:left 150ms;
        }
      `}</style>

      {/* Header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"20px 32px", borderBottom:`1px solid ${T.border}`, flexShrink:0,
      }}>
        <div>
          <div style={{ fontSize:10, fontWeight:500, letterSpacing:"0.08em", textTransform:"uppercase", color:T.text4, marginBottom:4 }}>
            {editId ? "Edit Financial Event" : "Record Financial Event"}
          </div>
          <div style={{ fontSize:18, fontWeight:400, letterSpacing:"-0.03em", color:T.text1 }}>
            {editId ? "Modify Transaction" : "New Transaction"}
          </div>
        </div>
        <button onClick={onCancel} style={{
          background:"none", border:"none", padding:8,
          color:T.text3, cursor:"pointer", borderRadius:6,
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"color 150ms",
        }}
          onMouseEnter={e=>e.currentTarget.style.color=T.text1}
          onMouseLeave={e=>e.currentTarget.style.color=T.text3}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Body — centered column */}
      <div style={{
        flex:1, overflowY:"auto", display:"flex",
        justifyContent:"center", padding:"40px 24px 40px",
      }}>
        <div style={{ width:"100%", maxWidth:480, display:"flex", flexDirection:"column", gap:24 }}>

          {/* Type toggle */}
          <div style={{ display:"flex" }}>
            {["expense","income"].map(t => (
              <button key={t}
                className={`ntv-type-btn${form.type===t?" active-"+t:""}`}
                onClick={() => setForm(f => ({ ...f, type:t, category: t==="income"?cats.income[0]:cats.expense[0] }))}
              >
                {t === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div>
            <input
              type="text" inputMode="numeric" autoFocus
              value={amountDisplay}
              className="ntv-amount-display"
              style={{ color: amountVal===0 ? T.text4 : isIncome ? T.green : T.red }}
              onChange={e => {
                const digits = e.target.value.replace(/[^0-9]/g,"");
                if (digits !== (form.amount||"")) setForm(f=>({...f,amount:digits.slice(0,10)}));
              }}
              onPaste={e => {
                e.preventDefault();
                const text = e.clipboardData.getData("text");
                const numeric = text.replace(/[^0-9.]/g,"");
                const dollars = parseFloat(numeric);
                if (Number.isFinite(dollars)) setForm(f=>({...f,amount:String(Math.round(dollars*100)).slice(0,10)}));
              }}
              onKeyDown={e => {
                if (e.key>="0"&&e.key<="9") { e.preventDefault(); setForm(f=>({...f,amount:(f.amount+e.key).slice(0,10)})); }
                else if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); setForm(f=>({...f,amount:f.amount.slice(0,-1)})); }
                else if (e.key==="Enter") { e.preventDefault(); onCommit(); }
              }}
            />
            <div className="ntv-hint">Type digits · Backspace to clear</div>
          </div>

          {/* Category */}
          <div>
            <label className="ntv-field-label">Category</label>
            <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
              className="ntv-input ntv-select">
              {cats[form.type].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Two-col: date + description */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div>
              <label className="ntv-field-label">Date</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
                className="ntv-input" style={{ fontFamily:"'JetBrains Mono',monospace", colorScheme: theme==="dark"?"dark":"light" }} />
            </div>
            <div>
              <label className="ntv-field-label">Tags</label>
              <input type="text" placeholder="client-a, q3" value={form.tags}
                onChange={e=>setForm(f=>({...f,tags:e.target.value}))}
                className="ntv-input" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="ntv-field-label">Memo</label>
            <input type="text" placeholder="Brief description…" value={form.description}
              onChange={e=>setForm(f=>({...f,description:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&onCommit()}
              className="ntv-input" />
          </div>

          {/* Recurring toggle */}
          <div>
            <div className="ntv-toggle-row">
              <div>
                <div style={{ fontSize:13, color:T.text1, fontWeight:400, letterSpacing:"-0.01em" }}>Recurring Entry</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.text3, marginTop:3, letterSpacing:"0.04em" }}>Projects forward automatically</div>
              </div>
              <button className="ntv-toggle" onClick={()=>setForm(f=>({...f,recurring:!f.recurring}))}
                style={{ borderColor:form.recurring?T.blue:T.border }}>
                <div className="ntv-toggle-thumb" style={{ left:form.recurring?20:2, background:form.recurring?T.blue:T.text3 }} />
              </button>
            </div>
            {form.recurring && (
              <div style={{ marginTop:12 }}>
                <label className="ntv-field-label">Frequency</label>
                <select value={form.recurringFreq} onChange={e=>setForm(f=>({...f,recurringFreq:e.target.value}))}
                  className="ntv-input ntv-select" style={{ fontSize:12 }}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display:"flex", gap:10, paddingTop:8 }}>
            <button onClick={onCancel} style={{
              flex:1, padding:"12px 0",
              background:"none", border:`1px solid ${T.border}`,
              borderRadius:6, color:T.text2,
              fontSize:12, fontWeight:600, letterSpacing:"0.04em",
              cursor:"pointer", transition:"all 150ms",
            }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderMid;e.currentTarget.style.color=T.text1;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}
            >Cancel</button>
            <button onClick={onCommit} style={{
              flex:2, padding:"12px 0",
              background:isIncome?T.green:T.blue,
              border:"none", borderRadius:6, color:"#fff",
              fontSize:12, fontWeight:600, letterSpacing:"0.04em",
              cursor:"pointer", transition:"opacity 150ms",
            }}
              onMouseEnter={e=>e.currentTarget.style.opacity="0.88"}
              onMouseLeave={e=>e.currentTarget.style.opacity="1"}
            >{editId ? "Save Changes" : isIncome ? "Record Income" : "Record Expense"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Capital Display (Phase 2) ───────────────────────────────────────
function AnimatedCapital({ value, fmt, fontSize = 56, style = {}, duration = 700 }) {
  const { displayed, animating } = useAnimatedNumber(value, duration);
  const prevVal = useRef(value);
  const dirRef  = useRef(0);
  useEffect(() => {
    if (prevVal.current !== value) {
      dirRef.current = value > prevVal.current ? 1 : -1;
      prevVal.current = value;
    }
  }, [value]);

  const tintColor = !animating ? T.text1
    : dirRef.current === 1 ? T.green
    : T.red;

  return (
    <div style={{
      fontFamily: "'JetBrains Mono',monospace",
      fontSize,
      fontWeight: 400,
      letterSpacing: "-0.06em",
      lineHeight: 1,
      color: tintColor,
      transition: "color 500ms ease",
      ...style,
    }}>
      {fmt(displayed)}
    </div>
  );
}

// ─── Animated Signed Value — for income/expense/net with sign prefix ──────────
function AnimatedValue({ value, fmt, fSign, signed = false, fontSize = 20, color, style = {}, duration = 600 }) {
  const { displayed, animating } = useAnimatedNumber(value, duration);
  const prevVal = useRef(value);
  const dirRef  = useRef(0);
  useEffect(() => {
    if (prevVal.current !== value) {
      dirRef.current = value > prevVal.current ? 1 : -1;
      prevVal.current = value;
    }
  }, [value]);

  // During animation briefly pulse brighter, then settle to the passed color
  const resolvedColor = animating
    ? (dirRef.current === 1 ? T.green : T.red)
    : (color || T.text1);

  return (
    <div style={{
      fontFamily: "'JetBrains Mono',monospace",
      fontSize,
      fontWeight: 400,
      letterSpacing: "-0.04em",
      lineHeight: 1,
      color: resolvedColor,
      transition: "color 500ms ease",
      ...style,
    }}>
      {signed
        ? (displayed >= 0 ? "+" : "−") + fmt(Math.abs(displayed))
        : fmt(displayed)}
    </div>
  );
}

// ─── Nav Icons ─────────────────────────────────────────────────────────────────
const NavIcons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M5 22C3.34315 22 2 20.6569 2 19V5C2 3.34315 3.34315 2 5 2H19C20.6569 2 22 3.34315 22 5V19C22 20.6569 20.6569 22 19 22H5ZM5 4C4.44772 4 4 4.44772 4 5V8H20V5C20 4.44772 19.5523 4 19 4H5ZM8 10H4V19C4 19.5523 4.44772 20 5 20H8V10ZM10 20V10H20V19C20 19.5523 19.5523 20 19 20H10Z" fill="currentColor"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M17 2C17 1.44772 16.5523 1 16 1C15.4477 1 15 1.44772 15 2V3H9V2C9 1.44772 8.55228 1 8 1C7.44772 1 7 1.44772 7 2V3H5C3.34315 3 2 4.34315 2 6V20C2 21.6569 3.34315 23 5 23H19C20.6569 23 22 21.6569 22 20V6C22 4.34315 20.6569 3 19 3H17V2ZM20 9V6C20 5.44772 19.5523 5 19 5H17V6C17 6.55228 16.5523 7 16 7C15.4477 7 15 6.55228 15 6V5H9V6C9 6.55228 8.55228 7 8 7C7.44772 7 7 6.55228 7 6V5H5C4.44772 5 4 5.44772 4 6V9H20ZM4 11H20V20C20 20.5523 19.5523 21 19 21H5C4.44772 21 4 20.5523 4 20V11Z" fill="currentColor"/>
    </svg>
  ),
  ledger: (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21C17 21.5523 17.4477 22 18 22C18.5523 22 19 21.5523 19 21V3C19 2.44772 18.5523 2 18 2C17.4477 2 17 2.44772 17 3V21Z" fill="currentColor"/>
      <path d="M13 21C13 21.5523 13.4477 22 14 22C14.5523 22 15 21.5523 15 21V7C15 6.44772 14.5523 6 14 6C13.4477 6 13 6.44772 13 7V21Z" fill="currentColor"/>
      <path d="M5 21C5 21.5523 5.44772 22 6 22C6.55228 22 7 21.5523 7 21V15C7 14.4477 6.55228 14 6 14C5.44772 14 5 14.4477 5 15V21Z" fill="currentColor"/>
      <path d="M10 22C9.44772 22 9 21.5523 9 21V11C9 10.4477 9.44772 10 10 10C10.5523 10 11 10.4477 11 11V21C11 21.5523 10.5523 22 10 22Z" fill="currentColor"/>
    </svg>
  ),
  goals:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>),
  investments: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  banks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7" />
      <path d="M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
      <path d="M9 21v-7h6v7" />
    </svg>
  ),
  settings: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>),
};

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function Vault() {
  // ─── Theme ────────────────────────────────────────────────────────────────
  const { theme, setTheme } = useTheme();
  // Sync module-level T so module-scoped sub-components get the correct theme colors
  Object.assign(T, theme === 'dark' ? DARK_T : LIGHT_T);

  const [session,      setSession]      = useState(null);
  const [user,         setUser]         = useState(null);
  const [authReady,    setAuthReady]    = useState(false);
  const [showAuth,     setShowAuth]     = useState(false);
  const [authIntent,   setAuthIntent]   = useState(null);

  const [txs,        setTxs]        = useState([]);
  const [baseLiq,    setBaseLiq]    = useState(0);
  const [budgets,    setBudgets]    = useState({});
  const [customCats, setCustomCats] = useState({ income:[], expense:[] });
  const currency = "USD";
  const [loaded,     setLoaded]     = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('vault_sidebar_collapsed') === 'true');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [menuCoords,      setMenuCoords]      = useState({ bottom: 0, left: 0 });
  const avatarBtnRef     = useRef(null);
  const popoverPortalRef = useRef(null);
  useEffect(() => {
    if (!showAccountMenu) return;
    const handler = (e) => {
      if (avatarBtnRef.current?.contains(e.target)) return;
      if (popoverPortalRef.current?.contains(e.target)) return;
      setShowAccountMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAccountMenu]);
  const [view,          setView]          = useState("overview");
  const [modal,         setModal]         = useState(null);
  
  const [editId,        setEditId]        = useState(null);
  const [form,          setForm]          = useState(null);
  const [period,        setPeriod]        = useState(() => { const d = getToday(); return { m:d.getMonth(), y:d.getFullYear() }; });
  const [chartMode,     setChartMode]     = useState("monthly");
  const [txFilter,      setTxFilter]      = useState("all");
  const [ledgerSearch,  setLedgerSearch]  = useState("");
  const [ledgerFrom,    setLedgerFrom]    = useState("");
  const [ledgerTo,      setLedgerTo]      = useState("");
  const [selDay,        setSelDay]        = useState(null);
  const [scopeAction,   setScopeAction]   = useState(null);
  const [newCatInput,   setNewCatInput]   = useState({ income:"", expense:"" });
  const [budgetInput,   setBudgetInput]   = useState({});
  const [settingsTab,   setSettingsTab]   = useState("data");
  const [showProjected, setShowProjected] = useState(false);
  const [accountEmail,  setAccountEmail]  = useState("");
  const [calcContext, setCalcContext] = useState(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [notifications, setNotifications]           = useState([]);
  const [showNotifications, setShowNotifications]   = useState(false);
  const [notifRead, setNotifRead]                   = useState(true);
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vault:goals") || "[]"); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("vault:goals", JSON.stringify(goals)); } catch {} }, [goals]);

  // Phase 1: New transaction full-screen view
  const [newTxView, setNewTxView] = useState(false); // replaces drawer for "+" button

  const { toasts, add:addToast, remove:removeToast } = useToast();
  const { fmt, fSign } = useMemo(() => makeFmt("USD"), []);
  const { tier, daysRemaining, trialExpired, isPaid, trialReady } = useTrialState(accountEmail, session);

  // ── Payment redirect handler ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const tierParam = params.get("tier");
    if (payment === "success") {
      const name = tierParam ? tierParam.charAt(0).toUpperCase() + tierParam.slice(1) : "Solo";
      window.history.replaceState({}, "", window.location.pathname);
      addToast(`Welcome to VaultIQ ${name}. Your access is now active.`, "ok");
    } else if (payment === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
      addToast("Payment cancelled — you're still on your free trial.", "info");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    items: plaidItems,
    importedTxs,
    syncing: plaidSyncing,
    triggerSync,
    refetch: refetchPlaid,
  } = usePlaidAccounts(session);

  useEffect(() => {
    let mounted = true;
    if (!hasSupabaseConfig || !supabase) { setAuthReady(true); return () => { mounted = false; }; }
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setAuthReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next ?? null);
      setUser(next?.user ?? null);
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!hasSupabaseConfig || !supabase) { setAccountEmail(""); return () => { alive = false; }; }
    supabase.auth.getUser().then(({ data }) => { if (alive) setAccountEmail(data?.user?.email || ""); }).catch(() => { if (alive) setAccountEmail(""); });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => { if (alive) setAccountEmail(session?.user?.email || ""); });
    return () => { alive = false; authSub?.subscription?.unsubscribe?.(); };
  }, []);

  const cats = useMemo(() => ({
    income:  [...DEFAULT_CATS.income,  ...(customCats.income||[])],
    expense: [...DEFAULT_CATS.expense, ...(customCats.expense||[])],
  }), [customCats]);

  useEffect(() => {
    if (!authReady) return;
    let disposed = false;
    (async () => {
      try {
        let d = emptyPayload();
        if (user?.id && hasSupabaseConfig) {
          const local = await loadLocalData();
          const cloud = await loadCloudData(user.id);
          if (cloud) { d = cloud; await saveLocalData(cloud); }
          else if (hasAnyData(local)) { d = local; await saveCloudData(user.id, local); }
          else { await saveCloudData(user.id, d); }
        } else {
          d = await loadLocalData();
        }
        if (disposed) return;
        setTxs(d.txs); setBaseLiq(d.baseLiquidity); setBudgets(d.budgets);
        setCustomCats(d.customCats);
        setForm(blankForm({ expense:[...DEFAULT_CATS.expense,...(d.customCats.expense||[])], income:[...DEFAULT_CATS.income,...(d.customCats.income||[])] }));
      } catch (e) {
        console.error("[Grape]", e);
        if (!disposed) {
          addToast("Sync failed. Using local data.", "err");
          // Fallback: load local data so the form is always initialized
          try {
            const fallback = await loadLocalData();
            setTxs(fallback.txs); setBaseLiq(fallback.baseLiquidity);
            setBudgets(fallback.budgets); setCustomCats(fallback.customCats);
            setForm(blankForm({ expense:[...DEFAULT_CATS.expense,...(fallback.customCats.expense||[])], income:[...DEFAULT_CATS.income,...(fallback.customCats.income||[])] }));
          } catch {
            setForm(blankForm({ expense:DEFAULT_CATS.expense, income:DEFAULT_CATS.income }));
          }
        }
      } finally {
        if (!disposed) setLoaded(true);
      }
    })();
    return () => { disposed = true; };
  }, [authReady, user?.id, addToast]);

  const persist = useCallback(async (nt, nb, nb2, nc) => {
    const payload = { txs:nt, baseLiquidity:nb, budgets:nb2, customCats:nc, currency:"USD" };
    try {
      if (user?.id && hasSupabaseConfig) await saveCloudData(user.id, payload);
      await saveLocalData(payload);
    } catch { addToast("Save failed.", "err"); }
  }, [addToast, user?.id]);

  const signIn  = useCallback(async (email, password) => { if (!supabase) throw new Error("No supabase"); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }, []);
  const signUp  = useCallback(async (email, password) => { if (!supabase) throw new Error("No supabase"); const { error } = await supabase.auth.signUp({ email, password }); if (error) throw error; }, []);
  const resetPw = useCallback(async email => { if (!supabase) throw new Error("No supabase"); const { error } = await supabase.auth.resetPasswordForEmail(email); if (error) throw error; }, []);
  const signOut = useCallback(async () => { if (!supabase) return; const { error } = await supabase.auth.signOut(); if (error) throw error; }, []);

  const goPrev = () => setPeriod(p => { const d=new Date(p.y,p.m-1,1); return {m:d.getMonth(),y:d.getFullYear()}; });
  const goNext = () => setPeriod(p => { const d=new Date(p.y,p.m+1,1); return {m:d.getMonth(),y:d.getFullYear()}; });

  // Derived
  const monthTxs = useMemo(() => txsForMonth(txs, period.y, period.m), [txs, period]);

  // Imported (Plaid) txs for current month.
  // Transfers excluded — they move money between accounts, not income or expense.
  const importedMonthTxsNorm = useMemo(() => {
    return importedTxs
      .filter(t => !t.hidden && !t.transfer)
      .filter(t => { const d = new Date(t.date + "T00:00:00"); return d.getFullYear() === period.y && d.getMonth() === period.m; });
  }, [importedTxs, period]);

  // All txs for current month — manual + Plaid
  const allMonthTxs = useMemo(() => [...monthTxs, ...importedMonthTxsNorm], [monthTxs, importedMonthTxsNorm]);

  const monthIncome   = useMemo(() => allMonthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [allMonthTxs]);
  const monthExpenses = useMemo(() => allMonthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [allMonthTxs]);
  const monthNet      = monthIncome - monthExpenses;

  // allTimeNet uses manual txs only — baseLiq already reflects historical bank balance,
  // so adding Plaid's full history would double-count. Plaid data feeds monthly burn/income only.
  const allTimeNet = useMemo(() => txs.reduce((s,t)=>t.type==="income"?s+t.amount:s-t.amount,0), [txs]);
  const liquidity  = baseLiq + allTimeNet;

  const recentActivityTxs = useMemo(() => {
    if (!allMonthTxs.length) return [];
    const uniqueDates = [...new Set(allMonthTxs.map(t => t.date))].sort((a, b) => b.localeCompare(a));
    const recentDates = new Set(uniqueDates.slice(0, 2));
    return allMonthTxs
      .filter(t => recentDates.has(t.date))
      .sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [allMonthTxs]);

  const runwayDisplay = useMemo(() => {
    if (monthExpenses <= 0 || liquidity <= 0) return null;
    return formatRunway((liquidity / monthExpenses) * SEC_PER_MONTH);
  }, [liquidity, monthExpenses]);

  const catBreakdown = useMemo(() => {
    const acc = {};
    allMonthTxs.filter(t=>t.type==="expense").forEach(t => { acc[t.category]=(acc[t.category]||0)+t.amount; });
    return Object.entries(acc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  }, [allMonthTxs]);

  const incomeCatBreakdown = useMemo(() => {
    const acc = {};
    allMonthTxs.filter(t=>t.type==="income").forEach(t => { acc[t.category]=(acc[t.category]||0)+t.amount; });
    return Object.entries(acc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  }, [allMonthTxs]);

  const budgetAlerts = useMemo(() =>
    catBreakdown.filter(([cat,spent])=>budgets[cat]&&spent>=budgets[cat]*0.8)
      .map(([cat,spent])=>({ cat, spent, limit:budgets[cat], over:spent>budgets[cat] })),
    [catBreakdown, budgets]);

  const projectedNext = useMemo(() => {
    const nm = period.m+1>11 ? 0 : period.m+1;
    const ny = period.m+1>11 ? period.y+1 : period.y;
    const nTx = txsForMonth(txs, ny, nm);
    return { income:nTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), expense:nTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0) };
  }, [txs, period]);

  const monthlyChartData = useMemo(() =>
    MONTHS_SHORT.map((name,i) => {
      const mTxs = txsForMonth(txs, period.y, i);
      return { name, Income:precise(mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)), Expenses:precise(mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)) };
    }), [txs, period.y]);

  const yearlyChartData = useMemo(() => {
    const years = new Set([...txs.map(txYear), getToday().getFullYear()]);
    return [...years].sort().map(y => {
      const flat = MONTHS_SHORT.flatMap((_,i) => txsForMonth(txs,y,i));
      return { name:String(y), Income:precise(flat.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)), Expenses:precise(flat.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)) };
    });
  }, [txs]);

  const chartData = chartMode === "monthly" ? monthlyChartData : yearlyChartData;
  const anomalies = useMemo(() => detectAnomalies(chartData), [chartData]);

  const intelMsgs = useMemo(() =>
    buildIntelligenceMessages(monthIncome, monthExpenses, liquidity, runwayDisplay, allMonthTxs, budgetAlerts),
    [monthIncome, monthExpenses, liquidity, runwayDisplay, allMonthTxs, budgetAlerts]);

  // ── Premium metrics: previous month, MoM trends, savings rate, health score ──
  const prevMonthTxs = useMemo(() => {
    const pm = period.m === 0 ? 11 : period.m - 1;
    const py = period.m === 0 ? period.y - 1 : period.y;
    return txsForMonth(txs, py, pm);
  }, [txs, period]);
  const prevMonthIncome   = useMemo(() => prevMonthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),   [prevMonthTxs]);
  const prevMonthExpenses = useMemo(() => prevMonthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [prevMonthTxs]);
  const momIncomePct   = prevMonthIncome   > 0 ? ((monthIncome   - prevMonthIncome)   / prevMonthIncome)   * 100 : null;
  const momExpensePct  = prevMonthExpenses > 0 ? ((monthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100 : null;
  const savingsRate    = monthIncome > 0 ? Math.max(-100, Math.min(100, ((monthIncome - monthExpenses) / monthIncome) * 100)) : null;
  const healthScore    = useMemo(() => {
    let s = 40;
    if (liquidity > 0) s += 15;
    if (monthIncome > 0) {
      const sr = (monthIncome - monthExpenses) / monthIncome;
      s += sr >= 0.20 ? 25 : sr >= 0.10 ? 18 : sr >= 0 ? 8 : -5;
    }
    if (runwayDisplay) {
      s += runwayDisplay.primary?.includes("y") ? 15 : runwayDisplay.primary?.includes("mo") ? 8 : 3;
    }
    if (!budgetAlerts.some(a => a.over)) s += 5;
    return Math.max(0, Math.min(100, Math.round(s)));
  }, [liquidity, monthIncome, monthExpenses, runwayDisplay, budgetAlerts]);

  // ── Daily burn rate ──
  const dailyBurn = useMemo(() => {
    const days = daysInMonth(period.y, period.m);
    return days > 0 ? monthExpenses / days : 0;
  }, [monthExpenses, period]);

  // ── 6-month sparkline data arrays ──
  const sparklineData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const offset = 5 - i;
      let m = period.m - offset; let y = period.y;
      while (m < 0) { m += 12; y--; }
      const mTxs = txsForMonth(txs, y, m);
      return {
        income:   mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),
        expenses: mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),
        net:      mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0) - mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),
        savings:  (() => { const inc = mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0); const exp = mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0); return inc>0?(inc-exp)/inc*100:0; })(),
      };
    });
    return {
      income:   months.map(m=>m.income),
      expenses: months.map(m=>m.expenses),
      net:      months.map(m=>m.net),
      savings:  months.map(m=>m.savings),
    };
  }, [txs, period]);

  // ── Chart momentum direction (last 3 months net trend) ──
  const chartMomentum = useMemo(() => {
    const last3 = sparklineData.net.slice(-3);
    const pos = last3.filter(v => v > 0).length;
    if (pos === 3) return "up";
    if (pos === 0) return "down";
    return "mixed";
  }, [sparklineData]);

  // ── Financial velocity (net trend vs 3 months ago) ──
  const financialVelocity = useMemo(() => {
    const currentNet = monthIncome - monthExpenses;
    let m3 = period.m - 3; let y3 = period.y;
    while (m3 < 0) { m3 += 12; y3--; }
    const pastTxs = txsForMonth(txs, y3, m3);
    const pastNet = pastTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)
                  - pastTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
    const delta = currentNet - pastNet;
    const pct = pastNet !== 0 ? (delta / Math.abs(pastNet)) * 100 : null;
    return { delta, pct, improving: delta > 0 };
  }, [txs, period, monthIncome, monthExpenses]);

  // ── Runway in days (for grades/priorities) ──
  const runwayDaysNum = useMemo(() => {
    if (monthExpenses <= 0 || liquidity <= 0) return null;
    return Math.round((liquidity / monthExpenses) * 30.4375);
  }, [liquidity, monthExpenses]);

  // ── Report card grades ──
  const reportCard = useMemo(() => {
    const ig = getGrade('incomeGrowth',   momIncomePct);
    const sc = getGrade('spendControl',   momExpensePct);
    const sr = getGrade('savingsRate',    savingsRate);
    const rw = getGrade('runway',         runwayDaysNum);
    const ba = getGrade('budgetAdherence', budgetAlerts.filter(a=>a.over).length);
    const gradeToGpa = { 'A+':4.3,'A':4,'B':3,'C':2,'D':1,'F':0,'—':null };
    const gpas = [ig,sc,sr,rw,ba].map(g=>gradeToGpa[g.grade]).filter(v=>v!==null);
    const avgGpa = gpas.length ? gpas.reduce((a,b)=>a+b,0)/gpas.length : null;
    const overallGrade = avgGpa === null ? '—' : avgGpa >= 4 ? 'A' : avgGpa >= 3 ? 'B' : avgGpa >= 2 ? 'C' : avgGpa >= 1 ? 'D' : 'F';
    return { incomeGrowth:ig, spendControl:sc, savingsRate:sr, runway:rw, budgetAdherence:ba, overallGrade };
  }, [momIncomePct, momExpensePct, savingsRate, runwayDaysNum, budgetAlerts]);

  // ── Priority actions ──
  const priorityActions = useMemo(() =>
    getPriorityActions({ monthIncome, monthExpenses, savingsRate, runwayDays:runwayDaysNum, catBreakdown, budgetAlerts, momExpensePct, fmt }),
    [monthIncome, monthExpenses, savingsRate, runwayDaysNum, catBreakdown, budgetAlerts, momExpensePct, fmt]);

  // ── Milestone badges ──
  const [dismissedBadges, setDismissedBadges] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('vault:badges') || '[]')); } catch { return new Set(); }
  });
  const earnedBadges = useMemo(() => {
    const badges = [];
    if (txs.length >= 1)           badges.push({ id:'first-tx',      icon:'◆', label:'First Transaction', color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.18)' });
    if (monthIncome > monthExpenses && monthExpenses > 0) badges.push({ id:'profitable',   icon:'↑', label:'Profitable Month',  color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.18)' });
    if (runwayDaysNum !== null && runwayDaysNum >= 180)   badges.push({ id:'runway-6mo',   icon:'◈', label:'6 Months Runway',   color:'#059669', bg:'#F0FDF4', border:'rgba(5,150,105,0.18)' });
    else if (runwayDaysNum !== null && runwayDaysNum >= 90) badges.push({ id:'runway-3mo', icon:'◈', label:'3 Months Runway',   color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.18)' });
    if (liquidity >= 10000)        badges.push({ id:'10k-capital',   icon:'◆', label:'$10k Capital',       color:'#B8891A', bg:'#FBF6E8', border:'rgba(184,137,26,0.18)' });
    if (!budgetAlerts.some(a=>a.over) && Object.keys(budgets).length >= 2) badges.push({ id:'budget-clean', icon:'✓', label:'Budget Discipline', color:'#1B4FCC', bg:'#F0F4FF', border:'rgba(27,79,204,0.18)' });
    return badges.filter(b => !dismissedBadges.has(b.id));
  }, [txs, monthIncome, monthExpenses, runwayDaysNum, liquidity, budgetAlerts, budgets, dismissedBadges]);

  // ── Retention: milestone badge toasts ──
  useEffect(() => {
    earnedBadges.forEach(badge => {
      const key = `vault:badge:shown:${badge.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        addToast(`${badge.icon} ${badge.label} — milestone earned`, 'ok');
      }
    });
  }, [earnedBadges]);

  // ── Retention: daily streak ──
  const streakDays = useMemo(() => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      if (txs.some(t => t.date === ds)) streak++;
      else if (i > 0) break;
    }
    return streak;
  }, [txs]);

  // --- ISDARK Addition
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute("data-theme");
      setIsDark(theme === "dark");
    });
  
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  
    return () => observer.disconnect();
  }, []);

  // ── Retention: daily check-in nudge ──
  const [lastVisitDate, setLastVisitDate] = useState(
    () => localStorage.getItem('vault:lastVisit') || ''
  );
  const isNewDay = lastVisitDate !== getTodayStr();
  useEffect(() => {
    if (isNewDay) {
      const todayStr = getTodayStr();
      localStorage.setItem('vault:lastVisit', todayStr);
      setLastVisitDate(todayStr);
    }
  }, []);

  const [expandedTimelineDay, setExpandedTimelineDay] = useState(null);

  const calMap = useMemo(() => {
    const m = {};
    allMonthTxs.forEach(t => {
      const d=txDay(t);
      if (!m[d]) m[d]={income:0,expense:0,txs:[]};
      if(t.type==="income")m[d].income+=t.amount; else m[d].expense+=t.amount;
      m[d].txs.push(t);
    });
    return m;
  }, [allMonthTxs]);

  const ledgerTxs = useMemo(() => {
    const manualTxsFiltered =
      txFilter === "all" ? [...txs] : txs.filter(t => t.type === txFilter);
  
    const importedFiltered = importedTxs.filter(t =>
      !t.hidden && !t.transfer &&
      (txFilter === "all" || t.type === txFilter)
    );
  
    const merged = [...manualTxsFiltered, ...importedFiltered];
  
    let list = merged;
  
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.trim().toLowerCase();
      list = list.filter(t =>
        t.description?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.tags?.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    }
  
    if (ledgerFrom) list = list.filter(t => t.date >= ledgerFrom);
    if (ledgerTo)   list = list.filter(t => t.date <= ledgerTo);
  
    return list.sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [txs, importedTxs, txFilter, ledgerSearch, ledgerFrom, ledgerTo]);

  const ledgerSearchActive = !!(ledgerSearch.trim() || ledgerFrom || ledgerTo || txFilter !== "all");
  const ledgerSearchIncome   = useMemo(() => ledgerTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [ledgerTxs]);
  const ledgerSearchExpenses = useMemo(() => ledgerTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [ledgerTxs]);
  const ledgerSearchNet      = ledgerSearchIncome - ledgerSearchExpenses;

  const ledgerIncome   = useMemo(() => txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [txs]);
  const ledgerExpenses = useMemo(() => txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [txs]);
  const isFiltered     = !!(ledgerFrom || ledgerTo);

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download:filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const exportCSV = useCallback(() => {
    const header = ["Date","Type","Category","Description","Tags","Amount","Currency","Recurring"];
    const rows = txs.map(t => [t.date,t.type,t.category,`"${(t.description||"").replace(/"/g,'""')}"`,`"${(t.tags||"").replace(/"/g,'""')}"`,t.amount.toFixed(2),"USD",t.recurring?t.recurringFreq:"no"]);
    triggerDownload(new Blob([[header,...rows].map(r=>r.join(",")).join("\n")],{type:"text/csv"}),`vault-${getTodayStr()}.csv`);
    addToast(`Exported ${txs.length} records`, "ok");
  }, [txs, addToast]);

  const exportJSON = useCallback(() => {
    triggerDownload(new Blob([JSON.stringify({baseLiquidity:precise(baseLiq),txs,budgets,customCats,currency:"USD"},null,2)],{type:"application/json"}),`vault-backup-${getTodayStr()}.json`);
    addToast(`Backup: ${txs.length} records`, "ok");
  }, [baseLiq, txs, budgets, customCats, addToast]);

  const normalizeImport = useCallback(raw => {
    if (!raw||typeof raw!=="object") throw new Error("Invalid JSON.");
    const baseLiquidity = parseFloat(raw.baseLiquidity);
    if (!Number.isFinite(baseLiquidity)) throw new Error("Invalid baseLiquidity.");
    if (!Array.isArray(raw.txs)) throw new Error("Invalid txs array.");
    const out=[]; let dropped=0;
    for (const t of raw.txs) {
      if (!t||typeof t!=="object"){dropped++;continue;}
      const id=typeof t.id==="string"&&t.id.trim()?t.id:null;
      const type=t.type==="income"||t.type==="expense"?t.type:null;
      const category=typeof t.category==="string"&&t.category.trim()?t.category:null;
      const date=typeof t.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(t.date)?t.date:null;
      const amount=parseFloat(typeof t.amount==="string"?t.amount.replace(/[$,\s]/g,""):t.amount);
      if(!id||!type||!category||!date||!Number.isFinite(amount)){dropped++;continue;}
      out.push({id,type,amount:precise(amount),category,date,description:t.description||"",tags:t.tags||"",recurring:t.recurring||false,recurringFreq:t.recurringFreq||"monthly"});
    }
    return {baseLiquidity:precise(baseLiquidity),txs:out,budgets:raw.budgets||{},customCats:raw.customCats||{income:[],expense:[]},currency:"USD",dropped};
  }, []);

  const importFile = useCallback(async file => {
    let parsed;
    try { parsed=JSON.parse(await file.text()); } catch { throw new Error("Invalid JSON file."); }
    const n=normalizeImport(parsed);
    setBaseLiq(n.baseLiquidity); setTxs(n.txs); setBudgets(n.budgets); setCustomCats(n.customCats);
    persist(n.txs,n.baseLiquidity,n.budgets,n.customCats);
    addToast(`Imported ${n.txs.length} records${n.dropped?` (${n.dropped} skipped)`:""}`,"ok");
  }, [normalizeImport, persist, addToast]);

  const resetAllData = useCallback(() => {
    if (!window.confirm("Reset all data? This cannot be undone.")) return;
    setTxs([]); setBaseLiq(0); setBudgets({}); setCustomCats({income:[],expense:[]});
    persist([],0,{},{income:[],expense:[]});
    addToast("All data cleared","info");
  }, [persist, addToast]);

  // ── Load Mock Data ──
  const loadMockData = useCallback(() => {
    if (!window.confirm("This will replace all current data with 12 months of sample data. Continue?")) return;
    const mock = generateMockData();
    setTxs(mock.txs);
    setBaseLiq(mock.baseLiquidity);
    setBudgets(mock.budgets);
    setCustomCats(mock.customCats);
    persist(mock.txs, mock.baseLiquidity, mock.budgets, mock.customCats);
    addToast(`Loaded ${mock.txs.length} sample transactions across 12 months`, "ok");
  }, [persist, addToast]);

  // CRUD
  const commitTx = useCallback(() => {
    const digits = String(form.amount ?? "").replace(/\D/g, "");
    const cents = parseInt(digits, 10);
    if (!Number.isFinite(cents) || cents <= 0) return;
    const tx={...form,amount:precise(cents / 100),recurring:form.recurring||false,recurringFreq:form.recurringFreq||"monthly"};
    const next = editId ? txs.map(t=>t.id===editId?{...tx,id:t.id}:t) : [...txs,{...tx,id:Date.now().toString()+Math.random().toString(36).slice(2)}];
    setTxs(next); persist(next,baseLiq,budgets,customCats);
    setNewTxView(false); setModal(null); setEditId(null); setForm(blankForm(cats));
    addToast(editId?"Transaction updated":"Transaction recorded","ok");
  }, [form,editId,txs,baseLiq,budgets,customCats,cats,persist,addToast]);

  const deleteTxById = useCallback(id => {
    const deleted=txs.find(t=>t.id===id);
    const next=txs.filter(t=>t.id!==id);
    setTxs(next); persist(next,baseLiq,budgets,customCats);
    addToast(`Deleted: ${deleted?.category||"transaction"}`, "info", () => {
      setTxs(prev => {
        const restored=[...prev,deleted].sort((a,b)=>parseDate(b.date)-parseDate(a.date));
        persist(restored,baseLiq,budgets,customCats);
        return restored;
      });
    });
  }, [txs,baseLiq,budgets,customCats,persist,addToast]);

  const deleteImportedTx = useCallback(async tx => {
    if (!supabase) return;
    await supabase
      .from("imported_transactions")
      .update({ user_overrides: { ...(tx.user_overrides || {}), hidden: true } })
      .eq("id", tx.id);
    addToast(`Deleted: ${tx.category||"transaction"}`, "info");
  }, [addToast]);

  const handleDelete = useCallback(tx => {
    if (tx.source === "plaid") { deleteImportedTx(tx); return; }
    const target=tx.isRecurringInstance?txs.find(t=>t.id===tx.recurringParentId)||tx:tx;
    if(target.recurring||tx.isRecurringInstance){setScopeAction({action:"delete",tx:target});return;}
    deleteTxById(tx.id);
  }, [txs,deleteTxById,deleteImportedTx]);

  const openEdit = useCallback(tx => {
    const target=tx.isRecurringInstance?txs.find(t=>t.id===tx.recurringParentId):tx;
    if(!target)return;
    if(tx.recurring||tx.isRecurringInstance){setScopeAction({action:"edit",tx:target});return;}
    setEditId(target.id); setForm(formFromTx(target)); setNewTxView(true);
  }, [txs]);

  const openAdd = useCallback((type = "expense") => { setEditId(null); setForm({ ...blankForm(cats), type }); setNewTxView(true); }, [cats]);

  const logout = useCallback(async () => {
    if (hasSupabaseConfig && supabase) {
      try { await signOut(); } catch { addToast("Logout failed.", "err"); }
      return;
    }
    window.location.reload();
  }, [addToast, signOut]);

  const commitBudgets = useCallback(() => {
    const nb={...budgets};
    Object.entries(budgetInput).forEach(([cat,val])=>{
      const v=parseFloat((val||"").replace(/[$,\s]/g,""));
      if(!isNaN(v)&&v>0)nb[cat]=v; else if(val==="")delete nb[cat];
    });
    setBudgets(nb); persist(txs,baseLiq,nb,customCats); setBudgetInput({});
    addToast("Budget limits saved","ok");
  }, [budgets,budgetInput,txs,baseLiq,customCats,persist,addToast]);

  const addCustomCat = useCallback(type => {
    const val=newCatInput[type]?.trim();
    if(!val)return;
    if(cats[type].includes(val)){addToast("Already exists","info");return;}
    const nc={...customCats,[type]:[...(customCats[type]||[]),val]};
    setCustomCats(nc); persist(txs,baseLiq,budgets,nc);
    setNewCatInput(p=>({...p,[type]:""}));
    addToast(`Added: ${val}`,"ok");
  }, [newCatInput,cats,customCats,txs,baseLiq,budgets,persist,addToast]);

  const removeCustomCat = useCallback((type,cat) => {
    const nc={...customCats,[type]:(customCats[type]||[]).filter(c=>c!==cat)};
    setCustomCats(nc); persist(txs,baseLiq,budgets,nc);
    addToast(`Removed: ${cat}`,"info");
  }, [customCats,txs,baseLiq,budgets,persist,addToast]);

  useEffect(() => {
    const h = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(s => !s);
        return;
      }
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (["input","textarea","select"].includes(tag)) return;
      // Escape closes any open modal/drawer
      if (e.key === "Escape") { setModal(null); setScopeAction(null); setNewTxView(false); return; }
      if (modal || scopeAction || newTxView) return;
      const quickAdd = () => openAdd("expense");
      const views = ["overview","ledger","insights","investments","settings"];
      const map = {
        n:quickAdd, N:quickAdd,
        l:()=>setView("ledger"),   L:()=>setView("ledger"),
        o:()=>setView("overview"), O:()=>setView("overview"),
        c:()=>setView("calendar"), C:()=>setView("calendar"),
        "?":()=>setModal("shortcuts"),
      };
      if (map[e.key]) { map[e.key](); return; }
      if (e.key === "/") { e.preventDefault(); setShowCommandPalette(true); return; }
      if (e.key === "[") { goPrev(); return; }
      if (e.key === "]") { goNext(); return; }
      if (e.key === "ArrowLeft")  goPrev();
      if (e.key === "ArrowRight") goNext();
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < views.length) setView(views[idx]);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modal, scopeAction, newTxView, cats, openAdd]);

  const handleScopeThis = useCallback(() => {
    if(scopeAction.action==="delete"){deleteTxById(scopeAction.tx.id);}
    else{setEditId(scopeAction.tx.id);setForm({...formFromTx(scopeAction.tx),recurring:false});setNewTxView(true);}
    setScopeAction(null);
  }, [scopeAction,deleteTxById]);

  const handleScopeAll = useCallback(() => {
    if(scopeAction.action==="delete"){deleteTxById(scopeAction.tx.id);}
    else{setEditId(scopeAction.tx.id);setForm(formFromTx(scopeAction.tx));setNewTxView(true);}
    setScopeAction(null);
  }, [scopeAction,deleteTxById]);

  const amountDisplay = useMemo(() => {
    const cents = parseInt(form?.amount || "0", 10);
    return fmt(Number.isFinite(cents) ? cents / 100 : 0);
  }, [form?.amount, fmt]);

  const LoadingScreen = () => (
    <div style={{ position:"fixed",inset:0,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18 }}>
      <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:500,letterSpacing:"0.12em",color:T.text2 }}>VAULTIQ</div>
      <div style={{ fontFamily:"'Inter',sans-serif",fontSize:10,letterSpacing:"0.10em",color:T.text4,marginTop:4 }}>LOADING</div>
      <div style={{ width:120,height:1,background:T.border,position:"relative",overflow:"hidden",marginTop:4 }}>
        <div style={{ position:"absolute",top:0,height:"100%",width:"40%",background:T.blue,animation:"scan 1.4s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes scan{0%{left:-40%}100%{left:140%}}`}</style>
    </div>
  );

  if (!authReady) return <LoadingScreen />;
  if (hasSupabaseConfig && !session) {
    if (!showAuth) {
      return (
        <LandingPage
          onSignIn={() => { setAuthIntent('signin'); setShowAuth(true); }}
          onStartTrial={(income, expenses) => {
            if (income) setCalcContext({ income, expenses });
            setAuthIntent('signup');
            setShowAuth(true);
          }}
          onSelectTier={() => { setAuthIntent('signup'); setShowAuth(true); }}
        />
      );
    }
    return (
      <AuthView
        onAuth={() => {
          setShowAuth(false);
          setAuthIntent(null);
        }}
        initialTab={authIntent === 'signin' ? 'signin' : 'signup'}
        planHint={null}
        calcContext={calcContext}
        onBack={() => { setShowAuth(false); setCalcContext(null); }}
      />
    );
  }
  if (!loaded || !form) return <LoadingScreen />;
 
  // ── Onboarding gate — fires for brand new users only ──
  if (baseLiq === 0 && txs.length === 0) {
    return (
      <VaultOnboarding
        theme={theme}
        initialCapital={calcContext?.expenses || 0}
        onComplete={({ baseLiquidity, firstTx }) => {
          // 1. Set base capital
          const nb = baseLiquidity;
          setBaseLiq(nb);
 
          // 2. Add first transaction if user didn't skip
          const newTxs = firstTx
            ? [{
                ...firstTx,
                id: Date.now().toString() + Math.random().toString(36).slice(2),
              }]
            : [];
          setTxs(newTxs);
 
          // 3. Persist everything
          persist(newTxs, nb, budgets, customCats);
        }}
      />
    );
  }
    // ── Trial gate — activates after 14-day free trial ──
  if (trialReady && trialExpired && !isPaid) {
    return <TrialExpiredWall accountEmail={accountEmail} T={T} />;
  }
   

  // ── Inline helper components (use T token, defined here for theme access) ──
  function ProBadge() {
    return (
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: T.gold,
        background: T.goldLight,
        border: `1px solid rgba(184,137,26,0.20)`,
        padding: '2px 6px', borderRadius: 4, flexShrink: 0,
      }}>Pro</span>
    );
  }

  function StreakWidget() {
    const todayHasTx = txs.some(t => t.date === getTodayStr() && !t.isRecurringInstance);
    if (streakDays < 2 && todayHasTx) return null;
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return txs.some(t => t.date === d.toISOString().split("T")[0]);
    });
    return (
      <div style={{ margin: '8px 12px 0', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 500, color: streakDays >= 3 ? '#D4A034' : 'rgba(255,255,255,0.70)', lineHeight: 1 }}>{streakDays}</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>day streak</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          {last7.map((active, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: active ? '#10B981' : 'rgba(255,255,255,0.10)' }} />
          ))}
        </div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
          {todayHasTx ? 'Grapes active today' : 'Log today to keep it going'}
        </div>
      </div>
    );
  }

  const breakEvenGap = monthExpenses - monthIncome;
  const overBudget   = budgetAlerts.some(a => a.over);
  const dayData      = selDay !== null ? (calMap[selDay]||null) : null;
  const valueSignColor = n => n === 0 ? T.text1 : n > 0 ? T.green : T.red;
  const shownIncome = isFiltered
    ? ledgerTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)
    : ledgerIncome;

  const inputSx = {
    width: "100%", background: T.bgCard,
    border: `1.5px solid ${T.border}`, padding: "10px 13px",
    color: T.text1, fontSize: 13, fontFamily: "inherit",
    transition: "border-color 150ms",
    borderRadius: T.radiusSm, outline: "none", boxSizing: "border-box",
  };

  const navItems = [
    ["overview",     "Overview"],
    ["calendar",     "Calendar"],
    ["ledger",       "Ledger"],
    ["investments",  "Investments"],
    ["banks",        "Banks"],
  ];

  const anomalyDots = anomalies.filter(a => a.type === "spike").map(a => ({ ...a }));

  return (
    <>
      <div className="v-app">

        {/* ── SIDEBAR ── */}
        <aside className={`v-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>

          {/* Header: logo slot — doubles as expand trigger when collapsed */}
          <div className="v-sidebar-header">
            {sidebarCollapsed ? (
              <button
                className="v-logo-trigger"
                onClick={() => { setSidebarCollapsed(false); localStorage.setItem('vault_sidebar_collapsed','false'); }}
                title="Open sidebar"
              >
                <span className="v-logo-layer">
                  <img
                    src={isDark ? "/Grape_Logo_Light.png" : "/Grape_Logo_Dark.png"}
                    className="v-sidebar-logo-img"
                    style={{ opacity: isDark ? 0.95 : 0.80 }}
                  />
                </span>
                <span className="v-expand-layer">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </span>
              </button>
            ) : (
              <>
                <img
                  src={isDark ? "/Grape_Logo_Light.png" : "/Grape_Logo_Dark.png"}
                  className="v-sidebar-logo-img"
                  style={{ opacity: isDark ? 0.95 : 0.80 }}
                />
                <button
                  className="v-sidebar-collapse"
                  onClick={() => { setSidebarCollapsed(true); localStorage.setItem('vault_sidebar_collapsed','true'); }}
                  title="Collapse"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="v-nav">
            {navItems.map(([id, lbl]) => (
              <button
                key={id}
                className={`v-nav-item${view === id ? ' active' : ''}`}
                onClick={() => setView(id)}
                title={sidebarCollapsed ? lbl : undefined}
              >
                <span className="v-nav-icon">{NavIcons[id]}</span>
                {!sidebarCollapsed && <span className="v-nav-label">{lbl}</span>}
              </button>
            ))}
          </nav>

          {/* Trial upgrade banner */}
          {!sidebarCollapsed && !isPaid && (
            <TrialBanner
              daysRemaining={daysRemaining}
              isPaid={isPaid}
              accountEmail={accountEmail}
              T={T}
            />
          )}

          {/* Bottom: financial summary + New + account */}
          <div className="v-sidebar-bottom">
            {!sidebarCollapsed && (
              <div className="v-sidebar-summary">
                <div className="v-sidebar-summary-line" style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                  <AnimatedValue value={liquidity} fmt={fmt} fontSize={12} color={T.text2} style={{ letterSpacing:"-0.02em", lineHeight:1, fontWeight:400 }} />
                  {runwayDaysNum !== null && <span style={{ color:T.text4, fontSize:10 }}> · {runwayDaysNum}d</span>}
                </div>
              </div>
            )}

            {!sidebarCollapsed && (
              <div style={{ height: 1, background: T.border, margin: '0 10px 4px' }} />
            )}

            <button
              className="v-nav-item v-new-btn"
              onClick={() => { setEditId(null); setForm({ ...blankForm(cats) }); setNewTxView(true); }}
              title={sidebarCollapsed ? "+ New" : undefined}
            >
              <span className="v-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
              {!sidebarCollapsed && <span className="v-nav-label">New</span>}
            </button>

            {/* Profile / account button */}
            <button
              ref={avatarBtnRef}
              className="v-nav-item"
              onClick={() => {
                if (!showAccountMenu) {
                  const rect = avatarBtnRef.current.getBoundingClientRect();
                  setMenuCoords({
                    bottom: window.innerHeight - rect.top + 6,
                    left: sidebarCollapsed ? rect.right + 8 : rect.left,
                  });
                }
                setShowAccountMenu(s => !s);
              }}
              title={sidebarCollapsed ? (accountEmail || 'Account') : undefined}
              style={{ opacity: showAccountMenu ? 1 : undefined }}
            >
              <span className="v-nav-icon">
                <div className="v-avatar">{(accountEmail?.[0] || 'A').toUpperCase()}</div>
              </span>
              {!sidebarCollapsed && (
                <span className="v-nav-label" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {accountEmail ? accountEmail.split('@')[0] : 'Account'}
                </span>
              )}
            </button>
          </div>

        </aside>

        {/* ── ACCOUNT POPOVER (portal) ── */}
        {showAccountMenu && createPortal(
          <div
            ref={popoverPortalRef}
            className="v-account-popover"
            style={{ position: 'fixed', bottom: menuCoords.bottom, left: menuCoords.left }}
          >
            {/* Identity header */}
            <div className="v-account-popover-header">
              <div className="v-account-popover-email">{accountEmail || 'Guest'}</div>
            </div>
            <div className="v-account-popover-divider" />

            {/* Theme toggle */}
            <button className="v-account-popover-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <span style={{ width: 15, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {theme === 'dark'
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                }
              </span>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <div className="v-account-popover-divider" />

            {/* Settings */}
            <button className="v-account-popover-item" onClick={() => { setView('settings'); setShowAccountMenu(false); }}>
              <span style={{ width: 15, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
              </span>
              Settings
            </button>

            <div className="v-account-popover-divider" />

            {/* Sign out */}
            <button className="v-account-popover-item v-account-popover-signout" onClick={() => { setShowAccountMenu(false); logout(); }}>
              <span style={{ width: 15, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              Sign out
            </button>
          </div>,
          document.body
        )}

        {/* ── MOBILE TOPBAR ── */}
        <div className="v-mobile-topbar">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <img src={isDark ? "/Grape_Logo_Light.png" : "/Grape_Logo_Dark.png"} className="v-mobile-logo-img" alt="" />
            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:600, letterSpacing:"-0.02em", color:T.text1 }}>Grape</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <AnimatedValue value={liquidity} fmt={fmt} fontSize={12} color={liquidity>=0?T.text1:T.red} style={{ letterSpacing:"-0.03em", lineHeight:1, fontWeight:400 }} />
            {view==="calendar" && (
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <button className="v-period-btn" onClick={goPrev} style={{ minWidth:36, minHeight:36 }}>‹</button>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.text2 }}>{MONTHS_SHORT[period.m]} {period.y}</span>
                <button className="v-period-btn" onClick={goNext} style={{ minWidth:36, minHeight:36 }}>›</button>
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN ── */}
        <div className="v-main">

          <main className="v-content">
            <div
              className={
                view === "calendar" || view === "overview" || view === "ledger" || view === "settings" || view === "investments"
                  ? "v-content-inner v-content-inner--wide"
                  : "v-content-inner"
              }
            >

            {/* ─── OVERVIEW ─── */}
            {view === "overview" && (
              <div style={{ paddingBottom: 60 }}>

                {/* ── VAULT STATUS BAR ── */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 32px",
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: runwayDaysNum === null ? T.text4 : runwayDaysNum >= 90 ? T.green : runwayDaysNum >= 30 ? T.gold : T.red,
                  }} />
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 400, color: T.text3, letterSpacing: "-0.01em" }}>
                    {runwayDaysNum === null
                      ? "Set a monthly expense to unlock your runway clock"
                      : runwayDaysNum >= 365
                        ? `Runway secured · ${runwayDaysNum} days · Capital efficiency is strong`
                        : runwayDaysNum >= 180
                          ? `${runwayDaysNum} days of runway · room to grow`
                          : runwayDaysNum >= 90
                            ? `${runwayDaysNum} days of runway · consider reducing burn`
                            : runwayDaysNum >= 30
                              ? `${runwayDaysNum} days — your most important number right now`
                              : `${runwayDaysNum} days — critical, act now`}
                  </span>
                </div>

                {/* ── HERO BALANCE ── */}
                <div style={{
                  background: T.bgCard,
                  borderBottom: `1px solid ${T.border}`,
                  padding: "40px 32px 0",
                }}>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 12 }}>
                    Capital Position
                  </div>
                  <AnimatedCapital value={liquidity} fmt={fmt} style={{ marginBottom: 36 }} />
                  {/* Three supporting metrics — borderless row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: `1px solid ${T.border}` }}>
                    {/* Runway — text-only, not a dollar value */}
                    <div style={{ padding: "20px 24px", borderRight: `1px solid ${T.border}` }}>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 10 }}>Runway</div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 1, color: runwayDaysNum === null ? T.text3 : runwayDaysNum >= 180 ? T.green : runwayDaysNum >= 60 ? T.gold : T.red, marginBottom: 5 }}>
                        {runwayDaysNum === null ? "—" : runwayDaysNum >= 365 ? `${(runwayDaysNum/365).toFixed(1)}yr` : `${runwayDaysNum}d`}
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: T.text4 }}>{dailyBurn > 0 ? `${fmt(dailyBurn)}/day burn rate` : "add expenses to calculate"}</div>
                    </div>
                    {/* Daily Burn — animated */}
                    <div style={{ padding: "20px 24px", borderRight: `1px solid ${T.border}` }}>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 10 }}>Daily Burn</div>
                      {dailyBurn > 0
                        ? <AnimatedValue value={dailyBurn} fmt={fmt} fontSize={20} color={T.text1} style={{ marginBottom: 5 }} />
                        : <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, color: T.text3, marginBottom: 5 }}>—</div>}
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: T.text4 }}>{dailyBurn > 0 ? `${fmt(dailyBurn * 30.44)} per month` : "no expenses yet"}</div>
                    </div>
                    {/* Month Net — animated, signed */}
                    <div style={{ padding: "20px 24px" }}>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 10 }}>{MONTHS_SHORT[period.m]} Net</div>
                      {monthIncome === 0 && monthExpenses === 0
                        ? <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, color: T.text3, marginBottom: 5 }}>—</div>
                        : <AnimatedValue value={monthNet} fmt={fmt} signed fontSize={20} color={monthNet > 0 ? T.green : monthNet < 0 ? T.red : T.text3} style={{ marginBottom: 5 }} />}
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: T.text4 }}>{monthNet > 0 ? "positive cash flow" : monthNet < 0 ? "deficit this month" : "no transactions yet"}</div>
                    </div>
                  </div>
                </div>

                {/* ── TREND DIRECTION ── */}
                <div style={{
                  padding: "24px 32px",
                  borderBottom: `1px solid ${T.border}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
                }}>
                  <div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 5, color: chartMomentum === "up" ? T.green : chartMomentum === "down" ? T.red : T.text2 }}>
                      {chartMomentum === "up" ? "↑ Improving" : chartMomentum === "down" ? "↓ Watch your burn rate" : "→ Holding steady"}
                    </div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text3, lineHeight: 1.6, letterSpacing: "-0.01em" }}>
                      {momIncomePct !== null && momExpensePct !== null
                        ? `Income ${momIncomePct >= 0 ? "up" : "down"} ${Math.abs(momIncomePct).toFixed(0)}% · Expenses ${momExpensePct >= 0 ? "up" : "down"} ${Math.abs(momExpensePct).toFixed(0)}% vs last month`
                        : monthNet !== 0
                          ? `${monthNet >= 0 ? "Net surplus" : "Net deficit"} of ${fmt(Math.abs(monthNet))} this month`
                          : "Log transactions to see your trend analysis"}
                    </div>
                  </div>
                  {monthlyChartData.filter(d => d.Income > 0 || d.Expenses > 0).length > 1 && (
                    <div style={{ flexShrink: 0 }}>
                      <ResponsiveContainer width={160} height={44}>
                        <AreaChart data={monthlyChartData.slice(-6).map(d => ({ ...d, Net: d.Income - d.Expenses }))} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="gOvNet" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={chartMomentum === "down" ? T.red : T.text1} stopOpacity={0.08} />
                              <stop offset="95%" stopColor={chartMomentum === "down" ? T.red : T.text1} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="Net" stroke={chartMomentum === "down" ? T.red : T.text2} strokeWidth={1.2} fill="url(#gOvNet)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* ── TOP PRIORITY SIGNAL ── */}
                {priorityActions.length > 0 && (() => {
                  const top = priorityActions[0];
                  const color = top.type === "alert" ? T.red : top.type === "warn" ? T.gold : top.type === "good" ? T.green : T.text2;
                  return (
                    <div style={{ padding: "20px 32px", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 3, height: "100%", background: color, borderRadius: 2, alignSelf: "stretch", flexShrink: 0, minHeight: 40 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 500, color: T.text1, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 6 }}>
                            {top.icon && <span aria-hidden="true">{top.icon}</span>}
                            <span className="sr-only">{top.type === "warn" || top.type === "alert" ? "Warning: " : top.type === "good" ? "Good news: " : "Info: "}</span>
                            {top.text}
                          </div>
                          {top.type === "alert" && (
                            <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                              <button
                                className="v-btn-ghost"
                                style={{ fontSize: 12, color: T.green, padding: 0 }}
                                onClick={() => { setForm({ ...blankForm(cats), type: 'income' }); setEditId(null); setNewTxView(true); }}
                              >
                                + Add income
                              </button>
                              <button
                                className="v-btn-ghost"
                                style={{ fontSize: 12, padding: 0 }}
                                onClick={() => setView('ledger')}
                              >
                                Review spending →
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── DAILY ACTIVITY TIMELINE ── */}
                {(() => {
                  const days = [];
                  for (let i = 13; i >= 0; i--) {
                    const d = new Date(); d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().split("T")[0];
                    const importedDay = importedTxs.filter(t => !t.hidden && !t.transfer && t.date === dateStr);
                    const dayTxs = [...txs.filter(t => t.date === dateStr && !t.isRecurringInstance), ...importedDay];
                    const income  = dayTxs.filter(t => t.type === "income").reduce((s,t) => s + t.amount, 0);
                    const expense = dayTxs.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
                    days.push({ dateStr, d, income, expense, net: income - expense, txCount: dayTxs.length, dayTxs });
                  }
                  const maxAbs = Math.max(...days.map(d => Math.abs(d.net)), 1);
                  const todayStr = new Date().toISOString().split("T")[0];
                  return (
                    <div>
                      <div style={{ padding: "20px 32px 8px", fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4 }}>
                        Last 14 Days
                      </div>
                      {days.map(({ dateStr, d, net, txCount, dayTxs }) => {
                        const isExpanded = expandedTimelineDay === dateStr;
                        const isEmpty    = txCount === 0;
                        const isToday    = dateStr === todayStr;
                        const dayLabel   = `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${String(d.getDate()).padStart(2,"0")}`;
                        const barPct     = isEmpty ? 0 : Math.max(2, (Math.abs(net) / maxAbs) * 100);
                        return (
                          <div key={dateStr}>
                            <div
                              onClick={() => !isEmpty && setExpandedTimelineDay(isExpanded ? null : dateStr)}
                              style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 32px", cursor: isEmpty ? "default" : "pointer", transition: "background 150ms ease" }}
                              onMouseEnter={e => { if (!isEmpty) e.currentTarget.style.background = T.bgSubtle; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: isToday ? 500 : 400, color: isToday ? T.text1 : T.text4, width: 54, flexShrink: 0, letterSpacing: "0.02em" }}>
                                {dayLabel}
                              </div>
                              <div style={{ flex: 1, height: 1, background: T.border, borderRadius: 1 }}>
                                {!isEmpty && <div style={{ height: "100%", width: `${barPct}%`, background: net >= 0 ? T.green : T.red, borderRadius: 1, opacity: 0.50 }} />}
                              </div>
                              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 400, letterSpacing: "-0.03em", color: isEmpty ? T.text4 : net >= 0 ? T.green : T.red, width: 88, textAlign: "right", flexShrink: 0 }}>
                                {isEmpty ? "—" : `${net >= 0 ? "+" : "−"}${fmt(Math.abs(net))}`}
                              </div>
                              {!isEmpty && <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: T.text4, width: 16, textAlign: "right", flexShrink: 0 }}>{txCount}</div>}
                            </div>
                            {isExpanded && dayTxs.length > 0 && (
                              <div style={{ padding: "6px 32px 10px 108px", borderBottom: `1px solid ${T.border}` }}>
                                {dayTxs.map(tx => (
                                  <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                                    <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: T.text2, letterSpacing: "-0.01em" }}>{tx.description || tx.category}</span>
                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 400, color: tx.type === "income" ? T.green : T.red }}>
                                      {tx.type === "income" ? "+" : "−"}{fmt(tx.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── EMPTY STATE ── */}
                {txs.length === 0 && importedTxs.filter(t => !t.hidden && !t.transfer).length === 0 && (
                  <div style={{ padding: "64px 32px", textAlign: "center" }}>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 15, fontWeight: 400, letterSpacing: "-0.02em", color: T.text2, marginBottom: 8 }}>Your vault is empty</div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: T.text4, letterSpacing: "-0.01em" }}>Record your first transaction to begin</div>
                  </div>
                )}

              </div>
            )}

            {/* ─── CALENDAR ─── */}
            {view === "calendar" && (
              <div className="v-cal-wrapper">
                <div className="v-cal-grid">
                  {/* Main calendar */}
                  <div className="v-cal-main">
                    <div className="v-cal-month-header">
                      <div>
                        <div className="v-label" style={{ fontSize:7.5, marginBottom:4 }}>Month View</div>
                        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:700, color:T.text1, letterSpacing:"-0.01em" }}>
                          {MONTHS_FULL[period.m].toUpperCase()} {period.y}
                        </div>
                      </div>

                      {/* Month KPIs */}
                      <div style={{ display:"flex", alignItems:"center" }}>
                        {/* NET — signed animated */}
                        <div style={{ padding:"6px 20px 6px" }}>
                          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:8, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:5 }}>NET</div>
                          <AnimatedValue value={monthNet} fmt={fmt} signed fontSize={13} color={monthNet>=0?T.green:T.red} />
                        </div>
                        {/* INCOME */}
                        <div style={{ padding:"6px 20px 6px", borderLeft:`1px solid ${T.border}` }}>
                          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:8, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:5 }}>INCOME</div>
                          <AnimatedValue value={monthIncome} fmt={fmt} fontSize={13} color={T.green} />
                        </div>
                        {/* BURN */}
                        <div style={{ padding:"6px 20px 6px", borderLeft:`1px solid ${T.border}` }}>
                          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:8, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:5 }}>BURN</div>
                          <AnimatedValue value={monthExpenses} fmt={fmt} fontSize={13} color={T.red} />
                        </div>
                      </div>

                      <div style={{ display:"flex", gap:14 }}>
                        {[{c:T.green,l:"Gain"},{c:T.red,l:"Loss"}].map(x=>(
                          <span key={x.l} style={{ display:"inline-flex",alignItems:"center",gap:5,fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.text2,letterSpacing:"0.12em" }}>
                            <span style={{ width:8,height:1,background:x.c,display:"inline-block" }} />{x.l}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Day-of-week header */}
                    <div className="v-cal-day-labels">
                      {DAY_LABELS.map((d, i) => (
                        <div key={d} className={`v-cal-day-label${i===0||i===6?" weekend":""}`}>{d}</div>
                      ))}
                    </div>

                    {/* Calendar cells */}
                    <div className="v-cal-cells">
                      {Array.from({length:firstWeekday(period.y,period.m)}).map((_,i) => (
                        <div key={`empty-${i}`} className="v-cal-empty" />
                      ))}
                      {Array.from({length:daysInMonth(period.y,period.m)},(_,i)=>i+1).map(day => {
                        const d=calMap[day];
                        const _today=getToday(); const isToday=day===_today.getDate()&&period.m===_today.getMonth()&&period.y===_today.getFullYear();
                        const isSel=selDay===day;
                        const dayNet=d?(d.income-d.expense):0;
                        const hasGain=d&&d.income>d.expense;
                        const hasLoss=d&&d.expense>d.income;
                        const dow = (firstWeekday(period.y,period.m) + day - 1) % 7;
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <div
                            key={day}
                            onClick={() => setSelDay(isSel ? null : day)}
                            className={`v-cal-day${isSel ? " selected" : ""}${isToday ? " today" : ""}${hasGain ? " has-gain" : ""}${hasLoss && !hasGain ? " has-loss" : ""}`}
                            style={{ opacity: isWeekend && !d ? 0.6 : 1 }}
                          >
                            {/* Top row: day number + tx count badge */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: 4,
                            }}>
                              {isToday ? (
                                <div className="v-cal-today-pill">{String(day).padStart(2, "0")}</div>
                              ) : (
                                <div style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 11,
                                  color: isSel ? T.blue : isWeekend ? T.text4 : T.text3,
                                  fontWeight: 300,
                                  letterSpacing: "0.04em",
                                  lineHeight: 1,
                                }}>
                                  {String(day).padStart(2, "0")}
                                </div>
                              )}

                            </div>

                            {/* ── CENTERED net amount + sub-row ── */}
                            {d && (
                              <div style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 3,
                              }}>
                                {/* Net amount — centered */}
                                <div style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 12,
                                  fontWeight: 500,
                                  letterSpacing: "-0.03em",
                                  lineHeight: 1,
                                  color: dayNet >= 0 ? T.green : T.red,
                                  textAlign: "center",
                                  width: "100%",
                                }}>
                                  {fmtCalDay(dayNet, currency)}
                                </div>


                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day detail panel */}
                  <div className="v-panel" style={{ position:"sticky", top:0, alignSelf:"start" }}>
                    {selDay && dayData ? (
                      <>
                        {/* Header: date + net */}
                        <div className="v-panel-header">
                          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:9, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:10 }}>
                            {MONTHS_FULL[period.m]} {selDay}, {period.y}
                          </div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:400, letterSpacing:"-0.05em", color:dayData.income-dayData.expense>=0?T.green:T.red, lineHeight:1, marginBottom:16 }}>
                            {fSign(dayData.income-dayData.expense)}
                          </div>
                          {/* Inline income / burn row */}
                          <div style={{ display:"flex", alignItems:"center", gap:0 }}>
                            {dayData.income > 0 && (
                              <div style={{ flex:1 }}>
                                <div style={{ fontFamily:"'Inter',sans-serif", fontSize:8, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:4 }}>Income</div>
                                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:400, color:T.green, letterSpacing:"-0.03em" }}>{fmt(dayData.income)}</div>
                              </div>
                            )}
                            {dayData.income > 0 && dayData.expense > 0 && (
                              <div style={{ width:1, height:28, background:T.border, flexShrink:0, margin:"0 14px" }} />
                            )}
                            {dayData.expense > 0 && (
                              <div style={{ flex:1 }}>
                                <div style={{ fontFamily:"'Inter',sans-serif", fontSize:8, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:4 }}>Burn</div>
                                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:400, color:T.red, letterSpacing:"-0.03em" }}>{fmt(dayData.expense)}</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Transaction list — lean rows */}
                        <div style={{ overflowY:"auto", maxHeight:460 }}>
                          {[...dayData.txs].sort((a,b)=>a.type.localeCompare(b.type)).map((tx,i) => {
                            const isInc=tx.type==="income";
                            return (
                              <div key={i} style={{ padding:"13px 16px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:500, color:T.text1, letterSpacing:"-0.01em", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                    {tx.description || tx.category}
                                  </div>
                                  <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, color:T.text4, letterSpacing:"0.02em" }}>
                                    {tx.category}{tx.description && tx.description !== tx.category ? "" : ""}
                                  </div>
                                  <div style={{ display:"flex", gap:8, marginTop:6 }}>
                                    {!tx.isRecurringInstance && (
                                      <button className="v-btn-ghost" onClick={()=>openEdit(tx)} style={{ fontSize:9, letterSpacing:"0.08em" }}>EDIT</button>
                                    )}
                                    <button className="v-btn-ghost" onClick={()=>{handleDelete(tx);if(calMap[selDay]?.txs.length<=1)setSelDay(null);}}
                                      style={{ fontSize:9, letterSpacing:"0.08em", color:T.text4 }}
                                      onMouseEnter={e=>e.currentTarget.style.color=T.red}
                                      onMouseLeave={e=>e.currentTarget.style.color=T.text4}>DEL</button>
                                  </div>
                                </div>
                                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:400, color:isInc?T.green:T.red, letterSpacing:"-0.04em", flexShrink:0 }}>
                                  {isInc?"+":"−"}{fmt(tx.amount)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : selDay ? (
                      <div style={{ padding:"36px 20px", textAlign:"center" }}>
                        <div className="v-label" style={{ fontSize:7.5, marginBottom:8 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}</div>
                        <div style={{ fontSize:11.5, color:T.text3, marginBottom:20, lineHeight:1.7 }}>No transactions recorded.</div>
                        <button onClick={()=>{setForm({...blankForm(cats),date:`${period.y}-${String(period.m+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`});setNewTxView(true);}}
                          className="v-btn-secondary" style={{ fontSize:8, letterSpacing:"0.18em" }}>RECORD ENTRY</button>
                      </div>
                    ) : (
                      <div style={{ padding: "20px 16px" }}>
                        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:9, fontWeight:600, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:18 }}>
                          {MONTHS_SHORT[period.m]} {period.y}
                        </div>
                        {[
                          { label: "Income",       value: fmt(monthIncome),   color: monthIncome > 0 ? T.green : T.text4 },
                          { label: "Burn",         value: fmt(monthExpenses), color: monthExpenses > 0 ? T.red : T.text4 },
                          { label: "Net",          value: fSign(monthNet),    color: monthNet > 0 ? T.green : monthNet < 0 ? T.red : T.text4 },
                          { label: "Transactions", value: `${monthTxs.filter(t=>!t.isRecurringInstance).length}`, color: T.text2 },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"10px 0", borderBottom:`1px solid ${T.border}` }}>
                            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:11, color:T.text3, letterSpacing:"-0.01em" }}>{label}</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:400, color, letterSpacing:"-0.04em" }}>{value}</span>
                          </div>
                        ))}
                        <div style={{ marginTop:24, fontFamily:"'Inter',sans-serif", fontSize:9, color:T.text4, letterSpacing:"0.08em", textTransform:"uppercase", textAlign:"center" }}>
                          Select a date
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── LEDGER ─── */}
            {view === "ledger" && (
              <>
                {/* ── Hero Summary ── */}
                <div className="ldg-hero">
                  <div className="ldg-hero-eyebrow">
                    {ledgerSearchActive ? "Filtered Net" : "All-Time Net"}
                  </div>
                  <AnimatedValue
                    value={ledgerSearchNet}
                    fmt={fmt}
                    signed
                    fontSize={42}
                    color={ledgerSearchNet >= 0 ? T.green : T.red}
                    style={{ letterSpacing: "-0.05em", lineHeight: 1 }}
                  />
                  <div className="ldg-hero-breakdown">
                    <div className="ldg-hero-stat">
                      <span className="ldg-hero-stat-label">Income</span>
                      <span className="ldg-hero-stat-value" style={{ color: T.green }}>{fmt(ledgerSearchIncome)}</span>
                    </div>
                    <div className="ldg-hero-sep" />
                    <div className="ldg-hero-stat">
                      <span className="ldg-hero-stat-label">Expenses</span>
                      <span className="ldg-hero-stat-value" style={{ color: T.red }}>{fmt(ledgerSearchExpenses)}</span>
                    </div>
                    <div className="ldg-hero-sep" />
                    <div className="ldg-hero-stat">
                      <span className="ldg-hero-stat-label">Records</span>
                      <span className="ldg-hero-stat-value" style={{ color: T.text2 }}>{ledgerTxs.length}</span>
                    </div>
                  </div>
                </div>

                {/* ── Filter bar ── */}
                <div className="ldg-filter-bar">
                  <div className="v-search-wrap ldg-search-wrap">
                    <span className="v-search-icon">⌕</span>
                    <input type="text" className="v-search-input ldg-search-input"
                      placeholder="Search transactions…"
                      value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} />
                    {ledgerSearch && (
                      <button className="v-search-clear" onClick={() => setLedgerSearch("")}>×</button>
                    )}
                  </div>
                  <div className="ldg-pills">
                    {[["all","All"],["income","Income"],["expense","Expenses"]].map(([val,lbl]) => (
                      <button key={val} className={`ldg-pill${txFilter===val?" active":""}`}
                        onClick={() => setTxFilter(val)}>{lbl}</button>
                    ))}
                  </div>
                  <DateRangeFilter from={ledgerFrom} to={ledgerTo} onFrom={setLedgerFrom} onTo={setLedgerTo}
                    onClear={() => { setLedgerFrom(""); setLedgerTo(""); }} />
                  <div className="ldg-exports">
                    <button className="v-btn-ghost" onClick={exportCSV}>CSV ↓</button>
                    <button className="v-btn-ghost" onClick={exportJSON}>JSON ↓</button>
                  </div>
                </div>

                {/* ── Transaction list ── */}
                <TxFeed txs={ledgerTxs} onEdit={openEdit} onDelete={handleDelete} fmt={fmt} />
              </>
            )}

            {/* ─── BANKS ─── */}
            {view === "banks" && (
              <div style={{ paddingBottom: 60 }}>
                <div style={{ padding: "28px 32px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 8 }}>
                    Connected Banks
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.02em", color: T.text1, marginBottom: 24 }}>
                    Bank Sync
                  </div>
                </div>

                <VaultBankConnect
                  session={session}
                  onConnected={refetchPlaid}
                  T={T}
                />

                <VaultConnectedAccounts
                  session={session}
                  items={plaidItems}
                  syncing={plaidSyncing}
                  onSync={triggerSync}
                  onDisconnect={refetchPlaid}
                  T={T}
                />
              </div>
            )}

            {/* ─── SETTINGS ─── */}
            {view === "settings" && (
              <>
                <div className="v-settings-tabs">
                {[["data","Data"],["budgets","Budgets"],["categories","Categories"],["mockdata","Sample Data"],["danger","Danger Zone"]].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setSettingsTab(id)} className={`v-settings-tab${settingsTab===id?" active":""}`}>{lbl}</button>
                  ))}
                </div>

                {settingsTab==="data" && (
                  <div className="v-settings-grid">
                    <SettingsCard title="Backup & Restore" desc="Export a complete JSON backup of all data including budgets, categories, and settings. Import to restore.">
                      <button onClick={exportJSON} className="v-btn-primary" style={{ width:"auto", padding:"9px 16px" }}>EXPORT JSON</button>
                      <label className="v-btn-secondary" style={{ cursor:"pointer" }}>
                        IMPORT JSON
                        <input type="file" accept="application/json,.json" style={{ display:"none" }}
                          onChange={async e => { const f=e.target.files?.[0]; e.target.value=""; if(!f)return; try{await importFile(f);}catch(err){addToast(err?.message||"Import failed","err");} }} />
                      </label>
                    </SettingsCard>
                    <SettingsCard
                      title={<span style={{ display:'flex', alignItems:'center', gap:6 }}>Monthly Statement <ProBadge /></span>}
                      desc={`Export a branded PDF statement for ${MONTHS_FULL[period.m]} ${period.y}. Includes capital summary, category breakdown, and full transaction ledger.`}
                    >
                      <VaultExportButton
                        period={period}
                        txs={txs}
                        baseLiq={baseLiq}
                        accountEmail={accountEmail}
                        budgets={budgets}
                      />
                    </SettingsCard>
                    <SettingsCard title="CSV Export" desc="Export all transactions as CSV for use in Excel, Google Sheets, or reporting tools.">
                      <button onClick={exportCSV} className="v-btn-secondary">EXPORT CSV</button>
                    </SettingsCard>
                    <SettingsCard
                      title={<span style={{ display:'flex', alignItems:'center', gap:6 }}>Multi-Entity Support <ProBadge /></span>}
                      desc="Manage separate ledgers for multiple business entities or income streams — switching between them without data mixing."
                    >
                      <button disabled style={{ padding:'9px 16px', background:T.bgSubtle, border:`1px solid ${T.border}`, borderRadius:6, fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:600, color:T.text4, cursor:'not-allowed', letterSpacing:'0.04em' }}>Coming Soon</button>
                    </SettingsCard>
                  </div>
                )}

                {settingsTab==="budgets" && (
                  <div className="v-settings-card">
                    <div className="v-label" style={{ fontSize:7.5, marginBottom:5 }}>Monthly Budget Limits</div>
                    <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:22 }}>Set monthly spend limits per category. Alerts fire at 80% utilization.</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      {cats.expense.map(cat => {
                        const current  = budgets[cat]||0;
                        const inputVal = budgetInput[cat]!==undefined?budgetInput[cat]:(current?String(current):"");
                        const spent    = catBreakdown.find(([c])=>c===cat)?.[1]||0;
                        return (
                          <div key={cat} style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <label style={{ fontSize:11.5, color:T.text2 }}>{cat}</label>
                              {current > 0 && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text2 }}>Spent: {fmt(spent)}</span>}
                            </div>
                            <input type="number" step="0.01" min="0" placeholder="No limit" value={inputVal}
                              onChange={e=>setBudgetInput(p=>({...p,[cat]:e.target.value}))}
                              style={{ ...inputSx, fontSize:12 }} />
                            {current > 0 && (
                              <div style={{ height:1, background:"rgba(0,0,0,0.06)" }}>
                                <div style={{ height:"100%", width:`${Math.min((spent/current)*100,100)}%`, background:spent>current?T.red:spent/current>=0.8?T.gold:T.green, opacity:0.6 }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={commitBudgets} className="v-btn-primary" style={{ marginTop:24, width:"auto", padding:"9px 20px" }}>Save Limits</button>
                  </div>
                )}

                {settingsTab==="categories" && (
                  <div className="v-settings-grid">
                    {["income","expense"].map(type => (
                      <div key={type} className="v-settings-card">
                        <div className="v-label" style={{ fontSize:7.5, marginBottom:5 }}>{type.toUpperCase()} Categories</div>
                        <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:14 }}>Default categories are system-locked.</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:14, maxHeight:240, overflowY:"auto" }}>
                          {DEFAULT_CATS[type].map(cat=>(
                            <div key={cat} style={{ padding:"7px 10px", background:T.bgSubtle, fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, color:T.text2, display:"flex", justifyContent:"space-between" }}>
                              <span>{cat}</span><span style={{ fontSize:7, color:T.text4, letterSpacing:"0.14em" }}>SYSTEM</span>
                            </div>
                          ))}
                          {(customCats[type]||[]).map(cat=>(
                            <div key={cat} style={{ padding:"7px 10px", background:T.bgSubtle, border:`1px solid ${T.border}`, fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, color:T.text2, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span>{cat}</span>
                              <button className="v-btn-ghost" onClick={()=>removeCustomCat(type,cat)}
                                style={{ color:T.text3 }}
                                onMouseEnter={e=>e.currentTarget.style.color=T.red}
                                onMouseLeave={e=>e.currentTarget.style.color=T.text3}>✕</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:6 }}>
                          <input type="text" placeholder="New category…" value={newCatInput[type]||""}
                            onChange={e=>setNewCatInput(p=>({...p,[type]:e.target.value}))}
                            onKeyDown={e=>e.key==="Enter"&&addCustomCat(type)}
                            style={{ ...inputSx, fontSize:12, flex:1 }} />
                          <button onClick={()=>addCustomCat(type)} className="v-btn-secondary" style={{ padding:"9px 13px", fontSize:9, whiteSpace:"nowrap" }}>+ Add</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── MOCK DATA TAB ── */}
                {settingsTab==="mockdata" && (
                  <div className="v-settings-card">
                    <div className="v-label" style={{ fontSize:7.5, marginBottom:5 }}>Sample Data Generator</div>
                    <div style={{ fontSize:12, color:T.text2, lineHeight:1.9, marginBottom:24 }}>
                      Load 12 months of realistic sample data to explore Vault's features. This includes salary income, recurring expenses across all categories, quarterly tax payments, and pre-configured budget limits.
                    </div>

                    {/* Preview cards */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:1, background:T.border, marginBottom:24 }}>
                      {[
                        { label:"Months of Data", value:"12", sub:"Mar 2025 → Mar 2026" },
                        { label:"Sample Records", value:"~130", sub:"Across all categories" },
                        { label:"Base Capital", value:"$15,000", sub:"Starting liquidity" },
                      ].map(item => (
                        <div key={item.label} style={{ padding:"16px 18px", background:T.bgCard }}>
                          <div className="v-label" style={{ fontSize:7, marginBottom:8 }}>{item.label}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:500, color:T.text2, letterSpacing:"-0.03em", marginBottom:4 }}>{item.value}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text3 }}>{item.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Category coverage */}
                    <div style={{ marginBottom:22 }}>
                      <div className="v-label" style={{ fontSize:7, marginBottom:10 }}>Category Coverage</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {["Salary","Investment Returns","Operations","Payroll","Technology","Marketing","Travel","Utilities","Insurance","Taxes","Transportation","Tools"].map(cat => (
                          <span key={cat} className="v-tag" style={{ color:T.text2, borderColor:T.border }}>{cat}</span>
                        ))}
                      </div>
                    </div>

                    {/* Budget limits included */}
                    <div style={{ padding:"14px 16px", background:T.bgSubtle, border:`1px solid ${T.border}`, marginBottom:22 }}>
                      <div className="v-label" style={{ fontSize:7, marginBottom:8, color:T.gold }}>Also includes budget limits</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:T.text2, lineHeight:1.8, letterSpacing:"0.04em" }}>
                        Operations $2,500 · Payroll $5,000 · Marketing $1,000 · Technology $400 · Travel $800 · Utilities $300 · Insurance $400 · Taxes $2,500
                      </div>
                    </div>

                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <button onClick={loadMockData} className="v-btn-primary" style={{ width:"auto", padding:"11px 24px", fontSize:9 }}>
                        LOAD SAMPLE DATA
                      </button>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"rgba(255,127,159,0.5)", alignSelf:"center", letterSpacing:"0.06em" }}>
                        ⚠ Replaces all existing data
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab==="danger" && (
                  <div className="v-settings-card" style={{ border:`1px solid rgba(255,77,106,0.1)`, borderTop:`2px solid rgba(255,77,106,0.25)` }}>
                    <div className="v-label" style={{ fontSize:7.5, color:T.red, marginBottom:5 }}>Danger Zone</div>
                    <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
                      Permanently destroys all transactions, budgets, and configurations. Export a backup before proceeding.
                    </div>
                    <button onClick={resetAllData} className="v-danger-btn">PURGE ALL DATA</button>
                  </div>
                )}
              </>
            )}


            {/* ─── INVESTMENTS / LIABILITIES ─── */}
            {view === "investments" && (
              <ErrorBoundary>
                <VaultInvestments T={T} fmt={fmt} />
              </ErrorBoundary>
            )}

            </div>
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <div className="v-mobile-bottomnav">
        {[["overview","Overview"],["calendar","Calendar"],["ledger","Ledger"],["settings","Settings"]].map(([id,lbl])=>(
          <button key={id} className={`v-mobile-nav-item${view===id?" active":""}`} onClick={()=>setView(id)}>
            {NavIcons[id]}
            <span>{lbl}</span>
          </button>
        ))}
      </div>

      <button className="v-mobile-add-fab" onClick={() => { setEditId(null); setForm({ ...blankForm(cats) }); setNewTxView(true); }}>+</button>

      {/* ── TRANSACTION MODAL ── */}
      {newTxView && form && (
        <TransactionDrawer
          open={newTxView}
          onClose={() => { setNewTxView(false); setEditId(null); setForm(blankForm(cats)); }}
          form={form}
          setForm={setForm}
          editId={editId}
          cats={cats}
          amountDisplay={amountDisplay}
          commitTx={commitTx}
          T={T}
          theme={theme}
        />
      )}

      {scopeAction && (
        <RecurringScopeModal
          action={scopeAction.action}
          tx={scopeAction.tx}
          onThis={handleScopeThis}
          onAll={handleScopeAll}
          onClose={()=>setScopeAction(null)}
        />
      )}

      {modal === "health-info" && (
        <Modal onClose={() => setModal(null)} width={440}>
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:16, letterSpacing:"-0.02em" }}>How the Health Score is Calculated</div>
            <div style={{ fontSize:12, color:T.text3, lineHeight:1.7, marginBottom:16 }}>
              The score (0–100) weights five financial signals:
            </div>
            {[
              { label:"Base", pts:"40 pts", desc:"Starting baseline — everyone begins here." },
              { label:"Liquidity buffer", pts:"±15 pts", desc:"Positive available capital adds 15 points; negative deducts." },
              { label:"Savings rate", pts:"up to +25 pts", desc:"20%+ savings rate adds 25. 10–20% adds 18. 0–10% adds 8. Negative deducts 5." },
              { label:"Runway", pts:"up to +15 pts", desc:"12+ months adds 15. 6–12 months adds 12. 3–6 months adds 6. Under 3 months: 0." },
              { label:"Budget discipline", pts:"up to +5 pts", desc:"No categories over budget: +5. Some overages reduce or eliminate this bonus." },
            ].map(({ label, pts, desc }) => (
              <div key={label} style={{ display:"flex", gap:12, marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${T.border}` }}>
                <div style={{ flexShrink:0, width:140 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T.text1 }}>{label}</div>
                  <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:T.blue, marginTop:2 }}>{pts}</div>
                </div>
                <div style={{ fontSize:12, color:T.text3, lineHeight:1.6 }}>{desc}</div>
              </div>
            ))}
            <div style={{ fontSize:11, color:T.text4, marginTop:8, fontStyle:"italic" }}>
              Scores are a directional signal, not a precise grade. They reset each period as your data changes.
            </div>
            <button onClick={() => setModal(null)} className="v-btn-secondary" style={{ marginTop:20, width:"100%", padding:"10px 0" }}>Close</button>
          </div>
        </Modal>
      )}

      {modal === "shortcuts" && (
        <Modal onClose={() => setModal(null)} width={400}>
          <div style={{ fontFamily:"'Inter',sans-serif" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:16, letterSpacing:"-0.02em" }}>Keyboard Shortcuts</div>
            {[
              ["N", "New transaction"],
              ["[  ]", "Previous / next period"],
              ["← →", "Previous / next period"],
              ["/", "Open command palette"],
              ["⌘K / Ctrl+K", "Open command palette"],
              ["?", "Show shortcuts"],
              ["1–6", "Navigate views"],
              ["Esc", "Close modal / drawer"],
            ].map(([key, desc]) => (
              <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:T.blue,
                  background:T.bgSubtle, padding:"2px 8px", borderRadius:4, border:`1px solid ${T.border}` }}>{key}</span>
                <span style={{ fontSize:12, color:T.text3 }}>{desc}</span>
              </div>
            ))}
            <button onClick={() => setModal(null)} className="v-btn-secondary" style={{ marginTop:16, width:"100%", padding:"10px 0" }}>Close</button>
          </div>
        </Modal>
      )}

      {showCommandPalette && (
        <VaultCommandPalette
          onClose={() => setShowCommandPalette(false)}
          onNavigate={setView}
          onAddIncome={() => openAdd("income")}
          onAddExpense={() => openAdd("expense")}
          onExportPDF={() => { exportStatement({ txs, baseLiq, budgets, period, fmt, fSign }); }}
          onLoadSample={loadMockData}
          T={T}
        />
      )}

      <ToastStack toasts={toasts} remove={removeToast} />
    </>
  );
}