# Redline Employee Portal

A simple internal portal for Redline employees:

- **Self-service signup** — employees create an account in seconds.
- **Admin approval** — new accounts sit in *pending* until an admin approves or denies them.
- **Office-day scheduling** — approved employees mark which days they're **in the office, working remote, on vacation, or off sick** on a shared calendar and see who else is around. In-office and remote days can carry working hours. Drag across days (press-and-hold first on a phone) to book several at once. Regular employees can only edit today and future days.
- **Admin backfill of past days** — admins can log office days **that have already passed** (with hours), for **themselves or anyone**. From the Schedule, hit **Log past day** (or click a past day → **Log this day**) and pick the person, date, and hours; you can also add/edit any specific day from a user's profile. Everyone else stays locked out of the past — this is admin-only.
- **Events & off-sites (admin)** — admins drop company **events, off-sites, holidays, and socials** onto the shared calendar (single- or multi-day, all-day or timed, with an optional location). Everyone sees them on the schedule and in the day panel.
- **Profile pictures** — everyone can upload their own photo; admins can set one for any employee.
- **Per-employee insights (admin)** — open any user to see days this week/month/all-time, hours this month/all-time, and weekly averages, then add or edit the hours on any specific day.
- **Weekly performance reviews** — admins rate each employee 1–10 with a note, once per week (any time during the week). A **Reviews** page shows every employee's status for a chosen week, and each employee's profile keeps their full review history. **Employees see their own reviews** (rating + note) on their dashboard as soon as you post them — but can't see anyone else's or edit their own.
- **Task board (Trello-style)** — a shared Kanban with four columns: **Inbound → In progress → Awaiting review → Completed**. **Only admins create, assign, and edit cards** (title, details, assignee, optional **due date** — overdue cards flag red — and colored **labels** like *Urgent* / *Blocked* / *Design*); employees can't add or change them. Employees drag the work assigned to them through the first three columns (or use the ◀ ▶ buttons on touch), and can **drag to reorder** cards within a column. They can open any card read-only — including **expanding it inline** (chevron) to read the full task. Crucially, **only an admin can move a card into _Completed_** — employees push their work to *Awaiting review* and see a "⏳ Admin sign-off" tag until an admin hits **✓ Complete**. Once completed, the **assignee or an admin can delete** the card — or just leave it.
  - **Filters** — narrow the board by **assignee**, **label**, or **due date** (overdue / due today / this week / none), on top of the Everyone / Just me toggle.
  - **Checklists** — admins break a card into sub-tasks; the **assignee ticks them off** (a progress bar + *3/5* badge show on the card face), but only admins add, rename, or remove items.
  - **Comments** — everyone can discuss a card in a thread (you can delete your own; admins can delete any).
  - **Attachments** — anyone (employees included) can attach files to a card, **up to 10 per card** (images preview as thumbnails); the uploader or an admin can remove them, and a 📎 count shows on the card face.
  
  The whole board is visible to everyone, and your dashboard shows a per-stage count of your own cards.

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

This creates the tables, the auto-profile trigger (which makes **alexrogul@gmail.com** an admin automatically), the `avatars` storage bucket, and the security policies.

> **Updating a project that's already LIVE?** Don't re-run the whole `schema.sql` on a site people are using — it rebuilds the `profiles`/`office_days` login & schedule policies and briefly locks those tables, which can hang the live app on "Loading…" while it runs. Instead, run the **small, isolated migration** for the feature you're adding, which only adds the new objects and never touches login/schedule. For the board's **labels, card ordering, checklists, comments, and attachments**, that's [`supabase/board_update.sql`](supabase/board_update.sql) — paste and **Run** that one (it's idempotent, so it's safe even if you ran an earlier version). (Re-running the full `schema.sql` is fine on a fresh/idle project.)

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
├── app.js              # the whole app: auth, approval, calendar, reviews, tasks, admin
├── assets/logo.png     # Redline logo — favicon + in-app branding
├── vercel.json         # tells Vercel to serve the folder as a static site
├── supabase/schema.sql # run this once in the Supabase SQL editor
└── README.md
```

## Notes

- **The anon key in `config.js` is meant to be public** — it only allows what the RLS policies permit. The secret `service_role` key is **not** used anywhere in this app.
- If you ever exposed your `service_role` key, rotate it (Supabase → Settings → API). This app doesn't need it.
- **Deploys are automatic:** pushing to the repo's default branch redeploys the Vercel site.
- **Preview locally (optional, for devs):** any static server works, e.g. `npx serve` in the project root, then open the printed URL. (Opening `index.html` via `file://` won't work because it loads modules over the network.)
