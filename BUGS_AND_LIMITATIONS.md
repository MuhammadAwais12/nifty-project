# Known limitations

Nothing here is a crash or data loss. These are the rough edges worth knowing before the team relies on the app.

## By design, but you will notice

| | Detail |
| --- | --- |
| Updates are not instant | Screens poll every 4–15 seconds. A message or notification shows up within a few seconds, not the moment it is sent. |
| Drag and drop is mouse-only | The board, the swimlanes and moving a project between portfolios use native HTML5 drag, which phones do not fire. On a phone, change a task's list from inside the task, and move a project with the ⋯ menu on its sidebar row. |
| Portfolios are one level deep | No folders inside folders, and a project belongs to one portfolio at a time. |
| Timeline bars cannot be dragged | The Gantt view draws start and due dates and the arrows between dependencies, but you change dates inside the task. |
| Uploads stop at 4 MB | Vercel functions cap request bodies at about 4.5 MB, and files live in Postgres. Use *Add link* for anything larger. |
| Docs have no version history | Two people editing the same doc at the same time will overwrite each other — the last save wins. There is no lock and no merge. |
| Replies are one level deep | A discussion message can have replies; a reply cannot have replies of its own. Deleting the parent removes the whole thread. |
| Desktop notifications are per device | Each person allows them once in each browser they use. A refusal can only be undone in the browser's own site settings, not in the app. |
| iPhone needs the site on the Home Screen | Safari only delivers web notifications to installed web apps. Add Teqnite Tasks to the Home Screen first. |
| Push needs VAPID keys | Without them, notifications only appear while a Teqnite Tasks tab is open. The desktop app does not need them. |
| The desktop app is a shell, not an offline copy | It loads your deployment, so it needs the internet. Without a connection it shows a message and a Reload in the tray menu. |
| Installers are built per platform | A `.exe` is built on Windows and a `.dmg` on a Mac. Only the Linux package was built and verified here. |
| Unsigned desktop builds warn on first launch | SmartScreen on Windows, "unidentified developer" on macOS, until you add the certificates listed in `desktop/README.md`. |
| No auto-update in the desktop app yet | A new version means handing out the installer again. electron-updater plus GitHub Releases would fix it; it is not wired up. |
| Images are stored in the database | Same 4 MB cap as any other attachment, and they are served through the app rather than a CDN, so a very image-heavy project will feel it. |
| Only invitations are emailed | And only if `RESEND_API_KEY` is set. Everything else is an in-app notification. |
| One workspace per deployment | No workspace switcher. A second workspace means a second deployment with its own database. |
| The logo is a placeholder | `src/components/Logo.tsx` and `src/app/icon.svg`. |

## Smaller things

- **Deleting a person is not offered.** Deactivate instead, which blocks sign-in and keeps their history readable. Deleting the row would blank out their comments and time entries.
- **A guest promoted from Member keeps nothing.** Promoting a member down to guest strips their task assignments, on purpose. Promoting back does not restore them.
- **Shared invite links have no expiry.** They work until an admin replaces them. Personal email invitations do expire, after 14 days.
- **@mentions match on full display name.** Two people with the same name both get notified. Renaming someone does not rewrite older messages.
- **Search is a substring match** (`like`), not full text. It finds "keyword" inside "Keyword map", but not a misspelling or a stem.
- **Activity log is per project and keeps the last 25 entries** on the project Home. Older entries stay in the table but are not shown.
- **Reports cover time and workload only.** No burndown, no CSV or PDF export.
- **Task references do not move.** If you rename a project, existing task numbers keep the old key. Numbers are never reused after a task is deleted.
- **No reactions on messages or comments**, and no read receipts in chat.
- **Notifications poll, they are not pushed live.** The app asks every 8 seconds (4 for an open conversation), so a mention can take that long to appear in the tab you are looking at. A browser push notification, when you have allowed them, arrives immediately. A live socket would need a server that stays up, which Vercel's functions do not.
- **The description is markdown, not a toolbar.** Links, headings, lists, bold and code all render, but you type the markdown yourself — there are no buttons, no drag-and-drop images into the description (attachments and Discussions take images), and no tables beyond markdown's own.
- **A project's badge counts its unread messages and notifications together**, so one number covers both; the breakdown is on the project itself.
- **Timers are per person, one at a time.** Starting a timer stops any other timer you have running.

## Removed on request

Project channels in Chat were built in v3 and taken out in v8: a project's conversation is its Discussions tab, and Chat is people only. Creating a task from a chat message went with them. The messages themselves were not touched, and the old `channel_reads` table still backs the Discussions unread count.

Task dependencies and repeating tasks were built in v2 and taken out again in v5. The two database columns are left in place so older databases still load, but nothing reads or writes them.

## Not built from the original brief

Forms and form submissions, the automation engine, custom fields, story points and estimates, project templates and duplication, goals, portfolio and folder pages, reactions, followers, pinned messages, reminders, read receipts, saved views, bulk actions on the list view, task archive and restore, CSV/PDF export, and global activity across projects.
