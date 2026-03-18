import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY  = "spark:v1";
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const TODAY        = new Date();
const TODAY_STR    = TODAY.toISOString().split("T")[0];
const SECONDS_PER_MONTH = 30.4375 * 24 * 60 * 60;

const CATS = {
  income:  ["Salary","Consulting","Business Revenue","Investment Returns","Dividends","Capital Gains","Real Estate","Partnership Distribution","Other Income"],
  expense: ["Operations","Payroll","Technology","Marketing","Real Estate","Legal & Compliance","Travel","Healthcare","Utilities","Food & Dining","Transportation","Insurance","Taxes","Other"],
};

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING HELPERS (virtual projections; not persisted as separate txs)
// ─────────────────────────────────────────────────────────────────────────────
const clampDay = (y, m, day) => {
  const dim = new Date(y, m + 1, 0).getDate();
  return Math.min(Math.max(1, day), dim);
};

function projectedInstancesForMonth(tx, y, m) {
  if (!tx?.recurring || !tx.recurringFreq) return [];

  const start = new Date(tx.date + "T12:00:00");
  const monthStart = new Date(y, m, 1, 12, 0, 0);
  const monthEnd = new Date(y, m + 1, 0, 12, 0, 0);
  if (monthEnd < start) return [];

  if (tx.recurringFreq === "monthly") {
    const isStartMonth = start.getFullYear() === y && start.getMonth() === m;
    if (isStartMonth) return []; // parent tx is the start-month occurrence

    const day = clampDay(y, m, start.getDate());
    const date = new Date(y, m, day, 12, 0, 0).toISOString().split("T")[0];
    return [{
      ...tx,
      id: `${tx.id}_p_${y}-${String(m + 1).padStart(2, "0")}`,
      date,
      isRecurringInstance: true,
      recurringParentId: tx.id,
    }];
  }

  // Weekly projections.
  const out = [];
  let cur = new Date(start);
  while (cur < monthStart) cur.setDate(cur.getDate() + 7);
  while (cur <= monthEnd) {
    const date = cur.toISOString().split("T")[0];
    out.push({
      ...tx,
      id: `${tx.id}_p_${date}`,
      date,
      isRecurringInstance: true,
      recurringParentId: tx.id,
    });
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }
  const startInMonth = start >= monthStart && start <= monthEnd;
  return startInMonth ? out.filter(t => t.date !== tx.date) : out;
}

function txsForMonth(allRealTxs, y, m) {
  const base = allRealTxs.filter(t => txYear(t) === y && txMonth(t) === m);
  const projections = [];
  allRealTxs.forEach(t => projections.push(...projectedInstancesForMonth(t, y, m)));
  return [...base, ...projections];
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY
// ─────────────────────────────────────────────────────────────────────────────
const fFull = n =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(typeof n === "number" && !Number.isNaN(n) ? n : 0);

const fSign = n => {
  const v = typeof n === "number" && !Number.isNaN(n) ? n : 0;
  return (v >= 0 ? "+" : "−") + fFull(Math.abs(v));
};

const formatRunway = totalSeconds => {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const totalMonths = totalSeconds / SECONDS_PER_MONTH;
  const years = Math.floor(totalMonths / 12);
  const totalDays = Math.max(0, Math.floor(totalSeconds / (24 * 60 * 60)));
  const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  if (years >= 2) return { primary: `${nf1.format(totalMonths / 12)} years`, secondary: `At current burn (≈ ${nf0.format(totalDays)} days)` };
  if (totalMonths >= 1) return { primary: `${nf1.format(totalMonths)} months`, secondary: `At current burn (≈ ${nf0.format(totalDays)} days)` };
  if (totalDays >= 1) return { primary: `${nf0.format(totalDays)} days`, secondary: "At current burn" };
  const hours = Math.floor(totalSeconds / 3600);
  if (hours >= 1) return { primary: `${nf0.format(hours)} hours`, secondary: "At current burn" };
  return { primary: `${Math.max(1, Math.floor(totalSeconds / 60))} minutes`, secondary: "At current burn" };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const blankForm    = () => ({ type: "expense", amount: "", category: "Operations", date: TODAY_STR, description: "", recurring: false, recurringFreq: "monthly", recurringCount: 12 });
const daysInMonth  = (y, m) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m, 1).getDay();
const parseDate    = s => new Date(s + "T12:00:00");
const txMonth      = t => parseDate(t.date).getMonth();
const txYear       = t => parseDate(t.date).getFullYear();
const txDay        = t => parseDate(t.date).getDate();

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    if (r?.value) {
      const d = JSON.parse(r.value);
      d.txs = (d.txs || []).map(t => ({ ...t, amount: parseFloat(t.amount) }));
      d.baseLiquidity = parseFloat(d.baseLiquidity) || 0;
      return d;
    }
  } catch (_) {}
  return { txs: [], baseLiquidity: 0 };
}
async function saveData(d) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(d)); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0E0E10", border:"1px solid rgba(255,255,255,.09)", borderRadius:8, padding:"11px 15px", fontFamily:'"JetBrains Mono",monospace', fontSize:11, minWidth:170 }}>
      <div style={{ color:"#3F3F46", marginBottom:8, letterSpacing:1.5, fontSize:9 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:20, marginBottom:3 }}>
          <span style={{ color:"#52525B" }}>{p.name}</span>
          <span style={{ fontWeight:600, color:p.color }}>{fFull(p.value)}</span>
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
const HR = () => <div style={{ height:1, background:"rgba(255,255,255,.04)", margin:"0 22px" }} />;

function KPI({ label, value, sub, valueColor = "#F4F4F5" }) {
  return (
    <div style={{ padding:"20px 22px", background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, minWidth:0 }}>
      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:14, textTransform:"uppercase", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</div>
      <div style={{ fontSize:20, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color:valueColor, letterSpacing:-0.8, lineHeight:1.1, marginBottom:8, wordBreak:"break-word" }}>{value}</div>
      <div style={{ fontSize:11, color:"#A1A1AA" }}>{sub}</div>
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

function Modal({ onClose, width = 440, children }) {
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

function TxRow({ tx, onEdit, onDelete, compact }) {
  const py = compact ? "9px" : "12px";
  const [hov, setHov] = useState(false);
  return (
    <tr style={{ borderBottom:"1px solid rgba(255,255,255,.03)", background: hov ? "rgba(255,255,255,.018)" : "transparent", transition:"background .1s" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <td style={{ padding:`${py} 12px ${py} 22px`, fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B", whiteSpace:"nowrap" }}>
        {parseDate(tx.date).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
      </td>
      <td style={{ padding:`${py} 12px` }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:8, letterSpacing:2.5, padding:"3px 8px", background: tx.type==="income"?"rgba(34,197,94,.09)":"rgba(239,68,68,.09)", color: tx.type==="income"?"#22C55E":"#EF4444", borderRadius:4, fontWeight:700 }}>
          {tx.type.toUpperCase()}
        </span>
          {tx.recurring && !tx.isRecurringInstance && (
            <span style={{ fontSize:8, letterSpacing:1.5, padding:"2px 6px", background:"rgba(251,191,36,.08)", color:"#F59E0B", borderRadius:4, fontWeight:600 }}>↻</span>
          )}
          {tx.isRecurringInstance && (
            <span style={{ fontSize:8, letterSpacing:1.5, padding:"2px 6px", background:"rgba(251,191,36,.05)", color:"rgba(245,158,11,.5)", borderRadius:4 }}>↻</span>
          )}
        </div>
      </td>
      <td style={{ padding:`${py} 12px`, fontSize:13, color:"#A1A1AA" }}>{tx.category}</td>
      <td style={{ padding:`${py} 12px`, fontSize:12, color:"#71717A", maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {tx.description || <span style={{ color:"#27272A" }}>—</span>}
      </td>
      <td style={{ padding:`${py} 12px`, textAlign:"right", fontSize:13, fontFamily:'"JetBrains Mono",monospace', fontWeight:600, color: tx.type==="income"?"#22C55E":"#EF4444", whiteSpace:"nowrap" }}>
        {tx.type==="income"?"+":"−"}{fFull(tx.amount)}
      </td>
      <td style={{ padding:`${py} 22px ${py} 12px`, textAlign:"right", whiteSpace:"nowrap" }}>
        {!tx.isRecurringInstance && (
        <button onClick={() => onEdit(tx)} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, marginRight:12, cursor:"pointer", fontFamily:"inherit", transition:"color .15s" }}
            onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>EDIT</button>
        )}
        <button onClick={() => onDelete(tx.id)} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, cursor:"pointer", fontFamily:"inherit", transition:"color .15s" }}
          onMouseEnter={e=>(e.currentTarget.style.color="#EF4444")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>DEL</button>
      </td>
    </tr>
  );
}

function TxTable({ txs, onEdit, onDelete, compact }) {
  if (!txs.length) return (
    <div style={{ padding:"44px 24px", textAlign:"center", color:"#27272A", fontSize:12 }}>No records found.</div>
  );
  return (
    <table style={{ width:"100%", borderCollapse:"collapse" }}>
      <thead>
        <tr style={{ borderBottom:"1px solid rgba(255,255,255,.05)" }}>
          {["Date","Type","Category","Description","Amount",""].map((h, i) => (
            <th key={i} style={{ padding:`10px 12px 10px ${i===0?"22px":"12px"}`, textAlign: i===4?"right":"left", fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {txs.map(tx => <TxRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} compact={compact} />)}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: DAILY CLOSE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function DailyCloseModal({ txs, onClose }) {
  const todayTxs = useMemo(() => txs.filter(t => t.date === TODAY_STR && !t.isRecurringInstance), [txs]);
  const todayIncome   = todayTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const todayExpenses = todayTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const todayNet = todayIncome - todayExpenses;

  const dateLabel = TODAY.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });

  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:9, letterSpacing:3.5, color:"#27272A", fontWeight:700, marginBottom:8 }}>SESSION CLOSE</div>
        <div style={{ fontSize:22, fontWeight:600, letterSpacing:-.6, marginBottom:6 }}>Daily Summary</div>
        <div style={{ fontSize:12, color:"#52525B" }}>{dateLabel}</div>
      </div>

      {/* Net big number */}
      <div style={{ padding:"24px", background: todayNet >= 0 ? "rgba(34,197,94,.06)" : "rgba(239,68,68,.06)", border:`1px solid ${todayNet >= 0 ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)"}`, borderRadius:12, textAlign:"center", marginBottom:16 }}>
        <div style={{ fontSize:9, letterSpacing:3, color: todayNet >= 0 ? "rgba(34,197,94,.5)" : "rgba(239,68,68,.5)", fontWeight:700, marginBottom:10 }}>DAY NET</div>
        <div style={{ fontSize:38, fontFamily:'"JetBrains Mono",monospace', fontWeight:600, color: todayNet >= 0 ? "#22C55E" : "#EF4444", letterSpacing:-1.5 }}>
          {fSign(todayNet)}
        </div>
      </div>

      {/* Income / Expenses row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
        <div style={{ padding:"16px", background:"rgba(34,197,94,.04)", border:"1px solid rgba(34,197,94,.09)", borderRadius:9 }}>
          <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(34,197,94,.4)", fontWeight:700, marginBottom:8 }}>INCOME TODAY</div>
          <div style={{ fontSize:18, fontFamily:'"JetBrains Mono",monospace', fontWeight:600, color:"#22C55E", letterSpacing:-.5 }}>{fFull(todayIncome)}</div>
          <div style={{ fontSize:10, color:"rgba(34,197,94,.3)", marginTop:4 }}>{todayTxs.filter(t=>t.type==="income").length} record{todayTxs.filter(t=>t.type==="income").length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ padding:"16px", background:"rgba(239,68,68,.04)", border:"1px solid rgba(239,68,68,.09)", borderRadius:9 }}>
          <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(239,68,68,.4)", fontWeight:700, marginBottom:8 }}>EXPENSES TODAY</div>
          <div style={{ fontSize:18, fontFamily:'"JetBrains Mono",monospace', fontWeight:600, color:"#EF4444", letterSpacing:-.5 }}>{fFull(todayExpenses)}</div>
          <div style={{ fontSize:10, color:"rgba(239,68,68,.3)", marginTop:4 }}>{todayTxs.filter(t=>t.type==="expense").length} record{todayTxs.filter(t=>t.type==="expense").length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Today's transactions */}
      {todayTxs.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:9, letterSpacing:2.5, color:"#27272A", fontWeight:700, marginBottom:10 }}>TODAY'S RECORDS</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflowY:"auto" }}>
            {todayTxs.sort((a,b) => a.type.localeCompare(b.type)).map((tx, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 12px", background:"rgba(255,255,255,.025)", borderRadius:7 }}>
                <div>
                  <span style={{ fontSize:10, color:"#52525B" }}>{tx.category}</span>
                  {tx.description && tx.description !== tx.category && (
                    <span style={{ fontSize:10, color:"#3F3F46", marginLeft:8 }}>· {tx.description}</span>
                  )}
                </div>
                <span style={{ fontSize:12, fontFamily:'"JetBrains Mono",monospace', fontWeight:600, color: tx.type==="income"?"#22C55E":"#EF4444" }}>
                  {tx.type==="income"?"+":"−"}{fFull(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {todayTxs.length === 0 && (
        <div style={{ textAlign:"center", padding:"20px 0", color:"#27272A", fontSize:12, marginBottom:20 }}>No transactions recorded today.</div>
      )}

      <button onClick={onClose}
        style={{ width:"100%", padding:"13px", background:"#F4F4F5", border:"none", borderRadius:8, color:"#09090B", fontSize:13, fontWeight:700, letterSpacing:.5, transition:"opacity .15s" }}
        onMouseEnter={e=>(e.currentTarget.style.opacity=".85")}
        onMouseLeave={e=>(e.currentTarget.style.opacity="1")}>
        Done for Today
      </button>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function Spark() {
  const [txs,         setTxs]         = useState([]);
  const [baseLiq,     setBaseLiq]     = useState(0);
  const [loaded,      setLoaded]      = useState(false);
  const [view,        setView]        = useState("overview");
  const [modal,       setModal]       = useState(null);
  const [editId,      setEditId]      = useState(null);
  const [form,        setForm]        = useState(blankForm());
  const [liqInput,    setLiqInput]    = useState("");
  const [chartMode,   setChartMode]   = useState("monthly");
  const [txFilter,    setTxFilter]    = useState("all");
  const [period,      setPeriod]      = useState({ m: TODAY.getMonth(), y: TODAY.getFullYear() });
  const [selDay,      setSelDay]      = useState(null);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [showDaily,   setShowDaily]   = useState(false);

  useEffect(() => {
    loadData().then(d => { setTxs(d.txs || []); setBaseLiq(d.baseLiquidity || 0); setLoaded(true); });
  }, []);

  const persist = useCallback((nt, nb) => saveData({ txs: nt, baseLiquidity: nb }), []);

  const goPrev = () => setPeriod(p => { const d = new Date(p.y, p.m - 1, 1); return { m: d.getMonth(), y: d.getFullYear() }; });
  const goNext = () => setPeriod(p => { const d = new Date(p.y, p.m + 1, 1); return { m: d.getMonth(), y: d.getFullYear() }; });
  const periodLabel = `${MONTHS_FULL[period.m]} ${period.y}`;

  // ── Derived ───────────────────────────────────────────────
  // Month view includes virtual recurring projections (infinite model).
  const monthTxs   = useMemo(() => txsForMonth(txs, period.y, period.m), [txs, period]);
  const income     = useMemo(() => monthTxs.filter(t => t.type==="income").reduce((s,t) => s+t.amount, 0), [monthTxs]);
  const expenses   = useMemo(() => monthTxs.filter(t => t.type==="expense").reduce((s,t) => s+t.amount, 0), [monthTxs]);
  const net        = income - expenses;
  const gap        = expenses - income;
  // Liquidity is REALIZED ONLY (do not count projected recurring).
  const allTimeNet = useMemo(() => txs.reduce((s,t) => t.type==="income" ? s+t.amount : s-t.amount, 0), [txs]);
  const liquidity  = baseLiq + allTimeNet;
  const monthlyBurn = expenses;

  const monthlyData = useMemo(() =>
    MONTHS_SHORT.map((m, i) => {
      const mTxs   = txsForMonth(txs, period.y, i);
      const income = mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
      const exp    = mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
      return { name:m, Income:Number(income.toFixed(2)), Expenses:Number(exp.toFixed(2)) };
    }), [txs, period.y]);

  const yearlyData = useMemo(() => {
    const years = new Set(txs.map(t => txYear(t)));
    years.add(TODAY.getFullYear());
    return [...years].sort().map(y => {
      const income = MONTHS_SHORT.map((_, i) => txsForMonth(txs, y, i))
        .flat()
        .filter(t=>t.type==="income")
        .reduce((s,t)=>s+t.amount,0);
      const exp = MONTHS_SHORT.map((_, i) => txsForMonth(txs, y, i))
        .flat()
        .filter(t=>t.type==="expense")
        .reduce((s,t)=>s+t.amount,0);
      return { name:String(y), Income:Number(income.toFixed(2)), Expenses:Number(exp.toFixed(2)) };
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
    return Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0, 6);
  }, [monthTxs]);

  const ledgerTxs = useMemo(() => {
    // Ledger shows REAL transactions only (projections are virtual).
    const list = txFilter==="all" ? [...txs] : txs.filter(t => t.type===txFilter);
    return list.sort((a,b) => parseDate(b.date) - parseDate(a.date));
  }, [txs, txFilter]);

  const ledgerIncome   = useMemo(() => txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [txs]);
  const ledgerExpenses = useMemo(() => txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [txs]);

  const runwaySeconds = useMemo(() => {
    if (monthlyBurn <= 0 || liquidity <= 0) return null;
    return (liquidity / monthlyBurn) * SECONDS_PER_MONTH;
  }, [liquidity, monthlyBurn]);
  const runwayDisplay = useMemo(() => (runwaySeconds != null ? formatRunway(runwaySeconds) : null), [runwaySeconds]);

  // Today badge count
  const todayCount = useMemo(() => txs.filter(t => t.date === TODAY_STR && !t.isRecurringInstance).length, [txs]);

  const downloadJson = useCallback((filename, data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const exportData = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = { baseLiquidity: Number(baseLiq.toFixed(2)), txs: (txs || []).map(t => ({ ...t, amount: Number(Number(t.amount).toFixed(2)) })) };
    downloadJson(`fic-backup-${stamp}.json`, payload);
    setSettingsMsg({ type:"ok", text:`Exported ${payload.txs.length} transaction${payload.txs.length===1?"":"s"}.` });
  }, [baseLiq, txs, downloadJson]);

  const normalizeImported = useCallback(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid JSON: expected an object.");
    const baseLiquidity = Number.parseFloat(raw.baseLiquidity);
    if (!Number.isFinite(baseLiquidity)) throw new Error("Invalid baseLiquidity.");
    const txsIn = Array.isArray(raw.txs) ? raw.txs : null;
    if (!txsIn) throw new Error("Invalid txs: expected an array.");
    const out = [];
    for (const t of txsIn) {
      if (!t || typeof t !== "object") continue;
      const id = typeof t.id === "string" && t.id.trim() ? t.id : null;
      const type = t.type === "income" || t.type === "expense" ? t.type : null;
      const category = typeof t.category === "string" && t.category.trim() ? t.category : null;
      const date = typeof t.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null;
      const amount = Number.parseFloat(typeof t.amount === "string" ? t.amount.replace(/[$,\s]/g, "") : t.amount);
      if (!id || !type || !category || !date || !Number.isFinite(amount)) continue;
      out.push({ id, type, amount: Number(amount.toFixed(2)), category, date, description: typeof t.description === "string" ? t.description : "", recurring: t.recurring || false, recurringFreq: t.recurringFreq || "monthly", recurringCount: t.recurringCount || 12 });
    }
    return { baseLiquidity: Number(baseLiquidity.toFixed(2)), txs: out, dropped: txsIn.length - out.length };
  }, []);

  const importDataFromFile = useCallback(async file => {
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("Invalid JSON file."); }
    const normalized = normalizeImported(parsed);
    setBaseLiq(normalized.baseLiquidity); setTxs(normalized.txs);
    persist(normalized.txs, normalized.baseLiquidity);
    setSettingsMsg({ type:"ok", text:`Imported ${normalized.txs.length} transaction${normalized.txs.length===1?"":"s"}${normalized.dropped?` (dropped ${normalized.dropped} invalid)`:""}` });
  }, [normalizeImported, persist]);

  const resetAllData = useCallback(() => {
    const ok = window.confirm("Reset all data? This will clear all transactions and set base liquidity to $0.00.");
    if (!ok) return;
    setBaseLiq(0); setTxs([]); persist([], 0);
    setSettingsMsg({ type:"ok", text:"Data reset complete." });
  }, [persist]);

  // ── Actions ───────────────────────────────────────────────
  const commitTx = useCallback(() => {
    const raw = typeof form.amount === "string" ? form.amount.replace(/[$,\s]/g, "") : form.amount;
    const amt = Number.parseFloat(raw);
    if (!amt || amt <= 0) return;
    const precise = Number(amt.toFixed(2));
    const tx = {
      ...form, amount: precise,
      recurring: form.recurring || false,
      recurringFreq: form.recurringFreq || "monthly",
      recurringCount: parseInt(form.recurringCount) || 12,
    };
    const next = editId
      ? txs.map(t => t.id===editId ? { ...tx, id:t.id } : t)
      : [...txs, { ...tx, id: Date.now().toString() + Math.random().toString(36).slice(2) }];
    setTxs(next); persist(next, baseLiq);
    setModal(null); setEditId(null); setForm(blankForm());
  }, [form, editId, txs, baseLiq, persist]);

  const deleteTx = useCallback(id => {
    // If it's a recurring instance, remove by id from allTxs (instances are virtual — delete parent if needed)
    const realId = id.includes("_r") ? id.split("_r")[0] : id;
    const isInstance = id.includes("_r");
    if (isInstance) {
      // Can't delete individual instances — they're generated. Just skip.
      return;
    }
    const next = txs.filter(t => t.id !== realId);
    setTxs(next); persist(next, baseLiq);
  }, [txs, baseLiq, persist]);

  const openAdd  = () => { setEditId(null); setForm(blankForm()); setModal("tx"); };
  const openEdit = tx => {
    if (tx.isRecurringInstance) return; // Can't edit instances
    setEditId(tx.id);
    setForm({ type:tx.type, amount:String(tx.amount), category:tx.category, date:tx.date, description:tx.description||"", recurring:tx.recurring||false, recurringFreq:tx.recurringFreq||"monthly", recurringCount:tx.recurringCount||12 });
    setModal("tx");
  };
  const openLiq = () => { setLiqInput(String(baseLiq)); setModal("liq"); };

  const commitLiq = useCallback(() => {
    const cleaned = (liqInput || "").replace(/[$,\s]/g, "");
    const v = Number.parseFloat(cleaned);
    if (!Number.isNaN(v)) { const precise = Number(v.toFixed(2)); setBaseLiq(precise); persist(txs, precise); }
    setModal(null);
  }, [liqInput, txs, persist]);

  const dayData = selDay !== null ? (calMap[selDay] || null) : null;

  if (!loaded) return (
    <div style={{ position:"fixed", inset:0, background:"#09090B", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:'"Outfit",sans-serif', color:"#27272A", fontSize:11, letterSpacing:4 }}>
      LOADING
    </div>
  );

  // ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
        html, body, #root { width:100%; height:100%; margin:0; padding:0; background:#09090B; }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.07); border-radius:2px; }
        input, select, textarea { outline:none; font-family:inherit; }
        input[type=date]::-webkit-calendar-picker-indicator { filter:invert(.2) brightness(.9); }
        select option { background:#161618; }
        button { cursor:pointer; font-family:inherit; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { opacity:.3; }
        @keyframes slideInDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes flashGreen { 0%,100% { background:rgba(34,197,94,0); } 40% { background:rgba(34,197,94,.04); } }
      `}</style>

      <div style={{ position:"fixed", inset:0, background:"#09090B", color:"#F4F4F5", fontFamily:'"Outfit",sans-serif', display:"flex", overflow:"hidden" }}>

        {/* ════ SIDEBAR ════ */}
        <aside style={{ width:220, minWidth:220, background:"#0B0B0D", borderRight:"1px solid rgba(255,255,255,.05)", display:"flex", flexDirection:"column", flexShrink:0, height:"100%", overflowY:"auto" }}>
          <div style={{ padding:"26px 22px 20px", borderBottom:"1px solid rgba(255,255,255,.04)", flexShrink:0 }}>
            <div style={{ fontSize:26, fontWeight:700, letterSpacing:-1.5, color:"#FAFAFA", fontFamily:'"JetBrains Mono",monospace', lineHeight:1 }}>FIC</div>
          </div>

          <div style={{ margin:"14px 14px 4px", padding:"13px 14px", background:"rgba(255,255,255,.025)", borderRadius:9, border:"1px solid rgba(255,255,255,.04)", flexShrink:0 }}>
            <div style={{ fontSize:8, letterSpacing:3, color:"#27272A", fontWeight:700, marginBottom:7 }}>TOTAL LIQUIDITY</div>
            <div style={{ fontSize:17, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color: liquidity>=0?"#F4F4F5":"#EF4444", letterSpacing:-0.5, lineHeight:1 }}>{fFull(liquidity)}</div>
            <div style={{ fontSize:9, color:"#27272A", marginTop:5 }}>Base + all transactions</div>
          </div>

          <nav style={{ padding:"14px 12px", flex:1 }}>
            {[["overview","Overview"],["calendar","Calendar"],["ledger","Ledger"],["settings","Settings"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setView(id)}
                style={{ width:"100%", textAlign:"left", padding:"9px 12px", background: view===id?"rgba(255,255,255,.06)":"transparent", border:"none", borderRadius:7, color: view===id?"#FAFAFA":"#52525B", fontSize:13, fontWeight: view===id?500:400, marginBottom:2, transition:"all .15s", letterSpacing:.2, display:"block" }}
                onMouseEnter={e=>{ if(view!==id) e.currentTarget.style.color="#A1A1AA"; }}
                onMouseLeave={e=>{ if(view!==id) e.currentTarget.style.color="#52525B"; }}>
                {lbl}
              </button>
            ))}
          </nav>

          <div style={{ padding:"12px 12px 24px", borderTop:"1px solid rgba(255,255,255,.04)", display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
            {/* Daily Close button */}
            <button onClick={() => setShowDaily(true)}
              style={{ width:"100%", padding:"9px 12px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:10, letterSpacing:2.5, fontWeight:600, transition:"all .15s", textAlign:"left", display:"flex", alignItems:"center", justifyContent:"space-between" }}
              onMouseEnter={e=>{ e.currentTarget.style.color="#F59E0B"; e.currentTarget.style.borderColor="rgba(245,158,11,.3)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.color="#52525B"; e.currentTarget.style.borderColor="rgba(255,255,255,.07)"; }}>
              <span>FINISH DAY</span>
              {todayCount > 0 && (
                <span style={{ fontSize:9, background:"rgba(245,158,11,.15)", color:"#F59E0B", borderRadius:4, padding:"1px 6px" }}>{todayCount}</span>
              )}
            </button>
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
            {view !== "ledger" && view !== "settings" && (
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
                  <KPI label="Monthly Expenses"   value={fFull(expenses)}   valueColor="#EF4444"  sub={`${monthTxs.filter(t=>t.type==="expense").length} records`} />
                  <KPI
                    label="Runway"
                    value={runwayDisplay ? runwayDisplay.primary : "—"}
                    valueColor={runwayDisplay ? "#F59E0B" : "#71717A"}
                    sub={runwayDisplay ? runwayDisplay.secondary : "Appears once monthly expenses exist"}
                  />
                  <KPI label="Monthly Net Income" value={fFull(income)}     valueColor="#22C55E"  sub={`${monthTxs.filter(t=>t.type==="income").length} records`} />
                  <KPI label="Break-even Gap"     value={gap>0?fFull(gap)+" needed":"Achieved"} valueColor={gap>0?"#F59E0B":"#22C55E"} sub={gap>0?"Required to break even":"Surplus: "+fFull(Math.abs(gap))} />
                </div>

                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, marginBottom:20 }}>
                  <div style={{ padding:"20px 24px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                    <div>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>
                        {chartMode==="monthly" ? `MONTHLY PERFORMANCE · ${period.y}` : "YEARLY PERFORMANCE · ALL TIME"}
                      </div>
                      <div style={{ fontSize:12, color:"#52525B" }}>
                        {chartMode==="monthly" ? "All 12 months — gaps filled with $0.00" : `${yearlyData.length} year${yearlyData.length!==1?"s":""} of recorded data`}
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
                          style={{ padding:"5px 12px", background: chartMode===id?"rgba(255,255,255,.08)":"transparent", border:`1px solid ${chartMode===id?"rgba(255,255,255,.12)":"rgba(255,255,255,.06)"}`, borderRadius:6, color: chartMode===id?"#F4F4F5":"#52525B", fontSize:10, letterSpacing:1.5, fontWeight:500, transition:"all .15s" }}
                          onMouseEnter={e=>{ if(chartMode!==id) e.currentTarget.style.color="#A1A1AA"; }}
                          onMouseLeave={e=>{ if(chartMode!==id) e.currentTarget.style.color="#52525B"; }}>
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
                            <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.14}/><stop offset="100%" stopColor="#22C55E" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.1}/><stop offset="100%" stopColor="#EF4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)" vertical={false}/>
                          <XAxis dataKey="name" tick={{ fill:"#3F3F46", fontSize:10, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fill:"#3F3F46", fontSize:9, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`} width={46}/>
                          <Tooltip content={<ChartTip/>}/>
                          <Area type="monotone" dataKey="Income"   stroke="#22C55E" strokeWidth={1.8} fill="url(#gI)" dot={false}/>
                          <Area type="monotone" dataKey="Expenses" stroke="#EF4444" strokeWidth={1.8} fill="url(#gE)" dot={false}/>
                        </AreaChart>
                      ) : (
                        <BarChart data={yearlyData} margin={{ top:4, right:24, bottom:0, left:4 }} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.03)" vertical={false}/>
                          <XAxis dataKey="name" tick={{ fill:"#3F3F46", fontSize:10, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fill:"#3F3F46", fontSize:9, fontFamily:'"JetBrains Mono",monospace' }} axisLine={false} tickLine={false} tickFormatter={v => v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`} width={46}/>
                          <Tooltip content={<ChartTip/>}/>
                          <Bar dataKey="Income"   fill="#22C55E" fillOpacity={0.6} radius={[3,3,0,0]} maxBarSize={44}/>
                          <Bar dataKey="Expenses" fill="#EF4444" fillOpacity={0.6} radius={[3,3,0,0]} maxBarSize={44}/>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1.7fr)", gap:14 }}>
                  <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"20px 22px" }}>
                    <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>EXPENSE BREAKDOWN</div>
                    <div style={{ fontSize:11, color:"#52525B", marginBottom:20 }}>{periodLabel}</div>
                    {catBreakdown.length === 0
                      ? <div style={{ color:"#27272A", fontSize:12, textAlign:"center", paddingTop:28 }}>No expenses for {periodLabel}</div>
                      : catBreakdown.map(([cat, val], i) => {
                      const pct = expenses > 0 ? (val / expenses) * 100 : 0;
                      return (
                        <div key={i} style={{ marginBottom: i < catBreakdown.length-1 ? 14 : 0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                            <span style={{ fontSize:12, color:"#A1A1AA" }}>{cat}</span>
                            <span style={{ fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B" }}>{fFull(val)}</span>
                          </div>
                          <div style={{ height:2, background:"rgba(255,255,255,.05)", borderRadius:1 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:"#EF4444", borderRadius:1, opacity:.55, transition:"width .4s" }}/>
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
                          style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, fontFamily:"inherit", transition:"color .15s" }}
                          onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")}
                          onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>VIEW ALL</button>
                      )}
                    </div>
                    <HR/>
                    <TxTable
                      txs={[...monthTxs].sort((a,b)=>parseDate(b.date)-parseDate(a.date)).slice(0,7)}
                      onEdit={openEdit} onDelete={deleteTx} compact />
                  </div>
                </div>
              </>
            )}

            {/* ══════════ CALENDAR ══════════ */}
            {view === "calendar" && (
              <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 330px", gap:16, alignItems:"start", height:"100%" }}>
                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"22px 22px 18px" }}>
                  <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:16 }}>
                    <div>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:700 }}>MONTH VIEW</div>
                      <div style={{ fontSize:14, color:"#A1A1AA", marginTop:6 }}>{periodLabel}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, color:"#52525B", fontSize:10, letterSpacing:1.5 }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:2, background:"#22C55E", borderRadius:2 }} />Income</span>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><span style={{ width:10, height:2, background:"#EF4444", borderRadius:2 }} />Expenses</span>
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:18 }}>
                    {[
                      { l:"INCOME",   v:fFull(income),   c:"#22C55E" },
                      { l:"EXPENSES", v:fFull(expenses), c:"#EF4444" },
                      { l:"NET",      v:fSign(net),       c:net>=0?"#22C55E":"#EF4444" },
                    ].map((s,i) => (
                      <div key={i} style={{ padding:"12px 14px", background:"rgba(255,255,255,.02)", borderRadius:10, border:"1px solid rgba(255,255,255,.04)" }}>
                        <div style={{ fontSize:8, letterSpacing:2.5, color:"#52525B", fontWeight:800, marginBottom:6 }}>{s.l}</div>
                        <div style={{ fontSize:16, fontFamily:'\"JetBrains Mono\",monospace', color:s.c, fontWeight:600, letterSpacing:-0.6 }}>{s.v}</div>
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
                      const d      = calMap[day];
                      const isToday = day===TODAY.getDate() && period.m===TODAY.getMonth() && period.y===TODAY.getFullYear();
                      const isSel   = selDay === day;
                      const hasProjected = !!d?.txs?.some(t => t.isRecurringInstance);
                      return (
                        <div key={day} onClick={() => setSelDay(isSel ? null : day)}
                          style={{
                            minHeight:84,
                            padding:"10px 9px",
                            borderRadius:12,
                            cursor:"pointer",
                            background: isSel ? "rgba(255,255,255,.07)" : isToday ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.01)",
                            border:`1px solid ${isSel?"rgba(255,255,255,.14)":isToday?"rgba(255,255,255,.08)":"rgba(255,255,255,.04)"}`,
                            transition:"all .12s",
                            position:"relative",
                          }}
                          onMouseEnter={e=>{ if(!isSel){ e.currentTarget.style.background="rgba(255,255,255,.035)"; e.currentTarget.style.borderColor="rgba(255,255,255,.09)"; }}}
                          onMouseLeave={e=>{ if(!isSel){ e.currentTarget.style.background=isToday?"rgba(255,255,255,.025)":"rgba(255,255,255,.01)"; e.currentTarget.style.borderColor=isToday?"rgba(255,255,255,.08)":"rgba(255,255,255,.04)"; }}}>
                          {hasProjected && (
                            <div title="Includes projected recurring entries" style={{ position:"absolute", top:8, right:8, width:6, height:6, borderRadius:999, background:"rgba(245,158,11,.9)" }} />
                          )}
                          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:7 }}>
                            <div style={{ fontSize:11, fontFamily:'\"JetBrains Mono\",monospace', color: isToday?"#FAFAFA":isSel?"#E4E4E7":"#A1A1AA", fontWeight: isToday?700:600 }}>{day}</div>
                            {d && (
                              <div style={{ fontSize:9, letterSpacing:2, color:"#3F3F46", fontWeight:800 }}>
                                {d.txs.length} tx
                                </div>
                              )}
                          </div>
                          {d && (
                            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                              {d.income > 0 && <div style={{ fontSize:9, fontFamily:'\"JetBrains Mono\",monospace', color:"#22C55E", background:"rgba(34,197,94,.08)", borderRadius:7, padding:"3px 7px", border:"1px solid rgba(34,197,94,.12)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>+{fFull(d.income)}</div>}
                              {d.expense > 0 && <div style={{ fontSize:9, fontFamily:'\"JetBrains Mono\",monospace', color:"#EF4444", background:"rgba(239,68,68,.08)", borderRadius:7, padding:"3px 7px", border:"1px solid rgba(239,68,68,.12)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>−{fFull(d.expense)}</div>}
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
                          <div style={{ fontSize:22, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, color: dayData.income-dayData.expense>=0?"#22C55E":"#EF4444", letterSpacing:-0.8 }}>{fSign(dayData.income - dayData.expense)}</div>
                          </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                          {dayData.income > 0 && (
                            <div style={{ padding:"11px 12px", background:"rgba(34,197,94,.06)", borderRadius:8, border:"1px solid rgba(34,197,94,.1)" }}>
                              <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(34,197,94,.4)", fontWeight:700, marginBottom:5 }}>IN</div>
                              <div style={{ fontSize:13, fontFamily:'"JetBrains Mono",monospace', color:"#22C55E", fontWeight:600 }}>{fFull(dayData.income)}</div>
                            </div>
                          )}
                          {dayData.expense > 0 && (
                            <div style={{ padding:"11px 12px", background:"rgba(239,68,68,.06)", borderRadius:8, border:"1px solid rgba(239,68,68,.1)" }}>
                              <div style={{ fontSize:8, letterSpacing:2.5, color:"rgba(239,68,68,.4)", fontWeight:700, marginBottom:5 }}>OUT</div>
                              <div style={{ fontSize:13, fontFamily:'"JetBrains Mono",monospace', color:"#EF4444", fontWeight:600 }}>{fFull(dayData.expense)}</div>
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
                                <span style={{ fontSize:8, letterSpacing:2.5, padding:"3px 8px", background: tx.type==="income"?"rgba(34,197,94,.09)":"rgba(239,68,68,.09)", color: tx.type==="income"?"#22C55E":"#EF4444", borderRadius:4, fontWeight:700 }}>{tx.type.toUpperCase()}</span>
                                <span style={{ fontSize:13, fontWeight:600, color:"#F4F4F5", letterSpacing:.2 }}>{tx.category}</span>
                              </div>
                              <span style={{ fontSize:14, fontFamily:'"JetBrains Mono",monospace', fontWeight:700, color: tx.type==="income"?"#22C55E":"#EF4444" }}>
                                {tx.type==="income"?"+":"−"}{fFull(tx.amount)}
                              </span>
                            </div>
                            {tx.description && (
                              <div style={{ fontSize:13, fontWeight:600, color:"#D4D4D8", lineHeight:1.5, letterSpacing:.15, marginBottom:8, paddingLeft:1 }}>{tx.description}</div>
                            )}
                            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop: tx.description ? 0 : 4 }}>
                              {!tx.isRecurringInstance && (
                                <button onClick={() => openEdit(tx)} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, fontFamily:"inherit", cursor:"pointer", transition:"color .15s" }} onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>EDIT</button>
                              )}
                              {!tx.isRecurringInstance && (
                                <button onClick={() => { deleteTx(tx.id); if(calMap[selDay]?.txs.length<=1) setSelDay(null); }} style={{ background:"transparent", border:"none", color:"#3F3F46", fontSize:9, letterSpacing:2, fontFamily:"inherit", cursor:"pointer", transition:"color .15s" }} onMouseEnter={e=>(e.currentTarget.style.color="#EF4444")} onMouseLeave={e=>(e.currentTarget.style.color="#3F3F46")}>DELETE</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : selDay ? (
                    <div style={{ padding:"30px 20px", textAlign:"center" }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:10 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}, {period.y}</div>
                      <div style={{ fontSize:13, color:"#27272A", marginBottom:18 }}>No transactions recorded.</div>
                      <button
                        onClick={() => { setForm({ ...blankForm(), date:`${period.y}-${String(period.m+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}` }); setModal("tx"); }}
                        style={{ padding:"9px 18px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:7, color:"#A1A1AA", fontSize:11, letterSpacing:1.5, fontWeight:500, transition:"all .15s" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,.09)")}
                        onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,.06)")}>
                        ADD RECORD FOR THIS DAY
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding:"52px 20px", textAlign:"center" }}>
                      <div style={{ fontSize:9, letterSpacing:2.5, color:"#27272A", fontWeight:600, marginBottom:10 }}>SELECT A DAY</div>
                      <div style={{ fontSize:12, color:"#1C1C1E", lineHeight:1.8 }}>Click any date to view or manage transactions for that day.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════ LEDGER ══════════ */}
            {view === "ledger" && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
                  <KPI label="Total Liquidity"   value={fFull(liquidity)}                   valueColor="#FAFAFA" sub="All-time net balance" />
                  <KPI label="All-Time Income"   value={fFull(ledgerIncome)}                 valueColor="#22C55E" sub={`${txs.filter(t=>t.type==="income").length} income records`} />
                  <KPI label="All-Time Expenses" value={fFull(ledgerExpenses)}               valueColor="#EF4444" sub={`${txs.filter(t=>t.type==="expense").length} expense records`} />
                  <KPI label="All-Time Net"      value={fSign(ledgerIncome-ledgerExpenses)}  valueColor={ledgerIncome-ledgerExpenses>=0?"#22C55E":"#EF4444"} sub={`${txs.length} total records`} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14 }}>
                  {[["all","All"],["income","Income"],["expense","Expenses"]].map(([val,lbl]) => (
                    <button key={val} onClick={() => setTxFilter(val)}
                      style={{ padding:"6px 16px", background: txFilter===val?"rgba(255,255,255,.08)":"transparent", border:`1px solid ${txFilter===val?"rgba(255,255,255,.12)":"rgba(255,255,255,.06)"}`, borderRadius:6, color: txFilter===val?"#F4F4F5":"#52525B", fontSize:10, letterSpacing:2, fontWeight:500, transition:"all .15s" }}
                      onMouseEnter={e=>{ if(txFilter!==val) e.currentTarget.style.color="#A1A1AA"; }}
                      onMouseLeave={e=>{ if(txFilter!==val) e.currentTarget.style.color="#52525B"; }}>
                      {lbl.toUpperCase()}
                    </button>
                  ))}
                  <span style={{ marginLeft:"auto", fontSize:10, color:"#71717A", letterSpacing:.5 }}>{ledgerTxs.length} record{ledgerTxs.length!==1?"s":""}</span>
                </div>
                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, overflow:"hidden" }}>
                  <TxTable txs={ledgerTxs} onEdit={openEdit} onDelete={deleteTx}/>
                </div>
              </>
            )}

            {/* ══════════ SETTINGS ══════════ */}
            {view === "settings" && (
              <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:14, alignItems:"start" }}>
                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"20px 22px" }}>
                  <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>BACKUP & PORTABILITY</div>
                  <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:18 }}>Export a full JSON backup (base liquidity + all transactions). Import restores the dataset and recalculates all metrics automatically.</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                    <button onClick={exportData} style={{ padding:"10px 14px", background:"#F4F4F5", border:"none", borderRadius:8, color:"#09090B", fontSize:12, fontWeight:700, letterSpacing:1.2 }}>EXPORT JSON</button>
                    <label style={{ padding:"10px 14px", background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.09)", borderRadius:8, color:"#A1A1AA", fontSize:12, fontWeight:700, letterSpacing:1.2, cursor:"pointer" }}>
                      IMPORT JSON
                      <input type="file" accept="application/json,.json" style={{ display:"none" }}
                        onChange={async e => {
                          const f = e.target.files?.[0]; e.target.value = "";
                          if (!f) return;
                          try { await importDataFromFile(f); } catch (err) { setSettingsMsg({ type:"err", text:err?.message||"Import failed." }); }
                        }} />
                    </label>
                  </div>
                  {settingsMsg && (
                    <div style={{ marginTop:16, padding:"10px 12px", borderRadius:8, border:`1px solid ${settingsMsg.type==="ok"?"rgba(34,197,94,.18)":"rgba(239,68,68,.18)"}`, background: settingsMsg.type==="ok"?"rgba(34,197,94,.06)":"rgba(239,68,68,.06)", color: settingsMsg.type==="ok"?"#86EFAC":"#FCA5A5", fontSize:12, lineHeight:1.6 }}>
                      {settingsMsg.text}
                    </div>
                  )}
                </div>
                <div style={{ background:"#111113", border:"1px solid rgba(255,255,255,.06)", borderRadius:10, padding:"20px 22px" }}>
                  <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>DANGER ZONE</div>
                  <div style={{ fontSize:12, color:"#71717A", lineHeight:1.8, marginBottom:18 }}>Reset clears all records and sets base liquidity to $0.00. Export first if you want a backup.</div>
                  <button onClick={resetAllData} style={{ padding:"10px 14px", background:"rgba(239,68,68,.12)", border:"1px solid rgba(239,68,68,.25)", borderRadius:8, color:"#FCA5A5", fontSize:12, fontWeight:700, letterSpacing:1.2 }}>RESET ALL DATA</button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ════════ TRANSACTION MODAL (with Recurring) ════════ */}
      {modal === "tx" && (
        <Modal onClose={() => { setModal(null); setEditId(null); setForm(blankForm()); }}>
          <div style={{ fontSize:9, letterSpacing:3, color:"#3F3F46", fontWeight:600, marginBottom:5 }}>{editId?"EDIT RECORD":"NEW RECORD"}</div>
          <div style={{ fontSize:20, fontWeight:600, letterSpacing:-.5, marginBottom:22 }}>{editId?"Edit Transaction":"Add Transaction"}</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, background:"rgba(255,255,255,.03)", borderRadius:8, padding:5, marginBottom:20 }}>
            {["expense","income"].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type:t, category:t==="income"?"Salary":"Operations" }))}
                style={{ padding:"10px", background: form.type===t?"rgba(255,255,255,.08)":"transparent", border:`1px solid ${form.type===t?"rgba(255,255,255,.1)":"transparent"}`, borderRadius:6, color: form.type===t?(t==="income"?"#22C55E":"#EF4444"):"#52525B", fontSize:11, fontWeight: form.type===t?700:400, transition:"all .15s", letterSpacing:2.5, textTransform:"uppercase" }}>
                {t}
              </button>
            ))}
          </div>

          <Field label="AMOUNT (USD)">
            <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} autoFocus
              onChange={e => setForm(f => ({ ...f, amount:e.target.value }))}
              onKeyDown={e => e.key==="Enter" && commitTx()}
              style={{ ...inputBase, fontSize:28, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, letterSpacing:-0.8 }}/>
          </Field>
          <Field label="CATEGORY">
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category:e.target.value }))} style={{ ...inputBase }}>
              {CATS[form.type].map(c => <option key={c} value={c}>{c}</option>)}
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

          {/* NEW: Recurring toggle */}
          <div style={{ marginBottom:15, padding:"14px 16px", background:"rgba(255,255,255,.025)", border:"1px solid rgba(255,255,255,.05)", borderRadius:9 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: form.recurring ? 14 : 0 }}>
              <div>
                <div style={{ fontSize:12, color:"#A1A1AA", fontWeight:500 }}>Make Recurring</div>
                <div style={{ fontSize:10, color:"#3F3F46", marginTop:2 }}>Project forward automatically</div>
              </div>
              <button onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))}
                style={{ width:42, height:24, borderRadius:12, border:"none", background: form.recurring ? "#22C55E" : "rgba(255,255,255,.08)", position:"relative", transition:"background .2s", flexShrink:0 }}>
                <div style={{ position:"absolute", top:3, left: form.recurring ? 21 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.3)" }}/>
              </button>
            </div>
            {form.recurring && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, animation:"slideInDown .18s ease" }}>
                <div>
                  <div style={{ fontSize:9, letterSpacing:2.5, color:"#3F3F46", fontWeight:600, marginBottom:6 }}>FREQUENCY</div>
                  <select value={form.recurringFreq} onChange={e => setForm(f => ({ ...f, recurringFreq:e.target.value }))} style={{ ...inputBase, fontSize:12 }}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div style={{ gridColumn:"1/-1", fontSize:10, color:"#52525B", lineHeight:1.7 }}>
                  Recurring entries are projected into future months automatically (no manual tracking). Projections affect monthly views and the calendar, but do not change all‑time liquidity until recorded.
                </div>
              </div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr", gap:9, marginTop:6 }}>
            <button onClick={() => { setModal(null); setEditId(null); setForm(blankForm()); }}
              style={{ padding:"12px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:12, transition:"all .15s" }}
              onMouseEnter={e=>{ e.currentTarget.style.color="#A1A1AA"; e.currentTarget.style.borderColor="rgba(255,255,255,.13)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.color="#52525B"; e.currentTarget.style.borderColor="rgba(255,255,255,.07)"; }}>
              Cancel
            </button>
            <button onClick={commitTx}
              style={{ padding:"12px", background:"#F4F4F5", border:"none", borderRadius:7, color:"#09090B", fontSize:13, fontWeight:600, transition:"opacity .15s" }}
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
          <div style={{ fontSize:12, color:"#52525B", lineHeight:1.8, marginBottom:22 }}>Your base capital balance before any transactions in Spark. Stored to the exact cent.</div>
          <Field label="STARTING BALANCE (USD)" last>
            <input type="number" step="0.01" value={liqInput} autoFocus
              onChange={e => setLiqInput(e.target.value)}
              onKeyDown={e => e.key==="Enter" && commitLiq()}
              placeholder="0.00"
              style={{ ...inputBase, fontSize:28, fontFamily:'"JetBrains Mono",monospace', fontWeight:500, letterSpacing:-0.8 }}/>
          </Field>
          {liqInput && !isNaN(parseFloat(liqInput)) && (
            <div style={{ marginTop:10, marginBottom:6, fontSize:11, fontFamily:'"JetBrains Mono",monospace', color:"#52525B" }}>
              Will be stored as: <span style={{ color:"#A1A1AA" }}>{fFull(parseFloat(liqInput))}</span>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr", gap:9, marginTop:18 }}>
            <button onClick={() => setModal(null)} style={{ padding:"12px", background:"transparent", border:"1px solid rgba(255,255,255,.07)", borderRadius:7, color:"#52525B", fontSize:12 }} onMouseEnter={e=>(e.currentTarget.style.color="#A1A1AA")} onMouseLeave={e=>(e.currentTarget.style.color="#52525B")}>Cancel</button>
            <button onClick={commitLiq} style={{ padding:"12px", background:"#F4F4F5", border:"none", borderRadius:7, color:"#09090B", fontSize:13, fontWeight:600 }} onMouseEnter={e=>(e.currentTarget.style.opacity=".85")} onMouseLeave={e=>(e.currentTarget.style.opacity="1")}>Confirm Balance</button>
          </div>
        </Modal>
      )}

      {/* ════════ DAILY CLOSE MODAL ════════ */}
      {showDaily && <DailyCloseModal txs={txs} onClose={() => setShowDaily(false)} />}
    </>
  );
}