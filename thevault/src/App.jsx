import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Area, AreaChart, ReferenceDot,
} from "recharts";
import AuthView from "./components/AuthView.jsx";
import { supabase, hasSupabaseConfig } from "./lib/supabaseClient.js";
import VaultOnboarding from "./components/VaultOnboarding.jsx";
import { exportStatement } from "./components/VaultStatementExport";
import VaultExportButton from "./components/VaultStatementExport";
import { useTrialState, TrialExpiredWall, TrialBanner } from "./components/VaultTrial"
import VaultMission from "./components/VaultMission.jsx"

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS   = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const TODAY        = new Date();
const TODAY_STR    = TODAY.toISOString().split("T")[0];
const SEC_PER_MONTH = 30.4375 * 24 * 3600;

const DEFAULT_CATS = {
  income:  ["Salary","Business Revenue","Investment Returns","Dividends","Capital Gains","Partnership Distribution","Other Income"],
  expense: ["Operations","Payroll","Technology","Marketing","Travel","Utilities","Transportation","Insurance","Taxes","Tools","Other"],
};

const CURRENCIES = [
  { code:"USD", symbol:"$",   name:"US Dollar" },
];

// ─── Design System ─────────────────────────────────────────────────────────────
const T = {
  bg:         '#FFFFFF',
  bgSubtle:   '#F7F9FC',
  bgCard:     '#FFFFFF',
  sidebar:    '#FFFFFF',
  text1:      '#0A0C10',
  text2:      '#3D4452',
  text3:      '#6B7280',
  text4:      '#9CA3AF',
  blue:       '#1A6FD4',
  blueDark:   '#1254A8',
  blueLight:  '#EBF3FF',
  blueFaint:  '#F4F8FF',
  gold:       '#E8A020',
  goldLight:  '#FFF8E6',
  green:      '#00B876',
  greenLight: '#EDFBF4',
  red:        '#E53935',
  redLight:   '#FFF0F3',
  border:     'rgba(0,0,0,0.08)',
  borderMid:  'rgba(0,0,0,0.14)',
  shadow:     '0 2px 12px rgba(0,0,0,0.07)',
  shadowMd:   '0 4px 24px rgba(0,0,0,0.09)',
  shadowLg:   '0 8px 48px rgba(0,0,0,0.11)',
  radius:     '12px',
  radiusSm:   '8px',
  radiusLg:   '20px',
  font:       "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono:       "'JetBrains Mono', monospace",
};

// ─── Global CSS ────────────────────────────────────────────────────────────────
const VAULT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root {
  width: 100%; height: 100%;
  background: #FFFFFF;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #3D4452;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 2px; }

input, select, textarea { outline: none; font-family: inherit; background: none; }
input[type=date] { cursor: pointer; }
input[type=date]::-webkit-calendar-picker-indicator {
  filter: none;
  opacity: 0.5;
  cursor: pointer;
}
select option { background: #FFFFFF; color: #0A0C10; }
button { cursor: pointer; font-family: inherit; }
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { opacity: 0; }

.v-mono { font-family: 'JetBrains Mono', monospace; }
.v-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #9CA3AF;
  font-family: 'Inter', sans-serif;
}
.v-label-hi {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #6B7280;
  font-family: 'Inter', sans-serif;
}

/* ── App root ── */
.v-app {
  display: flex; height: 100vh; overflow: hidden;
  background: #F7F9FC;
}

/* ── Sidebar ── */
.v-sidebar {
  width: 210px; min-width: 210px;
  background: #FFFFFF;
  border-right: 1px solid rgba(0,0,0,0.08);
  display: flex; flex-direction: column;
  flex-shrink: 0; height: 100%; overflow-y: auto;
  position: relative;
}
.v-sidebar::after { display: none; }

/* Logo block */
.v-sidebar-logo {
  padding: 18px 18px 16px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.v-sidebar-logo::after { display: none; }
.v-sidebar-logo-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.v-mobile-logo-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

/* Liquidity widget */
.v-liq {
  margin: 14px 12px 0;
  padding: 16px 14px;
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 10px;
  position: relative; overflow: hidden;
}
.v-liq::before { display: none; }
.v-liq-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #9CA3AF; margin-bottom: 10px;
}
.v-liq-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px; font-weight: 500;
  letter-spacing: -0.03em; line-height: 1;
  transition: color 0.4s;
}
.v-liq-sub {
  font-family: 'Inter', sans-serif;
  font-size: 11px; color: #9CA3AF; margin-top: 5px;
}

/* Budget alerts */
.v-budget-alert {
  margin: 8px 12px 0;
  padding: 10px 12px;
  background: #FFF0F3;
  border: 1px solid rgba(229,57,53,0.15);
  border-left: 3px solid #E53935;
  border-radius: 8px;
}

/* Nav */
.v-nav { padding: 14px 8px; flex: 1; }
.v-nav-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; text-align: left;
  padding: 9px 10px 9px 14px;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 500;
  letter-spacing: 0;
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
  margin-bottom: 1px; position: relative;
  border-radius: 6px;
}
.v-nav-item:hover { background: #F7F9FC; color: #3D4452; }
.v-nav-item.active {
  color: #1A6FD4;
  border-left-color: #1A6FD4;
  background: #F4F8FF;
}
.v-nav-item.active::after { display: none; }
.v-nav-key {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; letter-spacing: 0.05em;
  color: #9CA3AF;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  padding: 2px 5px;
  border-radius: 4px;
}
.v-nav-item.active .v-nav-key { color: #1A6FD4; background: #EBF3FF; }

/* Sidebar actions */
.v-sidebar-actions {
  padding: 14px;
  position: relative;
}
.v-sidebar-actions::before { display: none; }

.v-sidebar-bottom {
  margin-top: auto;
  padding-bottom: 14px;
}
.v-btn-primary {
  width: 100%; padding: 10px 0;
  background: #1A6FD4;
  border: none;
  color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 600;
  letter-spacing: 0; text-transform: none;
  transition: all 200ms;
  position: relative; overflow: hidden;
  border-radius: 8px;
}
.v-btn-primary::after { display: none; }
.v-btn-primary:hover {
  background: #1254A8;
  color: #FFFFFF;
}
.v-btn-secondary {
  padding: 9px 14px;
  background: #FFFFFF;
  border: 1.5px solid rgba(0,0,0,0.14);
  color: #3D4452; font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 500; letter-spacing: 0;
  transition: all 150ms;
  border-radius: 8px;
}
.v-btn-secondary:hover { border-color: rgba(0,0,0,0.22); color: #0A0C10; }
.v-btn-ghost {
  background: transparent; border: none;
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 500; letter-spacing: 0;
  color: #6B7280; transition: color 150ms; padding: 2px 0;
}
.v-btn-ghost:hover { color: #0A0C10; }

/* Account */
.v-account {
  margin: 8px 12px 16px;
  padding: 11px 12px;
  border: 1px solid rgba(0,0,0,0.06);
  background: #F7F9FC;
  display: flex; align-items: center; gap: 9px;
  border-radius: 8px;
}
.v-account-avatar {
  width: 26px; height: 26px; flex-shrink: 0;
  background: #EBF3FF;
  border: 1px solid rgba(26,111,212,0.2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600; color: #1A6FD4;
  font-family: 'Inter', sans-serif;
}
.v-account-email {
  font-family: 'Inter', sans-serif;
  font-size: 11px; color: #6B7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.v-account-signout {
  background: none; border: none;
  font-family: 'Inter', sans-serif;
  font-size: 11px; font-weight: 500;
  color: #9CA3AF; padding: 0;
  transition: color 150ms;
}
.v-account-signout:hover { color: #E53935; }

/* ── Main ── */
.v-main { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; background: #F7F9FC; }

/* Header */
.v-header {
  padding: 16px 32px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  background: #FFFFFF;
  display: flex; align-items: center;
  justify-content: space-between;
  flex-shrink: 0; gap: 12px; flex-wrap: wrap;
  position: relative;
}
.v-header::after { display: none; }
.v-header-breadcrumb {
  font-family: 'Inter', sans-serif;
  font-size: 11px; font-weight: 500; letter-spacing: 0;
  text-transform: none; color: #9CA3AF; margin-bottom: 4px;
}
.v-header-title {
  font-family: 'Inter', sans-serif;
  font-size: 16px; font-weight: 700;
  letter-spacing: -0.01em; color: #0A0C10;
}
.v-period-nav { display: flex; align-items: center; gap: 8px; }
.v-period-btn {
  width: 28px; height: 28px;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  color: #6B7280; display: flex;
  align-items: center; justify-content: center;
  font-size: 14px; transition: all 150ms;
  border-radius: 6px;
}
.v-period-btn:hover { color: #1A6FD4; border-color: rgba(26,111,212,0.25); background: #EBF3FF; }
.v-period-label {
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 600; color: #0A0C10;
  min-width: 154px; text-align: center;
}

/* Content */
.v-content {
  flex: 1; overflow-y: auto;
  padding: 0;
  min-height: 0;
  background: #F7F9FC;
}

/* Inner content wrapper with padding */
.v-content-inner {
  padding: 20px 24px 60px;
  width: 100%;
  min-width: 0;
  min-height: 100%;
}

.v-content-inner--wide {
  padding: 0;
  min-height: 100%;
}

/* ── Intelligence strip ── */
.v-intel-strip {
  border: 1px solid rgba(0,0,0,0.08);
  background: #FFFFFF;
  border-radius: 12px;
  padding: 10px 18px;
  display: flex; align-items: center; gap: 18px;
  margin-bottom: 12px; overflow: hidden; flex-wrap: wrap;
}
.v-intel-msg {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; letter-spacing: 0;
  font-family: 'Inter', sans-serif;
}
.v-intel-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}

/* ── Net Position hero ── */
.v-net-hero {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 28px 32px;
  margin-bottom: 12px; position: relative; overflow: hidden;
}
.v-net-hero::before { display: none; }
.v-net-value {
  font-family: 'Inter', sans-serif;
  font-size: 52px; font-weight: 800;
  letter-spacing: -0.04em; line-height: 1;
  transition: color 0.5s;
}
.v-net-grid {
  display: grid;
  grid-template-columns: 340px 1px 1fr 1fr 1fr;
  gap: 0; align-items: stretch;
}
.v-net-divider {
  width: 1px;
  background: rgba(0,0,0,0.08);
  margin: 0 12px;
}

/* ── Secondary KPIs ── */
.v-kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}
.v-kpi-card {
  padding: 20px 22px;
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  transition: box-shadow 150ms, transform 150ms;
}
.v-kpi-card:hover {
  box-shadow: 0 4px 24px rgba(0,0,0,0.09);
  transform: translateY(-1px);
}
.v-kpi-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #9CA3AF; margin-bottom: 10px;
}
.v-kpi-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px; font-weight: 500;
  letter-spacing: -0.04em; line-height: 1;
  margin-bottom: 6px; word-break: break-all;
}
.v-kpi-sub {
  font-family: 'Inter', sans-serif;
  font-size: 11px; color: #9CA3AF;
}

/* ── Chart panel ── */
.v-chart-panel {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  margin-bottom: 12px;
  width: 100%;
}
.v-chart-header {
  padding: 20px 24px 0;
  display: flex; align-items: flex-start;
  justify-content: space-between; flex-wrap: wrap; gap: 10px;
}
.v-anomaly-badge {
  font-family: 'Inter', sans-serif;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  padding: 3px 8px; text-transform: uppercase;
  background: #FFF0F3;
  border: 1px solid rgba(229,57,53,0.2);
  color: #E53935;
  border-radius: 4px;
}

/* ── Projection tile ── */
.v-proj-grid {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 12px; margin-bottom: 12px;
}
.v-proj-tile {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 18px 20px;
}

/* ── Split ── */
.v-split {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1.65fr);
  gap: 12px;
}

/* ── Panel ── */
.v-panel {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  overflow: hidden;
}
.v-panel-header {
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

/* ── Calendar ── */
.v-cal-wrapper {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 130px);
  background: transparent;
}

.v-cal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 12px;
  align-items: stretch;
  flex: 1;
  min-height: 640px;
}

.v-cal-main {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.v-cal-month-header {
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.v-cal-day-labels {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: #F7F9FC;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}

.v-cal-day-label {
  padding: 8px 0;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #9CA3AF;
  text-transform: uppercase;
}

.v-cal-day-label.weekend {
  color: #9CA3AF;
  opacity: 0.6;
}

.v-cal-cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: 1;
}

.v-cal-day {
  min-height: 110px;
  padding: 10px 9px;
  background: transparent;
  border-right: 1px solid rgba(0,0,0,0.05);
  border-bottom: 1px solid rgba(0,0,0,0.05);
  cursor: pointer;
  transition: all 180ms cubic-bezier(0.16,1,0.3,1);
  position: relative; overflow: hidden;
  display: flex;
  flex-direction: column;
}
.v-cal-day:hover { background: #F7F9FC; }
.v-cal-day.selected {
  background: #EBF3FF;
  border-color: rgba(26,111,212,0.2);
}

.v-cal-day.today {
  border: 2px solid #1A6FD4;
  background: #F4F8FF;
}

.v-cal-today-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  background: #1A6FD4;
  border-radius: 50%;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #FFFFFF;
  font-weight: 700;
}

.v-cal-empty {
  background: #F7F9FC;
  border-right: 1px solid rgba(0,0,0,0.04);
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

/* Day subtle tint effects */
.v-cal-day.has-gain::after {
  content: '';
  position: absolute; inset: 0;
  background: rgba(0,184,118,0.02);
  pointer-events: none;
}
.v-cal-day.has-loss::after {
  content: '';
  position: absolute; inset: 0;
  background: rgba(229,57,53,0.02);
  pointer-events: none;
  animation: loss-pulse 3s ease-in-out infinite;
}
@keyframes loss-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.3); }
}

/* ── Transaction Feed ── */
.v-feed-group { margin-bottom: 8px; }
.v-feed-date-row {
  padding: 7px 20px;
  background: #F7F9FC;
  border-radius: 6px;
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 4px;
}
.v-feed-entry {
  display: flex; align-items: center; gap: 0;
  padding: 0;
  background: #FFFFFF;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  transition: all 180ms cubic-bezier(0.16,1,0.3,1);
  cursor: pointer; position: relative; overflow: hidden;
}
.v-feed-entry:hover { background: #F7F9FC; }
.v-feed-entry:hover .v-feed-actions { opacity: 1; }
.v-feed-indicator {
  width: 3px; align-self: stretch; flex-shrink: 0;
}
.v-feed-body {
  flex: 1; min-width: 0;
  display: flex; align-items: center;
  padding: 12px 16px; gap: 14px;
}
.v-feed-amount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; font-weight: 500;
  letter-spacing: -0.03em; flex-shrink: 0;
  padding-right: 18px;
}
.v-feed-actions {
  position: absolute; right: 16px; top: 50%;
  transform: translateY(-50%);
  opacity: 0; transition: opacity 150ms;
  display: flex; gap: 10px;
}

/* ── Recent Activity scroll ── */
.v-recent-activity-scroll {
  max-height: 260px;
  overflow-y: auto; overflow-x: hidden;
  scrollbar-width: none; -ms-overflow-style: none;
  touch-action: pan-y;
}
.v-recent-activity-scroll::-webkit-scrollbar { width: 0; height: 0; }

/* ── Badge ── */
.v-badge {
  display: inline-flex; align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  padding: 2px 7px; text-transform: uppercase; flex-shrink: 0;
  border-radius: 4px;
}

/* ── Budget bar ── */
.v-budget-bar { margin-bottom: 16px; }
.v-budget-bar-track {
  height: 4px; background: rgba(0,0,0,0.06); margin-top: 7px; border-radius: 2px;
}
.v-budget-bar-fill { height: 100%; transition: width 400ms cubic-bezier(0.16,1,0.3,1); border-radius: 2px; }

/* ── Tag ── */
.v-tag {
  font-family: 'Inter', sans-serif;
  font-size: 10px; font-weight: 500; padding: 2px 8px;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  color: #6B7280;
  white-space: nowrap;
  border-radius: 4px;
}

/* ── Modal ── */
.v-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 300;
}
.v-modal {
  width: 420px; max-width: calc(100vw - 24px);
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 20px;
  padding: 30px;
  max-height: 90vh; overflow-y: auto;
  box-shadow: 0 16px 64px rgba(0,0,0,0.13);
  position: relative;
}
.v-modal::before { display: none; }

/* ── Input ── */
.v-input {
  width: 100%;
  background: #FFFFFF;
  border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 8px;
  padding: 10px 13px;
  color: #0A0C10; font-size: 13px;
  font-family: inherit;
  transition: border-color 150ms, box-shadow 150ms;
}
.v-input:focus { border-color: #1A6FD4; box-shadow: 0 0 0 3px rgba(26,111,212,0.12); }

/* ── Field ── */
.v-field { margin-bottom: 15px; }
.v-field-label {
  font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 600; letter-spacing: 0;
  text-transform: none; color: #3D4452; margin-bottom: 6px;
  display: block;
}

/* ── Toast ── */
.v-toast-stack {
  position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%);
  display: flex; flex-direction: column;
  gap: 5px; z-index: 999; align-items: center;
}
.v-toast {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 16px;
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 10px;
  min-width: 260px; max-width: 400px;
  font-family: 'Inter', sans-serif;
  font-size: 13px; color: #0A0C10;
  box-shadow: 0 4px 24px rgba(0,0,0,0.09);
}

/* ── Settings ── */
.v-settings-tabs {
  display: flex;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  margin-bottom: 22px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  gap: 4px;
}
.v-settings-tab {
  padding: 9px 16px;
  background: transparent; border: none;
  border-bottom: 2px solid transparent;
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 500;
  letter-spacing: 0; text-transform: none;
  color: #6B7280; margin-bottom: -1px;
  transition: all 150ms;
  white-space: nowrap;
  border-radius: 6px 6px 0 0;
}
.v-settings-tab:hover { color: #3D4452; background: #F7F9FC; }
.v-settings-tab.active { color: #1A6FD4; border-bottom-color: #1A6FD4; background: #EBF3FF; }
.v-settings-card {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 24px;
}
.v-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* ── Chip filter ── */
.v-filter-chips { display: flex; gap: 4px; }
.v-filter-chip {
  padding: 6px 14px;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  color: #6B7280; font-family: 'Inter', sans-serif;
  font-size: 12px; font-weight: 500; letter-spacing: 0;
  text-transform: none;
  border-radius: 6px;
  transition: all 150ms;
}
.v-filter-chip:hover { color: #3D4452; border-color: rgba(0,0,0,0.14); }
.v-filter-chip.active {
  background: #EBF3FF;
  color: #1A6FD4;
  border-color: rgba(26,111,212,0.25);
}

/* ── Type toggle ── */
.v-type-toggle {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px; margin-bottom: 22px;
}
.v-type-btn {
  padding: 11px; background: #F7F9FC;
  border: 1.5px solid rgba(0,0,0,0.08); border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 600;
  letter-spacing: 0; text-transform: none;
  color: #6B7280; transition: all 150ms;
}
.v-type-btn.active-income  { color: #00B876; background: #EDFBF4; border-color: rgba(0,184,118,0.3); }
.v-type-btn.active-expense { color: #E53935; background: #FFF0F3; border-color: rgba(229,57,53,0.3); }

/* ── Modal actions ── */
.v-modal-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; margin-top: 22px; }

/* ── Toggle ── */
.v-toggle-wrapper {
  padding: 13px 15px;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 10px;
  margin-bottom: 15px;
}
.v-toggle {
  width: 38px; height: 21px;
  border: 1.5px solid;
  position: relative; cursor: pointer; flex-shrink: 0;
  background: none; transition: border-color 150ms;
  border-radius: 12px;
}
.v-toggle-thumb {
  position: absolute; top: 2px;
  width: 15px; height: 15px;
  transition: left 150ms;
  border-radius: 50%;
}

/* ── Danger ── */
.v-danger-btn {
  padding: 9px 18px;
  background: #FFF0F3;
  border: 1px solid rgba(229,57,53,0.2);
  color: #E53935; font-family: 'Inter', sans-serif;
  font-size: 13px; font-weight: 600; letter-spacing: 0;
  border-radius: 8px; transition: all 150ms;
}
.v-danger-btn:hover { background: rgba(229,57,53,0.12); }

/* ── Scope modal ── */
.v-scope-btn {
  width: 100%; padding: 13px 16px;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 8px;
  color: #0A0C10; font-family: inherit;
  font-size: 13px; text-align: left;
  transition: background 150ms;
}
.v-scope-btn:hover { background: #EBF3FF; }

/* ── Date range ── */
.v-date-range { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Native date input */
.v-date-input {
  background: #FFFFFF;
  border: 1.5px solid rgba(0,0,0,0.12);
  border-radius: 8px;
  padding: 8px 10px;
  color: #0A0C10;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  transition: border-color 150ms;
}
.v-date-input:focus { border-color: #1A6FD4; box-shadow: 0 0 0 3px rgba(26,111,212,0.12); }

/* ── Filter bar ── */
.v-filter-bar {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex; align-items: center;
  gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
}
.v-search-wrap { position: relative; flex: 1; min-width: 160px; }
.v-search-icon {
  position: absolute; left: 12px; top: 50%;
  transform: translateY(-50%); color: #9CA3AF;
  font-size: 14px; pointer-events: none; line-height: 1;
}
.v-search-input {
  width: 100%;
  background: #F7F9FC;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 8px;
  padding: 9px 32px;
  color: #0A0C10; font-size: 13px;
  font-family: inherit; transition: border-color 150ms;
}
.v-search-input:focus { border-color: #1A6FD4; box-shadow: 0 0 0 3px rgba(26,111,212,0.12); }
.v-search-clear {
  position: absolute; right: 9px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none;
  color: #9CA3AF; font-size: 14px; line-height: 1;
  transition: color 150ms;
}
.v-search-clear:hover { color: #0A0C10; }

/* ── Ledger search summary ── */
.v-search-summary {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.08);
  border-top: none;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.v-search-summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.v-search-summary-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9CA3AF;
}
.v-search-summary-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.03em;
  color: #0A0C10;
}

/* ── Empty ── */
.v-empty {
  padding: 48px 20px; text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #9CA3AF;
}

/* ── Mobile top ── */
.v-mobile-topbar {
  display: none; padding: 14px 16px;
  background: #FFFFFF;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 50; flex-shrink: 0;
}
.v-mobile-bottomnav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #FFFFFF;
  border-top: 1px solid rgba(0,0,0,0.08);
  padding: 8px 0 env(safe-area-inset-bottom, 12px); z-index: 50;
  grid-template-columns: repeat(4, 1fr);
}
.v-mobile-nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  background: none; border: none; color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: 10px; font-weight: 500;
  letter-spacing: 0; text-transform: none;
  transition: color 150ms; padding: 6px 0;
  -webkit-tap-highlight-color: transparent;
  min-height: 44px; justify-content: center;
}
.v-mobile-nav-item.active { color: #1A6FD4; }
.v-mobile-nav-item svg { width: 20px; height: 20px; }
.v-mobile-add-fab {
  position: fixed; bottom: calc(72px + env(safe-area-inset-bottom, 0px)); right: 20px;
  width: 52px; height: 52px;
  background: #1A6FD4;
  border: none;
  color: #FFFFFF;
  font-size: 26px; font-weight: 300;
  display: none; align-items: center; justify-content: center;
  box-shadow: 0 8px 32px rgba(26,111,212,0.35);
  z-index: 60; transition: all 150ms;
  border-radius: 50%;
  -webkit-tap-highlight-color: transparent;
}
.v-mobile-add-fab:hover { background: #1254A8; }
.v-mobile-add-fab:active { transform: scale(0.94); }

/* ── Custom tooltip ── */
.v-tip {
  background: #FFFFFF; border: 1px solid rgba(0,0,0,0.08);
  border-radius: 10px;
  padding: 12px 16px; font-family: 'Inter', sans-serif;
  font-size: 12px; min-width: 160px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.09);
}

/* ── Amount display ── */
.v-amount-display {
  font-family: 'JetBrains Mono', monospace;
  font-size: 38px; font-weight: 400;
  letter-spacing: -0.05em;
  text-align: center;
  color: #0A0C10;
  caret-color: transparent;
  user-select: none;
}
.v-amount-hint {
  font-family: 'Inter', sans-serif;
  font-size: 11px; color: #9CA3AF; text-align: center; margin-top: 6px;
}

/* ─────────────────────────────────────────────
   MOBILE RESPONSIVE  (≤ 860 px)
───────────────────────────────────────────── */
@media (max-width: 860px) {
  .v-sidebar { display: none !important; }
  .v-mobile-topbar { display: flex !important; }
  .v-mobile-bottomnav { display: grid !important; }
  .v-mobile-add-fab { display: flex !important; }
  .v-app { flex-direction: column; height: 100svh; overflow: hidden; }
  .v-main { height: 100%; overflow: hidden; }

  /* Comfortable content padding that clears the FAB + bottom nav */
  .v-content-inner { padding: 12px 12px 140px; }
  .v-content-inner--wide { padding: 0 0 140px; }

  .v-header { display: none !important; }

  /* ── Mobile KPI strip: 2×2 grid ── */
  .v-kpi-strip { grid-template-columns: repeat(2, 1fr); }

  /* ── Ledger KPI bar: 2×2 with compact style ── */
  .v-ledger-kpi-bar {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  .v-ledger-kpi-bar .v-kpi-card {
    padding: 14px 14px !important;
    border-right: none !important;
  }
  .v-ledger-kpi-bar .v-kpi-value {
    font-size: 15px !important;
    word-break: break-all;
  }
  .v-ledger-kpi-bar .v-kpi-label {
    font-size: 9px !important;
    margin-bottom: 6px !important;
  }
  .v-ledger-kpi-bar .v-kpi-sub {
    font-size: 10px !important;
  }

  .v-split { grid-template-columns: 1fr; }
  .v-cal-grid { grid-template-columns: 1fr; }
  .v-proj-grid { grid-template-columns: 1fr; }
  .v-settings-grid { grid-template-columns: 1fr; }
  .v-net-grid { grid-template-columns: 1fr; }
  .v-net-divider { display: none; }
  .v-modal { padding: 20px 16px; }
  .v-filter-bar { flex-direction: column; align-items: stretch; }

  /* Mobile feed: show actions always (no hover) */
  .v-feed-actions { opacity: 1 !important; position: static; transform: none; }
  .v-feed-body { flex-wrap: wrap; gap: 8px; }
  .v-feed-amount { padding-right: 0 !important; }

  /* Net hero mobile */
  .v-net-hero { padding: 20px 16px; }
  .v-net-value { font-size: 36px !important; }

  /* Calendar mobile: smaller day cells */
  .v-cal-day { min-height: 70px; padding: 6px 5px; }
  .v-cal-day-label { font-size: 9px; padding: 6px 0; }

  /* Mobile calendar — hide detail panel on mobile (it overlays) */
  .v-cal-grid { grid-template-columns: 1fr !important; }

  /* Touch feedback */
  .v-feed-entry:active { background: #F7F9FC; }
  .v-cal-day:active { background: #EBF3FF; }
  .v-btn-primary:active { opacity: 0.8; }
  .v-btn-secondary:active { opacity: 0.7; }

  /* Mobile toast - higher above nav */
  .v-toast-stack { bottom: 90px; }
}
`;

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
  try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
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
  date:TODAY_STR, description:"", tags:"", recurring:false, recurringFreq:"monthly",
});
const formFromTx = tx => ({
  type:tx.type, amount:amountToCentDigits(tx.amount), category:tx.category,
  date:tx.date, description:tx.description||"", tags:tx.tags||"",
  recurring:tx.recurring||false, recurringFreq:tx.recurringFreq||"monthly",
});

// ─── Toast hook ────────────────────────────────────────────────────────────────
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
  if (chartData.length < 3) return [];
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
  const dateStyle = {
    background: "#FFFFFF",
    border: "1.5px solid rgba(0,0,0,0.12)",
    padding: "8px 10px",
    color: "#0A0C10",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10.5,
    letterSpacing: "0.04em",
    colorScheme: "light",
    transition: "border-color 150ms",
    cursor: "pointer",
  };

  return (
    <div className="v-date-range">
      <input
        type="date"
        value={from || ""}
        onChange={e => onFrom(e.target.value)}
        style={dateStyle}
        onFocus={e => e.target.style.borderColor = "#1A6FD4"}
        onBlur={e => e.target.style.borderColor = "rgba(0,0,0,0.12)"}
      />
      <span style={{ color: T.text3, fontSize: 11, fontFamily:"'JetBrains Mono',monospace" }}>—</span>
      <input
        type="date"
        value={to || ""}
        onChange={e => onTo(e.target.value)}
        style={dateStyle}
        onFocus={e => e.target.style.borderColor = "#1A6FD4"}
        onBlur={e => e.target.style.borderColor = "rgba(0,0,0,0.12)"}
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
function TxFeed({ txs, onEdit, onDelete, fmt }) {
  if (!txs.length) return <div className="v-empty">No records found</div>;
  const grouped = {};
  txs.forEach(tx => {
    if (!grouped[tx.date]) grouped[tx.date] = [];
    grouped[tx.date].push(tx);
  });
  const dates = Object.keys(grouped).sort((a,b) => b.localeCompare(a));
  return (
    <div>
      {dates.map(date => {
        const dayTxs = grouped[date];
        const dateObj = parseDate(date);
        const dayInc = dayTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
        const dayExp = dayTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
        const dayNet = dayInc - dayExp;
        return (
          <div key={date} className="v-feed-group">
            <div className="v-feed-date-row">
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text2, letterSpacing:"0.1em" }}>
                {dateObj.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" }).toUpperCase()}
              </span>
              <div style={{ flex:1 }} />
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color: dayNet >= 0 ? T.green : T.red, letterSpacing:"-0.02em" }}>
                {dayNet >= 0 ? "+" : "−"}{fmt(Math.abs(dayNet))}
              </span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:T.text3 }}>{dayTxs.length}TX</span>
            </div>
            {dayTxs.map(tx => {
              const isInc = tx.type === "income";
              const tags = tx.tags ? tx.tags.split(",").map(t=>t.trim()).filter(Boolean) : [];
              return (
                <div key={tx.id} className="v-feed-entry">
                  <div className="v-feed-indicator" style={{ background: isInc ? `rgba(0,232,122,0.7)` : `rgba(255,127,159,0.5)` }} />
                  <div className="v-feed-body">
                    <span className="v-badge" style={{ background:isInc?T.greenLight:T.redLight, color:isInc?T.green:T.red }}>{tx.type}</span>
                    <span style={{ fontSize:12, color:T.text2, minWidth:100 }}>{tx.category}</span>
                    <span style={{ fontSize:11, color:T.text2, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {tx.description || <span style={{ color:T.text3 }}>—</span>}
                    </span>
                    <div style={{ display:"flex", gap:3 }}>
                      {tags.slice(0,2).map((t,i) => <span key={i} className="v-tag">{t}</span>)}
                    </div>
                    {tx.recurring && !tx.isRecurringInstance && (
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, color:T.gold, letterSpacing:"0.14em", border:`1px solid rgba(226,201,131,0.2)`, padding:"2px 5px" }}>REC</span>
                    )}
                  </div>
                  <div className="v-feed-amount" style={{ color: isInc ? T.green : T.red, paddingRight:80 }}>
                    {isInc ? "+" : "−"}{fmt(tx.amount)}
                  </div>
                  <div className="v-feed-actions">
                    {!tx.isRecurringInstance && (
                      <button className="v-btn-ghost" onClick={e => { e.stopPropagation(); onEdit(tx); }}>EDIT</button>
                    )}
                    <button className="v-btn-ghost" onClick={e => { e.stopPropagation(); onDelete(tx); }}
                      style={{ color:T.text3 }}
                      onMouseEnter={e => e.currentTarget.style.color = T.red}
                      onMouseLeave={e => e.currentTarget.style.color = T.text3}>DEL</button>
                  </div>
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
function HealthRing({ score }) {
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
      </div>
    </div>
  );
}

// ─── Toast Stack ───────────────────────────────────────────────────────────────
function ToastStack({ toasts, remove }) {
  if (!toasts.length) return null;
  return (
    <div className="v-toast-stack">
      {toasts.map(t => (
        <div key={t.id} className="v-toast">
          <div style={{ width:2, height:28, background: t.type==="ok"?T.green:t.type==="err"?T.red:T.blue, flexShrink:0 }} />
          <span style={{ flex:1, color:T.text1, fontSize:11 }}>{t.msg}</span>
          {t.onUndo && (
            <button onClick={() => { t.onUndo(); remove(t.id); }}
              style={{ background:"rgba(0,0,0,0.04)", border:`1px solid rgba(0,0,0,0.10)`, color:T.text2, fontSize:7.5, fontWeight:400, letterSpacing:"0.18em", padding:"3px 8px", fontFamily:"'JetBrains Mono',monospace" }}>
              UNDO
            </button>
          )}
          <button onClick={() => remove(t.id)}
            style={{ background:"none", border:"none", color:T.text2, fontSize:16, lineHeight:1, padding:"0 0 0 4px" }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── Nav Icons ─────────────────────────────────────────────────────────────────
const NavIcons = {
  overview: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="8" height="9"/><rect x="13" y="3" width="8" height="5"/><rect x="13" y="11" width="8" height="10"/><rect x="3" y="15" width="8" height="6"/></svg>),
  calendar: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="4" width="18" height="18"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>),
  ledger:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>),
  settings: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>),
  mission:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/></svg>),
};

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function Vault() {
  const [session,      setSession]      = useState(null);
  const [user,         setUser]         = useState(null);
  const [authReady,    setAuthReady]    = useState(false);

  const [txs,        setTxs]        = useState([]);
  const [baseLiq,    setBaseLiq]    = useState(0);
  const [budgets,    setBudgets]    = useState({});
  const [customCats, setCustomCats] = useState({ income:[], expense:[] });
  const currency = "USD";
  const [loaded,     setLoaded]     = useState(false);

  const [view,          setView]          = useState("overview");
  const [modal,         setModal]         = useState(null);
  const [editId,        setEditId]        = useState(null);
  const [form,          setForm]          = useState(null);
  const [period,        setPeriod]        = useState({ m:TODAY.getMonth(), y:TODAY.getFullYear() });
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

  const { toasts, add:addToast, remove:removeToast } = useToast();
  const { fmt, fSign } = useMemo(() => makeFmt("USD"), []);
  const { tier, daysRemaining, trialExpired, isPaid, trialReady } = useTrialState(accountEmail, session);

  useEffect(() => {
    let mounted = true;
    if (!hasSupabaseConfig || !supabase) { setAuthReady(true); return () => { mounted = false; }; }
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
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
        console.error("[Vault]", e);
        if (!disposed) addToast("Sync failed. Using local data.", "err");
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

  useEffect(() => {
    const h = e => {
      if (modal || scopeAction) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (["input","textarea","select"].includes(tag)) return;
      const quickAdd = () => { setEditId(null); setForm(blankForm(cats)); setModal("tx"); };
      const map = {
        n:quickAdd, N:quickAdd,
        l:()=>setView("ledger"),   L:()=>setView("ledger"),
        o:()=>setView("overview"), O:()=>setView("overview"),
        c:()=>setView("calendar"), C:()=>setView("calendar"),
        m:()=>setView("mission"),  M:()=>setView("mission"),
      };
      if (map[e.key]) { map[e.key](); return; }
      if (e.key === "ArrowLeft")  goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modal, scopeAction, cats]);

  const goPrev = () => setPeriod(p => { const d=new Date(p.y,p.m-1,1); return {m:d.getMonth(),y:d.getFullYear()}; });
  const goNext = () => setPeriod(p => { const d=new Date(p.y,p.m+1,1); return {m:d.getMonth(),y:d.getFullYear()}; });

  // Derived
  const monthTxs      = useMemo(() => txsForMonth(txs, period.y, period.m), [txs, period]);
  const monthIncome   = useMemo(() => monthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [monthTxs]);
  const monthExpenses = useMemo(() => monthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [monthTxs]);
  const monthNet      = monthIncome - monthExpenses;
  const allTimeNet    = useMemo(() => txs.reduce((s,t)=>t.type==="income"?s+t.amount:s-t.amount,0), [txs]);
  const liquidity     = baseLiq + allTimeNet;

  const recentActivityTxs = useMemo(() => {
    if (!monthTxs.length) return [];
    const uniqueDates = [...new Set(monthTxs.map(t => t.date))].sort((a, b) => b.localeCompare(a));
    const recentDates = new Set(uniqueDates.slice(0, 2));
    return monthTxs
      .filter(t => recentDates.has(t.date))
      .sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [monthTxs]);

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
    const years = new Set([...txs.map(txYear), TODAY.getFullYear()]);
    return [...years].sort().map(y => {
      const flat = MONTHS_SHORT.flatMap((_,i) => txsForMonth(txs,y,i));
      return { name:String(y), Income:precise(flat.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)), Expenses:precise(flat.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)) };
    });
  }, [txs]);

  const chartData = chartMode === "monthly" ? monthlyChartData : yearlyChartData;
  const anomalies = useMemo(() => detectAnomalies(chartData), [chartData]);

  const intelMsgs = useMemo(() =>
    buildIntelligenceMessages(monthIncome, monthExpenses, liquidity, runwayDisplay, monthTxs, budgetAlerts),
    [monthIncome, monthExpenses, liquidity, runwayDisplay, monthTxs, budgetAlerts]);

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
    triggerDownload(new Blob([[header,...rows].map(r=>r.join(",")).join("\n")],{type:"text/csv"}),`vault-${TODAY_STR}.csv`);
    addToast(`Exported ${txs.length} records`, "ok");
  }, [txs, addToast]);

  const exportJSON = useCallback(() => {
    triggerDownload(new Blob([JSON.stringify({baseLiquidity:precise(baseLiq),txs,budgets,customCats,currency:"USD"},null,2)],{type:"application/json"}),`vault-backup-${TODAY_STR}.json`);
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
    setModal(null); setEditId(null); setForm(blankForm(cats));
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

  const handleDelete = useCallback(tx => {
    const target=tx.isRecurringInstance?txs.find(t=>t.id===tx.recurringParentId)||tx:tx;
    if(target.recurring||tx.isRecurringInstance){setScopeAction({action:"delete",tx:target});return;}
    deleteTxById(tx.id);
  }, [txs,deleteTxById]);

  const openEdit = useCallback(tx => {
    const target=tx.isRecurringInstance?txs.find(t=>t.id===tx.recurringParentId):tx;
    if(!target)return;
    if(tx.recurring||tx.isRecurringInstance){setScopeAction({action:"edit",tx:target});return;}
    setEditId(target.id); setForm(formFromTx(target)); setModal("tx");
  }, [txs]);

  const openAdd = useCallback(() => { setEditId(null); setForm(blankForm(cats)); setModal("tx"); }, [cats]);

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

  const amountDisplay = useMemo(() => {
    const cents = parseInt(form?.amount || "0", 10);
    return fmt(Number.isFinite(cents) ? cents / 100 : 0);
  }, [form?.amount, fmt]);

  const LoadingScreen = () => (
    <div style={{ position:"fixed",inset:0,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18 }}>
      <div style={{ fontFamily:"'Inter',sans-serif",fontSize:11,letterSpacing:"0.35em",color:T.text3 }}>VAULT</div>
      <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,letterSpacing:"0.3em",color:T.text4 }}>INITIALIZING SYSTEMS</div>
      <div style={{ width:120,height:1,background:T.border,position:"relative",overflow:"hidden",marginTop:4 }}>
        <div style={{ position:"absolute",top:0,height:"100%",width:"40%",background:T.blue,animation:"scan 1.4s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes scan{0%{left:-40%}100%{left:140%}}`}</style>
    </div>
  );

  if (!authReady) return <LoadingScreen />;
  if (hasSupabaseConfig && !session) return <AuthView onAuth={() => {}} />;
  if (!loaded || !form) return <LoadingScreen />;
 
  // ── Onboarding gate — fires for brand new users only ──
  if (baseLiq === 0 && txs.length === 0) {
    return (
      <VaultOnboarding
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
    // ── Trial gate — fires when trial has expired and no paid tier ──
    if (trialReady && trialExpired && !isPaid) {
      return (
        <TrialExpiredWall
          accountEmail={accountEmail}
        />
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
    width:"100%", background:"#FFFFFF",
    border:`1.5px solid rgba(0,0,0,0.12)`, padding:"10px 13px",
    color:T.text1, fontSize:13, fontFamily:"inherit",
    transition:"border-color 150ms",
    borderRadius:8,
  };

  const navItems = [
    ["overview","Overview","O"],
    ["calendar","Calendar","C"],
    ["ledger","Ledger","L"],
    ["settings","Settings",""],
    ["mission","Mission","M"],
  ];

  const anomalyDots = anomalies.filter(a => a.type === "spike").map(a => ({ ...a }));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: VAULT_CSS }} />

      <div className="v-app">

        {/* ── SIDEBAR ── */}
        <aside className="v-sidebar">
          <div className="v-sidebar-logo">
            <img src="/TheVaultShield.png" style={{ width:26, height:26, objectFit:'contain' }} alt="" />
            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:15, fontWeight:800, letterSpacing:'-0.02em', color:'#0A0C10', marginLeft:8 }}>
              VAULT<span style={{ color:'#1A6FD4' }}>IQ</span>
            </span>
          </div>

          <div className="v-liq">
            <div className="v-liq-label">Available Capital</div>
            <div className="v-liq-value" style={{ color: liquidity >= 0 ? T.text1 : T.red }}>
              {fmt(liquidity)}
            </div>
            <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8 }}>
              {/* Mini 8-month sparkline */}
              <svg width={70} height={24} style={{ display:"block", flexShrink:0 }}>
                {(() => {
                  const pts = MONTHS_SHORT.slice(0, 8).map((_, i) => {
                    const mTxs = txsForMonth(txs, period.y, i);
                    return mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0) -
                           mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
                  });
                  const mn = Math.min(...pts), mx = Math.max(...pts);
                  const rng = mx - mn || 1;
                  const xs = pts.map((_, i) => (i / (pts.length - 1)) * 70);
                  const ys = pts.map(v => 22 - ((v - mn) / rng) * 20);
                  const d = xs.map((x, i) => `${i===0?"M":"L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
                  const isPos = pts[pts.length-1] >= pts[0];
                  return (
                    <polyline points={xs.map((x,i)=>`${x},${ys[i]}`).join(" ")}
                      fill="none" stroke={isPos ? T.green : T.red} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                  );
                })()}
              </svg>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text4 }}>Base + net activity</div>
            </div>
          </div>
          

          {budgetAlerts.length > 0 && (
            <div className="v-budget-alert">
              <div className="v-label" style={{ fontSize:7.5, color:T.red, marginBottom:5 }}>Budget Alert</div>
              {budgetAlerts.slice(0,3).map(({cat,over}) => (
                <div key={cat} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:over?T.red:T.gold, marginBottom:2, letterSpacing:"0.05em" }}>
                  {over ? "▲" : "!"} {cat}
                </div>
              ))}
            </div>
          )}

          <nav className="v-nav">
            {navItems.map(([id,lbl,key]) => (
              <button key={id} className={`v-nav-item${view===id?" active":""}`} onClick={() => setView(id)}>
                <span style={{ display:"flex", alignItems:"center", gap:9 }}>
                  <span style={{ width:16, height:16, opacity:view===id?1:0.5, flexShrink:0 }}>{NavIcons[id]}</span>
                  <span>{lbl}</span>
                </span>
                {key && <span className="v-nav-key">{key}</span>}
              </button>
            ))}
          </nav>

          <div className="v-sidebar-bottom">
            <div className="v-sidebar-actions">
              <button onClick={openAdd} className="v-btn-primary">
                + Record Transaction
              </button>
              <button onClick={logout} className="v-btn-secondary" style={{ width:"100%", marginTop:8, textAlign:"center" }}>
                Logout
              </button>
              <TrialBanner daysRemaining={daysRemaining} isPaid={isPaid} />
              {hasSupabaseConfig && accountEmail && (
                <div style={{ width:"100%", marginTop:10, padding:"10px 12px", border:"1px solid rgba(0,0,0,0.08)", background:"#F7F9FC", boxSizing:"border-box", borderRadius:8 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:6 }}>
                    <span style={{ width:5, height:5, borderRadius:"999px", background:"#00B876", display:"inline-block" }} />
                    <div className="v-label" style={{ fontSize:6.5, marginBottom:0, color:"#00B876" }}>Authenticated</div>
                  </div>
                  <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:9.5, color:"#3D4452", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"center" }}>{accountEmail}</div>
                  <div style={{ marginTop:5, fontFamily:"'JetBrains Mono', monospace", fontSize:6.5, color:"#9CA3AF", textAlign:"center", letterSpacing:"0.08em", textTransform:"uppercase" }}>Secure Session Active</div>
                </div>
              )}
              <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:7, color:"#9CA3AF", textAlign:"center", letterSpacing:"0.15em", marginTop:10, marginBottom:2 }}>
                N · new &nbsp;&nbsp; ← → · month &nbsp;&nbsp; M · mission
              </div>
            </div>
          </div>
        </aside>

        {/* ── MOBILE TOPBAR ── */}
        <div className="v-mobile-topbar">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <img src="/TheVaultShield.png" className="v-mobile-logo-img" alt="" />
            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:800, letterSpacing:"-0.02em", color:"#0A0C10" }}>VAULT<span style={{ color:"#1A6FD4" }}>IQ</span></span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:400, color:liquidity>=0?T.text1:T.red, letterSpacing:"-0.03em" }}>
              {fmt(liquidity)}
            </div>
            {(view==="overview"||view==="calendar") && (
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
          <header className="v-header">
            <div>
              <div className="v-header-breadcrumb">VAULT / {view.toUpperCase()}</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div className="v-header-title">
                  {{ overview:"Command Overview", calendar:"Transaction Calendar", ledger:"Transaction Ledger", settings:"System Configuration", mission:"Launch Mission" }[view]}
                </div>
                {view === "overview" && momIncomePct !== null && (
                  <TrendPill pct={momIncomePct} />
                )}
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              {(view==="overview"||view==="calendar") && (
                <div className="v-period-nav">
                  <button className="v-period-btn" onClick={goPrev}>‹</button>
                  <span className="v-period-label">{MONTHS_FULL[period.m].toUpperCase()} {period.y}</span>
                  <button className="v-period-btn" onClick={goNext}>›</button>
                </div>
              )}
              <button onClick={openAdd} className="v-btn-primary" style={{ width:"auto", padding:"9px 20px", fontSize:13, letterSpacing:0, fontWeight:600 }}>
                + New
              </button>
            </div>
          </header>

          <main className="v-content">
            <div
              className={
                view === "calendar" || view === "overview" || view === "ledger" || view === "settings" || view === "mission"
                  ? "v-content-inner v-content-inner--wide"
                  : "v-content-inner"
              }
            >

            {/* ─── OVERVIEW ─── */}
            {view === "overview" && (
              <div style={{ padding:"20px 24px 60px" }}>

                {/* ── Status bar ── */}
                <div style={{
                  display:"flex", alignItems:"center", gap:14, flexWrap:"wrap",
                  marginBottom:16, padding:"10px 18px",
                  background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:12,
                }}>
                  {intelMsgs.map((msg, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{
                        width:6, height:6, borderRadius:"50%", background:msg.color, flexShrink:0,
                        boxShadow: msg.severity==="critical" ? `0 0 8px ${msg.color}` : "none",
                        animation: msg.severity==="critical" ? "pulse-dot 1.8s ease-in-out infinite" : "none",
                      }} />
                      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:11, color:msg.severity==="ok"?T.text2:msg.color, fontWeight:500 }}>{msg.text}</span>
                    </div>
                  ))}
                  <div style={{ flex:1 }} />
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text4, letterSpacing:"0.08em" }}>
                    {new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).toUpperCase()}
                  </span>
                </div>

                {/* ── HERO: Net Position ── */}
                <div style={{
                  background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:16,
                  padding:"28px 32px 24px", marginBottom:12, position:"relative", overflow:"hidden",
                }}>
                  {/* Subtle accent strip at top */}
                  <div style={{
                    position:"absolute", top:0, left:0, right:0, height:3,
                    background: monthNet >= 0
                      ? "linear-gradient(90deg, #00B876 0%, rgba(0,184,118,0.2) 100%)"
                      : "linear-gradient(90deg, #E53935 0%, rgba(229,57,53,0.2) 100%)",
                  }} />

                  <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:24, alignItems:"start", flexWrap:"wrap" }}>
                    {/* Left: main value + meta */}
                    <div>
                      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.10em", textTransform:"uppercase", color:T.text4, marginBottom:12 }}>
                        Net Position · {MONTHS_FULL[period.m]} {period.y}
                      </div>
                      <div style={{
                        fontFamily:"'Inter',sans-serif", fontSize:58, fontWeight:800,
                        letterSpacing:"-0.05em", lineHeight:1,
                        color: monthNet >= 0 ? T.green : T.red,
                        transition:"color 0.5s",
                      }}>
                        {monthNet >= 0 ? "+" : "−"}{fmt(Math.abs(monthNet))}
                      </div>
                      <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:monthNet>=0?"rgba(0,184,118,0.7)":"rgba(229,57,53,0.7)", letterSpacing:"0.06em" }}>
                          {monthNet >= 0 ? "▲ Positive cycle" : "▼ Deficit cycle"}
                        </span>
                        {overBudget && <span className="v-anomaly-badge">BUDGET EXCEEDED</span>}
                        {!overBudget && budgetAlerts.length > 0 && (
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, letterSpacing:"0.16em", color:T.gold, border:`1px solid rgba(232,160,32,0.3)`, padding:"2px 7px", borderRadius:3 }}>BUDGET ALERT</span>
                        )}
                      </div>
                    </div>
                    {/* Right: health ring */}
                    <HealthRing score={healthScore} />
                  </div>

                  {/* Sub-row: 4 metrics */}
                  <div style={{ marginTop:24, paddingTop:20, borderTop:"1px solid rgba(0,0,0,0.07)", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0 }}>
                    {[
                      {
                        label:"Monthly Income", value:fmt(monthIncome),
                        color:valueSignColor(monthIncome),
                        sub:`${monthTxs.filter(t=>t.type==="income").length} entries`,
                        trend: momIncomePct,
                      },
                      {
                        label:"Burn Rate", value:fmt(monthExpenses),
                        color:T.red,
                        sub:`${monthTxs.filter(t=>t.type==="expense").length} entries`,
                        trend: momExpensePct, invertTrend:true,
                      },
                      {
                        label:"Savings Rate",
                        value: savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "—",
                        color: savingsRate === null ? T.text3 : savingsRate >= 20 ? T.green : savingsRate >= 0 ? T.gold : T.red,
                        sub:"of gross income",
                        trend: null,
                      },
                      {
                        label:"Runway",
                        value: runwayDisplay?.primary ?? "—",
                        color: runwayDisplay ? T.gold : T.text3,
                        sub: runwayDisplay?.secondary ?? "Insufficient data",
                        trend: null,
                      },
                    ].map(({ label, value, color, sub, trend, invertTrend }, i) => (
                      <div key={label} style={{
                        padding:"16px 20px",
                        borderLeft: i > 0 ? "1px solid rgba(0,0,0,0.07)" : "none",
                      }}>
                        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:T.text4, marginBottom:8 }}>{label}</div>
                        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:4 }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:500, letterSpacing:"-0.04em", color }}>{value}</span>
                          {trend !== null && <TrendPill pct={trend} invert={invertTrend} />}
                        </div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text4 }}>{sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recovery + next-month toggle */}
                  <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:9, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:T.text4, marginBottom:4 }}>Recovery Target</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:500, color:breakEvenGap>0?T.gold:T.green, letterSpacing:"-0.02em" }}>
                        {breakEvenGap > 0 ? `${fmt(breakEvenGap)} to break-even` : "Break-even achieved ✓"}
                      </div>
                    </div>
                    <div style={{ flex:1 }} />
                    <button onClick={()=>setShowProjected(p=>!p)} className="v-btn-secondary" style={{ fontSize:10, letterSpacing:"0.12em", padding:"7px 16px" }}>
                      {showProjected ? "▲ Hide Forecast" : "▼ Show Forecast"}
                    </button>
                  </div>
                </div>

                {/* ── Forecast row ── */}
                {showProjected && (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>
                    {[
                      { label:`Projected Income · ${MONTHS_SHORT[(period.m+1)%12]}`, value:fmt(projectedNext.income), color:T.green },
                      { label:`Projected Burn · ${MONTHS_SHORT[(period.m+1)%12]}`,   value:fmt(projectedNext.expense), color:T.red },
                      { label:`Projected Net · ${MONTHS_SHORT[(period.m+1)%12]}`,    value:fSign(projectedNext.income-projectedNext.expense), color:projectedNext.income-projectedNext.expense>=0?T.green:T.red },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:12, padding:"18px 22px" }}>
                        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:9, fontWeight:700, letterSpacing:"0.09em", textTransform:"uppercase", color:T.text4, marginBottom:12 }}>{label}</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:500, color, letterSpacing:"-0.04em" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Chart Panel ── */}
                <div style={{ background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:16, marginBottom:12 }}>
                  <div style={{ padding:"20px 24px 0", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                    <div>
                      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.09em", textTransform:"uppercase", color:T.text4, marginBottom:5 }}>
                        {chartMode==="monthly" ? `Performance Intelligence · ${period.y}` : "Multi-Year Analysis"}
                      </div>
                      {anomalies.length > 0 && (
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
                          {anomalies.map((a, i) => (
                            <span key={i} className="v-anomaly-badge">
                              {a.type==="spike" ? `↑ ${a.name} spike` : `! ${a.name} no income`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                      {[{c:T.green,l:"Income"},{c:T.red,l:"Burn"}].map(x=>(
                        <div key={x.l} style={{ display:"flex", alignItems:"center", gap:7, fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.text2 }}>
                          <div style={{ width:16, height:2, background:x.c, opacity:0.7, borderRadius:1 }} />{x.l}
                        </div>
                      ))}
                      <div style={{ width:1, height:14, background:"rgba(0,0,0,0.1)" }} />
                      {[["monthly","Monthly"],["yearly","Yearly"]].map(([id,lbl])=>(
                        <button key={id} onClick={()=>setChartMode(id)} style={{
                          padding:"5px 12px",
                          background:chartMode===id?T.blueLight:"transparent",
                          border:`1px solid ${chartMode===id?"rgba(26,111,212,0.3)":"transparent"}`,
                          color:chartMode===id?T.blue:T.text3,
                          fontFamily:"'Inter',sans-serif", fontSize:11, fontWeight:500,
                          letterSpacing:"0", borderRadius:6, transition:"all 150ms",
                        }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:"8px 0 8px" }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={chartData} margin={{ top:10, right:24, bottom:0, left:6 }}>
                        <defs>
                          <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={T.green} stopOpacity={0.10}/>
                            <stop offset="95%" stopColor={T.green} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={T.red} stopOpacity={0.07}/>
                            <stop offset="95%" stopColor={T.red} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 8" stroke="rgba(0,0,0,0.05)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill:T.text4, fontSize:9, fontFamily:"'JetBrains Mono',monospace" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill:T.text4, fontSize:9, fontFamily:"'JetBrains Mono',monospace" }} axisLine={false} tickLine={false}
                          tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}k`:`$${v}`} width={44} />
                        <Tooltip content={props => <ChartTip {...props} fmt={fmt} fSign={fSign} anomalies={anomalies} />} />
                        <ReferenceLine y={0} stroke="rgba(0,0,0,0.05)" />
                        <Area type="monotone" dataKey="Income"   stroke={T.green} strokeWidth={2} fill="url(#gInc)" dot={false} activeDot={{ r:4, fill:T.green, stroke:"#fff", strokeWidth:2 }} />
                        <Area type="monotone" dataKey="Expenses" stroke={T.red}   strokeWidth={2} fill="url(#gExp)" dot={false} activeDot={{ r:4, fill:T.red, stroke:"#fff", strokeWidth:2 }} />
                        {anomalyDots.map((a,i) => (
                          <ReferenceDot key={i} x={a.name} y={a.value} r={5} fill={T.red} stroke="rgba(229,57,53,0.25)" strokeWidth={8} />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ── Bottom split: Burn Breakdown + Recent Activity ── */}
                <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1.65fr)", gap:12 }}>
                  {/* Burn Breakdown */}
                  <div style={{ background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:16, overflow:"hidden" }}>
                    <div style={{ padding:"18px 22px 14px", borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.09em", textTransform:"uppercase", color:T.text4, marginBottom:3 }}>Burn Breakdown</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text4 }}>{MONTHS_FULL[period.m]} {period.y}</div>
                    </div>
                    <div style={{ padding:"16px 22px" }}>
                      {catBreakdown.length === 0
                        ? <div className="v-empty" style={{ padding:"30px 0" }}>No expense data this period</div>
                        : catBreakdown.map(([cat, val]) => {
                            const hasBudget = budgets[cat] > 0;
                            return hasBudget ? (
                              <BudgetBar key={cat} cat={cat} spent={val} limit={budgets[cat]} fmt={fmt} />
                            ) : (
                              <div key={cat} style={{ marginBottom:14 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                                  <span style={{ fontFamily:"'Inter',sans-serif", fontSize:12, color:T.text2, fontWeight:500 }}>{cat}</span>
                                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:T.text1, fontWeight:500 }}>{fmt(val)}</span>
                                </div>
                                <div style={{ height:3, background:"rgba(0,0,0,0.05)", borderRadius:2 }}>
                                  <div style={{ height:"100%", width:`${monthExpenses>0?(val/monthExpenses)*100:0}%`, background:T.red, opacity:0.5, borderRadius:2, transition:"width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
                                </div>
                              </div>
                            );
                          })
                      }
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div style={{ background:"#fff", border:"1px solid rgba(0,0,0,0.08)", borderRadius:16, overflow:"hidden", minWidth:0 }}>
                    <div style={{ padding:"18px 22px 14px", borderBottom:"1px solid rgba(0,0,0,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontFamily:"'Inter',sans-serif", fontSize:10, fontWeight:700, letterSpacing:"0.09em", textTransform:"uppercase", color:T.text4, marginBottom:3 }}>Recent Activity</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text4 }}>Last 2 active days</div>
                      </div>
                      {monthTxs.length > 0 && (
                        <button className="v-btn-ghost" onClick={()=>setView("ledger")} style={{ fontWeight:600, color:T.blue, fontSize:11 }}>View All →</button>
                      )}
                    </div>
                    <div className="v-recent-activity-scroll">
                      <TxFeed txs={recentActivityTxs} onEdit={openEdit} onDelete={handleDelete} fmt={fmt} />
                    </div>
                  </div>
                </div>
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
                      <div style={{ display:"flex", gap:1, background:T.border }}>
                        {[
                          {l:"NET",    v:fSign(monthNet),    c:monthNet>=0?T.green:T.red},
                          {l:"INCOME", v:fmt(monthIncome),   c:valueSignColor(monthIncome)},
                          {l:"BURN",   v:fmt(monthExpenses), c:T.red},
                        ].map(s=>(
                          <div key={s.l} style={{ padding:"10px 16px", background:T.bgCard }}>
                            <div className="v-label" style={{ fontSize:7, marginBottom:4 }}>{s.l}</div>
                            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:s.c, fontWeight:500, letterSpacing:"-0.03em" }}>{s.v}</div>
                          </div>
                        ))}
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
                        const isToday=day===TODAY.getDate()&&period.m===TODAY.getMonth()&&period.y===TODAY.getFullYear();
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

                              {d && (
                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 18,
                                  height: 18,
                                  flexShrink: 0,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 7,
                                  fontWeight: 500,
                                  lineHeight: 1,
                                  color: "#F5F7FA",
                                  background: dayNet >= 0
                                    ? "linear-gradient(180deg, rgba(70,231,169,0.06), rgba(70,231,169,0.02))"
                                    : "linear-gradient(180deg, rgba(255,127,159,0.07), rgba(255,127,159,0.025))",
                                  border: dayNet >= 0
                                    ? "1px solid rgba(70,231,169,0.10)"
                                    : "1px solid rgba(255,127,159,0.12)",
                                  borderRadius: 999,
                                  boxShadow: "inset 0 0 8px rgba(0,0,0,0.16)",
                                }}>
                                  {d.txs.length}
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

                                {/* Sub-row: income + expense when both exist */}
                                {d.income > 0 && d.expense > 0 && (
                                  <div style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 2,
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                      <div style={{ width: 3, height: 3, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
                                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(70,231,169,0.6)" }}>
                                        {fmtCalDay(d.income, currency).replace(/^[+−]/, "")}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                      <div style={{ width: 3, height: 3, borderRadius: "50%", background: T.red, flexShrink: 0 }} />
                                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(255,127,159,0.6)" }}>
                                        {fmtCalDay(-d.expense, currency).replace(/^[+−]/, "")}
                                      </span>
                                    </div>
                                  </div>
                                )}
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
                        <div className="v-panel-header">
                          <div className="v-label" style={{ fontSize:7.5, marginBottom:3 }}>{MONTHS_FULL[period.m].toUpperCase()} {selDay}, {period.y}</div>
                          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:26, fontWeight:500, letterSpacing:"-0.05em", color:dayData.income-dayData.expense>=0?T.green:T.red, marginBottom:12 }}>
                            {fSign(dayData.income-dayData.expense)}
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1, background:T.border }}>
                            {dayData.income > 0 && (
                              <div style={{ padding:"10px 13px", background:T.greenLight }}>
                                <div className="v-label" style={{ fontSize:7, color:T.green, marginBottom:4 }}>INCOME</div>
                                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:T.green, fontWeight:500 }}>{fmt(dayData.income)}</div>
                              </div>
                            )}
                            {dayData.expense > 0 && (
                              <div style={{ padding:"10px 13px", background:T.redLight }}>
                                <div className="v-label" style={{ fontSize:7, color:T.red, marginBottom:4 }}>BURN</div>
                                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:T.red, fontWeight:500 }}>{fmt(dayData.expense)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ padding:"12px 14px 16px", maxHeight:500, overflowY:"auto" }}>
                          {[...dayData.txs].sort((a,b)=>a.type.localeCompare(b.type)).map((tx,i) => {
                            const isInc=tx.type==="income";
                            const tags=tx.tags?tx.tags.split(",").map(t=>t.trim()).filter(Boolean):[];
                            return (
                              <div key={i} style={{ padding:"13px 14px", background:T.bgSubtle, border:`1px solid ${T.border}`, marginBottom:6, borderLeft:`3px solid ${isInc?T.green:T.red}` }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                                  <div>
                                    <span className="v-badge" style={{ background:isInc?T.greenLight:T.redLight, color:isInc?T.green:T.red, marginBottom:4, display:"inline-flex" }}>{tx.type}</span>
                                    <div style={{ fontSize:12, fontWeight:600, color:T.text1 }}>{tx.category}</div>
                                  </div>
                                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:500, color:isInc?T.green:T.red }}>
                                    {isInc?"+":"−"}{fmt(tx.amount)}
                                  </span>
                                </div>
                                {tx.description && <div style={{ fontSize:11, color:T.text2, marginBottom:6 }}>{tx.description}</div>}
                                {tags.length>0 && (<div style={{ display:"flex", gap:3, flexWrap:"wrap", marginBottom:8 }}>{tags.map((tag,j)=><span key={j} className="v-tag">{tag}</span>)}</div>)}
                                <div style={{ display:"flex", gap:10 }}>
                                  {!tx.isRecurringInstance && <button className="v-btn-ghost" onClick={()=>openEdit(tx)}>EDIT</button>}
                                  <button className="v-btn-ghost" onClick={()=>{handleDelete(tx);if(calMap[selDay]?.txs.length<=1)setSelDay(null);}}
                                    style={{ color:T.text3 }}
                                    onMouseEnter={e=>e.currentTarget.style.color=T.red}
                                    onMouseLeave={e=>e.currentTarget.style.color=T.text3}>DELETE</button>
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
                        <button onClick={()=>{setForm({...blankForm(cats),date:`${period.y}-${String(period.m+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`});setModal("tx");}}
                          className="v-btn-secondary" style={{ fontSize:8, letterSpacing:"0.18em" }}>RECORD ENTRY</button>
                      </div>
                    ) : (
                      <div style={{ padding:"64px 20px", textAlign:"center" }}>
                        <div className="v-label" style={{ fontSize:7.5, marginBottom:8 }}>Day Detail</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, color:T.text4, lineHeight:1.9 }}>Select a date to view its transactions.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── LEDGER ─── */}
            {view === "ledger" && (
              <>
                {/* ── KPI bar: 4-col desktop / 2×2 mobile ── */}
                <div
                  className="v-ledger-kpi-bar"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4,1fr)",
                    background: T.border,
                    gap: 1,
                    marginBottom: 14,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  {[
                    { label:"Total Capital",  value:fmt(liquidity),      color:T.text1, sub:"All-time net" },
                    { label:isFiltered?"Period Income":"All-Time Income",    value:fmt(shownIncome), color:valueSignColor(shownIncome), sub:`${txs.filter(t=>t.type==="income").length} records` },
                    { label:isFiltered?"Period Burn":"All-Time Burn",         value:fmt(isFiltered?(ledgerTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)):ledgerExpenses), color:T.red, sub:`${txs.filter(t=>t.type==="expense").length} records` },
                    { label:isFiltered?"Period Net":"All-Time Net",
                      value:fSign(isFiltered?(ledgerTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)-ledgerTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)):ledgerIncome-ledgerExpenses),
                      color:(isFiltered?(ledgerTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)-ledgerTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)):ledgerIncome-ledgerExpenses)>=0?T.green:T.red,
                      sub:`${ledgerTxs.length} shown${isFiltered?" (filtered)":""}`, last:true },
                  ].map(({ label, value, color, sub, last }) => (
                    <div key={label} className="v-kpi-card" style={{ borderRight:last?"none":`1px solid ${T.border}` }}>
                      <div className="v-kpi-label">{label}</div>
                      <div className="v-kpi-value" style={{ color }}>{value}</div>
                      <div className="v-kpi-sub">{sub}</div>
                    </div>
                  ))}
                </div>

                <div className="v-filter-bar">
                  <div className="v-search-wrap">
                    <span className="v-search-icon">⌕</span>
                    <input type="text" className="v-search-input"
                      placeholder="Search description, category, tags, amount…"
                      value={ledgerSearch} onChange={e=>setLedgerSearch(e.target.value)} />
                    {ledgerSearch && (
                      <button className="v-search-clear" onClick={()=>setLedgerSearch("")}>×</button>
                    )}
                  </div>
                  <DateRangeFilter from={ledgerFrom} to={ledgerTo} onFrom={setLedgerFrom} onTo={setLedgerTo} onClear={()=>{setLedgerFrom("");setLedgerTo("");}} />
                </div>

                {/* ── Search Summary Bar ── */}
                {ledgerSearchActive && (
                  <div className="v-search-summary">
                    <div className="v-search-summary-item">
                      <span className="v-search-summary-label">Results</span>
                      <span className="v-search-summary-value" style={{ color:T.text2, fontSize:16 }}>
                        {ledgerTxs.length} <span style={{ fontSize:9, color:T.text3, letterSpacing:"0.1em" }}>TX</span>
                      </span>
                    </div>
                    <div style={{ width:1, height:32, background:T.border, flexShrink:0 }} />
                    {ledgerSearchExpenses > 0 && (
                      <div className="v-search-summary-item">
                        <span className="v-search-summary-label">Total Spend</span>
                        <span className="v-search-summary-value" style={{ color:T.red }}>{fmt(ledgerSearchExpenses)}</span>
                      </div>
                    )}
                    {ledgerSearchIncome > 0 && (
                      <div className="v-search-summary-item">
                        <span className="v-search-summary-label">Total Income</span>
                        <span className="v-search-summary-value" style={{ color:T.green }}>{fmt(ledgerSearchIncome)}</span>
                      </div>
                    )}
                    {ledgerSearchIncome > 0 && ledgerSearchExpenses > 0 && (
                      <>
                        <div style={{ width:1, height:32, background:T.border, flexShrink:0 }} />
                        <div className="v-search-summary-item">
                          <span className="v-search-summary-label">Net</span>
                          <span className="v-search-summary-value" style={{ color:ledgerSearchNet>=0?T.green:T.red }}>{fSign(ledgerSearchNet)}</span>
                        </div>
                      </>
                    )}
                    {ledgerSearch.trim() && (
                      <>
                        <div style={{ flex:1 }} />
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.text4, letterSpacing:"0.14em", alignSelf:"center" }}>
                          QUERY: <span style={{ color:T.gold }}>{ledgerSearch.trim().toUpperCase()}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div style={{ display:"flex", alignItems:"center", gap:0, padding:"8px 0 10px", borderBottom:`1px solid rgba(0,0,0,0.06)`, marginBottom:1 }}>
                  <div className="v-filter-chips">
                    {[["all","All"],["income","Income"],["expense","Burn"]].map(([val,lbl])=>(
                      <button key={val} onClick={()=>setTxFilter(val)} className={`v-filter-chip${txFilter===val?" active":""}`}>{lbl.toUpperCase()}</button>
                    ))}
                  </div>
                  <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:16 }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:T.text3, letterSpacing:"0.06em" }}>
                      {ledgerTxs.length} record{ledgerTxs.length!==1?"s":""}
                      {isFiltered && <span style={{ color:T.gold, marginLeft:6 }}>· FILTERED</span>}
                    </span>
                    <button className="v-btn-ghost" onClick={exportCSV}>CSV ↓</button>
                    <button className="v-btn-ghost" onClick={exportJSON}>JSON ↓</button>
                  </div>
                </div>

                <div className="v-panel">
                  <TxFeed txs={ledgerTxs} onEdit={openEdit} onDelete={handleDelete} fmt={fmt} />
                </div>
              </>
            )}

            {/* ─── MISSION ─── */}
            {view === "mission" && <VaultMission />}

            {/* ─── SETTINGS ─── */}
            {view === "settings" && (
              <>
                <div className="v-settings-tabs">
                  {/* Currency tab REMOVED — USD only */}
                  {[["data","Data"],["budgets","Budgets"],["categories","Categories"],["mockdata","Sample Data"],["danger","Danger Zone"]].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setSettingsTab(id)} className={`v-settings-tab${settingsTab===id?" active":""}`}>{lbl}</button>
                  ))}
                </div>

                {settingsTab==="data" && (
                  <div className="v-settings-grid">
                    <SettingsCard title="Backup & Restore" desc="Export a complete JSON backup of all data including budgets, categories, and settings. Import to restore.">
                    <SettingsCard
                        title="Monthly Statement"
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
                      <button onClick={exportJSON} className="v-btn-primary" style={{ width:"auto", padding:"9px 16px" }}>EXPORT JSON</button>
                      <label className="v-btn-secondary" style={{ cursor:"pointer" }}>
                        IMPORT JSON
                        <input type="file" accept="application/json,.json" style={{ display:"none" }}
                          onChange={async e => { const f=e.target.files?.[0]; e.target.value=""; if(!f)return; try{await importFile(f);}catch(err){addToast(err?.message||"Import failed","err");} }} />
                      </label>
                    </SettingsCard>
                    <SettingsCard title="CSV Export" desc="Export all transactions as CSV for use in Excel, Google Sheets, or reporting tools.">
                      <button onClick={exportCSV} className="v-btn-secondary">EXPORT CSV</button>
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

            </div>
          </main>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <div className="v-mobile-bottomnav">
        {[["overview","Overview"],["calendar","Calendar"],["ledger","Ledger"],["settings","Settings"],["mission","Mission"]].map(([id,lbl])=>(
          <button key={id} className={`v-mobile-nav-item${view===id?" active":""}`} onClick={()=>setView(id)}>
            {NavIcons[id]}
            <span>{lbl}</span>
          </button>
        ))}
      </div>

      <button className="v-mobile-add-fab" onClick={openAdd}>+</button>

      {/* ── TRANSACTION MODAL ── */}
      {modal === "tx" && (
        <Modal onClose={() => { setModal(null); setEditId(null); setForm(blankForm(cats)); }}>
          <div className="v-label" style={{ fontSize:7.5, marginBottom:4 }}>{editId?"Edit Record":"New Record"}</div>
          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:700, letterSpacing:"-0.01em", marginBottom:22, color:T.text1 }}>
            {editId ? "Edit Transaction" : "Record Transaction"}
          </div>

          <div className="v-type-toggle">
            {["expense","income"].map(t=>(
              <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:t==="income"?cats.income[0]:cats.expense[0]}))}
                className={`v-type-btn${form.type===t?" active-"+t:""}`}>
                {t==="expense"?"BURN":"INCOME"}
              </button>
            ))}
          </div>

          <div className="v-field">
            <label className="v-field-label">Amount</label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={amountDisplay}
              className="v-amount-display"
              onChange={() => {}}
              onKeyDown={e => {
                if (e.key >= "0" && e.key <= "9") {
                  e.preventDefault();
                  setForm(f => ({ ...f, amount: (f.amount + e.key).slice(0, 10) }));
                } else if (e.key === "Backspace" || e.key === "Delete") {
                  e.preventDefault();
                  setForm(f => ({ ...f, amount: f.amount.slice(0, -1) }));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  commitTx();
                }
              }}
              style={{
                width:"100%",
                background:"#FFFFFF",
                border:`1.5px solid rgba(0,0,0,0.12)`,
                borderRadius:8,
                padding:"18px 14px 14px",
                color: parseInt(form.amount||"0",10) === 0 ? T.text4 : (form.type==="income"?T.green:T.red),
                fontFamily:"'JetBrains Mono',monospace",
                fontSize:38,
                fontWeight:400,
                letterSpacing:"-0.04em",
                textAlign:"center",
                caretColor:"transparent",
                transition:"border-color 150ms, color 150ms",
                display:"block",
              }}
              onFocus={e => e.target.style.borderColor = "#1A6FD4"}
              onBlur={e => e.target.style.borderColor = "rgba(0,0,0,0.12)"}
            />
            <div className="v-amount-hint">Type digits · Backspace to clear</div>
          </div>

          <div className="v-field">
            <label className="v-field-label">Category</label>
            <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={inputSx}>
              {cats[form.type].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="v-field">
            <label className="v-field-label">Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
              style={{ ...inputSx, fontFamily:"'JetBrains Mono',monospace", colorScheme:"dark" }} />
          </div>
          <div className="v-field">
            <label className="v-field-label">Description</label>
            <input type="text" placeholder="Memo…" value={form.description}
              onChange={e=>setForm(f=>({...f,description:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&commitTx()}
              style={inputSx} />
          </div>
          <div className="v-field">
            <label className="v-field-label">Tags</label>
            <input type="text" placeholder="client-a, q3 (comma-separated)" value={form.tags}
              onChange={e=>setForm(f=>({...f,tags:e.target.value}))} style={inputSx} />
          </div>

          <div className="v-toggle-wrapper">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:form.recurring?14:0 }}>
              <div>
                <div style={{ fontSize:12, color:T.text2, fontWeight:500 }}>Recurring Entry</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:T.text3, marginTop:2, letterSpacing:"0.04em" }}>Projects forward automatically</div>
              </div>
              <button onClick={()=>setForm(f=>({...f,recurring:!f.recurring}))}
                className="v-toggle" style={{ borderColor:form.recurring?T.blue:T.border }}>
                <div className="v-toggle-thumb" style={{ left:form.recurring?19:2, background:form.recurring?T.blue:T.text3 }} />
              </button>
            </div>
            {form.recurring && (
              <div>
                <label className="v-field-label" style={{ marginBottom:7 }}>Frequency</label>
                <select value={form.recurringFreq} onChange={e=>setForm(f=>({...f,recurringFreq:e.target.value}))} style={{ ...inputSx, fontSize:12 }}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            )}
          </div>

          <div className="v-modal-actions">
            <button onClick={()=>{setModal(null);setEditId(null);setForm(blankForm(cats));}} className="v-btn-secondary">Cancel</button>
            <button onClick={commitTx} className="v-btn-primary">{editId?"Save Changes":"Record"}</button>
          </div>
        </Modal>
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

      <ToastStack toasts={toasts} remove={removeToast} />
    </>
  );
}