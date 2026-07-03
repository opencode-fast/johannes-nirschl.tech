// Electron main process for the Pulse rPPG app.
//
// The renderer is served over a loopback HTTP server (not file://) for two
// reasons: (1) MediaPipe loads its wasm/model via fetch(), which Chromium
// blocks under file://; (2) http://127.0.0.1 is a "secure context", so
// getUserMedia + camera permissions behave exactly like the web version.
const { app, BrowserWindow, session, systemPreferences } = require("electron");
const http = require("http");
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const ROOT = path.join(__dirname, "renderer");
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".task": "application/octet-stream", ".png": "image/png", ".svg": "image/svg+xml",
  ".map": "application/json",
};

let serverPort = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        // resolve inside ROOT, block path traversal
        const filePath = path.normalize(path.join(ROOT, urlPath));
        if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
        fs.readFile(filePath, (err, data) => {
          if (!err) {
            res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
            res.end(data);
            return;
          }
          // Some large assets (e.g. the wasm) are stored gzipped to shrink the
          // app; transparently decompress them so the renderer sees a plain file.
          fs.readFile(filePath + ".gz", (gzErr, gz) => {
            if (gzErr) { res.writeHead(404).end("Not found"); return; }
            zlib.gunzip(gz, (unzErr, out) => {
              if (unzErr) { res.writeHead(500).end(); return; }
              res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
              res.end(out);
            });
          });
        });
      } catch (e) { res.writeHead(500).end(); }
    });
    server.listen(0, "127.0.0.1", () => { serverPort = server.address().port; resolve(serverPort); });
    server.on("error", reject);
  });
}

function grantCameraPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "media" || permission === "camera");
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === "media" || permission === "camera");
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#0b0f14",
    title: "Pulse",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // getUserMedia over http://127.0.0.1 is a secure context in Electron
    },
  });
  win.loadURL(`http://127.0.0.1:${serverPort}/index.html`);
}

app.whenReady().then(async () => {
  // Trigger the native macOS camera (TCC) prompt up front.
  if (process.platform === "darwin") {
    try { await systemPreferences.askForMediaAccess("camera"); } catch (_) {}
  }
  grantCameraPermissions();
  await startServer();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
