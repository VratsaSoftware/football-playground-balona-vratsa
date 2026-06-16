# План за имплементация — Система за резервации на футболни игрища

Стек: Next.js (App Router) + Node.js + PostgreSQL (Neon, чрез Vercel) + Prisma + NextAuth.js (Credentials) + Tailwind CSS. Деплой: Vercel free tier.

---

## 0. Setup

1. `create-next-app` (TypeScript, App Router, Tailwind, ESLint).
2. Add Prisma, connect to Neon via `DATABASE_URL` / `DIRECT_URL` (Neon needs both pooled + direct connection strings for migrations on Vercel serverless).
3. Add `prisma/schema.prisma` (already drafted) → `npx prisma migrate dev`.
4. After migration, run the raw SQL for the partial unique index (Prisma can't generate it):
   ```sql
   CREATE UNIQUE INDEX booking_field_slot_active_unique
   ON "Booking" ("fieldId", "startTime")
   WHERE status IN ('PENDING', 'CONFIRMED');
   ```
   Add this as a `prisma/migrations/.../migration.sql` manual edit, or a follow-up migration.
5. Auth.js (NextAuth v5) with Credentials provider, bcrypt for password hashing, JWT session strategy (works well with Vercel serverless — no server-side session store needed).
6. Email: Resend (generous free tier, simple API, works well on Vercel) or Nodemailer + SMTP if you already have a mailbox. Recommend Resend for v1.
7. Cron: Vercel Cron Jobs (free tier allows daily-ish schedules) hitting an internal API route — used for (a) generating future `Booking` rows from `RecurringBooking`, (b) the 7-day-ahead conflict scan.
8. Timezone: store everything in UTC in DB; render/interpret in `Europe/Sofia` in the app layer (use `date-fns-tz` or `Temporal`-polyfill-free approach with `date-fns`). This matters for DST transitions affecting "round hour" slots twice a year — flag as an edge case to test.

---

## 1. Route / page structure (App Router)

```
app/
  page.tsx                          → public calendar (both fields, no auth required)
  login/page.tsx
  register/page.tsx                  → email, password, phone (mandatory), teamName (optional)
  account/page.tsx                   → my bookings, my recurring series, edit profile

  admin/
    layout.tsx                       → guards: role === ADMIN
    page.tsx                         → dashboard: pending requests count, today's bookings, conflicts
    users/page.tsx                   → list users, toggle canBookDirectly, isActive
    bookings/page.tsx                → all bookings, filters by field/date/status
    bookings/new/page.tsx            → admin creates booking (registered user OR guest by name+phone)
    recurring/page.tsx               → manage recurring series
    fields/page.tsx                  → manage 2 fields (name, isActive)
    settings/page.tsx                → bookingHorizonDays, display hour ranges, conflictCheckDaysAhead

  api/
    auth/[...nextauth]/route.ts
    register/route.ts                → POST: create user (hash password, validate unique email+phone)

    fields/route.ts                  → GET (public)
    availability/route.ts            → GET ?from=&to=&fieldId= → public, returns slot grid w/ status

    bookings/route.ts                → GET (own/admin), POST (create — direct or request, per user.canBookDirectly)
    bookings/[id]/route.ts           → GET, PATCH (admin: approve/reject/cancel/edit), DELETE not exposed (use status)
    bookings/[id]/approve/route.ts   → POST (admin only)
    bookings/[id]/reject/route.ts    → POST (admin only)
    bookings/[id]/cancel/route.ts    → POST (admin only)

    recurring/route.ts               → GET, POST (create series)
    recurring/[id]/route.ts          → PATCH (edit/deactivate), affects future un-overridden occurrences only
    recurring/[id]/occurrences/[bookingId]/route.ts → PATCH (override single occurrence: teams, cancel just this one)

    admin/users/route.ts             → GET list
    admin/users/[id]/route.ts        → PATCH (canBookDirectly, isActive, role)
    admin/settings/route.ts          → GET, PATCH AppSettings singleton

    cron/generate-recurring/route.ts → protected by Vercel Cron secret header
    cron/check-conflicts/route.ts    → protected by Vercel Cron secret header
```

---

## 2. Core business logic modules (`lib/`)

- `lib/availability.ts`
  - `getSlotGrid(fieldIds, fromDate, toDate)` → returns per-field, per-hour grid with status: `FREE | PENDING | CONFIRMED | OUTSIDE_DEFAULT_WINDOW` (still bookable, just visually distinct since user said "all hours can be booked").
  - Pulls `AppSettings` for default display window per weekday/weekend and `bookingHorizonDays` to clamp the visible range.

- `lib/bookings.ts`
  - `createBooking(input)`:
    1. Validate slot is on the hour, within horizon, field active.
    2. Check no active (`PENDING`/`CONFIRMED`) booking exists for that field+startTime (defense in depth on top of the DB constraint — catch the unique-violation error and return a friendly Bulgarian message on race).
    3. Determine `status`/`source`: if actor is admin → `CONFIRMED`/`ADMIN_PHONE` (or `ONLINE_DIRECT` if admin books for self... edge case, treat admin bookings as `ADMIN_PHONE` always for clarity); if `user.canBookDirectly` → `CONFIRMED`/`ONLINE_DIRECT`; else → `PENDING`/`ONLINE_REQUEST`.
    4. Send appropriate email (confirmed vs pending) via `lib/email.ts`.
  - `approveBooking(id, adminId)` / `rejectBooking(id, adminId, reason)` / `cancelBooking(id, adminId)` — status transitions + email triggers + `reviewedAt`/`reviewedByAdminId` stamping.

- `lib/recurring.ts`
  - `createRecurringSeries(input)` → store template, immediately generate occurrences up to current `bookingHorizonDays`.
  - `generateUpcomingOccurrences()` (called by cron daily) → for each active series, ensure `Booking` rows exist up to `today + bookingHorizonDays`; skip dates where an active booking already exists for that field+slot that isn't already linked to this series (i.e. don't silently overwrite a manual admin booking — flag as conflict instead, see below).
  - `checkUpcomingConflicts()` (cron, e.g. daily) → for occurrences within `conflictCheckDaysAhead` days, detect: (a) series marked inactive but booking still pending generation, (b) the target slot got taken by another booking before generation ran, (c) field deactivated. On conflict: create the `Booking` with a flagged state (or skip + log) and send conflict email to admin + user via `lib/email.ts`.

- `lib/email.ts`
  - Thin wrapper around Resend, Bulgarian templates: `BOOKING_PENDING`, `BOOKING_CONFIRMED`, `BOOKING_APPROVED`, `BOOKING_REJECTED`, `BOOKING_CANCELLED`, `RECURRENCE_CONFLICT`. Logs every send to `NotificationLog`.

- `lib/auth.ts` — NextAuth config, password hashing helpers, `getCurrentUser()` server helper, `requireAdmin()` guard for API routes.

- `lib/validation.ts` — Zod schemas for all API inputs (registration, booking creation, admin updates) with Bulgarian error messages.

---

## 3. Public calendar UI (the most-used screen)

- Two-column (or tab-switchable on mobile) grid: Игрище 1 / Игрище 2 × hourly rows.
- Date navigation: prev/next day, and a date picker bounded by `[today, today + bookingHorizonDays]`.
- Default visible hour range computed client-side from `AppSettings` based on whether selected date is weekend; a toggle "Покажи всички часове" expands to full 0–23 if needed (since all hours are technically bookable).
- Slot cell states: free (clickable if logged in), pending (yellow, "В изчакване"), confirmed (red/grey, "Заето"), and if not logged in → clicking prompts login/register.
- No personal data shown publicly — just busy/free, never names or phone numbers (privacy).

## 4. Booking flow (logged-in user)

- Click free slot → modal: optional team A / team B name fields, optional note, submit.
- If `canBookDirectly` → immediate "Резервацията е потвърдена" + email.
- Else → "Заявката е изпратена за одобрение" + email, status visible in `/account` as Pending.
- Recurring request form (separate flow): day of week, start hour, field, start date, optional end date, optional default team names. Same direct/approval logic applies to the whole series (if not trusted, the series itself sits pending until admin approves — simplify: trusted-only feature for v1, OR admin approves the template once and all generated occurrences inherit `CONFIRMED`; recommend the latter to avoid weekly approval spam — confirm with you before building).

## 5. Admin panel

- Dashboard: count of pending requests, today's matches both fields, list of unresolved conflicts.
- Users: table with email, phone, teamName, toggle `canBookDirectly`, toggle `isActive`.
- Bookings: filterable table + the same calendar grid view but with names/phones visible; quick approve/reject/cancel actions; "New booking" button for phone-call entries (search existing user by phone/email, or fill guest name+phone).
- Recurring: list of series, deactivate, edit template team names, view generated occurrences with per-occurrence override option.
- Settings: form for `bookingHorizonDays`, the four default-hour fields, `conflictCheckDaysAhead`.

---

## 6. Cron jobs (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/generate-recurring", "schedule": "0 2 * * *" },
    { "path": "/api/cron/check-conflicts", "schedule": "0 3 * * *" }
  ]
}
```
Protect both routes by checking a shared secret header Vercel sends (`Authorization: Bearer ${CRON_SECRET}`).

---

## 7. Phased build order

1. **Foundation**: project scaffold, Prisma schema + migration + manual partial-index migration, seed script (2 fields, 1 admin user, AppSettings row).
2. **Auth**: register (email/phone/password/teamName, uniqueness checks), login, session, `requireAdmin` guard.
3. **Public availability**: `/api/availability`, public calendar page (read-only, no booking yet).
4. **Booking core**: create single booking (direct + pending paths), `/account` page listing own bookings, admin approve/reject/cancel.
5. **Admin user management**: list users, toggle `canBookDirectly`/`isActive`.
6. **Admin manual booking entry**: for phone-call customers (registered or guest).
7. **Recurring bookings**: template CRUD, generation logic, occurrence overrides.
8. **Email notifications**: wire up Resend across all the above transitions.
9. **Cron jobs**: recurring generation + conflict detection, deployed and tested on Vercel.
10. **Admin settings page**: horizon + default hours + conflict window, wired into availability logic.
11. **Polish**: Bulgarian copy pass, mobile responsiveness for the calendar grid, loading/error states, basic rate-limiting on register/login.
12. **Deploy**: Vercel project, Neon integration, env vars, Vercel Cron, smoke test end-to-end.

13. **About page** (`app/about/page.tsx`): static public page that explains how the platform works — no auth required. Content should cover:
    - What the platform is: an online booking system for the football pitches of Балона — Враца.
    - **Viewing bookings**: any visitor (no account needed) can open the calendar on the home page and see which slots are already taken across both fields.
    - **Making a booking**: a free account is required. The user registers with email, password, and phone number, and optionally a team name. After logging in they click any free slot, fill in optional team details, and submit — the booking is then either confirmed immediately (for trusted users) or sent for review.
    - **Cancellations and changes**: users can view and manage their own bookings from their account page (`/account`).
    - Keep the tone friendly and short (≤ 200 words). Write the copy in Bulgarian. Add a link to register and a link back to the calendar.
    - Add an entry in the site's main navigation: "За нас" pointing to `/about`.

---

## Open question before building

For recurring series approval: should the **template** require one-time admin approval (after which all generated occurrences are auto-`CONFIRMED`), or should **every generated occurrence** queue individually for non-trusted users? Recommend the former — confirm before I scaffold the recurring module.
