const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("node:path");
const hardware = require("./hardware.cjs");
const { outrosPerifericos } = require("./perifericos.cjs");

// Evita abrir duas janelas do programa ao mesmo tempo.
if (!app.requestSingleInstanceLock()) app.quit();

let janela;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0e1013",
    title: "Painel de Periféricos",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);

  if (process.env.VITE_DEV) janela.loadURL("http://localhost:5173");
  else janela.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// Cada canal devolve { ok:false, erro } em caso de falha em vez de quebrar a tela.
const seguro = (fn) => async () => {
  try { return await fn(); } catch (e) { return { ok: false, erro: e.message }; }
};
ipcMain.handle("hw:dispositivos", seguro(hardware.dispositivos));
ipcMain.handle("hw:windows", seguro(hardware.configWindows));
ipcMain.handle("hw:razer", seguro(hardware.configRazer));
ipcMain.handle("hw:marvo", seguro(hardware.configMarvo));
ipcMain.handle("hw:outros", seguro(async () => outrosPerifericos(await hardware.idsMarvo().catch(() => ({})))));
ipcMain.handle("hw:razer:aplicar", async (_e, pedido) => {
  try { return await hardware.aplicarRazer(pedido); } catch (e) { return { ok: false, erro: e.message }; }
});

app.on("second-instance", () => {
  if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); }
});
app.whenReady().then(criarJanela);
app.on("window-all-closed", () => app.quit());
