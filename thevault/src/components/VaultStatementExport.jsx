// ─── VaultStatementExport.jsx ─────────────────────────────────────────────────
// Drop-in PDF statement export for Vault.
// Uses jsPDF loaded from CDN (no install required — loaded once on first export).
//
// USAGE in App.jsx:
//   import { exportStatement } from "./components/VaultStatementExport";
//
//   // Call anywhere — e.g. a button in Settings → Data tab:
//   exportStatement({
//     period,           // { m: number, y: number }
//     txs,              // full txs array
//     baseLiq,          // number
//     accountEmail,     // string
//     budgets,          // object
//   });
// ──────────────────────────────────────────────────────────────────────────────

const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Load jsPDF from CDN once ────────────────────────────────────────────────
let _jsPDFPromise = null;
function loadJsPDF() {
  if (_jsPDFPromise) return _jsPDFPromise;
  _jsPDFPromise = new Promise((resolve, reject) => {
    if (window.jspdf) return resolve(window.jspdf.jsPDF);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _jsPDFPromise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function txsForMonth(txs, y, m) {
  return txs.filter(t => {
    const d = new Date(t.date + "T12:00:00");
    return d.getFullYear() === y && d.getMonth() === m;
  });
}

function fmt(n) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2 }).format(n);
}

function fmtShort(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

// ─── Color palette (RGB arrays for jsPDF) ────────────────────────────────────
const C = {
  void:        [6,   7,   8  ],
  steelDeep:   [11,  13,  16 ],
  steelMid:    [17,  20,  25 ],
  steelSurf:   [23,  27,  33 ],
  steelEdge:   [31,  36,  45 ],

  ice:         [139, 175, 200],
  platinum:    [194, 208, 220],
  titanium:    [228, 235, 240],
  textPeak:    [237, 242, 246],
  textBright:  [212, 224, 234],
  textMid:     [165, 190, 210],
  textDim:     [100, 130, 155],

  green:       [70,  231, 169],
  greenDim:    [40,  100, 75 ],
  red:         [255, 127, 159],
  redDim:      [120, 50,  70 ],
  gold:        [226, 201, 131],
  goldDim:     [100, 85,  45 ],
  border:      [30,  45,  60 ],
  borderHi:    [50,  75,  100],
};

// ─── Draw helpers ────────────────────────────────────────────────────────────
function setFill(doc, rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setStroke(doc, rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
function setFont(doc, rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

function hairline(doc, x1, y1, x2, y2, rgb = C.border) {
  setStroke(doc, rgb);
  doc.setLineWidth(0.2);
  doc.line(x1, y1, x2, y2);
}

function rect(doc, x, y, w, h, fillRgb, strokeRgb, lineW = 0.2) {
  if (fillRgb) { setFill(doc, fillRgb); }
  if (strokeRgb) { setStroke(doc, strokeRgb); doc.setLineWidth(lineW); }
  if (fillRgb && strokeRgb) doc.rect(x, y, w, h, "FD");
  else if (fillRgb) doc.rect(x, y, w, h, "F");
  else if (strokeRgb) doc.rect(x, y, w, h, "S");
}

function cornerBrackets(doc, x, y, w, h, size = 8, rgb = C.borderHi, lw = 0.5) {
  setStroke(doc, rgb);
  doc.setLineWidth(lw);
  // TL
  doc.line(x, y + size, x, y); doc.line(x, y, x + size, y);
  // TR
  doc.line(x + w - size, y, x + w, y); doc.line(x + w, y, x + w, y + size);
  // BL
  doc.line(x, y + h - size, x, y + h); doc.line(x, y + h, x + size, y + h);
  // BR
  doc.line(x + w - size, y + h, x + w, y + h); doc.line(x + w, y + h, x + w, y + h - size);
}

function label(doc, text, x, y, rgb = C.textDim, size = 6.5) {
  doc.setFontSize(size);
  doc.setFont("courier", "normal");
  setFont(doc, rgb);
  doc.text(text.toUpperCase(), x, y, { charSpace: 0.8 });
}

function value(doc, text, x, y, rgb = C.textPeak, size = 13, align = "left") {
  doc.setFontSize(size);
  doc.setFont("courier", "bold");
  setFont(doc, rgb);
  doc.text(text, x, y, { align });
}

function body(doc, text, x, y, rgb = C.textMid, size = 8.5) {
  doc.setFontSize(size);
  doc.setFont("courier", "normal");
  setFont(doc, rgb);
  doc.text(text, x, y);
}

function cinzelFallback(doc, text, x, y, rgb = C.textPeak, size = 18, align = "left") {
  // jsPDF ships courier/helvetica/times — we use helvetica for the "serif-ish" wordmark
  doc.setFontSize(size);
  doc.setFont("helvetica", "bold");
  setFont(doc, rgb);
  doc.text(text, x, y, { align, charSpace: size * 0.018 });
}

// ─── Grid background ─────────────────────────────────────────────────────────
function drawGrid(doc, W, H) {
  const step = 12;
  setStroke(doc, [18, 24, 32]);
  doc.setLineWidth(0.12);
  for (let x = 0; x <= W; x += step) doc.line(x, 0, x, H);
  for (let y = 0; y <= H; y += step) doc.line(0, y, W, y);
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function exportStatement({ period, txs, baseLiq, accountEmail, budgets = {} }) {
  const jsPDF = await loadJsPDF();

  // Page setup
  const W = 210, H = 297; // A4 mm
  const PAD = 14;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // ── Background ──────────────────────────────────────────────────────────────
  rect(doc, 0, 0, W, H, C.void);
  drawGrid(doc, W, H);

  // Radial vignette via layered rects (jsPDF has no radial gradient natively)
  // Approximate with dark edges
  const vColor = [3, 4, 5];
  setFill(doc, vColor);
  doc.setGState(new doc.GState({ opacity: 0.55 }));
  doc.rect(0, 0, W, 18, "F");
  doc.rect(0, H - 18, W, 18, "F");
  doc.rect(0, 0, 18, H, "F");
  doc.rect(W - 18, 0, 18, H, "F");
  doc.setGState(new doc.GState({ opacity: 1 }));

  // Outer engineering border
  setStroke(doc, [28, 40, 54]);
  doc.setLineWidth(0.3);
  doc.rect(PAD, PAD, W - PAD * 2, H - PAD * 2, "S");

  // Inner border
  setStroke(doc, [20, 30, 42]);
  doc.setLineWidth(0.15);
  doc.rect(PAD + 3, PAD + 3, W - (PAD + 3) * 2, H - (PAD + 3) * 2, "S");

  // Corner brackets
  cornerBrackets(doc, PAD, PAD, W - PAD * 2, H - PAD * 2, 7, C.borderHi, 0.6);

  // Engineering coordinates
  body(doc, "00.00 · 00.00", PAD + 5, PAD + 2.5, [30, 50, 68], 5.5);
  body(doc, "VAULT · FINANCIAL STATEMENT", W / 2, PAD + 2.5, [30, 50, 68], 5.5);
  doc.setFontSize(5.5); doc.setFont("courier","normal"); setFont(doc, [30,50,68]);
  doc.text("VAULT · FINANCIAL STATEMENT", W/2, PAD + 2.5, { align:"center" });
  body(doc, "ENCRYPTED · CONFIDENTIAL", W - PAD - 5, PAD + 2.5, [30, 50, 68], 5.5);
  doc.setFontSize(5.5); doc.setFont("courier","normal"); setFont(doc, [30,50,68]);
  doc.text("ENCRYPTED · CONFIDENTIAL", W - PAD - 5, PAD + 2.5, { align: "right" });

  // ── HEADER BLOCK ────────────────────────────────────────────────────────────
  const hx = PAD + 6, hy = PAD + 10;

  // Wordmark
  cinzelFallback(doc, "VAULT", hx, hy + 8, C.textPeak, 22);

  // Horizontal rule under wordmark
  hairline(doc, hx, hy + 11, hx + 40, hy + 11, C.borderHi);

  // Sub-label
  label(doc, "Private Financial Intelligence", hx, hy + 15, C.textDim, 6);

  // Statement period — top right
  const periodStr = `${MONTHS_FULL[period.m].toUpperCase()}  ${period.y}`;
  cinzelFallback(doc, periodStr, W - PAD - 6, hy + 8, C.textBright, 13, "right");
  label(doc, "Statement Period", W - PAD - 6, hy + 14, C.textDim, 6);
  doc.setFontSize(5.5); doc.setFont("courier","normal"); setFont(doc, C.textDim);
  doc.text("STATEMENT PERIOD", W - PAD - 6, hy + 14, { align:"right", charSpace:0.8 });

  // Account email
  body(doc, accountEmail || "vault@operator.com", W - PAD - 6, hy + 19, C.textDim, 7);
  doc.setFontSize(7); doc.setFont("courier","normal"); setFont(doc, C.textDim);
  doc.text(accountEmail || "vault@operator.com", W - PAD - 6, hy + 19, { align:"right" });

  // Full-width separator
  const sepY = PAD + 36;
  hairline(doc, PAD + 4, sepY, W - PAD - 4, sepY, C.borderHi);
  // Gradient-ish center glow (approximate with thicker center segment)
  setStroke(doc, C.ice);
  doc.setLineWidth(0.35);
  doc.line(W / 2 - 30, sepY, W / 2 + 30, sepY);
  doc.setLineWidth(0.2);

  // ── CAPITAL PLAQUE (top metric row) ──────────────────────────────────────────
  const plaqueY = sepY + 5;
  const plaqueH = 28;

  // Capital card
  rect(doc, PAD + 4, plaqueY, 76, plaqueH, C.steelMid, C.border);
  // Top accent line
  setStroke(doc, C.ice);
  doc.setLineWidth(0.5);
  doc.line(PAD + 4, plaqueY, PAD + 80, plaqueY);
  doc.setLineWidth(0.2);
  cornerBrackets(doc, PAD + 4, plaqueY, 76, plaqueH, 4, [50, 80, 110], 0.3);

  // Compute values
  const monthTxs    = txsForMonth(txs, period.y, period.m);
  const allTimeNet  = txs.reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, 0);
  const liquidity   = baseLiq + allTimeNet;
  const mIncome     = monthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const mExpenses   = monthTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const mNet        = mIncome - mExpenses;
  const runway      = mExpenses > 0 && liquidity > 0
    ? Math.floor((liquidity / mExpenses) * 30.4)
    : null;

  label(doc, "Available Capital", PAD + 8, plaqueY + 7, C.ice, 6);
  const liqColor = liquidity >= 0 ? C.green : C.red;
  value(doc, fmt(liquidity), PAD + 8, plaqueY + 17, liqColor, 17);
  body(doc, "Base + net all-time activity", PAD + 8, plaqueY + 23, C.textDim, 6.5);

  // Metric cards: Income, Expenses, Net, Runway
  const cards = [
    { label: "Monthly Income",   val: fmt(mIncome),    color: C.green,    sub: `${monthTxs.filter(t=>t.type==="income").length} records`  },
    { label: "Monthly Expenses", val: fmt(mExpenses),  color: C.red,      sub: `${monthTxs.filter(t=>t.type==="expense").length} records` },
    { label: "Period Net",       val: (mNet>=0?"+":"")+fmt(mNet), color: mNet>=0?C.green:C.red, sub: "Income minus expenses"              },
    { label: "Runway",           val: runway ? `${runway} days` : "N/A", color: C.gold, sub: "At current burn rate"                       },
  ];

  const cardW = (W - (PAD + 4) * 2 - 76 - 4) / 4;
  const cardX0 = PAD + 4 + 76 + 4;

  cards.forEach((card, i) => {
    const cx = cardX0 + i * cardW;
    rect(doc, cx + (i === 0 ? 0 : 1), plaqueY, cardW - (i === 0 ? 0 : 1), plaqueH, C.steelMid, C.border);
    cornerBrackets(doc, cx + (i===0?0:1), plaqueY, cardW-(i===0?0:1), plaqueH, 3, [35,55,75], 0.2);
    label(doc, card.label, cx + 4 + (i===0?0:1), plaqueY + 7, C.textDim, 5.5);
    value(doc, card.val, cx + 4 + (i===0?0:1), plaqueY + 17, card.color, 10);
    body(doc, card.sub, cx + 4 + (i===0?0:1), plaqueY + 23, [65, 90, 115], 5.5);
  });

  // ── SECTION: INCOME ─────────────────────────────────────────────────────────
  let curY = plaqueY + plaqueH + 6;

  // Section separator with label
  const drawSectionHeader = (title, y, accentRgb = C.ice) => {
    hairline(doc, PAD + 4, y, W - PAD - 4, y, C.border);
    // accent left bar
    setFill(doc, accentRgb);
    doc.rect(PAD + 4, y - 0.3, 18, 0.6, "F");
    label(doc, title, PAD + 25, y + 3, accentRgb, 6.5);
    setFill(doc, C.steelMid);
    // right: count placeholder
    return y + 7;
  };

  // ── CATEGORY BREAKDOWN ───────────────────────────────────────────────────────
  const incTxs = monthTxs.filter(t => t.type === "income");
  const expTxs = monthTxs.filter(t => t.type === "expense");

  // Income by category
  const incByCat = {};
  incTxs.forEach(t => { incByCat[t.category] = (incByCat[t.category] || 0) + t.amount; });
  const incCats = Object.entries(incByCat).sort((a, b) => b[1] - a[1]);

  // Expense by category
  const expByCat = {};
  expTxs.forEach(t => { expByCat[t.category] = (expByCat[t.category] || 0) + t.amount; });
  const expCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]);

  // Two-column category breakdown
  const colW  = (W - (PAD + 4) * 2 - 4) / 2;
  const col1x = PAD + 4;
  const col2x = PAD + 4 + colW + 4;

  // Income column header
  curY = drawSectionHeader("Income Breakdown", curY, C.green);

  const drawCatTable = (cats, x, startY, totalAmt, accentRgb, budgets_obj = {}) => {
    let y = startY;
    const rowH = 7.5;
    cats.slice(0, 10).forEach(([cat, amt], i) => {
      const bg = i % 2 === 0 ? C.steelMid : C.steelDeep;
      rect(doc, x, y, colW, rowH, bg);
      body(doc, cat, x + 3, y + 5, C.textMid, 7.5);

      // Budget bar (expenses only)
      const budget = budgets_obj[cat];
      if (budget && budget > 0) {
        const pct = Math.min(amt / budget, 1);
        const barW = colW * 0.22;
        const barX = x + colW - barW - 22;
        rect(doc, barX, y + 2.5, barW, 2.5, [20, 30, 42]);
        const fillColor = amt > budget ? C.red : amt / budget >= 0.8 ? C.gold : C.green;
        rect(doc, barX, y + 2.5, barW * pct, 2.5, fillColor);
      }

      // Amount
      const amtColor = accentRgb;
      value(doc, fmt(amt), x + colW - 3, y + 5.5, amtColor, 7.5, "right");
      y += rowH;
    });
    // Total row
    rect(doc, x, y, colW, 8, C.steelEdge, C.borderHi);
    label(doc, "Total", x + 3, y + 5.5, C.textDim, 6.5);
    value(doc, fmt(totalAmt), x + colW - 3, y + 5.5, accentRgb, 9, "right");
    return y + 8;
  };

  const incEndY = drawCatTable(incCats, col1x, curY, mIncome, C.green);

  // Expense column — starts at same Y
  drawSectionHeader("Expense Breakdown", curY - 7, C.red);
  const expEndY = drawCatTable(expCats, col2x, curY, mExpenses, C.red, budgets);

  curY = Math.max(incEndY, expEndY) + 6;

  // ── TRANSACTION LEDGER ───────────────────────────────────────────────────────
  curY = drawSectionHeader("Transaction Ledger · " + MONTHS_FULL[period.m] + " " + period.y, curY, C.ice);

  // Column headers
  const cols = [
    { label: "DATE",        x: PAD + 6,               w: 18  },
    { label: "TYPE",        x: PAD + 25,              w: 14  },
    { label: "CATEGORY",    x: PAD + 40,              w: 36  },
    { label: "DESCRIPTION", x: PAD + 77,              w: 64  },
    { label: "AMOUNT",      x: W - PAD - 6,           w: 24, align: "right" },
  ];

  // Header row
  rect(doc, PAD + 4, curY, W - (PAD + 4) * 2, 7, C.steelEdge, C.border);
  cols.forEach(col => {
    doc.setFontSize(5.5);
    doc.setFont("courier", "normal");
    setFont(doc, C.textDim);
    if (col.align === "right") {
      doc.text(col.label, col.x, curY + 4.8, { align: "right", charSpace: 0.6 });
    } else {
      doc.text(col.label, col.x, curY + 4.8, { charSpace: 0.6 });
    }
  });
  curY += 7;

  // Rows
  const sorted = [...monthTxs].sort((a, b) => b.date.localeCompare(a.date));
  const rowH = 6.5;
  const maxRows = Math.floor((H - curY - PAD - 18) / rowH);
  const shownTxs = sorted.slice(0, maxRows);

  shownTxs.forEach((tx, i) => {
    const bg = i % 2 === 0 ? C.steelMid : C.void;
    rect(doc, PAD + 4, curY, W - (PAD + 4) * 2, rowH, bg);

    // Thin left accent by type
    const accentC = tx.type === "income" ? C.greenDim : C.redDim;
    rect(doc, PAD + 4, curY, 1.5, rowH, accentC);

    const rowTextColor = C.textMid;
    body(doc, tx.date, cols[0].x, curY + 4.5, rowTextColor, 7);
    body(doc, tx.type === "income" ? "INC" : "EXP", cols[1].x, curY + 4.5,
      tx.type === "income" ? C.green : C.red, 6.5);
    // Truncate category
    const catText = (tx.category || "").slice(0, 18);
    body(doc, catText, cols[2].x, curY + 4.5, rowTextColor, 7);
    // Truncate description
    const descText = (tx.description || "").slice(0, 35);
    body(doc, descText, cols[3].x, curY + 4.5, [130, 155, 175], 6.5);
    // Amount
    const amtColor = tx.type === "income" ? C.green : C.red;
    value(doc, (tx.type === "income" ? "+" : "-") + fmt(tx.amount), cols[4].x, curY + 4.8, amtColor, 7.5, "right");

    curY += rowH;
  });

  // "X more transactions" notice if truncated
  if (sorted.length > maxRows) {
    rect(doc, PAD + 4, curY, W - (PAD + 4) * 2, 7, C.steelEdge, C.border);
    const remaining = sorted.length - maxRows;
    body(doc, `+ ${remaining} additional transaction${remaining > 1 ? "s" : ""} — export full CSV for complete record`,
      W / 2, curY + 4.8, C.textDim, 6.5);
    doc.setFontSize(6.5); doc.setFont("courier","normal"); setFont(doc, C.textDim);
    doc.text(
      `+ ${remaining} additional transaction${remaining>1?"s":""} — export full CSV for complete record`,
      W/2, curY + 4.8, { align: "center" }
    );
    curY += 7;
  } else {
    // closing rule
    hairline(doc, PAD + 4, curY + 1, W - PAD - 4, curY + 1, C.border);
    curY += 5;
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  const footerY = H - PAD - 4;
  hairline(doc, PAD + 4, footerY - 8, W - PAD - 4, footerY - 8, C.border);

  // Left: VAULT + generated date
  cinzelFallback(doc, "VAULT", PAD + 6, footerY - 3, C.textDim, 9, "left");
  const genDate = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  body(doc, "Generated " + genDate, PAD + 22, footerY - 3, [45, 68, 90], 6.5);

  // Center: statement hash (fake, for professional feel)
  const hashChars = "ABCDEF0123456789";
  const hash = Array.from({length:8}, () => hashChars[Math.floor(Math.random()*16)]).join("");
  body(doc, `REF: VLT-${period.y}${String(period.m+1).padStart(2,"0")}-${hash}`, W/2, footerY - 3, [35, 55, 75], 6);
  doc.setFontSize(6); doc.setFont("courier","normal"); setFont(doc, [35,55,75]);
  doc.text(`REF: VLT-${period.y}${String(period.m+1).padStart(2,"0")}-${hash}`, W/2, footerY - 3, { align:"center" });

  // Right: page / confidential
  body(doc, "CONFIDENTIAL · PAGE 1 OF 1", W - PAD - 6, footerY - 3, [45, 68, 90], 6);
  doc.setFontSize(6); doc.setFont("courier","normal"); setFont(doc, [45,68,90]);
  doc.text("CONFIDENTIAL · PAGE 1 OF 1", W - PAD - 6, footerY - 3, { align:"right" });

  // Corner bottom coords
  body(doc, `VAULT·OS·v2.0`, PAD + 5, H - PAD + 1, [20, 35, 50], 5);
  doc.setFontSize(5); doc.setFont("courier","normal"); setFont(doc, [20,35,50]);
  doc.text(`VAULT·OS·v2.0`, PAD + 5, H - PAD + 1);
  doc.text("ENCRYPTED", W - PAD - 5, H - PAD + 1, { align:"right" });

  // ── Save ──────────────────────────────────────────────────────────────────────
  const filename = `vault-statement-${period.y}-${String(period.m + 1).padStart(2, "0")}.pdf`;
  doc.save(filename);
}

// ─── React button component (optional — drop anywhere in your UI) ─────────────
import { useState } from "react";

export default function VaultExportButton({ period, txs, baseLiq, accountEmail, budgets, style = {} }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await exportStatement({ period, txs, baseLiq, accountEmail, budgets });
    } catch (e) {
      console.error("[Vault PDF]", e);
      alert("PDF export failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      style={{
        padding: "9px 16px",
        background: "transparent",
        border: "1px solid rgba(107,155,192,0.18)",
        color: loading ? "rgba(107,155,192,0.3)" : "rgba(107,155,192,0.6)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: 400,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all 200ms",
        ...style,
      }}
      onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = "rgba(107,155,192,0.38)"; e.currentTarget.style.color = "#C2D0DC"; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(107,155,192,0.18)"; e.currentTarget.style.color = loading ? "rgba(107,155,192,0.3)" : "rgba(107,155,192,0.6)"; }}
    >
      {loading ? "GENERATING..." : "EXPORT PDF ↓"}
    </button>
  );
}
