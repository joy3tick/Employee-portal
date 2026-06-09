# Redline Employee Portal

A simple internal portal for Redline employees:

- **Self-service signup** — employees create an account in seconds.
- **Admin approval** — new accounts sit in *pending* until you (the admin) approve or deny them.
- **Office-day scheduling** — approved employees mark which days they're in the office on a shared calendar and see who else is in.

**Stack:** Node.js + Express (a thin API + static frontend) in front of **Supabase** (Auth + Postgres). The browser talks only to the Express server; Express talks to Supabase using the service-role key for privileged actions and the anon key to verify logins.

```
Browser ──> Express API ──> Supabase (Auth + Postgres)
            (sessions,        (users, profiles,
             approval logic)   office_days)
```

---

## Prerequisites

- **Node.js 20+**
- A free **[Supabase](https://supabase.com)** account

---

## Setup

### 1. Create a Supabase project

In the [Supabase dashboard](https://supabase.com/dashboard): **New project**. Pick a name, a database password, and a region. Wait ~1 minute for it to provision.

### 2. Apply the database schema

In your project: **SQL Editor → New query**. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, paste the whole file in, and click **Run**. This creates the `profiles` and `office_days` tables, the auto-profile trigger, and Row Level Security policies. (It's safe to re-run.)

### 3. Grab your API keys

In your project: **Project Settings → API**. You'll need three values:

| Value | Where | Used for |
| --- | --- | --- |
| **Project URL** | "Project URL" | base URL |
| **anon public** key | "Project API keys" | verifying login passwords |
| **service_role** key | "Project API keys" (click to reveal) | privileged DB access — **keep secret** |

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from step 3.
- `SESSION_SECRET` — a long random string. Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` — your first admin account. It's created automatically on first launch.

> The `.env` file is gitignored. **Never commit your real keys**, especially the `service_role` key.

### 5. Install and run

```bash
npm install
npm start          # or: npm run dev  (auto-restart on file changes)
```

Open **http://localhost:3000**.

On first launch the server creates your admin account from `ADMIN_*`. Sign in with those credentials, and **change the admin password** soon (sign up isn't needed for the admin — it already exists).

---

## How it works / using it

**As an employee**

1. Go to the portal, click **Create account**, enter name + email + password.
2. You'll see *"awaiting admin approval."* You can't schedule anything yet.
3. Once an admin approves you, sign in and you're taken to the **calendar**.
4. Click any current/future day to toggle whether you're in the office. Your days are highlighted; each day shows who else is in.

**As the admin**

1. Sign in → you land on the **Admin dashboard**.
2. **Pending approvals** lists new requests — **Approve** or **Deny** each.
3. **All employees** shows everyone; you can revoke access or promote someone to admin.
4. Your own schedule lives under **My schedule** (top right).

### The approval gate

A pending or denied user *can* authenticate (the password is correct) but the server refuses to start a session for them and the API blocks every scheduling action. Approval is enforced on the server, and RLS in Postgres backs it up as a second layer.

---

## Project structure

```
.
├── public/                # Static frontend (vanilla JS, no build step)
│   ├── index.html         #   sign in / create account
│   ├── portal.html        #   employee scheduling calendar
│   ├── admin.html         #   admin dashboard
│   ├── css/styles.css
│   └── js/{api,auth,portal,admin}.js
├── src/
│   ├── server.js          # Express app: sessions, routes, static, errors
│   ├── config.js          # env loading + validation
│   ├── supabaseClients.js # admin (service-role) + auth (anon) clients
│   ├── seedAdmin.js        # bootstraps the first admin on startup
│   ├── middleware/auth.js  # loadProfile / requireAuth / requireApproved / requireAdmin
│   └── routes/{auth,admin,officeDays}.js
├── supabase/schema.sql     # run this in the Supabase SQL editor
├── .env.example
└── package.json
```

---

## Security notes

- **Service-role key** is fully privileged — it lives only in `.env` / server env, never in the browser.
- **Sessions** are signed HTTP-only cookies (`sameSite=lax`). In production set `NODE_ENV=production` (enables Secure cookies) and a strong `SESSION_SECRET`, and serve over HTTPS.
- Passwords are hashed by Supabase Auth (we never store or see them).
- **Session store:** the default in-memory store is used, so a server restart logs everyone out. Fine for a small team; swap in a persistent store (e.g. Postgres-backed) before scaling out to multiple instances.
- **Future hardening:** add CSRF tokens and rate limiting on the auth endpoints if you expose this publicly.

## Deploying

Any Node host works (Render, Railway, Fly.io, a VM, etc.). Set the same environment variables there, set `NODE_ENV=production`, and put it behind HTTPS. Supabase is already hosted, so no separate database to run.

## Troubleshooting

- **"Server is not configured with Supabase yet"** — your `.env` is missing a Supabase key. Check the three `SUPABASE_*` values.
- **Login fails for a brand-new user** — they're probably still *pending*; approve them in the admin dashboard.
- **`[seed] Could not query profiles`** on startup — you haven't applied `supabase/schema.sql` yet (step 2).
