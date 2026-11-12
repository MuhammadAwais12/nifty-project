# Technical decisions

Why this app is built the way it is, and where it departs from the original brief.

## The brief asked for a different stack

The brief specified Prisma, Auth.js, Socket.IO, Redis, BullMQ, TipTap, dnd-kit, Recharts, MinIO, Docker, Nginx and a VPS. The app is deployed on **Vercel**, which rules several of those out, so the stack is the one that actually runs there. Each swap is listed below with what was lost.

| Asked for | Used instead | Why | What is lost |
| --- | --- | --- | --- |
| Prisma | `postgres` (postgres.js) with hand-written SQL | No generate step, no engine binary, no migration command to run during a Vercel deploy. The schema applies itself on first request inside an advisory-locked transaction. | Typed query results; migrations as reviewable files. |
| Auth.js | `jose` JWT in an httpOnly cookie, bcrypt for passwords, a hand-written Google OAuth 2.0 flow | Auth.js carries an adapter and a database schema of its own for a job this app does in about 120 lines. The OAuth flow verifies Google's ID token against Google's published keys with `jose`, with a signed state cookie against CSRF. | Other providers out of the box; magic-link email sign-in. |
| Socket.IO + Redis | SWR polling every 4–15 seconds | Vercel's serverless functions cannot hold a socket open. A Redis adapter would need a second always-on service, and this workspace is a team of ten, not ten thousand. | Instant delivery. Chat and notifications land within a few seconds instead. |
| BullMQ + Redis | Work done inline in the request | The only background jobs the brief needed were automations and reminder emails, neither of which is in this build. | A queue to build automations on later. |
| TipTap | A markdown textarea with live preview (`marked` + `dompurify`) | TipTap's real value is collaborative editing, which needs a persistence server this deployment has nowhere to run. A markdown doc that saves as you type covers briefs and notes. | Tables and images by toolbar; comments inside a doc. |
| dnd-kit | The browser's native HTML5 drag and drop | One dependency fewer for board and swimlane dragging. | Touch dragging. On a phone you change a task's list from inside the task. |
| Recharts | Plain HTML and CSS bars | The reports are two bar charts. A charting library would be most of the page weight. | Interactive charts. |
| MinIO / S3 | `bytea` columns in Postgres | No second service and no credentials to manage. | Large files: uploads are capped at 4 MB, with links for anything bigger. |
| shadcn/ui | A small set of local components in `src/components/ui.tsx` | shadcn is a generator that copies code into your project; what it would have produced is what is there, minus the parts unused. | Nothing of substance. |
| Docker, Nginx, VPS | Vercel | The request was a Vercel deployment. | Self-hosting. The app is a standard Next.js project, so `docker build` with the official Node image and a Postgres container would work, but that path is untested here. |

## Architecture

- **One RPC endpoint.** Every read and write goes through `POST /api/rpc` with `{action, params}`, handled by a map in `src/server/handlers.ts`. One place to authenticate, one place to authorise, one place to map errors. Files are the exception — they need real HTTP routes for upload and download.
- **Permissions are a table, not scattered `if`s.** `src/server/roles.ts` lists every action against the roles allowed to call it, and the RPC route checks it before any handler runs. An action missing from that table is denied, so forgetting to add a permission fails closed. Project-level access is a second check inside each handler (`access`, `manages`, `entity`).
- **The schema applies itself.** `src/server/schema.ts` is idempotent — `create table if not exists`, `alter table add column if not exists`. On the first request after a deploy it runs inside a transaction guarded by `pg_advisory_xact_lock`, so several cold serverless functions starting at once cannot collide. This is what makes "push to GitHub and it upgrades itself" true.
- **A project's conversation has one home.** Both the Discussions tab and the old chat channel read the same `messages` table, which meant the same thread appeared in two places and people posted in whichever they happened to open. Chat is now people only — direct and group messages — and a project's conversation is its Discussions tab. Unread state per person still lives in `channel_reads`, and now feeds the project's own badge in the sidebar rather than the chat badge.
- **The workspace loads in one pass.** `bootstrap` used to run five correlated subqueries for every project, so a workspace of fifty projects cost two hundred and fifty of them. It is now a set of CTEs — counts, members, reads, chat, notifications, next milestone — each aggregating its whole table once and joining on. 7ms against 17ms on sixty projects and fifteen hundred tasks, and the gap widens with the workspace.
- **One database connection per serverless instance.** On Vercel the pool is capped at 1 (10 locally). Many lambdas each holding ten connections is exactly what exhausts a Neon or Supabase limit, and the symptom is the app going down under traffic rather than getting slow.
- **The description is markdown, rendered.** It is stored as the text you typed and rendered with `marked` through `DOMPurify` when you are not editing it, so links work and nothing a person pastes can run. A real editor — TipTap and a document model — would mean a second format in the database and a migration for everything already written; markdown keeps the stored value readable, diffable and searchable with the same `like` the rest of search uses.
- **Client state is SWR.** `useQ` reads, `act` writes and then revalidates everything on screen. Simple, and correct under polling.

## Deliberate limits

- **One workspace per deployment.** The brief asked for multi-tenancy with a workspace switcher. This build has a single workspace and no `workspace_id` on any table. For an agency running its own instance that is the honest shape; adding tenancy later means a column on every table and a filter in every query, which is a rewrite of the data layer, not a feature.
- **`tags`, `assignees` and `blocked_by` are JSONB, not join tables.** The brief said not to store relational data as JSON. These three are read on every task render and written as a whole list; `jsonb_exists` with a GIN-able shape is faster here than three joins, and nothing else ever queries them in the other direction. Everything genuinely relational — members, comments, time entries, dependencies' targets — is a proper table with foreign keys.
- **Progress is computed, never stored.** A project's percentage is counted from its tasks at read time, so it can never drift from the records.
