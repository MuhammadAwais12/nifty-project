# Teqnite Tasks

A project and task management workspace for the Teqnite team, in the shape of Nifty: projects grouped into portfolios, tasks in board / list / timeline / swimlane / calendar views with dependencies and repeating tasks, milestones on a roadmap, project chat and direct messages, discussions, docs, files, time tracking, reports, notifications with @mentions, global search, light and dark themes, and five roles from owner down to client guest.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS and Postgres. It is one deployable app — no separate backend, no build step for the database.

---

## 1. Deploy on Vercel

1. **Push this folder to GitHub.** Create a new repository and upload everything in this folder (not `node_modules` or `.next`).
2. **Import it in Vercel.** Choose *Add New → Project*, pick the repository and click *Deploy*. The defaults are correct; there is nothing to configure.
3. **Add a database.** Open the project in Vercel, go to the *Storage* tab, create a **Neon** Postgres database (the free plan is enough) and connect it to the project. This sets `DATABASE_URL` for you.
4. **Redeploy.** Go to *Deployments*, open the latest one and choose *Redeploy* so the app picks up the database.
5. **Create the owner account.** Open your site. The first person to sign up becomes the workspace owner. All tables are created automatically on that first load.
6. **Invite the team.** Go to *Team → Invite people*, enter an email address, pick a role and send. Then add people to projects with each project's *Members* button.

> **If the build fails with "No Output Directory named \"public\" found"**, Vercel did not recognise this as a Next.js app. That happens when `package.json` is not at the top level of the repository. Either move the files so `package.json`, `next.config.mjs` and `src/` sit at the repository root, or in Vercel go to *Settings → General → Root Directory*, set it to the folder that contains `package.json`, and redeploy. While you are there, check *Framework Preset* says **Next.js**. The included `vercel.json` sets this too, but only once Vercel is looking at the right folder.

Using Supabase or another Postgres host instead? Add its connection string as `DATABASE_URL` under *Settings → Environment Variables* and redeploy. For Supabase use the **Transaction pooler** connection string.

### Updating an existing deployment

Push the new code to the same GitHub repository. Vercel redeploys, and the database migrates itself on the first request — new tables and columns are added, existing data stays where it is. Nobody loses their account, projects or history.

---

## 2. Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string. `POSTGRES_URL` is also accepted. |
| `AUTH_SECRET` | No | Signs login sessions. If left out, one is generated and stored in the database. Set it yourself if you want sessions to survive a database reset. |
| `GOOGLE_CLIENT_ID` | No | Turns on *Continue with Google*. Without it the button is hidden and email + password still works. |
| `GOOGLE_CLIENT_SECRET` | No | The matching secret. |
| `AUTH_URL` | No | Only if Google redirects to the wrong address. Your public origin, no trailing slash. |
| `RESEND_API_KEY` | No | Sends invitation emails through [Resend](https://resend.com). Without it, invitations still work — the admin copies the link. |
| `INVITE_FROM` | No | The From address on invitation emails. Must be a domain you verified in Resend. |

Add any of these in Vercel under *Settings → Environment Variables*, then redeploy.

### Turning on Google sign-in

1. Go to the [Google Cloud console](https://console.cloud.google.com/apis/credentials) and create a project if you do not have one.
2. *APIs & Services → OAuth consent screen*: choose **Internal** if everyone is on your Google Workspace, otherwise **External**. Fill in the app name and your support email.
3. *Credentials → Create credentials → OAuth client ID → Web application*.
4. Under **Authorised redirect URIs** add exactly:
   - `https://YOUR-DOMAIN/api/auth/google/callback`
   - and, if you also run it locally, `http://localhost:3000/api/auth/google/callback`
5. Copy the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel, then redeploy.

Who may sign in with Google:

- the very first person, who becomes the owner;
- anyone who already has an account with that email address — their Google account is linked to it and either way in keeps working;
- anyone holding a valid invitation for that email address.

Everyone else is refused. A Google account cannot create itself a place in your workspace.

### Turning on invitation emails

1. Create a free account at [resend.com](https://resend.com) and verify the domain you send from.
2. Create an API key, put it in `RESEND_API_KEY`, and set `INVITE_FROM` to an address on that domain.
3. Redeploy. Invitations are now emailed, and the link is still shown in the app so you can send it yourself as well.

This is the only outbound email in the app. Everything else — assignments, comments, mentions, unblocked tasks — is an in-app notification on the bell.

---

## 3. Roles and what each one can do

Every limit below is checked on the server before the action runs. Hiding a button in the interface is never the only thing standing in the way.

| | Owner | Admin | Manager | Member | Guest |
| --- | :-: | :-: | :-: | :-: | :-: |
| See every project without being added | ✓ | ✓ | | | |
| Create projects | ✓ | ✓ | ✓ | | |
| Rename, archive, change project settings | ✓ | ✓ | ✓ * | | |
| Delete a project | ✓ | ✓ | own only | | |
| Add and remove project members | ✓ | ✓ | ✓ * | | |
| Invite people | ✓ | ✓ | member, guest | | |
| Change roles, deactivate people | ✓ | ✓ | | | |
| Shared invite links | ✓ | ✓ | | | |
| Transfer ownership | ✓ | | | | |
| Tasks, milestones, docs, files, time | ✓ | ✓ | ✓ | ✓ | view only |
| Discussions, project chat, comments | ✓ | ✓ | ✓ | ✓ | ✓ |
| Share files and links | ✓ | ✓ | ✓ | ✓ | ✓ |
| Direct messages | ✓ | ✓ | ✓ | ✓ | |
| Reports and time tracking | ✓ | ✓ | ✓ | ✓ | |

\* on the projects they belong to.

**Guests are for clients.** A guest sees only the projects you add them to, only the people they share a project with, and can look, comment, write in discussions and project chat, and share files. Nothing else. They have no Reports, no Team page, no time tracking and no direct messages.

**One owner at a time.** The owner cannot be demoted or deactivated. To hand the workspace over, the owner uses the crown button on the Team page; they become an admin in the same move.

---

## 4. Inviting people

Three ways, all on the **Team** page:

| Way | Who can use it | Good for |
| --- | --- | --- |
| **By email** (*Invite people → By email*) | Owner, admin, manager | One named person, with their role fixed up front, optionally added straight onto projects. The link works for 14 days and only for that email address. |
| **Shared team link** (*Invite people → Shared links*) | Owner, admin | Onboarding several people at once. Everyone who uses it joins as a Member. |
| **Shared guest link** | Owner, admin | Clients. Everyone who uses it joins as a Guest. |

Pending invitations are listed on the Team page, where you can copy the link again or cancel it. Replacing a shared link stops the old one working immediately.

---

## 5. Run locally

```bash
npm install
cp .env.example .env.local   # put your Postgres connection string in it
npm run dev
```

Open http://localhost:3000. The first account you create becomes the owner.

Any Postgres 13+ works, local or hosted. Tables are created on first request, so there is no migration command to run.

---

## 6. What's inside

| Area | What it does |
| --- | --- |
| Overview | Your projects grouped by portfolio, with progress, open and overdue counts and the next milestone. |
| My work | Every open task assigned to you across projects, grouped by due date. |
| Chat | A channel for every project (the same thread as that project's Discussions tab) plus private one-to-one and group messages, with unread counts. |
| Reports | Time logged and workload per person over a date range. |
| Team | People, roles, invitations, shared links, deactivation, ownership transfer. |
| Search | ⌘K / Ctrl+K from anywhere. Finds tasks, projects, docs and people — only the ones you are allowed to see. |
| Project → Home | Progress, upcoming deadlines, milestones, members and recent activity. |
| Project → Tasks | Board, list, timeline (Gantt with dependency arrows), swimlanes by assignee or milestone, and calendar — all over the same records. |
| Project → Milestones | A roadmap with dates and automatic progress from linked tasks. |
| Project → Discussions | Project conversation with threaded replies, @mentions, inline images and attachments; edit or delete your own messages, and turn any message into a task. |
| Project → Docs | Markdown documents that save as you type. |
| Project → Files | Uploads up to 4 MB held in the database, plus links to anything bigger. |
| Project → Time | Start/stop timer, manual entries and a per-person summary. |
| Tasks | Each task has its own reference (PHA-63), a field grid for assignees, tags, milestone, dates, priority and repeat, Subtasks and Attachments tabs, a live timer in the header, and a comments-and-activity panel on the right. Comments take images and files; paste a screenshot straight in. |
| Notifications | Assignments, comments, @mentions, being added to a project, and being unblocked. Click one to jump straight to the task. |
| Themes | Light and dark, remembered per browser; follows your system setting the first time. |

---

## 7. Good to know

- **Task references** like `VIS-14` come from a short project key plus a number. The key is made from the project name when you create it.
- **Images** pasted or attached to a comment, a discussion message or a project chat message show inline, and open full size in a viewer. Files sit behind the same project permissions as everything else.
- **Mentioning someone who is not on the project** offers to add them, if you are a manager or admin. Assigning works the same way.
- **The task timer** runs live in the task header. Starting one stops any other timer you have going.
- **Repeating tasks** create the next copy when you complete the current one, carrying over assignees, subtasks and the milestone. Monthly keeps the same day of the month and clamps it (31 Jan → 28 Feb).
- **Dependencies** show a Blocked badge and notify the waiting assignees once the blocker is finished. Circular chains are refused.
- **Uploads** are capped at 4 MB because Vercel functions cap request bodies around 4.5 MB. For anything larger, use *Add link*.
- **Sessions** last 30 days in an httpOnly cookie, marked Secure on https.
- **Passwords** are hashed with bcrypt. An account created through Google has no password until it sets one in *Your profile*.
- **Drag and drop** on the board and swimlanes uses the mouse. On a phone, move a task by opening it and changing its list.
- **Timeline bars** are not draggable; change the dates inside the task.

---

## 8. Not included

Said plainly, so nothing comes as a surprise later:

- **No real-time push.** Screens refresh themselves every few seconds. There is no WebSocket server, because Vercel's serverless functions cannot hold one open. Chat and notifications arrive within about five seconds, not instantly.
- **No email except invitations.** Notifications live on the bell inside the app.
- **No forms, no automations, no custom fields, no project templates, no goals.**
- **No portfolio or folder pages.** A project's *portfolio* is a grouping label on the Overview and in the sidebar, not a page of its own.
- **No document version history and no simultaneous co-editing.** Two people editing the same doc at the same moment will overwrite each other; the last save wins.
- **One workspace per deployment.** There is no workspace switcher. To run a second, separate workspace, deploy the app again with its own database.
- **No file storage service.** Files live in Postgres, which is why they are capped at 4 MB.
- **The logo is a placeholder.** Replace `src/components/Logo.tsx` and `src/app/icon.svg` with the real Teqnite mark.

---

## 9. If something goes wrong

| What you see | What it usually means |
| --- | --- |
| Build fails: `No Output Directory named "public" found` | Vercel is not treating this as a Next.js app. `package.json` must be at the repository root, or *Settings → General → Root Directory* must point at the folder holding it. Then check *Framework Preset* is **Next.js** and redeploy. |
| "Could not reach the database…" | `DATABASE_URL` is missing or wrong in Vercel, or you have not redeployed since adding it. |
| "Google sign-in is not configured" | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are not set, or the deployment predates them. |
| Google returns `redirect_uri_mismatch` | The redirect URI in the Google console does not match `https://YOUR-DOMAIN/api/auth/google/callback` exactly. |
| "That sign-in link expired" | The sign-in was left open more than ten minutes, or cookies are blocked. Try again. |
| "You need an invitation to join this workspace" | Working as intended: ask an admin to invite that email address. |
| An invitation says it was sent to another address | A personal invitation only works for the address it was issued to. |

See `BUGS_AND_LIMITATIONS.md` for the known rough edges, and `TECHNICAL_DECISIONS.md` for why the app is built the way it is.
