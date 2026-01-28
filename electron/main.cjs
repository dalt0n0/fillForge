const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const forge = require('node-forge');

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

const createWindow = () => {
  const appIcon = path.join(app.getAppPath(), 'favicon.ico');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0d1117',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openPdf', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open PDF',
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    data: data.toString('base64')
  };
});

ipcMain.handle('dialog:savePdf', async (_event, payload) => {
  const { name, data } = payload || {};
  const result = await dialog.showSaveDialog({
    title: 'Export PDF',
    defaultPath: name || 'fillforge-export.pdf',
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) return null;

  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(result.filePath, buffer);

  return { path: result.filePath };
});

ipcMain.handle('dialog:savePdfPath', async (_event, payload) => {
  const { name } = payload || {};
  const result = await dialog.showSaveDialog({
    title: 'Export PDF',
    defaultPath: name || 'fillforge-export.pdf',
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) return null;
  return { path: result.filePath };
});

ipcMain.handle('file:writePdf', async (_event, payload) => {
  const { path: filePath, data } = payload || {};
  if (!filePath || !data) return null;
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);
  return { path: filePath };
});

ipcMain.handle('cert:createSelfSigned', async (_event, payload) => {
  try {
    const {
      commonName,
      organization,
      orgUnit,
      country,
      state,
      locality,
      email,
      password,
      validityYears
    } = payload || {};

    const result = await dialog.showSaveDialog({
      title: 'Save Certificate',
      defaultPath: 'fillforge-certificate.p12',
      filters: [{ name: 'PKCS#12 Certificate', extensions: ['p12', 'pfx'] }]
    });

    if (result.canceled || !result.filePath) return null;

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = String(Date.now());
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(
      now.getFullYear() + (Number(validityYears) || 2),
      now.getMonth(),
      now.getDate()
    );

    const subject = [
      { name: 'commonName', value: commonName || 'FillForge User' },
      organization ? { name: 'organizationName', value: organization } : null,
      orgUnit ? { name: 'organizationalUnitName', value: orgUnit } : null,
      country ? { name: 'countryName', value: country } : null,
      state ? { name: 'stateOrProvinceName', value: state } : null,
      locality ? { name: 'localityName', value: locality } : null,
      email ? { name: 'emailAddress', value: email } : null
    ].filter(Boolean);

    cert.setSubject(subject);
    cert.setIssuer(subject);
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
      { name: 'nsCertType', client: true, email: true }
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      cert,
      password || '',
      { algorithm: '3des' }
    );
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const buffer = Buffer.from(p12Der, 'binary');
    fs.writeFileSync(result.filePath, buffer);

    return {
      path: result.filePath,
      name: path.basename(result.filePath),
      data: buffer.toString('base64')
    };
  } catch (error) {
    return { error: error.message || 'Failed to create certificate.' };
  }
});

ipcMain.handle('dialog:openCertificate', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Certificate',
    filters: [{ name: 'Certificates', extensions: ['p12', 'pfx'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    data: data.toString('base64')
  };
});

ipcMain.handle('pdf:signWithP12', async (_event, payload) => {
  try {
    const {
      pdfBase64,
      certBase64,
      password,
      name,
      reason,
      location,
      contactInfo,
      pageIndex,
      rect
    } = payload || {};

    if (!pdfBase64 || !certBase64) {
      return { error: 'Missing PDF or certificate data.' };
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const certBuffer = Buffer.from(certBase64, 'base64');

    const placeholderModule = await import('@signpdf/placeholder-pdf-lib');
    const signerModule = await import('@signpdf/signer-p12');
    const signModule = await import('@signpdf/signpdf');

    const pdflibAddPlaceholder =
      placeholderModule.pdflibAddPlaceholder || placeholderModule.default;
    const P12Signer = signerModule.P12Signer || signerModule.default;
    const SignPdfCtor = signModule.SignPdf || signModule.default;
    const signPdf = typeof SignPdfCtor === 'function' ? new SignPdfCtor() : SignPdfCtor;

    if (!pdflibAddPlaceholder || !P12Signer || !signPdf?.sign) {
      return { error: 'Signing modules not available.' };
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const safePageIndex = Math.min(Math.max(Number(pageIndex) || 0, 0), pages.length - 1);
    const page = pages[safePageIndex];

    const widgetRect = Array.isArray(rect)
      ? rect
      : [
          rect?.x || 0,
          rect?.y || 0,
          (rect?.x || 0) + (rect?.width || 0),
          (rect?.y || 0) + (rect?.height || 0)
        ];

    pdflibAddPlaceholder({
      pdfDoc,
      page,
      reason: reason || 'Signed with FillForge',
      contactInfo: contactInfo || '',
      name: name || 'FillForge User',
      location: location || '',
      signatureLength: 8192,
      widgetRect
    });

    const pdfWithPlaceholder = await pdfDoc.save({ useObjectStreams: false });
    const signer = new P12Signer(certBuffer, {
      passphrase: password || ''
    });
    const signedPdf = await signPdf.sign(pdfWithPlaceholder, signer);

    return { data: Buffer.from(signedPdf).toString('base64') };
  } catch (error) {
    return { error: error.message || 'Failed to sign PDF.' };
  }
});
