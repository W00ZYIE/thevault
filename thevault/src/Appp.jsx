import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import AuthView from "./components/AuthView.jsx";
import { supabase, hasSupabaseConfig } from "./lib/supabaseClient.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY   = "fic:v2";
const CLOUD_TABLE   = "profiles_data";
const MONTHS_FULL   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const TODAY         = new Date();
const TODAY_STR     = TODAY.toISOString().split("T")[0];
const SEC_PER_MONTH = 30.4375 * 24 * 3600;

const DEFAULT_CATS = {
  income:  ["Salary","Business Revenue","Investment Returns","Dividends","Capital Gains","Partnership Distribution","Other Income"],
  expense: ["Operations","Payroll","Technology","Marketing","Travel","Utilities","Transportation","Insurance","Taxes","Tools","Other"],
};

const CURRENCIES = [
  { code:"USD", symbol:"$",   name:"US Dollar" },
  { code:"EUR", symbol:"€",   name:"Euro" },
  { code:"GBP", symbol:"£",   name:"British Pound" },
  { code:"JPY", symbol:"¥",   name:"Japanese Yen" },
  { code:"CAD", symbol:"CA$", name:"Canadian Dollar" },
  { code:"AUD", symbol:"A$",  name:"Australian Dollar" },
  { code:"CHF", symbol:"Fr",  name:"Swiss Franc" },
  { code:"INR", symbol:"₹",   name:"Indian Rupee" },
  { code:"BRL", symbol:"R$",  name:"Brazilian Real" },
  { code:"MXN", symbol:"MX$", name:"Mexican Peso" },
];

// ─── Design Tokens ────────────────────────────────────────────────────────────

const C = {
  bg:         "#020202",
  surface:    "#060606",
  surfaceHi:  "#0c0c0c",
  border:     "rgba(255,255,255,0.06)",
  borderFaint:"rgba(255,255,255,0.028)",
  text1:      "#ebebeb",
  text2:      "#585858",
  text3:      "#282828",
  textMid:    "#7a7a7a",
  green:      "#3ecf8e",
  greenDim:   "rgba(62,207,142,0.07)",
  red:        "#f87171",
  redDim:     "rgba(248,113,113,0.07)",
  gold:       "#c9a84c",
  goldDim:    "rgba(201,168,76,0.08)",
};

// ─── Global CSS ───────────────────────────────────────────────────────────────

const VAULT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Azeret+Mono:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root {
  width: 100%; height: 100%;
  background: #020202;
  font-family: 'Outfit', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #ebebeb;
}

::-webkit-scrollbar { width: 2px; height: 2px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); }

input, select, textarea { outline: none; font-family: inherit; }
input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.25); }
select option { background: #060606; }
button { cursor: pointer; font-family: inherit; }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { opacity: 0; }

.v-mono { font-family: 'Azeret Mono', 'Courier New', monospace; }
.v-label {
  font-size: 9px; font-weight: 500; letter-spacing: 0.2em;
  text-transform: uppercase; color: #585858;
}

/* ── Vault root layout ── */
.v-app { display: flex; height: 100vh; overflow: hidden; background: #020202; }

/* ── Sidebar ── */
.v-sidebar {
  width: 204px; min-width: 204px; background: #020202;
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column; flex-shrink: 0;
  height: 100%; overflow-y: auto;
}
.v-sidebar-logo {
  padding: 22px 18px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.028);
  display: flex; align-items: center; gap: 9px;
}
.v-sidebar-logo-mark {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
}
.v-sidebar-logo-name {
  font-family: 'Azeret Mono', monospace;
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.12em; color: #ebebeb;
}
.v-liq-widget {
  margin: 14px 12px 6px;
  padding: 14px;
  background: rgba(255,255,255,0.015);
  border: 1px solid rgba(255,255,255,0.04);
}
.v-liq-value {
  font-family: 'Azeret Mono', monospace;
  font-size: 17px; font-weight: 500;
  letter-spacing: -0.03em; line-height: 1;
  margin-top: 7px;
}
.v-budget-alert {
  margin: 5px 12px 0;
  padding: 9px 12px;
  background: rgba(248,113,113,0.05);
  border: 1px solid rgba(248,113,113,0.12);
}
.v-nav { padding: 10px 8px; flex: 1; }
.v-nav-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; text-align: left;
  padding: 9px 10px;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: #383838;
  font-family: inherit; font-size: 12.5px; font-weight: 400;
  letter-spacing: 0.01em;
  transition: color 150ms, border-color 150ms, background 150ms;
  margin-bottom: 1px;
}
.v-nav-item:hover { color: #7a7a7a; }
.v-nav-item.active {
  color: #ebebeb; font-weight: 500;
  border-left-color: #ebebeb;
  background: rgba(255,255,255,0.025);
}
.v-nav-shortcut {
  font-size: 8px; letter-spacing: 0.1em;
  color: #282828;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.03);
  padding: 2px 5px;
}
.v-sidebar-actions {
  padding: 10px 12px 0;
  border-top: 1px solid rgba(255,255,255,0.028);
}
.v-btn-primary {
  width: 100%; padding: 10px 0;
  background: #ebebeb; border: none;
  color: #020202; font-family: inherit;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  transition: background 150ms;
}
.v-btn-primary:hover { background: #d0d0d0; }
.v-btn-ghost {
  background: transparent; border: none;
  font-family: inherit; font-size: 9px;
  font-weight: 600; letter-spacing: 0.14em;
  color: #282828; transition: color 150ms;
  padding: 2px 0;
}
.v-btn-ghost:hover { color: #7a7a7a; }
.v-btn-secondary {
  padding: 9px 14px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.06);
  color: #7a7a7a; font-family: inherit;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.08em;
  transition: color 150ms, border-color 150ms;
}
.v-btn-secondary:hover { color: #ebebeb; border-color: rgba(255,255,255,0.14); }

/* ── Account / Sign-out ── */
.v-account {
  margin: 8px 12px 16px;
  padding: 11px 12px;
  border: 1px solid rgba(255,255,255,0.04);
  background: rgba(255,255,255,0.012);
  display: flex; align-items: center; gap: 9px;
}
.v-account-avatar {
  width: 26px; height: 26px; flex-shrink: 0;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.06);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600;
  color: #7a7a7a; letter-spacing: 0;
  font-family: 'Azeret Mono', monospace;
}
.v-account-info { flex: 1; min-width: 0; }
.v-account-email {
  font-size: 10px; color: #585858;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.v-account-signout {
  background: none; border: none;
  font-family: 'Azeret Mono', monospace;
  font-size: 9px; letter-spacing: 0.12em;
  color: #2c2c2c; padding: 0;
  transition: color 150ms; text-transform: uppercase;
}
.v-account-signout:hover { color: #f87171; }

/* ── Main ── */
.v-main { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; }

/* ── Header ── */
.v-header {
  padding: 16px 28px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: #020202;
  display: flex; align-items: center;
  justify-content: space-between;
  flex-shrink: 0; gap: 12px; flex-wrap: wrap;
}
.v-header-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.v-header-sub { font-size: 9px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #585858; margin-bottom: 4px; }
.v-period-nav { display: flex; align-items: center; gap: 8px; }
.v-period-btn {
  width: 30px; height: 30px;
  background: #020202;
  border: 0px;
  color: #585858; display: flex;
  align-items: center; justify-content: center;
  font-size: 35px; transition: all 150ms;
}
.v-period-btn:hover { color: #ebebeb; border-color: rgba(255,255,255,0.12); }
.v-period-label {
  font-family: 'Azeret Mono', monospace;
  font-size: 12px; color: #7a7a7a;
  min-width: 152px; text-align: center;
  letter-spacing: 0.02em;
}

/* ── Content ── */
.v-content {
  flex: 1; overflow-y: auto;
  padding: 24px 28px 56px;
  min-height: 0;
}

/* ── KPI Strip ── */
.v-kpi-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 1px;
}
.v-kpi-card {
  padding: 20px 20px;
  background: #060606;
  border-right: 1px solid rgba(255,255,255,0.06);
  min-width: 0;
}
.v-kpi-card:last-child { border-right: none; }
.v-kpi-value {
  font-family: 'Azeret Mono', monospace;
  font-size: 22px; font-weight: 500;
  letter-spacing: -0.04em; line-height: 1;
  margin: 9px 0 6px; word-break: break-word;
}
.v-kpi-sub { font-size: 10px; color: #585858; }

/* ── Chart ── */
.v-chart-panel {
  background: #060606;
  border: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 1px;
}
.v-chart-header {
  padding: 18px 22px 0;
  display: flex; align-items: flex-start;
  justify-content: space-between; flex-wrap: wrap; gap: 10px;
}

/* ── Split grid ── */
.v-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.65fr);
  gap: 1px; background: rgba(255,255,255,0.028);
}

/* ── Panel ── */
.v-panel {
  background: #060606;
  border: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
}
.v-panel-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.028);
}

/* ── Transaction table ── */
.v-tx-table { width: 100%; border-collapse: collapse; }
.v-tx-table th {
  padding: 9px 14px;
  font-size: 8px; font-weight: 500; letter-spacing: 0.2em;
  text-transform: uppercase; color: #383838;
  text-align: left; background: #060606;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.v-tx-table th:first-child { padding-left: 24px; }
.v-tx-table th:nth-child(6) { text-align: right; }
.v-tx-row { border-bottom: 1px solid rgba(255,255,255,0.025); transition: background 120ms; }
.v-tx-row:hover { background: rgba(255,255,255,0.012); }
.v-tx-row td { padding: 10px 14px; }
.v-tx-row td:first-child { padding-left: 24px; }
.v-tx-row td:last-child { padding-right: 20px; text-align: right; }

/* Column alignment so headers match their content */
.v-tx-table th:nth-child(1),
.v-tx-row  td:nth-child(1) { text-align: center; }

.v-tx-table th:nth-child(2),
.v-tx-row  td:nth-child(2) { text-align: center; }

.v-tx-table th:nth-child(3),
.v-tx-row  td:nth-child(3) { text-align: center; }

.v-tx-table th:nth-child(4),
.v-tx-row  td:nth-child(4) { text-align: center; }
.v-tx-table th:nth-child(4),
.v-tx-row  td:nth-child(4) { padding-left: 28px; }

.v-tx-table th:nth-child(5),
.v-tx-row  td:nth-child(5) { text-align: center; }

.v-tx-table th:nth-child(6),
.v-tx-row  td:nth-child(6) { text-align: right; }

/* Left indicator bar (income/expense) — applied to first cell for consistent table rendering */
.v-tx-date-cell { position: relative; }
.v-tx-date-cell::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: rgba(255,255,255,0.06);
  opacity: 0.85;
}
.v-tx-date-cell--income::before { background: rgb(42, 158, 92); }
.v-tx-date-cell--expense::before { background: rgb(170, 57, 57); }

/* ── Type badge ── */
.v-badge {
  display: inline-flex; align-items: center;
  font-size: 7px; font-weight: 700; letter-spacing: 0.18em;
  padding: 3px 6px; text-transform: uppercase;
}

/* ── Budget bar ── */
.v-budget-bar { margin-bottom: 14px; }
.v-budget-bar-track { height: 1px; background: rgba(255,255,255,0.04); margin-top: 6px; }
.v-budget-bar-fill { height: 100%; transition: width 300ms ease; }

/* ── Tag ── */
.v-tag {
  font-size: 9px; padding: 2px 7px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  color: #585858; letter-spacing: 0.06em;
  white-space: nowrap;
}

/* ── Modal ── */
.v-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 300;
}
.v-modal {
  width: 420px; max-width: calc(100vw - 24px);
  background: #070707;
  border: 1px solid rgba(255,255,255,0.08);
  padding: 28px;
  max-height: 90vh; overflow-y: auto;
  box-shadow: 0 32px 80px rgba(0,0,0,0.8);
}

/* ── Input ── */
.v-input {
  width: 100%;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 9px 12px;
  color: #ebebeb; font-size: 13px;
  font-family: inherit;
  transition: border-color 150ms;
}
.v-input:focus { border-color: rgba(255,255,255,0.15); }
.v-input-amount {
  font-family: 'Azeret Mono', monospace;
  font-size: 28px; font-weight: 500;
  letter-spacing: -0.04em; padding: 12px;
}

/* ── Field ── */
.v-field { margin-bottom: 14px; }
.v-field-label {
  font-size: 9px; font-weight: 500; letter-spacing: 0.2em;
  text-transform: uppercase; color: #585858; margin-bottom: 7px;
  display: block;
}

/* ── Toast ── */
.v-toast-stack {
  position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%);
  display: flex; flex-direction: column;
  gap: 6px; z-index: 999; align-items: center;
}
.v-toast {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 16px;
  background: #0c0c0c;
  border: 1px solid rgba(255,255,255,0.08);
  min-width: 260px; max-width: 400px;
  font-size: 12px; color: #ebebeb;
}

/* ── Settings tabs ── */
.v-settings-tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 20px;
}
.v-settings-tab {
  padding: 9px 16px;
  background: transparent; border: none;
  border-bottom: 2px solid transparent;
  font-family: inherit; font-size: 12px;
  font-weight: 400; letter-spacing: 0.02em;
  color: #383838; margin-bottom: -1px;
  transition: color 150ms, border-color 150ms;
}
.v-settings-tab:hover { color: #7a7a7a; }
.v-settings-tab.active { color: #ebebeb; font-weight: 500; border-bottom-color: #ebebeb; }

/* ── Calendar ── */
.v-cal-grid { display: grid; grid-template-columns: minmax(0,1fr) 296px; gap: 1px; align-items: start; background: rgba(255,255,255,0.028); }
.v-cal-day {
  min-height: 72px; padding: 8px 8px;
  background: rgba(255,255,255,0.008);
  border: 1px solid rgba(255,255,255,0.025);
  cursor: pointer; transition: all 150ms; position: relative;
}
.v-cal-day:hover { background: rgba(255,255,255,0.02); }
.v-cal-day.active { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }
.v-cal-day.today { border-color: rgba(255,255,255,0.06); }

/* ── Projected tile ── */
.v-proj-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: rgba(255,255,255,0.028); margin-bottom: 1px; }
.v-proj-tile { background: rgba(255,255,255,0.012); border: 1px solid rgba(255,255,255,0.035); padding: 16px 18px; }

/* ── Date range filter ── */
.v-date-range { display: flex; align-items: center; gap: 7px; }

/* ── Mobile nav ── */
.v-mobile-topbar {
  display: none;
  padding: 14px 16px;
  background: #020202;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 50; flex-shrink: 0;
}
.v-mobile-bottomnav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #020202;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 8px 0 12px;
  z-index: 50;
  grid-template-columns: repeat(4, 1fr);
}
.v-mobile-nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: none; border: none;
  color: #383838; font-family: inherit;
  font-size: 9px; font-weight: 500; letter-spacing: 0.1em;
  text-transform: uppercase; transition: color 150ms;
  padding: 4px 0;
}
.v-mobile-nav-item.active { color: #ebebeb; }
.v-mobile-nav-item svg { width: 18px; height: 18px; }
.v-mobile-add-fab {
  position: fixed; bottom: 72px; right: 20px;
  width: 48px; height: 48px;
  background: #ebebeb; border: none;
  color: #020202; font-size: 22px; font-weight: 300;
  display: none; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  z-index: 60;
  transition: background 150ms;
}
.v-mobile-add-fab:hover { background: #d0d0d0; }

/* ── Divider ── */
.v-divider { height: 1px; background: rgba(255,255,255,0.028); }

/* ── Inline row of chips ── */
.v-filter-chips { display: flex; gap: 0; }
.v-filter-chip {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.06);
  color: #585858; font-family: inherit;
  font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
  margin-right: -1px; transition: all 150ms;
}
.v-filter-chip:hover { color: #ebebeb; }
.v-filter-chip.active { background: rgba(255,255,255,0.05); color: #ebebeb; }

/* ── Danger zone ── */
.v-danger-btn {
  padding: 9px 18px;
  background: rgba(248,113,113,0.06);
  border: 1px solid rgba(248,113,113,0.2);
  color: #f87171; font-family: inherit;
  font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: all 150ms;
}
.v-danger-btn:hover { background: rgba(248,113,113,0.1); }

/* ── Scope modal buttons ── */
.v-scope-btn {
  width: 100%; padding: 13px 16px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  color: #ebebeb; font-family: inherit;
  font-size: 13px; text-align: left;
  transition: background 150ms;
}
.v-scope-btn:hover { background: rgba(255,255,255,0.04); }

/* ── Recurring toggle ── */
.v-toggle-wrapper {
  padding: 13px 15px;
  background: rgba(255,255,255,0.015);
  border: 1px solid rgba(255,255,255,0.04);
  margin-bottom: 14px;
}
.v-toggle {
  width: 38px; height: 21px;
  border: 1px solid;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  background: none;
  transition: border-color 150ms;
}
.v-toggle-thumb {
  position: absolute;
  top: 2px;
  width: 15px; height: 15px;
  transition: left 150ms;
}

/* ── Settings card ── */
.v-settings-card {
  background: #060606;
  border: 1px solid rgba(255,255,255,0.06);
  padding: 22px;
}
.v-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: rgba(255,255,255,0.028); }

/* ── Ledger filter bar ── */
.v-filter-bar {
  background: #060606;
  border: 1px solid rgba(255,255,255,0.06);
  padding: 13px 16px;
  display: flex; align-items: center;
  gap: 10px; flex-wrap: wrap;
  margin-bottom: 1px;
}
.v-search-wrap { position: relative; flex: 1; min-width: 160px; }
.v-search-icon {
  position: absolute; left: 11px; top: 50%;
  transform: translateY(-50%); color: #383838;
  font-size: 14px; pointer-events: none; line-height: 1;
}
.v-search-clear {
  position: absolute; right: 9px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: #585858; font-size: 14px;
  line-height: 1; transition: color 150ms;
}
.v-search-clear:hover { color: #ebebeb; }
.v-search-input {
  width: 100%;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 9px 32px;
  color: #ebebeb; font-size: 12px;
  font-family: inherit;
  transition: border-color 150ms;
}
.v-search-input:focus { border-color: rgba(255,255,255,0.14); }

/* ── Type toggle in modal ── */
.v-type-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: rgba(255,255,255,0.028); margin-bottom: 20px; }
.v-type-btn {
  padding: 10px; background: #060606;
  border: none; font-family: inherit;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: #383838; transition: all 150ms;
}
.v-type-btn.active-income  { color: #3ecf8e; background: rgba(62,207,142,0.07); }
.v-type-btn.active-expense { color: #f87171; background: rgba(248,113,113,0.07); }

/* ── Modal action row ── */
.v-modal-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; margin-top: 20px; }

/* ── Empty state ── */
.v-empty {
  padding: 44px 20px; text-align: center;
  font-size: 11px; letter-spacing: 0.14em;
  color: #282828; text-transform: uppercase;
}

/* ── Responsive: Mobile ── */
@media (max-width: 860px) {
  .v-sidebar { display: none !important; }
  .v-mobile-topbar { display: flex !important; }
  .v-mobile-bottomnav { display: grid !important; }
  .v-mobile-add-fab { display: flex !important; }
  .v-app { flex-direction: column; height: 100svh; overflow: hidden; }
  .v-main { height: 100%; overflow: hidden; }
  .v-content { padding: 16px 14px 100px; }
  .v-header { display: none !important; }
  .v-kpi-strip { grid-template-columns: repeat(2, 1fr); }
  .v-kpi-card { border-bottom: 1px solid rgba(255,255,255,0.06); }
  .v-split { grid-template-columns: 1fr; }
  .v-cal-grid { grid-template-columns: 1fr; }
  .v-proj-grid { grid-template-columns: 1fr; }
  .v-settings-grid { grid-template-columns: 1fr; }
  .v-modal { padding: 20px 16px; }
  .v-content { min-height: 0; }
  .v-tx-table th:nth-child(4),
  .v-tx-table th:nth-child(5) { display: none; }
  .v-tx-row td:nth-child(4),
  .v-tx-row td:nth-child(5) { display: none; }
  .v-filter-bar { flex-direction: column; align-items: stretch; }
  .v-date-range { flex-wrap: wrap; }
}
`;

// ─── Utility functions (unchanged logic) ─────────────────────────────────────

const parseDate    = s  => new Date(s + "T12:00:00");
const txMonth      = t  => parseDate(t.date).getMonth();
const txYear       = t  => parseDate(t.date).getFullYear();
const txDay        = t  => parseDate(t.date).getDate();
const daysInMonth  = (y, m) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y, m) => new Date(y, m, 1).getDay();
const clampDay     = (y, m, d) => Math.min(Math.max(1, d), daysInMonth(y, m));
const precise      = n  => Number(Number(n).toFixed(2));

function parseMDY(str) {
  if (!str || str.length < 8) return "";
  const parts = str.replace(/\D/g, "/").split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  if (!m || !d || !y || y.length !== 4) return "";
  return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

function formatMDY(isoStr) {
  if (!isoStr || isoStr.length !== 10) return isoStr;
  const [y, m, d] = isoStr.split("-");
  return `${m}/${d}/${y}`;
}

function recurringInstancesForMonth(tx, y, m) {
  if (!tx.recurring || !tx.recurringFreq) return [];
  const origin     = parseDate(tx.date);
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
    new Intl.NumberFormat("en-US", { style:"currency", currency:info.code, minimumFractionDigits:2, maximumFractionDigits:2 })
      .format(typeof n === "number" && Number.isFinite(n) ? n : 0);
  const fSign = n => {
    const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return (v >= 0 ? "+" : "−") + fmt(Math.abs(v));
  };
  return { fmt, fSign, symbol: info.symbol, code: info.code };
}

function formatRunway(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const months = seconds / SEC_PER_MONTH;
  const days   = Math.max(0, Math.floor(seconds / 86400));
  const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits:1, maximumFractionDigits:1 });
  const f0 = new Intl.NumberFormat("en-US", { maximumFractionDigits:0 });
  const sub = `At current burn (≈ ${f0.format(days)} days)`;
  if (months >= 24) return { primary: `${f1.format(months/12)} years`,  secondary: sub };
  if (months >= 1)  return { primary: `${f1.format(months)} months`,    secondary: sub };
  if (days >= 1)    return { primary: `${f0.format(days)} days`,        secondary: "At current burn" };
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1)   return { primary: `${f0.format(hours)} hours`,      secondary: "At current burn" };
  return { primary: `${Math.max(1, Math.floor(seconds/60))} minutes`, secondary: "At current burn" };
}

// ─── Storage (unchanged) ──────────────────────────────────────────────────────

function getStorage() {
  const w = typeof window !== "undefined" ? window : undefined;
  if (w?.storage?.get && w?.storage?.set) return w.storage;
  return {
    async get(key)        { try { return { value: w?.localStorage?.getItem(key) ?? null }; } catch { return { value: null }; } },
    async set(key, value) { w?.localStorage?.setItem(key, value); },
  };
}

function normalizePayload(d) {
  return {
    txs: (Array.isArray(d?.txs) ? d.txs : []).filter(Boolean).map(t => ({ ...t, amount: precise(t.amount) })).filter(t => Number.isFinite(t.amount)),
    baseLiquidity: Number.isFinite(parseFloat(d?.baseLiquidity)) ? precise(d.baseLiquidity) : 0,
    budgets: d?.budgets && typeof d.budgets === "object" ? d.budgets : {},
    customCats: d?.customCats && typeof d.customCats === "object" ? d.customCats : { income:[], expense:[] },
    currency: typeof d?.currency === "string" ? d.currency : "USD",
  };
}

function emptyPayload() {
  return { txs:[], baseLiquidity:0, budgets:{}, customCats:{ income:[], expense:[] }, currency:"USD" };
}

function hasAnyData(p) {
  return p.baseLiquidity !== 0 || p.txs.length > 0 || Object.keys(p.budgets||{}).length > 0;
}

async function loadLocalData() {
  try { const r = await getStorage().get(STORAGE_KEY); if (r?.value) return normalizePayload(JSON.parse(r.value)); }
  catch (e) { console.error("[FIC] loadLocalData failed:", e); }
  return emptyPayload();
}
async function saveLocalData(payload) { await getStorage().set(STORAGE_KEY, JSON.stringify(payload)); }

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

// ─── Form helpers ─────────────────────────────────────────────────────────────

const blankForm = cats => ({
  type:"expense", amount:"", category:cats?.expense?.[0]||"Operations",
  date:TODAY_STR, description:"", tags:"", recurring:false, recurringFreq:"monthly",
});
const formFromTx = tx => ({
  type:tx.type, amount:String(tx.amount), category:tx.category,
  date:tx.date, description:tx.description||"", tags:tx.tags||"",
  recurring:tx.recurring||false, recurringFreq:tx.recurringFreq||"monthly",
});

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="info", onUndo) => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type, onUndo }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const remove = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, add, remove };
}

// ─── Date range filter component ──────────────────────────────────────────────

function DateRangeFilter({ from, to, onFrom, onTo, onClear }) {
  const [fromInput, setFromInput] = useState(from ? formatMDY(from) : "");
  const [toInput,   setToInput]   = useState(to   ? formatMDY(to)   : "");
  // Keep manual text inputs in sync when parent clears filters.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!from) setFromInput(""); }, [from]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!to)   setToInput("");   }, [to]);
  const handleFrom = val => {
    let v = val.replace(/[^\d]/g,"");
    if (v.length > 2) v = v.slice(0,2)+"/"+v.slice(2);
    if (v.length > 5) v = v.slice(0,5)+"/"+v.slice(5);
    v = v.slice(0,10); setFromInput(v);
    if (v.length === 10) { const iso = parseMDY(v); if (iso) onFrom(iso); }
    else if (v === "") onFrom("");
  };
  const handleTo = val => {
    let v = val.replace(/[^\d]/g,"");
    if (v.length > 2) v = v.slice(0,2)+"/"+v.slice(2);
    if (v.length > 5) v = v.slice(0,5)+"/"+v.slice(5);
    v = v.slice(0,10); setToInput(v);
    if (v.length === 10) { const iso = parseMDY(v); if (iso) onTo(iso); }
    else if (v === "") onTo("");
  };
  const hasFilter = from || to;
  return (
    <div className="v-date-range">
      <input type="text" value={fromInput} onChange={e => handleFrom(e.target.value)}
        placeholder="MM/DD/YYYY" maxLength={10}
        style={{ width:130, background:"rgba(255,255,255,0.025)", border:`1px solid ${C.border}`, padding:"9px 10px", color:C.text1, fontSize:12, fontFamily:"'Azeret Mono',monospace", letterSpacing:"0.04em" }} />
      <span style={{ color:C.text3, fontSize:11 }}>—</span>
      <input type="text" value={toInput} onChange={e => handleTo(e.target.value)}
        placeholder="MM/DD/YYYY" maxLength={10}
        style={{ width:130, background:"rgba(255,255,255,0.025)", border:`1px solid ${C.border}`, padding:"9px 10px", color:C.text1, fontSize:12, fontFamily:"'Azeret Mono',monospace", letterSpacing:"0.04em" }} />
      {hasFilter && (
        <>
          <button onClick={() => { onClear(); setFromInput(""); setToInput(""); }} className="v-btn-secondary" style={{ padding:"9px 12px", fontSize:9, letterSpacing:"0.14em" }}>CLEAR</button>
          <span style={{ fontSize:9, color:C.gold, letterSpacing:"0.12em", fontWeight:600 }}>FILTERED</span>
        </>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, valueColor = C.text1, badge, indicator, last }) {
  return (
    <div className="v-kpi-card" style={{ borderRight: last ? "none" : `1px solid ${C.border}` }}>
      <div className="v-label">{label}</div>
      <div className="v-kpi-value" style={{ color: valueColor }}>
        {indicator && (
          <span style={{ fontSize:11, marginRight:5, color:indicator==="up"?C.green:C.red, verticalAlign:"middle" }}>
            {indicator==="up" ? "▲" : "▼"}
          </span>
        )}
        {value}
      </div>
      {sub && <div className="v-kpi-sub">{sub}</div>}
      {badge && (
        <div style={{ marginTop:7, fontSize:7, letterSpacing:"0.18em", display:"inline-block", padding:"2px 7px", background:C.goldDim, color:C.gold, border:`1px solid ${C.goldDim}`, fontWeight:700 }}>
          {badge}
        </div>
      )}
    </div>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

function ChartTip({ active, payload, label, fmt, fSign }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, padding:"11px 15px", fontFamily:"'Azeret Mono',monospace", fontSize:11, minWidth:160 }}>
      <div style={{ color:C.text2, marginBottom:8, fontSize:9, letterSpacing:"0.12em" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:18, marginBottom:3 }}>
          <span style={{ color:C.text2 }}>{p.name}</span>
          <span style={{ fontWeight:600, color:p.color }}>{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div style={{ borderTop:`1px solid ${C.borderFaint}`, marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:C.text3 }}>Net</span>
          <span style={{ fontWeight:600, color:payload[0].value-payload[1].value>=0 ? C.green : C.red }}>
            {fSign(payload[0].value - payload[1].value)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Budget Bar ───────────────────────────────────────────────────────────────

function BudgetBar({ cat, spent, limit, fmt }) {
  const pct  = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const over = spent > limit;
  const warn = pct >= 80 && !over;
  const color = over ? C.red : warn ? C.gold : C.green;
  return (
    <div className="v-budget-bar">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <span style={{ fontSize:12, color:C.textMid }}>{cat}</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:11, fontFamily:"'Azeret Mono',monospace", color:C.text2 }}>{fmt(spent)}</span>
          <span style={{ fontSize:10, color:C.text3 }}>/</span>
          <span style={{ fontSize:11, fontFamily:"'Azeret Mono',monospace", color:C.text2 }}>{fmt(limit)}</span>
          {over && <span style={{ fontSize:7, letterSpacing:"0.18em", color:C.red, fontWeight:700 }}>OVER</span>}
          {warn && <span style={{ fontSize:7, letterSpacing:"0.18em", color:C.gold, fontWeight:700 }}>ALERT</span>}
        </div>
      </div>
      <div className="v-budget-bar-track">
        <div className="v-budget-bar-fill" style={{ width:`${pct}%`, background:color, opacity: over ? 1 : 0.65 }} />
      </div>
    </div>
  );
}

// ─── Tx Row ───────────────────────────────────────────────────────────────────

function TxRow({ tx, onEdit, onDelete, fmt }) {
  const [hov, setHov] = useState(false);
  const tags = tx.tags ? tx.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const isInc = tx.type === "income";
  return (
    <tr
      className={`v-tx-row ${isInc ? "v-tx-row--income" : "v-tx-row--expense"}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <td
        className={`v-tx-date-cell ${isInc ? "v-tx-date-cell--income" : "v-tx-date-cell--expense"}`}
        style={{ fontFamily:"'Azeret Mono',monospace", fontSize:11, color:C.text2, whiteSpace:"nowrap" }}
      >
        {parseDate(tx.date).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
      </td>
      <td>
        <div style={{ display:"flex", gap:5, alignItems:"center", justifyContent:"center" }}>
          <span className="v-badge" style={{ background:isInc?C.greenDim:C.redDim, color:isInc?C.green:C.red }}>
            {tx.type}
          </span>
          {tx.recurring && !tx.isRecurringInstance && (
            <span style={{ fontSize:7, padding:"2px 5px", background:"rgba(255,255,255,0.03)", color:C.gold, letterSpacing:"0.1em", fontWeight:700 }}>REC</span>
          )}
        </div>
      </td>
      <td style={{ fontSize:12, color:C.textMid }}>{tx.category}</td>
      <td style={{ fontSize:11, color:C.text2, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {tx.description || <span style={{ color:C.text3 }}>—</span>}
      </td>
      <td>
        <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
          {tags.slice(0,2).map((tag,i) => <span key={i} className="v-tag">{tag}</span>)}
          {tags.length > 2 && <span style={{ fontSize:9, color:C.text2 }}>+{tags.length-2}</span>}
        </div>
      </td>
      <td style={{ textAlign:"right", fontFamily:"'Azeret Mono',monospace", fontSize:13, fontWeight:600, color:isInc?C.green:C.red, whiteSpace:"nowrap" }}>
        {isInc ? "+" : "−"}{fmt(tx.amount)}
      </td>
      <td style={{ opacity: hov ? 1 : 0, whiteSpace:"nowrap", transition:"opacity 120ms" }}>
        {!tx.isRecurringInstance && (
          <button className="v-btn-ghost" onClick={() => onEdit(tx)} style={{ marginRight:10 }}>EDIT</button>
        )}
        <button className="v-btn-ghost" onClick={() => onDelete(tx)} style={{ color:C.text3 }}
          onMouseEnter={e => e.currentTarget.style.color = C.red}
          onMouseLeave={e => e.currentTarget.style.color = C.text3}>
          DEL
        </button>
      </td>
    </tr>
  );
}

function TxTable({ txs, onEdit, onDelete, fmt }) {
  if (!txs.length) return <div className="v-empty">No records found</div>;
  return (
    <table className="v-tx-table">
      <thead>
        <tr>
          {["Date","Type","Category","Description","Tags","Amount",""].map((h, i) => (
            <th key={i} style={{ textAlign: i === 5 ? "right" : "left" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {txs.map(tx => <TxRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} fmt={fmt} />)}
      </tbody>
    </table>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ onClose, width = 420, children }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="v-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="v-modal" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

// ─── Recurring Scope Modal ────────────────────────────────────────────────────

function RecurringScopeModal({ action, tx, onThis, onAll, onClose }) {
  const label = parseDate(tx.date).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  return (
    <Modal onClose={onClose} width={380}>
      <div className="v-label" style={{ marginBottom:4 }}>Recurring Transaction</div>
      <div style={{ fontSize:16, fontWeight:600, marginBottom:10, color:C.text1 }}>{action==="delete"?"Delete":"Edit"} which?</div>
      <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:22 }}>
        This is part of a recurring series. Choose the scope of change.
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {[
          { fn:onThis, title:"This occurrence only",        sub:`Affects only ${label}` },
          { fn:onAll,  title:"This and all future entries", sub:"Modifies the full series" },
        ].map(({ fn, title, sub }) => (
          <button key={title} onClick={fn} className="v-scope-btn">
            <div style={{ fontWeight:600, marginBottom:3 }}>{title}</div>
            <div style={{ fontSize:11, color:C.text2 }}>{sub}</div>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="v-btn-secondary" style={{ width:"100%", marginTop:12, padding:"10px", fontSize:12 }}>Cancel</button>
    </Modal>
  );
}

// ─── Settings Card ────────────────────────────────────────────────────────────

function SettingsCard({ title, desc, children }) {
  return (
    <div className="v-settings-card">
      <div className="v-label" style={{ marginBottom:5 }}>{title}</div>
      <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:18 }}>{desc}</div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>{children}</div>
    </div>
  );
}

// ─── Toast Stack ──────────────────────────────────────────────────────────────

function ToastStack({ toasts, remove }) {
  if (!toasts.length) return null;
  return (
    <div className="v-toast-stack">
      {toasts.map(t => (
        <div key={t.id} className="v-toast">
          <span style={{ flex:1, color:C.text1, fontSize:12 }}>{t.msg}</span>
          {t.onUndo && (
            <button onClick={() => { t.onUndo(); remove(t.id); }}
              style={{ background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`, color:C.textMid, fontSize:9, fontWeight:700, letterSpacing:"0.14em", padding:"3px 8px" }}>
              UNDO
            </button>
          )}
          <button onClick={() => remove(t.id)}
            style={{ background:"none", border:"none", color:C.text2, fontSize:16, lineHeight:1, padding:"0 0 0 4px" }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── Mobile Nav Icons (inline SVG) ───────────────────────────────────────────

const NavIcons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <rect x="3" y="3" width="8" height="9"/><rect x="13" y="3" width="8" height="5"/>
      <rect x="13" y="11" width="8" height="10"/><rect x="3" y="15" width="8" height="6"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="0"/><line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
    </svg>
  ),
  ledger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/>
      <line x1="4" y1="18" x2="20" y2="18"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  ),
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Vault() {
  const [session,      setSession]      = useState(null);
  const [user,         setUser]         = useState(null);
  const [authReady,    setAuthReady]    = useState(false);

  const [txs,        setTxs]        = useState([]);
  const [baseLiq,    setBaseLiq]    = useState(0);
  const [budgets,    setBudgets]    = useState({});
  const [customCats, setCustomCats] = useState({ income:[], expense:[] });
  const [currency,   setCurrency]   = useState("USD");
  const [loaded,     setLoaded]     = useState(false);

  const [view,         setView]         = useState("overview");
  const [modal,        setModal]        = useState(null);
  const [editId,       setEditId]       = useState(null);
  const [form,         setForm]         = useState(null);
  const [liqInput,     setLiqInput]     = useState("");
  const [period,       setPeriod]       = useState({ m:TODAY.getMonth(), y:TODAY.getFullYear() });
  const [chartMode,    setChartMode]    = useState("monthly");
  const [txFilter,     setTxFilter]     = useState("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerFrom,   setLedgerFrom]   = useState("");
  const [ledgerTo,     setLedgerTo]     = useState("");
  const [selDay,       setSelDay]       = useState(null);
  const [scopeAction,  setScopeAction]  = useState(null);
  const [newCatInput,  setNewCatInput]  = useState({ income:"", expense:"" });
  const [budgetInput,  setBudgetInput]  = useState({});
  const [settingsTab,  setSettingsTab]  = useState("data");
  const [showProjected,setShowProjected]= useState(false);

  const { toasts, add:addToast, remove:removeToast } = useToast();
  const { fmt, fSign } = useMemo(() => makeFmt(currency), [currency]);

  const cats = useMemo(() => ({
    income:  [...DEFAULT_CATS.income,  ...(customCats.income||[])],
    expense: [...DEFAULT_CATS.expense, ...(customCats.expense||[])],
  }), [customCats]);

  // ── Auth bootstrap ─────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    if (!hasSupabaseConfig || !supabase) { setAuthReady(true); return () => { mounted=false; }; }
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session??null); setUser(data.session?.user??null); setAuthReady(true);
    });
    const { data:sub } = supabase.auth.onAuthStateChange((_e, next) => {
      if (!mounted) return;
      setSession(next??null); setUser(next?.user??null);
    });
    return () => { mounted=false; sub?.subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let disposed = false;
    (async () => {
      try {
        let d = emptyPayload();
        if (user?.id && hasSupabaseConfig) {
          const local = await loadLocalData();
          const cloud = await loadCloudData(user.id);
          if (cloud) { d=cloud; await saveLocalData(cloud); }
          else if (hasAnyData(local)) { d=local; await saveCloudData(user.id,local); }
          else { await saveCloudData(user.id,d); }
        } else {
          d = await loadLocalData();
        }
        if (disposed) return;
        setTxs(d.txs); setBaseLiq(d.baseLiquidity); setBudgets(d.budgets);
        setCustomCats(d.customCats); setCurrency(d.currency);
        setForm(blankForm({ expense:[...DEFAULT_CATS.expense,...(d.customCats.expense||[])], income:[...DEFAULT_CATS.income,...(d.customCats.income||[])] }));
      } catch (e) {
        console.error("[Vault]", e);
        if (!disposed) addToast("Sync failed. Using local data.", "err");
      } finally {
        if (!disposed) setLoaded(true);
      }
    })();
    return () => { disposed=true; };
  }, [authReady, user?.id, addToast]);

  // ── Persistence ────────────────────────────────────────────────────────────

  const persist = useCallback(async (nt, nb, nb2, nc, cur) => {
    const payload = { txs:nt, baseLiquidity:nb, budgets:nb2, customCats:nc, currency:cur };
    try {
      if (user?.id && hasSupabaseConfig) await saveCloudData(user.id, payload);
      await saveLocalData(payload);
    } catch { addToast("Save failed.", "err"); }
  }, [addToast, user?.id]);

  const signIn  = useCallback(async (e,p) => { if(!supabase)throw new Error("No supabase"); const {error}=await supabase.auth.signInWithPassword({email:e,password:p}); if(error)throw error; },[]);
  const signUp  = useCallback(async (e,p) => { if(!supabase)throw new Error("No supabase"); const {error}=await supabase.auth.signUp({email:e,password:p}); if(error)throw error; },[]);
  const resetPw = useCallback(async e   => { if(!supabase)throw new Error("No supabase"); const {error}=await supabase.auth.resetPasswordForEmail(e); if(error)throw error; },[]);
  const signOut = useCallback(async () => { if(!supabase)return; await supabase.auth.signOut(); }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const h = e => {
      if (modal || scopeAction) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (["input","textarea","select"].includes(tag)) return;
      const quickAdd = () => { setEditId(null); setForm(blankForm(cats)); setModal("tx"); };
      const map = {
        n:quickAdd, N:quickAdd,
        l:()=>setView("ledger"),  L:()=>setView("ledger"),
        o:()=>setView("overview"), O:()=>setView("overview"),
        c:()=>setView("calendar"), C:()=>setView("calendar"),
      };
      if (map[e.key]) { map[e.key](); return; }
      if (e.key === "ArrowLeft")  goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modal, scopeAction, cats]);

  // ── Period nav ─────────────────────────────────────────────────────────────

  const goPrev = () => setPeriod(p => { const d=new Date(p.y,p.m-1,1); return {m:d.getMonth(),y:d.getFullYear()}; });
  const goNext = () => setPeriod(p => { const d=new Date(p.y,p.m+1,1); return {m:d.getMonth(),y:d.getFullYear()}; });
  const periodLabel = `${MONTHS_FULL[period.m]} ${period.y}`;

  // ── Derived data ───────────────────────────────────────────────────────────

  const monthTxs     = useMemo(() => txsForMonth(txs, period.y, period.m), [txs, period]);
  const monthIncome  = useMemo(() => monthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),  [monthTxs]);
  const monthExpenses= useMemo(() => monthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [monthTxs]);
  const monthNet     = monthIncome - monthExpenses;
  const allTimeNet   = useMemo(() => txs.reduce((s,t)=>t.type==="income"?s+t.amount:s-t.amount,0), [txs]);
  const liquidity    = baseLiq + allTimeNet;

  const runwayDisplay = useMemo(() => {
    if (monthExpenses <= 0 || liquidity <= 0) return null;
    return formatRunway((liquidity / monthExpenses) * SEC_PER_MONTH);
  }, [liquidity, monthExpenses]);

  const catBreakdown = useMemo(() => {
    const acc = {};
    monthTxs.filter(t=>t.type==="expense").forEach(t => { acc[t.category]=(acc[t.category]||0)+t.amount; });
    return Object.entries(acc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  }, [monthTxs]);

  const budgetAlerts = useMemo(() =>
    catBreakdown.filter(([cat,spent])=>budgets[cat]&&spent>=budgets[cat]*0.8).map(([cat,spent])=>({ cat, spent, limit:budgets[cat], over:spent>budgets[cat] })),
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
    const years = new Set([...txs.map(txYear), TODAY.getFullYear()]);
    return [...years].sort().map(y => {
      const flat = MONTHS_SHORT.flatMap((_,i) => txsForMonth(txs,y,i));
      return { name:String(y), Income:precise(flat.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)), Expenses:precise(flat.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)) };
    });
  }, [txs]);

  const calMap = useMemo(() => {
    const m = {};
    monthTxs.forEach(t => {
      const d=txDay(t);
      if (!m[d]) m[d]={income:0,expense:0,txs:[]};
      if(t.type==="income")m[d].income+=t.amount; else m[d].expense+=t.amount;
      m[d].txs.push(t);
    });
    return m;
  }, [monthTxs]);

  const ledgerTxs = useMemo(() => {
    let list = txFilter==="all" ? [...txs] : txs.filter(t=>t.type===txFilter);
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
    return list.sort((a,b) => parseDate(b.date) - parseDate(a.date));
  }, [txs, txFilter, ledgerSearch, ledgerFrom, ledgerTo]);

  const ledgerStats = useMemo(() => {
    const base = (ledgerFrom || ledgerTo)
      ? txs.filter(t => (!ledgerFrom || t.date >= ledgerFrom) && (!ledgerTo || t.date <= ledgerTo))
      : txs;
    return {
      income:   base.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),
      expenses: base.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),
      count:    base.length,
    };
  }, [txs, ledgerFrom, ledgerTo]);

  const ledgerIncome   = useMemo(() => txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),   [txs]);
  const ledgerExpenses = useMemo(() => txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [txs]);

  // ── Exports ────────────────────────────────────────────────────────────────

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download:filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const exportCSV = useCallback(() => {
    const header = ["Date","Type","Category","Description","Tags","Amount","Currency","Recurring"];
    const rows = txs.map(t => [t.date,t.type,t.category,`"${(t.description||"").replace(/"/g,'""')}"`,`"${(t.tags||"").replace(/"/g,'""')}"`,t.amount.toFixed(2),currency,t.recurring?t.recurringFreq:"no"]);
    triggerDownload(new Blob([[header,...rows].map(r=>r.join(",")).join("\n")],{type:"text/csv"}),`vault-export-${TODAY_STR}.csv`);
    addToast(`Exported ${txs.length} records`, "ok");
  }, [txs, currency, addToast]);

  const exportJSON = useCallback(() => {
    triggerDownload(new Blob([JSON.stringify({baseLiquidity:precise(baseLiq),txs:txs.map(t=>({...t,amount:precise(t.amount)})),budgets,customCats,currency},null,2)],{type:"application/json"}),`vault-backup-${TODAY_STR}.json`);
    addToast(`Backup exported — ${txs.length} records`, "ok");
  }, [baseLiq, txs, budgets, customCats, currency, addToast]);

  const normalizeImport = useCallback(raw => {
    if (!raw||typeof raw!=="object") throw new Error("Invalid JSON.");
    const baseLiquidity = parseFloat(raw.baseLiquidity);
    if (!Number.isFinite(baseLiquidity)) throw new Error("Invalid baseLiquidity.");
    if (!Array.isArray(raw.txs)) throw new Error("Invalid txs.");
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
    return {baseLiquidity:precise(baseLiquidity),txs:out,budgets:raw.budgets||{},customCats:raw.customCats||{income:[],expense:[]},currency:raw.currency||"USD",dropped};
  }, []);

  const importFile = useCallback(async file => {
    let parsed;
    try { parsed=JSON.parse(await file.text()); } catch { throw new Error("Invalid JSON file."); }
    const n=normalizeImport(parsed);
    setBaseLiq(n.baseLiquidity); setTxs(n.txs); setBudgets(n.budgets); setCustomCats(n.customCats); setCurrency(n.currency);
    persist(n.txs,n.baseLiquidity,n.budgets,n.customCats,n.currency);
    addToast(`Imported ${n.txs.length} records${n.dropped?` (${n.dropped} skipped)`:""}`, "ok");
  }, [normalizeImport, persist, addToast]);

  const resetAllData = useCallback(() => {
    if (!window.confirm("Reset all data? This cannot be undone.")) return;
    setTxs([]); setBaseLiq(0); setBudgets({}); setCustomCats({income:[],expense:[]}); setCurrency("USD");
    persist([],0,{},{income:[],expense:[]},"USD");
    addToast("All data cleared", "info");
  }, [persist, addToast]);

  // ── Transaction CRUD ───────────────────────────────────────────────────────

  const commitTx = useCallback(() => {
    const raw = typeof form.amount==="string"?form.amount.replace(/[$,\s]/g,""):form.amount;
    const amt = parseFloat(raw);
    if (!amt||amt<=0) return;
    const tx={...form,amount:precise(amt),recurring:form.recurring||false,recurringFreq:form.recurringFreq||"monthly"};
    const next = editId ? txs.map(t=>t.id===editId?{...tx,id:t.id}:t) : [...txs,{...tx,id:Date.now().toString()+Math.random().toString(36).slice(2)}];
    setTxs(next); persist(next,baseLiq,budgets,customCats,currency);
    setModal(null); setEditId(null); setForm(blankForm(cats));
    addToast(editId?"Transaction updated":"Transaction recorded","ok");
  }, [form,editId,txs,baseLiq,budgets,customCats,currency,cats,persist,addToast]);

  const deleteTxById = useCallback(id => {
    const deleted = txs.find(t=>t.id===id);
    const next    = txs.filter(t=>t.id!==id);
    setTxs(next); persist(next,baseLiq,budgets,customCats,currency);
    addToast(`Deleted: ${deleted?.category||"transaction"}`, "info", () => {
      setTxs(prev => {
        const restored=[...prev,deleted].sort((a,b)=>parseDate(b.date)-parseDate(a.date));
        persist(restored,baseLiq,budgets,customCats,currency);
        return restored;
      });
    });
  }, [txs,baseLiq,budgets,customCats,currency,persist,addToast]);

  const handleDelete = useCallback(tx => {
    const target = tx.isRecurringInstance?txs.find(t=>t.id===tx.recurringParentId)||tx:tx;
    if (target.recurring||tx.isRecurringInstance){setScopeAction({action:"delete",tx:target});return;}
    deleteTxById(tx.id);
  }, [txs,deleteTxById]);

  const openEdit = useCallback(tx => {
    const target = tx.isRecurringInstance?txs.find(t=>t.id===tx.recurringParentId):tx;
    if (!target) return;
    if (tx.recurring||tx.isRecurringInstance){setScopeAction({action:"edit",tx:target});return;}
    setEditId(target.id); setForm(formFromTx(target)); setModal("tx");
  }, [txs]);

  const openAdd = useCallback(() => { setEditId(null); setForm(blankForm(cats)); setModal("tx"); }, [cats]);
  const openLiq = useCallback(() => { setLiqInput(String(baseLiq)); setModal("liq"); }, [baseLiq]);

  const commitLiq = useCallback(() => {
    const v=parseFloat((liqInput||"").replace(/[$,\s]/g,""));
    if(!isNaN(v)){const p=precise(v);setBaseLiq(p);persist(txs,p,budgets,customCats,currency);}
    setModal(null);
  }, [liqInput,txs,budgets,customCats,currency,persist]);

  const commitBudgets = useCallback(() => {
    const nb={...budgets};
    Object.entries(budgetInput).forEach(([cat,val])=>{
      const v=parseFloat((val||"").replace(/[$,\s]/g,""));
      if(!isNaN(v)&&v>0)nb[cat]=v; else if(val==="")delete nb[cat];
    });
    setBudgets(nb); persist(txs,baseLiq,nb,customCats,currency); setBudgetInput({});
    addToast("Budget limits saved","ok");
  }, [budgets,budgetInput,txs,baseLiq,customCats,currency,persist,addToast]);

  const addCustomCat = useCallback(type => {
    const val=newCatInput[type]?.trim();
    if(!val)return;
    if(cats[type].includes(val)){addToast("Category already exists","info");return;}
    const nc={...customCats,[type]:[...(customCats[type]||[]),val]};
    setCustomCats(nc); persist(txs,baseLiq,budgets,nc,currency);
    setNewCatInput(p=>({...p,[type]:""}));
    addToast(`Added: ${val}`,"ok");
  }, [newCatInput,cats,customCats,txs,baseLiq,budgets,currency,persist,addToast]);

  const removeCustomCat = useCallback((type,cat) => {
    const nc={...customCats,[type]:(customCats[type]||[]).filter(c=>c!==cat)};
    setCustomCats(nc); persist(txs,baseLiq,budgets,nc,currency);
    addToast(`Removed: ${cat}`,"info");
  }, [customCats,txs,baseLiq,budgets,currency,persist,addToast]);

  const saveCurrency = useCallback(code => {
    setCurrency(code); persist(txs,baseLiq,budgets,customCats,code);
    addToast(`Currency: ${code}`,"ok");
  }, [txs,baseLiq,budgets,customCats,persist,addToast]);

  const handleScopeThis = useCallback(() => {
    if(scopeAction.action==="delete"){deleteTxById(scopeAction.tx.id);}
    else{setEditId(scopeAction.tx.id);setForm({...formFromTx(scopeAction.tx),recurring:false});setModal("tx");}
    setScopeAction(null);
  }, [scopeAction,deleteTxById]);

  const handleScopeAll = useCallback(() => {
    if(scopeAction.action==="delete"){deleteTxById(scopeAction.tx.id);}
    else{setEditId(scopeAction.tx.id);setForm(formFromTx(scopeAction.tx));setModal("tx");}
    setScopeAction(null);
  }, [scopeAction,deleteTxById]);

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (!authReady) return (
    <div style={{ position:"fixed", inset:0, background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Azeret Mono',monospace", color:C.text3, fontSize:10, letterSpacing:"0.3em" }}>
      LOADING
    </div>
  );

  if (hasSupabaseConfig && !session) {
    return <AuthView onSignIn={signIn} onSignUp={signUp} onResetPassword={resetPw} warning={null} />;
  }

  if (!loaded || !form) return (
    <div style={{ position:"fixed", inset:0, background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Azeret Mono',monospace", color:C.text3, fontSize:10, letterSpacing:"0.3em" }}>
      LOADING
    </div>
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  const breakEvenGap = monthExpenses - monthIncome;
  const overBudget   = budgetAlerts.some(a=>a.over);
  const dayData      = selDay !== null ? (calMap[selDay]||null) : null;
  const chartData    = chartMode==="monthly" ? monthlyChartData : yearlyChartData;
  const tipRenderer  = props => <ChartTip {...props} fmt={fmt} fSign={fSign} />;
  const isFiltered   = !!(ledgerFrom || ledgerTo);
  const userInitial  = user?.email ? user.email[0].toUpperCase() : "U";
  const userEmailShort = user?.email ? user.email : "";

  const inputSx = {
    width:"100%", background:"rgba(255,255,255,0.025)", border:`1px solid ${C.border}`,
    padding:"9px 12px", color:C.text1, fontSize:13, fontFamily:"inherit",
    transition:"border-color 150ms",
  };

  const navItems = [
    ["overview","Overview","O"],
    ["calendar","Calendar","C"],
    ["ledger","Ledger","L"],
    ["settings","Settings",""],
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: VAULT_CSS }} />

      <div className="v-app">

        {/* ── SIDEBAR (desktop) ───────────────────────────────────────── */}
        <aside className="v-sidebar">

          {/* Logo */}
          <div className="v-sidebar-logo">
            <div className="v-sidebar-logo-mark">
              <img src="BrandOff.svg" alt="" width={20} height={20} style={{ opacity:0.75 }} />
            </div>
            <span className="v-sidebar-logo-name">VAULT</span>
          </div>

          {/* Liquidity widget */}
          <div className="v-liq-widget">
            <div className="v-label" style={{ fontSize:8 }}>Total Liquidity</div>
            <div className="v-liq-value" style={{ color: liquidity >= 0 ? C.text1 : C.red }}>
              {fmt(liquidity)}
            </div>
            <div style={{ fontSize:9, color:C.text3, marginTop:4, letterSpacing:"0.04em" }}>Base + net transactions</div>
          </div>

          {/* Budget alerts */}
          {budgetAlerts.length > 0 && (
            <div className="v-budget-alert">
              <div className="v-label" style={{ fontSize:7, color:C.red, marginBottom:5 }}>Budget Alerts</div>
              {budgetAlerts.slice(0,3).map(({cat,over}) => (
                <div key={cat} style={{ fontSize:10, color: over ? C.red : C.gold, marginBottom:2, letterSpacing:"0.02em" }}>
                  {over ? "▲" : "!"} {cat}
                </div>
              ))}
            </div>
          )}

          {/* Navigation */}
          <nav className="v-nav">
            {navItems.map(([id,lbl,key]) => (
              <button key={id} className={`v-nav-item${view===id?" active":""}`} onClick={() => setView(id)}>
                <span>{lbl}</span>
                {key && <span className="v-nav-shortcut">{key}</span>}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div className="v-sidebar-actions">
            <button onClick={openLiq} className="v-btn-secondary" style={{ width:"100%", marginBottom:8, textAlign:"center" }}>
              Set Liquidity
            </button>
            <button onClick={openAdd} className="v-btn-primary">
              + New Transaction
            </button>
            <div style={{ fontSize:8, color:C.text3, textAlign:"center", letterSpacing:"0.1em", marginTop:9, marginBottom:2 }}>
              N · new &nbsp; ← → · month
            </div>
          </div>

          {/* Account / Sign out */}
          {hasSupabaseConfig && user?.email && (
            <div className="v-account">
              <div className="v-account-avatar">{userInitial}</div>
              <div className="v-account-info">
                <div className="v-account-email">{userEmailShort}</div>
                <button className="v-account-signout" onClick={signOut}>Exit ↗</button>
              </div>
            </div>
          )}
        </aside>

        {/* ── MOBILE TOP BAR ─────────────────────────────────────────── */}
        <div className="v-mobile-topbar">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <img src="BrandOff.svg" alt="" width={18} height={18} style={{ opacity:0.7 }} />
            <span style={{ fontFamily:"'Azeret Mono',monospace", fontSize:12, fontWeight:600, letterSpacing:"0.12em", color:C.text1 }}>VAULT</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:13, fontWeight:500, color: liquidity >= 0 ? C.text1 : C.red, letterSpacing:"-0.02em" }}>
              {fmt(liquidity)}
            </div>
            {(view==="overview"||view==="calendar") && (
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <button className="v-period-btn" onClick={goPrev}>‹</button>
                <span style={{ fontFamily:"'Azeret Mono',monospace", fontSize:10, color:C.text2 }}>{MONTHS_SHORT[period.m]} {period.y}</span>
                <button className="v-period-btn" onClick={goNext}>›</button>
              </div>
            )}
          </div>
        </div>

        {/* ── MAIN AREA ───────────────────────────────────────────────── */}
        <div className="v-main">

          {/* Desktop header */}
          <header className="v-header">
            <div>
              <div className="v-header-sub">
                {{ overview:"Performance Overview", calendar:"Transaction Calendar", ledger:"Full Ledger", settings:"System Settings" }[view]}
              </div>
              <div className="v-header-title">
                {{ overview:"Overview", calendar:"Calendar", ledger:"Ledger", settings:"Settings" }[view]}
              </div>
            </div>
            {(view==="overview"||view==="calendar") && (
              <div className="v-period-nav">
                <button className="v-period-btn" onClick={goPrev}>‹</button>
                <span className="v-period-label">{periodLabel}</span>
                <button className="v-period-btn" onClick={goNext}>›</button>
              </div>
            )}
          </header>

          <main className="v-content">

            {/* ──────────── OVERVIEW ──────────────────────────────────── */}
            {view === "overview" && (
              <>
                {/* KPI strip */}
                <div className="v-kpi-strip" style={{ marginBottom:1 }}>
                  <KpiCard label="Net Position"      value={fSign(monthNet)}         valueColor={monthNet>=0?C.green:C.red} sub={monthNet>=0?"Positive period":"Deficit period"} indicator={monthNet>=0?"up":"dn"} />
                  <KpiCard label="Monthly Income"    value={fmt(monthIncome)}         valueColor={monthIncome>0?C.green:C.white}   sub={`${monthTxs.filter(t=>t.type==="income").length} records`} />
                  <KpiCard label="Monthly Expenses"  value={fmt(monthExpenses)}       valueColor={C.red}     sub={`${monthTxs.filter(t=>t.type==="expense").length} records`} />
                  <KpiCard label="Runway"            value={runwayDisplay?.primary??"—"} valueColor={runwayDisplay?C.gold:C.text2} sub={runwayDisplay?.secondary??"Insufficient data"} />
                  <KpiCard label="Break-even Gap"    value={breakEvenGap>0?fmt(breakEvenGap)+" needed":"Achieved"}
                    valueColor={breakEvenGap>0?C.gold:C.green}
                    sub={breakEvenGap>0?"Required to break even":"Surplus: "+fmt(Math.abs(breakEvenGap))}
                    badge={overBudget?"BUDGET EXCEEDED":budgetAlerts.length>0?"BUDGET ALERT":undefined}
                    last />
                </div>

                {/* Projection toggle */}
                <div style={{ margin:"14px 0 10px", display:"flex", alignItems:"center", gap:8 }}>
                  <button onClick={()=>setShowProjected(p=>!p)} className="v-btn-secondary" style={{ fontSize:9, letterSpacing:"0.15em", padding:"7px 14px" }}>
                    {showProjected?"HIDE":"SHOW"} PROJECTION — {MONTHS_SHORT[(period.m+1)%12].toUpperCase()}
                  </button>
                </div>

                {showProjected && (
                  <div className="v-proj-grid">
                    {[
                      { label:`INCOME · ${MONTHS_SHORT[(period.m+1)%12]}`,   value:fmt(projectedNext.income),  color:C.green },
                      { label:`EXPENSES · ${MONTHS_SHORT[(period.m+1)%12]}`, value:fmt(projectedNext.expense), color:C.red },
                      { label:`NET · ${MONTHS_SHORT[(period.m+1)%12]}`,      value:fSign(projectedNext.income-projectedNext.expense), color:projectedNext.income-projectedNext.expense>=0?C.green:C.red },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="v-proj-tile">
                        <div className="v-label" style={{ fontSize:7, marginBottom:9 }}>{label}</div>
                        <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:20, fontWeight:500, color, letterSpacing:"-0.04em" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chart */}
                <div className="v-chart-panel" style={{ marginBottom:1 }}>
                  <div className="v-chart-header">
                    <div>
                      <div className="v-label" style={{ fontSize:7, marginBottom:4 }}>
                        {chartMode==="monthly" ? `Monthly Performance · ${period.y}` : "Annual Performance"}
                      </div>
                      <div style={{ fontSize:11, color:C.text2 }}>
                        {chartMode==="monthly" ? "12-month view" : `${yearlyChartData.length} year${yearlyChartData.length!==1?"s":""} of history`}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                      {[{c:C.green,l:"Income"},{c:C.red,l:"Expenses"}].map(x=>(
                        <div key={x.l} style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, color:C.text2 }}>
                          <div style={{ width:14, height:1, background:x.c, opacity:0.7 }} />{x.l}
                        </div>
                      ))}
                      <div style={{ width:1, height:14, background:C.border }} />
                      {[["monthly","Monthly"],["yearly","Yearly"]].map(([id,lbl])=>(
                        <button key={id} onClick={()=>setChartMode(id)}
                          style={{ padding:"4px 11px", background: chartMode===id?"rgba(255,255,255,0.05)":"transparent", border:`1px solid ${chartMode===id?C.border:"transparent"}`, color: chartMode===id?C.text1:C.text2, fontSize:9, letterSpacing:"0.12em", transition:"all 150ms", fontFamily:"inherit" }}>
                          {lbl.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:"14px 0 6px" }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData} margin={{ top:4, right:20, bottom:0, left:4 }}>
                        <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.025)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill:C.text2, fontSize:9, fontFamily:"'Azeret Mono',monospace" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill:C.text2, fontSize:9, fontFamily:"'Azeret Mono',monospace" }} axisLine={false} tickLine={false}
                          tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`} width={44} />
                        <Tooltip content={tipRenderer} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.04)" />
                        <Line type="monotone" dataKey="Income"   stroke={C.green} strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="Expenses" stroke={C.red}   strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bottom split */}
                <div className="v-split">
                  {/* Expense breakdown */}
                  <div className="v-panel">
                    <div className="v-panel-header">
                      <div className="v-label" style={{ fontSize:7, marginBottom:3 }}>Expense Breakdown</div>
                      <div style={{ fontSize:10, color:C.text2 }}>{periodLabel}</div>
                    </div>
                    <div style={{ padding:"16px 20px" }}>
                      {catBreakdown.length === 0
                        ? <div className="v-empty" style={{ padding:"30px 0" }}>No expense data</div>
                        : catBreakdown.map(([cat, val]) => {
                            const hasBudget = budgets[cat] > 0;
                            return hasBudget ? (
                              <BudgetBar key={cat} cat={cat} spent={val} limit={budgets[cat]} fmt={fmt} />
                            ) : (
                              <div key={cat} style={{ marginBottom:12 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                                  <span style={{ fontSize:11, color:C.textMid }}>{cat}</span>
                                  <span style={{ fontSize:11, fontFamily:"'Azeret Mono',monospace", color:C.text2 }}>{fmt(val)}</span>
                                </div>
                                <div style={{ height:1, background:"rgba(255,255,255,0.035)" }}>
                                  <div style={{ height:"100%", width:`${monthExpenses>0?(val/monthExpenses)*100:0}%`, background:C.red, opacity:0.45 }} />
                                </div>
                              </div>
                            );
                          })
                      }
                    </div>
                  </div>

                  {/* Recent transactions */}
                  <div className="v-panel" style={{ minWidth:0 }}>
                    <div className="v-panel-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div className="v-label" style={{ fontSize:7, marginBottom:3 }}>Recent Transactions</div>
                        <div style={{ fontSize:10, color:C.text2 }}>{periodLabel}</div>
                      </div>
                      {monthTxs.length > 0 && (
                        <button className="v-btn-ghost" onClick={() => setView("ledger")}>VIEW ALL →</button>
                      )}
                    </div>
                    <TxTable txs={[...monthTxs].sort((a,b)=>parseDate(b.date)-parseDate(a.date)).slice(0,7)} onEdit={openEdit} onDelete={handleDelete} fmt={fmt} />
                  </div>
                </div>
              </>
            )}

            {/* ──────────── CALENDAR ──────────────────────────────────── */}
            {view === "calendar" && (
              <div className="v-cal-grid">
                {/* Calendar grid */}
                <div className="v-panel">
                  <div className="v-panel-header">
                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:12 }}>
                      <div>
                        <div className="v-label" style={{ fontSize:7 }}>Month View</div>
                        <div style={{ fontSize:13, color:C.textMid, marginTop:5 }}>{periodLabel}</div>
                      </div>
                      <div style={{ display:"flex", gap:12, color:C.text2, fontSize:9, letterSpacing:"0.1em" }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:10, height:1, background:C.green, display:"inline-block" }} />Income</span>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:10, height:1, background:C.red,   display:"inline-block" }} />Expenses</span>
                      </div>
                    </div>

                    {/* Month summary */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:1, background:C.borderFaint }}>
                      {[
                        {l:"NET",      v:fSign(monthNet),    c:monthNet>=0?C.green:C.red},
                        {l:"INCOME",   v:fmt(monthIncome),   c:monthIncome>0?C.green:C.white},
                        {l:"EXPENSES", v:fmt(monthExpenses), c:C.red},
                      ].map(s=>(
                        <div key={s.l} style={{ padding:"10px 12px", background:C.surface }}>
                          <div className="v-label" style={{ fontSize:7, marginBottom:5 }}>{s.l}</div>
                          <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:14, color:s.c, fontWeight:600, letterSpacing:"-0.03em" }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding:"16px 16px 12px" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:6 }}>
                      {DAY_LABELS.map(d=>(
                        <div key={d} style={{ textAlign:"center", fontSize:7, fontWeight:600, letterSpacing:"0.14em", color:C.text3, padding:"3px 0", textTransform:"uppercase" }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
                      {Array.from({length:firstWeekday(period.y,period.m)}).map((_,i)=><div key={`off${i}`}/>)}
                      {Array.from({length:daysInMonth(period.y,period.m)},(_,i)=>i+1).map(day => {
                        const d=calMap[day];
                        const isToday=day===TODAY.getDate()&&period.m===TODAY.getMonth()&&period.y===TODAY.getFullYear();
                        const isSel=selDay===day;
                        const hasProj=d?.txs?.some(t=>t.isRecurringInstance);
                        return (
                          <div key={day} onClick={()=>setSelDay(isSel?null:day)} className={`v-cal-day${isSel?" active":""}${isToday?" today":""}`}>
                            {hasProj && <div style={{ position:"absolute", top:4, right:4, width:3, height:3, background:C.gold, borderRadius:"50%" }} />}
                            <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4 }}>
                              <div style={{ fontSize:10, fontFamily:"'Azeret Mono',monospace", color:isToday?C.text1:isSel?C.textMid:C.text2, fontWeight:isToday?700:500 }}>{day}</div>
                              {d && <div style={{ fontSize:7, color:C.text3 }}>{d.txs.length}</div>}
                            </div>
                            {d && (
                              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                                {d.income>0  && <div style={{ fontSize:8, fontFamily:"'Azeret Mono',monospace", color:C.green, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>+{fmt(d.income)}</div>}
                                {d.expense>0 && <div style={{ fontSize:8, fontFamily:"'Azeret Mono',monospace", color:C.red,   overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>−{fmt(d.expense)}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Day detail */}
                <div className="v-panel" style={{ position:"sticky", top:0 }}>
                  {selDay && dayData ? (
                    <>
                      <div className="v-panel-header">
                        <div className="v-label" style={{ fontSize:7, marginBottom:2 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}, {period.y}</div>
                        <div style={{ fontSize:9, color:C.text3, marginBottom:14, letterSpacing:"0.12em" }}>{dayData.txs.length} TRANSACTION{dayData.txs.length!==1?"S":""}</div>
                        <div style={{ padding:"12px", background:"rgba(255,255,255,0.015)", border:`1px solid ${C.borderFaint}`, marginBottom:10 }}>
                          <div className="v-label" style={{ fontSize:7, marginBottom:5 }}>Day Net</div>
                          <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:22, fontWeight:500, color:dayData.income-dayData.expense>=0?C.green:C.red, letterSpacing:"-0.04em" }}>
                            {fSign(dayData.income-dayData.expense)}
                          </div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1, background:C.borderFaint }}>
                          {dayData.income>0 && (
                            <div style={{ padding:"10px 12px", background:C.greenDim }}>
                              <div className="v-label" style={{ fontSize:7, color:C.green, marginBottom:4 }}>IN</div>
                              <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:13, color:C.green, fontWeight:600 }}>{fmt(dayData.income)}</div>
                            </div>
                          )}
                          {dayData.expense>0 && (
                            <div style={{ padding:"10px 12px", background:C.redDim }}>
                              <div className="v-label" style={{ fontSize:7, color:C.red, marginBottom:4 }}>OUT</div>
                              <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:13, color:C.red, fontWeight:600 }}>{fmt(dayData.expense)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ padding:"12px 14px 16px", display:"flex", flexDirection:"column", gap:8, maxHeight:400, overflowY:"auto" }}>
                        {[...dayData.txs].sort((a,b)=>a.type.localeCompare(b.type)).map((tx,i) => {
                          const tags=tx.tags?tx.tags.split(",").map(t=>t.trim()).filter(Boolean):[];
                          const isInc=tx.type==="income";
                          return (
                            <div key={i} style={{ padding:"12px 13px", background:"rgba(255,255,255,0.015)", border:`1px solid ${C.borderFaint}` }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <span className="v-badge" style={{ background:isInc?C.greenDim:C.redDim, color:isInc?C.green:C.red }}>{tx.type}</span>
                                  <span style={{ fontSize:12, fontWeight:600, color:C.text1 }}>{tx.category}</span>
                                </div>
                                <span style={{ fontFamily:"'Azeret Mono',monospace", fontSize:13, fontWeight:700, color:isInc?C.green:C.red }}>
                                  {isInc?"+":"−"}{fmt(tx.amount)}
                                </span>
                              </div>
                              {tx.description && <div style={{ fontSize:11, color:C.text2, marginBottom:5 }}>{tx.description}</div>}
                              {tags.length>0 && (
                                <div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:6 }}>
                                  {tags.map((tag,j)=><span key={j} className="v-tag">{tag}</span>)}
                                </div>
                              )}
                              <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
                                {!tx.isRecurringInstance && <button className="v-btn-ghost" onClick={()=>openEdit(tx)}>EDIT</button>}
                                <button className="v-btn-ghost" onClick={()=>{handleDelete(tx);if(calMap[selDay]?.txs.length<=1)setSelDay(null);}}
                                  style={{ color:C.text3 }}
                                  onMouseEnter={e=>e.currentTarget.style.color=C.red}
                                  onMouseLeave={e=>e.currentTarget.style.color=C.text3}>
                                  DELETE
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : selDay ? (
                    <div style={{ padding:"32px 20px", textAlign:"center" }}>
                      <div className="v-label" style={{ fontSize:7, marginBottom:8 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}, {period.y}</div>
                      <div style={{ fontSize:12, color:C.text3, marginBottom:18 }}>No transactions recorded.</div>
                      <button onClick={()=>{setForm({...blankForm(cats),date:`${period.y}-${String(period.m+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`});setModal("tx");}}
                        className="v-btn-secondary" style={{ fontSize:9, letterSpacing:"0.15em" }}>
                        ADD RECORD
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding:"56px 20px", textAlign:"center" }}>
                      <div className="v-label" style={{ fontSize:7, marginBottom:8, color:C.text3 }}>Select a Date</div>
                      <div style={{ fontSize:11, color:C.text3, lineHeight:1.8 }}>Click any date to view transactions.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ──────────── LEDGER ────────────────────────────────────── */}
            {view === "ledger" && (
              <>
                {/* KPI strip */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", background:C.border, gap:1, marginBottom:14, border:`1px solid ${C.border}` }}>
                  <KpiCard label="Total Liquidity"    value={fmt(liquidity)}                 valueColor={C.text1}  sub="All-time net" />
                  <KpiCard label={isFiltered?"Period Income":"All-Time Income"}     value={fmt(isFiltered?ledgerStats.income:ledgerIncome)}   valueColor={C.green} sub={`${(isFiltered?ledgerTxs.filter(t=>t.type==="income"):txs.filter(t=>t.type==="income")).length} records`} />
                  <KpiCard label={isFiltered?"Period Expenses":"All-Time Expenses"} value={fmt(isFiltered?ledgerStats.expenses:ledgerExpenses)} valueColor={C.red}  sub={`${(isFiltered?ledgerTxs.filter(t=>t.type==="expense"):txs.filter(t=>t.type==="expense")).length} records`} />
                  <KpiCard label={isFiltered?"Period Net":"All-Time Net"}
                    value={fSign(isFiltered?ledgerStats.income-ledgerStats.expenses:ledgerIncome-ledgerExpenses)}
                    valueColor={(isFiltered?ledgerStats.income-ledgerStats.expenses:ledgerIncome-ledgerExpenses)>=0?C.green:C.red}
                    sub={`${isFiltered?ledgerTxs.length:txs.length} record${(isFiltered?ledgerTxs.length:txs.length)!==1?"s":""}${isFiltered?" (filtered)":""}`}
                    last />
                </div>

                {/* Filter bar */}
                <div className="v-filter-bar">
                  <div className="v-search-wrap">
                    <span className="v-search-icon">⌕</span>
                    <input type="text" className="v-search-input" placeholder="Search description, category, tags, amount…"
                      value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} />
                    {ledgerSearch && (
                      <button className="v-search-clear" onClick={()=>setLedgerSearch("")}>×</button>
                    )}
                  </div>
                  <DateRangeFilter from={ledgerFrom} to={ledgerTo} onFrom={setLedgerFrom} onTo={setLedgerTo} onClear={()=>{ setLedgerFrom(""); setLedgerTo(""); }} />
                </div>

                {/* Type chips + record count */}
                <div style={{ display:"flex", alignItems:"center", gap:0, padding:"8px 0 10px", borderBottom:`1px solid ${C.borderFaint}`, marginBottom:1 }}>
                  <div className="v-filter-chips">
                    {[["all","All"],["income","Income"],["expense","Expenses"]].map(([val,lbl])=>(
                      <button key={val} onClick={()=>setTxFilter(val)} className={`v-filter-chip${txFilter===val?" active":""}`}>{lbl.toUpperCase()}</button>
                    ))}
                  </div>
                  <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:16 }}>
                    <span style={{ fontSize:10, color:C.text2 }}>
                      {ledgerTxs.length} record{ledgerTxs.length!==1?"s":""}
                      {isFiltered && <span style={{ color:C.gold, marginLeft:6, fontWeight:600 }}>· filtered</span>}
                    </span>
                    <button className="v-btn-ghost" onClick={exportCSV}>CSV</button>
                    <button className="v-btn-ghost" onClick={exportJSON}>JSON</button>
                  </div>
                </div>

                <div className="v-panel">
                  <TxTable txs={ledgerTxs} onEdit={openEdit} onDelete={handleDelete} fmt={fmt} />
                </div>
              </>
            )}

            {/* ──────────── SETTINGS ──────────────────────────────────── */}
            {view === "settings" && (
              <>
                <div className="v-settings-tabs">
                  {[["data","Data"],["budgets","Budgets"],["categories","Categories"],["currency","Currency"],["danger","Danger"]].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setSettingsTab(id)} className={`v-settings-tab${settingsTab===id?" active":""}`}>{lbl}</button>
                  ))}
                </div>

                {settingsTab==="data" && (
                  <div className="v-settings-grid">
                    <SettingsCard title="Backup & Import" desc="Export a full JSON backup, or import a previous backup to restore all data including budgets, categories, and currency settings.">
                      <button onClick={exportJSON} className="v-btn-primary" style={{ width:"auto", padding:"9px 16px" }}>EXPORT JSON</button>
                      <label className="v-btn-secondary" style={{ cursor:"pointer" }}>
                        IMPORT JSON
                        <input type="file" accept="application/json,.json" style={{ display:"none" }}
                          onChange={async e => { const f=e.target.files?.[0]; e.target.value=""; if(!f)return; try{await importFile(f);}catch(err){addToast(err?.message||"Import failed","err");} }} />
                      </label>
                    </SettingsCard>
                    <SettingsCard title="CSV Export" desc="Export all transactions as a CSV file compatible with Excel, Google Sheets, and other spreadsheet software.">
                      <button onClick={exportCSV} className="v-btn-secondary">EXPORT CSV</button>
                    </SettingsCard>
                  </div>
                )}

                {settingsTab==="budgets" && (
                  <div className="v-settings-card">
                    <div className="v-label" style={{ fontSize:7, marginBottom:4 }}>Monthly Budget Limits</div>
                    <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:22 }}>Set monthly limits per expense category. Alerts trigger at 80% utilization.</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                      {cats.expense.map(cat => {
                        const current  = budgets[cat]||0;
                        const inputVal = budgetInput[cat]!==undefined?budgetInput[cat]:(current?String(current):"");
                        const spent    = catBreakdown.find(([c])=>c===cat)?.[1]||0;
                        return (
                          <div key={cat} style={{ display:"flex", flexDirection:"column", gap:5 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <label style={{ fontSize:11, color:C.textMid }}>{cat}</label>
                              {current>0 && <span style={{ fontSize:9, color:C.text2 }}>Spent: {fmt(spent)}</span>}
                            </div>
                            <input type="number" step="0.01" min="0" placeholder="No limit" value={inputVal}
                              onChange={e=>setBudgetInput(p=>({...p,[cat]:e.target.value}))}
                              style={{ ...inputSx, fontSize:12 }} />
                            {current>0 && (
                              <div style={{ height:1, background:"rgba(255,255,255,0.04)" }}>
                                <div style={{ height:"100%", width:`${Math.min((spent/current)*100,100)}%`, background:spent>current?C.red:spent/current>=0.8?C.gold:C.green, opacity:0.6 }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={commitBudgets} className="v-btn-primary" style={{ marginTop:22, width:"auto", padding:"9px 20px" }}>Save Limits</button>
                  </div>
                )}

                {settingsTab==="categories" && (
                  <div className="v-settings-grid">
                    {["income","expense"].map(type=>(
                      <div key={type} className="v-settings-card">
                        <div className="v-label" style={{ fontSize:7, marginBottom:4 }}>{type.toUpperCase()} Categories</div>
                        <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:14 }}>Default categories cannot be removed.</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:14, maxHeight:240, overflowY:"auto" }}>
                          {DEFAULT_CATS[type].map(cat=>(
                            <div key={cat} style={{ padding:"7px 10px", background:"rgba(255,255,255,0.012)", fontSize:11, color:C.text2, display:"flex", justifyContent:"space-between" }}>
                              <span>{cat}</span><span style={{ fontSize:8, color:C.text3 }}>default</span>
                            </div>
                          ))}
                          {(customCats[type]||[]).map(cat=>(
                            <div key={cat} style={{ padding:"7px 10px", background:"rgba(255,255,255,0.02)", border:`1px solid ${C.borderFaint}`, fontSize:11, color:C.textMid, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span>{cat}</span>
                              <button className="v-btn-ghost" onClick={()=>removeCustomCat(type,cat)}
                                style={{ color:C.text3 }}
                                onMouseEnter={e=>e.currentTarget.style.color=C.red}
                                onMouseLeave={e=>e.currentTarget.style.color=C.text3}>✕</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:6 }}>
                          <input type="text" placeholder="New category…" value={newCatInput[type]||""}
                            onChange={e=>setNewCatInput(p=>({...p,[type]:e.target.value}))}
                            onKeyDown={e=>e.key==="Enter"&&addCustomCat(type)}
                            style={{ ...inputSx, fontSize:12, flex:1 }} />
                          <button onClick={()=>addCustomCat(type)} className="v-btn-secondary" style={{ padding:"9px 14px", fontSize:11, whiteSpace:"nowrap" }}>+ Add</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {settingsTab==="currency" && (
                  <div className="v-settings-card">
                    <div className="v-label" style={{ fontSize:7, marginBottom:4 }}>Display Currency</div>
                    <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:22 }}>Affects display formatting only. Stored amounts are not converted.</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:1, background:C.borderFaint }}>
                      {CURRENCIES.map(c=>(
                        <button key={c.code} onClick={()=>saveCurrency(c.code)}
                          style={{ padding:"13px 15px", background: currency===c.code?"rgba(255,255,255,0.05)":C.surface, border:"none", color: currency===c.code?C.text1:C.text2, textAlign:"left", transition:"all 150ms", fontFamily:"inherit" }}>
                          <div style={{ fontFamily:"'Azeret Mono',monospace", fontSize:16, fontWeight:600, marginBottom:3, color: currency===c.code?C.text1:C.text2, letterSpacing:"-0.02em" }}>{c.symbol}</div>
                          <div style={{ fontSize:11, fontWeight:600, marginBottom:2 }}>{c.code}</div>
                          <div style={{ fontSize:10, color:C.text2 }}>{c.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {settingsTab==="danger" && (
                  <div className="v-settings-card" style={{ border:`1px solid rgba(248,113,113,0.1)` }}>
                    <div className="v-label" style={{ fontSize:7, color:C.red, marginBottom:4 }}>Danger Zone</div>
                    <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:18 }}>
                      Permanently deletes all transactions, budgets, and settings. Export a backup first.
                    </div>
                    <button onClick={resetAllData} className="v-danger-btn">RESET ALL DATA</button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ──────────────────────────────────────────── */}
      <div className="v-mobile-bottomnav">
        {[
          ["overview","Overview"],
          ["calendar","Calendar"],
          ["ledger","Ledger"],
          ["settings","Settings"],
        ].map(([id,lbl]) => (
          <button key={id} className={`v-mobile-nav-item${view===id?" active":""}`} onClick={() => setView(id)}>
            {NavIcons[id]}
            <span>{lbl}</span>
          </button>
        ))}
      </div>

      {/* ── MOBILE FAB ─────────────────────────────────────────────────── */}
      <button className="v-mobile-add-fab" onClick={openAdd}>+</button>

      {/* ── TRANSACTION MODAL ──────────────────────────────────────────── */}
      {modal === "tx" && (
        <Modal onClose={() => { setModal(null); setEditId(null); setForm(blankForm(cats)); }}>
          <div className="v-label" style={{ fontSize:7, marginBottom:3 }}>{editId ? "Edit Record" : "New Record"}</div>
          <div style={{ fontSize:17, fontWeight:600, marginBottom:20, letterSpacing:"-0.02em" }}>
            {editId ? "Edit Transaction" : "Add Transaction"}
          </div>

          <div className="v-type-toggle">
            {["expense","income"].map(t => (
              <button key={t} onClick={() => setForm(f => ({...f, type:t, category:t==="income"?cats.income[0]:cats.expense[0]}))}
                className={`v-type-btn${form.type===t?" active-"+t:""}`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="v-field">
            <label className="v-field-label">Amount</label>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount} autoFocus
              onChange={e => setForm(f => ({...f, amount:e.target.value}))}
              onKeyDown={e => e.key==="Enter" && commitTx()}
              style={{ ...inputSx, fontFamily:"'Azeret Mono',monospace", fontSize:28, fontWeight:500, letterSpacing:"-0.04em", padding:"12px" }} />
          </div>
          <div className="v-field">
            <label className="v-field-label">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({...f, category:e.target.value}))} style={inputSx}>
              {cats[form.type].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="v-field">
            <label className="v-field-label">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date:e.target.value}))}
              style={{ ...inputSx, fontFamily:"'Azeret Mono',monospace", colorScheme:"dark" }} />
          </div>
          <div className="v-field">
            <label className="v-field-label">Description</label>
            <input type="text" placeholder="Optional memo…" value={form.description}
              onChange={e => setForm(f => ({...f, description:e.target.value}))}
              onKeyDown={e => e.key==="Enter" && commitTx()}
              style={inputSx} />
          </div>
          <div className="v-field">
            <label className="v-field-label">Tags</label>
            <input type="text" placeholder="client-a, q3, travel (comma-separated)" value={form.tags}
              onChange={e => setForm(f => ({...f, tags:e.target.value}))}
              style={inputSx} />
          </div>

          {/* Recurring toggle */}
          <div className="v-toggle-wrapper">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: form.recurring ? 14 : 0 }}>
              <div>
                <div style={{ fontSize:12, color:C.textMid, fontWeight:500 }}>Recurring</div>
                <div style={{ fontSize:10, color:C.text3, marginTop:2 }}>Project forward automatically</div>
              </div>
              <button onClick={() => setForm(f => ({...f, recurring:!f.recurring}))}
                className="v-toggle"
                style={{ borderColor: form.recurring ? C.green : C.border }}>
                <div className="v-toggle-thumb" style={{ left: form.recurring ? 19 : 2, background: form.recurring ? C.green : C.text3 }} />
              </button>
            </div>
            {form.recurring && (
              <div>
                <label className="v-field-label" style={{ marginBottom:7 }}>Frequency</label>
                <select value={form.recurringFreq} onChange={e => setForm(f => ({...f, recurringFreq:e.target.value}))} style={{ ...inputSx, fontSize:12 }}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <div style={{ fontSize:10, color:C.text3, lineHeight:1.75, marginTop:8 }}>Recurring entries project into future months. They appear in views but don't affect all-time liquidity until individually recorded.</div>
              </div>
            )}
          </div>

          <div className="v-modal-actions">
            <button onClick={() => { setModal(null); setEditId(null); setForm(blankForm(cats)); }} className="v-btn-secondary">Cancel</button>
            <button onClick={commitTx} className="v-btn-primary">{editId ? "Save Changes" : "Record Transaction"}</button>
          </div>
        </Modal>
      )}

      {/* ── LIQUIDITY MODAL ────────────────────────────────────────────── */}
      {modal === "liq" && (
        <Modal onClose={() => setModal(null)}>
          <div className="v-label" style={{ fontSize:7, marginBottom:3 }}>Configuration</div>
          <div style={{ fontSize:17, fontWeight:600, marginBottom:7, letterSpacing:"-0.02em" }}>Starting Liquidity</div>
          <div style={{ fontSize:12, color:C.text2, lineHeight:1.75, marginBottom:20 }}>Your capital balance before any recorded transactions. Stored to the exact cent.</div>
          <div className="v-field">
            <label className="v-field-label">Balance ({currency})</label>
            <input type="number" step="0.01" value={liqInput} autoFocus
              onChange={e => setLiqInput(e.target.value)}
              onKeyDown={e => e.key==="Enter" && commitLiq()}
              placeholder="0.00"
              style={{ ...inputSx, fontFamily:"'Azeret Mono',monospace", fontSize:28, fontWeight:500, letterSpacing:"-0.04em", padding:"12px" }} />
          </div>
          {liqInput && !isNaN(parseFloat(liqInput)) && (
            <div style={{ fontSize:11, fontFamily:"'Azeret Mono',monospace", color:C.text2, marginBottom:4 }}>
              Stores as: <span style={{ color:C.textMid }}>{fmt(parseFloat(liqInput))}</span>
            </div>
          )}
          <div className="v-modal-actions">
            <button onClick={() => setModal(null)} className="v-btn-secondary">Cancel</button>
            <button onClick={commitLiq} className="v-btn-primary">Confirm</button>
          </div>
        </Modal>
      )}

      {/* ── SCOPE MODAL ────────────────────────────────────────────────── */}
      {scopeAction && (
        <RecurringScopeModal action={scopeAction.action} tx={scopeAction.tx} onThis={handleScopeThis} onAll={handleScopeAll} onClose={() => setScopeAction(null)} />
      )}

      <ToastStack toasts={toasts} remove={removeToast} />
    </>
  );
}