# LendLoop

> Borrow what you need. Lend what you don't.

A neighborhood tool-lending board: neighbors list tools they are willing to lend, request to borrow each other's tools for a date range, and get automated notifications and reminders handled by n8n.

**Stack:** Next.js 16 (App Router) · Clerk (auth) · Convex (data + backend logic, self-hosted) · n8n (workflow automation, self-hosted) · TypeScript

> **Status: work in progress.** The data model, authorization and backend functions are done and tested. The UI and the n8n workflows are next. See [Roadmap](#roadmap).

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

### 6. Run the app

In one terminal, push the Convex functions and watch for changes:

```bash
npx convex dev
```

In another terminal, start Next.js:

```bash
npm run dev
```

Open http://localhost:3000 and sign in. On first sign-in the app registers the user in Convex with the `user` role.

### 7. Make yourself an admin (optional)

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
- **Two HMAC secrets**, one per direction (Convex → n8n and n8n → Convex), so a leak in one direction does not compromise the other.
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
  users.ts           Registration, roles, Trusted Lender
  tools.ts           Listings
  loans.ts           Borrow requests and loans
src/
  proxy.ts           Clerk middleware (Next.js 16 "proxy")
  app/               Next.js App Router (UI in progress)
infra/               Env templates for the Docker services
docker-compose.yml   Convex backend + dashboard + n8n
```

---

## Roadmap

- [x] Infrastructure: self-hosted Convex and n8n in Docker, Clerk ↔ Convex auth
- [x] Data model, role-based access control and validation in Convex
- [ ] UI
  - [ ] Public page
  - [ ] Catalog with category filter
  - [ ] My listings, My requests and Incoming requests
  - [ ] Admin panel
- [ ] n8n workflows
  - [ ] Request notifications
  - [ ] Daily overdue reminders
  - [ ] HMAC signing in both directions
  - [ ] Idempotent write-backs
  - [ ] Error workflow
- [ ] Recent automation activity on each loan
- [ ] Automated permission tests
- [ ] Notes on what I would change for production
