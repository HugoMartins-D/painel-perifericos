const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hardware", {
  dispositivos: () => ipcRenderer.invoke("hw:dispositivos"),
  windows: () => ipcRenderer.invoke("hw:windows"),
  razer: () => ipcRenderer.invoke("hw:razer"),
  marvo: () => ipcRenderer.invoke("hw:marvo"),
  outros: () => ipcRenderer.invoke("hw:outros"),
  aplicarRazer: (pedido) => ipcRenderer.invoke("hw:razer:aplicar", pedido),
});
