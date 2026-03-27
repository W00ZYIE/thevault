# FIC (Financial Intelligence Center) — System Overview (LLM Prompt)

You are assisting on a single-page React web app called **FIC** (Financial Intelligence Center). It is a high-end financial intelligence dashboard + ledger + calendar intended to track **income, expenses, and liquidity** over long time horizons (10+ years), with cent-level precision.

## Product summary

FIC is a **personal/business finance cockpit** with three core views:

- **Overview**: KPI cards + monthly/yearly charts + category breakdown + recent transactions.
- **Calendar**: a month grid that visually shows daily income/expense totals; clicking a day reveals that day’s transaction details.
- **Ledger**: a full sortable list of transactions with filters and all-time KPIs.

The app is designed as a **working demo** that can be upgraded to enterprise-grade later. For now it is **front-end only** with local persistence.

## Source of truth

- **Main implementation**: `src/App.jsx`
- **Persistence key**: `spark:v1` (intentionally kept stable so existing user data is not lost even if branding changes)

## Data model (persisted)

Stored as JSON:

```json
{
  "baseLiquidity": 6328.49,
  "txs": [
    {
      "id": "unique-string",
      "type": "income" | "expense",
      "amount": 800.53,
      "category": "Salary",
      "date": "2026-03-17",
      "description": "Optional memo"
    }
  ]
}
```

### Money precision

- All amounts are treated as **USD** and displayed with **exact cents** (2 decimal places).
- Inputs for liquidity and transaction amount are rounded/stored to **2 decimals** at commit time to reduce floating drift.

## Persistence layer

The app reads/writes to `window.storage.get(key)` and `window.storage.set(key, value)`.

- `loadData()` reads `spark:v1`, parses JSON, normalizes `amount` and `baseLiquidity` as numbers.
- `saveData()` stringifies and writes back.

If `window.storage` is unavailable in a normal browser, you can replace it with a `localStorage` adapter, but keep the same schema and key.

## Core calculations

### Time period selection

The app keeps a selected period:

- `period.m` = month index (0–11)
- `period.y` = year (e.g., 2026)

Users navigate with previous/next month controls.

### Monthly aggregates (selected period)

From `monthTxs` (transactions filtered to selected month/year):

- **Gross income**: sum of income tx amounts
- **Expenses**: sum of expense tx amounts
- **Net**: `income - expenses`
- **Break-even gap**: `expenses - income` (positive means still needed to break even)

### All-time liquidity

- **All-time net**: sum of all txs with income positive and expense negative.
- **Total liquidity**: `baseLiquidity + allTimeNet`

This value is shown in the left sidebar as the single authoritative “Total Liquidity”.

### Runway (time remaining at current burn)

Runway uses:

- `liquidity` (all-time)
- `monthlyBurn = expenses` for the **currently selected month**

If `monthlyBurn <= 0` or `liquidity <= 0`, runway is not shown (or shows `—`).

Otherwise:

1. Convert burn to seconds using an average month:
   - `SECONDS_PER_MONTH = 30.4375 * 24 * 60 * 60`
2. Convert money runway into time runway:
   - `runwaySeconds = (liquidity / monthlyBurn) * SECONDS_PER_MONTH`
3. Display runway as combined units:
   - years + months + days when large
   - months + days for mid-range (e.g., “3 mo 11 days”)
   - days/hours/minutes for small values

The runway subtitle shows the exact seconds scale for precision.

## UI behavior

### Add/Edit/Delete transaction

- Transactions are created/edited in a modal.
- A transaction is committed only if amount > 0.
- On commit, the amount is normalized to 2 decimals.
- Delete removes a transaction by id.

### Calendar view

- Calendar grid shows the selected month.
- Each day cell can show:
  - a green income pill (+$X.XX) if income occurred that day
  - a red expense pill (−$X.XX) if expenses occurred that day
- Clicking a day opens a right-hand detail panel with:
  - day net
  - day totals in/out
  - list of that day’s transactions with edit/delete
- Empty day selection provides a shortcut to add a record for that day.

### Charts

Overview includes:

- **Monthly chart**: 12 points (Jan–Dec) for the selected year, filling gaps with $0.00.
- **Yearly chart**: one bar group per year present in data (plus current year), showing income vs expenses.

## Extension guidelines (for future work)

- Keep the persisted schema stable; if schema changes, add a migration in `loadData()`.
- Avoid O(n²) operations over the full tx list; use memoized aggregates and maps.
- For very large ledgers (10+ years daily), consider table virtualization/pagination later.
- If replacing `window.storage`, ensure reads/writes remain atomic and JSON-safe.

## Quick mental model

FIC is essentially:

1. **A transaction journal** (income/expense entries with dates)
2. **A base liquidity value**
3. **Deterministic aggregates** that turn (1)+(2) into:
   - monthly net performance
   - all-time liquidity
   - runway duration
   - calendar daily totals
   - monthly/yearly visualizations

