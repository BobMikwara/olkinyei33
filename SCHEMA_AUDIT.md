# Schema Consistency Audit

Comparison of `public.*` tables against the TypeScript models, queries, forms,
and services. Findings are ordered by severity, with the fix applied.

---

## 1. Role model split-brain — FIXED (breaking without migration)

**Before:** two vocabularies bridged by a lossy translation table in
`src/admin/auth.ts`.

| Database (`profiles.role`) | Frontend `Role` |
| -------------------------- | --------------- |
| `root_super_admin`         | `root`          |
| `reservation_manager`      | `booking_manager` |
| `marketing`                | `marketing_manager` |
| `editor`                   | collapsed into `content_manager` |

`editor` had no frontend equivalent and silently inherited full
`content_manager` rights — a privilege-escalation footgun.

**After:** one vocabulary in both layers.

```
root · super_admin · content_manager · booking_manager · marketing_manager · finance
```

- `supabase/role_canonicalization.sql` migrates existing rows, rewrites the
  CHECK constraint, and rebuilds `is_root_admin` / `is_super_admin` /
  `is_booking_staff` / `is_staff` plus the root-protection triggers.
- `dbRoleToCms()` / `cmsRoleToDb()` deleted. `DbRole` is now an alias of `Role`.
- `normalizeRole()` remains as the single narrowing helper for untrusted input.

**Action required:** run `supabase/role_canonicalization.sql` before deploying.

---

## 2. Duplicated role/status literals — FIXED

Role strings were hard-coded in `types.ts`, `auth.ts`, `store.ts`, and the
`<Select>` in `modules/Combined.tsx`. Adding a role required four edits.

Introduced `src/admin/constants.ts` as the single source of truth:

| Export | Mirrors |
| ------ | ------- |
| `ROLES`, `ASSIGNABLE_ROLES` | `profiles_role_check` |
| `ROLE_LABELS`, `ROLE_DESCRIPTIONS` | UI copy |
| `PROFILE_STATUSES` | `profiles_status_check` |
| `BOOKING_STATUSES` | `bookings.status` CHECK |
| `BLOG_CATEGORIES` | `blog_posts_category_check` |
| `TABLES` | table names used by the client |
| `API_ROUTES` | privileged serverless endpoints |

The role picker now renders from `ASSIGNABLE_ROLES`, so the UI cannot drift
from the database again.

---

## 3. Dead credential fields on `AdminUser` — FIXED

`passwordHash`, `passwordSalt`, `passwordIterations`, `passwordAlgo`,
`failedLoginAttempts`, `lockedUntil` were left over from the removed PBKDF2
system. **No such columns exist in `public.profiles`** — they were written to
localStorage and never read meaningfully. Supabase Auth owns credentials.

Removed from the model and from every construction site. `updateUser()` no
longer needs to strip them.

---

## 4. Orphaned token types — FIXED

`InvitationToken` and `PasswordResetToken` survived the migration to Supabase
Auth-issued links. Zero references, no backing tables. Deleted.

---

## 5. `audit_logs` shape divergence — DOCUMENTED (intentional)

| Database column | Local `AuditEntry` field |
| --------------- | ------------------------ |
| `user_id`       | `actorId`                |
| `target_id`     | `targetId`               |
| `ip_address`    | `ip`                     |
| `browser`       | `userAgent`              |
| `created_at`    | `timestamp`              |
| —               | `actorEmail` (client-only) |

These are deliberately two models: `AuditEntry` describes the in-memory list
rendered in the CMS, while the database write path in `writeAudit()` maps to
real column names. The type now documents this so it is not mistaken for a
row model. No code references a non-existent column.

---

## 6. Dead file and unused dependencies — PARTIALLY FIXED

- **Deleted** `src/utils/cn.ts` — zero imports (scaffold leftover).
- **Still declared but unreferenced** in `package.json`:
  - `clsx` — only consumer was `cn.ts`
  - `tailwind-merge` — only consumer was `cn.ts`
  - `@studio-freight/lenis` — deprecated; the app imports `lenis`

  Remove with:

  ```bash
  npm uninstall clsx tailwind-merge @studio-freight/lenis
  ```

  Left for you to run so the lockfile is regenerated in your environment
  rather than hand-edited.

---

## 7. Pages and Safari package images — AUDITED AND NORMALIZED

- The repository schema contained **no `public.pages` table**. Pages were one
  JSON array under `cms_content.id = 'pages'`. `pages_sync.sql` migrates each
  object into `public.pages`, then removes that legacy document. This is a
  migration of the existing page system, not a parallel hardcoded system.
- The repository already contained `packages.gallery jsonb` and the global
  `gallery` table has no package foreign key. Creating a relationship table
  would duplicate the package gallery, so the existing JSONB array is extended
  to ordered image records. Legacy URL strings and `hero_image` are preserved.
- Database names remain snake_case. The only camelCase names are explicit
  TypeScript mappings in `store.ts`.
- The existing `expedition-media` bucket is reused; no bucket and no
  service-role browser credential were introduced.

---

## 8. Verified consistent (no action)

| Area | Result |
| ---- | ------ |
| `bookings` | `toRow` / `fromRow` in `src/lib/supabase.ts` map every column exactly (`customer_name`, `special_requests`, `payment_preference`, `start_date`, `end_date`). No phantom fields. |
| `blog_posts` | `blogPostToRow` / `blogPostFromRow` cover all columns; ordering uses `published_at`, which exists in every schema version. |
| `pages` | `pageFromRow` / `pageToRow` map every snake-case column. Slugs are lowercase/unique, statuses are exactly `draft`, `published`, or `archived`, and public RLS exposes only published rows. |
| `cms_content` | One fixed `site_settings` document. The legacy `pages` JSON document is migrated and removed by `pages_sync.sql`, eliminating the duplicate page store. |
| `packages.gallery` | Existing JSONB gallery reused (no `package_images` duplicate). Entries map through `packageImageFromValue` as `id`, `image_url`, `alt_text`, `caption`, and `sort_order`; `hero_image` remains the sole primary image. |
| `profiles` | `ProfileRow` matches the table 1:1 after the role fix. |
| Storage buckets | Only the existing `expedition-media` bucket is referenced. Authenticated content roles upload; public visitors read. |
| RPC calls | None. All privileged work goes through `/api/*` serverless functions. |
| Environment variables | Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in frontend code; `process.env` appears exclusively in `api/*` (server-side, correct). |
| Console logging | Content-load failures for Pages, Packages, Blog, and privileged APIs emit actionable production diagnostics. No diagnostic logs credentials or row content. |

---

## Migration order

```
1. supabase/schema.sql
2. supabase/auth_schema_sync.sql
3. supabase/role_canonicalization.sql   ← new, required
4. supabase/cms_content.sql             ← global site settings only
5. supabase/pages_sync.sql               ← normalized Pages + legacy JSON migration
6. supabase/packages_sync.sql            ← Packages + ordered gallery migration + Storage RLS
7. supabase/blog_posts_sync.sql
8. supabase/bookings_hardening.sql
```

Verification query — must return zero rows:

```sql
select email, role, status from public.profiles
where role not in ('root','super_admin','content_manager','booking_manager','marketing_manager','finance')
   or status not in ('active','pending','suspended','deleted');
```
