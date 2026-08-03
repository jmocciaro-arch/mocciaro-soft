/* eslint-disable @typescript-eslint/no-require-imports */
// Electron main process. JS puro a propósito: no se compila con tsc del proyecto Next.
// Arranca el Next standalone embebido en localhost y abre una BrowserWindow apuntando a él.

const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const log = require("electron-log/main");
const { autoUpdater } = require("electron-updater");

log.initialize();
log.transports.file.level = "info";
autoUpdater.logger = log;

const isDev = !app.isPackaged;
const DEV_URL = process.env.ELECTRON_DEV_URL || "http://localhost:3000";

let mainWindow = null;
let nextServerStarted = false;
let nextServerPort = 3000;

function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout esperando ${url}`));
        } else {
          setTimeout(tick, 250);
        }
      });
    };
    tick();
  });
}

// Carga env vars desde ~/Library/Application Support/Mocciaro Soft/.env
// Si no existe, intenta copiarlo desde ~/mocciaro-soft/.env.local (primer arranque
// en la Mac del dev). En distribución a otras Macs habrá que armar un flujo de setup,
// pero para el POC esto deja a Juan andando sin pasos manuales.
function loadUserEnv() {
  const userDir = app.getPath("userData");
  const userEnv = path.join(userDir, ".env");
  if (!fs.existsSync(userEnv)) {
    const devEnv = path.join(os.homedir(), "mocciaro-soft", ".env.local");
    if (fs.existsSync(devEnv)) {
      fs.mkdirSync(userDir, { recursive: true });
      fs.copyFileSync(devEnv, userEnv);
      log.info(`[env] bootstrap inicial: copiado ${devEnv} → ${userEnv}`);
    } else {
      log.warn(`[env] no encontré ${userEnv} ni ${devEnv}. La app no va a poder conectar a Supabase.`);
      return;
    }
  }
  const content = fs.readFileSync(userEnv, "utf8");
  let loaded = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k]) continue; // no pisar lo que viene del shell
    process.env[k] = v.replace(/^["']|["']$/g, "");
    loaded++;
  }
  log.info(`[env] ${loaded} variables cargadas desde ${userEnv}`);
}

async function startEmbeddedNextServer() {
  // En la app empaquetada, .next/standalone vive dentro de resources/app
  // gracias al glob "build.files" de electron-builder.
  // Server.js de Next requiere PORT y HOSTNAME por env.
  const getPort = require("get-port-please").getPort;
  nextServerPort = await getPort({ port: 3000, portRange: [3000, 3999] });

  // .next/standalone se copia plano a Resources/app/ via extraResources.
  // server.js queda directo en Resources/app/server.js junto con su mini node_modules.
  // .next/static y public/ van a Resources/app/.next/static y Resources/app/public
  // para que el server los encuentre con paths relativos.
  const serverPath = path.join(process.resourcesPath, "app", "server.js");
  log.info(`[next] Arrancando server embebido: ${serverPath} en :${nextServerPort}`);

  process.env.PORT = String(nextServerPort);
  process.env.HOSTNAME = "127.0.0.1";
  // Cargar server.js en el mismo proceso. Next standalone exporta una función o arranca al require.
  require(serverPath);

  await waitForHttp(`http://127.0.0.1:${nextServerPort}/`);
  nextServerStarted = true;
  log.info("[next] Server listo");
}

function createWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0a0a0a",
    title: `Mocciaro Soft v${app.getVersion()}`,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(targetUrl);

  // Links externos abren en el browser del sistema, no dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(targetUrl)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupAutoUpdate() {
  if (isDev) {
    log.info("[updater] dev mode — auto-update deshabilitado");
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log.info("[updater] update disponible", info.version);
  });
  autoUpdater.on("update-downloaded", async (info) => {
    log.info("[updater] update descargada", info.version);
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Reiniciar ahora", "Después"],
      defaultId: 0,
      cancelId: 1,
      title: "Actualización lista",
      message: `Mocciaro Soft ${info.version} está lista para instalarse.`,
      detail: "La app va a reiniciarse para aplicar la actualización.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (err) => {
    log.error("[updater] error", err);
  });

  // Check inicial + cada hora.
  autoUpdater.checkForUpdates().catch((e) => log.error(e));
  setInterval(() => autoUpdater.checkForUpdates().catch((e) => log.error(e)), 60 * 60 * 1000);
}

app.whenReady().then(async () => {
  try {
    let targetUrl;
    if (isDev) {
      targetUrl = DEV_URL;
      log.info(`[boot] dev mode → ${targetUrl}`);
    } else {
      loadUserEnv();
      await startEmbeddedNextServer();
      targetUrl = `http://127.0.0.1:${nextServerPort}/`;
    }
    createWindow(targetUrl);
    setupAutoUpdate();
  } catch (err) {
    log.error("[boot] fatal", err);
    dialog.showErrorBox("Error al arrancar Mocciaro Soft", String(err?.stack || err));
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && nextServerStarted) {
    const targetUrl = isDev ? DEV_URL : `http://127.0.0.1:${nextServerPort}/`;
    createWindow(targetUrl);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Menú mínimo macOS con "Buscar actualizaciones" manual.
const template = [
  {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Buscar actualizaciones…",
        click: () => {
          if (isDev) {
            dialog.showMessageBox({ message: "Auto-update está deshabilitado en modo desarrollo." });
            return;
          }
          autoUpdater.checkForUpdates().catch((e) => log.error(e));
        },
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  { role: "editMenu" },
  { role: "viewMenu" },
  { role: "windowMenu" },
];
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
