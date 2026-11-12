const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the web app and the desktop shell.
 * Nothing here can read the file system or run anything.
 */
contextBridge.exposeInMainWorld('teqniteDesktop', {
  version: process.env.npm_package_version || '1.0.0',
  platform: process.platform,
  /** Puts the unread count on the dock, the taskbar and the tray tooltip. */
  setBadge: (count) => ipcRenderer.send('teqnite:badge', Number(count) || 0),
  /** Used by the first-run screen to save the workspace address. */
  saveUrl: (url) => ipcRenderer.send('teqnite:set-url', String(url || '')),
});
