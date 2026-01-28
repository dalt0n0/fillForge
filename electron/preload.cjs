const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdfApi', {
  openPdf: () => ipcRenderer.invoke('dialog:openPdf'),
  savePdf: (payload) => ipcRenderer.invoke('dialog:savePdf', payload),
  savePdfPath: (payload) => ipcRenderer.invoke('dialog:savePdfPath', payload),
  writePdf: (payload) => ipcRenderer.invoke('file:writePdf', payload),
  createCertificate: (payload) => ipcRenderer.invoke('cert:createSelfSigned', payload),
  openCertificate: () => ipcRenderer.invoke('dialog:openCertificate'),
  signPdf: (payload) => ipcRenderer.invoke('pdf:signWithP12', payload)
});
