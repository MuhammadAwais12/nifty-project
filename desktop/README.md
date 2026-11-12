# Teqnite Tasks for the desktop

A small shell around the same Teqnite Tasks you use in the browser. It adds the things a browser tab cannot do: a tray icon, start at login, an unread badge, and notifications that keep arriving after you close the window.

It is not a copy of the app — it loads your deployment, so everyone always has the current version and there is nothing to keep in sync.

## Run it while developing

```bash
cd desktop
npm install
npm start
```

The first launch asks for your workspace address (for example `https://tasks.teqnite.com`). It is saved in the app's own folder and can be changed later from the tray menu.

## Build installers

```bash
cd desktop
npm install
npm run build:win     # Windows installer (.exe)
npm run build:mac     # macOS disk image (.dmg)
npm run build:linux   # Linux AppImage
```

The files land in `desktop/dist/`.

**Each platform builds on itself.** A Windows installer is built on Windows, a `.dmg` on a Mac. To make both without owning both machines, run `electron-builder` on GitHub Actions with a `windows-latest` and a `macos-latest` job.

## Signing

Unsigned builds work, but the first launch shows a warning: SmartScreen on Windows, "unidentified developer" on macOS. For the team that is a one-off annoyance; to remove it:

| | What you need | Where it goes |
| --- | --- | --- |
| macOS | Apple Developer Program membership, a Developer ID Application certificate, and an app-specific password for notarising | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` as environment variables when you build |
| Windows | A code signing certificate (OV or EV) as a `.pfx` | `CSC_LINK` and `CSC_KEY_PASSWORD` |

electron-builder picks these up on its own; nothing in this folder needs editing.

## What the tray menu does

- **Open Teqnite Tasks** — brings the window back. Clicking the tray icon does the same.
- **Start at login** — the app starts with the computer and waits in the tray.
- **Reload** — fetches the workspace again, useful after a deploy or a dropped connection.
- **Change workspace address…** — point the app at a different deployment.
- **Quit** — actually quits. Closing the window only hides it.

## Notifications

Notifications are the operating system's own, so they look and behave like any other app's. Because closing the window parks the app in the tray, they keep arriving as long as the app is running — that is the main reason to use this instead of a browser tab.

The desktop app does not need the VAPID keys; those are only for notifications in a browser with the tab closed.

## Files

| File | What it is |
| --- | --- |
| `main.js` | The window, the tray, settings and the links-open-in-browser rule |
| `preload.js` | The only bridge to the page: the unread badge and the first-run address |
| `setup.html` | The first-run screen that asks for the workspace address |
| `build/icon.png` | 1024×1024 source; electron-builder makes `.ico` and `.icns` from it |
