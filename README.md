# LendLoop

> Borrow what you need. Lend what you don't.

A neighborhood tool-lending board: neighbors list tools they are willing to lend, request to borrow each other's tools for a date range, and get automated notifications and reminders handled by n8n.

**Stack:** Next.js 16 (App Router) · Clerk (auth) · Convex (data + backend logic, self-hosted) · n8n (workflow automation, self-hosted) · TypeScript

> **Status: work in progress.** The data model, authorization, UI and n8n automations are done and tested. Remaining polish is listed in the [Roadmap](#roadmap).

---

## Architecture

```
                    ┌──────────────────────────┐
  Browser ─────────▶│  Next.js (localhost:3000)│
     │              │  ClerkProvider + Convex  │
     │              └────────────┬─────────────┘
     │ sign-in                   │ queries / mutations
     ▼                           │ (Clerk session token)
┌──────────┐                     ▼
│  Clerk   │  token issuer  ┌──────────────────────────────────────── Docker network ─┐
│  (SaaS)  │───────────────▶│  convex-backend :3210 / :3211   ◀──── HMAC ────▶  n8n :5678 │
└──────────┘   validated by │  convex-dashboard :6791                                   │
               Convex       └───────────────────────────────────────────────────────────┘
```

- **Next.js** renders the UI. It does no authorization of its own: `src/proxy.ts` only attaches the Clerk session to the request.
- **Clerk** handles sign-in. Its session token is sent to Convex, which validates it against the Clerk issuer configured in `convex/auth.config.ts`.
- **Convex** holds all data and **enforces every permission check** inside its functions.
- **n8n** runs the automations. Convex and n8n talk to each other over the Docker network by service name (`http://n8n:5678`, `http://convex-backend:3211`), and every call is signed with HMAC.

Convex runs **self-hosted in Docker** next to n8n, instead of on Convex Cloud. That way Convex actions can reach the local n8n webhooks without a public tunnel, and the whole project can be run locally with one `docker compose up`.

---

## Local setup

### Prerequisites

- Node.js 22+ and npm
- Docker with Docker Compose
- A free [Clerk](https://clerk.com) account
- `openssl` (to generate secrets)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure and start the infrastructure (Convex + n8n)

```bash
cp infra/convex.env.example infra/convex.env
cp infra/n8n.env.example infra/n8n.env
```

Fill in the secrets. Generate each value with `openssl rand -hex 32`:

| File | Variable | Purpose |
|---|---|---|
| `infra/convex.env` | `INSTANCE_SECRET` | Secret of the self-hosted Convex instance |
| `infra/n8n.env` | `N8N_ENCRYPTION_KEY` | Encrypts credentials stored in n8n |
| `infra/n8n.env` | `CONVEX_TO_N8N_SECRET` | HMAC secret for Convex → n8n webhooks |
| `infra/n8n.env` | `N8N_TO_CONVEX_SECRET` | HMAC secret for n8n → Convex calls |

Start everything:

```bash
docker compose up -d
```

| Service | URL |
|---|---|
| Convex API | http://127.0.0.1:3210 |
| Convex HTTP actions | http://127.0.0.1:3211 |
| Convex dashboard | http://127.0.0.1:6791 |
| n8n | http://127.0.0.1:5678 |

All ports are bound to `127.0.0.1` only, so they are not reachable from the network.

### 3. Connect the app to Convex

Generate an admin key for the local Convex backend:

```bash
docker compose exec convex-backend ./generate_admin_key.sh
```

Then create `.env.local` and paste the key into `CONVEX_SELF_HOSTED_ADMIN_KEY`:

```bash
cp .env.example .env.local
```

The same admin key logs you into the Convex dashboard.

### 4. Configure Clerk

1. Create an application in the [Clerk dashboard](https://dashboard.clerk.com).
2. In **Configure → API keys**, copy the keys into `.env.local`:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. In **Configure → Integrations**, enable **Convex**.
4. Copy the **Frontend API URL** from the API keys page (for example `https://your-app.clerk.accounts.dev`).

### 5. Set the Convex backend variables

These live in the Convex deployment, not in `.env.local`:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set N8N_WEBHOOK_BASE_URL http://n8n:5678/webhook
npx convex env set CONVEX_TO_N8N_SECRET <same value as infra/n8n.env>
npx convex env set N8N_TO_CONVEX_SECRET <same value as infra/n8n.env>
```

### 6. Import the n8n workflows

```bash
npm run n8n:import
```

This imports the three workflows in [`n8n/`](n8n/) into the n8n container and publishes them. The workflows read the HMAC secrets and the Convex URL from environment variables (`$env`), so no credentials need to be configured in n8n.

To see the workflows in the n8n editor, open http://127.0.0.1:5678 and create the owner account on first visit.

### 7. Run the app

In one terminal, push the Convex functions and watch for changes:

```bash
npx convex dev
```

In another terminal, start Next.js:

```bash
npm run dev
```

Open http://localhost:3000 and sign in. On first sign-in the app registers the user in Convex with the `user` role.

### 8. Make yourself an admin (optional)

Roles can only be changed from the server, never from the browser. Find your user ID in the Convex dashboard (`users` table), then run:

```bash
npx convex run users:setRole '{"userId":"<your user id>","role":"admin"}'
```

### Stopping

```bash
docker compose down
```

Data is kept in the `convex_data` and `n8n_data` Docker volumes.

---

## Data model

Defined in [`convex/schema.ts`](convex/schema.ts).

| Table | Fields | Notes |
|---|---|---|
| `users` | `tokenIdentifier`, `name`, `role` (`admin` \| `user`), `trustedLender` | Linked to Clerk via the token identifier. No email is stored. |
| `tools` | `ownerId`, `name`, `category`, `condition`, `description`, `removedAt?` | Soft delete keeps the loan history. |
| `loans` | `toolId`, `borrowerId`, `lenderId`, `startDate`, `endDate`, `status` | Status: `pending` → `approved` \| `declined`, then `approved` → `returned`. Dates are `YYYY-MM-DD`, inclusive. |
| `automationEvents` | `loanId`, `type`, `status`, `idempotencyKey`, `detail?` | Log of n8n activity. The idempotency key prevents duplicates on retries. |

A tool is **available** when it has no approved loan covering today.

---

## Backend functions and permissions

Every private function starts with `requireUser(ctx)` or `requireAdmin(ctx)` from [`convex/lib/auth.ts`](convex/lib/auth.ts), and then checks ownership of the specific record. The UI never decides what a user may do.

| Function | Who can call it | Rule |
|---|---|---|
| `tools.listPublic` | Anyone, no session | Returns **only name and category** of available tools |
| `tools.list` | Signed-in users | Catalog with availability and an optional category filter |
| `tools.myListings` | Signed-in users | Only your own tools |
| `tools.create` | Signed-in users | The owner is always the caller |
| `tools.update` | Owner | Others get `Forbidden` |
| `tools.remove` | Owner or admin | The owner cannot remove a tool with an approved loan; an admin can (moderation). Pending requests are declined automatically. |
| `loans.request` | Signed-in users | Not your own tool, valid dates, no overlap with approved loans, one pending request per tool |
| `loans.decide` | Lender (tool owner) | Only `pending` requests. Approving re-checks for overlaps. |
| `loans.markReturned` | Lender | Only `approved` loans |
| `loans.myRequests` / `loans.incoming` | Signed-in users | Only loans where you are the borrower or the lender |
| `loans.listAll` | Admin | All loans |
| `users.list` / `users.setTrustedLender` | Admin | Moderation |
| `users.setRole` | **Server / CLI only** | `internalMutation`: it cannot be called from the browser, so nobody can promote themselves |

These rules were tested with three simulated users (owner, borrower and admin), covering both the allowed and the forbidden paths.

---

## Automations (n8n)

Three workflows live in [`n8n/`](n8n/) as exported JSON.

### 1. Loan event notification

```
loans.request / decide / markReturned
        │  (scheduled in the same transaction, so it only fires if the change commits)
        ▼
Convex action notifyLoanEvent ──HMAC──▶ n8n webhook /lendloop-loan-event
                                            │ verify signature + timestamp
                                            ├─ invalid → 401
                                            └─ valid   → 202, notify recipient (mock: logged)
                                                          │
Convex /n8n/automation-events ◀──HMAC── signed write-back (status "sent")
```

- **Who gets notified:** the lender on `loan.requested`, and the borrower on `loan.approved`, `loan.declined` and `loan.returned`.
- **The payload is minimal:** event, loan ID, tool name, dates, the recipient's display name and Clerk user ID, and a message. No emails. To send a real email, n8n would look up the address in Clerk by user ID, so Convex never has to store it.
- **If n8n is down,** Convex retries twice with growing delays (10 s, then 40 s). After the last failure it records a `failed` event, so failures are never silent.

### 2. Daily overdue reminders

```
Schedule (09:00 America/Bogota) ──HMAC──▶ Convex /n8n/overdue-loans
                                             returns approved loans past their end date
                                             that have not been reminded today
        one item per loan → send reminder (mock: logged) → signed write-back
```

The idempotency key is `overdue:<loanId>:<date>`. If the workflow runs twice on the same day (a retry or a manual run), the second run finds nothing to send, and Convex ignores a duplicate write-back.

### 3. Error handler

Both workflows set it as their `errorWorkflow`. When a run fails (for example, after the HTTP node exhausts its 3 retries), it logs the workflow, the failed node, the error and the execution link. This is where a Slack or email alert would go in production.

### Signing protocol (both directions)

```
Body:    {"payload": "<JSON as a string>"}
Headers: X-LendLoop-Timestamp: <unix seconds>
         X-LendLoop-Signature: hex(HMAC-SHA256(secret, "<timestamp>.<payload>"))
```

- **The payload travels as a string,** so both sides sign exactly the same bytes, no matter how each one re-serializes JSON.
- **The receiver rejects** a missing or invalid signature and any timestamp more than 5 minutes off (replay protection). Signatures are compared in constant time.
- **Each direction has its own secret:** `CONVEX_TO_N8N_SECRET` and `N8N_TO_CONVEX_SECRET`.
- **n8n Code nodes are limited** to the `crypto` built-in module (`NODE_FUNCTION_ALLOW_BUILTIN=crypto`). They read secrets with `$env`, so the exported workflow JSON never contains a secret.

### What was tested

- **The Convex endpoints** reject requests with no signature, a wrong secret, a tampered payload or a stale timestamp. Valid requests succeed, and a repeated write-back returns `duplicate: true`.
- **End to end:** Convex → n8n → write-back to Convex, plus a repeated event that does not create a second record.
- **Overdue reminders:** a seeded overdue loan gets exactly one reminder across two runs.
- **Failure handling:** with Convex unreachable, the error workflow runs. With n8n stopped, Convex retries and records a `failed` event.

---

## Security and data-minimization decisions

- **Authorization lives in Convex, not in the UI.** Hiding a button is never the only protection.
- **Least data exposed.**
  - The public page receives only tool names and categories, with no owner and no IDs.
  - Signed-in users see other users' display name and Trusted Lender badge only.
  - Each side of a loan sees only what it needs.
  - Emails are never stored in Convex.
- **Roles are server-controlled.** New users always start as `user`, and `setRole` is internal.
- **Input validation.** Text is trimmed and length-limited. Categories and conditions are fixed enums. Dates must be valid `YYYY-MM-DD`, start no earlier than yesterday in UTC (to tolerate time zones behind UTC), and span at most 60 days.
- **Secrets stay out of the code.** They live in git-ignored `.env.local` and `infra/*.env` files and in Convex environment variables. Only `*.env.example` templates are committed.
- **Signed integration.** Every Convex ↔ n8n call is HMAC-signed, has a timestamp, and is checked against replays (see [Signing protocol](#signing-protocol-both-directions)). There are two secrets, one per direction, so a leak in one direction does not compromise the other.
- **Data minimization in automations.** n8n receives only display names and Clerk user IDs, never emails. Write-backs are validated with zod before anything is stored.
- **Local-only ports.** Every Docker service is published on `127.0.0.1`.
- **Pinned versions.** The Docker images (Convex and n8n) use fixed versions instead of `latest`.

---

## Project structure

```
convex/
  schema.ts          Tables, enums and indexes
  auth.config.ts     Trusts Clerk-issued tokens
  lib/auth.ts        requireUser / requireAdmin
  lib/dates.ts       Date validation and overlap checks
  lib/text.ts        Text sanitizing
  lib/hmac.ts        HMAC signing and verification for n8n
  users.ts           Registration, roles, Trusted Lender
  tools.ts           Listings
  loans.ts           Borrow requests and loans
  automations.ts     Notifications to n8n, overdue query, idempotent event log
  http.ts            Signed HTTP endpoints called by n8n
src/
  proxy.ts           Clerk middleware (Next.js 16 "proxy")
  app/               Pages: public, tools, my-listings, my-requests, incoming, admin
  components/        Shared UI, header, auth guard, forms
n8n/                 Exported workflows (no secrets)
scripts/             n8n-import.sh
infra/               Env templates for the Docker services
docker-compose.yml   Convex backend + dashboard + n8n
```

---

## Roadmap

- [x] Infrastructure: self-hosted Convex and n8n in Docker, Clerk ↔ Convex auth
- [x] Data model, role-based access control and validation in Convex
- [x] UI
  - [x] Public page
  - [x] Catalog with category filter
  - [x] My listings, My requests and Incoming requests
  - [x] Admin panel
- [x] n8n workflows
  - [x] Request notifications
  - [x] Daily overdue reminders
  - [x] HMAC signing in both directions
  - [x] Idempotent write-backs
  - [x] Error workflow
- [ ] Recent automation activity on each loan
- [ ] Automated permission tests
- [ ] Notes on what I would change for production
