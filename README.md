# Chroma

**AI-powered spending, organized by color — built on LOOP's sandbox APIs.**

Chroma turns a flat, confusing transaction list into color-coded **Boards** — one per project, category, or client — so individuals, students, and small businesses can see exactly where their money is going without lifting a spreadsheet.

Built for the **UNLEASH LOOP </DEV> Hackathon**.

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Core Features](#core-features)
- [Objectives](#objectives)
- [System Architecture](#system-architecture)
- [LOOP API Integration](#loop-api-integration)
- [Data Model](#data-model)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [MVP Scope](#mvp-scope-hackathon-build)
- [Hackathon Compliance Notes](#hackathon-compliance-notes)
- [Team](#team)

---

## The Problem

In Kenya's mobile-money-driven economy, individuals, students, and small business owners struggle to understand and control their finances because:

- **Money movement is fragmented** — spending happens across till numbers, paybills, and transfers with no single place pulling it together.
- **Manual tracking fails** — receipts get lost, expenses go unlogged, and by the time a statement is checked, no one remembers what the money was actually for.
- **Transactions lack context** — a record shows an amount and a number, not *what it was for* or *which part of life or work it belongs to*.
- **Existing tools don't fit real life** — budgeting apps are either too complex, too generic (one flat list), or disconnected from where the money is actually moving.

## The Solution

**Chroma** connects directly to a user's **LOOP account** and pulls their real transaction data — payments, transfers, till/paybill activity — into one feed. Instead of forcing users into rigid pre-set categories, Chroma lets them create their own **Boards** (e.g. "Rent," "Kilimani Site," "Stock Restock"), each with a color they choose. When a new transaction lands, Chroma asks one question — *which Board is this for?* — and one tap files it.

No LOOP account, no access: authentication is entirely handled through LOOP's own sandbox auth flow, so Chroma never stores raw credentials and never functions as a standalone identity system.

## Core Features

1. **LOOP-connected transaction feed** — real transaction history pulled via LOOP's sandbox Transaction/Account API.
2. **Post-transaction prompt** — new transactions (via IPN) are pushed to the user for tagging in real time.
3. **Custom color-coded Boards** — unlimited Boards, each user-named and user-colored.
4. **Board dashboard** — total spent, transaction count, date range, itemized list per Board.
5. **Budget allocation per Board** — set a limit, track a progress bar, get alerted near/over budget.
6. **Home overview** — one glance at how money is split across every Board.
7. **AI insights** — plain-language pattern analysis ("Transport is up 40% this week," "Kilimani Site is trending 15% over budget").
8. **Uncategorized alerts** — nothing pulled from LOOP goes untracked.
9. **LOOP Request to Pay / Checkout** — small businesses can invoice customers or accept payments directly, with proceeds auto-logged to a Board.

## Objectives

**Main Objective**
To design and develop Chroma, an AI-powered financial organization app built on LOOP's sandbox APIs, that automatically pulls a user's real transaction data, lets them organize it into color-coded Boards, and delivers actionable insights.

**Specific Objectives**

| # | Objective | LOOP API / Mechanism |
|---|---|---|
| 1 | Automate transaction capture | LOOP Transaction/Account API (OAuth/token auth) |
| 2 | Real-time transaction events | LOOP Instant Payment Notification (IPN) |
| 3 | In-app invoicing for businesses | LOOP Request to Pay |
| 4 | POS-style capture for shop Boards | LOOP Checkout |
| 5 | Digitize non-LOOP cash expenses | OCR receipt capture (supplementary) |
| 6 | Categorize via color-coded Boards | Chroma Board Service |
| 7 | Real-time spending visibility | Live dashboard bound to LOOP data |
| 8 | AI-driven financial insights | Insights engine over tagged transaction data |
| 9 | Budget-setting and alerts | Per-Board budget thresholds |
| 10 | Secure credential handling | Token-only auth, encrypted storage, sandbox-only |
| 11 | Clear path to production | Modular LOOP integration layer |
| 12 | LOOP account as sole access gateway | No separate Chroma login — LOOP auth required |

## System Architecture

```
        [LOOP Sandbox API]
   (Auth, Account Info, Transaction History,
    IPN, Request to Pay, Checkout)
                │
                ▼
   [Chroma Ingestion Layer] — normalizes LOOP transaction
   data (amount, timestamp, counterparty, reference, txn ID)
                │
                ▼
          [Chroma Backend]
   ┌──────────────┬──────────────┬───────────────┐
   │ Transaction  │    Board     │  AI Insights  │
   │   Service    │   Service    │    Engine     │
   └──────────────┴──────────────┴───────────────┘
                │
                ▼
          [Chroma Database]
                │
                ▼
     [Chroma App — Web / Mobile UI]
```

## LOOP API Integration

Chroma is a **read + organize layer** on top of LOOP for the MVP — it does not move money independently.

1. **Register** the app at LOOP's sandbox developer portal to obtain sandbox API credentials.
2. **Authenticate** users through LOOP's token-based OAuth flow. Chroma never stores raw LOOP credentials — only the returned access/refresh token, scoped to the connected account.
3. **Pull transactions** via LOOP's Account/Transaction endpoints on a schedule, and in real time via **IPN callbacks** where supported.
4. **Request to Pay / Checkout** (stretch feature) — small-business Boards can generate a payment request or accept a checkout payment, with the resulting transaction auto-logged.
5. **Stay sandbox-only** — no real transactions, no production deployment, per hackathon terms (clause 2.4–2.5).

## Data Model

**User**
`id, name, phone_number, user_type (student | business | individual), loop_account_ref (token, never raw credentials)`

**Transaction** *(sourced from LOOP)*
`id, user_id, loop_transaction_id, amount, timestamp, counterparty, source (till | paybill | transfer), description, board_id (nullable until tagged)`

**Board**
`id, user_id, name, color_code, budget_amount (optional), created_at`

**Insight**
`id, user_id, board_id (optional), message, generated_at, type (warning | trend | tip)`

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) / React 19 / Tailwind CSS 4 |
| Backend | Next.js route handlers (Node runtime) |
| Database | File-backed store for the hackathon build; PostgreSQL (Supabase) behind the same interface |
| Auth | LOOP sandbox OAuth (token-based) |
| AI Insights | LLM API (pattern summarization over tagged transaction data) |
| Payments | LOOP Sandbox APIs (Transaction, IPN, Request to Pay, Checkout) |

## Getting Started

```bash
# clone
git clone https://github.com/Nosh-thee-techy/chroma.git
cd chroma

# install
npm install

# set up environment variables
cp .env.example .env
# generate a session secret and paste it into JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# then fill in your own LOOP sandbox credentials — see below

# run
npm run dev            # http://localhost:3000
```

**It runs before you have LOOP credentials.** With `LOOP_CLIENT_ID` / `LOOP_API_SECRET` unset (or left as the `your_…` placeholders), Chroma starts in **seeded sandbox mode**: "Continue with LOOP" runs the same PKCE + state handshake and lands on the same callback, but the token exchange and transaction pull come from a seeded dataset instead of the live sandbox. Sign-in is still the only way in, and the demo survives a rate-limited sandbox on presentation day.

Fill in real sandbox credentials and the identical code path talks to LOOP. Set `LOOP_DEMO_MODE=false` to refuse to start without them.

### Sign-in flow

```
/                          "Continue with LOOP" — the only auth control in the app
  → /api/auth/loop/start   builds the authorize URL (PKCE S256 + CSRF state cookie)
  → LOOP authorize screen  (skipped in seeded sandbox mode)
  → /api/loop/callback     verifies state, exchanges the code, reads the account,
                           creates-or-updates the user, encrypts the token set,
                           seeds starter Boards, pulls history, mints the session
  → /dashboard             gated by middleware; no session, no page
```

There is no email, password, invite, or admin path — `upsertUserFromLoop()` is called from the callback and nowhere else, so a Chroma user cannot exist without a LOOP authorisation.

## Environment Variables

Create a `.env` file from `.env.example`. **Never commit real credentials.**

```env
# LOOP Sandbox API
LOOP_API_BASE_URL=https://sandbox.loop.co.ke/api
LOOP_CLIENT_ID=your_loop_sandbox_client_id
LOOP_API_KEY=your_loop_sandbox_api_key
LOOP_API_SECRET=your_loop_sandbox_api_secret
LOOP_IPN_CALLBACK_URL=https://your-deployed-url.com/api/loop/ipn
LOOP_REDIRECT_URI=https://your-deployed-url.com/api/loop/callback
LOOP_DEMO_MODE=auto              # auto | true | false

# Database (optional — unset uses the local file-backed store)
DATABASE_URL=

# AI Insights (optional — unset uses the deterministic rules engine)
AI_API_KEY=your_llm_api_key
AI_MODEL=claude-opus-5

# App
NEXT_PUBLIC_APP_NAME=Chroma
APP_BASE_URL=http://localhost:3000
JWT_SECRET=generate_a_random_secret
```

Two guards worth knowing about: `assertSandbox()` refuses to start sign-in against a host that doesn't look like a sandbox, and the `your_…` placeholders from `.env.example` are treated as unset rather than sent to LOOP as junk credentials.

> `.env` is git-ignored by default. Keep sandbox credentials out of commits, screenshots, and this README — see [Hackathon Compliance Notes](#hackathon-compliance-notes).

## Deploying to Vercel + Supabase

### 1. Create the database

In Supabase: **New project**, then **Project Settings → Database → Connection string → URI**. Take the **connection pooler** URI (port `6543`), not the direct `5432` one — serverless functions open many short-lived connections and the pooler is what survives that.

Put it in `.env` locally, then create the tables:

```bash
npm run db:push        # applies lib/db/schema.sql; idempotent, safe to re-run
```

You can also paste `lib/db/schema.sql` straight into the Supabase SQL editor. The schema enables row-level security with no policies on every table — Chroma connects over the pooler as `postgres`, which bypasses RLS, while Supabase's public REST API is left with no way in.

### 2. Set the environment variables in Vercel

**Project → Settings → Environment Variables.** Add each one, pick the environments it applies to, then **redeploy** — env changes don't reach existing deployments.

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase pooler URI |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `LOOP_CLIENT_ID` / `LOOP_API_KEY` / `LOOP_API_SECRET` | from the LOOP sandbox developer portal |
| `LOOP_API_BASE_URL` | `https://sandbox.loop.co.ke/api` |
| `APP_BASE_URL` | `https://your-app.vercel.app` |
| `LOOP_REDIRECT_URI` | `https://your-app.vercel.app/api/loop/callback` |
| `LOOP_IPN_CALLBACK_URL` | `https://your-app.vercel.app/api/loop/ipn` |
| `AI_API_KEY` | optional; without it insights come from the rules engine |

Or from the CLI:

```bash
vercel env add DATABASE_URL production
vercel --prod
```

Register `LOOP_REDIRECT_URI` and `LOOP_IPN_CALLBACK_URL` in the LOOP portal exactly as written. Preview deployments get a fresh URL each time, so OAuth only works on the production domain unless you register the preview URL too.

### Deployment gotchas

- **`DATABASE_URL` is not optional once deployed.** Without it the app falls back to the file-backed store, which on Vercel means Boards and tags can vanish between requests — each invocation may be a different instance.
- **Missing `JWT_SECRET`** doesn't crash the app; sign-in just fails with "Chroma couldn't complete the handshake with LOOP" and the reason in the URL. If you see that, this is usually why.
- **Tables not created** surfaces as a clear error naming `npm run db:push` rather than a raw Postgres code.
- Placeholder values (`your_…`) are read as unset, so a half-filled env leaves the app in seeded-demo mode rather than throwing.

## Project Structure

```
chroma/
├── app/
│   ├── page.tsx                       # Landing — "Continue with LOOP", nothing else
│   ├── dashboard/page.tsx             # The dashboard (server component)
│   └── api/
│       ├── auth/loop/start/           # Begins the OAuth handshake (PKCE + state)
│       ├── auth/logout/               # Drops the session and the stored tokens
│       ├── loop/callback/             # The only place a user is created
│       ├── loop/sync/                 # Manual history pull
│       ├── loop/ipn/                  # IPN webhook (HMAC-verified)
│       ├── loop/ipn/demo/             # Session-gated simulated IPN, demo mode only
│       ├── boards/[id]/               # Board CRUD
│       ├── transactions/[id]/tag/     # "Which Board is this for?"
│       └── insights/                  # Regenerate insights
├── components/
│   ├── charts/                        # Spend trend, spend-by-Board (+ table twins)
│   └── dashboard/                     # Stat tiles, filter row, Boards, feed, insights
├── lib/
│   ├── loop/                          # config, HTTP client, OAuth, transactions, IPN,
│   │                                  #   Request to Pay / Checkout, seeded dataset
│   ├── auth/                          # JWT session (edge-safe) + cookie helpers
│   ├── db/                            # File-backed store + token encryption
│   ├── services/                      # analytics, sync, suggestions, insights engine
│   └── palette.ts                     # The validated Board palette
├── middleware.ts                      # Gates /dashboard on a valid session
└── .env.example
```

## Design notes

**The Board palette is validated, not eyeballed.** Boards pick from eight fixed categorical slots, stored as a slot key rather than a hex so every mark re-steps itself for dark mode. Both modes pass the colour-blindness, lightness, chroma and contrast checks on the surfaces the app actually renders on; three light-mode slots sit below 3:1, so every chart ships direct labels and a table view rather than relying on hue. Colour follows the Board, never its rank — changing the date range re-orders the bars but never repaints them, and a ninth Board folds into a grey "Other" instead of inventing a colour.

**Money is minor units everywhere.** Amounts are integers (cents) end to end; formatting is the only place they become decimal.

**Insights can't invent numbers.** The rules engine computes every figure from the LOOP data; the model is handed those pre-formatted figures and asked only to write the sentence, with a JSON schema constraining the shape. No key, a refusal, or a network failure all fall back to the rules output, so the panel is never blank.

**Storage is one interface, two backends.** `lib/db/backend.ts` defines the contract; `lib/db/store.ts` picks the implementation at first use — Postgres when `DATABASE_URL` is set, the file-backed store under `.data/` otherwise. Nothing else in the codebase knows which is live, so local development needs no database and deployment needs no code change. LOOP token sets are encrypted with AES-256-GCM *before* they reach either backend, under a key derived from `JWT_SECRET`, so Postgres never stores a usable token; rotating the secret simply forces re-authorisation through LOOP.

A re-sync updates LOOP's facts (amount, counterparty, timestamp) and deliberately leaves `board_id` alone — the transaction belongs to LOOP, the tag belongs to the user. Deleting a Board untags its transactions via `on delete set null` rather than deleting anything LOOP sent.

## MVP Scope (Hackathon Build)

Given the hackathon timeframe, the build prioritizes:

- [x] LOOP sandbox integration pulling a user's transaction history (`/api/loop/sync`, paginated, re-sync never duplicates or clobbers a tag)
- [x] LOOP account as the sole access gateway — OAuth + PKCE, middleware-gated dashboard, no other sign-up path
- [x] Board creation (name + colour + optional budget), editable and deletable
- [x] Tagging pulled transactions to Boards, with a suggested Board based on what you filed that counterparty as last time
- [x] Board dashboard — hero total, stat tiles, spend trend, spend-by-Board, per-Board budget meters
- [x] AI insights over the tagged data, with a deterministic rules engine underneath it
- [x] A seeded **fallback demo mode** in case the sandbox is rate-limited or unavailable during presentation, plus a "Simulate payment" button that exercises the live-tagging prompt
- [x] IPN intake with HMAC signature verification
- [~] Request to Pay / Checkout — the client layer is written (`lib/loop/payments.ts`) but has no UI yet
- [ ] OCR receipt capture for non-LOOP cash expenses (stretch, not started)

## Hackathon Compliance Notes

- All API usage stays within the **LOOP sandbox environment** — no production systems, no real transactions, per hackathon Terms §2.4–2.5, §7.
- LOOP credentials are treated as confidential and personal to the team (§6.3, §12.2) — never committed, screenshotted, or shared outside the team.
- Chroma does not use LOOP's or NCBA's name, logo, or trademarked branding in its UI or marketing materials without prior written approval (§11.5). Chroma's visual identity is its own.
- AI tool use in this build is disclosed per §10 — see submission document for details on where AI assistance was used.

## Team

Built by **[Nosh-thee-techy]** for the UNLEASH LOOP </DEV> Hackathon.

| Name | Role |
|---|---|
| Eva | Development, ML/AI integration, frontend |
| _[teammate]_ | _[role]_ |

---

*Chroma is a hackathon prototype. It is not a production financial service and is not affiliated with, endorsed by, or officially connected to LOOP DFS Limited or NCBA Group beyond participation in the sandboxed hackathon.*
