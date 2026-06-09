# Redline Employee Portal

A simple internal portal for Redline employees:

- **Self-service signup** — employees create an account in seconds.
- **Admin approval** — new accounts sit in *pending* until an admin approves or denies them.
- **Office-day scheduling** — approved employees mark which days they're in on a shared calendar and see who else is in.

It's a **static web app** (plain HTML/CSS/JS, no build step) that talks directly to **Supabase** (Auth + Postgres). There's no server to run — it's hosted on **Vercel** and all security is enforced by Postgres Row Level Security.

**Live URL:** https://employee-portal-indol.vercel.app

```
Browser  ──>  Supabase (Auth + Postgres, protected by RLS)
   ▲
Vercel serves the static files
```

---

## One-time setup (2 steps)

### 1. Apply the database schema
Open the SQL editor, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**:

👉 https://supabase.com/dashboard/project/dhvgqwrazdykkgszlhlr/sql/new

This creates the tables, the auto-profile trigger (which makes **alexrogul@gmail.com** an admin automatically), and the security policies.

### 2. Turn off email confirmation (recommended)
So signup is instant (admin approval is the real gate anyway):

👉 https://supabase.com/dashboard/project/dhvgqwrazdykkgszlhlr/auth/providers → **Email** → turn **Confirm email** off → Save.

*(If you leave it on, new users must click an email link before they can sign in.)*

That's it. **Open the live URL and create your account with `alexrogul@gmail.com`** — you'll land straight in the admin dashboard.

---

## Using it

**You (admin):** sign up / sign in with `alexrogul@gmail.com` → **Admin dashboard**. Approve or deny pending requests, revoke access, or promote someone to admin. Hit **My schedule** to use the calendar yourself.

**Employees:** create an account → see *"awaiting approval"* → once you approve them, they sign in and get the **calendar**. They click any current/future day to toggle whether they're in the office; each day shows who else is in.

---

## Changing the admin email

Edit `admin_email` inside the `handle_new_user()` function in `supabase/schema.sql` and re-run it. To promote an account that already exists, run:

```sql
update public.profiles set role = 'admin', status = 'approved' where email = 'someone@redline.com';
```

---

## Project structure

```
.
├── index.html          # app shell
├── config.js           # public Supabase URL + anon key
├── styles.css          # Redline theme
├── app.js              # the whole app: auth, approval, calendar, admin
├── vercel.json         # tells Vercel to serve the folder as a static site
├── supabase/schema.sql # run this once in the Supabase SQL editor
└── README.md
```

## Notes

- **The anon key in `config.js` is meant to be public** — it only allows what the RLS policies permit. The secret `service_role` key is **not** used anywhere in this app.
- If you ever exposed your `service_role` key, rotate it (Supabase → Settings → API). This app doesn't need it.
- **Deploys are automatic:** pushing to the repo's default branch redeploys the Vercel site.
- **Preview locally (optional, for devs):** any static server works, e.g. `npx serve` in the project root, then open the printed URL. (Opening `index.html` via `file://` won't work because it loads modules over the network.)
