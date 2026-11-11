# Known limitations

Nothing here is a crash or data loss. These are the rough edges worth knowing before the team relies on the app.

## By design, but you will notice

| | Detail |
| --- | --- |
| Updates are not instant | Screens poll every 4–15 seconds. A message or notification shows up within a few seconds, not the moment it is sent. |
| Drag and drop is mouse-only | The board and swimlanes use native HTML5 drag, which phones do not fire. On mobile, open a task and change its list. |
| Timeline bars cannot be dragged | The Gantt view draws start and due dates and the arrows between dependencies, but you change dates inside the task. |
| Uploads stop at 4 MB | Vercel functions cap request bodies at about 4.5 MB, and files live in Postgres. Use *Add link* for anything larger. |
| Docs have no version history | Two people editing the same doc at the same time will overwrite each other — the last save wins. There is no lock and no merge. |
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
- **Repeating tasks only repeat on completion.** If a weekly task is never completed, no copy is made. Completing a long-overdue one skips forward to the next future date rather than creating every missed copy.
- **Timers are per person, one at a time.** Starting a timer stops any other timer you have running.

## Not built from the original brief

Forms and form submissions, the automation engine, custom fields, story points and estimates, project templates and duplication, goals, portfolio and folder pages, reactions, followers, pinned messages, reminders, read receipts, saved views, bulk actions on the list view, task archive and restore, CSV/PDF export, and global activity across projects.
