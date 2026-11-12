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

## v5 — the task page, notifications, and a trim
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

## v6 — the task panel and portfolios
- **A task opens as a panel** sliding over the board from the right, with a strip of what you were doing still visible on the left, instead of taking the whole window. It lives at `?task=<id>` on the current screen, so Escape, Back or the backdrop closes it and leaves you where you were. The expand button and any shared link still open the full page at `/tasks/<id>`.
- **The description box** starts at a comfortable height and grows as the text does, rather than staying a few lines tall; the title grows the same way so a long one is not clipped.
- **Portfolios are real folders now**, not a text label. They have their own table, order and colour. The sidebar shows each portfolio as a foldable section with its project count, a + to create a project straight inside it, and a ⋯ menu to rename or delete it. A project moves between portfolios by dragging it onto another portfolio, or through the ⋯ menu on its row. Deleting a portfolio keeps its projects, which fall back to "No portfolio". Managers, admins and the owner may shape portfolios; everyone else just sees them.
- Existing databases are migrated: the old free-text portfolio labels become real portfolio rows, and every project that carried one is linked to it.

### Testing done for v6
- 20-assertion API pass on portfolios: creation and ordering, creating a project straight into one, moving a project in and out, rejecting an unknown portfolio, renaming, refusing an empty name, reordering, deleting a portfolio while its projects survive, duplicate names, and the full permission matrix (managers and up may shape them; members and guests may not, and a member cannot move a project between them).
- Upgrade pass against a v5 database: the two text labels became portfolios with the right projects under each, and the earlier upgrade assertions still pass.
- Browser pass: the panel opens over the board with the board still visible, Escape closes it and restores the URL, the portfolio tree folds, a portfolio is created from the sidebar, a project moves by menu and by dragging onto another portfolio, and the description grows as more is typed — desktop and mobile, no console errors.
- Clean type check and production build.

## v7 — installable, and a desktop app
- **Proper install assets.** A 192, a 512 and a maskable icon, an Apple touch icon, a fuller web manifest with shortcuts to My work and Chat, and a fetch handler in the service worker. Chrome and Edge now offer **Install**, Android offers **Install app**, and on iOS *Add to Home Screen* gives the icon and the notifications.
- **A desktop app** in `desktop/`: an Electron shell around the deployment, roughly 300 lines. It has a first-run screen that asks for the workspace address, a window that remembers its size and position, a tray icon whose menu covers Open, Start at login, Reload, Change workspace address and Quit, close-to-tray so notifications keep arriving, the unread count on the dock and in the tray tooltip, and links to other sites opening in the real browser instead of inside the app.
- **Start at login works on all three platforms.** macOS and Windows use Electron's own API; Linux has none from an unpackaged app, so the XDG autostart entry is written directly.
- `npm run desktop`, `npm run desktop:install` and `npm run desktop:build` from the project root; electron-builder is configured for `.exe`, `.dmg` and AppImage, with the signing variables documented rather than assumed.

### Testing done for v7
- The manifest, all four icons and the service worker served and fetched over http from the running app.
- The desktop app launched headless under Xvfb and driven end to end: the first-run screen appeared, the address was typed and saved to `config.json`, the workspace loaded, a sign-in went through inside the window, and the page's `window.teqniteDesktop` bridge was present.
- The unread badge bridge checked both ways (`setBadge(7)` then `setBadge(0)` read back off the app).
- The tray menu built with all five items; the Start at login checkbox toggled three times in a row, with the autostart entry appearing and disappearing in step each time.
- A navigation to an outside address confirmed to leave the app where it was.
- `electron-builder` run for real: the app packaged, the asar carrying exactly `main.js`, `preload.js`, `setup.html` and the icon.
- Not done here: a signed build, and a run on Windows or macOS — both need those machines.

## v8 — chat is for people, descriptions are rich text, and the workspace is quicker — current
- **Chat is people only.** The project channels are gone from Chat; a project's conversation lives in its Discussions tab and nowhere else. Chat lists teammates with a search box, and the sidebar's chat tab opens a direct message with one click. Guests, who have no direct messages, are pointed at Discussions.
- **No create-task button in a message.** It went with the channels.
- **A member no longer sees a create option that leads nowhere.** Members can and always could create tasks in projects they belong to; what was broken is that a member with no project at all was still offered "New task". The Create menu now hides itself when there is nothing it could create.
- **The task panel is narrower**, so a full board column stays readable beside it: 520px of board on a wide screen, 380 on a laptop, and the activity column trimmed from 420 to 380.
- **The description is rich text.** It renders markdown — headings, lists, bold, and links you can actually click — and keeps @mentions highlighted. Click it and it becomes the editor, grown to fit the text; Escape backs out, clicking away saves. Links open in a new tab so the task stays where it is.
- **Scrolling inside a task behaves.** The description no longer traps the wheel in a box of its own, there is exactly one scroller on each side of the panel, and the page behind no longer drifts when you reach the end of one.
- **Notifications arrive sooner and say who.** Polling went from 15s to 8s for notifications and the workspace, 4s for messages; every notification, in the app and on the push message, now leads with the name of the person who mentioned, assigned or commented.
- **Per-project update counts, Nifty-style.** Each project in the sidebar carries its own badge: unread discussion messages plus unread notifications for that project, with overdue tasks shown underneath when there is nothing new.
- **Faster, and steadier under load.** The workspace load was five correlated subqueries per project; it is now a single pass of CTEs. On a 60-project, 1,500-task workspace it runs in 7ms against 17ms before. Seven indexes were added on the hot paths — tasks by project, unread notifications, recent messages, comments by task, time entries, memberships. On Vercel each serverless instance now holds one database connection instead of ten, which is what exhausts a Neon or Supabase connection limit and takes the app down under traffic.

### Testing done for v8
- 144 assertions across four API suites, all passing: the v3 permission and invitation pass (56), the v5 notification and push pass (51), the v6 portfolio pass (20), and a new v8 pass (17).
- The v8 pass covers the bootstrap's new shape, a member on a project creating a task and a non-member refused, a project message counting on the project and not on the chat badge, the per-project notification count, the mention naming its author and pointing at its project, reading the discussion clearing the count, direct messages feeding the chat badge, editing your own comment and being refused someone else's, and the description storing markdown untouched.
- Upgrade pass: a v7 database built by the v7 release, then opened by this build — projects, portfolios and users intact, the new indexes created, every project reporting the new counts.
- Benchmark on 60 projects and 1,500 tasks: workspace load 7ms median against v7's 17ms on the same data, notifications 5ms, a project 6ms.
- Browser pass: portfolios and per-project badges in the sidebar, the bell naming the mentioner, chat listing people with no project channel, the panel leaving a full board column visible, the description rendering headings, lists, bold, two clickable links and a highlighted mention, clicking it opening the editor and Escape backing out, a long description scrolling in one scroller with the page behind staying put, and Discussions with no create-task button — dark and light, desktop and mobile, no console errors.
- Clean type check and production build.
