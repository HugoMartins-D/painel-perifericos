const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hardware", {
  dispositivos: () => ipcRenderer.invoke("hw:dispositivos"),
  windows: () => ipcRenderer.invoke("hw:windows"),
  razer: () => ipcRenderer.invoke("hw:razer"),
});
