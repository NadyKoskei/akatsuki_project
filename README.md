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
| Frontend | Next.js / React |
| Backend | Node.js (Express) |
| Database | PostgreSQL (Supabase) |
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
# then fill in your own LOOP sandbox credentials — see below

# run
npm run dev
```

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

# Database
DATABASE_URL=your_postgres_connection_string

# AI Insights
AI_API_KEY=your_llm_api_key

# App
NEXT_PUBLIC_APP_NAME=Chroma
JWT_SECRET=generate_a_random_secret
```

> `.env` is git-ignored by default. Keep sandbox credentials out of commits, screenshots, and this README — see [Hackathon Compliance Notes](#hackathon-compliance-notes).

## Project Structure

```
chroma/
├── app/                    # Next.js app router pages
│   ├── dashboard/
│   ├── boards/
│   └── onboarding/
├── components/             # UI components (Board cards, palette, charts)
├── lib/
│   ├── loop/                # LOOP API client, auth, IPN handler
│   ├── ai/                  # Insights engine
│   └── db/                  # DB client + queries
├── server/
│   └── routes/               # API routes (boards, transactions, insights)
├── .env.example
└── README.md
```

## MVP Scope (Hackathon Build)

Given the hackathon timeframe, the build prioritizes:

- LOOP sandbox integration pulling a demo user's real transaction history
- Board creation (name + color)
- Tagging pulled transactions to Boards
- Board dashboard (total, list, budget bar)
- One AI insight (weekly summary over tagged data)
- A seeded **fallback demo mode** in case the sandbox is rate-limited or unavailable during presentation

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
