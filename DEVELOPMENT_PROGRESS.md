# Development progress

## v1 — foundation
Projects and portfolios, statuses as task lists, tasks with subtasks, board / list / calendar views, milestones and roadmap, discussions, markdown docs, files, time tracking and reports, email + password accounts with owner / admin / member roles, shared invite links. Tested against local Postgres with an API pass over every handler, a clean install and production build, and a browser walkthrough of every screen.

## v2 — planning and collaboration
Task dependencies with a Blocked badge, cycle refusal and unblocked notifications. Repeating tasks (daily, weekly, fortnightly, monthly) that spawn the next copy on completion. Timeline (Gantt) and swimlane views. Notifications bell with @mentions across comments, discussions and messages. Direct and group messages. Per-project membership, so members see only the projects they are on, plus guest accounts for clients. Verified by upgrading a v1 database in place, a 34-assertion API pass and a three-person browser walkthrough.

## v3 — access, identity and chat — current
- **Five roles** — owner, admin, manager, member, guest — defined in one table (`src/server/roles.ts`) that the RPC route checks before any handler runs. Project-level checks (`access`, `manages`) sit inside the handlers. Ownership can be transferred; the owner cannot be demoted or deactivated.
- **Google sign-in** alongside email and password. The ID token is verified against Google's published keys, the OAuth state is a signed cookie, and an account is created only for the first user, an existing email, or a held invitation.
- **Invitations by email** with the role chosen up front, optional projects to join on arrival, a pending list, copyable links, revocation and a 14-day expiry. Emailed through Resend when configured; the link is always shown so an admin can send it themselves. The two shared links (team, guest) remain.
- **Chat** — a channel per project backed by the same thread as that project's Discussions, plus the existing direct and group messages, with per-channel unread counts and a Projects / Chat switcher in the sidebar.
- **Interface pass against the Nifty reference** — collapsible sidebar with the projects/chat switcher and a filter, a top bar with breadcrumb, global ⌘K search, Create menu and notifications, quick task creation from anywhere, and a full light/dark theme on CSS variables that follows the system setting and remembers the choice.

### Testing done for v3
- 55-assertion API pass across all five roles on a clean database: invitations (accept, wrong email, revoke, expiry), the full permission matrix, project visibility, chat channels and unread counts, permission-scoped search, dependencies, repeating tasks, reports, deactivation and ownership transfer.
- 11-assertion pass over the Google account logic directly against the database: no-invitation refusal, linking an existing account by email, matching a returning user by Google id, taking the role from an invitation, password-less accounts, and refusing a deactivated account.
- Google OAuth wiring checked end to end short of Google itself: the authorize URL and its parameters, the state cookie, the CSRF state mismatch, and the user-cancelled path.
- 9-assertion upgrade pass against a database created by an earlier version — existing accounts sign in, existing projects and tasks read back, new columns and tables appear.
- Browser walkthrough as owner, manager and guest, in light and dark, desktop and mobile: every screen and tab, task modal, invitation and join flow, global search, create menu, theme toggle and collapsed sidebar, with no console or page errors.
- Clean `npm ci`, type check and production build.

Not done here: deploying to Vercel, and a sign-in against real Google credentials — both need accounts only you can create.
