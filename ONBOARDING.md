# Portelo — Project Memory

## What is this
Multi-tenant resident billing portal built on Cloudflare Workers + D1 + R2.
Two property management groups, four buildings total. Residents log in with apartment number + PIN and see their monthly bills.

**Live URL:** https://portelo.nenad-mitosevic.workers.dev  
**GitHub:** https://github.com/nenadmitosevic-prog/portelo  
**Deploy:** `npm run deploy` (from `/Users/nenadmitosevic/Portelo`)

---

## Infrastructure

| Service | Name | ID / binding |
|---|---|---|
| Cloudflare Worker | portelo | `src/worker.js` entry point |
| D1 Database | portelo-db | `a8c06eee-4a69-423b-8c07-01cdeb8ef9bb`, binding `DB` |
| R2 Bucket | portelo-bills | binding `BILLS_BUCKET` |
| Workers Sites | static frontend | `./pages` bucket, binding `__STATIC_CONTENT` |
| Secrets | `SESSION_SECRET`, `ANTHROPIC_API_KEY` | set via wrangler |

---

## Buildings

| ID | Name | Group | Type | Residents | Bills |
|---|---|---|---|---|---|
| `bv` | Baba Višnjina | Green Comfort Energy | direct_billing | 24 | Aug 2025 – May 2026 |
| `ku` | Kursulina | Green Comfort Energy | direct_billing | 26 | Aug 2025 – May 2026 |
| `zh` | Zen Hill | C&H Solutions | direct_billing | 72 | Apr 2026 only |
| `kv` | Kovačeva | C&H Solutions | direct_billing | 11 | Apr 2026 only |

All four are `direct_billing` type and share the same `ch-solutions` module backend.  
GCE group accent color: `#1e7f54` (green). C&H group accent color: `#2c5f8a` (blue).

---

## Two dashboard types

### C&H dashboard (`/resident/ch-dashboard.html`)
- Used by: `zh` (Zen Hill), `kv` (Kovačeva)
- API: `GET /api/resident/dashboard/ch`
- Shows: KPIs (current bill, outstanding debt, last payment), bill line items, payment history table, electricity chart
- Bills have simple line_items array: `[{"label":"Grejanje (SA PDV)","amount":9653.89}]`

### GCE dashboard (`/resident/gce-resident-dashboard.html`)
- Used by: `bv` (Baba Višnjina), `ku` (Kursulina)
- API: `GET /api/resident/dashboard/gce-resident`
- Shows: notice banner (not official Infostan bill), 4-component net breakdown, anonymized comparison scale, monthly kWh history bars
- Bills have rich line_items object (see below)
- Commercial units (`Lokal*`) do NOT get the comparison section

#### GCE line_items JSON structure
```json
{
  "service_type": "Grejanje",
  "vat_rate": 10,
  "period_from": "2026-03-01",
  "period_to": "2026-03-31",
  "consumption_kwh": 944.0,
  "capacity_kw": 13.495,
  "own_variable_net": 10506.72,
  "own_fixed_net": 3476.85,
  "shared_variable_net": 3158.58,
  "shared_fixed_net": 760.04,
  "net_total": 17902.19,
  "vat_total": 1790.22
}
```
- Service 8 / 72 = energy (kWh). Services 72/73 = summer cooling (VAT 20%). Services 8/44 = heating (VAT 10%).
- `total_amount` in bills table = `net_total + vat_total` (gross)

---

## Auth

- **Resident login:** building_id + apartment_ref + PIN → session cookie (HttpOnly, 7-day TTL)
- **PIN hashing:** bcryptjs cost 10. Default PIN for all seeded residents: `1234`
- **Master PIN:** `190823` — works for any resident on any building (for admin support/inspection). Set in `core/auth/pin.js`
- **Admin login:** email + bcrypt password → separate session
- **Rate limiting:** 5 attempts / 15 min, stored in D1 `rate_limits` table
- **Redirect after login:** auth routes return `{ redirect: /resident/${building_id}/dashboard }`

---

## URL routing (worker.js)

```
PAGE_MAP:
  /                          → /index.html
  /login                     → /login.html
  /admin/login               → /admin/login.html
  /admin/dashboard           → /admin/dashboard.html
  /resident/zh/dashboard     → /resident/ch-dashboard.html
  /resident/kv/dashboard     → /resident/ch-dashboard.html
  /resident/bv/dashboard     → /resident/gce-resident-dashboard.html
  /resident/ku/dashboard     → /resident/gce-resident-dashboard.html

API routing:
  /api/auth/*                         → core/auth/routes.js
  /api/resident/bills*                → ch-solutions/routes.js
  /api/resident/dashboard/ch          → ch-solutions/routes.js
  /api/resident/dashboard/gce-resident → ch-solutions/routes.js
  /api/admin/buildings/{bv,ku,zh,kv}/* → ch-solutions/routes.js
  /api/admin/*                        → inline in worker.js (buildings list, me)
```

`DIRECT_BILLING_IDS = ['zh', 'kv', 'bv', 'ku']` — drives both admin routing and resident session validation.

---

## Frontend pages

| File | Purpose |
|---|---|
| `pages/index.html` | Landing — two group cards (GCE, C&H), each expands to sub-building selection |
| `pages/login.html` | Login — building-aware, reads `?building=bv/ku/zh/kv` from URL |
| `pages/admin/login.html` | Admin login |
| `pages/admin/dashboard.html` | Admin — 4 tabs (Baba Višnjina, Kursulina, Zen Hill, Kovačeva), bills table, Excel import, PDF upload |
| `pages/resident/ch-dashboard.html` | C&H resident view |
| `pages/resident/gce-resident-dashboard.html` | GCE resident view |
| `pages/css/styles.css` | Shared design tokens and component styles |

---

## Key files

```
src/worker.js                          Entry point, routing
core/auth/pin.js                       PIN verify, rate limit, MASTER_PIN
core/auth/routes.js                    /api/auth/* endpoints
core/auth/session.js                   Session create/validate/delete
core/router.js                         URLPattern-based router
modules/ch-solutions/routes.js         All resident + admin API routes (generic :bid)
modules/ch-solutions/billing.js        Bill queries, KPI aggregation, Excel import
shared/db/index.js                     queryOne / query / run helpers
shared/utils/index.js                  json(), error(), generateId(), currentPeriod()
shared/pdf-parser/extract.js           Claude Haiku electricity PDF extraction
```

---

## Admin dashboard

Superadmin sees all 4 building tabs. Building admins see only their building.  
All tabs share one generic "direct billing" panel — bills table, Excel import, electricity PDF upload.

**Excel import format:** `NalogZaNaplatu` (same format used by both GCE and C&H Excel files).  
The `parseChExcel` function in `billing.js` handles the column layout.  
GCE Excel files use service IDs 8/44 (heating) and 72/73 (cooling) — both accepted.

---

## Migrations (all applied to remote D1)

| File | What |
|---|---|
| 001_schema.sql | Full schema — buildings, residents, bills, sessions, rate_limits, import_logs, electricity_bills |
| 002_seed.sql | Initial seed (placeholder data) |
| 003_ch_residents.sql | Early C&H residents (superseded) |
| 004_ch_bills_2604.sql | Early C&H bills (superseded) |
| 005_replace_ch_buildings.sql | Delete old `ch` building, insert `zh` + `kv` |
| 006_zh_kv_residents_bills.sql | 83 residents + Apr 2026 bills for zh/kv |
| 007_gce_buildings.sql | Delete old `gce` building, insert `bv` + `ku` + 50 residents + 494 bills (simple format) |
| 008_gce_rich_bills.sql | Replace bv/ku bills with full GCE breakdown (own/shared variable/fixed, dates, VAT) |

---

## What's pending / next steps

- **C&H historical data:** zh/kv only have April 2026. More months from C&H Solutions Excel files needed.
- **GCE missing months:** March 2025 and July 2025 Excel files were never provided. Jan/Feb 2026 were added.
- **Admin "mark paid" flow:** works for direct billing. Payment tracking (paid_amount, paid_at) not yet surfaced in resident dashboard.
- **Electricity PDFs:** R2 bucket exists, upload endpoint works, but no PDFs uploaded yet for any building.
- **Admin user accounts:** `scripts/setup-admin.js` exists but no admin accounts have been created yet (needs `wrangler d1 execute` with the script or manual SQL).
- **GCE May 2026:** The 2605 file is imported but `latest_month` logic in GCE dashboard always shows the newest period — verify May 2026 data looks correct.
- **modules/gce/** directory still exists but is completely unused — safe to delete.
- **`shared/ui/styles.css`** is a duplicate of `pages/css/styles.css` — safe to delete.
