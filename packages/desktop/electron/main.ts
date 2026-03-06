import { app, BrowserWindow, ipcMain, shell, safeStorage, session, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// electron-updater is CommonJS — use createRequire for ESM compat
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.ELECTRON_DEV === 'true';
const RENDERER_URL = isDev
  ? 'http://127.0.0.1:3000'
  : 'app://./index.html';

// Register saiko-app:// protocol for serving bundled assets (circuit files etc.)
// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'saiko-app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow: BrowserWindow | null = null;

// Single instance lock — prevents running two copies
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: 'Saiko Wallet',
    backgroundColor: '#0A0A0A',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,     // SECURITY: no Node in renderer
      contextIsolation: true,     // SECURITY: isolated context
      // sandbox: true removed — blocks WASM (libsodium) in production; nodeIntegration:false + contextIsolation:true provide equivalent isolation
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' data: https://fonts.gstatic.com; " +
          "img-src 'self' data: https:; " +
          "connect-src 'self' https: wss: ws://localhost:* ws://127.0.0.1:*; ",
        ],
      },
    });
  });

  // Open external links in default browser — ONLY allow http/https to prevent
  // javascript:, file://, data: and other dangerous protocol injections.
  const safeOpenExternal = (url: string): void => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      // Malformed URL — ignore
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appBase = isDev ? 'http://127.0.0.1:3000' : 'app://';
    if (!url.startsWith(appBase)) {
      event.preventDefault();
      safeOpenExternal(url);
    }
  });

  void mainWindow.loadURL(RENDERER_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC: safeStorage (OS keyring) ───────────────────────────────────────────
// Windows: DPAPI | macOS: Keychain | Linux: libsecret / Secret Service
ipcMain.handle('safeStorage:isAvailable', () => safeStorage.isEncryptionAvailable());

ipcMain.handle('safeStorage:encrypt', (_event, plaintext: string): string => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage not available');
  return safeStorage.encryptString(plaintext).toString('base64');
});

ipcMain.handle('safeStorage:decrypt', (_event, b64: string): string => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage not available');
  return safeStorage.decryptString(Buffer.from(b64, 'base64'));
});

// ── IPC: Tor proxy ───────────────────────────────────────────────────────────
let torEnabled = false;

ipcMain.handle('tor:getStatus', () => torEnabled);

ipcMain.handle('tor:enable', async (): Promise<void> => {
  await session.defaultSession.setProxy({ proxyRules: 'socks5://127.0.0.1:9050' });
  torEnabled = true;
});

ipcMain.handle('tor:disable', async (): Promise<void> => {
  await session.defaultSession.setProxy({});
  torEnabled = false;
});

// ── IPC: App info ─────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);

// Expose the resources path so the renderer can build saiko-app:// URLs
ipcMain.handle('app:getResourcesPath', () => process.resourcesPath);

// ── Auto-updater ──────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;       // Let the user choose when to download
autoUpdater.autoInstallOnAppQuit = true; // Install on next quit if downloaded

function sendUpdateStatus(event: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:event', { event, data });
  }
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', info));
autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
autoUpdater.on('download-progress', (progress) => sendUpdateStatus('progress', progress));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('downloaded', info));
autoUpdater.on('error', (err) => {
  // Suppress 404s — repo not set up yet or no releases published; not a user-visible error
  if (err.message?.includes('404') || err.message?.includes('net::ERR_')) return;
  sendUpdateStatus('error', err.message);
});

ipcMain.handle('updater:check', async () => {
  try { await autoUpdater.checkForUpdates(); } catch { /* network offline etc */ }
});

ipcMain.handle('updater:download', async () => {
  try { await autoUpdater.downloadUpdate(); } catch { /* handled via error event */ }
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true); // isSilent=false, isForceRunAfter=true
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Serve renderer files via app:// — avoids file:// CORS/crossorigin issues
  // __dirname = app.asar/electron/dist — need to go up 2 levels to reach app.asar/dist
  const distPath = path.join(__dirname, '../../dist');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    // Strip leading slash so path.join doesn't treat it as absolute
    const relativePath = url.pathname.replace(/^\/+/, '');
    // SPA fallback: routes with no file extension → serve index.html
    const filePath = relativePath && path.extname(relativePath)
      ? path.join(distPath, relativePath)
      : path.join(distPath, 'index.html');
    return net.fetch(`file://${filePath}`);
  });

  // Serve circuit files via saiko-app:// — accessible via fetch() in renderer
  protocol.handle('saiko-app', (request) => {
    const url = new URL(request.url);
    const filePath = path.join(process.resourcesPath, url.host, url.pathname);
    return net.fetch(`file://${filePath}`);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Check for updates 5s after launch — don't slow startup
  if (!isDev) {
    // Delay check so it doesn't slow startup; swallow all errors until repo is live
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // Silently ignore — repo may not exist yet or user may be offline
      });
    }, 5000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
