import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY   = "fic:v2";
const MONTHS_FULL   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const TODAY         = new Date();
const TODAY_STR     = TODAY.toISOString().split("T")[0];
const SECONDS_PER_MONTH = 30.4375 * 24 * 60 * 60;

const DEFAULT_CATS = {
  income:  ["Salary","Consulting","Business Revenue","Investment Returns","Dividends","Capital Gains","Real Estate","Partnership Distribution","Other Income"],
  expense: ["Operations","Payroll","Technology","Marketing","Real Estate","Legal & Compliance","Travel","Healthcare","Utilities","Food & Dining","Transportation","Insurance","Taxes","Other"],
};

const CURRENCIES = [
  { code:"USD", symbol:"$", name:"US Dollar" },
  { code:"EUR", symbol:"€", name:"Euro" },
  { code:"GBP", symbol:"£", name:"British Pound" },
  { code:"JPY", symbol:"¥", name:"Japanese Yen" },
  { code:"CAD", symbol:"CA$", name:"Canadian Dollar" },
  { code:"AUD", symbol:"A$", name:"Australian Dollar" },
  { code:"CHF", symbol:"Fr", name:"Swiss Franc" },
  { code:"INR", symbol:"₹", name:"Indian Rupee" },
  { code:"BRL", symbol:"R$", name:"Brazilian Real" },
  { code:"MXN", symbol:"MX$", name:"Mexican Peso" },
];

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const clampDay = (y, m, day) => {
  const dim = new Date(y, m + 1, 0).getDate();
  return Math.min(Math.max(1, day), dim);
};

function projectedInstancesForMonth(tx, y, m) {
  if (!tx?.recurring || !tx.recurringFreq) return [];
  const start = new Date(tx.date + "T12:00:00");
  const monthStart = new Date(y, m, 1, 12);
  const monthEnd   = new Date(y, m + 1, 0, 12);
  if (monthEnd < start) return [];

  if (tx.recurringFreq === "monthly") {
    const isStartMonth = start.getFullYear() === y && start.getMonth() === m;
    if (isStartMonth) return [];
    const day  = clampDay(y, m, start.getDate());
    const date = new Date(y, m, day, 12).toISOString().split("T")[0];
    return [{ ...tx, id:`${tx.id}_p_${y}-${String(m+1).padStart(2,"0")}`, date, isRecurringInstance:true, recurringParentId:tx.id }];
  }

  const out = [];
  let cur = new Date(start);
  while (cur < monthStart) cur.setDate(cur.getDate() + 7);
  while (cur <= monthEnd) {
    const date = cur.toISOString().split("T")[0];
    out.push({ ...tx, id:`${tx.id}_p_${date}`, date, isRecurringInstance:true, recurringParentId:tx.id });
    cur = new Date(cur); cur.setDate(cur.getDate() + 7);
  }
  const startInMonth = start >= monthStart && start <= monthEnd;
  return startInMonth ? out.filter(t => t.date !== tx.date) : out;
}

function txsForMonth(allRealTxs, y, m) {
  const base = allRealTxs.filter(t => txYear(t) === y && txMonth(t) === m);
  const projs = [];
  allRealTxs.forEach(t => projs.push(...projectedInstancesForMonth(t, y, m)));
  return [...base, ...projs];
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY
// ─────────────────────────────────────────────────────────────────────────────
function makeFmt(currencyCode = "USD") {
  const info = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  const fmt = (n) =>
    new Intl.NumberFormat("en-US", {
      style:"currency", currency: info.code,
      minimumFractionDigits:2, maximumFractionDigits:2,
    }).format(typeof n === "number" && !Number.isNaN(n) ? n : 0);
  const fSign = (n) => {
    const v = typeof n === "number" && !Number.isNaN(n) ? n : 0;
    return (v >= 0 ? "+" : "−") + fmt(Math.abs(v));
  };
  return { fmt, fSign, symbol: info.symbol, code: info.code };
}

const formatRunway = totalSeconds => {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const totalMonths = totalSeconds / SECONDS_PER_MONTH;
  const years = Math.floor(totalMonths / 12);
  const totalDays = Math.max(0, Math.floor(totalSeconds / (24 * 60 * 60)));
  const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits:1, minimumFractionDigits:1 });
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits:0 });
  if (years >= 2)      return { primary:`${nf1.format(totalMonths/12)} years`,  secondary:`At current burn (≈ ${nf0.format(totalDays)} days)` };
  if (totalMonths >= 1) return { primary:`${nf1.format(totalMonths)} months`, secondary:`At current burn (≈ ${nf0.format(totalDays)} days)` };
  if (totalDays >= 1)   return { primary:`${nf0.format(totalDays)} days`,     secondary:"At current burn" };
  const hours = Math.floor(totalSeconds / 3600);
  if (hours >= 1)       return { primary:`${nf0.format(hours)} hours`,         secondary:"At current burn" };
  return { primary:`${Math.max(1, Math.floor(totalSeconds/60))} minutes`, secondary:"At current burn" };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const blankForm = (cats) => ({
  type:"expense", amount:"", category: cats?.expense?.[0] || "Operations",
  date:TODAY_STR, description:"", tags:"", recurring:false,
  recurringFreq:"monthly",
});
const daysInMonth  = (y, m) => new Date(y, m+1, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m, 1).getDay();
const parseDate    = s => new Date(s + "T12:00:00");
const txMonth      = t => parseDate(t.date).getMonth();
const txYear       = t => parseDate(t.date).getFullYear();
const txDay        = t => parseDate(t.date).getDate();

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────
function getStorage() {
  const w = typeof window !== "undefined" ? window : undefined;
  const hasWindowStorage = !!(w && w.storage && typeof w.storage.get === "function" && typeof w.storage.set === "function");

  if (hasWindowStorage) {
    return w.storage;
  }

  // localStorage fallback for normal browsers / GitHub Pages
  return {
    async get(key) {
      try {
        return { value: w?.localStorage?.getItem(key) ?? null };
      } catch (e) {
        console.error("[FIC] localStorage.get failed", e);
        return { value: null };
      }
    },
    async set(key, value) {
      try {
        w?.localStorage?.setItem(key, value);
      } catch (e) {
        console.error("[FIC] localStorage.set failed", e);
        throw e;
      }
    },
  };
}

async function loadData() {
  try {
    const storage = getStorage();
    const r = await storage.get(STORAGE_KEY);
    if (r?.value) {
      const d = JSON.parse(r.value);
      const txs = Array.isArray(d.txs) ? d.txs : [];
      const baseLiquidity = Number.parseFloat(d.baseLiquidity);
      return {
        txs: txs
          .filter(Boolean)
          .map(t => ({
            ...t,
            amount: Number(Number.parseFloat(t.amount).toFixed(2)),
          }))
          .filter(t => Number.isFinite(t.amount)),
        baseLiquidity: Number.isFinite(baseLiquidity) ? Number(baseLiquidity.toFixed(2)) : 0,
        budgets: d.budgets && typeof d.budgets === "object" ? d.budgets : {},
        customCats: d.customCats && typeof d.customCats === "object" ? d.customCats : { income:[], expense:[] },
        currency: typeof d.currency === "string" ? d.currency : "USD",
      };
    }
  } catch (e) {
    console.error("[FIC] loadData failed", e);
  }
  return { txs:[], baseLiquidity:0, budgets:{}, customCats:{ income:[], expense:[] }, currency:"USD" };
}
async function saveData(d) {
  try {
    const storage = getStorage();
    await storage.set(STORAGE_KEY, JSON.stringify(d));
  } catch (e) {
    console.error("[FIC] saveData failed", e);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, type = "info", onUndo) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type, onUndo }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
    return id;
  }, []);
  const removeToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return { toasts, addToast, removeToast };
}

function ToastStack({ toasts, removeToast }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", display:"flex", flexDirection:"column", gap:8, zIndex:999, alignItems:"center" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display:"flex", alignItems:"center", gap:14, padding:"12px 18px",
          background:"#1A1A1D", border:"1px solid rgba(255,255,255,.1)", borderRadius:10,
          boxShadow:"0 8px 32px rgba(0,0,0,.6)", fontSize:13, color:"#E4E4E7",
          animation:"toastIn .2s cubic-bezier(.34,1.56,.64,1)",
          minWidth:280, maxWidth:420,
        }}>
          <span style={{ flex:1 }}>{t.msg}</span>
          {t.onUndo && (
            <button onClick={() => { t.onUndo(); removeToast(t.id); }}
              style={{ background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.1)", borderRadius:6, color:"#F4F4F5", fontSize:11, fontWeight:600, letterSpacing:1.5, padding:"4px 10px", cursor:"pointer", fontFamily:"inherit" }}>
              UNDO
            </button>
          )}
          <button onClick={() => removeToast(t.id)} style={{ background:"none", border:"none", color:"#52525B", cursor:"pointer", fontSize:16, lineHeight:1, padding:0, fontFamily:"inherit" }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, fmt, fSign }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0E0E10", border:"1px solid rgba(255,255,255,.09)", borderRadius:8, padding:"11px 15px", fontFamily:'"JetBrains Mono",monospace', fontSize:11, minWidth:170 }}>
      <div style={{ color:"#52525B", marginBottom:8, letterSpacing:1.5, fontSize:9 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:20, marginBottom:3 }}>
          <span style={{ color:"#52525B" }}>{p.name}</span>
          <span style={{ fontWeight:600, color:p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div style={{ borderTop:"1px solid rgba(255,255,255,.05)", marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:"#3F3F46" }}>Net</span>
          <span style={{ fontWeight:600, color: payload[0].value - payload[1].value >= 0 ? "#22C55E" : "#EF4444" }}>
            {fSign(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const HR = () => <div style={{ height:1, background:"rgba(255,255,255,.04)", margin:"0 22px" }}/>;

function KPI({ label, value, sub, valueColor="#F4F4F5", badge }) {
  return (
    <div style={{ padding:"20px 22px", background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, minWidth:0, position:"relative" }}>
      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:14, textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</div>
      <div style={{ fontSize:20, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:valueColor, letterSpacing:-0.8, lineHeight:1.1, marginBottom:8, wordBreak:"break-word" }}>{value}</div>
      <div style={{ fontSize:11, color:"#71717A" }}>{sub}</div>
      {badge && <div style={{ position:"absolute", top:14, right:14, fontSize:8, letterSpacing:1.5, padding:"3px 8px", background:"rgba(245,158,11,.1)", color:"#F59E0B", borderRadius:4, fontWeight:700 }}>{badge}</div>}
    </div>
  );
}

function Field({ label, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 15 }}>
      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:8 }}>{label}</div>
      {children}
    </div>
  );
}

const inputBase = {
  width:"100%", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)",
  borderRadius:7, padding:"11px 14px", color:"#F4F4F5", fontSize:13, fontFamily:"inherit",
};

function Modal({ onClose, width=440, children }) {
  useEffect(() => {
    const esc = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.76)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(6px)" }}>
      <div style={{ width, maxWidth:"calc(100vw - 40px)", background:"#111113", border:"1px solid rgba(255,255,255,.09)", borderRadius:13, padding:"30px 32px", maxHeight:"90vh", overflowY:"auto" }}>
        {children}
      </div>
    </div>
  );
}

// Tag pill display
function TagPill({ tag }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", fontSize:10, padding:"2px 8px", background:"rgba(139,92,246,.1)", color:"#A78BFA", borderRadius:4, border:"1px solid rgba(139,92,246,.2)", letterSpacing:.5 }}>
      {tag}
    </span>
  );
}

function TxRow({ tx, onEdit, onDelete, compact, fmt }) {
  const py = compact ? "9px" : "12px";
  const [hov, setHov] = useState(false);
  const tags = tx.tags ? tx.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  return (
    <tr style={{ borderBottom:"1px solid rgba(255,255,255,.03)", background: hov ? "rgba(255,255,255,.018)" : "transparent", transition:"background .1s" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <td style={{ padding:`${py} 12px ${py} 22px`, fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B", whiteSpace:"nowrap" }}>
        {parseDate(tx.date).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
      </td>
      <td style={{ padding:`${py} 12px` }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
          <span style={{ fontSize:8, letterSpacing:2.5, padding:"3px 8px", background: tx.type==="income"?"rgba(34,197,94,.09)":"rgba(239,68,68,.09)", color: tx.type==="income"?"#22C55E":"#EF4444", borderRadius:4, fontWeight:700, whiteSpace:"nowrap" }}>
            {tx.type.toUpperCase()}
          </span>
          {tx.recurring && !tx.isRecurringInstance && (
            <span style={{ fontSize:9, padding:"2px 6px", background:"rgba(251,191,36,.08)", color:"#F59E0B", borderRadius:4, fontWeight:600 }}>↻</span>
          )}
          {tx.isRecurringInstance && (
            <span style={{ fontSize:9, padding:"2px 6px", background:"rgba(251,191,36,.05)", color:"rgba(245,158,11,.5)", borderRadius:4 }}>↻</span>
          )}
        </div>
      </td>
      <td style={{ padding:`${py} 12px`, fontSize:13, color:"#A1A1AA" }}>{tx.category}</td>
      <td style={{ padding:`${py} 12px`, fontSize:12, color:"#71717A", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {tx.description || <span style={{ color:"#27272A" }}>—</span>}
      </td>
      <td style={{ padding:`${py} 12px` }}>
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {tags.slice(0,2).map((tg,i) => <TagPill key={i} tag={tg}/>)}
          {tags.length > 2 && <span style={{ fontSize:10, color:"#52525B" }}>+{tags.length-2}</span>}
        </div>
      </td>
      <td style={{ padding:`${py} 12px`, textAlign:"right", fontSize:13, fontFamily:'"JetBrains Mono",monospace', fontWeight:600, color: tx.type==="income"?"#22C55E":"#EF4444", whiteSpace:"nowrap" }}>
        {tx.type==="income"?"+":"−"}{fmt(tx.amount)}
      </td>
      <td style={{ padding:`${py} 22px ${py} 12px`, textAlign:"right", whiteSpace:"nowrap" }}>
        {!tx.isRecurringInstance && (
          <button onClick={() => onEdit(tx)} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, marginRight:12, cursor:"pointer", fontFamily:"inherit", transition:"color .15s" }}
            onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>EDIT</button>
        )}
        <button onClick={() => onDelete(tx)} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, cursor:"pointer", fontFamily:"inherit", transition:"color .15s" }}
          onMouseEnter={e=>(e.currentTarget.style.color="#EF4444")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>DEL</button>
      </td>
    </tr>
  );
}

function TxTable({ txs, onEdit, onDelete, compact, fmt }) {
  if (!txs.length) return (
    <div style={{ padding:"44px 24px", textAlign:"center", color:"#27272A", fontSize:12 }}>No records found.</div>
  );
  return (
    <table style={{ width:"100%", borderCollapse:"collapse" }}>
      <thead>
        <tr style={{ borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          {["Date","Type","Category","Description","Tags","Amount",""].map((h, i) => (
            <th key={i} style={{ padding:`10px 12px 10px ${i===0?"22px":"12px"}`, textAlign: i===5?"right":"left", fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {txs.map(tx => <TxRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} compact={compact} fmt={fmt}/>)}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────
function BudgetBar({ cat, spent, limit, fmt }) {
  const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const over = spent > limit;
  const warn = pct >= 80 && !over;
  const color = over ? "#EF4444" : warn ? "#F59E0B" : "#22C55E";
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, alignItems:"center" }}>
        <span style={{ fontSize:12, color:"#A1A1AA" }}>{cat}</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B" }}>{fmt(spent)}</span>
          <span style={{ fontSize:10, color:"#3F3F46" }}>/</span>
          <span style={{ fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#71717A" }}>{fmt(limit)}</span>
          {over && <span style={{ fontSize:8, letterSpacing:1.5, color:"#EF4444", fontWeight:700 }}>OVER</span>}
          {warn && <span style={{ fontSize:8, letterSpacing:1.5, color:"#F59E0B", fontWeight:700 }}>ALERT</span>}
        </div>
      </div>
      <div style={{ height:3, background:"rgba(255,255,255,.05)", borderRadius:2 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2, transition:"width .4s ease", opacity: over ? 1 : .7 }}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING SCOPE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function RecurringScopeModal({ action, tx, onThis, onAll, onClose }) {
  return (
    <Modal onClose={onClose} width={400}>
      <div style={{ fontSize:9, letterSpacing:3, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>RECURRING TRANSACTION</div>
      <div style={{ fontSize:20, fontWeight:600, letterSpacing:-.5, marginBottom:10 }}>{action === "delete" ? "Delete" : "Edit"} which?</div>
      <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:24 }}>
        This transaction is part of a recurring series. Choose how far your change should reach.
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={onThis} style={{ padding:"14px 16px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:9, color:"#F4F4F5", fontSize:13, textAlign:"left", cursor:"pointer", transition:"background .15s" }}
          onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.08)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>
          <div style={{ fontWeight:600, marginBottom:3 }}>This occurrence only</div>
          <div style={{ fontSize:11, color:"#71717A" }}>Only affects the instance on {parseDate(tx.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
        </button>
        <button onClick={onAll} style={{ padding:"14px 16px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.08)", borderRadius:9, color:"#F4F4F5", fontSize:13, textAlign:"left", cursor:"pointer", transition:"background .15s" }}
          onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.08)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>
          <div style={{ fontWeight:600, marginBottom:3 }}>This and all future occurrences</div>
          <div style={{ fontSize:11, color:"#71717A" }}>Modifies the entire recurring series</div>
        </button>
      </div>
      <button onClick={onClose} style={{ marginTop:16, width:"100%", padding:"11px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:12, cursor:"pointer" }}>Cancel</button>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function Spark() {
  const [txs,          setTxs]          = useState([]);
  const [baseLiq,      setBaseLiq]      = useState(0);
  const [budgets,      setBudgets]      = useState({});
  const [customCats,   setCustomCats]   = useState({ income:[], expense:[] });
  const [currency,     setCurrency]     = useState("USD");
  const [loaded,       setLoaded]       = useState(false);
  const [view,         setView]         = useState("overview");
  const [modal,        setModal]        = useState(null);
  const [editId,       setEditId]       = useState(null);
  const [form,         setForm]         = useState(() => blankForm(DEFAULT_CATS));
  const [liqInput,     setLiqInput]     = useState("");
  const [chartMode,    setChartMode]    = useState("monthly");
  const [txFilter,     setTxFilter]     = useState("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerDateFrom, setLedgerDateFrom] = useState("");
  const [ledgerDateTo,   setLedgerDateTo]   = useState("");
  const [period,       setPeriod]       = useState({ m:TODAY.getMonth(), y:TODAY.getFullYear() });
  const [selDay,       setSelDay]       = useState(null);
  const [scopeAction,  setScopeAction]  = useState(null); // { action, tx }
  const [newCatInput,  setNewCatInput]  = useState({ income:"", expense:"" });
  const [budgetInput,  setBudgetInput]  = useState({});
  const [settingsTab,  setSettingsTab]  = useState("data");
  const [showProjected, setShowProjected] = useState(false);

  const { toasts, addToast, removeToast } = useToast();

  // Derived currency formatters
  const { fmt, fSign } = useMemo(() => makeFmt(currency), [currency]);

  // Combined cats
  const cats = useMemo(() => ({
    income:  [...DEFAULT_CATS.income,  ...(customCats.income  || [])],
    expense: [...DEFAULT_CATS.expense, ...(customCats.expense || [])],
  }), [customCats]);

  useEffect(() => {
    loadData().then(d => {
      setTxs(d.txs || []);
      setBaseLiq(d.baseLiquidity || 0);
      setBudgets(d.budgets || {});
      setCustomCats(d.customCats || { income:[], expense:[] });
      setCurrency(d.currency || "USD");
      setLoaded(true);
    });
  }, []);

  const persist = useCallback(async (nt, nb, nb2, nc, cur) => {
    try {
      await saveData({ txs: nt, baseLiquidity: nb, budgets: nb2, customCats: nc, currency: cur });
    } catch {
      addToast("Save failed. Your browser may be blocking storage.", "err");
    }
  }, [addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (modal || scopeAction) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "n" || e.key === "N") { openAdd(); }
      if (e.key === "l" || e.key === "L") setView("ledger");
      if (e.key === "o" || e.key === "O") setView("overview");
      if (e.key === "c" || e.key === "C") setView("calendar");
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, scopeAction]);

  const goPrev = () => setPeriod(p => { const d = new Date(p.y, p.m-1, 1); return { m:d.getMonth(), y:d.getFullYear() }; });
  const goNext = () => setPeriod(p => { const d = new Date(p.y, p.m+1, 1); return { m:d.getMonth(), y:d.getFullYear() }; });
  const periodLabel = `${MONTHS_FULL[period.m]} ${period.y}`;

  // ── Derived ───────────────────────────────────────────────
  const monthTxs    = useMemo(() => txsForMonth(txs, period.y, period.m), [txs, period]);
  const income      = useMemo(() => monthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [monthTxs]);
  const expenses    = useMemo(() => monthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [monthTxs]);
  const net         = income - expenses;
  const gap         = expenses - income;
  const allTimeNet  = useMemo(() => txs.reduce((s,t)=>t.type==="income"?s+t.amount:s-t.amount,0), [txs]);
  const liquidity   = baseLiq + allTimeNet;
  const monthlyBurn = expenses;

  // Projected month totals (including all recurring projections, even months with no real txs)
  const projectedThisMonth = useMemo(() => {
    const nextM = period.m + 1 > 11 ? 0 : period.m + 1;
    const nextY = period.m + 1 > 11 ? period.y + 1 : period.y;
    const nextTxs = txsForMonth(txs, nextY, nextM);
    return {
      income:  nextTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),
      expense: nextTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),
    };
  }, [txs, period]);

  const monthlyData = useMemo(() =>
    MONTHS_SHORT.map((m, i) => {
      const mTxs = txsForMonth(txs, period.y, i);
      return {
        name: m,
        Income:   Number(mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0).toFixed(2)),
        Expenses: Number(mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0).toFixed(2)),
      };
    }), [txs, period.y]);

  const yearlyData = useMemo(() => {
    const years = new Set(txs.map(t => txYear(t)));
    years.add(TODAY.getFullYear());
    return [...years].sort().map(y => {
      const flat = MONTHS_SHORT.flatMap((_, i) => txsForMonth(txs, y, i));
      return {
        name: String(y),
        Income:   Number(flat.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0).toFixed(2)),
        Expenses: Number(flat.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0).toFixed(2)),
      };
    });
  }, [txs]);

  const calMap = useMemo(() => {
    const m = {};
    monthTxs.forEach(t => {
      const d = txDay(t);
      if (!m[d]) m[d] = { income:0, expense:0, txs:[] };
      if (t.type==="income") m[d].income += t.amount; else m[d].expense += t.amount;
      m[d].txs.push(t);
    });
    return m;
  }, [monthTxs]);

  const catBreakdown = useMemo(() => {
    const m = {};
    monthTxs.filter(t=>t.type==="expense").forEach(t => { m[t.category] = (m[t.category]||0) + t.amount; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8);
  }, [monthTxs]);

  // Budget alerts
  const budgetAlerts = useMemo(() => {
    return catBreakdown
      .filter(([cat, spent]) => budgets[cat] && spent >= budgets[cat] * 0.8)
      .map(([cat, spent]) => ({ cat, spent, limit: budgets[cat], over: spent > budgets[cat] }));
  }, [catBreakdown, budgets]);

  // Ledger with search + date filter
  const ledgerTxs = useMemo(() => {
    let list = txFilter === "all" ? [...txs] : txs.filter(t => t.type === txFilter);
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.trim().toLowerCase();
      list = list.filter(t =>
        t.description?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.tags?.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    }
    if (ledgerDateFrom) list = list.filter(t => t.date >= ledgerDateFrom);
    if (ledgerDateTo)   list = list.filter(t => t.date <= ledgerDateTo);
    return list.sort((a,b) => parseDate(b.date) - parseDate(a.date));
  }, [txs, txFilter, ledgerSearch, ledgerDateFrom, ledgerDateTo]);

  const ledgerIncome   = useMemo(() => txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [txs]);
  const ledgerExpenses = useMemo(() => txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [txs]);

  const runwaySeconds  = useMemo(() => {
    if (monthlyBurn <= 0 || liquidity <= 0) return null;
    return (liquidity / monthlyBurn) * SECONDS_PER_MONTH;
  }, [liquidity, monthlyBurn]);
  const runwayDisplay  = useMemo(() => runwaySeconds != null ? formatRunway(runwaySeconds) : null, [runwaySeconds]);
  // CSV Export
  const exportCSV = useCallback(() => {
    const header = ["Date","Type","Category","Description","Tags","Amount","Currency","Recurring"];
    const rows = txs.map(t => [
      t.date, t.type, t.category,
      `"${(t.description||"").replace(/"/g,'""')}"`,
      `"${(t.tags||"").replace(/"/g,'""')}"`,
      t.amount.toFixed(2), currency,
      t.recurring ? t.recurringFreq : "no",
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `fic-export-${TODAY_STR}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    addToast(`Exported ${txs.length} transactions as CSV`,"ok");
  }, [txs, currency, addToast]);

  const exportJSON = useCallback(() => {
    const stamp   = TODAY_STR;
    const payload = { baseLiquidity:Number(baseLiq.toFixed(2)), txs:txs.map(t=>({...t,amount:Number(t.amount.toFixed(2))})), budgets, customCats, currency };
    const blob    = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href = url; a.download = `fic-backup-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    addToast(`Backup exported — ${txs.length} transactions`,"ok");
  }, [baseLiq, txs, budgets, customCats, currency, addToast]);

  const normalizeImported = useCallback(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid JSON.");
    const baseLiquidity = Number.parseFloat(raw.baseLiquidity);
    if (!Number.isFinite(baseLiquidity)) throw new Error("Invalid baseLiquidity.");
    const txsIn = Array.isArray(raw.txs) ? raw.txs : null;
    if (!txsIn) throw new Error("Invalid txs array.");
    const out = [];
    for (const t of txsIn) {
      if (!t || typeof t !== "object") continue;
      const id       = typeof t.id === "string" && t.id.trim() ? t.id : null;
      const type     = t.type === "income" || t.type === "expense" ? t.type : null;
      const category = typeof t.category === "string" && t.category.trim() ? t.category : null;
      const date     = typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null;
      const amount   = Number.parseFloat(typeof t.amount === "string" ? t.amount.replace(/[$,\s]/g,"") : t.amount);
      if (!id || !type || !category || !date || !Number.isFinite(amount)) continue;
      out.push({ id, type, amount:Number(amount.toFixed(2)), category, date, description:t.description||"", tags:t.tags||"", recurring:t.recurring||false, recurringFreq:t.recurringFreq||"monthly" });
    }
    return { baseLiquidity:Number(baseLiquidity.toFixed(2)), txs:out, budgets:raw.budgets||{}, customCats:raw.customCats||{income:[],expense:[]}, currency:raw.currency||"USD", dropped:txsIn.length-out.length };
  }, []);

  const importDataFromFile = useCallback(async file => {
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("Invalid JSON file."); }
    const n = normalizeImported(parsed);
    setBaseLiq(n.baseLiquidity); setTxs(n.txs); setBudgets(n.budgets); setCustomCats(n.customCats); setCurrency(n.currency);
    persist(n.txs, n.baseLiquidity, n.budgets, n.customCats, n.currency);
    addToast(`Imported ${n.txs.length} transactions${n.dropped?` (${n.dropped} skipped)`:""}`, "ok");
  }, [normalizeImported, persist, addToast]);

  const resetAllData = useCallback(() => {
    if (!window.confirm("Reset all data? This cannot be undone.")) return;
    setBaseLiq(0); setTxs([]); setBudgets({}); setCustomCats({income:[],expense:[]}); setCurrency("USD");
    persist([], 0, {}, {income:[],expense:[]}, "USD");
    addToast("All data cleared", "info");
  }, [persist, addToast]);

  // ── Transaction Actions ───────────────────────────────────────────────
  const commitTx = useCallback(() => {
    const raw = typeof form.amount === "string" ? form.amount.replace(/[$,\s]/g,"") : form.amount;
    const amt = Number.parseFloat(raw);
    if (!amt || amt <= 0) return;
    const precise = Number(amt.toFixed(2));
    const tx = { ...form, amount:precise, recurring:form.recurring||false, recurringFreq:form.recurringFreq||"monthly" };
    const next = editId
      ? txs.map(t => t.id === editId ? { ...tx, id:t.id } : t)
      : [...txs, { ...tx, id:Date.now().toString()+Math.random().toString(36).slice(2) }];
    setTxs(next); persist(next, baseLiq, budgets, customCats, currency);
    setModal(null); setEditId(null); setForm(blankForm(cats));
    addToast(editId ? "Transaction updated" : "Transaction recorded", "ok");
  }, [form, editId, txs, baseLiq, budgets, customCats, currency, cats, persist, addToast]);

  // Delete with undo
  const deleteTxById = useCallback((id) => {
    const deleted = txs.find(t => t.id === id);
    const next    = txs.filter(t => t.id !== id);
    setTxs(next); persist(next, baseLiq, budgets, customCats, currency);
    addToast(`Deleted: ${deleted?.category || "transaction"}`, "info", () => {
      setTxs(prev => {
        const restored = [...prev, deleted].sort((a,b) => parseDate(b.date)-parseDate(a.date));
        persist(restored, baseLiq, budgets, customCats, currency);
        return restored;
      });
    });
  }, [txs, baseLiq, budgets, customCats, currency, persist, addToast]);

  // Handle delete (recurring-aware)
  const handleDelete = useCallback((tx) => {
    if (tx.isRecurringInstance) {
      // Can't delete individual projected instances — offer to delete parent
      setScopeAction({ action:"delete", tx: txs.find(t => t.id === tx.recurringParentId) || tx });
      return;
    }
    if (tx.recurring) {
      setScopeAction({ action:"delete", tx });
      return;
    }
    deleteTxById(tx.id);
  }, [txs, deleteTxById]);

  // Handle edit (recurring-aware)
  const openEdit = useCallback((tx) => {
    if (tx.isRecurringInstance) {
      const parent = txs.find(t => t.id === tx.recurringParentId);
      if (parent) { setScopeAction({ action:"edit", tx: parent }); }
      return;
    }
    if (tx.recurring) {
      setScopeAction({ action:"edit", tx });
      return;
    }
    setEditId(tx.id);
    setForm({ type:tx.type, amount:String(tx.amount), category:tx.category, date:tx.date, description:tx.description||"", tags:tx.tags||"", recurring:tx.recurring||false, recurringFreq:tx.recurringFreq||"monthly" });
    setModal("tx");
  }, [txs]);

  const openAdd = () => { setEditId(null); setForm(blankForm(cats)); setModal("tx"); };
  const openLiq = () => { setLiqInput(String(baseLiq)); setModal("liq"); };

  const commitLiq = useCallback(() => {
    const v = Number.parseFloat((liqInput||"").replace(/[$,\s]/g,""));
    if (!Number.isNaN(v)) {
      const precise = Number(v.toFixed(2));
      setBaseLiq(precise); persist(txs, precise, budgets, customCats, currency);
    }
    setModal(null);
  }, [liqInput, txs, budgets, customCats, currency, persist]);

  // Budget commit
  const commitBudgets = useCallback(() => {
    const nb = { ...budgets };
    Object.entries(budgetInput).forEach(([cat, val]) => {
      const v = Number.parseFloat((val||"").replace(/[$,\s]/g,""));
      if (!isNaN(v) && v > 0) nb[cat] = v;
      else if (val === "") delete nb[cat];
    });
    setBudgets(nb); persist(txs, baseLiq, nb, customCats, currency);
    setBudgetInput({});
    addToast("Budget limits saved", "ok");
  }, [budgets, budgetInput, txs, baseLiq, customCats, currency, persist, addToast]);

  // Custom category
  const addCustomCat = useCallback((type) => {
    const val = newCatInput[type]?.trim();
    if (!val) return;
    if (cats[type].includes(val)) { addToast("Category already exists","info"); return; }
    const nc = { ...customCats, [type]: [...(customCats[type]||[]), val] };
    setCustomCats(nc); persist(txs, baseLiq, budgets, nc, currency);
    setNewCatInput(p => ({ ...p, [type]:"" }));
    addToast(`Added category: ${val}`, "ok");
  }, [newCatInput, cats, customCats, txs, baseLiq, budgets, currency, persist, addToast]);

  const removeCustomCat = useCallback((type, cat) => {
    const nc = { ...customCats, [type]: (customCats[type]||[]).filter(c => c !== cat) };
    setCustomCats(nc); persist(txs, baseLiq, budgets, nc, currency);
    addToast(`Removed category: ${cat}`, "info");
  }, [customCats, txs, baseLiq, budgets, currency, persist, addToast]);

  // Currency save
  const saveCurrency = useCallback((code) => {
    setCurrency(code); persist(txs, baseLiq, budgets, customCats, code);
    addToast(`Currency set to ${code}`, "ok");
  }, [txs, baseLiq, budgets, customCats, persist, addToast]);

  const dayData = selDay !== null ? (calMap[selDay] || null) : null;

  if (!loaded) return (
    <div style={{ position:"fixed", inset:0, background:"#09090B", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:'"Outfit",sans-serif', color:"#27272A", fontSize:11, letterSpacing:4 }}>LOADING</div>
  );

  // ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
        html,body,#root{width:100%;height:100%;margin:0;padding:0;background:#09090B}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07);border-radius:2px}
        input,select,textarea{outline:none;font-family:inherit}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.2) brightness(.9)}
        select option{background:#161618}
        button{cursor:pointer;font-family:inherit}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{opacity:.3}
        @keyframes slideInDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
      `}</style>

      <div style={{ position:"fixed", inset:0, background:"#09090B", color:"#F4F4F5", fontFamily:'"Outfit",sans-serif', display:"flex", overflow:"hidden" }}>

        {/* ════ SIDEBAR ════ */}
        <aside style={{ width:220, minWidth:220, background:"#0B0B0D", borderRight:"1px solid rgba(255,255,255,.05)", display:"flex", flexDirection:"column", flexShrink:0, height:"100%", overflowY:"auto" }}>
          <div style={{ padding:"26px 22px 20px", borderBottom:"1px solid rgba(255,255,255,.04)", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, transform:"translateX(-6px)" }}>
              <img
                src="BrandOff.svg"
                alt="FIC"
                width={30}
                height={30}
                style={{ display:"block", objectFit:"contain" }}
              />
              <div style={{ fontSize:26, fontWeight:700, letterSpacing:-1.5, color:"#FAFAFA", fontFamily:'"JetBrains Mono",monospace', lineHeight:1 }}>FIC</div>
            </div>
          </div>

          <div style={{ margin:"14px 14px 4px", padding:"13px 14px", background:"rgba(255,255,255,.025)", borderRadius:9, border:"1px solid rgba(255,255,255,.04)", flexShrink:0 }}>
            <div style={{ fontSize:8, letterSpacing:3, color:"#27272A", fontWeight:700, marginBottom:7 }}>TOTAL LIQUIDITY</div>
            <div style={{ fontSize:17, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:liquidity>=0?"#F4F4F5":"#EF4444", letterSpacing:-0.5, lineHeight:1 }}>{fmt(liquidity)}</div>
            <div style={{ fontSize:9, color:"#27272A", marginTop:5 }}>Base + all transactions</div>
          </div>

          {/* Budget alerts in sidebar */}
          {budgetAlerts.length > 0 && (
            <div style={{ margin:"8px 14px 0", padding:"10px 12px", background:"rgba(239,68,68,.06)", border:"1px solid rgba(239,68,68,.15)", borderRadius:8, flexShrink:0 }}>
              <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(239,68,68,.6)", fontWeight:700, marginBottom:6 }}>BUDGET ALERTS</div>
              {budgetAlerts.slice(0,3).map(({ cat, spent, limit, over }) => (
                <div key={cat} style={{ fontSize:10, color: over?"#EF4444":"#F59E0B", marginBottom:3 }}>
                  {over?"⚠ Over:":"! Near:"} {cat}
                </div>
              ))}
            </div>
          )}

          <nav style={{ padding:"14px 12px", flex:1 }}>
            {[["overview","Overview","O"],["calendar","Calendar","C"],["ledger","Ledger","L"],["settings","Settings",""]].map(([id, lbl, key]) => (
              <button key={id} onClick={() => setView(id)}
                style={{ width:"100%", textAlign:"left", padding:"9px 12px", background:view===id?"rgba(255,255,255,.06)":"transparent", border:"none", borderRadius:7, color:view===id?"#FAFAFA":"#52525B", fontSize:13, fontWeight:view===id?500:400, marginBottom:2, transition:"all .15s", letterSpacing:.2, display:"flex", justifyContent:"space-between", alignItems:"center" }}
                onMouseEnter={e=>{ if(view!==id) e.currentTarget.style.color="#A1A1AA"; }}
                onMouseLeave={e=>{ if(view!==id) e.currentTarget.style.color="#52525B"; }}>
                <span>{lbl}</span>
                {key && <span style={{ fontSize:9, color:"#3F3F46", letterSpacing:1, background:"rgba(255,255,255,.04)", padding:"2px 6px", borderRadius:4 }}>{key}</span>}
              </button>
            ))}
          </nav>

          <div style={{ padding:"12px 12px 24px", borderTop:"1px solid rgba(255,255,255,.04)", display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
            <button onClick={openLiq}
              style={{ width:"100%", padding:"9px 12px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:10, letterSpacing:2.5, fontWeight:600, transition:"all .15s", textAlign:"left" }}
              onMouseEnter={e=>{ e.currentTarget.style.color="#A1A1AA"; e.currentTarget.style.borderColor="rgba(255,255,255,.13)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.color="#52525B"; e.currentTarget.style.borderColor="rgba(255,255,255,.07)"; }}>
              SET LIQUIDITY
            </button>
            <button onClick={openAdd}
              style={{ width:"100%", padding:"11px 12px", background:"#F4F4F5", border:"none", borderRadius:7, color:"#09090B", fontSize:13, fontWeight:600, transition:"opacity .15s" }}
              onMouseEnter={e=>(e.currentTarget.style.opacity=".85")}
              onMouseLeave={e=>(e.currentTarget.style.opacity="1")}>
              + Add Transaction
            </button>
            <div style={{ fontSize:9, color:"#1C1C1E", textAlign:"center", letterSpacing:1 }}>N · new &nbsp; ← → · month</div>
          </div>
        </aside>

        {/* ════ MAIN COLUMN ════ */}
        <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", height:"100%" }}>

          {/* Header */}
          <header style={{ padding:"18px 32px", borderBottom:"1px solid rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:3.5, color:"#27272A", fontWeight:700, marginBottom:4 }}>
                {view==="overview"?"PERFORMANCE OVERVIEW":view==="calendar"?"TRANSACTION CALENDAR":view==="ledger"?"FULL LEDGER":"SETTINGS"}
              </div>
              <div style={{ fontSize:18, fontWeight:600, letterSpacing:-.4, lineHeight:1 }}>
                {view==="overview"?"Overview":view==="calendar"?"Calendar":view==="ledger"?"Ledger":"Settings"}
              </div>
            </div>
            {(view === "overview" || view === "calendar") && (
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={goPrev}
                  style={{ width:30, height:30, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:6, color:"#71717A", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, transition:"background .15s" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.09)")}
                  onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>‹</button>
                <span style={{ fontSize:13, color:"#A1A1AA", fontWeight:500, minWidth:148, textAlign:"center", letterSpacing:.3 }}>{periodLabel}</span>
                <button onClick={goNext}
                  style={{ width:30, height:30, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:6, color:"#71717A", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, transition:"background .15s" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.09)")}
                  onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.04)")}>›</button>
              </div>
            )}
          </header>

          {/* Scrollable content */}
          <main style={{ flex:1, overflowY:"auto", padding:"24px 32px 52px", minHeight:0 }}>

            {/* ══════════ OVERVIEW ══════════ */}
            {view === "overview" && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:22 }}>
                  <KPI label="Monthly Gain"       value={fSign(net)}        valueColor={net>=0?"#22C55E":"#EF4444"} sub={net>=0?"Positive month":"Negative month"} />
                  <KPI label="Monthly Expenses"   value={fmt(expenses)}     valueColor="#EF4444"  sub={`${monthTxs.filter(t=>t.type==="expense").length} records`} />
                  <KPI label="Runway"             value={runwayDisplay ? runwayDisplay.primary : "—"} valueColor={runwayDisplay?"#F59E0B":"#71717A"} sub={runwayDisplay ? runwayDisplay.secondary : "Add expenses to calculate"} />
                  <KPI label="Monthly Income"     value={fmt(income)}       valueColor="#22C55E"  sub={`${monthTxs.filter(t=>t.type==="income").length} records`} />
                  <KPI label="Break-even Gap"     value={gap>0?fmt(gap)+" needed":"Achieved"} valueColor={gap>0?"#F59E0B":"#22C55E"} sub={gap>0?"Required to break even":"Surplus: "+fmt(Math.abs(gap))}
                    badge={budgetAlerts.some(a=>a.over)?"BUDGET EXCEEDED":budgetAlerts.length>0?"BUDGET ALERT":undefined}/>
                </div>

                {/* Projected next month toggle */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                  <button onClick={() => setShowProjected(p=>!p)}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 14px", background: showProjected?"rgba(139,92,246,.1)":"rgba(255,255,255,.03)", border:`1px solid ${showProjected?"rgba(139,92,246,.25)":"rgba(255,255,255,.06)"}`, borderRadius:7, color:showProjected?"#A78BFA":"#52525B", fontSize:11, letterSpacing:1.5, fontWeight:500, transition:"all .15s" }}>
                    <span>↻</span>
                    <span>{showProjected ? "HIDE" : "SHOW"} NEXT MONTH PROJECTION</span>
                  </button>
                </div>

                {showProjected && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20, animation:"slideInDown .2s ease" }}>
                    <div style={{ padding:"16px 18px", background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.12)", borderRadius:10 }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"rgba(139,92,246,.5)", fontWeight:700, marginBottom:8 }}>PROJECTED INCOME — {MONTHS_SHORT[(period.m+1)%12]}</div>
                      <div style={{ fontSize:20, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:"#22C55E", letterSpacing:-.5 }}>{fmt(projectedThisMonth.income)}</div>
                    </div>
                    <div style={{ padding:"16px 18px", background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.12)", borderRadius:10 }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"rgba(139,92,246,.5)", fontWeight:700, marginBottom:8 }}>PROJECTED EXPENSES — {MONTHS_SHORT[(period.m+1)%12]}</div>
                      <div style={{ fontSize:20, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:"#EF4444", letterSpacing:-.5 }}>{fmt(projectedThisMonth.expense)}</div>
                    </div>
                    <div style={{ padding:"16px 18px", background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.12)", borderRadius:10 }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"rgba(139,92,246,.5)", fontWeight:700, marginBottom:8 }}>PROJECTED NET — {MONTHS_SHORT[(period.m+1)%12]}</div>
                      <div style={{ fontSize:20, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:projectedThisMonth.income-projectedThisMonth.expense>=0?"#22C55E":"#EF4444", letterSpacing:-.5 }}>{fSign(projectedThisMonth.income - projectedThisMonth.expense)}</div>
                    </div>
                  </div>
                )}

                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, marginBottom:20 }}>
                  <div style={{ padding:"20px 24px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>
                        {chartMode==="monthly" ? `MONTHLY PERFORMANCE · ${period.y}` : "YEARLY PERFORMANCE · ALL TIME"}
                      </div>
                      <div style={{ fontSize:12, color:"#52525B" }}>
                        {chartMode==="monthly" ? "All 12 months" : `${yearlyData.length} year${yearlyData.length!==1?"s":""} of data`}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                      {[{c:"#22C55E",l:"Income"},{c:"#EF4444",l:"Expenses"}].map(x=>(
                        <div key={x.l} style={{ display:"flex", alignItems:"center", gap:7, fontSize:11, color:"#52525B" }}>
                          <div style={{ width:10, height:2, background:x.c, borderRadius:1 }}/>{x.l}
                        </div>
                      ))}
                      <div style={{ width:1, height:18, background:"rgba(255,255,255,.05)" }}/>
                      {[["monthly","Monthly"],["yearly","Yearly"]].map(([id,lbl]) => (
                        <button key={id} onClick={() => setChartMode(id)}
                          style={{ padding:"5px 12px", background:chartMode===id?"rgba(255,255,255,.08)":"transparent", border:`1px solid ${chartMode===id?"rgba(255,255,255,.12)":"rgba(255,255,255,.06)"}`, borderRadius:6, color:chartMode===id?"#F4F4F5":"#52525B", fontSize:10, letterSpacing:1.5, fontWeight:500, transition:"all .15s" }}>
                          {lbl.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:"18px 0 6px" }}>
                    <ResponsiveContainer width="100%" height={210}>
                      {chartMode === "monthly" ? (
                        <AreaChart data={monthlyData} margin={{ top:4, right:24, bottom:0, left:4 }}>
                          <defs>
                            <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22C55E" stopOpacity={0.14}/><stop offset="100%" stopColor="#22C55E" stopOpacity={0}/></linearGradient>
                            <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EF4444" stopOpacity={0.1}/><stop offset="100%" stopColor="#EF4444" stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)" vertical={false}/>
                          <XAxis dataKey="name" tick={{ fill:"#3F3F46", fontSize:10, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fill:"#3F3F46", fontSize:9, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`} width={46}/>
                          <Tooltip content={<ChartTip fmt={fmt} fSign={fSign}/>}/>
                          <Area type="monotone" dataKey="Income"   stroke="#22C55E" strokeWidth={1.8} fill="url(#gI)" dot={false}/>
                          <Area type="monotone" dataKey="Expenses" stroke="#EF4444" strokeWidth={1.8} fill="url(#gE)" dot={false}/>
                        </AreaChart>
                      ) : (
                        <BarChart data={yearlyData} margin={{ top:4, right:24, bottom:0, left:4 }} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)" vertical={false}/>
                          <XAxis dataKey="name" tick={{ fill:"#3F3F46", fontSize:10, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fill:"#3F3F46", fontSize:9, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`} width={46}/>
                          <Tooltip content={<ChartTip fmt={fmt} fSign={fSign}/>}/>
                          <Bar dataKey="Income"   fill="#22C55E" fillOpacity={0.6} radius={[3,3,0,0]} maxBarSize={44}/>
                          <Bar dataKey="Expenses" fill="#EF4444" fillOpacity={0.6} radius={[3,3,0,0]} maxBarSize={44}/>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1.7fr)", gap:14 }}>
                  {/* Expense breakdown with budget bars */}
                  <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"20px 22px" }}>
                    <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>EXPENSE BREAKDOWN</div>
                    <div style={{ fontSize:11, color:"#52525B", marginBottom:20 }}>{periodLabel}</div>
                    {catBreakdown.length === 0
                      ? <div style={{ color:"#27272A", fontSize:12, textAlign:"center", paddingTop:28 }}>No expenses for {periodLabel}</div>
                      : catBreakdown.map(([cat, val], i) => {
                          const hasBudget = budgets[cat] && budgets[cat] > 0;
                          return hasBudget ? (
                            <BudgetBar key={i} cat={cat} spent={val} limit={budgets[cat]} fmt={fmt}/>
                          ) : (
                            <div key={i} style={{ marginBottom: i < catBreakdown.length-1 ? 14 : 0 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                                <span style={{ fontSize:12, color:"#A1A1AA" }}>{cat}</span>
                                <span style={{ fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B" }}>{fmt(val)}</span>
                              </div>
                              <div style={{ height:2, background:"rgba(255,255,255,.05)", borderRadius:1 }}>
                                <div style={{ height:"100%", width:`${expenses>0?(val/expenses)*100:0}%`, background:"#EF4444", borderRadius:1, opacity:.55, transition:"width .4s" }}/>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                  <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, overflow:"hidden", minWidth:0 }}>
                    <div style={{ padding:"18px 22px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:4 }}>RECENT TRANSACTIONS</div>
                        <div style={{ fontSize:11, color:"#52525B" }}>{periodLabel}</div>
                      </div>
                      {monthTxs.length > 0 && (
                        <button onClick={() => setView("ledger")}
                          style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, fontFamily:"inherit", transition:"color .15s", cursor:"pointer" }}
                          onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")}
                          onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>VIEW ALL</button>
                      )}
                    </div>
                    <HR/>
                    <TxTable
                      txs={[...monthTxs].sort((a,b)=>parseDate(b.date)-parseDate(a.date)).slice(0,7)}
                      onEdit={openEdit} onDelete={handleDelete} compact fmt={fmt}/>
                  </div>
                </div>
              </>
            )}

            {/* ══════════ CALENDAR ══════════ */}
            {view === "calendar" && (
              <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 330px", gap:16, alignItems:"start" }}>
                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"22px 22px 18px" }}>
                  <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:16 }}>
                    <div>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:700 }}>MONTH VIEW</div>
                      <div style={{ fontSize:14, color:"#A1A1AA", marginTop:6 }}>{periodLabel}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, color:"#52525B", fontSize:10, letterSpacing:1.5 }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:2, background:"#22C55E", borderRadius:2 }}/>Income</span>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:2, background:"#EF4444", borderRadius:2 }}/>Expenses</span>
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:18 }}>
                    {[{l:"INCOME",v:fmt(income),c:"#22C55E"},{l:"EXPENSES",v:fmt(expenses),c:"#EF4444"},{l:"NET",v:fSign(net),c:net>=0?"#22C55E":"#EF4444"}].map((s,i) => (
                      <div key={i} style={{ padding:"12px 14px", background:"rgba(255,255,255,.02)", borderRadius:10, border:"1px solid rgba(255,255,255,.04)" }}>
                        <div style={{ fontSize:8, letterSpacing:2.5, color:"#52525B", fontWeight:800, marginBottom:6 }}>{s.l}</div>
                        <div style={{ fontSize:16, fontFamily:'"JetBrains Mono",monospace', color:s.c, fontWeight:600, letterSpacing:-0.6 }}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6, marginBottom:8 }}>
                    {DAY_LABELS.map(d => (
                      <div key={d} style={{ textAlign:"center", fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:800, padding:"4px 0" }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
                    {Array.from({ length: firstWeekday(period.y, period.m) }).map((_,i) => <div key={`off${i}`}/>)}
                    {Array.from({ length: daysInMonth(period.y, period.m) }, (_,i) => i+1).map(day => {
                      const d       = calMap[day];
                      const isToday = day===TODAY.getDate() && period.m===TODAY.getMonth() && period.y===TODAY.getFullYear();
                      const isSel   = selDay === day;
                      const hasProj = !!d?.txs?.some(t => t.isRecurringInstance);
                      return (
                        <div key={day} onClick={() => setSelDay(isSel ? null : day)}
                          style={{ minHeight:84, padding:"10px 9px", borderRadius:12, cursor:"pointer", background:isSel?"rgba(255,255,255,.07)":isToday?"rgba(255,255,255,.025)":"rgba(255,255,255,.01)", border:`1px solid ${isSel?"rgba(255,255,255,.14)":isToday?"rgba(255,255,255,.08)":"rgba(255,255,255,.04)"}`, transition:"all .12s", position:"relative" }}
                          onMouseEnter={e=>{ if(!isSel){ e.currentTarget.style.background="rgba(255,255,255,.035)"; e.currentTarget.style.borderColor="rgba(255,255,255,.09)"; }}}
                          onMouseLeave={e=>{ if(!isSel){ e.currentTarget.style.background=isToday?"rgba(255,255,255,.025)":"rgba(255,255,255,.01)"; e.currentTarget.style.borderColor=isToday?"rgba(255,255,255,.08)":"rgba(255,255,255,.04)"; }}}>
                          {hasProj && <div title="Includes recurring projections" style={{ position:"absolute", top:8, right:8, width:6, height:6, borderRadius:999, background:"rgba(245,158,11,.9)" }}/>}
                          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:7 }}>
                            <div style={{ fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:isToday?"#FAFAFA":isSel?"#E4E4E7":"#A1A1AA", fontWeight:isToday?700:600 }}>{day}</div>
                            {d && <div style={{ fontSize:9, letterSpacing:2, color:"#3F3F46", fontWeight:800 }}>{d.txs.length}tx</div>}
                          </div>
                          {d && (
                            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                              {d.income > 0 && <div style={{ fontSize:9, fontFamily:'"JetBrains Mono",monospace', color:"#22C55E", background:"rgba(34,197,94,.08)", borderRadius:7, padding:"3px 7px", border:"1px solid rgba(34,197,94,.12)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>+{fmt(d.income)}</div>}
                              {d.expense > 0 && <div style={{ fontSize:9, fontFamily:'"JetBrains Mono",monospace', color:"#EF4444", background:"rgba(239,68,68,.08)", borderRadius:7, padding:"3px 7px", border:"1px solid rgba(239,68,68,.12)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>−{fmt(d.expense)}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, overflow:"hidden", position:"sticky", top:0 }}>
                  {selDay && dayData ? (
                    <>
                      <div style={{ padding:"20px 20px 16px" }}>
                        <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:3 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}, {period.y}</div>
                        <div style={{ fontSize:9, letterSpacing:1.5, color:"#27272A", marginBottom:16 }}>{dayData.txs.length} TRANSACTION{dayData.txs.length!==1?"S":""}</div>
                        <div style={{ padding:"14px", background:"rgba(255,255,255,.025)", borderRadius:8, marginBottom:12 }}>
                          <div style={{ fontSize:8, letterSpacing:2.5, color:"#3F3F46", fontWeight:700, marginBottom:7 }}>DAY NET</div>
                          <div style={{ fontSize:22, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:dayData.income-dayData.expense>=0?"#22C55E":"#EF4444", letterSpacing:-0.8 }}>{fSign(dayData.income - dayData.expense)}</div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                          {dayData.income > 0 && (
                            <div style={{ padding:"11px 12px", background:"rgba(34,197,94,.06)", borderRadius:8, border:"1px solid rgba(34,197,94,.1)" }}>
                              <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(34,197,94,.4)", fontWeight:700, marginBottom:5 }}>IN</div>
                              <div style={{ fontSize:13, fontFamily:'"JetBrains Mono",monospace', color:"#22C55E", fontWeight:600 }}>{fmt(dayData.income)}</div>
                            </div>
                          )}
                          {dayData.expense > 0 && (
                            <div style={{ padding:"11px 12px", background:"rgba(239,68,68,.06)", borderRadius:8, border:"1px solid rgba(239,68,68,.1)" }}>
                              <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(239,68,68,.4)", fontWeight:700, marginBottom:5 }}>OUT</div>
                              <div style={{ fontSize:13, fontFamily:'"JetBrains Mono",monospace', color:"#EF4444", fontWeight:600 }}>{fmt(dayData.expense)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      <HR/>
                      <div style={{ padding:"14px 18px 20px", display:"flex", flexDirection:"column", gap:10, maxHeight:400, overflowY:"auto" }}>
                        {[...dayData.txs].sort((a,b)=>a.type.localeCompare(b.type)).map((tx, i) => (
                          <div key={i} style={{ padding:"13px 15px", background:"rgba(255,255,255,.025)", borderRadius:9, border:"1px solid rgba(255,255,255,.05)" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <span style={{ fontSize:8, letterSpacing:2.5, padding:"3px 8px", background:tx.type==="income"?"rgba(34,197,94,.09)":"rgba(239,68,68,.09)", color:tx.type==="income"?"#22C55E":"#EF4444", borderRadius:4, fontWeight:700 }}>{tx.type.toUpperCase()}</span>
                                <span style={{ fontSize:13, fontWeight:600, color:"#F4F4F5", letterSpacing:.2 }}>{tx.category}</span>
                              </div>
                              <span style={{ fontSize:14, fontFamily:'"JetBrains Mono",monospace', fontWeight:700, color:tx.type==="income"?"#22C55E":"#EF4444" }}>
                                {tx.type==="income"?"+":"−"}{fmt(tx.amount)}
                              </span>
                            </div>
                            {tx.description && <div style={{ fontSize:12, color:"#71717A", marginBottom:6 }}>{tx.description}</div>}
                            {tx.tags && (
                              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:6 }}>
                                {tx.tags.split(",").map(t=>t.trim()).filter(Boolean).map((tg,j) => <TagPill key={j} tag={tg}/>)}
                              </div>
                            )}
                            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                              {!tx.isRecurringInstance && (
                                <button onClick={() => openEdit(tx)} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, fontFamily:"inherit", cursor:"pointer", transition:"color .15s" }} onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>EDIT</button>
                              )}
                              <button onClick={() => { handleDelete(tx); if(calMap[selDay]?.txs.length<=1) setSelDay(null); }} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, fontFamily:"inherit", cursor:"pointer", transition:"color .15s" }} onMouseEnter={e=>(e.currentTarget.style.color="#EF4444")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>DELETE</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : selDay ? (
                    <div style={{ padding:"30px 20px", textAlign:"center" }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:10 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}, {period.y}</div>
                      <div style={{ fontSize:13, color:"#27272A", marginBottom:18 }}>No transactions recorded.</div>
                      <button onClick={() => { setForm({ ...blankForm(cats), date:`${period.y}-${String(period.m+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}` }); setModal("tx"); }}
                        style={{ padding:"9px 18px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:7, color:"#A1A1AA", fontSize:11, letterSpacing:1.5, fontWeight:500, cursor:"pointer" }}>
                        ADD RECORD
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding:"52px 20px", textAlign:"center" }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#27272A", fontWeight:600, marginBottom:10 }}>SELECT A DAY</div>
                      <div style={{ fontSize:12, color:"#1C1C1E", lineHeight:1.8 }}>Click any date to view transactions.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════ LEDGER ══════════ */}
            {view === "ledger" && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
                  <KPI label="Total Liquidity"   value={fmt(liquidity)}                    valueColor="#FAFAFA" sub="All-time net balance"/>
                  <KPI label="All-Time Income"   value={fmt(ledgerIncome)}                 valueColor="#22C55E" sub={`${txs.filter(t=>t.type==="income").length} records`}/>
                  <KPI label="All-Time Expenses" value={fmt(ledgerExpenses)}               valueColor="#EF4444" sub={`${txs.filter(t=>t.type==="expense").length} records`}/>
                  <KPI label="All-Time Net"      value={fSign(ledgerIncome-ledgerExpenses)} valueColor={ledgerIncome-ledgerExpenses>=0?"#22C55E":"#EF4444"} sub={`${txs.length} total records`}/>
                </div>

                {/* Search + filters */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ position:"relative", flex:1, minWidth:180 }}>
                    <input
                      type="text"
                      placeholder="Search description, category, tags..."
                      value={ledgerSearch}
                      onChange={e => setLedgerSearch(e.target.value)}
                      style={{ ...inputBase, paddingLeft:36, fontSize:12 }}
                    />
                    <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#3F3F46", fontSize:14, pointerEvents:"none" }}>⌕</span>
                    {ledgerSearch && (
                      <button onClick={() => setLedgerSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#52525B", fontSize:14, cursor:"pointer", lineHeight:1 }}>×</button>
                    )}
                  </div>
                  <input type="date" value={ledgerDateFrom} onChange={e=>setLedgerDateFrom(e.target.value)}
                    style={{ ...inputBase, width:"auto", fontSize:12, padding:"9px 12px", colorScheme:"dark" }} placeholder="From"/>
                  <input type="date" value={ledgerDateTo} onChange={e=>setLedgerDateTo(e.target.value)}
                    style={{ ...inputBase, width:"auto", fontSize:12, padding:"9px 12px", colorScheme:"dark" }} placeholder="To"/>
                  {(ledgerDateFrom||ledgerDateTo) && (
                    <button onClick={()=>{setLedgerDateFrom(""); setLedgerDateTo("");}} style={{ background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:6, color:"#52525B", fontSize:10, padding:"9px 12px", letterSpacing:1, cursor:"pointer" }}>CLEAR</button>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                  {[["all","All"],["income","Income"],["expense","Expenses"]].map(([val,lbl]) => (
                    <button key={val} onClick={() => setTxFilter(val)}
                      style={{ padding:"6px 16px", background:txFilter===val?"rgba(255,255,255,.08)":"transparent", border:`1px solid ${txFilter===val?"rgba(255,255,255,.12)":"rgba(255,255,255,.06)"}`, borderRadius:6, color:txFilter===val?"#F4F4F5":"#52525B", fontSize:10, letterSpacing:2, fontWeight:500, transition:"all .15s", cursor:"pointer" }}>
                      {lbl.toUpperCase()}
                    </button>
                  ))}
                  <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:10, color:"#71717A", letterSpacing:.5 }}>{ledgerTxs.length} record{ledgerTxs.length!==1?"s":""}</span>
                    <button onClick={exportCSV} style={{ padding:"6px 14px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:6, color:"#52525B", fontSize:10, letterSpacing:2, cursor:"pointer", transition:"all .15s" }}
                      onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#52525B")}>CSV</button>
                    <button onClick={exportJSON} style={{ padding:"6px 14px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:6, color:"#52525B", fontSize:10, letterSpacing:2, cursor:"pointer", transition:"all .15s" }}
                      onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#52525B")}>JSON</button>
                  </div>
                </div>
                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, overflow:"hidden" }}>
                  <TxTable txs={ledgerTxs} onEdit={openEdit} onDelete={handleDelete} fmt={fmt}/>
                </div>
              </>
            )}

            {/* ══════════ SETTINGS ══════════ */}
            {view === "settings" && (
              <>
                {/* Settings tabs */}
                <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid rgba(255,255,255,.05)", paddingBottom:0 }}>
                  {[["data","Data & Backup"],["budgets","Budgets"],["categories","Categories"],["currency","Currency"],["danger","Danger Zone"]].map(([id,lbl]) => (
                    <button key={id} onClick={() => setSettingsTab(id)}
                      style={{ padding:"10px 18px", background:"transparent", border:"none", borderBottom:`2px solid ${settingsTab===id?"#F4F4F5":"transparent"}`, color:settingsTab===id?"#F4F4F5":"#52525B", fontSize:12, fontWeight:settingsTab===id?600:400, letterSpacing:.3, cursor:"pointer", transition:"all .15s", marginBottom:-1 }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {settingsTab === "data" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, alignItems:"start" }}>
                    <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"24px" }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>BACKUP & IMPORT</div>
                      <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:20 }}>Export a full JSON backup of all your data, or import a previous backup to restore everything including budgets, categories, and currency settings.</div>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                        <button onClick={exportJSON} style={{ padding:"10px 16px", background:"#F4F4F5", border:"none", borderRadius:8, color:"#09090B", fontSize:12, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>EXPORT JSON</button>
                        <label style={{ padding:"10px 16px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:8, color:"#A1A1AA", fontSize:12, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>
                          IMPORT JSON
                          <input type="file" accept="application/json,.json" style={{ display:"none" }}
                            onChange={async e => {
                              const f = e.target.files?.[0]; e.target.value = "";
                              if (!f) return;
                              try { await importDataFromFile(f); } catch (err) { addToast(err?.message||"Import failed","err"); }
                            }}/>
                        </label>
                      </div>
                    </div>
                    <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"24px" }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>CSV EXPORT</div>
                      <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:20 }}>Export all transactions as a CSV file, compatible with Excel, Google Sheets, and any spreadsheet software.</div>
                      <button onClick={exportCSV} style={{ padding:"10px 16px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:8, color:"#A1A1AA", fontSize:12, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>EXPORT CSV</button>
                    </div>
                  </div>
                )}

                {settingsTab === "budgets" && (
                  <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"24px" }}>
                    <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>MONTHLY BUDGET LIMITS</div>
                    <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:24 }}>Set monthly spending limits per category. You'll see alerts in the Overview when you're approaching or exceeding a limit.</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                      {cats.expense.map(cat => {
                        const current = budgets[cat] || "";
                        const inputVal = budgetInput[cat] !== undefined ? budgetInput[cat] : (current ? String(current) : "");
                        const spent    = catBreakdown.find(([c])=>c===cat)?.[1] || 0;
                        return (
                          <div key={cat} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <label style={{ fontSize:12, color:"#A1A1AA" }}>{cat}</label>
                              {current > 0 && <span style={{ fontSize:10, color:"#52525B" }}>Spent: {fmt(spent)}</span>}
                            </div>
                            <input
                              type="number" step="0.01" min="0" placeholder="No limit"
                              value={inputVal}
                              onChange={e => setBudgetInput(p => ({ ...p, [cat]:e.target.value }))}
                              style={{ ...inputBase, fontSize:12 }}
                            />
                            {current > 0 && (
                              <div style={{ height:2, background:"rgba(255,255,255,.05)", borderRadius:1 }}>
                                <div style={{ height:"100%", width:`${Math.min((spent/current)*100,100)}%`, background: spent>current?"#EF4444":spent/current>=0.8?"#F59E0B":"#22C55E", borderRadius:1, opacity:.7 }}/>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={commitBudgets} style={{ marginTop:24, padding:"11px 22px", background:"#F4F4F5", border:"none", borderRadius:8, color:"#09090B", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      Save Budget Limits
                    </button>
                  </div>
                )}

                {settingsTab === "categories" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                    {(["income","expense"]).map(type => (
                      <div key={type} style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"24px" }}>
                        <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>{type.toUpperCase()} CATEGORIES</div>
                        <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:16 }}>Custom categories you've added. Default categories cannot be removed.</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:16, maxHeight:260, overflowY:"auto" }}>
                          {DEFAULT_CATS[type].map(cat => (
                            <div key={cat} style={{ padding:"8px 12px", background:"rgba(255,255,255,.02)", borderRadius:7, fontSize:12, color:"#52525B", display:"flex", justifyContent:"space-between" }}>
                              <span>{cat}</span>
                              <span style={{ fontSize:10, color:"#27272A" }}>default</span>
                            </div>
                          ))}
                          {(customCats[type]||[]).map(cat => (
                            <div key={cat} style={{ padding:"8px 12px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.05)", borderRadius:7, fontSize:12, color:"#A1A1AA", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span>{cat}</span>
                              <button onClick={() => removeCustomCat(type, cat)} style={{ background:"none", border:"none", color:"#3F3F46", fontSize:11, cursor:"pointer", padding:0, transition:"color .15s" }} onMouseEnter={e=>(e.currentTarget.style.color="#EF4444")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>✕</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          <input type="text" placeholder="New category name..." value={newCatInput[type]||""}
                            onChange={e => setNewCatInput(p => ({ ...p, [type]:e.target.value }))}
                            onKeyDown={e => e.key==="Enter" && addCustomCat(type)}
                            style={{ ...inputBase, fontSize:12, flex:1 }}/>
                          <button onClick={() => addCustomCat(type)} style={{ padding:"11px 16px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:7, color:"#A1A1AA", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>+ Add</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {settingsTab === "currency" && (
                  <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"24px" }}>
                    <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>DISPLAY CURRENCY</div>
                    <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:24 }}>Choose how amounts are displayed across the app. Note: this changes display formatting only — amounts are stored as-entered and not converted.</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                      {CURRENCIES.map(c => (
                        <button key={c.code} onClick={() => saveCurrency(c.code)}
                          style={{ padding:"14px 16px", background:currency===c.code?"rgba(255,255,255,.08)":"rgba(255,255,255,.03)", border:`1px solid ${currency===c.code?"rgba(255,255,255,.18)":"rgba(255,255,255,.06)"}`, borderRadius:9, color:currency===c.code?"#F4F4F5":"#71717A", textAlign:"left", cursor:"pointer", transition:"all .15s" }}
                          onMouseEnter={e=>{ if(currency!==c.code) e.currentTarget.style.background="rgba(255,255,255,.06)"; }}
                          onMouseLeave={e=>{ if(currency!==c.code) e.currentTarget.style.background="rgba(255,255,255,.03)"; }}>
                          <div style={{ fontFamily:'"JetBrains Mono",monospace', fontSize:18, fontWeight:600, marginBottom:4, color:currency===c.code?"#F4F4F5":"#52525B" }}>{c.symbol}</div>
                          <div style={{ fontSize:12, fontWeight:600 }}>{c.code}</div>
                          <div style={{ fontSize:11, color:"#52525B" }}>{c.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {settingsTab === "danger" && (
                  <div style={{ background:"#111113", border:"1px solid rgba(239,68,68,.12)", borderRadius:10, padding:"24px" }}>
                    <div style={{ fontSize:9, letterSpacing:2.5, color:"rgba(239,68,68,.5)", fontWeight:600, marginBottom:6 }}>DANGER ZONE</div>
                    <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:20 }}>This permanently deletes all transactions, budgets, and settings. Export a backup first if needed.</div>
                    <button onClick={resetAllData} style={{ padding:"10px 16px", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.2)", borderRadius:8, color:"#FCA5A5", fontSize:12, fontWeight:700, letterSpacing:1, cursor:"pointer" }}>RESET ALL DATA</button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* ════════ TRANSACTION MODAL ════════ */}
      {modal === "tx" && (
        <Modal onClose={() => { setModal(null); setEditId(null); setForm(blankForm(cats)); }}>
          <div style={{ fontSize:9, letterSpacing:3, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>{editId?"EDIT RECORD":"NEW RECORD"}</div>
          <div style={{ fontSize:20, fontWeight:600, letterSpacing:-.5, marginBottom:22 }}>{editId?"Edit Transaction":"Add Transaction"}</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, background:"rgba(255,255,255,.03)", borderRadius:8, padding:5, marginBottom:20 }}>
            {["expense","income"].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type:t, category:t==="income"?cats.income[0]:cats.expense[0] }))}
                style={{ padding:"10px", background:form.type===t?"rgba(255,255,255,.08)":"transparent", border:`1px solid ${form.type===t?"rgba(255,255,255,.1)":"transparent"}`, borderRadius:6, color:form.type===t?(t==="income"?"#22C55E":"#EF4444"):"#52525B", fontSize:11, fontWeight:form.type===t?700:400, transition:"all .15s", letterSpacing:2.5, textTransform:"uppercase", cursor:"pointer" }}>
                {t}
              </button>
            ))}
          </div>

          <Field label="AMOUNT">
            <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} autoFocus
              onChange={e => setForm(f => ({ ...f, amount:e.target.value }))}
              onKeyDown={e => e.key==="Enter" && commitTx()}
              style={{ ...inputBase, fontSize:28, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, letterSpacing:-0.8 }}/>
          </Field>
          <Field label="CATEGORY">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category:e.target.value }))} style={{ ...inputBase }}>
              {cats[form.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="DATE">
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date:e.target.value }))}
              style={{ ...inputBase, fontFamily:'"JetBrains Mono",monospace', colorScheme:"dark" }}/>
          </Field>
          <Field label="DESCRIPTION">
            <input type="text" placeholder="Optional memo..." value={form.description}
              onChange={e => setForm(f => ({ ...f, description:e.target.value }))}
              onKeyDown={e => e.key==="Enter" && commitTx()}
              style={{ ...inputBase }}/>
          </Field>
          <Field label="TAGS">
            <input type="text" placeholder="client-a, q3, travel (comma-separated)" value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags:e.target.value }))}
              style={{ ...inputBase }}/>
            <div style={{ fontSize:10, color:"#3F3F46", marginTop:6 }}>Separate multiple tags with commas</div>
          </Field>

          <div style={{ marginBottom:15, padding:"14px 16px", background:"rgba(255,255,255,.025)", border:"1px solid rgba(255,255,255,.05)", borderRadius:9 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:form.recurring?14:0 }}>
              <div>
                <div style={{ fontSize:12, color:"#A1A1AA", fontWeight:500 }}>Make Recurring</div>
                <div style={{ fontSize:10, color:"#3F3F46", marginTop:2 }}>Project forward automatically</div>
              </div>
              <button onClick={() => setForm(f => ({ ...f, recurring:!f.recurring }))}
                style={{ width:42, height:24, borderRadius:12, border:"none", background:form.recurring?"#22C55E":"rgba(255,255,255,.08)", position:"relative", transition:"background .2s", flexShrink:0, cursor:"pointer" }}>
                <div style={{ position:"absolute", top:3, left:form.recurring?21:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.3)" }}/>
              </button>
            </div>
            {form.recurring && (
              <div style={{ animation:"slideInDown .18s ease" }}>
                <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:8 }}>FREQUENCY</div>
                <select value={form.recurringFreq} onChange={e => setForm(f => ({ ...f, recurringFreq:e.target.value }))} style={{ ...inputBase, fontSize:12 }}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <div style={{ fontSize:10, color:"#3F3F46", lineHeight:1.7, marginTop:10 }}>Recurring entries project into future months automatically. They appear in monthly views and the calendar, but don't affect all-time liquidity until individually recorded.</div>
              </div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr", gap:9, marginTop:6 }}>
            <button onClick={() => { setModal(null); setEditId(null); setForm(blankForm(cats)); }}
              style={{ padding:"12px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:12, transition:"all .15s", cursor:"pointer" }}
              onMouseEnter={e=>{ e.currentTarget.style.color="#A1A1AA"; e.currentTarget.style.borderColor="rgba(255,255,255,.13)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.color="#52525B"; e.currentTarget.style.borderColor="rgba(255,255,255,.07)"; }}>
              Cancel
            </button>
            <button onClick={commitTx}
              style={{ padding:"12px", background:"#F4F4F5", border:"none", borderRadius:7, color:"#09090B", fontSize:13, fontWeight:600, transition:"opacity .15s", cursor:"pointer" }}
              onMouseEnter={e=>(e.currentTarget.style.opacity=".85")}
              onMouseLeave={e=>(e.currentTarget.style.opacity="1")}>
              {editId ? "Save Changes" : "Record Transaction"}
            </button>
          </div>
        </Modal>
      )}

      {/* ════════ LIQUIDITY MODAL ════════ */}
      {modal === "liq" && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontSize:9, letterSpacing:3, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>CONFIGURATION</div>
          <div style={{ fontSize:20, fontWeight:600, letterSpacing:-.5, marginBottom:8 }}>Set Starting Liquidity</div>
          <div style={{ fontSize:12, color:"#52525B", lineHeight:1.8, marginBottom:22 }}>Your base capital balance before any recorded transactions. Stored to the exact cent.</div>
          <Field label={`STARTING BALANCE (${currency})`} last>
            <input type="number" step="0.01" value={liqInput} autoFocus
              onChange={e => setLiqInput(e.target.value)}
              onKeyDown={e => e.key==="Enter" && commitLiq()}
              placeholder="0.00"
              style={{ ...inputBase, fontSize:28, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, letterSpacing:-0.8 }}/>
          </Field>
          {liqInput && !isNaN(parseFloat(liqInput)) && (
            <div style={{ marginTop:10, marginBottom:6, fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B" }}>
              Stores as: <span style={{ color:"#A1A1AA" }}>{fmt(parseFloat(liqInput))}</span>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr", gap:9, marginTop:18 }}>
            <button onClick={() => setModal(null)} style={{ padding:"12px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:12, cursor:"pointer" }}>Cancel</button>
            <button onClick={commitLiq} style={{ padding:"12px", background:"#F4F4F5", border:"none", borderRadius:7, color:"#09090B", fontSize:13, fontWeight:600, cursor:"pointer" }}>Confirm Balance</button>
          </div>
        </Modal>
      )}

      {/* ════════ RECURRING SCOPE MODAL ════════ */}
      {scopeAction && (
        <RecurringScopeModal
          action={scopeAction.action}
          tx={scopeAction.tx}
          onClose={() => setScopeAction(null)}
          onThis={() => {
            if (scopeAction.action === "delete") {
              // Create a "skip" record — mark this instance as deleted by storing a skip date
              // Simplest approach: remove recurring flag and add an exclusion (we delete the parent, they re-add without recurring for other dates)
              // For now, delete only the parent tx and inform user
              deleteTxById(scopeAction.tx.id);
            } else {
              setEditId(scopeAction.tx.id);
              setForm({ type:scopeAction.tx.type, amount:String(scopeAction.tx.amount), category:scopeAction.tx.category, date:scopeAction.tx.date, description:scopeAction.tx.description||"", tags:scopeAction.tx.tags||"", recurring:false, recurringFreq:"monthly" });
              setModal("tx");
            }
            setScopeAction(null);
          }}
          onAll={() => {
            if (scopeAction.action === "delete") {
              deleteTxById(scopeAction.tx.id);
            } else {
              setEditId(scopeAction.tx.id);
              setForm({ type:scopeAction.tx.type, amount:String(scopeAction.tx.amount), category:scopeAction.tx.category, date:scopeAction.tx.date, description:scopeAction.tx.description||"", tags:scopeAction.tx.tags||"", recurring:scopeAction.tx.recurring||true, recurringFreq:scopeAction.tx.recurringFreq||"monthly" });
              setModal("tx");
            }
            setScopeAction(null);
          }}
        />
      )}

      {/* ════════ TOAST STACK ════════ */}
      <ToastStack toasts={toasts} removeToast={removeToast}/>
    </>
  );
}