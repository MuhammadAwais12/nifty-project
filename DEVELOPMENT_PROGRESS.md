# Development progress

## v1 — foundation
Projects and portfolios, statuses as task lists, tasks with subtasks, board / list / calendar views, milestones and roadmap, discussions, markdown docs, files, time tracking and reports, email + password accounts with owner / admin / member roles, shared invite links. Tested against local Postgres with an API pass over every handler, a clean install and production build, and a browser walkthrough of every screen.

## v2 — planning and collaboration
Task dependencies with a Blocked badge, cycle refusal and unblocked notifications. Repeating tasks (daily, weekly, fortnightly, monthly) that spawn the next copy on completion. Timeline (Gantt) and swimlane views. Notifications bell with @mentions across comments, discussions and messages. Direct and group messages. Per-project membership, so members see only the projects they are on, plus guest accounts for clients. Verified by upgrading a v1 database in place, a 34-assertion API pass and a three-person browser walkthrough.

## v3 — access, identity and chat
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

## v4 — the task screen, images and threads
- **Task references.** Every project gets a short key (`VIS`, `PHA`) and every task a number within it, shown on cards, in the list and in the task header.
- **Rebuilt task screen**, following the Nifty layout: a header with the reference, the list it sits in, a live timer and the complete action; a field grid for assignees, tags, milestone, dates, priority and repeat; Subtasks and Attachments as tabs; and a comments-and-activity panel down the right-hand side.
- **Images and files on comments, discussion messages and project chat.** Attach them, or paste a screenshot straight into the box. They render inline and open full size in a viewer with arrow-key navigation.
- **Threaded discussions.** Reply to a message, edit or delete your own, and an admin can remove anyone's. The same editing applies to task comments.
- **Live timer.** The task header counts up while a timer is running instead of only showing a total afterwards, and the time logged on a task appears in its activity feed.
- **Mention or assign anyone.** The mention picker lists the whole workspace; choosing someone who is not on the project adds them first, if you are a manager or admin. The assignee picker does the same, and the project menu now has Manage members and Invite a client as guest.
- **People that have been invited but have not signed up** now appear on the Team page as pending rows instead of being invisible, and every teammate has a Message button that opens a direct chat.

### Testing done for v4
- 35-assertion API pass on a clean database: project keys and per-project task numbering, images on comments, permission checks on attached files, editing and deleting comments, the task activity feed, running versus closed time, threaded replies with attachments, reply notifications, edit permissions, guest replies, cascade delete, and adding a member from a mention.
- The v3 suite re-run in full (55 assertions) with no regressions.
- Upgrade pass against a v3 database: existing projects were given keys, existing tasks were numbered, and everything else read back unchanged.
- Browser walkthrough in both themes, desktop and mobile: the new task screen, the image viewer, threaded discussions with images, the mention picker, the project menu, Team and Chat — no console or page errors.
- Clean type check and production build.

## v5 — the task page, notifications, and a trim — current
- **Tasks open as their own page** at `/tasks/<id>` instead of a dialog, with a back button, the project breadcrumb and the task's reference in the header. The comments-and-activity panel now runs the full height of the window.
- **Copy link.** A button in the task header, and an entry in its menu, puts a permanent link to the task on the clipboard. Opening that link cold loads straight into the task.
- **Desktop notifications.** A person turns them on from the bell panel or from *Your profile*; their browser asks once. After that, mentions, replies, comments on their tasks, assignments, project invitations and direct messages raise a notification that opens the right screen when clicked. While a tab is open the app raises them itself; with `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set, a service worker and Web Push deliver them with the tab closed. Subscriptions are stored per device and dropped automatically when a browser discards one.
- **Direct messages reach the bell too**, with a preview of the message and a link to the conversation.
- **Dependencies and repeating tasks removed**, from the task screen, the cards, the list, the timeline and the server. The two columns stay in the schema so databases from earlier versions still load.

### Testing done for v5
- 51-assertion API pass on a clean database, covering the earlier v4 ground plus: the server ignoring dependency and repeat fields sent by hand, completing a task no longer spawning a copy, push configuration, registering and removing devices, per-person device counts, refusal of unusable subscriptions, direct-message notifications with their preview and link, and task notifications linking to the new task page.
- The role suite re-run in full (55 assertions) with no regressions, and an upgrade pass against a v4 database.
- Browser pass confirming the task opens at its own URL, that Dependency and Repeat are gone, that a copied link loads cold, that back behaves, that the bell shows the permission prompt, and that granting permission flips the profile setting to on — in both themes, desktop and mobile, with no console errors.
- Clean type check and production build.
