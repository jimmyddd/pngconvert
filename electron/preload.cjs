const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  convertImages: (payload) => ipcRenderer.invoke("convert-images", payload),
});
