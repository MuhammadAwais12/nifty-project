const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

/* ───────────── settings, kept next to the app's own data ───────────── */
const configFile = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
}
function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(next, null, 2));
  } catch (e) {
    console.error('[config]', e.message);
  }
  return next;
}

let config = {};
let win = null;
let tray = null;
let quitting = false;

const iconPath = path.join(__dirname, 'build', 'icon.png');
const trayImage = () => {
  const img = nativeImage.createFromPath(iconPath);
  // the macOS menu bar wants a small image; Windows and Linux are happier with 32px
  return img.resize({ width: process.platform === 'darwin' ? 18 : 32 });
};

/** Only one copy of the app may run; a second launch focuses the first. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show());
}

/* ───────────── window ───────────── */
function createWindow() {
  const bounds = config.bounds || {};
  win = new BrowserWindow({
    width: bounds.width || 1360,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 420,
    minHeight: 520,
    show: false,
    backgroundColor: '#0f101a',
    autoHideMenuBar: true,
    title: 'Teqnite Tasks',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  load();

  win.once('ready-to-show', () => {
    // started by the system at login? stay in the tray instead of jumping up
    const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
    if (!openedAtLogin) win.show();
  });

  win.on('close', (e) => {
    if (quitting) return;
    // closing parks the app in the tray so notifications keep arriving
    e.preventDefault();
    win.hide();
    if (process.platform === 'darwin') app.dock?.hide();
  });

  const remember = () => {
    if (win && !win.isMinimized() && !win.isMaximized() && win.isVisible()) {
      config = writeConfig({ bounds: win.getBounds() });
    }
  };
  win.on('resize', remember);
  win.on('move', remember);

  // a link to anywhere else opens in the real browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (config.url && !sameSite(url, config.url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_e, code, description, failedUrl) => {
    if (code === -3) return; // an aborted navigation, not a failure
    showError(description, failedUrl);
  });
}

function sameSite(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function load() {
  if (config.url) win.loadURL(config.url);
  else win.loadFile(path.join(__dirname, 'setup.html'));
}

function showError(description, failedUrl) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f101a;color:#e8e9f2;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center">
  <div style="max-width:420px;padding:32px">
    <p style="font-size:18px;font-weight:700;margin:0 0 8px">Could not reach your workspace</p>
    <p style="color:#9fa2b4;margin:0 0 20px">${description || 'The address did not respond.'}<br><span style="font-size:12px">${failedUrl || ''}</span></p>
    <p style="color:#9fa2b4;font-size:13px;margin:0">Check your internet connection, then use <b>Reload</b> in the tray menu. To point the app somewhere else, choose <b>Change workspace address</b>.</p>
  </div></body>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function show() {
  if (!win) return createWindow();
  if (process.platform === 'darwin') app.dock?.show();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/* ───────────── start at login ───────────── */
const autostartFile = () => path.join(app.getPath('home'), '.config', 'autostart', 'teqnite-tasks.desktop');

/**
 * macOS and Windows have an API for this. Linux does not, from an unpackaged
 * app, so there we write the XDG autostart entry ourselves.
 */
function setStartAtLogin(on) {
  if (process.platform === 'linux') {
    const file = autostartFile();
    try {
      if (on) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
          file,
          ['[Desktop Entry]', 'Type=Application', 'Name=Teqnite Tasks',
           `Exec=${process.execPath}${app.isPackaged ? '' : ` ${path.resolve(__dirname)}`}`,
           'X-GNOME-Autostart-enabled=true', 'Hidden=false', 'Terminal=false', ''].join('\n')
        );
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      console.error('[autostart]', e.message);
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true });
  }
  config = writeConfig({ startAtLogin: on });
}

/** What the tray checkbox shows: our own saved choice, confirmed against the system. */
function startsAtLogin() {
  if (process.platform === 'linux') return fs.existsSync(autostartFile());
  return app.getLoginItemSettings().openAtLogin || !!config.startAtLogin;
}

/* ───────────── tray ───────────── */
function buildTray() {
  tray = new Tray(trayImage());
  tray.setToolTip('Teqnite Tasks');
  refreshTrayMenu();
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : show()));
  tray.on('double-click', show);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Teqnite Tasks', click: show },
      { type: 'separator' },
      {
        label: 'Start at login',
        type: 'checkbox',
        checked: startsAtLogin(),
        // read the current state rather than the clicked item, so the toggle
        // behaves the same however the menu item reports itself
        click: () => {
          setStartAtLogin(!startsAtLogin());
          refreshTrayMenu();
        },
      },
      { label: 'Reload', click: () => win && load() },
      { label: 'Change workspace address…', click: changeUrl },
      { type: 'separator' },
      { label: 'Quit Teqnite Tasks', click: () => { quitting = true; app.quit(); } },
    ])
  );
}

async function changeUrl() {
  show();
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Change address', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: 'Point this app at a different workspace?',
    detail: `It is currently connected to ${config.url || 'nothing yet'}. You will be asked for the new address, and you may need to sign in again.`,
  });
  if (response !== 0) return;
  config = writeConfig({ url: '' });
  load();
}

/* ───────────── the web app talks back ───────────── */
ipcMain.on('teqnite:badge', (_e, count) => {
  const n = Math.max(0, Math.floor(count) || 0);
  if (process.platform === 'darwin' || process.platform === 'linux') app.setBadgeCount(n);
  if (tray) tray.setToolTip(n > 0 ? `Teqnite Tasks — ${n} unread` : 'Teqnite Tasks');
});

ipcMain.on('teqnite:set-url', (_e, url) => {
  if (!url) return;
  config = writeConfig({ url });
  load();
});

/* ───────────── lifecycle ───────────── */
app.whenReady().then(() => {
  // Windows needs this for notifications to carry the app's name
  app.setAppUserModelId('com.teqnite.tasks');
  config = readConfig();
  // re-apply the saved choice, in case the system entry was cleared
  if (config.startAtLogin === true) setStartAtLogin(true);
  createWindow();
  buildTray();

  app.on('activate', show);
});

app.on('window-all-closed', () => {
  // the tray keeps the app alive on purpose, so notifications still arrive
});

app.on('before-quit', () => {
  quitting = true;
});
