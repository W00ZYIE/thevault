import { useState, useEffect, useMemo } from "react";

// ─── Design tokens (mirrors App.jsx T object) ──────────────────────────────────
const T = {
  bg:           "#090b0e",
  surface:      "#0c0f13",
  surfaceHi:    "#111418",
  border:       "rgba(180,200,220,0.10)",
  borderHi:     "rgba(180,200,220,0.20)",
  text1:        "#edf2f6",
  text2:        "#b8c8d8",
  text3:        "#6e8099",
  green:        "#46e7a9",
  greenDim:     "rgba(70,231,169,0.12)",
  red:          "#ff7f9f",
  redDim:       "rgba(255,127,159,0.10)",
  gold:         "#e2c983",
  goldDim:      "rgba(226,201,131,0.10)",
  steel:        "#6B9BC0",
  steelDim:     "rgba(107,155,192,0.10)",
};

const STORAGE_KEY = "vault_mission_v1";

// ─── Task Definitions ──────────────────────────────────────────────────────────
const TASKS = [
  {
    id: "stripe-checkout",
    tier: "blocking",
    title: "Stripe Billing Flow",
    summary: "Users cannot pay — no active checkout session.",
    why: "Without a working Stripe checkout, your trial wall has nowhere to send users. Every conversion attempt fails silently.",
    fix: [
      "Go to Vercel Dashboard → Project → Settings → Environment Variables",
      "Add: STRIPE_SECRET_KEY (sk_live_... or sk_test_...)",
      "Add: STRIPE_PRICE_SOLO, STRIPE_PRICE_OPERATOR, STRIPE_PRICE_STUDIO (price_... IDs from Stripe Dashboard)",
      "Add: APP_URL = https://usevaultiq.com",
      "Redeploy the project",
      "Test with a Stripe test card: 4242 4242 4242 4242",
    ],
  },
  {
    id: "stripe-webhook",
    tier: "blocking",
    title: "Stripe Webhook Live",
    summary: "Payments succeed but tiers never activate in Supabase.",
    why: "The webhook handler (stripe-webhook.js) writes the paid tier to Supabase user_metadata. Without it, users pay but stay on trial forever.",
    fix: [
      "In Stripe Dashboard → Developers → Webhooks → Add endpoint",
      "URL: https://usevaultiq.com/api/stripe-webhook",
      "Events to listen for: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed",
      "Copy the Signing Secret (whsec_...)",
      "Add to Vercel env: STRIPE_WEBHOOK_SECRET = whsec_...",
      "Add to Vercel env: SUPABASE_SERVICE_ROLE_KEY (from Supabase Dashboard → Settings → API)",
      "Redeploy and run a test payment — confirm tier appears in Supabase auth.users metadata",
    ],
  },
  {
    id: "supabase-auth",
    tier: "blocking",
    title: "Supabase Auth Confirmed Live",
    summary: "Login/signup must work on the production domain.",
    why: "If Supabase URL redirect allowlist doesn't include usevaultiq.com, OAuth and magic links silently fail on production.",
    fix: [
      "Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Vercel env variables",
      "In Supabase Dashboard → Auth → URL Configuration",
      "Add https://usevaultiq.com to Site URL and Redirect URLs",
      "Test: visit usevaultiq.com, create a new account, confirm email, log in",
      "Confirm session persists on page refresh",
    ],
  },
  {
    id: "domain-deployed",
    tier: "blocking",
    title: "Domain Deployed Correctly",
    summary: "usevaultiq.com must serve the built app, not raw JSX.",
    why: "If Vercel serves from the wrong root, visitors see source code instead of the app. The vercel.json fix was applied — verify it took effect.",
    fix: [
      "Confirm vercel.json exists at repo root with buildCommand and outputDirectory set",
      "In Vercel Dashboard → Project → Settings → General → Root Directory: set to thevault",
      "Trigger a new deployment",
      "Visit usevaultiq.com — confirm the app loads (not raw JSX text)",
      "Check browser console for any 404s on assets",
    ],
  },
  {
    id: "legal-pages",
    tier: "urgent",
    title: "Legal Pages Live",
    summary: "Privacy Policy, Terms of Service, and Security pages are dead links.",
    why: "Stripe requires a privacy policy and terms of service URL during account review. Dead links will get your Stripe account flagged or suspended.",
    fix: [
      "Quickest path: use Termly (termly.io) or Iubenda — generate pages in 5 min, get hosted URLs",
      "Add links in vault-landing.html footer: Privacy Policy, Terms of Service, Security",
      "Or create /privacy, /terms, /security as simple HTML pages in the public/ folder",
      "Submit URLs in Stripe Dashboard → Business Settings → Public Details",
    ],
  },
  {
    id: "payment-confirmation",
    tier: "urgent",
    title: "Payment Confirmation UX",
    summary: "After payment, users land in app with no feedback.",
    why: "Stripe redirects back with ?payment=success&tier=X in the URL. Currently nothing reads this — users think payment failed.",
    fix: [
      "In App.jsx, add a useEffect that reads window.location.search on mount",
      "If payment=success is present, show a toast: 'Welcome to VaultIQ — your [tier] plan is active'",
      "Clear the query params with window.history.replaceState after showing toast",
      "Also handle payment=cancelled with a softer message",
    ],
  },
  {
    id: "trial-server-side",
    tier: "urgent",
    title: "Trial Enforcement — Server-Side",
    summary: "Trial start date lives in localStorage — easily cleared by users.",
    why: "Any user can open DevTools, clear localStorage, and restart their 14-day trial forever. This leaks the product to unlimited non-paying users.",
    fix: [
      "In Supabase, store trial_started_at in user_metadata on first login",
      "In stripe-webhook.js or a Supabase Edge Function, set user_metadata.trial_started_at = new Date().toISOString() if not already set",
      "In VaultTrial.jsx, read daysRemaining from Supabase user_metadata instead of localStorage",
      "Keep localStorage as UI cache only — source of truth is Supabase",
    ],
  },
  {
    id: "landing-page",
    tier: "urgent",
    title: "Landing Page Accessible",
    summary: "vault-landing.html exists but may not be routed correctly.",
    why: "New visitors hitting usevaultiq.com should see the marketing landing page before the auth wall. If they see the login screen directly, conversion drops significantly.",
    fix: [
      "Option A: Keep vault-landing.html in public/ — it will be served at /vault-landing.html",
      "Option B: Move landing page content into the React app as the unauthenticated home route",
      "Option C: Deploy landing page to usevaultiq.com and app to app.usevaultiq.com (subdomain split)",
      "Verify: visit usevaultiq.com as a logged-out user — what do you see?",
    ],
  },
  {
    id: "vercel-analytics",
    tier: "important",
    title: "Vercel Analytics + Speed Insights",
    summary: "No visibility into real user behavior or page performance.",
    why: "You need to see where users drop off, which pages are slow, and whether the app is actually loading for real users — especially after launch.",
    fix: [
      "Vercel Dashboard → Project → Analytics tab → Enable Web Analytics (free)",
      "Vercel Dashboard → Project → Speed Insights tab → Enable",
      "No code changes needed — Vercel injects automatically",
      "Optionally add @vercel/analytics package for custom event tracking",
    ],
  },
  {
    id: "error-handling",
    tier: "important",
    title: "Error Handling & User Feedback",
    summary: "Auth errors, Stripe failures, and network issues are silent.",
    why: "If login fails or payment errors out, users see nothing and assume the app is broken. Silent failures destroy trust.",
    fix: [
      "In AuthView.jsx, wrap supabase.auth calls in try/catch and show error messages",
      "In VaultTrial.jsx, handle the case where the Stripe checkout URL fails to load",
      "In App.jsx, add a global error boundary or window.onerror handler",
      "Use the existing addToast function to surface errors to users",
    ],
  },
  {
    id: "post-payment-email",
    tier: "important",
    title: "Post-Payment Welcome Email",
    summary: "Users receive no email confirmation after subscribing.",
    why: "Users expect an email receipt and welcome message. Without it, many will think the payment didn't go through and contact support or chargeback.",
    fix: [
      "Option A: Use Resend (resend.com) — free tier, simple API, 5 min setup",
      "In stripe-webhook.js, after writing tier to Supabase, call Resend API to send welcome email",
      "Template: confirm plan name, link back to app, include support contact",
      "Option B: Stripe automatically sends payment receipts — enable in Stripe Dashboard → Settings → Customer emails",
    ],
  },
  {
    id: "csv-import",
    tier: "important",
    title: "CSV / Bank Import",
    summary: "Users cannot import existing transaction history.",
    why: "Without import, users must manually re-enter all past transactions. Most won't. This is the #1 onboarding drop-off point for finance apps.",
    fix: [
      "Add a CSV import button in Settings → Data tab",
      "Parse CSV with expected columns: date, description, amount, type (income/expense)",
      "Show a preview table before importing — let user map columns",
      "On confirm, bulk-insert into the txs array (or Supabase transactions table)",
      "Support common bank export formats: Chase, Wells Fargo, Mint",
    ],
  },
];

const TIER_META = {
  blocking: { label: "BLOCKING",  color: "#ff7f9f", dim: "rgba(255,127,159,0.10)", border: "rgba(255,127,159,0.25)", dot: "#ff4d6a" },
  urgent:   { label: "URGENT",    color: "#e2c983", dim: "rgba(226,201,131,0.10)", border: "rgba(226,201,131,0.22)", dot: "#e2c983" },
  important:{ label: "IMPORTANT", color: "#6B9BC0", dim: "rgba(107,155,192,0.08)", border: "rgba(107,155,192,0.20)", dot: "#6B9BC0" },
  done:     { label: "COMPLETE",  color: "#46e7a9", dim: "rgba(70,231,169,0.07)",  border: "rgba(70,231,169,0.20)",  dot: "#46e7a9" },
};

// ─── Readiness Arc SVG ─────────────────────────────────────────────────────────
function ReadinessArc({ pct }) {
  const r = 54;
  const cx = 70;
  const cy = 70;
  const circumference = Math.PI * r; // half circle
  const dash = (pct / 100) * circumference;
  const color = pct < 50 ? "#ff7f9f" : pct < 80 ? "#e2c983" : "#46e7a9";

  return (
    <svg width="140" height="82" viewBox="0 0 140 82" fill="none">
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke="rgba(107,155,192,0.12)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Fill */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        fill="none"
        style={{ filter: `drop-shadow(0 0 6px ${color}44)`, transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)" }}
      />
      {/* Center label */}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
        style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em" }}>
        {pct}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(107,155,192,0.45)"
        style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: "0.22em" }}>
        READY
      </text>
    </svg>
  );
}

// ─── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, done, onToggle, forceOpen }) {
  const [open, setOpen] = useState(forceOpen || false);
  const tier = done ? "done" : task.tier;
  const meta = TIER_META[tier];

  return (
    <div style={{
      border: `1px solid ${open ? meta.border : "rgba(107,155,192,0.08)"}`,
      background: open ? meta.dim : "rgba(107,155,192,0.02)",
      marginBottom: 1,
      transition: "all 200ms",
    }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "13px 16px", cursor: "pointer",
        }}
      >
        {/* Tier dot */}
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: done ? T.green : "transparent",
          border: `1.5px solid ${meta.dot}`,
          flexShrink: 0,
          boxShadow: done ? `0 0 6px ${T.green}88` : "none",
        }} />

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11.5, fontWeight: 400,
            color: done ? T.text3 : T.text1,
            textDecoration: done ? "line-through" : "none",
            letterSpacing: "0.03em",
          }}>
            {task.title}
          </div>
          {!open && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: T.text3, marginTop: 2, letterSpacing: "0.04em" }}>
              {task.summary}
            </div>
          )}
        </div>

        {/* Tier badge */}
        <div style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 7, letterSpacing: "0.22em",
          color: meta.color, border: `1px solid ${meta.border}`,
          padding: "2px 7px", flexShrink: 0,
          background: meta.dim,
        }}>
          {meta.label}
        </div>

        {/* Chevron */}
        <div style={{ color: T.text3, fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms", flexShrink: 0 }}>▼</div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(107,155,192,0.06)" }}>
          {/* Why */}
          <div style={{ marginTop: 14, marginBottom: 12 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: "0.26em", color: "rgba(107,155,192,0.45)", marginBottom: 6, textTransform: "uppercase" }}>
              Why This Matters
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: T.text2, lineHeight: 1.75 }}>
              {task.why}
            </div>
          </div>

          {/* Fix steps */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: "0.26em", color: "rgba(107,155,192,0.45)", marginBottom: 8, textTransform: "uppercase" }}>
              How To Fix
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {task.fix.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 8, color: meta.color, flexShrink: 0, marginTop: 2,
                    width: 16, textAlign: "right", opacity: 0.7,
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11.5, color: T.text2, lineHeight: 1.65 }}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Toggle button */}
          <button
            onClick={onToggle}
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 8, letterSpacing: "0.22em",
              padding: "8px 14px",
              background: done ? "rgba(107,155,192,0.06)" : meta.dim,
              border: `1px solid ${meta.border}`,
              color: done ? T.text3 : meta.color,
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 150ms",
            }}
          >
            {done ? "↩ Mark Incomplete" : "✓ Mark Complete"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function VaultMission() {
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  }, [completed]);

  const toggle = (id) => {
    setCompleted(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const pending = TASKS.filter(t => !completed.includes(t.id));
  const done    = TASKS.filter(t =>  completed.includes(t.id));
  const pct     = Math.round((done.length / TASKS.length) * 100);

  const blocking  = pending.filter(t => t.tier === "blocking");
  const urgent    = pending.filter(t => t.tier === "urgent");
  const important = pending.filter(t => t.tier === "important");

  const nextTask = blocking[0] ?? urgent[0] ?? important[0] ?? null;

  const tierGroups = [
    { key: "blocking",  tasks: blocking },
    { key: "urgent",    tasks: urgent },
    { key: "important", tasks: important },
  ].filter(g => g.tasks.length > 0);

  const today = new Date().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" }).toUpperCase();

  return (
    <div style={{ background: T.bg, minHeight: "100%", fontFamily: "'Space Grotesk',sans-serif" }}>

      {/* ── Intel Strip ── */}
      <div style={{
        borderBottom: "1px solid rgba(107,155,192,0.07)",
        background: "rgba(107,155,192,0.018)",
        padding: "10px 24px",
        display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <div style={{ width:4, height:4, borderRadius:"50%", background: pct >= 80 ? T.green : pct >= 50 ? T.gold : T.red }} />
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:T.text2, letterSpacing:"0.06em" }}>
            {blocking.length > 0
              ? `${blocking.length} blocker${blocking.length > 1 ? "s" : ""} preventing launch`
              : urgent.length > 0
              ? `${urgent.length} urgent item${urgent.length > 1 ? "s" : ""} before launch`
              : "No critical blockers — ready to launch"}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7.5, color:"rgba(107,155,192,0.3)", letterSpacing:"0.12em" }}>
          {today}
        </span>
      </div>

      <div style={{ padding: "24px 24px 60px" }}>

        {/* ── Command Header ── */}
        <div style={{
          background: T.surface,
          border: "1px solid rgba(107,155,192,0.10)",
          padding: "28px 32px",
          marginBottom: 1,
          display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap",
          position: "relative", overflow: "hidden",
        }}>
          {/* Top accent line */}
          <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(107,155,192,0.22),transparent)" }} />

          <ReadinessArc pct={pct} />

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, letterSpacing:"0.28em", color:"rgba(107,155,192,0.45)", marginBottom:8, textTransform:"uppercase" }}>
              Launch Readiness · VaultIQ
            </div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:20, fontWeight:500, letterSpacing:"0.08em", color:"#D4E0EA", marginBottom:12 }}>
              Mission Command
            </div>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
              {[
                { label:"Total Tasks", val: TASKS.length, color: T.text2 },
                { label:"Complete",    val: done.length,  color: T.green },
                { label:"Remaining",   val: pending.length, color: pending.length > 0 ? T.gold : T.green },
                { label:"Blocking",    val: blocking.length, color: blocking.length > 0 ? T.red : T.text3 },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, letterSpacing:"0.22em", color:"rgba(107,155,192,0.4)", marginBottom:4, textTransform:"uppercase" }}>{label}</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:22, fontWeight:500, color, letterSpacing:"-0.04em" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reset button */}
          {done.length > 0 && (
            <button
              onClick={() => { if (window.confirm("Reset all completed tasks?")) setCompleted([]); }}
              style={{ position:"absolute", top:16, right:16, fontFamily:"'JetBrains Mono',monospace", fontSize:7, letterSpacing:"0.16em", color:"rgba(107,155,192,0.25)", background:"none", border:"none", cursor:"pointer", textTransform:"uppercase", padding:"4px 8px" }}
            >
              Reset
            </button>
          )}
        </div>

        {/* ── Next Order ── */}
        {nextTask && (
          <div style={{
            background: "rgba(107,155,192,0.03)",
            border: "1px solid rgba(107,155,192,0.20)",
            boxShadow: "0 0 24px rgba(107,155,192,0.04)",
            padding: "20px 24px",
            marginBottom: 1,
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(107,155,192,0.28),transparent)" }} />
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:7, letterSpacing:"0.28em", color:"rgba(107,155,192,0.5)", marginBottom:8, textTransform:"uppercase" }}>
              ◈ Next Order
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontFamily:"'Cinzel',serif", fontSize:15, fontWeight:500, color:"#D4E0EA", marginBottom:5, letterSpacing:"0.06em" }}>
                  {nextTask.title}
                </div>
                <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:12, color:T.text2, lineHeight:1.65 }}>
                  {nextTask.summary}
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <div style={{
                  fontFamily:"'JetBrains Mono',monospace",
                  fontSize:7, letterSpacing:"0.22em",
                  color: TIER_META[nextTask.tier].color,
                  border:`1px solid ${TIER_META[nextTask.tier].border}`,
                  padding:"4px 10px",
                  background: TIER_META[nextTask.tier].dim,
                }}>
                  {TIER_META[nextTask.tier].label}
                </div>
                <button
                  onClick={() => toggle(nextTask.id)}
                  style={{
                    fontFamily:"'JetBrains Mono',monospace",
                    fontSize:8, letterSpacing:"0.22em",
                    padding:"8px 16px",
                    background:"rgba(70,231,169,0.08)",
                    border:"1px solid rgba(70,231,169,0.25)",
                    color:T.green, cursor:"pointer",
                    textTransform:"uppercase",
                    transition:"all 150ms",
                  }}
                >
                  ✓ Complete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── All Clear ── */}
        {!nextTask && done.length === TASKS.length && (
          <div style={{
            background:"rgba(70,231,169,0.04)", border:"1px solid rgba(70,231,169,0.18)",
            padding:"28px 32px", marginBottom:1, textAlign:"center",
          }}>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:18, fontWeight:500, color:T.green, letterSpacing:"0.12em", marginBottom:8 }}>
              All Systems Go
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"rgba(70,231,169,0.6)", letterSpacing:"0.08em" }}>
              Every mission item is complete. VaultIQ is launch-ready.
            </div>
          </div>
        )}

        {/* ── Tier Groups ── */}
        {tierGroups.map(({ key, tasks }) => {
          const meta = TIER_META[key];
          return (
            <div key={key} style={{ marginBottom:1 }}>
              {/* Tier header */}
              <div style={{
                padding:"10px 16px",
                background:"rgba(107,155,192,0.02)",
                border:`1px solid rgba(107,155,192,0.07)`,
                borderLeft:`3px solid ${meta.dot}`,
                display:"flex", alignItems:"center", gap:10,
                marginBottom:1,
              }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:meta.dot, boxShadow:`0 0 6px ${meta.dot}66` }} />
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:"0.28em", color:meta.color, textTransform:"uppercase" }}>
                  {meta.label}
                </span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.text3, marginLeft:4 }}>
                  · {tasks.length} item{tasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              {tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  done={false}
                  onToggle={() => toggle(task.id)}
                  forceOpen={false}
                />
              ))}
            </div>
          );
        })}

        {/* ── Completed Section ── */}
        {done.length > 0 && (
          <div style={{ marginTop:8 }}>
            <button
              onClick={() => setShowDone(s => !s)}
              style={{
                width:"100%", padding:"10px 16px",
                background:"rgba(70,231,169,0.03)",
                border:"1px solid rgba(70,231,169,0.12)",
                borderLeft:"3px solid rgba(70,231,169,0.4)",
                display:"flex", alignItems:"center", gap:10,
                cursor:"pointer", marginBottom:1,
              }}
            >
              <div style={{ width:5, height:5, borderRadius:"50%", background:T.green, boxShadow:`0 0 6px ${T.green}66` }} />
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, letterSpacing:"0.28em", color:T.green, textTransform:"uppercase" }}>
                Complete
              </span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.text3, marginLeft:4 }}>
                · {done.length} item{done.length !== 1 ? "s" : ""}
              </span>
              <div style={{ marginLeft:"auto", fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:T.text3, letterSpacing:"0.12em" }}>
                {showDone ? "HIDE" : "SHOW"}
              </div>
            </button>
            {showDone && done.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                done={true}
                onToggle={() => toggle(task.id)}
                forceOpen={false}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
